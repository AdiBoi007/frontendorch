import { createHmac, timingSafeEqual } from "node:crypto";
import type { CommunicationConnector } from "@prisma/client";
import type { AppEnv } from "../../../config/env.js";
import { AppError } from "../../../app/errors.js";
import type {
  NormalizedAttachment,
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

type SlackCredential = {
  accessToken: string;
  scope?: string;
  teamId?: string;
  teamName?: string;
  authedUserId?: string;
  botUserId?: string;
};

type SlackMessage = Record<string, any>;

const SLACK_SCOPES = ["channels:read", "channels:history", "groups:read", "groups:history"];

export class SlackProvider implements CommunicationProviderAdapter {
  readonly provider = "slack" as const;

  constructor(
    private readonly env: AppEnv,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async connect(input: { oauthState?: string }) {
    if (!this.env.SLACK_CLIENT_ID || !this.env.SLACK_CLIENT_SECRET || !this.env.SLACK_REDIRECT_URI) {
      throw new AppError(503, "Slack OAuth is not configured", "slack_oauth_not_configured");
    }
    if (!input.oauthState) {
      throw new AppError(400, "Slack OAuth state is required", "slack_oauth_state_required");
    }

    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", this.env.SLACK_CLIENT_ID);
    url.searchParams.set("scope", SLACK_SCOPES.join(","));
    url.searchParams.set("redirect_uri", this.env.SLACK_REDIRECT_URI);
    url.searchParams.set("state", input.oauthState);

    return {
      mode: "oauth_pending" as const,
      status: "pending_auth" as const,
      redirectUrl: url.toString(),
      accountLabel: "Slack",
      config: {
        channelIds: [],
        includeBotMessages: false,
        backfillDays: Math.min(30, this.env.CONNECTOR_SYNC_MAX_BACKFILL_DAYS)
      }
    };
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }): Promise<ProviderCallbackResult> {
    const body = new URLSearchParams({
      client_id: this.env.SLACK_CLIENT_ID ?? "",
      client_secret: this.env.SLACK_CLIENT_SECRET ?? "",
      code: input.code,
      redirect_uri: input.redirectUri
    });

    const response = await this.fetchImpl("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok || payload.ok !== true) {
      throw new AppError(502, payload.error ?? "Slack OAuth callback failed", "slack_oauth_failed");
    }

    return {
      accountLabel: payload.team?.name ?? "Slack",
      credential: {
        accessToken: payload.access_token,
        scope: payload.scope,
        teamId: payload.team?.id,
        teamName: payload.team?.name,
        authedUserId: payload.authed_user?.id,
        botUserId: payload.bot_user_id
      },
      providerCursor: {
        teamId: payload.team?.id,
        teamName: payload.team?.name,
        channels: {}
      },
      configPatch: {
        teamId: payload.team?.id,
        teamName: payload.team?.name
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
    const credential = this.requireCredential(input.credential);
    if (input.syncType === "webhook" && input.webhookPayload?.event) {
      return this.syncWebhookEvent(input, credential);
    }

    const config = this.parseConfig(input.connector.configJson);
    if (config.channelIds.length === 0) {
      return {
        queued: false,
        summary: {
          provider: "slack",
          channelCount: 0,
          messageCount: 0,
          threadCount: 0
        }
      };
    }

    const batches: NormalizedCommunicationBatch[] = [];
    const dedupedThreads = new Map<string, NormalizedThread>();
    const dedupedMessages = new Map<string, NormalizedMessage>();
    const channelCursors = this.parseCursor(input.connector.providerCursorJson).channels;

    for (const channelId of config.channelIds) {
      const oldest = this.resolveOldestTimestamp({
        syncType: input.syncType,
        maxBackfillDays: input.maxBackfillDays,
        connectorBackfillDays: config.backfillDays,
        channelCursor: channelCursors[channelId]
      });

      let cursor: string | undefined;
      do {
        const page = await this.callSlackApi<{
          messages: SlackMessage[];
          has_more?: boolean;
          response_metadata?: { next_cursor?: string };
        }>(credential.accessToken, "conversations.history", {
          channel: channelId,
          limit: String(Math.min(input.batchSize, 200)),
          ...(oldest ? { oldest } : {}),
          ...(cursor ? { cursor } : {})
        });

        for (const message of page.messages ?? []) {
          if (!this.shouldIncludeMessage(message, config.includeBotMessages)) {
            continue;
          }

          this.addSlackMessageToBatch(channelId, message, dedupedThreads, dedupedMessages);

          if (message.thread_ts && message.thread_ts === message.ts && Number(message.reply_count ?? 0) > 0) {
            const replies = await this.callSlackApi<{ messages: SlackMessage[] }>(
              credential.accessToken,
              "conversations.replies",
              {
                channel: channelId,
                ts: message.thread_ts,
                limit: String(Math.min(input.batchSize, 200))
              }
            );

            for (const reply of replies.messages ?? []) {
              if (!this.shouldIncludeMessage(reply, config.includeBotMessages)) {
                continue;
              }
              this.addSlackMessageToBatch(channelId, reply, dedupedThreads, dedupedMessages);
            }
          }
        }

        cursor = page.response_metadata?.next_cursor || undefined;
      } while (cursor);

      const latestTs = [...dedupedMessages.values()]
        .filter((message) => message.rawMetadata?.channelId === channelId)
        .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())[0]
        ?.rawMetadata?.providerTs as string | undefined;
      if (latestTs) {
        channelCursors[channelId] = { latestTs };
      }
    }

    if (dedupedMessages.size > 0) {
      batches.push({
        projectId: input.projectId,
        connectorId: input.connector.id,
        provider: "slack",
        threads: [...dedupedThreads.values()],
        messages: [...dedupedMessages.values()]
      });
    }

    return {
      queued: false,
      batches,
      cursorAfter: {
        teamId: credential.teamId ?? null,
        teamName: credential.teamName ?? null,
        channels: channelCursors
      },
      summary: {
        provider: "slack",
        channelCount: config.channelIds.length,
        threadCount: dedupedThreads.size,
        messageCount: dedupedMessages.size
      }
    };
  }

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    body: unknown;
    connectors: CommunicationConnector[];
  }): Promise<ProviderWebhookVerificationResult> {
    if (!this.env.SLACK_SIGNING_SECRET) {
      throw new AppError(503, "Slack webhook signing secret is not configured", "slack_webhook_not_configured");
    }

    const timestamp = String(input.headers["x-slack-request-timestamp"] ?? "");
    const signature = String(input.headers["x-slack-signature"] ?? "");
    if (!timestamp || !signature) {
      throw new AppError(401, "Slack signature headers are missing", "slack_webhook_signature_missing");
    }

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) {
      throw new AppError(401, "Slack webhook timestamp is stale", "slack_webhook_timestamp_invalid");
    }

    const expected = `v0=${createHmac("sha256", this.env.SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${input.rawBody}`)
      .digest("hex")}`;
    const expectedBuffer = Buffer.from(expected, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new AppError(401, "Slack webhook signature is invalid", "slack_webhook_signature_invalid");
    }

    const body = input.body as Record<string, any>;
    if (body.type === "url_verification") {
      return {
        handledImmediately: {
          statusCode: 200,
          body: { challenge: body.challenge }
        }
      };
    }

    const event = body.event as Record<string, any> | undefined;
    const teamId = body.team_id as string | undefined;
    const connectorIds = input.connectors
      .filter((connector) => {
        const config = this.parseConfig(connector.configJson);
        const connectorTeamId = typeof config.teamId === "string" ? config.teamId : undefined;
        if (connectorTeamId && teamId && connectorTeamId !== teamId) {
          return false;
        }
        if (event?.channel && config.channelIds.length > 0 && !config.channelIds.includes(event.channel)) {
          return false;
        }
        return true;
      })
      .map((connector) => connector.id);

    return {
      providerEventId: body.event_id ?? `${teamId ?? "unknown"}:${event?.event_ts ?? event?.ts ?? "event"}`,
      eventType: body.type === "event_callback" ? event?.type ?? "event_callback" : body.type,
      connectorIds,
      jobPayload: {
        teamId,
        event
      }
    };
  }

  async revoke() {
    return;
  }

  private requireCredential(credential: Record<string, unknown> | null): SlackCredential {
    if (!credential || typeof credential.accessToken !== "string" || credential.accessToken.length === 0) {
      throw new AppError(409, "Slack connector credential is missing", "slack_credential_missing");
    }

    return credential as unknown as SlackCredential;
  }

  private parseConfig(configJson: unknown) {
    const config = (configJson ?? {}) as Record<string, unknown>;
    return {
      channelIds: Array.isArray(config.channelIds) ? config.channelIds.filter((value): value is string => typeof value === "string") : [],
      includeBotMessages: config.includeBotMessages === true,
      backfillDays:
        typeof config.backfillDays === "number" && Number.isFinite(config.backfillDays) ? config.backfillDays : 30,
      teamId: typeof config.teamId === "string" ? config.teamId : undefined,
      teamName: typeof config.teamName === "string" ? config.teamName : undefined
    };
  }

  private parseCursor(cursorJson: unknown) {
    const cursor = (cursorJson ?? {}) as Record<string, any>;
    return {
      channels: (cursor.channels ?? {}) as Record<string, { latestTs?: string }>
    };
  }

  private resolveOldestTimestamp(input: {
    syncType: "manual" | "webhook" | "backfill" | "incremental";
    maxBackfillDays: number;
    connectorBackfillDays: number;
    channelCursor?: { latestTs?: string };
  }) {
    if (input.syncType === "incremental" || input.syncType === "manual") {
      return input.channelCursor?.latestTs ?? undefined;
    }

    const days = Math.min(input.maxBackfillDays, input.connectorBackfillDays);
    return `${Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)}`;
  }

  private shouldIncludeMessage(message: SlackMessage, includeBotMessages: boolean) {
    if (message.subtype === "message_deleted") {
      return false;
    }
    if (message.subtype === "message_changed") {
      return true;
    }
    if (!includeBotMessages && (message.subtype === "bot_message" || message.bot_id)) {
      return false;
    }
    if (!message.ts) {
      return false;
    }

    return true;
  }

  private addSlackMessageToBatch(
    channelId: string,
    source: SlackMessage,
    threads: Map<string, NormalizedThread>,
    messages: Map<string, NormalizedMessage>
  ) {
    const normalized = this.normalizeSlackMessage(channelId, source);
    const threadId = normalized.rawMetadata?.providerThreadId as string;

    if (!threads.has(threadId)) {
      threads.set(threadId, this.normalizeSlackThread(channelId, source));
    }

    messages.set(normalized.providerMessageId, normalized);
  }

  private normalizeSlackThread(channelId: string, message: SlackMessage): NormalizedThread {
    const threadTs = message.thread_ts ?? message.ts;
    return {
      providerThreadId: threadTs,
      subject: `Slack ${channelId} thread`,
      participants: [],
      startedAt: this.toIsoString(message.ts),
      lastMessageAt: this.toIsoString(message.latest_reply ?? message.ts),
      rawMetadata: {
        channelId,
        providerThreadId: threadTs,
        providerRootTs: threadTs
      }
    };
  }

  private normalizeSlackMessage(channelId: string, source: SlackMessage): NormalizedMessage {
    const message = source.subtype === "message_changed" && source.message ? source.message : source;
    const senderLabel = message.user_profile?.display_name || message.username || message.user || message.bot_id || "Slack user";
    const senderExternalRef = message.user || message.bot_id || null;
    const threadTs = message.thread_ts ?? message.ts;
    const attachments = this.normalizeAttachments(message.files);

    return {
      providerMessageId: String(message.ts),
      senderLabel,
      senderExternalRef,
      senderEmail: null,
      sentAt: this.toIsoString(message.ts) ?? new Date().toISOString(),
      bodyText: message.text ?? source.previous_message?.text ?? "[empty slack message]",
      bodyHtml: null,
      messageType: this.mapMessageType(message),
      providerPermalink: null,
      replyToProviderMessageId: message.thread_ts && message.thread_ts !== message.ts ? message.thread_ts : null,
      rawMetadata: {
        channelId,
        providerTs: String(message.ts),
        providerThreadId: String(threadTs),
        subtype: message.subtype ?? null,
        editedAt: message.edited?.ts ?? null
      },
      attachments
    };
  }

  private normalizeAttachments(files: SlackMessage[] | undefined): NormalizedAttachment[] {
    return (files ?? []).map((file) => ({
      providerAttachmentId: String(file.id),
      filename: typeof file.name === "string" ? file.name : null,
      mimeType: typeof file.mimetype === "string" ? file.mimetype : null,
      fileSize: typeof file.size === "number" ? file.size : null,
      providerUrl: typeof file.url_private === "string" ? file.url_private : null,
      rawMetadata: {
        title: file.title ?? null
      }
    }));
  }

  private mapMessageType(message: SlackMessage): "user" | "system" | "bot" | "file_share" | "note" | "other" {
    if (message.subtype === "bot_message" || message.bot_id) {
      return "bot";
    }
    if (message.subtype === "file_share") {
      return "file_share";
    }
    if (message.subtype) {
      return "system";
    }
    return "user";
  }

  private async syncWebhookEvent(
    input: {
      projectId: string;
      connector: CommunicationConnector;
      webhookPayload?: Record<string, unknown>;
    },
    credential: SlackCredential
  ): Promise<ProviderSyncResult> {
    const event = (input.webhookPayload?.event ?? {}) as Record<string, any>;
    const channelId = event.channel as string | undefined;
    if (!channelId) {
      return { queued: false, summary: { provider: "slack", ignored: true, reason: "missing_channel" } };
    }

    if (event.subtype === "message_deleted") {
      return {
        queued: false,
        deletedProviderMessageIds: [String(event.deleted_ts)],
        summary: { provider: "slack", deletedMessageCount: 1, messageCount: 0, threadCount: 0 }
      };
    }

    if (!this.shouldIncludeMessage(event, this.parseConfig(input.connector.configJson).includeBotMessages)) {
      return { queued: false, summary: { provider: "slack", ignored: true, reason: "filtered_event" } };
    }

    const thread = this.normalizeSlackThread(channelId, event);
    const message = this.normalizeSlackMessage(channelId, event);
    return {
      queued: false,
      batches: [
        {
          projectId: input.projectId,
          connectorId: input.connector.id,
          provider: "slack",
          threads: [thread],
          messages: [message]
        }
      ],
      cursorAfter: {
        teamId: credential.teamId ?? null,
        teamName: credential.teamName ?? null,
        channels: {
          [channelId]: {
            latestTs: message.rawMetadata?.providerTs
          }
        }
      },
      summary: { provider: "slack", messageCount: 1, threadCount: 1 }
    };
  }

  private async callSlackApi<TPayload>(token: string, method: string, params: Record<string, string>) {
    const url = new URL(`https://slack.com/api/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchImpl(url, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok || payload.ok !== true) {
      throw new AppError(502, payload.error ?? `Slack API ${method} failed`, "slack_api_error");
    }

    return payload as TPayload;
  }

  private toIsoString(value: string | undefined) {
    if (!value) {
      return null;
    }

    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      return null;
    }

    return new Date(seconds * 1000).toISOString();
  }
}
