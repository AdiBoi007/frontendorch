import { randomUUID } from "node:crypto";
import { Prisma, type CommunicationProvider, type PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../config/env.js";
import { AppError } from "../../app/errors.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { CredentialVault } from "../../lib/communications/credential-vault.js";
import { buildOAuthState, hashOAuthNonce, parseAndVerifyOAuthState } from "../../lib/communications/oauth-state.js";
import type { CommunicationProviderAdapter } from "./providers/provider.interface.js";
import { ensureCommunicationManager } from "./authz.js";
import type { ProjectService } from "../projects/service.js";
import { AuditService } from "../audit/service.js";
import type { JobDispatcher } from "../../lib/jobs/types.js";
import type { SyncService } from "./sync.service.js";
import type { TelemetryService } from "../../lib/observability/telemetry.js";

export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher,
    private readonly credentialVault: CredentialVault,
    private readonly adapters: Map<string, CommunicationProviderAdapter>,
    private readonly telemetry: TelemetryService,
    private syncService?: SyncService
  ) {}

  setSyncService(syncService: SyncService) {
    this.syncService = syncService;
  }

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

    const stateToken =
      provider === "manual_import" ? undefined : await this.createOAuthState(project.orgId, projectId, provider as CommunicationProvider, actorUserId);

    const adapterResult = await adapter.connect({ projectId, actorUserId, oauthState: stateToken });

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
      const credential = await this.credentialVault.putCredential({
        provider: "manual_import",
        connectorId: connector.id,
        credential: null
      });
      await this.prisma.communicationConnector.update({
        where: { id: connector.id },
        data: { credentialsRef: credential.ref }
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
    this.telemetry.increment("communication_connectors_total", { provider, status: connector.status });
    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "communication_connector_created");

    return {
      connectorId: connector.id,
      provider: connector.provider,
      status: connector.status,
      redirectUrl: adapterResult.redirectUrl ?? null
    };
  }

  async handleOAuthCallback(provider: CommunicationProvider, query: { code?: string; state?: string; error?: string }) {
    if (query.error) {
      throw new AppError(400, `OAuth authorization failed: ${query.error}`, "oauth_callback_failed");
    }
    if (!query.code || !query.state) {
      throw new AppError(400, "OAuth callback is missing code or state", "oauth_callback_invalid");
    }

    const statePayload = parseAndVerifyOAuthState(this.env, query.state);
    if (statePayload.provider !== provider) {
      throw new AppError(400, "OAuth callback provider mismatch", "oauth_callback_invalid");
    }

    const oauthState = await this.prisma.oAuthState.findFirst({
      where: {
        projectId: statePayload.projectId,
        provider,
        nonceHash: hashOAuthNonce(statePayload.nonce)
      }
    });

    if (!oauthState || oauthState.usedAt || oauthState.expiresAt < new Date()) {
      throw new AppError(400, "OAuth state is expired or already used", "oauth_state_expired");
    }

    const adapter = this.adapters.get(provider);
    if (!adapter?.handleOAuthCallback) {
      throw new AppError(501, "OAuth callback is not supported for this provider", "oauth_callback_not_supported");
    }

    const callbackResult = await adapter.handleOAuthCallback({
      code: query.code,
      redirectUri: this.resolveRedirectUri(provider)
    });

    const connector = await this.upsertConnectedConnector({
      projectId: oauthState.projectId,
      provider,
      createdBy: oauthState.actorUserId,
      accountLabel: callbackResult.accountLabel,
      configPatch: callbackResult.configPatch ?? {},
      providerCursor: callbackResult.providerCursor ?? null,
      credentialsRef: null
    });

    const credentialResult = await this.credentialVault.putCredential({
      provider,
      connectorId: connector.id,
      credential: callbackResult.credential
    });
    await this.prisma.communicationConnector.update({
      where: { id: connector.id },
      data: { credentialsRef: credentialResult.ref }
    });

    await this.prisma.oAuthState.update({
      where: { id: oauthState.id },
      data: { usedAt: new Date() }
    });

    if (!this.syncService) {
      throw new AppError(500, "Communication sync service is unavailable", "communication_sync_service_missing");
    }

    const queuedSync = await this.syncService.enqueueSync({
      projectId: oauthState.projectId,
      connectorId: connector.id,
      syncType: "backfill"
    });

    await this.auditService.record({
      orgId: oauthState.orgId,
      projectId: oauthState.projectId,
      actorUserId: oauthState.actorUserId,
      eventType: "communication_connector_created",
      entityType: "communication_connector",
      entityId: connector.id,
      payload: { provider, status: connector.status, oauthCompleted: true }
    });

    return {
      connectorId: connector.id,
      provider: connector.provider,
      status: connector.status,
      syncRunId: queuedSync.syncRunId,
      redirectAfter: oauthState.redirectAfter ?? null
    };
  }

  async handleOAuthCallbackFromState(
    query: { code?: string; state?: string; error?: string },
    allowedProviders: CommunicationProvider[]
  ) {
    if (!query.state) {
      throw new AppError(400, "OAuth callback is missing state", "oauth_callback_invalid");
    }

    const statePayload = parseAndVerifyOAuthState(this.env, query.state);
    const provider = statePayload.provider as CommunicationProvider;
    if (!allowedProviders.includes(provider)) {
      throw new AppError(400, "OAuth callback provider is not allowed on this endpoint", "oauth_callback_invalid");
    }

    return this.handleOAuthCallback(provider, query);
  }

  async update(projectId: string, connectorId: string, actorUserId: string, body: { accountLabel?: string; config?: Record<string, unknown> }) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const connector = await this.prisma.communicationConnector.findFirstOrThrow({
      where: { id: connectorId, projectId }
    });

    const updated = await this.prisma.communicationConnector.update({
      where: { id: connector.id },
      data: {
        accountLabel: body.accountLabel ?? connector.accountLabel,
        configJson:
          body.config != null
            ? ({
                ...((connector.configJson as Record<string, unknown> | null) ?? {}),
                ...body.config
              } as Prisma.JsonObject)
            : connector.configJson == null
              ? Prisma.JsonNull
              : (connector.configJson as Prisma.InputJsonValue)
      }
    });

    return {
      ...updated,
      credentialsRef: undefined
    };
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
    const adapter = this.adapters.get(connector.provider);
    const credential = await this.credentialVault.getCredential(connector.provider, connector.id, connector.credentialsRef);
    await adapter?.revoke?.({ connector, credential });
    await this.credentialVault.revokeCredential(connector.provider, connector.id, connector.credentialsRef).catch(() => undefined);

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

  async handleWebhook(
    provider: CommunicationProvider,
    input: {
      headers: Record<string, string | string[] | undefined>;
      rawBody: string;
      body: unknown;
      query?: Record<string, string | string[] | undefined>;
    }
  ) {
    const adapter = this.adapters.get(provider);
    if (!adapter?.verifyWebhook) {
      throw new AppError(501, "Webhook handling is not implemented for this provider", "communication_webhook_not_implemented");
    }

    const connectors = await this.prisma.communicationConnector.findMany({
      where: {
        provider,
        status: {
          in: ["connected", "syncing", "error", "pending_auth"]
        }
      }
    });

    const verification = await adapter.verifyWebhook({
      headers: input.headers,
      rawBody: input.rawBody,
      body: input.body,
      query: input.query,
      connectors
    });

    if (verification.handledImmediately) {
      return verification.handledImmediately;
    }
    if (!verification.providerEventId) {
      throw new AppError(422, "Webhook event id was not resolved", "communication_webhook_event_invalid");
    }

    const existing = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId: verification.providerEventId
        }
      }
    });
    if (existing) {
      await this.prisma.providerWebhookEvent.update({
        where: { id: existing.id },
        data: { status: "ignored_duplicate" }
      });
      this.telemetry.increment("communication_webhook_duplicates_total", { provider });
      return { statusCode: 200, body: { ok: true, duplicate: true } };
    }

    const created = await this.prisma.providerWebhookEvent.create({
      data: {
        provider,
        providerEventId: verification.providerEventId,
        connectorId: verification.connectorIds?.[0] ?? null,
        projectId: null,
        eventType: verification.eventType ?? "webhook_event",
        rawPayloadHash: hashOAuthNonce(input.rawBody),
        status: "queued",
        receivedAt: new Date(),
        processedAt: null
      }
    });

    if (!this.syncService) {
      throw new AppError(500, "Communication sync service is unavailable", "communication_sync_service_missing");
    }

    for (const connectorId of verification.connectorIds ?? []) {
      const connector = connectors.find((item) => item.id === connectorId);
      if (!connector) {
        continue;
      }

      await this.syncService.enqueueSync({
        projectId: connector.projectId,
        connectorId,
        syncType: "webhook",
        webhookPayload: {
          providerEventId: verification.providerEventId,
          eventType: verification.eventType ?? "webhook_event",
          ...(verification.jobPayload ?? {})
        }
      });
    }

    await this.prisma.providerWebhookEvent.update({
      where: { id: created.id },
      data: { status: "processed", processedAt: new Date() }
    });
    this.telemetry.increment("communication_webhook_events_total", {
      provider,
      event_type: verification.eventType ?? "webhook_event"
    });

    return { statusCode: 200, body: { ok: true } };
  }

  private async createOAuthState(
    orgId: string,
    projectId: string,
    provider: CommunicationProvider,
    actorUserId: string
  ) {
    const nonce = randomUUID();
    await this.prisma.oAuthState.create({
      data: {
        orgId,
        projectId,
        provider,
        actorUserId,
        nonceHash: hashOAuthNonce(nonce),
        redirectAfter: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    return buildOAuthState(this.env, {
      nonce,
      provider,
      projectId,
      issuedAt: Date.now()
    });
  }

  private resolveRedirectUri(provider: CommunicationProvider) {
    if (provider === "slack") {
      return this.env.SLACK_REDIRECT_URI ?? `${this.env.APP_BASE_URL}/v1/oauth/slack/callback`;
    }
    if (provider === "gmail") {
      return this.env.GOOGLE_REDIRECT_URI ?? `${this.env.APP_BASE_URL}/v1/oauth/google/callback`;
    }
    if (provider === "outlook" || provider === "microsoft_teams") {
      return this.env.MICROSOFT_REDIRECT_URI ?? `${this.env.APP_BASE_URL}/v1/oauth/microsoft/callback`;
    }
    throw new AppError(400, "Unsupported OAuth provider", "oauth_provider_not_supported");
  }

  private async upsertConnectedConnector(input: {
    projectId: string;
    provider: CommunicationProvider;
    createdBy: string;
    accountLabel: string;
    configPatch: Record<string, unknown>;
    providerCursor: Record<string, unknown> | null;
    credentialsRef: string | null;
  }) {
    const existing = await this.prisma.communicationConnector.findFirst({
      where: { projectId: input.projectId, provider: input.provider }
    });

    return existing
      ? this.prisma.communicationConnector.update({
          where: { id: existing.id },
          data: {
            accountLabel: input.accountLabel,
            status: "connected",
            lastError: null,
            credentialsRef: input.credentialsRef,
            configJson: ({
              ...((existing.configJson as Record<string, unknown> | null) ?? {}),
              ...input.configPatch
            } as Prisma.InputJsonValue),
            providerCursorJson:
              input.providerCursor == null ? Prisma.JsonNull : (input.providerCursor as Prisma.InputJsonValue)
          }
        })
      : this.prisma.communicationConnector.create({
          data: {
            projectId: input.projectId,
            provider: input.provider,
            accountLabel: input.accountLabel,
            status: "connected",
            createdBy: input.createdBy,
            credentialsRef: input.credentialsRef,
            configJson: input.configPatch as Prisma.InputJsonValue,
            providerCursorJson:
              input.providerCursor == null ? Prisma.JsonNull : (input.providerCursor as Prisma.InputJsonValue)
          }
        });
  }
}
