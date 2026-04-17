import { describe, expect, it, vi } from "vitest";
import { BrainService } from "../src/modules/brain/service.js";

describe("BrainService", () => {
  it("returns unresolved areas and accepted decisions in the current brain read model", async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "brain-1",
            versionNumber: 3,
            payloadJson: {
              whatTheProductIs: "A product brain",
              whoItIsFor: ["Managers"],
              mainFlows: ["Ingest docs"],
              modules: ["Upload"],
              constraints: ["Immutable sources"],
              integrations: [],
              unresolvedAreas: ["Open client decision"],
              acceptedDecisions: [],
              recentAcceptedChanges: [],
              evidenceRefs: []
            },
            sourceRefsJson: [],
            acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z")
          })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
      },
      document: {
        findMany: vi.fn().mockResolvedValue([])
      },
      decisionRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "decision-1",
            title: "Keep managers as approvers",
            statement: "Managers remain the only truth approvers",
            status: "accepted"
          }
        ])
      },
      specChangeProposal: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const service = new BrainService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any
    );

    const result = await service.getCurrentBrain("project-1", "user-1");

    expect(result.unresolvedAreas).toEqual(["Open client decision"]);
    expect(result.acceptedDecisions[0]).toMatchObject({
      id: "decision-1",
      title: "Keep managers as approvers"
    });
  });

  it("invalidates Socrates suggestions when a new accepted artifact version is created", async () => {
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      artifactVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "source-1",
            payloadJson: {
              projectSummary: "Product source",
              actors: ["Manager"],
              features: ["Upload"],
              constraints: [],
              integrations: [],
              contradictions: [],
              unknowns: [],
              risks: [],
              sourceConfidence: 0.8,
              evidenceRefs: []
            }
          })
          .mockResolvedValueOnce({
            id: "clarified-1",
            payloadJson: {
              summary: "Clarified truth",
              targetUsers: ["Manager"],
              flows: ["Upload"],
              scope: ["Upload"],
              constraints: [],
              integrations: [],
              unresolvedDecisions: [],
              assumptions: [],
              risks: [],
              evidenceRefs: []
            }
          })
          .mockResolvedValueOnce({
            id: "graph-1",
            payloadJson: {
              nodes: [],
              edges: [],
              criticalPaths: [],
              riskyAreas: [],
              unresolvedAreas: []
            }
          })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: "old-brain", versionNumber: 2, changeSummary: "old" })
      },
      specChangeProposal: {
        findMany: vi.fn().mockResolvedValue([])
      },
      decisionRecord: {
        findMany: vi.fn().mockResolvedValue([])
      },
      socratesSuggestion: {
        deleteMany
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          artifactVersion: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({ id: "old-brain", versionNumber: 2, changeSummary: "old" })
              .mockResolvedValueOnce({ id: "old-brain", versionNumber: 2, changeSummary: "old" }),
            updateMany: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({
              id: "new-brain",
              versionNumber: 3,
              payloadJson: {
                whatTheProductIs: "Current truth",
                whoItIsFor: ["Manager"],
                mainFlows: ["Upload"],
                modules: ["Product Brain"],
                constraints: [],
                integrations: [],
                unresolvedAreas: [],
                acceptedDecisions: [],
                recentAcceptedChanges: [],
                evidenceRefs: []
              },
              sourceRefsJson: [],
              acceptedAt: new Date(),
              createdAt: new Date(),
              changeSummary: "new-signature",
              artifactType: "product_brain",
              status: "accepted"
            })
          },
          socratesSuggestion: {
            deleteMany
          }
        })
      )
    } as any;

    const service = new BrainService(
      prisma,
      {
        generateObject: vi.fn(async ({ fallback }: { fallback: () => unknown }) => fallback())
      } as any,
      { enqueue: vi.fn() } as any,
      { ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any
    );

    await service.generateProductBrain("project-1", "user-1");

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        session: {
          projectId: "project-1"
        }
      }
    });
  });

  it("returns a client-safe current brain projection", async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "brain-2",
            versionNumber: 4,
            payloadJson: {
              whatTheProductIs: "A product brain",
              whoItIsFor: ["Managers", "Clients"],
              mainFlows: ["Ingest docs", "Review changes"],
              modules: ["Upload", "Brain"],
              constraints: ["Immutable sources"],
              integrations: [],
              unresolvedAreas: ["Pending launch wording"],
              acceptedDecisions: [{ decisionId: "decision-internal", title: "Internal decision", statement: "Internal statement" }],
              recentAcceptedChanges: [{ proposalId: "proposal-internal", title: "Internal proposal", summary: "Internal summary" }],
              evidenceRefs: [
                { documentId: "doc-shared", excerpt: "Shared excerpt" },
                { documentId: "doc-internal", excerpt: "Internal excerpt" }
              ]
            },
            sourceRefsJson: [],
            acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z")
          })
          .mockResolvedValueOnce({
            id: "source-2",
            versionNumber: 2,
            payloadJson: {
              projectSummary: "Internal source package",
              actors: ["Manager"],
              features: ["Upload"],
              constraints: [],
              integrations: [],
              contradictions: [],
              unknowns: [],
              risks: [],
              sourceConfidence: 0.9,
              evidenceRefs: []
            }
          })
          .mockResolvedValueOnce({
            id: "brief-2",
            versionNumber: 2,
            payloadJson: {
              summary: "Internal brief",
              targetUsers: ["Manager"],
              flows: ["Upload"],
              scope: ["Upload"],
              constraints: [],
              integrations: [],
              unresolvedDecisions: [],
              assumptions: [],
              risks: [],
              evidenceRefs: []
            }
          })
      },
      document: {
        findMany: vi.fn().mockResolvedValue([{ id: "doc-shared" }])
      },
      decisionRecord: {
        findMany: vi.fn().mockResolvedValue([
          { id: "decision-1", title: "Internal decision", statement: "Internal", status: "accepted" }
        ])
      },
      specChangeProposal: {
        findMany: vi.fn().mockResolvedValue([
          { id: "proposal-1", title: "Internal proposal", summary: "Hidden", acceptedAt: new Date(), decisionRecordId: null }
        ])
      }
    } as any;

    const service = new BrainService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "client" }), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any
    );

    const result = await service.getCurrentBrain("project-1", "client-1");

    expect(result.sourcePackage).toBeNull();
    expect(result.clarifiedBrief).toBeNull();
    expect(result.acceptedDecisions).toEqual([]);
    expect(result.recentAcceptedChanges).toEqual([]);
    expect(result.currentBrain?.payload.evidenceRefs).toEqual([{ documentId: "doc-shared", excerpt: "Shared excerpt" }]);
  });
});
