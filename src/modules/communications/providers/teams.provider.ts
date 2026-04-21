import type { CommunicationConnector } from "@prisma/client";
import type { AppEnv } from "../../../config/env.js";
import { AppError } from "../../../app/errors.js";
import { htmlToText } from "../../../lib/communications/html-to-text.js";
import {
  buildMicrosoftOAuthUrl,
  callMicrosoftGraph,
  exchangeMicrosoftCode,
  refreshMicrosoftAccessToken,
  type MicrosoftCredential
} from "../../../lib/communications/microsoft-graph.js";
import type {
  NormalizedCommunicationBatch,
  NormalizedMessage,
  NormalizedParticipant,
  NormalizedThread
} from "../../../lib/communications/provider-normalized-types.js";
import type {
  CommunicationProviderAdapter,
  ProviderCallbackResult,
  ProviderSyncResult,
  ProviderWebhookVerificationResult
} from "./provider.interface.js";

type FetchLike = typeof fetch;

const TEAMS_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "https://graph.microsoft.com/Channel.ReadBasic.All",
  "https://graph.microsoft.com/ChannelMessage.Read.All",
  "https://graph.microsoft.com/Team.ReadBasic.All"
];

export class TeamsProvider implements CommunicationProviderAdapter {
  readonly provider = "microsoft_teams" as const;

