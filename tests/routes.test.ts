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
    listDocuments: vi.fn(async () => ({
      items: [{ id: "doc-1" }],
      meta: { page: 1, pageSize: 25, totalCount: 1, totalPages: 1, hasMore: false }
    })),
    getDocument: vi.fn(async () => ({
      id: "doc-1",
      currentVersion: { id: "ver-1", status: "ready", isCurrent: true },
      versions: [{ id: "ver-1", status: "ready", isCurrent: true }]
    })),
    getViewerPayload: vi.fn(async () => ({
      document: { id: "doc-1", title: "Core PRD", kind: "prd", currentVersionId: "ver-1" },
      version: { id: "ver-1", status: "ready" },
      viewerState: { documentId: "doc-1", documentVersionId: "ver-1", anchorId: "overview-1", pageNumber: 1 },
      selected: { source: "anchor", documentId: "doc-1", documentVersionId: "ver-1", sectionId: "sec-1", anchorId: "overview-1", pageNumber: 1, chunkId: null },
      highlight: null,
      sections: [{ sectionId: "sec-1", anchorId: "overview-1", text: "Hello", changeMarkers: [] }],
      meta: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1, hasMore: false }
    })),
    getAnchor: vi.fn(async () => ({
      viewerState: { documentId: "doc-1", documentVersionId: "ver-1", anchorId: "overview-1", pageNumber: 1 },
      selected: { source: "anchor", documentId: "doc-1", documentVersionId: "ver-1", sectionId: "sec-1", anchorId: "overview-1", pageNumber: 1, chunkId: null },
      section: { anchorId: "overview-1" }
    })),
    searchDocument: vi.fn(async () => ({
      items: [{ sectionId: "sec-1", anchorId: "overview-1", snippet: "hello", openTarget: { targetType: "document_section", targetRef: { documentId: "doc-1", documentVersionId: "ver-1", anchorId: "overview-1" } } }],
      meta: { query: "hello", count: 1, versionId: "ver-1", limited: false }
    })),
    getAnchorProvenance: vi.fn(async () => ({
      selectedSection: { anchorId: "overview-1", hasCurrentTruthOverlay: true, currentTruthSummary: ["Updated by accepted change"] },
      supportingSections: [],
      linkedChanges: [],
      linkedBrainNodes: [],
      linkedDecisions: [],
      linkedMessageRefs: [],
      currentTruth: { differsFromSource: true, summaries: ["Updated by accepted change"] },
      openTargets: { selectedSection: { targetType: "document_section", targetRef: { documentId: "doc-1", documentVersionId: "ver-1", anchorId: "overview-1" } }, supportingSections: [] }
    })),
    getMessageEvidence: vi.fn(async () => ({
      message: { id: "msg-1", threadId: "thread-1", bodyText: "Need this change" },
      thread: { id: "thread-1", subject: "Client request" },
      linkedDocuments: [{ sectionId: "sec-1", anchorId: "overview-1" }],
      linkedChanges: [],
      linkedDecisions: [],
      openTargets: { thread: { targetType: "thread", targetRef: { threadId: "thread-1" } }, documents: [] }
    })),
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

  const dashboardService = {
    getGeneralDashboard: vi.fn(async () => ({
      scope: "general",
      summary: { activeProjectCount: 1, orgHeadcount: 2, projectsNeedingAttention: [] }
    })),
    getProjectDashboard: vi.fn(async () => ({
      scope: "project",
      project: { id: "project-1", orgId: "org-1", name: "Project", slug: "project" },
      teamSummary: { headcount: 1, roleBreakdown: { manager: 1 }, members: [], workload: { label: "healthy", overloadedCount: 0, watchCount: 0, unknownCount: 0 } },
      documents: { totalCount: 1, readinessState: "ready", counts: { pending: 0, processing: 0, ready: 1, partial: 0, failed: 0 }, latestProcessedAt: null, documents: [] },
      brain: { freshnessState: "current", latestVersionId: "brain-1", latestVersionNumber: 1, acceptedAt: null, latestAcceptedChangeAt: null, latestAcceptedDecisionAt: null },
      changes: { pendingCount: 0, acceptedRecentCount: 0, latestAcceptedAt: null, pendingSummaries: [], recentAccepted: [] },
      decisions: { openCount: 0, latestAcceptedAt: null, openItems: [] },
      attention: { score: 0, label: "healthy", reasons: [] },
      quickLinks: { dashboardPath: "/projects/project-1/dashboard", brainPath: "/projects/project-1/brain/current", documentsPath: "/projects/project-1/documents", docViewerPath: null, docViewerState: null, brainViewerState: { pageContext: "dashboard_project", selectedRefType: "dashboard_scope", selectedRefId: "project-1" } },
      recentActivity: { latestAcceptedChangeAt: null, latestDecisionAt: null, latestDocumentProcessedAt: null }
    })),
    getProjectTeamSummary: vi.fn(async () => ({
      headcount: 2,
      roleBreakdown: { manager: 1, dev: 1 },
      members: [],
      workload: { label: "watch", overloadedCount: 0, watchCount: 1, unknownCount: 0 }
    })),
    refreshProjectDashboard: vi.fn(async () => ({
      queued: false,
      scope: "project",
      snapshotId: "snap-1",
      computedAt: new Date("2026-01-01T00:00:00.000Z").toISOString()
    })),
    refreshSnapshotJob: vi.fn(async () => undefined)
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
      OPENAI_TRANSCRIPTION_MODEL: "mock-transcribe",
      OPENAI_EMBEDDING_MODEL: "mock",
      RETRIEVAL_TOP_K: 8,
      RETRIEVAL_MIN_SCORE: 0.2,
      RETRIEVAL_USE_HYBRID: true,
      RETRIEVAL_DOC_WEIGHT: 1,
      RETRIEVAL_COMM_WEIGHT: 0.8,
      RETRIEVAL_ACCEPTED_TRUTH_BOOST: 1.2,
      METRICS_TOKEN: undefined
    },
    logger: pino({ enabled: false }),
    prisma: {} as any,
    storage: {} as any,
    generationProvider: {} as any,
    embeddingProvider: {} as any,
    transcriptionProvider: {} as any,
    jobs: { enqueue: vi.fn() },
    telemetry: {
      increment: vi.fn(),
      observeDuration: vi.fn(),
      setGauge: vi.fn(),
      renderPrometheus: vi.fn(() => "")
    } as any,
    services: {
      authService,
      projectService,
      documentService,
      brainService,
      changeProposalService,
      auditService: { record: vi.fn() },
      dashboardService
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

  it("lists documents with pagination metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/documents?page=2&pageSize=10",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().meta).toMatchObject({
      page: 1,
      pageSize: 25,
      totalCount: 1
    });
    expect(context.services.documentService.listDocuments).toHaveBeenCalledWith(
      "37e6d602-cc1b-4cc9-bc6c-5547241fbf90",
      "user-1",
      { page: 2, pageSize: 10 }
    );
  });

  it("supports document search", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/documents/3322717f-2c10-4239-b525-6fbc9158f4fb/search?q=hello&limit=5",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].anchorId).toBe("overview-1");
    expect(context.services.documentService.searchDocument).toHaveBeenCalledWith(
      "37e6d602-cc1b-4cc9-bc6c-5547241fbf90",
      "3322717f-2c10-4239-b525-6fbc9158f4fb",
      "user-1",
      { q: "hello", limit: 5 }
    );
  });

  it("supports anchor provenance lookup", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/documents/3322717f-2c10-4239-b525-6fbc9158f4fb/anchors/overview-1/provenance",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.currentTruth.differsFromSource).toBe(true);
    expect(context.services.documentService.getAnchorProvenance).toHaveBeenCalled();
  });

  it("rejects ambiguous viewer target selectors", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/documents/3322717f-2c10-4239-b525-6fbc9158f4fb/view?anchorId=overview-1&sectionId=3322717f-2c10-4239-b525-6fbc9158f4fb",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(context.services.documentService.getViewerPayload).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        anchorId: "overview-1",
        sectionId: "3322717f-2c10-4239-b525-6fbc9158f4fb"
      })
    );
  });

  it("serves message evidence only for internal roles", async () => {
    const managerResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/messages/3322717f-2c10-4239-b525-6fbc9158f4fb",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(managerResponse.statusCode).toBe(200);
    expect(managerResponse.json().data.message.id).toBe("msg-1");

    const clientResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/messages/3322717f-2c10-4239-b525-6fbc9158f4fb",
      headers: {
        authorization: `Bearer ${createToken("client")}`
      }
    });

    expect(clientResponse.statusCode).toBe(403);
  });

  it("blocks clients from raw change proposal detail routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/change-proposals/3322717f-2c10-4239-b525-6fbc9158f4fb",
      headers: {
        authorization: `Bearer ${createToken("client")}`
      }
    });

    expect(response.statusCode).toBe(403);
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

  it("serves metrics when the token matches", async () => {
    context.env.METRICS_TOKEN = "metrics-secret";
    context.telemetry.renderPrometheus = vi.fn(() => "orchestra_http_requests_total 5");

    const response = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: {
        "x-metrics-token": "metrics-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("orchestra_http_requests_total");
  });

  it("serves the general dashboard to managers only", async () => {
    const managerResponse = await app.inject({
      method: "GET",
      url: "/v1/dashboard/general",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(managerResponse.statusCode).toBe(200);
    expect(context.services.dashboardService.getGeneralDashboard).toHaveBeenCalledWith({
      orgId: "org-1",
      actorUserId: "user-1",
      forceRefresh: false
    });

    const devResponse = await app.inject({
      method: "GET",
      url: "/v1/dashboard/general",
      headers: {
        authorization: `Bearer ${createToken("dev")}`
      }
    });

    expect(devResponse.statusCode).toBe(403);
  });

  it("serves project dashboard and team summary", async () => {
    const dashboardResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/dashboard?forceRefresh=true",
      headers: {
        authorization: `Bearer ${createToken("dev")}`
      }
    });

    expect(dashboardResponse.statusCode).toBe(200);
    expect(context.services.dashboardService.getProjectDashboard).toHaveBeenCalledWith(
      "37e6d602-cc1b-4cc9-bc6c-5547241fbf90",
      "user-1",
      { forceRefresh: true }
    );

    const teamResponse = await app.inject({
      method: "GET",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/team-summary",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(teamResponse.statusCode).toBe(200);
    expect(teamResponse.json().data.headcount).toBe(2);
  });

  it("enforces manager-only dashboard refresh", async () => {
    const managerResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/dashboard/refresh",
      headers: {
        authorization: `Bearer ${createToken("manager")}`
      }
    });

    expect(managerResponse.statusCode).toBe(200);
    expect(context.services.dashboardService.refreshProjectDashboard).toHaveBeenCalled();

    const devResponse = await app.inject({
      method: "POST",
      url: "/v1/projects/37e6d602-cc1b-4cc9-bc6c-5547241fbf90/dashboard/refresh",
      headers: {
        authorization: `Bearer ${createToken("dev")}`
      }
    });

    expect(devResponse.statusCode).toBe(403);
  });
});
