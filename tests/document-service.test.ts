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
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn() } as any
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
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn() } as any
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
          currentVersionId: "ver-1"
        })
      },
      documentVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "ver-1",
          status: "ready",
          parseRevision: 2,
          parseConfidence: "0.900",
          sourceLabel: "Uploaded PRD"
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
            normalizedText: "Product overview"
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
                status: "accepted",
                acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
                acceptedBy: "manager-1",
                decisionRecordId: "decision-1"
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
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn().mockResolvedValue(undefined) } as any,
      { record: vi.fn() } as any
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
});