  constructor(
    private readonly env: AppEnv,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async connect(input: { oauthState?: string }) {
    if (!input.oauthState) {
      throw new AppError(400, "Microsoft OAuth state is required", "microsoft_oauth_state_required");
    }

    return {
      mode: "oauth_pending" as const,
      status: "pending_auth" as const,
      redirectUrl: buildMicrosoftOAuthUrl(this.env, input.oauthState, TEAMS_SCOPES),
      accountLabel: "Microsoft Teams",
      config: {
        teams: [],
        backfillDays: Math.min(30, this.env.CONNECTOR_SYNC_MAX_BACKFILL_DAYS),
        includeBotMessages: false
      }
    };
  }

  async handleOAuthCallback(input: { code: string }): Promise<ProviderCallbackResult> {
    const credential = await exchangeMicrosoftCode(this.env, this.fetchImpl, input.code, TEAMS_SCOPES);
    const profile = await callMicrosoftGraph<{ displayName?: string; userPrincipalName?: string; id?: string }>(
      this.fetchImpl,
      credential,
      "/me?$select=id,displayName,userPrincipalName"
    );

    return {
      accountLabel: profile.userPrincipalName ?? profile.displayName ?? "Microsoft Teams",
      credential: {
        ...credential,
        accountLabel: profile.userPrincipalName ?? profile.displayName ?? "Microsoft Teams",
        userId: profile.id
      },
      providerCursor: {
        channels: {}
      },
      configPatch: {
        accountOwner: profile.userPrincipalName ?? null
      }
    };
  }

  async sync(input: {
    projectId: string;
    connector: CommunicationConnector;
    credential: Record<string, unknown> | null;
    syncType: "manual" | "webhook" | "backfill" | "incremental";
    webhookPayload?: Record<string, unknown>;
    batchSize: number;
    maxBackfillDays: number;
  }): Promise<ProviderSyncResult> {
    let credential = this.requireCredential(input.credential);
    if (credential.expiryDate && credential.expiryDate <= Date.now() + 60_000) {
      credential = {
        ...credential,
        ...(await refreshMicrosoftAccessToken(this.env, this.fetchImpl, credential, TEAMS_SCOPES))
      };
    }

    const config = this.parseConfig(input.connector.configJson);
    if (config.teams.length === 0) {
      return {
        queued: false,
        summary: { provider: "microsoft_teams", teamCount: 0, messageCount: 0, threadCount: 0 }
      };
    }

    const cursor = this.parseCursor(input.connector.providerCursorJson);
    const threadMap = new Map<string, NormalizedThread>();
    const messageMap = new Map<string, NormalizedMessage>();
    const channelCursor = { ...cursor.channels };

    for (const teamEntry of config.teams) {
      for (const channelId of teamEntry.channelIds) {
        const path = `/teams/${encodeURIComponent(teamEntry.teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=${Math.min(input.batchSize, 50)}`;
        const page = await callMicrosoftGraph<{ value?: Record<string, any>[] }>(this.fetchImpl, credential, path);

        for (const rootMessage of page.value ?? []) {
          if (!this.shouldIncludeMessage(rootMessage, config.includeBotMessages)) {
            continue;
          }
          const normalizedRoot = this.normalizeTeamsMessage(teamEntry.teamId, channelId, rootMessage, null);
            if (this.shouldIncludeByCursor(channelCursor, normalizedRoot, input.syncType)) {
              threadMap.set(normalizedRoot.thread.providerThreadId, normalizedRoot.thread);
              messageMap.set(normalizedRoot.message.providerMessageId, normalizedRoot.message);
              this.advanceChannelCursor(channelCursor, teamEntry.teamId, channelId, this.toIsoString(normalizedRoot.message.sentAt));
            }

          const replyPath = `/teams/${encodeURIComponent(teamEntry.teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(String(rootMessage.id))}/replies?$top=${Math.min(input.batchSize, 50)}`;
          const replies = await callMicrosoftGraph<{ value?: Record<string, any>[] }>(this.fetchImpl, credential, replyPath);
          for (const reply of replies.value ?? []) {
            if (!this.shouldIncludeMessage(reply, config.includeBotMessages)) {
              continue;
            }
            const normalizedReply = this.normalizeTeamsMessage(teamEntry.teamId, channelId, reply, String(rootMessage.id));
            if (this.shouldIncludeByCursor(channelCursor, normalizedReply, input.syncType)) {
              threadMap.set(normalizedReply.thread.providerThreadId, normalizedReply.thread);
              messageMap.set(normalizedReply.message.providerMessageId, normalizedReply.message);
              this.advanceChannelCursor(channelCursor, teamEntry.teamId, channelId, this.toIsoString(normalizedReply.message.sentAt));
            }
          }
        }
      }
    }

    return {
      queued: false,
      status: "completed",
      batches:
        messageMap.size === 0
          ? []
          : [
              {
                projectId: input.projectId,
                connectorId: input.connector.id,
                provider: "microsoft_teams",
                threads: [...threadMap.values()],
                messages: [...messageMap.values()]
              }
            ],
      cursorAfter: { channels: channelCursor },
      updatedCredential: credential,
      summary: {
        provider: "microsoft_teams",
        teamCount: config.teams.length,
        threadCount: threadMap.size,
        messageCount: messageMap.size
      }
    };
  }

  async verifyWebhook(input: {
    body: unknown;
    query?: Record<string, string | string[] | undefined>;
  }): Promise<ProviderWebhookVerificationResult> {
    const validationToken = input.query?.validationToken;
    const validationValue = Array.isArray(validationToken) ? validationToken[0] : validationToken;
    if (validationValue) {
      return {
        handledImmediately: {
          statusCode: 200,
          body: validationValue
        }
      };
    }

    const body = input.body as { value?: Array<Record<string, any>> };
    const notifications = body.value ?? [];
    const connectorIds = notifications
      .map((item) => (typeof item.clientState === "string" ? item.clientState : null))
      .filter((value): value is string => Boolean(value));

    return {
      providerEventId:
        notifications[0]?.subscriptionId && notifications[0]?.resourceData?.id
          ? `${notifications[0].subscriptionId}:${notifications[0].resourceData.id}`
          : `teams:${Date.now()}`,
      eventType: notifications[0]?.changeType ?? "notification",
      connectorIds,
      jobPayload: {
        notifications
      }
    };
  }

  async revoke() {
    return;
  }

  private requireCredential(credential: Record<string, unknown> | null): MicrosoftCredential {
    if (!credential || typeof credential.accessToken !== "string" || credential.accessToken.length === 0) {
      throw new AppError(409, "Microsoft Teams connector credential is missing", "teams_credential_missing");
    }
    return credential as MicrosoftCredential;
  }

  private parseConfig(configJson: unknown) {
    const config = (configJson ?? {}) as Record<string, unknown>;
    const teams = Array.isArray(config.teams)
      ? config.teams
          .map((entry) => ({
            teamId: typeof (entry as Record<string, unknown>).teamId === "string" ? (entry as Record<string, unknown>).teamId as string : null,
            channelIds: Array.isArray((entry as Record<string, unknown>).channelIds)
              ? ((entry as Record<string, unknown>).channelIds as unknown[]).filter((value): value is string => typeof value === "string")
              : []
          }))
          .filter((entry) => entry.teamId && entry.channelIds.length > 0)
          .map((entry) => ({ teamId: entry.teamId as string, channelIds: entry.channelIds }))
      : [];

    return {
      teams,
      backfillDays:
        typeof config.backfillDays === "number" && Number.isFinite(config.backfillDays) ? config.backfillDays : 30,
      includeBotMessages: config.includeBotMessages === true
    };
  }

  private parseCursor(cursorJson: unknown) {
    const cursor = (cursorJson ?? {}) as Record<string, any>;
    return {
      channels: (cursor.channels ?? {}) as Record<string, { latestCreatedDateTime?: string }>
    };
  }

  private shouldIncludeMessage(message: Record<string, any>, includeBotMessages: boolean) {
    const messageType = typeof message.messageType === "string" ? message.messageType : "message";
    if (!includeBotMessages && message.from?.application) {
      return false;
    }
    if (message.deletedDateTime) {
      return false;
    }
    return messageType === "message";
  }

  private normalizeTeamsMessage(teamId: string, channelId: string, source: Record<string, any>, rootMessageId: string | null) {
    const actualRootId = rootMessageId ?? String(source.replyToId ?? source.id);
    const providerThreadId = `${teamId}:${channelId}:${actualRootId}`;
    const sender = source.from?.user ?? source.from?.application ?? {};
    const senderExternalRef = sender.id ?? null;
    const senderLabel = sender.displayName ?? sender.id ?? "Teams user";
    const sentAt = typeof source.createdDateTime === "string" ? source.createdDateTime : new Date().toISOString();
    const bodyHtml = typeof source.body?.content === "string" ? source.body.content : null;
    const bodyText = bodyHtml ? htmlToText(bodyHtml) : "[empty teams message]";
    const participants = this.normalizeParticipants(source);

    const thread: NormalizedThread = {
      providerThreadId,
      subject: `Teams ${teamId}/${channelId}`,
      participants,
      startedAt: sentAt,
      lastMessageAt: sentAt,
      threadUrl: typeof source.webUrl === "string" ? source.webUrl : null,
      rawMetadata: { teamId, channelId, rootMessageId: actualRootId }
    };

    const message: NormalizedMessage = {
      providerMessageId: `${teamId}:${channelId}:${String(source.id)}`,
      senderLabel,
      senderExternalRef,
      senderEmail: null,
      sentAt,
      bodyText,
      bodyHtml,
      messageType: senderExternalRef ? "user" : "bot",
      providerPermalink: typeof source.webUrl === "string" ? source.webUrl : null,
      replyToProviderMessageId: rootMessageId ? `${teamId}:${channelId}:${rootMessageId}` : null,
      rawMetadata: {
        providerThreadId,
        teamId,
        channelId,
        etag: source.etag ?? null,
        lastModifiedDateTime: source.lastModifiedDateTime ?? null
      }
    };

    return { thread, message };
  }

  private normalizeParticipants(source: Record<string, any>): NormalizedParticipant[] {
    const sender = source.from?.user ?? source.from?.application ?? null;
    if (!sender) {
      return [];
    }
    return [
      {
        label: sender.displayName ?? sender.id ?? "Teams user",
        externalRef: sender.id ?? null,
        email: null
      }
    ];
  }

  private shouldIncludeByCursor(
    channelCursor: Record<string, { latestCreatedDateTime?: string }>,
    normalized: { thread: NormalizedThread; message: NormalizedMessage },
    syncType: "manual" | "webhook" | "backfill" | "incremental"
  ) {
    if (syncType === "backfill") {
      return true;
    }
    const cursorKey = normalized.thread.rawMetadata?.teamId && normalized.thread.rawMetadata?.channelId
      ? `${normalized.thread.rawMetadata.teamId}:${normalized.thread.rawMetadata.channelId}`
      : null;
    if (!cursorKey) {
      return true;
    }
    const latest = channelCursor[cursorKey]?.latestCreatedDateTime;
    return !latest || Date.parse(this.toIsoString(normalized.message.sentAt)) > Date.parse(latest);
  }

  private advanceChannelCursor(
    channelCursor: Record<string, { latestCreatedDateTime?: string }>,
    teamId: string,
    channelId: string,
    sentAt: string
  ) {
    const key = `${teamId}:${channelId}`;
    const current = channelCursor[key]?.latestCreatedDateTime;
    if (!current || Date.parse(sentAt) > Date.parse(current)) {
      channelCursor[key] = { latestCreatedDateTime: sentAt };
    }
  }

  private toIsoString(value: string | Date) {
    return value instanceof Date ? value.toISOString() : value;
  }
}
