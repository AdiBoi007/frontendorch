import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher } from "../../lib/jobs/types.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { ensureCommunicationManager } from "./authz.js";
import type { ProjectService } from "../projects/service.js";
import { AuditService } from "../audit/service.js";
import type { CommunicationProviderAdapter } from "./providers/provider.interface.js";
import { decodeCursor, encodeCursor } from "../../lib/communications/sync-cursors.js";

export class SyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher,
    private readonly adapters: Map<string, CommunicationProviderAdapter>
  ) {}

  async queueSync(projectId: string, connectorId: string, actorUserId: string, syncType: "manual" | "webhook" | "backfill" | "incremental") {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: connectorId, projectId }
    });
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });
    const adapter = this.adapters.get(connector.provider);
    if (!adapter) {
      throw new AppError(404, "Communication provider is not supported", "communication_provider_not_supported");
    }

    const syncRun = await this.prisma.communicationSyncRun.create({
      data: {
        connectorId: connector.id,
        projectId,
        provider: connector.provider,
        syncType,
        status: "queued",
        cursorBeforeJson: connector.providerCursorJson as object | undefined
      }
    });

    const key = jobKeys.syncCommunicationConnector(connector.id, syncType, encodeCursor({ syncRunId: syncRun.id }));
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey: key },
      update: {
        jobType: JobNames.syncCommunicationConnector,
        status: "pending",
        payloadJson: { connectorId: connector.id, projectId, syncType, syncRunId: syncRun.id }
      },
      create: {
        jobType: JobNames.syncCommunicationConnector,
        status: "pending",
        idempotencyKey: key,
        payloadJson: { connectorId: connector.id, projectId, syncType, syncRunId: syncRun.id }
      }
    });

    await this.jobs.enqueue(
      JobNames.syncCommunicationConnector,
      { connectorId: connector.id, projectId, syncType, syncRunId: syncRun.id, idempotencyKey: key },
      key
    );

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "communication_sync_started",
      entityType: "communication_sync_run",
      entityId: syncRun.id,
      payload: { connectorId: connector.id, provider: connector.provider, syncType }
    });
    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "communication_sync_started");

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
    idempotencyKey?: string;
  }) {
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: input.connectorId, projectId: input.projectId }
    });
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
      const result = await adapter.sync({
        projectId: input.projectId,
        connectorId: connector.id,
        syncType: input.syncType
      });
      const cursorAfter = decodeCursor(result.summary?.cursor as string | undefined);
      const summaryJson = (result.summary ?? { queued: result.queued }) as Prisma.JsonObject;

      await this.prisma.communicationSyncRun.update({
        where: { id: input.syncRunId },
        data: {
          status: "completed",
          finishedAt: new Date(),
          cursorAfterJson: cursorAfter == null ? Prisma.JsonNull : (cursorAfter as Prisma.InputJsonValue),
          summaryJson
        }
      });
      await this.prisma.communicationConnector.update({
        where: { id: connector.id },
        data: {
          status: "connected",
          lastSyncedAt: new Date(),
          lastError: null
        }
      });
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { status: "completed", finishedAt: new Date(), lastError: null }
        });
      }
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
      throw error;
    }
  }
}
