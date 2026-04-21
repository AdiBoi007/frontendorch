import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialVault } from "../src/lib/communications/credential-vault.js";
import { SlackProvider } from "../src/modules/communications/providers/slack.provider.js";
import { GmailProvider } from "../src/modules/communications/providers/gmail.provider.js";
import { OutlookProvider } from "../src/modules/communications/providers/outlook.provider.js";
import { TeamsProvider } from "../src/modules/communications/providers/teams.provider.js";
import { WhatsAppBusinessProvider } from "../src/modules/communications/providers/whatsapp-business.provider.js";
import { ConnectorsService } from "../src/modules/communications/connectors.service.js";
import { SyncService } from "../src/modules/communications/sync.service.js";
import { MessageIngestionService } from "../src/modules/communications/message-ingestion.service.js";
import { AppError } from "../src/app/errors.js";

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    HOST: "127.0.0.1",
    LOG_LEVEL: "silent",
    APP_BASE_URL: "http://localhost:3000",
    CORS_ALLOWED_ORIGINS: "http://localhost:3001",
    DATABASE_URL: "postgresql://test",
    DIRECT_URL: "postgresql://test",
    REDIS_URL: "redis://localhost:6379",
    QUEUE_MODE: "inline",
    QUEUE_PREFIX: "orchestra",
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_ROOT: "./storage",
    SIGNED_URL_TTL_SECONDS: 3600,
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
    PASSWORD_HASH_COST: 12,
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL_REASONING: "mock",
    OPENAI_API_KEY: undefined,
    OPENAI_EMBEDDING_MODEL: "mock",
    OPENAI_TRANSCRIPTION_MODEL: "mock-transcribe",
    SLACK_CLIENT_ID: "slack-client-id",
    SLACK_CLIENT_SECRET: "slack-client-secret",
    SLACK_SIGNING_SECRET: "slack-signing-secret",
    SLACK_REDIRECT_URI: "http://localhost:3000/v1/oauth/slack/callback",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/v1/oauth/google/callback",
    GOOGLE_PUBSUB_TOPIC: undefined,
    MICROSOFT_CLIENT_ID: "microsoft-client-id",
    MICROSOFT_CLIENT_SECRET: "microsoft-client-secret",
    MICROSOFT_REDIRECT_URI: "http://localhost:3000/v1/oauth/microsoft/callback",
    MICROSOFT_TENANT_ID: "common",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "whatsapp-verify-token",
    WHATSAPP_APP_SECRET: "whatsapp-app-secret",
    WHATSAPP_READINESS_MODE: "webhook_inbound",
    CONNECTOR_CREDENTIAL_VAULT_MODE: "memory",
    CONNECTOR_OAUTH_STATE_SECRET: "test-connector-oauth-state-secret",
    CONNECTOR_SYNC_BATCH_SIZE: 100,
    CONNECTOR_SYNC_MAX_BACKFILL_DAYS: 30,
    RETRIEVAL_TOP_K: 8,
    RETRIEVAL_MIN_SCORE: 0.2,
    RETRIEVAL_USE_HYBRID: true,
    RETRIEVAL_DOC_WEIGHT: 1,
    RETRIEVAL_COMM_WEIGHT: 0.8,
    RETRIEVAL_ACCEPTED_TRUTH_BOOST: 1.2,
    METRICS_TOKEN: undefined,
    ...overrides
  } as any;
}

