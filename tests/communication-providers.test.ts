import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialVault } from "../src/lib/communications/credential-vault.js";
import { SlackProvider } from "../src/modules/communications/providers/slack.provider.js";
import { GmailProvider } from "../src/modules/communications/providers/gmail.provider.js";
import { ConnectorsService } from "../src/modules/communications/connectors.service.js";
import { SyncService } from "../src/modules/communications/sync.service.js";
import { MessageIngestionService } from "../src/modules/communications/message-ingestion.service.js";

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
      new Map([["slack", adapter as any]])
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
      new Map(),
      {} as MessageIngestionService
    );

    const reused = await sync.queueSync("project-1", "connector-1", "user-1", "manual");
    expect(reused).toEqual({ connectorId: "connector-1", syncRunId: "sync-running", queued: false });

    const fresh = await sync.queueSync("project-1", "connector-1", "user-1", "manual");
    expect(fresh).toEqual({ connectorId: "connector-1", syncRunId: "sync-new", queued: true });
  });
});
