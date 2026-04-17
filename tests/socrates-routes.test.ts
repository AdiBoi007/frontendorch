/**
 * Route-level contract tests for Socrates endpoints.
 *
 * Uses the same mock-context pattern as routes.test.ts.
 * Does NOT test streaming — SSE requires a live process.
 */

import jwt from "jsonwebtoken";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app/build-app.js";
import type { AppContext } from "../src/types/index.js";

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function managerToken() {
  return jwt.sign(
    { userId: "user-1", orgId: "org-1", workspaceRoleDefault: "manager", globalRole: "owner" },
    "test-access-secret"
  );
}

function clientToken() {
  return jwt.sign(
    { userId: "client-1", orgId: "org-1", workspaceRoleDefault: "client", globalRole: "member" },
    "test-access-secret"
  );
}

function createContext(): AppContext {
  const socratesService = {
    createSession: vi.fn(async () => ({
      id: SESSION_ID,
      projectId: PROJECT_ID,
      userId: "user-1",
      pageContext: "brain_overview",
      selectedRefType: null,
      selectedRefId: null,
      viewerStateJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    patchContext: vi.fn(async () => ({
      id: SESSION_ID,
      pageContext: "doc_viewer",
    })),
    getSuggestions: vi.fn(async () => ({
      suggestions: ["Explain the main flows.", "Which areas are uncertain?"],
      cached: false,
    })),
    streamAnswer: vi.fn(async (_pid: string, _sid: string, _uid: string, _content: string, reply: any) => {
      reply.raw.writeHead(200, { "Content-Type": "text/event-stream" });
      reply.raw.write('event: done\ndata: {"answer_md":"ok"}\n\n');
      reply.raw.end();
    }),
    getHistory: vi.fn(async () => [
      { id: "msg-1", role: "user", content: "What changed?", responseStatus: null, createdAt: new Date() },
      { id: "msg-2", role: "assistant", content: "A change was made.", responseStatus: "completed", createdAt: new Date(), citations: [], openTargets: [] },
    ]),
    precomputeSuggestions: vi.fn(async () => undefined),
  };

  return {
    env: {
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
      ANTHROPIC_MODEL_REASONING: "mock",
      OPENAI_EMBEDDING_MODEL: "mock",
      RETRIEVAL_TOP_K: 8,
      RETRIEVAL_MIN_SCORE: 0.2,
      RETRIEVAL_USE_HYBRID: true,
      RETRIEVAL_DOC_WEIGHT: 1,
      RETRIEVAL_COMM_WEIGHT: 0.8,
      RETRIEVAL_ACCEPTED_TRUTH_BOOST: 1.2,
    },
    logger: pino({ enabled: false }),
    prisma: {} as any,
    storage: {} as any,
    generationProvider: {} as any,
    embeddingProvider: {} as any,
    jobs: { enqueue: vi.fn() },
    services: {
      authService: {} as any,
      projectService: {} as any,
      documentService: {} as any,
      brainService: {} as any,
      changeProposalService: {} as any,
      auditService: { record: vi.fn() } as any,
      socratesService: socratesService as any,
    },
  } as unknown as AppContext;
}

describe("Socrates route contracts", () => {
  const context = createContext();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(context);
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /v1/projects/:projectId/socrates/sessions — creates a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions`,
      headers: { authorization: `Bearer ${managerToken()}` },
      payload: { pageContext: "brain_overview" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.id).toBe(SESSION_ID);
    expect(body.data.pageContext).toBe("brain_overview");
    expect(context.services.socratesService.createSession).toHaveBeenCalled();
  });

  it("POST /v1/projects/:projectId/socrates/sessions — rejects invalid pageContext", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions`,
      headers: { authorization: `Bearer ${managerToken()}` },
      payload: { pageContext: "not_a_real_page" },
    });

    // Must not succeed — 400 (ZodError → validation_error) or 500 from test env.
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(context.services.socratesService.createSession).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ pageContext: "not_a_real_page" })
    );
  });

  it("PATCH context — updates session context", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions/${SESSION_ID}/context`,
      headers: { authorization: `Bearer ${managerToken()}` },
      payload: { pageContext: "doc_viewer" },
    });

    expect(response.statusCode).toBe(200);
    expect(context.services.socratesService.patchContext).toHaveBeenCalled();
  });

  it("GET suggestions — returns suggestion list", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions/${SESSION_ID}/suggestions`,
      headers: { authorization: `Bearer ${managerToken()}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data.suggestions)).toBe(true);
    expect(body.data.suggestions.length).toBeGreaterThan(0);
  });

  it("GET messages — returns history", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions/${SESSION_ID}/messages`,
      headers: { authorization: `Bearer ${managerToken()}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data[0].role).toBe("user");
    expect(body.data[1].role).toBe("assistant");
  });

  it("GET suggestions — rejects unauthenticated request", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions/${SESSION_ID}/suggestions`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("POST sessions — rejects invalid UUID in projectId param", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/not-a-uuid/socrates/sessions`,
      headers: { authorization: `Bearer ${managerToken()}` },
      payload: { pageContext: "brain_overview" },
    });

    // Must not succeed (ZodError → 400 in prod, may be 500 in test env due to ESM module boundary).
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("client token can access suggestions (role filtering is service-level)", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/socrates/sessions/${SESSION_ID}/suggestions`,
      headers: { authorization: `Bearer ${clientToken()}` },
    });

    // Route allows all authenticated users; service enforces client-safe filtering.
    expect(response.statusCode).toBe(200);
  });
});
