import { Buffer } from "node:buffer";
import type { CommunicationConnector } from "@prisma/client";
import type { AppEnv } from "../../../config/env.js";
import { AppError } from "../../../app/errors.js";
import { htmlToText } from "../../../lib/communications/html-to-text.js";
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
  ProviderSyncResult
} from "./provider.interface.js";

type FetchLike = typeof fetch;

type GmailCredential = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  emailAddress?: string;
  tokenType?: string;
  scope?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
};

export class GmailProvider implements CommunicationProviderAdapter {
  readonly provider = "gmail" as const;

  constructor(
    private readonly env: AppEnv,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async connect(input: { oauthState?: string }) {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET || !this.env.GOOGLE_REDIRECT_URI) {
      throw new AppError(503, "Google OAuth is not configured", "google_oauth_not_configured");
    }
    if (!input.oauthState) {
      throw new AppError(400, "Google OAuth state is required", "google_oauth_state_required");
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", this.env.GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", input.oauthState);

    return {
      mode: "oauth_pending" as const,
      status: "pending_auth" as const,
      redirectUrl: url.toString(),
      accountLabel: "Gmail",
      config: {
        query: "",
        labelIds: ["INBOX"],
        backfillDays: Math.min(30, this.env.CONNECTOR_SYNC_MAX_BACKFILL_DAYS),
        includeAttachmentsMetadata: true
      }
    };
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }): Promise<ProviderCallbackResult> {
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: this.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokens = (await response.json()) as Record<string, any>;
    if (!response.ok || typeof tokens.access_token !== "string") {
      throw new AppError(502, tokens.error_description ?? "Google OAuth callback failed", "google_oauth_failed");
    }

    const profile = await this.callGmailApi<{ emailAddress: string; historyId: string }>(
      tokens.access_token,
      "users/me/profile"
    );

    return {
      accountLabel: profile.emailAddress,
      credential: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
        emailAddress: profile.emailAddress,
        tokenType: tokens.token_type,
        scope: tokens.scope
      },
      providerCursor: {
        emailAddress: profile.emailAddress,
        historyId: profile.historyId ?? null,
        latestInternalDate: null
      },
      configPatch: {
        emailAddress: profile.emailAddress
      }
    };
  }

  async sync(input: {
    projectId: string;
    connector: CommunicationConnector;
    credential: Record<string, unknown> | null;
    syncType: "manual" | "webhook" | "backfill" | "incremental";
    batchSize: number;
    maxBackfillDays: number;
  }): Promise<ProviderSyncResult> {
    let credential = this.requireCredential(input.credential);
    credential = await this.refreshAccessTokenIfNeeded(credential);

    const config = this.parseConfig(input.connector.configJson);
    const cursor = this.parseCursor(input.connector.providerCursorJson);

    const threadIds =
      input.syncType === "incremental" && cursor.historyId && !config.query
        ? await this.collectIncrementalThreadIds(credential.accessToken, cursor.historyId, config.labelIds, input.batchSize)
        : await this.listThreadIds(
            credential.accessToken,
            config,
            input.batchSize,
            this.resolveAfterEpoch(input.syncType, cursor.latestInternalDate, config.backfillDays, input.maxBackfillDays)
          );

    const dedupedThreads = new Map<string, NormalizedThread>();
    const dedupedMessages = new Map<string, NormalizedMessage>();
    let latestHistoryId = cursor.historyId;
    let latestInternalDate = cursor.latestInternalDate;

    for (const threadId of threadIds) {
      const thread = await this.callGmailApi<{ id: string; historyId?: string; messages?: GmailMessage[] }>(
        credential.accessToken,
        `users/me/threads/${threadId}`,
        {
          format: "full"
        }
      );

      const normalizedThread = this.normalizeThread(thread);
      dedupedThreads.set(normalizedThread.providerThreadId, normalizedThread);

      for (const message of thread.messages ?? []) {
        const normalizedMessage = this.normalizeMessage(message, Boolean(config.includeAttachmentsMetadata));
        dedupedMessages.set(normalizedMessage.providerMessageId, normalizedMessage);
        if (message.historyId && (!latestHistoryId || BigInt(message.historyId) > BigInt(latestHistoryId))) {
          latestHistoryId = message.historyId;
        }
        if (message.internalDate && (!latestInternalDate || Number(message.internalDate) > Number(latestInternalDate))) {
          latestInternalDate = message.internalDate;
        }
      }
    }

    const batches: NormalizedCommunicationBatch[] =
      dedupedMessages.size > 0
        ? [
            {
              projectId: input.projectId,
              connectorId: input.connector.id,
              provider: "gmail",
              threads: [...dedupedThreads.values()],
              messages: [...dedupedMessages.values()]
            }
          ]
        : [];

    return {
      queued: false,
      batches,
      cursorAfter: {
        emailAddress: credential.emailAddress ?? config.emailAddress ?? null,
        historyId: latestHistoryId ?? null,
        latestInternalDate: latestInternalDate ?? null
      },
      updatedCredential: credential,
      summary: {
        provider: "gmail",
        threadCount: dedupedThreads.size,
        messageCount: dedupedMessages.size,
        mode: input.syncType === "incremental" ? "poll_incremental" : "poll_backfill"
      }
    };
  }

  async revoke() {
    return;
  }

  private requireCredential(credential: Record<string, unknown> | null): GmailCredential {
    if (!credential || typeof credential.accessToken !== "string") {
      throw new AppError(409, "Gmail connector credential is missing", "gmail_credential_missing");
    }
    return credential as GmailCredential;
  }

  private parseConfig(configJson: unknown) {
    const config = (configJson ?? {}) as Record<string, unknown>;
    return {
      query: typeof config.query === "string" ? config.query : "",
      labelIds: Array.isArray(config.labelIds) ? config.labelIds.filter((value): value is string => typeof value === "string") : ["INBOX"],
      backfillDays:
        typeof config.backfillDays === "number" && Number.isFinite(config.backfillDays) ? config.backfillDays : 30,
      includeAttachmentsMetadata: config.includeAttachmentsMetadata !== false,
      emailAddress: typeof config.emailAddress === "string" ? config.emailAddress : undefined
    };
  }

  private parseCursor(cursorJson: unknown) {
    const cursor = (cursorJson ?? {}) as Record<string, string | null>;
    return {
      historyId: typeof cursor.historyId === "string" ? cursor.historyId : null,
      latestInternalDate: typeof cursor.latestInternalDate === "string" ? cursor.latestInternalDate : null
    };
  }

  private resolveAfterEpoch(
    syncType: "manual" | "webhook" | "backfill" | "incremental",
    latestInternalDate: string | null,
    connectorBackfillDays: number,
    maxBackfillDays: number
  ) {
    if ((syncType === "incremental" || syncType === "manual") && latestInternalDate) {
      return Math.floor(Number(latestInternalDate) / 1000);
    }

    const days = Math.min(connectorBackfillDays, maxBackfillDays);
    return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  }

  private async refreshAccessTokenIfNeeded(credential: GmailCredential) {
    if (!credential.refreshToken || !credential.expiryDate || credential.expiryDate > Date.now() + 30_000) {
      return credential;
    }

    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: this.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: credential.refreshToken,
        grant_type: "refresh_token"
      })
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new AppError(502, payload.error_description ?? "Google token refresh failed", "google_token_refresh_failed");
    }

    return {
      ...credential,
      accessToken: payload.access_token,
      expiryDate: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
      tokenType: payload.token_type ?? credential.tokenType,
      scope: payload.scope ?? credential.scope
    };
  }

  private async collectIncrementalThreadIds(
    accessToken: string,
    startHistoryId: string,
    labelIds: string[],
    batchSize: number
  ) {
    const threadIds = new Set<string>();
    let pageToken: string | undefined;

    do {
      const page = await this.callGmailApi<{
        history?: Array<{ messages?: Array<{ threadId?: string }> }>;
        nextPageToken?: string;
      }>(accessToken, "users/me/history", {
        startHistoryId,
        maxResults: String(Math.min(batchSize, 500)),
        ...(labelIds[0] ? { labelId: labelIds[0] } : {}),
        ...(pageToken ? { pageToken } : {})
      });

      for (const item of page.history ?? []) {
        for (const message of item.messages ?? []) {
          if (message.threadId) {
            threadIds.add(message.threadId);
          }
        }
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    return [...threadIds];
  }

  private async listThreadIds(
    accessToken: string,
    config: { query: string; labelIds: string[] },
    batchSize: number,
    afterEpoch: number
  ) {
    const threadIds = new Set<string>();
    let pageToken: string | undefined;
    const query = [config.query, `after:${afterEpoch}`].filter(Boolean).join(" ").trim();

    do {
      const page = await this.callGmailApi<{
        threads?: Array<{ id?: string }>;
        nextPageToken?: string;
      }>(accessToken, "users/me/threads", {
        maxResults: String(Math.min(batchSize, 100)),
        ...(query ? { q: query } : {}),
        ...(config.labelIds.length > 0 ? { labelIds: config.labelIds } : {}),
        ...(pageToken ? { pageToken } : {})
      });

      for (const thread of page.threads ?? []) {
        if (thread.id) {
          threadIds.add(thread.id);
        }
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    return [...threadIds];
  }

  private normalizeThread(thread: { id: string; messages?: GmailMessage[] }): NormalizedThread {
    const messages = thread.messages ?? [];
    const subjectHeader = this.findHeader(messages[0]?.payload, "Subject");
    const participants = new Map<string, NormalizedParticipant>();
    for (const message of messages) {
      for (const participant of this.collectParticipants(message.payload)) {
        participants.set(`${participant.externalRef ?? participant.email ?? participant.label}`, participant);
      }
    }

    const sortedMessages = [...messages].sort((left, right) => Number(left.internalDate ?? 0) - Number(right.internalDate ?? 0));
    return {
      providerThreadId: thread.id,
      subject: subjectHeader ?? sortedMessages[0]?.snippet ?? "Email thread",
      participants: [...participants.values()],
      startedAt: this.internalDateToIso(sortedMessages[0]?.internalDate),
      lastMessageAt: this.internalDateToIso(sortedMessages[sortedMessages.length - 1]?.internalDate),
      rawMetadata: {
        providerThreadId: thread.id
      }
    };
  }

  private normalizeMessage(message: GmailMessage, includeAttachmentsMetadata: boolean): NormalizedMessage {
    const text = this.extractBodyText(message.payload);
    const html = this.extractBodyHtml(message.payload);
    const fromHeader = this.findHeader(message.payload, "From");
    const subjectHeader = this.findHeader(message.payload, "Subject");

    return {
      providerMessageId: message.id,
      senderLabel: fromHeader ?? "Email sender",
      senderExternalRef: fromHeader ?? null,
      senderEmail: this.extractEmail(fromHeader),
      sentAt: this.internalDateToIso(message.internalDate) ?? new Date().toISOString(),
      bodyText: text || message.snippet || "[empty email message]",
      bodyHtml: html,
      messageType: "user",
      providerPermalink: null,
      replyToProviderMessageId: null,
      rawMetadata: {
        providerThreadId: message.threadId,
        historyId: message.historyId ?? null,
        labelIds: message.labelIds ?? [],
        subject: subjectHeader ?? null
      },
      attachments: includeAttachmentsMetadata ? this.collectAttachments(message.payload) : []
    };
  }

  private collectParticipants(payload: GmailMessagePart | undefined) {
    const headers = ["From", "To", "Cc", "Bcc"];
    const participants: NormalizedParticipant[] = [];
    for (const header of headers) {
      const value = this.findHeader(payload, header);
      if (!value) {
        continue;
      }

      for (const raw of value.split(",")) {
        const trimmed = raw.trim();
        if (!trimmed) {
          continue;
        }
        participants.push({
          label: trimmed,
          externalRef: trimmed,
          email: this.extractEmail(trimmed)
        });
      }
    }
    return participants;
  }

  private collectAttachments(payload: GmailMessagePart | undefined): NormalizedAttachment[] {
    const attachments: NormalizedAttachment[] = [];
    const visit = (part: GmailMessagePart | undefined) => {
      if (!part) {
        return;
      }
      if (part.filename) {
        attachments.push({
          providerAttachmentId: part.body?.attachmentId ?? part.filename,
          filename: part.filename,
          mimeType: part.mimeType ?? null,
          fileSize: typeof part.body?.size === "number" ? part.body.size : null,
          providerUrl: null,
          rawMetadata: {
            attachmentId: part.body?.attachmentId ?? null
          }
        });
      }
      for (const child of part.parts ?? []) {
        visit(child);
      }
    };
    visit(payload);
    return attachments;
  }

  private extractBodyText(payload: GmailMessagePart | undefined): string {
    const text = this.findMimePart(payload, "text/plain");
    if (text?.body?.data) {
      return this.decodeBase64Url(text.body.data);
    }
    const html = this.findMimePart(payload, "text/html");
    if (html?.body?.data) {
      return htmlToText(this.decodeBase64Url(html.body.data));
    }
    return "";
  }

  private extractBodyHtml(payload: GmailMessagePart | undefined): string | null {
    const html = this.findMimePart(payload, "text/html");
    if (!html?.body?.data) {
      return null;
    }

    return this.decodeBase64Url(html.body.data);
  }

  private findMimePart(payload: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | null {
    if (!payload) {
      return null;
    }
    if (payload.mimeType === mimeType) {
      return payload;
    }
    for (const child of payload.parts ?? []) {
      const found = this.findMimePart(child, mimeType);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private findHeader(payload: GmailMessagePart | undefined, headerName: string) {
    return (
      payload?.headers?.find((header) => header.name?.toLowerCase() === headerName.toLowerCase())?.value ?? null
    );
  }

  private extractEmail(value: string | null) {
    if (!value) {
      return null;
    }
    const match = value.match(/<([^>]+)>/);
    if (match?.[1]) {
      return match[1].trim().toLowerCase();
    }
    if (value.includes("@")) {
      return value.trim().toLowerCase();
    }
    return null;
  }

  private decodeBase64Url(value: string) {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  }

  private internalDateToIso(value: string | undefined) {
    if (!value) {
      return null;
    }
    return new Date(Number(value)).toISOString();
  }

  private async callGmailApi<TPayload>(
    accessToken: string,
    path: string,
    query?: Record<string, string | string[]>
  ) {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item);
        }
      } else if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchImpl(url, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new AppError(
        response.status === 404 ? 409 : 502,
        payload.error?.message ?? `Gmail API ${path} failed`,
        response.status === 404 ? "gmail_history_cursor_expired" : "gmail_api_error"
      );
    }

    return payload as TPayload;
  }
}
