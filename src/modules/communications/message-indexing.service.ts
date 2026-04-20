import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { EmbeddingProvider } from "../../lib/ai/provider.js";
import { buildMessageContextualContent, buildMessageLexicalContent } from "../../lib/communications/message-contextualize.js";
import { stableBodyHash } from "../../lib/communications/idempotency.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher } from "../../lib/jobs/types.js";
import { chunkText } from "../../lib/retrieval/chunking.js";
import { AuditService } from "../audit/service.js";

export class MessageIndexingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher
  ) {}

  async runIndexJob(input: { messageId: string; idempotencyKey?: string }) {
    if (input.idempotencyKey) {
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {
          jobType: "index_communication_message",
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: null,
          attemptCount: { increment: 1 }
        },
        create: {
          jobType: "index_communication_message",
          status: "running",
          idempotencyKey: input.idempotencyKey,
          startedAt: new Date(),
          attemptCount: 1
        }
      });
    }

    try {
      const result = await this.indexCommunicationMessage(input.messageId);
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: {
            status: "completed",
            finishedAt: new Date(),
            lastError: null
          }
        });
      }
      return result;
    } catch (error) {
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError: error instanceof Error ? error.message : "Unknown communication indexing error"
          }
        });
      }
      throw error;
    }
  }

  async indexCommunicationMessage(messageId: string) {
    const message = await this.prisma.communicationMessage.findUnique({
      where: { id: messageId },
      include: {
        thread: true,
        connector: true,
        attachments: true,
        project: true
      }
    });

    if (!message) {
      throw new AppError(404, "Communication message not found", "communication_message_not_found");
    }

    const expectedBodyHash = stableBodyHash(message.bodyText, message.bodyHtml);
    if (message.bodyHash !== expectedBodyHash) {
      await this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: { bodyHash: expectedBodyHash }
      });
    }

    const existingChunks = await this.prisma.communicationMessageChunk.findMany({
      where: { messageId },
      orderBy: { chunkIndex: "asc" }
    });

    const contentSignature = stableBodyHash(message.bodyText, JSON.stringify(existingChunks.map((chunk) => chunk.metadataJson)));
    const attachmentNames = message.attachments
      .map((attachment) => attachment.filename)
      .filter((value): value is string => Boolean(value && value.trim().length > 0));
    const contextualBody = buildMessageContextualContent({
      provider: message.provider,
      senderLabel: message.senderLabel,
      senderEmail: message.senderEmail,
      sentAt: message.sentAt,
      bodyText: message.bodyText,
      thread: message.thread,
      attachmentNames
    });
    const lexicalContent = buildMessageLexicalContent({
      bodyText: message.bodyText,
      senderLabel: message.senderLabel,
      senderEmail: message.senderEmail,
      subject: message.thread.subject,
      attachmentNames
    });

    const existingSignature = existingChunks[0]?.metadataJson;
    if (
      existingChunks.length > 0 &&
      typeof existingSignature === "object" &&
      existingSignature !== null &&
      "contentSignature" in existingSignature &&
      (existingSignature as { contentSignature?: unknown }).contentSignature === contentSignature
    ) {
      return { indexed: false, chunkCount: existingChunks.length };
    }

    await this.prisma.communicationMessageChunk.deleteMany({
      where: { messageId }
    });

    const chunks = chunkText({
      content: message.bodyText,
      documentTitle: message.thread.subject ?? `Thread ${message.threadId}`,
      kind: "communication_message",
      headingPath: [message.senderLabel],
      pageNumber: null,
      chunkSize: 220,
      overlapSize: 40
    });

    let indexedCount = 0;
    for (const chunk of chunks) {
      const chunkContext = buildMessageContextualContent({
        provider: message.provider,
        senderLabel: message.senderLabel,
        senderEmail: message.senderEmail,
        sentAt: message.sentAt,
        bodyText: chunk.content,
        thread: message.thread,
        attachmentNames
      });
      const embedding = await this.embeddingProvider.embedText(chunkContext);
      const created = await this.prisma.communicationMessageChunk.create({
        data: {
          messageId: message.id,
          threadId: message.threadId,
          projectId: message.projectId,
          connectorId: message.connectorId,
          provider: message.provider,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          contextualContent: chunkContext,
          lexicalContent,
          tokenCount: chunk.tokenCount,
          metadataJson: {
            senderLabel: message.senderLabel,
            senderEmail: message.senderEmail,
            subject: message.thread.subject,
            contentSignature
          }
        }
      });

      await this.prisma.$executeRawUnsafe(
        "UPDATE communication_message_chunks SET embedding = CAST($1 AS vector) WHERE id = CAST($2 AS uuid)",
        `[${embedding.join(",")}]`,
        created.id
      );
      indexedCount += 1;
    }

    await this.auditService.record({
      orgId: message.project.orgId,
      projectId: message.projectId,
      eventType: "communication_message_indexed",
      entityType: "communication_message",
      entityId: message.id,
      payload: {
        connectorId: message.connectorId,
        provider: message.provider,
        chunkCount: indexedCount
      }
    });

    const classifyKey = jobKeys.classifyMessageInsight(message.id, expectedBodyHash);
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey: classifyKey },
      update: {
        jobType: JobNames.classifyMessageInsight,
        status: "pending",
        payloadJson: { projectId: message.projectId, messageId: message.id, idempotencyKey: classifyKey }
      },
      create: {
        jobType: JobNames.classifyMessageInsight,
        status: "pending",
        idempotencyKey: classifyKey,
        payloadJson: { projectId: message.projectId, messageId: message.id, idempotencyKey: classifyKey }
      }
    });
    await this.jobs.enqueue(
      JobNames.classifyMessageInsight,
      { projectId: message.projectId, messageId: message.id, idempotencyKey: classifyKey },
      classifyKey
    );

    return { indexed: true, chunkCount: indexedCount };
  }
}
