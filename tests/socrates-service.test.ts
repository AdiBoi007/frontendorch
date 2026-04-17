/**
 * Service-level unit tests for SocratesService.
 *
 * Uses fully mocked Prisma and providers to test:
 * - suggestion invalidation on patchContext
 * - getSuggestions returns cached when not expired
 * - getSuggestions generates fresh when cache is absent
 * - precomputeSuggestions skips for non-existent session
 * - streamAnswer rejects when ANTHROPIC_API_KEY is missing
 */

import { describe, expect, it, vi } from "vitest";
import { SocratesService } from "../src/modules/socrates/service.js";
import type { AppEnv } from "../src/config/env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ORG_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function makeBaseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    projectId: PROJECT_ID,
    userId: USER_ID,
    pageContext: "brain_overview",
    selectedRefType: null,
    selectedRefId: null,
    viewerStateJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEnv(overrides: Partial<AppEnv> = {}): AppEnv {
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
    ANTHROPIC_MODEL_REASONING: "mock",
    OPENAI_EMBEDDING_MODEL: "mock",
    RETRIEVAL_TOP_K: 8,
    RETRIEVAL_MIN_SCORE: 0.2,
    RETRIEVAL_USE_HYBRID: true,
    RETRIEVAL_DOC_WEIGHT: 1,
    RETRIEVAL_COMM_WEIGHT: 0.8,
    RETRIEVAL_ACCEPTED_TRUTH_BOOST: 1.2,
    ...overrides,
  } as AppEnv;
}

// Use a simpler mock factory: build plain object with vi.fn() and cast to any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeService(envOverrides: Partial<AppEnv> = {}) {
  const prismaSessionFindFirst = vi.fn<AnyFn>();
  const prismaSessionUpdate = vi.fn<AnyFn>();
  const prismaSessionCreate = vi.fn<AnyFn>();
  const prismaSuggestionFindFirst = vi.fn<AnyFn>();
  const prismaSuggestionCreate = vi.fn<AnyFn>();
  const prismaSuggestionDeleteMany = vi.fn<AnyFn>();
  const prismaMessageCreate = vi.fn<AnyFn>();
  const prismaMessageUpdate = vi.fn<AnyFn>();
  const prismaMessageFindMany = vi.fn<AnyFn>();
  const prismaMemberFindFirst = vi.fn<AnyFn>();
  const prismaProjectFindUnique = vi.fn<AnyFn>();
  const prismaProjectFindUniqueOrThrow = vi.fn<AnyFn>();
  const prismaDocumentFindFirst = vi.fn<AnyFn>();
  const prismaDocumentVersionFindFirst = vi.fn<AnyFn>();
  const prismaDocumentSectionFindFirst = vi.fn<AnyFn>();
  const prismaDocumentSectionFindMany = vi.fn<AnyFn>();
  const prismaBrainNodeFindFirst = vi.fn<AnyFn>();
  const prismaBrainSectionLinkFindMany = vi.fn<AnyFn>();
  const prismaChangeProposalFindFirst = vi.fn<AnyFn>();
  const prismaDecisionRecordFindFirst = vi.fn<AnyFn>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    socratesSession: {
      findFirst: prismaSessionFindFirst,
      update: prismaSessionUpdate,
      create: prismaSessionCreate,
    },
    socratesSuggestion: {
      findFirst: prismaSuggestionFindFirst,
      create: prismaSuggestionCreate,
      deleteMany: prismaSuggestionDeleteMany,
    },
    socratesMessage: {
      create: prismaMessageCreate,
      update: prismaMessageUpdate,
      findMany: prismaMessageFindMany,
    },
    projectMember: { findFirst: prismaMemberFindFirst },
    project: {
      findUnique: prismaProjectFindUnique,
      findUniqueOrThrow: prismaProjectFindUniqueOrThrow,
    },
    document: { findFirst: prismaDocumentFindFirst },
    documentVersion: { findFirst: prismaDocumentVersionFindFirst },
    documentSection: {
      findFirst: prismaDocumentSectionFindFirst,
      findMany: prismaDocumentSectionFindMany,
    },
    brainNode: { findFirst: prismaBrainNodeFindFirst },
    brainSectionLink: { findMany: prismaBrainSectionLinkFindMany },
    specChangeProposal: { findFirst: prismaChangeProposalFindFirst },
    decisionRecord: { findFirst: prismaDecisionRecordFindFirst },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generationProvider: any = {
    generateObject: vi.fn(async ({ fallback }: { fallback: () => unknown }) => fallback()),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embeddingProvider: any = {
    embedText: vi.fn(async () => new Array(1536).fill(0.1) as number[]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectService: any = {
    ensureProjectAccess: vi.fn(async () => ({ projectRole: "manager", isActive: true })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditService: any = { record: vi.fn() };

  const service = new SocratesService(
    prisma,
    makeEnv(envOverrides),
    generationProvider,
    embeddingProvider,
    projectService,
    auditService
  );

  return {
    service,
    prismaSessionFindFirst,
    prismaSessionUpdate,
    prismaSuggestionFindFirst,
    prismaSuggestionCreate,
    prismaSuggestionDeleteMany,
    prismaMemberFindFirst,
    prismaProjectFindUnique,
    prismaDocumentFindFirst,
    prismaDocumentVersionFindFirst,
    prismaDocumentSectionFindFirst,
    prismaDocumentSectionFindMany,
    prismaBrainNodeFindFirst,
    prismaBrainSectionLinkFindMany,
    prismaChangeProposalFindFirst,
    prismaDecisionRecordFindFirst,
    generationProvider,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SocratesService.patchContext – suggestion invalidation", () => {
  it("invalidates suggestions when pageContext changes", async () => {
    const { service, prismaSessionFindFirst, prismaSessionUpdate, prismaSuggestionDeleteMany } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession({ pageContext: "brain_overview" }));
    prismaSessionUpdate.mockResolvedValue(makeBaseSession({ pageContext: "doc_viewer" }));

    await service.patchContext(PROJECT_ID, SESSION_ID, USER_ID, { pageContext: "doc_viewer" });

    expect(prismaSuggestionDeleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION_ID } });
  });

  it("invalidates suggestions when selectedRefId changes", async () => {
    const {
      service,
      prismaSessionFindFirst,
      prismaSessionUpdate,
      prismaSuggestionDeleteMany,
      prismaBrainNodeFindFirst,
    } = makeService();
    const newRefId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession());
    prismaBrainNodeFindFirst.mockResolvedValue({ id: newRefId, projectId: PROJECT_ID });
    prismaSessionUpdate.mockResolvedValue(
      makeBaseSession({ selectedRefType: "brain_node", selectedRefId: newRefId })
    );

    await service.patchContext(PROJECT_ID, SESSION_ID, USER_ID, {
      selectedRefType: "brain_node",
      selectedRefId: newRefId,
    });

    expect(prismaSuggestionDeleteMany).toHaveBeenCalled();
  });

  it("does NOT invalidate when only viewerState changes (no page/ref change)", async () => {
    const {
      service,
      prismaSessionFindFirst,
      prismaSessionUpdate,
      prismaSuggestionDeleteMany,
      prismaDocumentSectionFindMany,
    } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession());
    prismaSessionUpdate.mockResolvedValue(makeBaseSession());
    prismaDocumentSectionFindMany.mockResolvedValue([
      {
        id: "sec-1",
        parseRevision: 1,
        documentVersion: {
          parseRevision: 1,
          document: {
            visibility: "internal"
          }
        }
      }
    ]);

    await service.patchContext(PROJECT_ID, SESSION_ID, USER_ID, {
      viewerState: { anchorId: "anchor-1", pageNumber: 3 },
    });

    expect(prismaSuggestionDeleteMany).not.toHaveBeenCalled();
  });
});