describe("communication layer C3 providers", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("stores credentials only through the vault envelope and can retrieve them", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "orchestra-vault-"));
    const originalCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const env = createEnv({
        CONNECTOR_CREDENTIAL_VAULT_MODE: "encrypted_file"
      });
      const vault = new CredentialVault(env);
      const stored = await vault.putCredential({
        provider: "slack",
        connectorId: "connector-1",
        credential: { accessToken: "xoxb-secret-token", refreshToken: "secret-refresh" }
      });

      const fileContents = await readFile(
        path.join(tempRoot, ".vault", "connectors", "vault_slack_connector-1.json"),
        "utf8"
      );
      expect(fileContents).not.toContain("xoxb-secret-token");
      expect(stored.ref).toContain("vault:slack:connector-1");

      const credential = await vault.getCredential("slack", "connector-1", stored.ref);
      expect(credential).toEqual(
        expect.objectContaining({
          accessToken: "xoxb-secret-token"
        })
      );
    } finally {
      process.chdir(originalCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("builds Slack OAuth URLs and exchanges callbacks into credentials", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(String(input)).toContain("oauth.v2.access");
      return new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-test",
          scope: "channels:history",
          team: { id: "T123", name: "Arrayah" },
          authed_user: { id: "U123" },
          bot_user_id: "B123"
        }),
        { status: 200 }
      );
    });

    const provider = new SlackProvider(createEnv(), fetchMock as typeof fetch);
    const connect = await provider.connect({ oauthState: "signed-state" });
    expect(connect.redirectUrl).toContain("state=signed-state");

    const callback = await provider.handleOAuthCallback({
      code: "test-code",
      redirectUri: "http://localhost:3000/v1/oauth/slack/callback"
    });

    expect(callback.accountLabel).toBe("Arrayah");
    expect(callback.credential).toEqual(
      expect.objectContaining({
        accessToken: "xoxb-test",
        teamId: "T123"
      })
    );
  });

  it("syncs Slack history plus replies and verifies webhook signatures", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("conversations.history")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                ts: "1713600000.000100",
                thread_ts: "1713600000.000100",
                text: "Need weekly reporting",
                user: "U123",
                reply_count: 1
              }
            ],
            response_metadata: { next_cursor: "" }
          }),
          { status: 200 }
        );
      }

      if (url.includes("conversations.replies")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                ts: "1713600000.000100",
                thread_ts: "1713600000.000100",
                text: "Need weekly reporting",
                user: "U123"
              },
              {
                ts: "1713600060.000200",
                thread_ts: "1713600000.000100",
                text: "Approved by client",
                user: "U456"
              }
            ]
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected Slack URL: ${url}`);
    });

    const provider = new SlackProvider(createEnv(), fetchMock as typeof fetch);
    const result = await provider.sync({
      projectId: "project-1",
      connector: {
        id: "connector-1",
        projectId: "project-1",
        provider: "slack",
        accountLabel: "Slack",
        status: "connected",
        configJson: { channelIds: ["C123"], includeBotMessages: false, backfillDays: 30 },
        providerCursorJson: { channels: {} }
      } as any,
      credential: { accessToken: "xoxb-test", teamId: "T123", teamName: "Arrayah" },
      syncType: "backfill",
      batchSize: 50,
      maxBackfillDays: 30
    });

    expect(result.batches?.[0]?.messages).toHaveLength(2);
    expect(result.batches?.[0]?.threads).toHaveLength(1);

    const rawBody = JSON.stringify({
      type: "url_verification",
      challenge: "challenge-token"
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", "slack-signing-secret")
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    const verified = await provider.verifyWebhook({
      headers: {
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature
      },
      rawBody,
      body: JSON.parse(rawBody),
      connectors: []
    });

    expect(verified.handledImmediately?.body).toEqual({ challenge: "challenge-token" });

    await expect(
      provider.verifyWebhook({
        headers: {
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": "v0=bad"
        },
        rawBody,
        body: JSON.parse(rawBody),
        connectors: []
      })
    ).rejects.toMatchObject({ code: "slack_webhook_signature_invalid" });
  });

  it("syncs Gmail threads, cleans HTML, preserves attachment metadata, and refreshes expired tokens", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "gmail-access-refreshed",
            expires_in: 3600,
            token_type: "Bearer"
          }),
          { status: 200 }
        );
      }
      if (url.includes("/users/me/threads?")) {
        return new Response(JSON.stringify({ threads: [{ id: "thread-1" }] }), { status: 200 });
      }
      if (url.includes("/users/me/threads/thread-1")) {
        return new Response(
          JSON.stringify({
            id: "thread-1",
            historyId: "11",
            messages: [
              {
                id: "msg-1",
                threadId: "thread-1",
                historyId: "11",
                internalDate: "1713600000000",
                snippet: "Weekly reporting",
                payload: {
                  headers: [
                    { name: "Subject", value: "Reporting" },
                    { name: "From", value: "Client <client@example.com>" },
                    { name: "To", value: "PM <pm@example.com>" }
                  ],
                  parts: [
                    {
                      mimeType: "text/html",
                      body: {
                        data: Buffer.from("<div>Need <b>weekly</b> reporting</div>").toString("base64url")
                      }
                    },
                    {
                      mimeType: "application/pdf",
                      filename: "brief.pdf",
                      body: {
                        attachmentId: "att-1",
                        size: 128
                      }
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected Gmail URL: ${url}`);
    });

    const provider = new GmailProvider(createEnv(), fetchMock as typeof fetch);
    const result = await provider.sync({
      projectId: "project-1",
      connector: {
        id: "connector-1",
        projectId: "project-1",
        provider: "gmail",
        accountLabel: "Gmail",
        status: "connected",
        configJson: { query: "label:client-project", labelIds: ["INBOX"], includeAttachmentsMetadata: true, backfillDays: 30 },
        providerCursorJson: { latestInternalDate: null, historyId: null }
      } as any,
      credential: {
        accessToken: "gmail-access-stale",
        refreshToken: "gmail-refresh",
        expiryDate: Date.now() - 1_000,
        emailAddress: "client@example.com"
      },
      syncType: "backfill",
      batchSize: 50,
      maxBackfillDays: 30
    });

    expect(result.updatedCredential).toEqual(
      expect.objectContaining({
        accessToken: "gmail-access-refreshed"
      })
    );
    expect(result.batches?.[0]?.messages[0]?.bodyText).toContain("Need weekly reporting");
    expect(result.batches?.[0]?.messages[0]?.attachments?.[0]).toEqual(
      expect.objectContaining({
        filename: "brief.pdf",
        providerAttachmentId: "att-1"
      })
    );
  });

  it("builds Microsoft OAuth URLs and exchanges Outlook callbacks into credentials", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2/v2.0/token")) {
        return new Response(
          JSON.stringify({
            access_token: "outlook-access",
            refresh_token: "outlook-refresh",
            expires_in: 3600,
            scope: "Mail.Read offline_access"
          }),
          { status: 200 }
        );
      }
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            id: "graph-user-1",
            displayName: "Client Inbox",
            userPrincipalName: "client@example.com"
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected Outlook URL: ${url}`);
    });

    const provider = new OutlookProvider(createEnv(), fetchMock as typeof fetch);
    const connect = await provider.connect({ oauthState: "signed-state" });
    expect(connect.redirectUrl).toContain("state=signed-state");

    const callback = await provider.handleOAuthCallback({
      code: "test-code"
    });

    expect(callback.accountLabel).toBe("client@example.com");
    expect(callback.credential).toEqual(
      expect.objectContaining({
        accessToken: "outlook-access",
        refreshToken: "outlook-refresh"
      })
    );
  });

  it("syncs Outlook messages and preserves attachment metadata", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2/v2.0/token")) {
        return new Response(
          JSON.stringify({
            access_token: "outlook-access-refreshed",
            expires_in: 3600,
            refresh_token: "outlook-refresh",
            scope: "Mail.Read offline_access"
          }),
          { status: 200 }
        );
      }
      if (url.includes("/mailFolders/Inbox/messages?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "graph-message-1",
                conversationId: "conversation-1",
                subject: "Reporting cadence",
                body: { contentType: "html", content: "<div>Please send weekly reporting.</div>" },
                bodyPreview: "Please send weekly reporting.",
                from: { emailAddress: { name: "Client", address: "client@example.com" } },
                toRecipients: [{ emailAddress: { name: "PM", address: "pm@example.com" } }],
                createdDateTime: "2026-04-20T10:00:00.000Z",
                lastModifiedDateTime: "2026-04-20T10:00:00.000Z",
                webLink: "https://outlook.office.com/mail/inbox/id/graph-message-1",
                attachments: [
                  {
                    id: "attachment-1",
                    name: "brief.pdf",
                    contentType: "application/pdf",
                    size: 128
                  }
                ]
              }
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected Outlook sync URL: ${url}`);
    });

    const provider = new OutlookProvider(createEnv(), fetchMock as typeof fetch);
    const result = await provider.sync({
      projectId: "project-1",
      connector: {
        id: "connector-1",
        projectId: "project-1",
        provider: "outlook",
        accountLabel: "Outlook",
        status: "connected",
        configJson: { folderIds: ["Inbox"], includeAttachmentsMetadata: true, backfillDays: 30 },
        providerCursorJson: {}
      } as any,
      credential: {
        accessToken: "outlook-access",
        refreshToken: "outlook-refresh",
        expiryDate: Date.now() - 1_000,
        accountId: "graph-user-1",
        accountLabel: "Client Inbox"
      },
      syncType: "backfill",
      batchSize: 50,
      maxBackfillDays: 30
    });

    expect(result.batches?.[0]?.threads[0]?.providerThreadId).toBe("conversation-1");
    expect(result.batches?.[0]?.messages[0]?.providerMessageId).toBe("graph-message-1");
    expect(result.batches?.[0]?.messages[0]?.bodyText).toContain("weekly reporting");
    expect(result.batches?.[0]?.messages[0]?.attachments?.[0]).toEqual(
      expect.objectContaining({
        providerAttachmentId: "attachment-1",
        filename: "brief.pdf"
      })
    );
    expect(result.cursorAfter).toEqual(
      expect.objectContaining({
        deltaLink: expect.stringContaining("/me/messages/delta")
      })
    );
    expect(result.updatedCredential).toEqual(
      expect.objectContaining({
        accessToken: "outlook-access-refreshed"
      })
    );
  });

  it("syncs Teams channel roots and replies into normalized messages", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2/v2.0/token")) {
        return new Response(
          JSON.stringify({
            access_token: "teams-access-refreshed",
            expires_in: 3600,
            refresh_token: "teams-refresh"
          }),
          { status: 200 }
        );
      }
      if (url.includes("/teams/team-1/channels/channel-1/messages?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "root-1",
                createdDateTime: "2026-04-20T10:00:00.000Z",
                body: { contentType: "html", content: "<div>Need weekly reporting</div>" },
                from: { user: { id: "user-1", displayName: "Client" } }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.includes("/teams/team-1/channels/channel-1/messages/root-1/replies")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "reply-1",
                replyToId: "root-1",
                createdDateTime: "2026-04-20T10:05:00.000Z",
                body: { contentType: "html", content: "<div>Approved by client</div>" },
                from: { user: { id: "user-2", displayName: "PM" } }
              }
            ]
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected Teams URL: ${url}`);
    });

    const provider = new TeamsProvider(createEnv(), fetchMock as typeof fetch);
    const result = await provider.sync({
      projectId: "project-1",
      connector: {
        id: "connector-1",
        projectId: "project-1",
        provider: "microsoft_teams",
        accountLabel: "Teams",
        status: "connected",
        configJson: {
          teams: [{ teamId: "team-1", channelIds: ["channel-1"] }],
          includeBotMessages: false,
          backfillDays: 30
        },
        providerCursorJson: {}
      } as any,
      credential: {
        accessToken: "teams-access",
        refreshToken: "teams-refresh",
        expiryDate: Date.now() - 1_000,
        accountId: "graph-user-1",
        accountLabel: "Teams Account"
      },
      syncType: "backfill",
      batchSize: 50,
      maxBackfillDays: 30
    });

    expect(result.batches?.[0]?.threads[0]?.providerThreadId).toBe("team-1:channel-1:root-1");
    expect(result.batches?.[0]?.messages).toHaveLength(2);
    expect(result.batches?.[0]?.messages[1]?.providerMessageId).toBe("team-1:channel-1:reply-1");
    expect(result.updatedCredential).toEqual(
      expect.objectContaining({
        accessToken: "teams-access-refreshed"
      })
    );
  });

  it("verifies WhatsApp challenge requests and normalizes inbound messages", async () => {
    const provider = new WhatsAppBusinessProvider(createEnv());

    const verification = await provider.verifyWebhook({
      headers: {},
      rawBody: "",
      body: {},
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "whatsapp-verify-token",
        "hub.challenge": "challenge-value"
      },
      connectors: []
    });
    expect(verification.handledImmediately).toEqual({
      statusCode: 200,
      body: "challenge-value"
    });

    const inboundBody = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-1" },
                contacts: [{ wa_id: "61400000000", profile: { name: "Client" } }],
                messages: [
                  {
                    id: "wamid-1",
                    from: "61400000000",
                    timestamp: "1713600000",
                    type: "text",
                    text: { body: "Can we add weekly reporting?" }
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const rawBody = JSON.stringify(inboundBody);
    const signature = `sha256=${createHmac("sha256", "whatsapp-app-secret").update(rawBody).digest("hex")}`;

    const verified = await provider.verifyWebhook({
      headers: { "x-hub-signature-256": signature },
      rawBody,
      body: inboundBody,
      connectors: [
        {
          id: "connector-1",
          configJson: { phoneNumberIds: ["phone-1"] }
        } as any
      ],
      query: {}
    });
    expect(verified.connectorIds).toEqual(["connector-1"]);

    const result = await provider.sync({
      projectId: "project-1",
      connector: {
        id: "connector-1",
        projectId: "project-1",
        provider: "whatsapp_business",
        accountLabel: "WhatsApp",
        status: "connected",
        configJson: { phoneNumberIds: ["phone-1"] }
      } as any,
      syncType: "webhook",
      webhookPayload: { change: inboundBody.entry[0].changes[0] }
    });

    expect(result.batches?.[0]?.messages[0]?.providerMessageId).toBe("wamid-1");
    expect(result.batches?.[0]?.threads[0]?.providerThreadId).toBe("phone-1:61400000000");
  });

  it("stores OAuth callback credentials on the connector and queues initial backfill", async () => {
    const env = createEnv();
    const vault = new CredentialVault(env);
    const adapter = {
      provider: "slack",
      connect: vi.fn(),
      handleOAuthCallback: vi.fn(async () => ({
        accountLabel: "Arrayah",
        credential: { accessToken: "xoxb-test", teamId: "T123" },
        providerCursor: { teamId: "T123", channels: {} },
        configPatch: { teamId: "T123" }
      }))
    };
    const prisma = {
      oAuthState: {
        findFirst: vi.fn(async () => ({
          id: "oauth-1",
          orgId: "org-1",
          projectId: "project-1",
          provider: "slack",
          actorUserId: "user-1",
          nonceHash: "hash",
          redirectAfter: null,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null
        })),
        update: vi.fn(async () => undefined)
      },
      communicationConnector: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "connector-1", provider: "slack", status: "connected" })),
        update: vi.fn(async () => ({ id: "connector-1", provider: "slack", status: "connected" }))
      }
    } as any;
    const syncService = {
      enqueueSync: vi.fn(async () => ({ connectorId: "connector-1", syncRunId: "sync-1", queued: true }))
    } as any;

    const service = new ConnectorsService(
      prisma,
      env,
      {} as any,
      { record: vi.fn(async () => undefined) } as any,
      { enqueue: vi.fn(async () => undefined) } as any,
      vault,
      new Map([["slack", adapter as any]]),
      { increment: vi.fn(), observeDuration: vi.fn(), setGauge: vi.fn(), renderPrometheus: vi.fn(() => "") } as any
    );
    service.setSyncService(syncService);

    const statePayload = Buffer.from(
      JSON.stringify({
        nonce: "nonce-1",
        provider: "slack",
        projectId: "project-1",
        issuedAt: Date.now()
      }),
      "utf8"
    ).toString("base64url");
    const cryptoNode = await import("node:crypto");
    const signature = cryptoNode
      .createHmac("sha256", env.CONNECTOR_OAUTH_STATE_SECRET)
      .update(statePayload)
      .digest("hex");

    const result = await service.handleOAuthCallback("slack", {
      code: "oauth-code",
      state: `${statePayload}.${signature}`
    });

    expect(result.connectorId).toBe("connector-1");
    expect(syncService.enqueueSync).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: "connector-1", syncType: "backfill" })
    );
    const storedCredential = await vault.getCredential("slack", "connector-1", "vault:slack:connector-1");
    expect(storedCredential).toEqual(expect.objectContaining({ accessToken: "xoxb-test" }));
  });

  it("returns existing active sync runs and blocks revoked connector syncs", async () => {
    const sync = new SyncService(
      {
        communicationConnector: {
          findFirstOrThrow: vi.fn(async () => ({
            id: "connector-1",
            projectId: "project-1",
            provider: "slack",
            status: "connected",
            providerCursorJson: { channels: {} }
          }))
        },
        communicationSyncRun: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "sync-running" })
            .mockResolvedValueOnce(null),
          create: vi.fn(async () => ({ id: "sync-new" }))
        },
        project: {
          findUniqueOrThrow: vi.fn(async () => ({ orgId: "org-1" }))
        },
        jobRun: {
          upsert: vi.fn(async () => undefined)
        }
      } as any,
      createEnv(),
      { ensureProjectManager: vi.fn(async () => undefined) } as any,
      { record: vi.fn(async () => undefined) } as any,
      { enqueue: vi.fn(async () => undefined) } as any,
      new CredentialVault(createEnv()),
      new Map([["slack", { provider: "slack", sync: vi.fn() } as any]]),
      {} as MessageIngestionService,
      { increment: vi.fn(), observeDuration: vi.fn(), setGauge: vi.fn(), renderPrometheus: vi.fn(() => "") } as any
    );

    const reused = await sync.queueSync("project-1", "connector-1", "user-1", "manual");
    expect(reused).toEqual({ connectorId: "connector-1", syncRunId: "sync-running", queued: false });

    const fresh = await sync.queueSync("project-1", "connector-1", "user-1", "manual");
    expect(fresh).toEqual({ connectorId: "connector-1", syncRunId: "sync-new", queued: true });
  });

  it("returns connector locked partial summaries when another sync run is already active", async () => {
    const prisma = {
      communicationConnector: {
        findFirstOrThrow: vi.fn(async () => ({
          id: "connector-1",
          projectId: "project-1",
          provider: "slack",
          status: "connected",
          credentialsRef: "vault:slack:connector-1",
          providerCursorJson: {}
        })),
        update: vi.fn(async () => undefined)
      },
      communicationSyncRun: {
        findFirst: vi.fn(async () => ({ id: "sync-running" })),
        update: vi.fn(async () => undefined)
      },
      jobRun: {
        upsert: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined)
      }
    } as any;

    const sync = new SyncService(
      prisma,
      createEnv(),
      {} as any,
      { record: vi.fn(async () => undefined) } as any,
      { enqueue: vi.fn(async () => undefined) } as any,
      new CredentialVault(createEnv()),
      new Map([["slack", { provider: "slack", sync: vi.fn() } as any]]),
      {} as MessageIngestionService,
      { increment: vi.fn(), observeDuration: vi.fn(), setGauge: vi.fn(), renderPrometheus: vi.fn(() => "") } as any
    );

    const result = await sync.runSyncJob({
      connectorId: "connector-1",
      projectId: "project-1",
      syncType: "manual",
      syncRunId: "sync-new",
      idempotencyKey: "sync:connector-1"
    });

    expect(result).toEqual(
      expect.objectContaining({
        skipped: true,
        reason: "connector_locked",
        competingSyncRunId: "sync-running"
      })
    );
  });

  it("retries provider sync on rate limits before succeeding", async () => {
    const env = createEnv();
    const telemetry = { increment: vi.fn(), observeDuration: vi.fn(), setGauge: vi.fn(), renderPrometheus: vi.fn(() => "") } as any;
    const vault = new CredentialVault(env);
    await vault.putCredential({
      provider: "slack",
      connectorId: "connector-1",
      credential: { accessToken: "xoxb-test" }
    });

    const adapter = {
      provider: "slack",
      sync: vi
        .fn()
        .mockRejectedValueOnce(
          new AppError(429, "Rate limited", "communication_provider_rate_limited", { retryAfterMs: 1 })
        )
        .mockResolvedValueOnce({
          queued: false,
          batches: [],
          summary: {}
        })
    };

    const prisma = {
      communicationConnector: {
        findFirstOrThrow: vi.fn(async () => ({
          id: "connector-1",
          projectId: "project-1",
          provider: "slack",
          status: "connected",
          credentialsRef: "vault:slack:connector-1",
          providerCursorJson: {}
        })),
        update: vi.fn(async () => undefined)
      },
      communicationSyncRun: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async () => undefined)
      },
      project: {
        findUniqueOrThrow: vi.fn(async () => ({ orgId: "org-1" }))
      },
      jobRun: {
        upsert: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined)
      }
    } as any;

    const sync = new SyncService(
      prisma,
      env,
      {} as any,
      { record: vi.fn(async () => undefined) } as any,
      { enqueue: vi.fn(async () => undefined) } as any,
      vault,
      new Map([["slack", adapter as any]]),
      {
        ingestNormalizedBatch: vi.fn(async () => ({
          createdMessageCount: 0,
          updatedRevisionCount: 0,
          indexedMessageCount: 0
        }))
      } as any,
      telemetry
    );

    await sync.runSyncJob({
      connectorId: "connector-1",
      projectId: "project-1",
      syncType: "incremental",
      syncRunId: "sync-1",
      idempotencyKey: "sync:connector-1"
    });

    expect(adapter.sync).toHaveBeenCalledTimes(2);
    expect(telemetry.increment).toHaveBeenCalledWith("communication_provider_rate_limited_total", {
      provider: "slack"
    });
  });
});
