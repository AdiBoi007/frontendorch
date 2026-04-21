import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../config/env.js";
import { AppError } from "../../app/errors.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher } from "../../lib/jobs/types.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { stableHash } from "../../lib/communications/idempotency.js";
import { CredentialVault } from "../../lib/communications/credential-vault.js";
import { ensureCommunicationManager } from "./authz.js";
import type { ProjectService } from "../projects/service.js";
import { AuditService } from "../audit/service.js";
import type { CommunicationProviderAdapter } from "./providers/provider.interface.js";
import { MessageIngestionService } from "./message-ingestion.service.js";

export class SyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher,
    private readonly credentialVault: CredentialVault,
    private readonly adapters: Map<string, CommunicationProviderAdapter>,
    private readonly ingestion: MessageIngestionService
  ) {}

  async queueSync(projectId: string, connectorId: string, actorUserId: string, syncType: "manual" | "webhook" | "backfill" | "incremental") {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    return this.enqueueSync({ projectId, connectorId, syncType });
  }

  async enqueueSync(input: {
    projectId: string;
    connectorId: string;
    syncType: "manual" | "webhook" | "backfill" | "incremental";
    webhookPayload?: Record<string, unknown>;
  }) {
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: input.connectorId, projectId: input.projectId }
    });
    if (connector.status === "revoked") {
      throw new AppError(409, "Revoked connector cannot sync", "communication_connector_revoked");
    }

    const activeSyncRun = await this.prisma.communicationSyncRun.findFirst({
      where: {
        connectorId: connector.id,
        status: {
          in: ["queued", "running"]
        }
      },
      orderBy: { createdAt: "desc" }
    });
    if (activeSyncRun && input.syncType !== "webhook") {
      return {
        connectorId: connector.id,
        syncRunId: activeSyncRun.id,
        queued: false
      };
    }

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: input.projectId },
      select: { orgId: true }
    });
    const syncRun = await this.prisma.communicationSyncRun.create({
      data: {
        connectorId: connector.id,
        projectId: input.projectId,
        provider: connector.provider,
        syncType: input.syncType,
        status: "queued",
        cursorBeforeJson: connector.providerCursorJson as object | undefined
      }
    });

    const cursorHash = stableHash({
      cursor: connector.providerCursorJson,
      webhook: input.webhookPayload?.providerEventId ?? null
    });
    const key = jobKeys.syncCommunicationConnector(connector.id, input.syncType, cursorHash);
    const payload = {
      connectorId: connector.id,
      projectId: input.projectId,
      syncType: input.syncType,
      syncRunId: syncRun.id,
      webhookPayload: input.webhookPayload,
      idempotencyKey: key
    };

    await this.prisma.jobRun.upsert({
      where: { idempotencyKey: key },
      update: {
        jobType: JobNames.syncCommunicationConnector,
        status: "pending",
        payloadJson: payload as Prisma.InputJsonValue
      },
      create: {
        jobType: JobNames.syncCommunicationConnector,
        status: "pending",
        idempotencyKey: key,
        payloadJson: payload as Prisma.InputJsonValue
      }
    });

    await this.jobs.enqueue(JobNames.syncCommunicationConnector, payload, key);
    await this.auditService.record({
      orgId: project.orgId,
      projectId: input.projectId,
      actorUserId: null,
      eventType: "communication_sync_started",
      entityType: "communication_sync_run",
      entityId: syncRun.id,
      payload: { connectorId: connector.id, provider: connector.provider, syncType: input.syncType }
    });
    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, input.projectId, "communication_sync_started");

    return {
      connectorId: connector.id,
      syncRunId: syncRun.id,
      queued: true
    };
  }

  async runSyncJob(input: {
    connectorId: string;
    projectId: string;
    syncType: "manual" | "webhook" | "backfill" | "incremental";
    syncRunId: string;
    webhookPayload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: input.connectorId, projectId: input.projectId }
    });
    if (connector.status === "revoked") {
      throw new AppError(409, "Revoked connector cannot sync", "communication_connector_revoked");
    }

    const adapter = this.adapters.get(connector.provider);
    if (!adapter) {
      throw new AppError(404, "Communication provider is not supported", "communication_provider_not_supported");
    }

    await this.prisma.communicationSyncRun.update({
      where: { id: input.syncRunId },
      data: { status: "running", startedAt: new Date() }
    });
    if (input.idempotencyKey) {
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {
          jobType: JobNames.syncCommunicationConnector,
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: null,
          attemptCount: { increment: 1 }
        },
        create: {
          jobType: JobNames.syncCommunicationConnector,
          status: "running",
          idempotencyKey: input.idempotencyKey,
          startedAt: new Date(),
          attemptCount: 1
        }
      });
    }
    await this.prisma.communicationConnector.update({
      where: { id: connector.id },
      data: { status: "syncing", lastError: null }
    });

    try {
      const credential = await this.credentialVault.getCredential(
        connector.provider,
        connector.id,
        connector.credentialsRef
      );
      const result = await adapter.sync({
        projectId: input.projectId,
        connector,
        credential,
        syncType: input.syncType,
        webhookPayload: input.webhookPayload,
        batchSize: this.env.CONNECTOR_SYNC_BATCH_SIZE,
        maxBackfillDays: this.env.CONNECTOR_SYNC_MAX_BACKFILL_DAYS
      });

      let createdMessageCount = 0;
      let updatedRevisionCount = 0;
      let indexedMessageCount = 0;
      for (const batch of result.batches ?? []) {
        const ingestResult = await this.ingestion.ingestNormalizedBatch({
          ...batch,
          projectId: input.projectId,
          connectorId: connector.id,
          provider: connector.provider,
          syncRunId: input.syncRunId
        });
        createdMessageCount += ingestResult.createdMessageCount;
        updatedRevisionCount += ingestResult.updatedRevisionCount;
        indexedMessageCount += ingestResult.indexedMessageCount;
      }

      if ((result.deletedProviderMessageIds?.length ?? 0) > 0) {
        await this.prisma.communicationMessage.updateMany({
          where: {
            connectorId: connector.id,
            providerMessageId: {
              in: result.deletedProviderMessageIds
            }
          },
          data: {
            isDeletedByProvider: true
          }
        });
      }

      let credentialsRef = connector.credentialsRef;
      if (result.updatedCredential) {
        const stored = await this.credentialVault.putCredential({
          provider: connector.provider,
          connectorId: connector.id,
          credential: result.updatedCredential
        });
        credentialsRef = stored.ref;
      }

      await this.prisma.communicationSyncRun.update({
        where: { id: input.syncRunId },
        data: {
          status: "completed",
          finishedAt: new Date(),
          cursorAfterJson:
            result.cursorAfter == null ? Prisma.JsonNull : (result.cursorAfter as Prisma.InputJsonValue),
          summaryJson: {
            ...(result.summary ?? {}),
            createdMessageCount,
            updatedRevisionCount,
            indexedMessageCount,
            deletedMessageCount: result.deletedProviderMessageIds?.length ?? 0
          }
        }
      });
      await this.prisma.communicationConnector.update({
        where: { id: connector.id },
        data: {
          status: "connected",
          lastSyncedAt: new Date(),
          lastError: null,
          credentialsRef,
          providerCursorJson:
            result.cursorAfter == null
              ? connector.providerCursorJson == null
                ? Prisma.JsonNull
                : (connector.providerCursorJson as Prisma.InputJsonValue)
              : (result.cursorAfter as Prisma.InputJsonValue)
        }
      });
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { status: "completed", finishedAt: new Date(), lastError: null }
        });
      }
      await this.auditService.record({
        orgId: (
          await this.prisma.project.findUniqueOrThrow({
            where: { id: input.projectId },
            select: { orgId: true }
          })
        ).orgId,
        projectId: input.projectId,
        actorUserId: null,
        eventType: "communication_sync_completed",
        entityType: "communication_sync_run",
        entityId: input.syncRunId,
        payload: {
          connectorId: connector.id,
          provider: connector.provider,
          createdMessageCount,
          updatedRevisionCount,
          indexedMessageCount,
          deletedMessageCount: result.deletedProviderMessageIds?.length ?? 0
        }
      });
      await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, input.projectId, "communication_sync_completed");
    } catch (error) {
      await this.prisma.communicationSyncRun.update({
        where: { id: input.syncRunId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown communication sync error"
        }
      });
      await this.prisma.communicationConnector.update({
        where: { id: connector.id },
        data: {
          status: "error",
          lastError: error instanceof Error ? error.message : "Unknown communication sync error"
        }
      });
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: error instanceof Error ? error.message : "Unknown communication sync error"
          }
        });
      }
      await this.auditService.record({
        orgId: (
          await this.prisma.project.findUniqueOrThrow({
            where: { id: input.projectId },
            select: { orgId: true }
          })
        ).orgId,
        projectId: input.projectId,
        actorUserId: null,
        eventType: "communication_sync_failed",
        entityType: "communication_sync_run",
        entityId: input.syncRunId,
        payload: {
          connectorId: connector.id,
          provider: connector.provider,
          errorMessage: error instanceof Error ? error.message : "Unknown communication sync error"
        }
      });
      throw error;
    }
  }
}
