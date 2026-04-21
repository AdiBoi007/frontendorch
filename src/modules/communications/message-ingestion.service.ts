import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { stableBodyHash } from "../../lib/communications/idempotency.js";
import type { NormalizedCommunicationBatch, NormalizedMessage } from "../../lib/communications/provider-normalized-types.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher } from "../../lib/jobs/types.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";

export class MessageIngestionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobDispatcher
  ) {}

  async ingestNormalizedBatch(batch: NormalizedCommunicationBatch) {
    const connector = await this.prisma.communicationConnector.findFirst({
      where: {
        id: batch.connectorId,
        projectId: batch.projectId,
        provider: batch.provider
      }
    });

    if (!connector) {
      throw new AppError(404, "Communication connector not found for project", "communication_connector_not_found");
    }

    const threadInput = batch.threads[0];
    if (!threadInput) {
      throw new AppError(422, "Communication import requires at least one thread", "communication_thread_required");
    }

    const thread = await this.prisma.communicationThread.upsert({
      where: {
        connectorId_providerThreadId: {
          connectorId: batch.connectorId,
          providerThreadId: threadInput.providerThreadId
        }
      },
      create: {
        projectId: batch.projectId,
        connectorId: batch.connectorId,
        provider: batch.provider,
        providerThreadId: threadInput.providerThreadId,
        subject: threadInput.subject ?? null,
        normalizedSubject: threadInput.subject?.trim().toLowerCase() ?? null,
        participantsJson: threadInput.participants as object,
        startedAt: threadInput.startedAt ? new Date(threadInput.startedAt) : null,
        lastMessageAt: threadInput.lastMessageAt ? new Date(threadInput.lastMessageAt) : null,
        threadUrl: threadInput.threadUrl ?? null,
        rawMetadataJson: (threadInput.rawMetadata ?? {}) as object
      },
      update: {
        subject: threadInput.subject ?? null,
        normalizedSubject: threadInput.subject?.trim().toLowerCase() ?? null,
        participantsJson: threadInput.participants as object,
        startedAt: threadInput.startedAt ? new Date(threadInput.startedAt) : null,
        lastMessageAt: threadInput.lastMessageAt ? new Date(threadInput.lastMessageAt) : null,
        threadUrl: threadInput.threadUrl ?? null,
        rawMetadataJson: (threadInput.rawMetadata ?? {}) as object
      }
    });

    let createdMessageCount = 0;
    let updatedRevisionCount = 0;
    const indexedMessages: Array<{ messageId: string; bodyHash: string }> = [];
    const messageIds: string[] = [];

    const messagesByProviderId = new Map<string, string>();
    const sortedMessages = [...batch.messages].sort((left, right) => {
      return new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime();
    });

    for (const messageInput of sortedMessages) {
      const result = await this.upsertMessage(batch, thread.id, messageInput, messagesByProviderId);
      messageIds.push(result.messageId);
      messagesByProviderId.set(messageInput.providerMessageId, result.messageId);

      if (result.created) {
        createdMessageCount += 1;
      }
      if (result.revisionCreated) {
        updatedRevisionCount += 1;
      }
      if (result.needsIndexing) {
        indexedMessages.push({ messageId: result.messageId, bodyHash: result.bodyHash });
      }
    }

    if (thread.lastMessageAt == null && sortedMessages.length > 0) {
      await this.prisma.communicationThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(sortedMessages[sortedMessages.length - 1].sentAt) }
      });
    }

    for (const indexedMessage of indexedMessages) {
      const key = jobKeys.indexCommunicationMessage(indexedMessage.messageId, indexedMessage.bodyHash);
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: key },
        update: {
          jobType: JobNames.indexCommunicationMessage,
          status: "pending",
          payloadJson: { messageId: indexedMessage.messageId, idempotencyKey: key }
        },
        create: {
          jobType: JobNames.indexCommunicationMessage,
          status: "pending",
          idempotencyKey: key,
          payloadJson: { messageId: indexedMessage.messageId, idempotencyKey: key }
        }
      });
      await this.jobs.enqueue(
        JobNames.indexCommunicationMessage,
        { messageId: indexedMessage.messageId, idempotencyKey: key },
        key
      );
    }

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, batch.projectId, "communication_ingested");

    return {
      threadId: thread.id,
      messageIds,
      createdMessageCount,
      updatedRevisionCount,
      indexedMessageCount: indexedMessages.length
    };
  }

  private async upsertMessage(
    batch: NormalizedCommunicationBatch,
    threadId: string,
    messageInput: NormalizedMessage,
    messagesByProviderId: Map<string, string>
  ) {
    const replyToExisting =
      messageInput.replyToProviderMessageId != null
        ? messagesByProviderId.get(messageInput.replyToProviderMessageId) ??
          (
            await this.prisma.communicationMessage.findUnique({
              where: {
                connectorId_providerMessageId: {
                  connectorId: batch.connectorId,
                  providerMessageId: messageInput.replyToProviderMessageId
                }
              },
              select: { id: true }
            })
          )?.id
        : null;

    const current = await this.prisma.communicationMessage.findUnique({
      where: {
        connectorId_providerMessageId: {
          connectorId: batch.connectorId,
          providerMessageId: messageInput.providerMessageId
        }
      }
    });

    const bodyHash = stableBodyHash(messageInput.bodyText, messageInput.bodyHtml);
    let revisionCreated = false;
    let created = false;
    let messageId = current?.id ?? "";

    if (!current) {
      const createdMessage = await this.prisma.communicationMessage.create({
        data: {
          projectId: batch.projectId,
          connectorId: batch.connectorId,
          threadId,
          provider: batch.provider,
          providerMessageId: messageInput.providerMessageId,
          providerPermalink: messageInput.providerPermalink ?? null,
          senderLabel: messageInput.senderLabel,
          senderExternalRef: messageInput.senderExternalRef ?? null,
          senderEmail: messageInput.senderEmail ?? null,
          sentAt: new Date(messageInput.sentAt),
          bodyText: messageInput.bodyText,
          bodyHtml: messageInput.bodyHtml ?? null,
          bodyHash,
          messageType: messageInput.messageType,
          replyToMessageId: replyToExisting ?? null,
          rawMetadataJson: (messageInput.rawMetadata ?? {}) as object
        }
      });
      created = true;
      messageId = createdMessage.id;
    } else {
      if (current.projectId !== batch.projectId || current.threadId !== threadId) {
        throw new AppError(409, "Communication message belongs to a different project or thread", "communication_message_conflict");
      }

      if (current.bodyHash !== bodyHash) {
        const lastRevision = await this.prisma.communicationMessageRevision.findFirst({
          where: { messageId: current.id },
          orderBy: { revisionIndex: "desc" },
          select: { revisionIndex: true }
        });

        await this.prisma.communicationMessageRevision.create({
          data: {
            messageId: current.id,
            projectId: batch.projectId,
            connectorId: batch.connectorId,
            provider: batch.provider,
            revisionIndex: (lastRevision?.revisionIndex ?? 0) + 1,
            bodyText: current.bodyText,
            bodyHtml: current.bodyHtml,
            bodyHash: current.bodyHash,
            rawMetadataJson: current.rawMetadataJson as object | undefined,
            editedAt: new Date()
          }
        });

        revisionCreated = true;
      }

      await this.prisma.communicationMessage.update({
        where: { id: current.id },
        data: {
          providerPermalink: messageInput.providerPermalink ?? current.providerPermalink,
          senderLabel: messageInput.senderLabel,
          senderExternalRef: messageInput.senderExternalRef ?? null,
          senderEmail: messageInput.senderEmail ?? null,
          sentAt: new Date(messageInput.sentAt),
          bodyText: messageInput.bodyText,
          bodyHtml: messageInput.bodyHtml ?? null,
          bodyHash,
          isEdited: revisionCreated || current.isEdited,
          replyToMessageId: replyToExisting ?? current.replyToMessageId,
          rawMetadataJson: (messageInput.rawMetadata ?? {}) as object
        }
      });
      messageId = current.id;
    }

    await this.upsertAttachments(batch, messageId, messageInput);

    return {
      messageId,
      bodyHash,
      created,
      revisionCreated,
      needsIndexing: created || revisionCreated
    };
  }

  private async upsertAttachments(
    batch: NormalizedCommunicationBatch,
    messageId: string,
    messageInput: NormalizedMessage
  ) {
    for (const attachment of messageInput.attachments ?? []) {
      await this.prisma.communicationAttachment.upsert({
        where: {
          messageId_providerAttachmentId: {
            messageId,
            providerAttachmentId: attachment.providerAttachmentId ?? ""
          }
        },
        create: {
          messageId,
          projectId: batch.projectId,
          connectorId: batch.connectorId,
          provider: batch.provider,
          providerAttachmentId: attachment.providerAttachmentId ?? "",
          filename: attachment.filename ?? null,
          mimeType: attachment.mimeType ?? null,
          fileSize: attachment.fileSize != null ? BigInt(attachment.fileSize) : null,
          providerUrl: attachment.providerUrl ?? null,
          storageStatus: "metadata_only",
          rawMetadataJson: (attachment.rawMetadata ?? {}) as object
        },
        update: {
          filename: attachment.filename ?? null,
          mimeType: attachment.mimeType ?? null,
          fileSize: attachment.fileSize != null ? BigInt(attachment.fileSize) : null,
          providerUrl: attachment.providerUrl ?? null,
          rawMetadataJson: (attachment.rawMetadata ?? {}) as object
        }
      });
    }
  }
}