describe("SocratesService.getSuggestions", () => {
  it("returns cached suggestions when cache is fresh", async () => {
    const { service, prismaSessionFindFirst, prismaSuggestionFindFirst, prismaSuggestionCreate } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession());
    prismaSuggestionFindFirst.mockResolvedValue({
      id: "sug-1",
      suggestionsJson: { suggestions: ["Cached suggestion 1", "Cached suggestion 2"] },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.getSuggestions(PROJECT_ID, SESSION_ID, USER_ID);

    expect(result.cached).toBe(true);
    expect(result.suggestions).toEqual(["Cached suggestion 1", "Cached suggestion 2"]);
    expect(prismaSuggestionCreate).not.toHaveBeenCalled();
  });

  it("generates fresh suggestions when cache is absent", async () => {
    const { service, prismaSessionFindFirst, prismaSuggestionFindFirst, prismaSuggestionCreate, prismaProjectFindUnique } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession());
    prismaSuggestionFindFirst.mockResolvedValue(null);
    prismaProjectFindUnique.mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID, name: "My Project" });
    prismaSuggestionCreate.mockResolvedValue({});

    const result = await service.getSuggestions(PROJECT_ID, SESSION_ID, USER_ID);

    expect(result.cached).toBe(false);
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(prismaSuggestionCreate).toHaveBeenCalled();
  });
});

describe("SocratesService.precomputeSuggestions", () => {
  it("does nothing when session does not exist", async () => {
    const { service, prismaSessionFindFirst, prismaSuggestionCreate } = makeService();
    prismaSessionFindFirst.mockResolvedValue(null);

    await expect(service.precomputeSuggestions(PROJECT_ID, SESSION_ID)).resolves.toBeUndefined();
    expect(prismaSuggestionCreate).not.toHaveBeenCalled();
  });

  it("does nothing when user is no longer a project member", async () => {
    const { service, prismaSessionFindFirst, prismaMemberFindFirst, prismaSuggestionCreate } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession());
    prismaMemberFindFirst.mockResolvedValue(null);

    await expect(service.precomputeSuggestions(PROJECT_ID, SESSION_ID)).resolves.toBeUndefined();
    expect(prismaSuggestionCreate).not.toHaveBeenCalled();
  });
});

describe("SocratesService.streamAnswer – API key guard", () => {
  it("throws 503 immediately when ANTHROPIC_API_KEY is not configured", async () => {
    const { service } = makeService({ ANTHROPIC_API_KEY: undefined });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reply: any = { raw: { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() } };

    await expect(
      service.streamAnswer(PROJECT_ID, SESSION_ID, USER_ID, "What changed?", reply)
    ).rejects.toMatchObject({ code: "ai_provider_not_configured" });
  });
});

describe("SocratesService session ownership and selected-ref validation", () => {
  it("rejects access to another user's session even if the caller is a project member", async () => {
    const { service, prismaSessionFindFirst } = makeService();
    prismaSessionFindFirst.mockResolvedValue(makeBaseSession({ userId: "someone-else" }));

    await expect(service.getSuggestions(PROJECT_ID, SESSION_ID, USER_ID)).rejects.toMatchObject({
      code: "socrates_session_access_denied",
      statusCode: 403,
    });
  });

  it("rejects createSession when the selected document section does not belong to the project", async () => {
    const { service, prismaDocumentSectionFindFirst } = makeService();
    prismaDocumentSectionFindFirst.mockResolvedValue(null);

    await expect(
      service.createSession(PROJECT_ID, USER_ID, {
        pageContext: "doc_viewer",
        selectedRefType: "document_section",
        selectedRefId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      })
    ).rejects.toMatchObject({
      code: "invalid_selected_ref",
      statusCode: 422,
    });
  });
});
