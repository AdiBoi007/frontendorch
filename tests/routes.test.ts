import jwt from "jsonwebtoken";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app/build-app.js";
import type { AppContext } from "../src/types/index.js";

function createToken(role: "manager" | "dev" | "client") {
  return jwt.sign(
    {
      userId: "user-1",
      orgId: "org-1",
      workspaceRoleDefault: role,
      globalRole: "owner"
    },
    "test-access-secret"
  );
}

function createContext() {
  const authService = {
    signup: vi.fn(async () => ({
      user: {
        id: "user-1",
        orgId: "org-1",
        email: "manager@example.com",
        displayName: "Manager",
        globalRole: "owner",
        workspaceRoleDefault: "manager"
      },
      accessToken: "access",
      refreshToken: "refresh"
    })),
    login: vi.fn(async () => ({
      user: {
        id: "user-1",
        orgId: "org-1",
        email: "manager@example.com",
        displayName: "Manager",
        globalRole: "owner",
        workspaceRoleDefault: "manager"
      },
      accessToken: "access",
      refreshToken: "refresh"
    })),
    refresh: vi.fn(async () => ({ accessToken: "access-2", refreshToken: "refresh-2" })),
    logout: vi.fn(async () => undefined),
    getMe: vi.fn(async () => ({ id: "user-1", orgId: "org-1" }))
  };

  const projectService = {
    createProject: vi.fn(async () => ({ id: "project-1", name: "Project" })),
    listProjects: vi.fn(async () => [{ id: "project-1" }]),
    getProject: vi.fn(async () => ({ id: "project-1" })),
    getMembers: vi.fn(async () => ({ members: [], summary: { headcount: 0, roleSummary: {} } }))
  };

  const documentService = {
    uploadFile: vi.fn(async () => ({ documentId: "doc-1", documentVersionId: "ver-1", status: "pending" })),
    listDocuments: vi.fn(async () => [{ id: "doc-1" }]),
    getDocument: vi.fn(async () => ({ id: "doc-1" })),
    getViewerPayload: vi.fn(async () => ({
      document: { id: "doc-1", title: "Core PRD", kind: "prd", currentVersionId: "ver-1" },
      version: { id: "ver-1", status: "ready" },
      sections: [{ sectionId: "sec-1", anchorId: "overview-1", text: "Hello", changeMarkers: [] }]
    })),
    getAnchor: vi.fn(async () => ({ section: { anchorId: "overview-1" } })),
    reprocess: vi.fn(async () => ({ ok: true }))
  };

  const brainService = {
    rebuild: vi.fn(async () => ({ queued: true })),
    getCurrentBrain: vi.fn(async () => ({ currentBrain: { id: "brain-1" } })),
    getBrainVersions: vi.fn(async () => [{ id: "brain-1", versionNumber: 1 }]),
    getCurrentGraph: vi.fn(async () => ({ artifact: { id: "graph-1" }, nodes: [], edges: [] }))
  };

  const changeProposalService = {
    list: vi.fn(async () => [{ id: "proposal-1" }]),
    create: vi.fn(async () => ({ id: "proposal-1", status: "needs_review" })),
    get: vi.fn(async () => ({ id: "proposal-1" })),
    accept: vi.fn(async () => ({ id: "proposal-1", status: "accepted" })),
    reject: vi.fn(async () => ({ id: "proposal-1", status: "rejected" })),
    applyAcceptedProposal: vi.fn(async () => undefined)
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
      RETRIEVAL_ACCEPTED_TRUTH_BOOST: 1.2
    },
    logger: pino({ enabled: false }),
    prisma: {} as any,
    storage: {} as any,
    generationProvider: {} as any,
    embeddingProvider: {} as any,
    jobs: { enqueue: vi.fn() },
    services: {
      authService,
      projectService,
      documentService,
      brainService,
      changeProposalService,
      auditService: { record: vi.fn() }
    }
  } as unknown as AppContext;
}

describe("route contracts", () => {
  const context = createContext();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(context);
  });

  afterAll(async () => {
    await app.close();
  });

  it("supports auth signup route", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        orgName: "Org",
        email: "manager@example.com",
        password: "Password123!",
        displayName: "Manager"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(context.services.authService.signup).toHaveBeenCalled();
  });

  it("enforces manager-only project creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      },
      payload: {
        name: "Project"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(context.services.projectService.createProject).toHaveBeenCalled();
  });

  it("returns viewer payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/documents/3322717f-2c10-4239-b525-6fbc9158f4fb/view",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.document.id).toBe("doc-1");
  });

  it("rejects dev users from manager-only change acceptance", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/change-proposals/3322717f-2c10-4239-b525-6fbc9158f4fb/accept",
      headers: {
        authorization: `Bearer ${createToken("dev")}`
      }
    });

    expect(response.statusCode).toBe(403);
  });
});
