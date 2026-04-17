import { describe, expect, it, vi } from "vitest";
import { hybridRetrieve } from "../src/lib/retrieval/hybrid.js";

describe("hybridRetrieve", () => {
  it("queries only current parse-revision chunks and sections", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const prisma = {
      $queryRawUnsafe: queryRawUnsafe
    } as any;

    await hybridRetrieve(prisma, {} as any, "org-1", {
      projectId: "project-1",
      query: "auth requirement",
      queryEmbedding: [0.1, 0.2],
      intent: "doc_local",
      domains: {
        includeDocuments: true,
        includeBrainNodes: false,
        includeProductBrain: false,
        includeChanges: false,
        includeDecisions: false,
        includeDashboard: false,
        includeCommunications: false
      },
      topK: 5,
      minScore: 0,
      isClientContext: false,
      acceptedTruthBoost: 1.2,
      docWeight: 1,
      commWeight: 0.8
    });

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("dc.parse_revision = dv.parse_revision");
    expect(sql).toContain("ds.parse_revision = dv.parse_revision");
  });

  it("returns the accepted Product Brain as retrieval evidence for current-truth queries", async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "artifact-1",
          versionNumber: 4,
          payloadJson: {
            whatTheProductIs: "A product brain for client-facing software teams",
            mainFlows: ["Upload docs", "Accept changes"],
            modules: ["Product Brain", "Socrates"],
            constraints: ["Immutable evidence"],
            integrations: ["Slack"]
          }
        })
      }
    } as any;

    const result = await hybridRetrieve(prisma, {} as any, "org-1", {
      projectId: "project-1",
      query: "what is the current product",
      queryEmbedding: [0.1, 0.2],
      intent: "current_truth",
      domains: {
        includeDocuments: false,
        includeBrainNodes: false,
        includeProductBrain: true,
        includeChanges: false,
        includeDecisions: false,
        includeDashboard: false,
        includeCommunications: false
      },
      topK: 5,
      minScore: 0.2,
      isClientContext: false,
      acceptedTruthBoost: 1.2,
      docWeight: 1,
      commWeight: 0.8
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "artifact-1",
      sourceType: "product_brain"
    });
  });

  it("uses the selected section parse revision when expanding neighbor sections", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      documentVersionId: "version-1",
      orderIndex: 10,
      parseRevision: 3
    });
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      documentSection: {
        findFirst,
        findMany
      }
    } as any;

    await hybridRetrieve(prisma, {} as any, "org-1", {
      projectId: "project-1",
      query: "this section",
      queryEmbedding: [0.1, 0.2],
      intent: "doc_local",
      domains: {
        includeDocuments: false,
        includeBrainNodes: false,
        includeProductBrain: false,
        includeChanges: false,
        includeDecisions: false,
        includeDashboard: false,
        includeCommunications: false
      },
      selectedSectionId: "section-1",
      topK: 5,
      minScore: 0,
      isClientContext: false,
      acceptedTruthBoost: 1.2,
      docWeight: 1,
      commWeight: 0.8
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parseRevision: 3
        })
      })
    );
  });

  it("indexes communication messages into semantic chunks before retrieval", async () => {
    const communicationMessageChunk = {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "chunk-1" })
    };
    const prisma = {
      communicationMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "message-1",
            projectId: "project-1",
            threadId: "thread-1",
            senderLabel: "Founder",
            bodyText: "We should launch with a lightweight voice note input for early idea capture.",
            thread: { subject: "Kickoff" }
          }
        ])
      },
      communicationMessageChunk,
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          message_id: "message-1",
          thread_id: "thread-1",
          content: "voice note input for early idea capture",
          contextual_content: "Kickoff Founder voice note input for early idea capture",
          lexical_content: "Kickoff Founder voice note input for early idea capture",
          sender_label: "Founder",
          subject: "Kickoff",
          vec_dist: 0.08
        }
      ]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    } as any;

    const embedProvider = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    } as any;

    const result = await hybridRetrieve(prisma, embedProvider, "org-1", {
      projectId: "project-1",
      query: "did anyone mention voice notes?",
      queryEmbedding: [0.1, 0.2, 0.3],
      intent: "provenance",
      domains: {
        includeDocuments: false,
        includeBrainNodes: false,
        includeProductBrain: false,
        includeChanges: false,
        includeDecisions: false,
        includeDashboard: false,
        includeCommunications: true
      },
      topK: 5,
      minScore: 0,
      isClientContext: false,
      acceptedTruthBoost: 1.2,
      docWeight: 1,
      commWeight: 0.8
    });

    expect(communicationMessageChunk.create).toHaveBeenCalled();
    expect(embedProvider.embedText).toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      id: "message-1",
      sourceType: "communication_message"
    });
  });
});
