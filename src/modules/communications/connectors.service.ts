import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { CredentialVault } from "../../lib/communications/credential-vault.js";
import type { CommunicationProviderAdapter } from "./providers/provider.interface.js";
import { ensureCommunicationManager } from "./authz.js";
import type { ProjectService } from "../projects/service.js";
import { AuditService } from "../audit/service.js";
import type { JobDispatcher } from "../../lib/jobs/types.js";

export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher,
    private readonly credentialVault: CredentialVault,
    private readonly adapters: Map<string, CommunicationProviderAdapter>
  ) {}

  async list(projectId: string, actorUserId: string, filters: { provider?: string; status?: string }) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const connectors = await this.prisma.communicationConnector.findMany({
      where: {
        projectId,
        ...(filters.provider ? { provider: filters.provider as never } : {}),
        ...(filters.status ? { status: filters.status as never } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        _count: {
          select: {
            threads: true,
            messages: true,
            syncRuns: true
          }
        }
      }
    });

    return connectors.map((connector) => ({
      id: connector.id,
      projectId: connector.projectId,
      provider: connector.provider,
      accountLabel: connector.accountLabel,
      status: connector.status,
      lastSyncedAt: connector.lastSyncedAt?.toISOString() ?? null,
      lastError: connector.lastError,
      createdAt: connector.createdAt.toISOString(),
      updatedAt: connector.updatedAt.toISOString(),
      configSummary: {
        threadCount: connector._count.threads,
        messageCount: connector._count.messages,
        syncRunCount: connector._count.syncRuns
      }
    }));
  }

  async get(projectId: string, connectorId: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: connectorId, projectId },
      include: {
        syncRuns: {
          orderBy: { createdAt: "desc" },
          take: 10
        },
        _count: {
          select: {
            threads: true,
            messages: true
          }
        }
      }
    });

    return {
      id: connector.id,
      projectId: connector.projectId,
      provider: connector.provider,
      accountLabel: connector.accountLabel,
      status: connector.status,
      config: connector.configJson,
      lastSyncedAt: connector.lastSyncedAt?.toISOString() ?? null,
      lastError: connector.lastError,
      createdAt: connector.createdAt.toISOString(),
      updatedAt: connector.updatedAt.toISOString(),
      counts: {
        threads: connector._count.threads,
        messages: connector._count.messages
      },
      recentSyncRuns: connector.syncRuns.map((run) => ({
        id: run.id,
        provider: run.provider,
        syncType: run.syncType,
        status: run.status,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        errorMessage: run.errorMessage,
        summary: run.summaryJson
      }))
    };
  }

  async connect(projectId: string, provider: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new AppError(404, "Communication provider is not supported", "communication_provider_not_supported");
    }

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });
    const existing = await this.prisma.communicationConnector.findFirst({
      where: { projectId, provider: provider as never }
    });
    const adapterResult = await adapter.connect({ projectId, actorUserId });

    const connector = existing
      ? await this.prisma.communicationConnector.update({
          where: { id: existing.id },
          data: {
            accountLabel: adapterResult.accountLabel ?? existing.accountLabel,
            status: adapterResult.status,
            configJson: (adapterResult.config ?? existing.configJson ?? {}) as object
          }
        })
      : await this.prisma.communicationConnector.create({
          data: {
            projectId,
            provider: provider as never,
            accountLabel: adapterResult.accountLabel ?? provider.replace(/_/g, " "),
            status: adapterResult.status,
            configJson: (adapterResult.config ?? {}) as object,
            createdBy: actorUserId
          }
        });

    if (provider === "manual_import") {
      await this.credentialVault.putCredential({
        provider: "manual_import",
        connectorId: connector.id,
        credential: null
      });
    }

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "communication_connector_created",
      entityType: "communication_connector",
      entityId: connector.id,
      payload: { provider, status: connector.status }
    });
    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "communication_connector_created");

    return {
      connectorId: connector.id,
      provider: connector.provider,
      status: connector.status,
      redirectUrl: adapterResult.redirectUrl ?? null
    };
  }

  async update(projectId: string, connectorId: string, actorUserId: string, body: { accountLabel?: string; config?: Record<string, unknown> }) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: connectorId, projectId }
    });

    return this.prisma.communicationConnector.update({
      where: { id: connector.id },
      data: {
        accountLabel: body.accountLabel ?? connector.accountLabel,
        configJson:
          body.config != null
            ? (body.config as Prisma.JsonObject)
            : connector.configJson == null
              ? Prisma.JsonNull
              : (connector.configJson as Prisma.InputJsonValue)
      }
    });
  }

  async revoke(projectId: string, connectorId: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: connectorId, projectId }
    });

    await this.credentialVault.revokeCredential(connector.provider, connector.id).catch(() => undefined);

    const revoked = await this.prisma.communicationConnector.update({
      where: { id: connector.id },
      data: {
        status: "revoked",
        lastError: null
      }
    });

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "communication_connector_revoked",
      entityType: "communication_connector",
      entityId: revoked.id,
      payload: { provider: revoked.provider }
    });
    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "communication_connector_revoked");
    return revoked;
  }

  async listSyncRuns(projectId: string, connectorId: string, actorUserId: string, query: { limit: number }) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    return this.prisma.communicationSyncRun.findMany({
      where: { projectId, connectorId },
      orderBy: { createdAt: "desc" },
      take: query.limit
    });
  }
}
