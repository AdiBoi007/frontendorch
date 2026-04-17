import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../src/modules/documents/service.js";

describe("DocumentService", () => {
  it("skips stale parse jobs instead of mutating newer parse revisions", async () => {
    const prisma = {
      documentVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          projectId: "project-1",
          parseRevision: 2,
          fileKey: "file-key",
          mimeType: "text/markdown",
          document: {
            title: "Core PRD"
          }
        })
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const storage = {
      getObject: vi.fn()
    } as any;

    const service = new DocumentService(
      prisma,
      storage,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const result = await service.processDocumentVersion("ver-1", 1);

    expect(result).toEqual({ skipped: true, reason: "stale_parse_revision" });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("assigns chunk indices monotonically across sections within a parse revision", async () => {
    const createChunk = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      documentVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          projectId: "project-1",
          parseRevision: 1,
          document: {
            title: "Core PRD",
            kind: "prd"
          }
        })
      },
      documentSection: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sec-1",
            normalizedText: "one two three four five six",
            headingPath: ["Overview"],
            pageNumber: 1,
            anchorId: "overview-1",
            orderIndex: 0
          },
          {
            id: "sec-2",
            normalizedText: "seven eight nine ten eleven twelve",
            headingPath: ["Flow"],
            pageNumber: 2,
            anchorId: "flow-1",
            orderIndex: 1
          }
        ])
      },
      documentChunk: {
        deleteMany: vi.fn().mockResolvedValue(undefined),
        create: createChunk
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const jobs = {
      enqueue: vi.fn().mockResolvedValue(undefined)
    };

    const service = new DocumentService(
      prisma,
      {} as any,
      jobs as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    await service.chunkDocumentVersion("ver-1", 1);

    const chunkIndexes = createChunk.mock.calls.map(([call]) => call.data.chunkIndex);
    expect(chunkIndexes).toEqual([0, 1]);
    expect(createChunk.mock.calls[0][0].data.parseRevision).toBe(1);
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });

  it("returns viewer markers with linked decisions and message refs", async () => {
    const prisma = {
      document: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "Core PRD",
          kind: "prd",
          visibility: "internal",
          currentVersionId: "ver-1",
          projectId: "project-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        })
      },
      documentVersion: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          status: "ready",
          parseRevision: 2,
          parseConfidence: "0.900",
          sourceLabel: "Uploaded PRD",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          processedAt: new Date("2026-01-02T00:00:00.000Z")
        })
      },
      documentSection: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sec-1",
            anchorId: "overview-1",
            pageNumber: 1,
            headingPath: ["Overview"],
            normalizedText: "Product overview",
            orderIndex: 0
          }
        ])
      },
      specChangeLink: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              specChangeProposalId: "proposal-1",
              linkRefId: "sec-1",
              proposal: {
                id: "proposal-1",
                proposalType: "requirement_update",
                status: "accepted",
                acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
                acceptedBy: "manager-1",
                decisionRecordId: "decision-1",
                title: "Update requirement",
                summary: "The requirement changed after client feedback"
              }
            }
          ])
          .mockResolvedValueOnce([
            {
              specChangeProposalId: "proposal-1",
              linkType: "message",
              linkRefId: "msg-1"
            }
          ])
      },
      communicationMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "msg-1",
            senderLabel: "Client",
            sentAt: new Date("2026-01-02T00:00:00.000Z"),
            threadId: "thread-1"
          }
        ])
      },
      communicationThread: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getViewerPayload("project-1", "doc-1", "user-1");
    const section = payload.sections[0];

    expect(section.linkedDecisionIds).toEqual(["decision-1"]);
    expect(section.linkedMessageRefs[0]).toMatchObject({
      type: "message",
      id: "msg-1",
      senderLabel: "Client"
    });
    expect(section.changeMarkers[0]).toMatchObject({
      changeProposalId: "proposal-1",
      status: "accepted"
    });
  });

  it("filters document listing for client members to shared documents only", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      document: {
        count,
        findMany
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "client" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    await service.listDocuments("project-1", "client-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project-1",
          visibility: "shared_with_client"
        })
      })
    );
    expect(count).toHaveBeenCalled();
  });

  it("looks up anchors directly from the selected version instead of the first page window", async () => {
    const findFirstOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: "doc-1",
        title: "Core PRD",
        kind: "prd",
        visibility: "internal",
        currentVersionId: "ver-1",
        projectId: "project-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      })
      .mockResolvedValueOnce({
        id: "ver-1",
        status: "ready",
        parseRevision: 4,
        parseConfidence: "0.900",
        sourceLabel: "Uploaded PRD",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        processedAt: new Date("2026-01-02T00:00:00.000Z")
      })
      .mockResolvedValueOnce({
        id: "sec-anchor",
        anchorId: "deep-anchor",
        pageNumber: 42,
        headingPath: ["Appendix", "Deep requirement"],
        normalizedText: "Deep requirement text",
        orderIndex: 401
      });

    const prisma = {
      document: {
        findFirstOrThrow
      },
      documentVersion: {
        findFirstOrThrow
      },
      documentSection: {
        findFirstOrThrow,
        findMany: vi.fn().mockResolvedValue([])
      },
      specChangeLink: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getAnchor("project-1", "doc-1", "deep-anchor", "user-1");

    expect(payload.viewerState.pageNumber).toBe(42);
    expect(payload.section.anchorId).toBe("deep-anchor");
    expect(findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentVersionId: "ver-1",
          parseRevision: 4,
          anchorId: "deep-anchor"
        })
      })
    );
  });

  it("strips message refs and decision ids from client-safe viewer payloads", async () => {
    const prisma = {
      document: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "Shared PRD",
          kind: "prd",
          visibility: "shared_with_client",
          currentVersionId: "ver-1",
          projectId: "project-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        })
      },
      documentVersion: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          status: "ready",
          parseRevision: 1,
          parseConfidence: "0.900",
          sourceLabel: "Uploaded PRD",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          processedAt: new Date("2026-01-02T00:00:00.000Z")
        })
      },
      documentSection: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sec-1",
            anchorId: "overview-1",
            pageNumber: 1,
            headingPath: ["Overview"],
            normalizedText: "Shared requirement",
            orderIndex: 0
          }
        ])
      },
      specChangeLink: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              specChangeProposalId: "proposal-1",
              linkRefId: "sec-1",
              proposal: {
                id: "proposal-1",
                proposalType: "requirement_update",
                status: "accepted",
                acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
                acceptedBy: "manager-1",
                decisionRecordId: "decision-1",
                title: "Update requirement",
                summary: "Accepted client-safe summary"
              }
            }
          ])
          .mockResolvedValueOnce([
            { specChangeProposalId: "proposal-1", linkType: "message", linkRefId: "msg-1" },
            { specChangeProposalId: "proposal-1", linkType: "thread", linkRefId: "thread-1" },
            { specChangeProposalId: "proposal-1", linkType: "brain_node", linkRefId: "node-1" }
          ])
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "client" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getViewerPayload("project-1", "doc-1", "client-1");
    const section = payload.sections[0];

    expect(section.linkedDecisionIds).toEqual([]);
    expect(section.linkedMessageRefs).toEqual([]);
    expect(section.changeMarkers[0]).toMatchObject({
      changeProposalId: null,
      decisionRecordId: null,
      linkedBrainNodeIds: [],
      linkedThreadIds: [],
      linkedMessageRefs: []
    });
  });

  it("returns section search results with snippets and open targets", async () => {
    const prisma = {
      document: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "Core PRD",
          kind: "prd",
          visibility: "internal",
          currentVersionId: "ver-1",
          projectId: "project-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        })
      },
      documentVersion: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          status: "ready",
          parseRevision: 2,
          parseConfidence: "0.900",
          sourceLabel: "Uploaded PRD",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          processedAt: new Date("2026-01-02T00:00:00.000Z")
        })
      },
      documentSection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sec-1",
            anchorId: "voice-notes",
            pageNumber: 3,
            headingPath: ["Input", "Voice notes"],
            normalizedText: "The system should support lightweight voice note capture for early product idea intake.",
            orderIndex: 8
          }
        ])
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const result = await service.searchDocument("project-1", "doc-1", "user-1", { q: "voice note", limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      anchorId: "voice-notes",
      pageNumber: 3,
      openTarget: {
        targetType: "document_section",
        targetRef: expect.objectContaining({
          documentId: "doc-1",
          documentVersionId: "ver-1",
          anchorId: "voice-notes"
        })
      }
    });
    expect(result.items[0].snippet.toLowerCase()).toContain("voice note");
  });

  it("returns provenance bundles with linked graph, changes, decisions, and messages", async () => {
    const specChangeLinkFindMany = vi.fn((args?: any) => {
      const linkType = args?.where?.linkType;
      const sectionLinkIds = args?.where?.linkRefId?.in;

      if (linkType === "document_section" && Array.isArray(sectionLinkIds)) {
        if (sectionLinkIds.includes("sec-1")) {
          return Promise.resolve([
            {
              specChangeProposalId: "proposal-1",
              linkRefId: "sec-1",
              proposal: {
                id: "proposal-1",
                proposalType: "requirement_update",
                status: "accepted",
                title: "Weekly reporting",
                summary: "Client requested weekly reporting",
                acceptedAt: new Date("2026-01-03T00:00:00.000Z"),
                acceptedBy: "manager-1",
                decisionRecordId: "decision-1",
                decisionRecord: {
                  id: "decision-1",
                  title: "Weekly reporting approved",
                  statement: "Use weekly reporting",
                  status: "accepted"
                }
              }
            }
          ]);
        }

        return Promise.resolve([]);
      }

      if (linkType === "document_section" && args?.where?.linkRefId === "sec-1") {
        return Promise.resolve([
          {
            specChangeProposalId: "proposal-1",
            linkRefId: "sec-1",
            proposal: {
              id: "proposal-1",
              proposalType: "requirement_update",
              status: "accepted",
              title: "Weekly reporting",
              summary: "Client requested weekly reporting",
              acceptedAt: new Date("2026-01-03T00:00:00.000Z"),
              acceptedBy: "manager-1",
              decisionRecordId: "decision-1",
              decisionRecord: {
                id: "decision-1",
                title: "Weekly reporting approved",
                statement: "Use weekly reporting",
                status: "accepted"
              }
            }
          }
        ]);
      }

      if (args?.where?.specChangeProposalId?.in) {
        return Promise.resolve([
          { specChangeProposalId: "proposal-1", linkType: "message", linkRefId: "msg-1" },
          { specChangeProposalId: "proposal-1", linkType: "thread", linkRefId: "thread-1" },
          { specChangeProposalId: "proposal-1", linkType: "brain_node", linkRefId: "node-1" }
        ]);
      }

      return Promise.resolve([]);
    });

    const prisma = {
      document: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "Core PRD",
          kind: "prd",
          visibility: "internal",
          currentVersionId: "ver-1",
          projectId: "project-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        })
      },
      documentVersion: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          status: "ready",
          parseRevision: 2,
          parseConfidence: "0.900",
          sourceLabel: "Uploaded PRD",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          processedAt: new Date("2026-01-02T00:00:00.000Z")
        })
      },
      documentSection: {
        findFirstOrThrow: vi
          .fn()
          .mockResolvedValueOnce({
            id: "sec-1",
            anchorId: "reporting",
            pageNumber: 6,
            headingPath: ["Features", "Reporting"],
            normalizedText: "The product should support weekly reporting.",
            orderIndex: 12
          }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sec-2",
            anchorId: "reporting-context",
            pageNumber: 6,
            headingPath: ["Features", "Reporting"],
            normalizedText: "Reporting context section",
            orderIndex: 13
          }
        ])
      },
      documentChunk: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "chunk-1",
            chunkIndex: 0,
            pageNumber: 6,
            tokenCount: 42,
            content: "weekly reporting"
          }
        ])
      },
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "graph-1"
        })
      },
      brainSectionLink: {
        findMany: vi.fn().mockResolvedValue([
          {
            brainNodeId: "node-1",
            relationship: "supports",
            brainNode: {
              id: "node-1",
              title: "Reporting module",
              nodeType: "module",
              status: "active"
            }
          }
        ])
      },
      brainEdge: {
        findMany: vi.fn().mockResolvedValue([
          {
            edgeType: "depends_on",
            fromNodeId: "node-1",
            toNodeId: "node-2"
          }
        ])
      },
      specChangeLink: {
        findMany: specChangeLinkFindMany
      },
      communicationMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "msg-1",
            senderLabel: "Client",
            sentAt: new Date("2026-01-02T00:00:00.000Z"),
            threadId: "thread-1"
          }
        ])
      },
      communicationThread: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "thread-1",
            subject: "Reporting feedback",
            lastMessageAt: new Date("2026-01-02T00:00:00.000Z")
          }
        ])
      }
    } as any;

    const service = new DocumentService(
      prisma,
      {} as any,
      { enqueue: vi.fn() } as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }) } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const result = await service.getAnchorProvenance("project-1", "doc-1", "reporting", "user-1");

    expect(result.currentTruth).toEqual({
      differsFromSource: true,
      summaries: ["Client requested weekly reporting"]
    });
    expect(result.linkedBrainNodes[0]).toMatchObject({
      nodeId: "node-1",
      relationship: "supports"
    });
    expect(result.linkedChanges[0]).toMatchObject({
      proposalId: "proposal-1",
      title: "Weekly reporting"
    });
    expect(result.linkedDecisions[0]).toMatchObject({
      id: "decision-1"
    });
    expect(result.linkedMessageRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "message", id: "msg-1" }),
        expect.objectContaining({ type: "thread", id: "thread-1" })
      ])
    );
    expect(result.openTargets.selectedSection).toMatchObject({
      targetType: "document_section",
      targetRef: expect.objectContaining({ anchorId: "reporting" })
    });
  });

  it("transcribes audio uploads before creating sections", async () => {
    const createSection = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      documentVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "ver-audio",
          projectId: "project-1",
          parseRevision: 1,
          fileKey: "audio-key",
          mimeType: "audio/mpeg",
          document: {
            title: "Founder note"
          }
        }),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue(undefined)
      },
      documentChunk: {
        deleteMany: vi.fn().mockResolvedValue(undefined)
      },
      documentSection: {
        deleteMany: vi.fn().mockResolvedValue(undefined),
        create: createSection
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const jobs = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const transcribeAudio = vi.fn().mockResolvedValue({
      text: "# Vision\nVoice-captured product idea",
      provider: "mock-transcription"
    });
    const telemetry = { increment: vi.fn(), observeDuration: vi.fn() };

    const service = new DocumentService(
      prisma,
      { getObject: vi.fn().mockResolvedValue(Buffer.from("audio-bytes")) } as any,
      jobs as any,
      { embedText: vi.fn() } as any,
      { transcribeAudio } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }) } as any,
      { record: vi.fn() } as any,
      telemetry as any
    );

    await service.processDocumentVersion("ver-audio", 1);

    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "audio/mpeg"
      })
    );
    expect(createSection).toHaveBeenCalled();
    expect(telemetry.increment).toHaveBeenCalledWith("orchestra_voice_transcriptions_total", {
      provider: "mock-transcription"
    });
    expect(jobs.enqueue).toHaveBeenCalledWith(
      "chunk_document",
      { documentVersionId: "ver-audio", parseRevision: 1 },
      expect.any(String)
    );
  });
});
