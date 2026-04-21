import { describe, expect, it, vi } from "vitest";
import { MessageIngestionService } from "../src/modules/communications/message-ingestion.service.js";
import { MessageIndexingService } from "../src/modules/communications/message-indexing.service.js";
import { stableBodyHash } from "../src/lib/communications/idempotency.js";

describe("Communication layer C1 services", () => {
  it("ingests manual-import messages idempotently and stores attachment metadata", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      communicationConnector: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connector-1",
          projectId: "project-1",
          provider: "manual_import"
        })
      },
      communicationThread: {
        upsert: vi.fn().mockResolvedValue({ id: "thread-1", lastMessageAt: null }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      communicationMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "msg-1" })
      },
      communicationAttachment: {
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      communicationMessageRevision: {
        findFirst: vi.fn(),
        create: vi.fn()
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" })
      }
    } as any;

    const service = new MessageIngestionService(prisma, { enqueue } as any);

    const result = await service.ingestNormalizedBatch({
      projectId: "project-1",
      connectorId: "connector-1",
      provider: "manual_import",
      threads: [
        {
          providerThreadId: "thread-1",
          subject: "Kickoff",
          participants: [{ label: "Client" }]
        }
      ],
      messages: [
        {
          providerMessageId: "msg-1",
          senderLabel: "Client",
          sentAt: "2026-04-19T10:01:00.000Z",
          bodyText: "Need weekly reporting",
          messageType: "user",
          attachments: [{ providerAttachmentId: "att-1", filename: "brief.pdf", mimeType: "application/pdf", fileSize: 128 }]
        }
      ]
    });

    expect(result.createdMessageCount).toBe(1);
    expect(prisma.communicationAttachment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerAttachmentId: "att-1",
          filename: "brief.pdf"
        })
      })
    );
    expect(enqueue).toHaveBeenCalledWith(
      "index_communication_message",
      expect.objectContaining({ messageId: "msg-1" }),
      expect.stringContaining("index-message:msg-1:")
    );
  });

  it("creates a revision when an imported message body changes and skips duplicate same-body imports", async () => {
    const existing = {
      id: "msg-1",
      projectId: "project-1",
      threadId: "thread-1",
      providerPermalink: null,
      senderLabel: "Client",
      senderExternalRef: null,
      senderEmail: null,
      sentAt: new Date("2026-04-19T10:01:00.000Z"),
      bodyText: "Need monthly reporting",
      bodyHtml: null,
      bodyHash: stableBodyHash("Need monthly reporting", null),
      isEdited: false,
      replyToMessageId: null,
      rawMetadataJson: {}
    };

    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        bodyText: "Need weekly reporting",
        bodyHash: stableBodyHash("Need weekly reporting", null)
      });

    const prisma = {
      communicationConnector: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connector-1",
          projectId: "project-1",
          provider: "manual_import"
        })
      },
      communicationThread: {
        upsert: vi.fn().mockResolvedValue({ id: "thread-1", lastMessageAt: new Date() }),
        update: vi.fn()
      },
      communicationMessage: {
        findUnique,
        update: vi.fn().mockResolvedValue({ id: "msg-1" })
      },
      communicationAttachment: {
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      communicationMessageRevision: {
        findFirst: vi.fn().mockResolvedValue({ revisionIndex: 1 }),
        create: vi.fn().mockResolvedValue(undefined)
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" })
      }
    } as any;

    const service = new MessageIngestionService(prisma, { enqueue: vi.fn() } as any);

    const changed = await service.ingestNormalizedBatch({
      projectId: "project-1",
      connectorId: "connector-1",
      provider: "manual_import",
      threads: [{ providerThreadId: "thread-1", participants: [] }],
      messages: [
        {
          providerMessageId: "msg-1",
          senderLabel: "Client",
          sentAt: "2026-04-19T10:02:00.000Z",
          bodyText: "Need weekly reporting",
          messageType: "user"
        }
      ]
    });

    expect(changed.updatedRevisionCount).toBe(1);
    expect(prisma.communicationMessageRevision.create).toHaveBeenCalledTimes(1);

    const duplicate = await service.ingestNormalizedBatch({
      projectId: "project-1",
      connectorId: "connector-1",
      provider: "manual_import",
      threads: [{ providerThreadId: "thread-1", participants: [] }],
      messages: [
        {
          providerMessageId: "msg-1",
          senderLabel: "Client",
          sentAt: "2026-04-19T10:02:00.000Z",
          bodyText: "Need weekly reporting",
          messageType: "user"
        }
      ]
    });

    expect(duplicate.updatedRevisionCount).toBe(0);
    expect(prisma.communicationMessageRevision.create).toHaveBeenCalledTimes(1);
  });

  it("indexes imported messages into provider-aware communication chunks", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "msg-1",
      projectId: "project-1",
      connectorId: "connector-1",
      provider: "manual_import",
      threadId: "thread-1",
      senderLabel: "Client",
      senderEmail: "client@example.com",
      sentAt: new Date("2026-04-19T10:02:00.000Z"),
      bodyText: "Need weekly reporting for managers and owners.",
      bodyHtml: null,
      bodyHash: stableBodyHash("Need weekly reporting for managers and owners.", null),
      thread: {
        subject: "Reporting discussion",
        participantsJson: [{ label: "Client" }]
      },
      connector: { id: "connector-1", provider: "manual_import" },
      attachments: [],
      project: { orgId: "org-1" }
    });

    const prisma = {
      communicationMessage: {
        findUnique,
        update: vi.fn().mockResolvedValue(undefined)
      },
      communicationMessageChunk: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: "chunk-1" })
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    } as any;

    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new MessageIndexingService(
      prisma,
      { embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) } as any,
      { record: vi.fn().mockResolvedValue(undefined) } as any,
      { enqueue } as any
    );

    await service.runIndexJob({ messageId: "msg-1", idempotencyKey: "index-message:msg-1:test" });

    expect(prisma.communicationMessageChunk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectorId: "connector-1",
          provider: "manual_import"
        })
      })
    );
    expect(prisma.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: "index-message:msg-1:test" },
        data: expect.objectContaining({ status: "completed" })
      })
    );
    expect(enqueue).toHaveBeenCalledWith(
      "classify_message_insight",
      expect.objectContaining({ projectId: "project-1", messageId: "msg-1" }),
      expect.stringContaining("classify-message:msg-1:")
    );
  });
});
