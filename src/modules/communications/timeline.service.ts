import type { PrismaClient, ProjectRole } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { decodeCursor, encodeCursor } from "../../lib/communications/sync-cursors.js";
import { ensureCommunicationReadAccess } from "./authz.js";
import type { ProjectService } from "../projects/service.js";
import { AuditService } from "../audit/service.js";

type CursorShape = {
  lastMessageAt: string;
  id: string;
};

export class TimelineService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService
  ) {}

  async getTimeline(
    projectId: string,
    actorUserId: string,
    query: {
      provider?: string;
      hasChangeProposal?: boolean;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      cursor?: string;
      limit: number;
    }
  ) {
    const member = await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const result = await this.listThreadsInternal(projectId, query, true);

    await this.auditService.record({
      orgId: await this.resolveOrgId(projectId),
      projectId,
      actorUserId,
      eventType: "communication_thread_opened",
      entityType: "communication_timeline",
      payload: { count: result.items.length, projectRole: member.projectRole }
    });

    return result;
  }

  async listThreads(
    projectId: string,
    actorUserId: string,
    query: {
      provider?: string;
      updatedSince?: string;
      search?: string;
      cursor?: string;
      limit: number;
    }
  ) {
    await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    return this.listThreadsInternal(projectId, {
      provider: query.provider,
      dateFrom: query.updatedSince,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit
    }, false);
  }

  async getThread(projectId: string, threadId: string, actorUserId: string) {
    const member = await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const thread = await this.prisma.communicationThread.findFirstOrThrow({
      where: { id: threadId, projectId },
      include: {
        connector: true,
        messages: {
          orderBy: { sentAt: "asc" },
          include: {
            attachments: true
          }
        }
      }
    });

    const links = await this.prisma.specChangeLink.findMany({
      where: {
        projectId,
        OR: [
          { linkType: "thread", linkRefId: thread.id },
          { linkType: "message", linkRefId: { in: thread.messages.map((message) => message.id) } }
        ]
      },
      include: {
        proposal: {
          include: { decisionRecord: true }
        }
      }
    });

    const proposals = this.mapProposalLinks(links);
    const decisions = this.mapDecisions(links);

    return {
      thread: {
        id: thread.id,
        connectorId: thread.connectorId,
        provider: thread.provider,
        providerThreadId: thread.providerThreadId,
        subject: thread.subject,
        participants: thread.participantsJson,
        threadUrl: thread.threadUrl,
        startedAt: thread.startedAt?.toISOString() ?? null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null
      },
      connector: {
        id: thread.connector.id,
        provider: thread.connector.provider,
        accountLabel: thread.connector.accountLabel,
        status: thread.connector.status
      },
      messages: thread.messages.map((message) => ({
        id: message.id,
        providerMessageId: message.providerMessageId,
        providerPermalink: message.providerPermalink,
        senderLabel: message.senderLabel,
        senderExternalRef: message.senderExternalRef,
        senderEmail: message.senderEmail,
        sentAt: message.sentAt.toISOString(),
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        messageType: message.messageType,
        isEdited: message.isEdited,
        replyToMessageId: message.replyToMessageId,
        attachmentCount: message.attachments.length
      })),
      linkedChanges: proposals,
      linkedDecisions: decisions,
      openTargets: {
        thread: this.buildThreadOpenTarget(thread.id),
        documents: await this.loadDocumentTargets(projectId, proposals.map((proposal) => proposal.proposalId))
      },
      viewerState: {
        pageContext: "doc_viewer" as const,
        selectedRefType: "document" as const,
        selectedRefId: (await this.loadDocumentTargets(projectId, proposals.map((proposal) => proposal.proposalId)))[0]?.targetRef.documentId ?? null
      },
      projectRole: member.projectRole
    };
  }

  async getMessage(projectId: string, messageId: string, actorUserId: string) {
    const member = await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const message = await this.prisma.communicationMessage.findFirstOrThrow({
      where: { id: messageId, projectId },
      include: {
        connector: true,
        thread: true,
        revisions: { orderBy: { revisionIndex: "desc" } },
        attachments: true,
        chunks: { orderBy: { chunkIndex: "asc" } }
      }
    });

    const links = await this.prisma.specChangeLink.findMany({
      where: {
        projectId,
        OR: [
          { linkType: "message", linkRefId: message.id },
          { linkType: "thread", linkRefId: message.threadId }
        ]
      },
      include: {
        proposal: {
          include: { decisionRecord: true }
        }
      }
    });
    const proposals = this.mapProposalLinks(links);
    const decisions = this.mapDecisions(links);
    const documentTargets = await this.loadDocumentTargets(projectId, proposals.map((proposal) => proposal.proposalId));

    await this.auditService.record({
      orgId: await this.resolveOrgId(projectId),
      projectId,
      actorUserId,
      eventType: "communication_message_opened",
      entityType: "communication_message",
      entityId: message.id,
      payload: { projectRole: member.projectRole }
    });

    return {
      connector: {
        id: message.connector.id,
        provider: message.connector.provider,
        accountLabel: message.connector.accountLabel,
        status: message.connector.status
      },
      thread: {
        id: message.thread.id,
        providerThreadId: message.thread.providerThreadId,
        subject: message.thread.subject,
        participants: message.thread.participantsJson,
        threadUrl: message.thread.threadUrl,
        openTarget: this.buildThreadOpenTarget(message.thread.id)
      },
      message: {
        id: message.id,
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        providerPermalink: message.providerPermalink,
        senderLabel: message.senderLabel,
        senderExternalRef: message.senderExternalRef,
        senderEmail: message.senderEmail,
        sentAt: message.sentAt.toISOString(),
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        bodyHash: message.bodyHash,
        messageType: message.messageType,
        isEdited: message.isEdited,
        isDeletedByProvider: message.isDeletedByProvider,
        replyToMessageId: message.replyToMessageId
      },
      revisions: message.revisions.map((revision) => ({
        id: revision.id,
        revisionIndex: revision.revisionIndex,
        bodyText: revision.bodyText,
        bodyHtml: revision.bodyHtml,
        bodyHash: revision.bodyHash,
        editedAt: revision.editedAt?.toISOString() ?? null,
        createdAt: revision.createdAt.toISOString()
      })),
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        providerAttachmentId: attachment.providerAttachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize != null ? Number(attachment.fileSize) : null,
        providerUrl: attachment.providerUrl,
        storageStatus: attachment.storageStatus
      })),
      chunks: message.chunks.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        createdAt: chunk.createdAt.toISOString()
      })),
      linkedChanges: proposals,
      linkedDecisions: decisions,
      linkedDocuments: documentTargets,
      openTargets: {
        thread: this.buildThreadOpenTarget(message.thread.id),
        message: this.buildMessageOpenTarget(message.id),
        documents: documentTargets
      }
    };
  }

  private async listThreadsInternal(
    projectId: string,
    query: {
      provider?: string;
      hasChangeProposal?: boolean;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      cursor?: string;
      limit: number;
    },
    includeAttention: boolean
  ) {
    const cursor = decodeCursor<CursorShape>(query.cursor);
    const threads = await this.prisma.communicationThread.findMany({
      where: {
        projectId,
        ...(query.provider ? { provider: query.provider as never } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              lastMessageAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {})
              }
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { subject: { contains: query.search, mode: "insensitive" } },
                { normalizedSubject: { contains: query.search.toLowerCase(), mode: "insensitive" } },
                {
                  messages: {
                    some: {
                      bodyText: { contains: query.search, mode: "insensitive" }
                    }
                  }
                }
              ]
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { lastMessageAt: { lt: new Date(cursor.lastMessageAt) } },
                { lastMessageAt: new Date(cursor.lastMessageAt), id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: {
        connector: true,
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1
        }
      }
    });

    const proposalCounts = await this.prisma.specChangeLink.groupBy({
      by: ["linkRefId"],
      where: {
        projectId,
        linkType: "thread",
        linkRefId: { in: threads.map((thread) => thread.id) }
      },
      _count: { _all: true }
    }).catch(() => []);
    const proposalCountByThreadId = new Map(proposalCounts.map((item) => [item.linkRefId, item._count._all]));

    let filteredThreads = threads;
    if (query.hasChangeProposal !== undefined) {
      filteredThreads = threads.filter((thread) => {
        const hasLinks = (proposalCountByThreadId.get(thread.id) ?? 0) > 0;
        return query.hasChangeProposal ? hasLinks : !hasLinks;
      });
    }

    const hasMore = filteredThreads.length > query.limit;
    const pageItems = filteredThreads.slice(0, query.limit);
    const nextCursor =
      hasMore && pageItems.length > 0
        ? encodeCursor({
            lastMessageAt: pageItems[pageItems.length - 1].lastMessageAt?.toISOString() ?? new Date(0).toISOString(),
            id: pageItems[pageItems.length - 1].id
          })
        : null;

    return {
      items: pageItems.map((thread) => ({
        threadId: thread.id,
        connectorId: thread.connectorId,
        provider: thread.provider,
        accountLabel: thread.connector.accountLabel,
        providerThreadId: thread.providerThreadId,
        subject: thread.subject,
        participants: thread.participantsJson,
        startedAt: thread.startedAt?.toISOString() ?? null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        latestMessage: thread.messages[0]
          ? {
              id: thread.messages[0].id,
              senderLabel: thread.messages[0].senderLabel,
              sentAt: thread.messages[0].sentAt.toISOString(),
              excerpt: thread.messages[0].bodyText.slice(0, 220)
            }
          : null,
        changeProposalCount: proposalCountByThreadId.get(thread.id) ?? 0,
        openTarget: this.buildThreadOpenTarget(thread.id),
        attention:
          includeAttention && (proposalCountByThreadId.get(thread.id) ?? 0) > 0
            ? { label: "watch", reason: "linked change proposals" }
            : null
      })),
      meta: {
        limit: query.limit,
        nextCursor,
        hasMore
      }
    };
  }

  private mapProposalLinks(
    links: Array<{
      specChangeProposalId: string;
      proposal: {
        id: string;
        title: string;
        summary: string;
        proposalType: string;
        status: string;
        decisionRecordId: string | null;
        decisionRecord: { id: string; title: string; statement: string; status: string } | null;
      };
    }>
  ) {
    return links
      .filter(
        (link, index, collection) =>
          collection.findIndex((candidate) => candidate.specChangeProposalId === link.specChangeProposalId) === index
      )
      .map((link) => ({
        proposalId: link.proposal.id,
        title: link.proposal.title,
        summary: link.proposal.summary,
        proposalType: link.proposal.proposalType,
        status: link.proposal.status,
        openTarget: {
          targetType: "change_proposal" as const,
          targetRef: { proposalId: link.proposal.id }
        }
      }));
  }

  private mapDecisions(
    links: Array<{
      proposal: {
        decisionRecordId: string | null;
        decisionRecord: { id: string; title: string; statement: string; status: string } | null;
      };
    }>
  ) {
    const decisions = new Map<string, { id: string; title: string; statement: string; status: string }>();
    for (const link of links) {
      if (link.proposal.decisionRecord) {
        decisions.set(link.proposal.decisionRecord.id, link.proposal.decisionRecord);
      }
    }

    return Array.from(decisions.values()).map((decision) => ({
      decisionId: decision.id,
      title: decision.title,
      statement: decision.statement,
      status: decision.status,
      openTarget: {
        targetType: "decision_record" as const,
        targetRef: { decisionId: decision.id }
      }
    }));
  }

  private async loadDocumentTargets(projectId: string, proposalIds: string[]) {
    if (proposalIds.length === 0) {
      return [];
    }

    const sectionLinks = await this.prisma.specChangeLink.findMany({
      where: {
        projectId,
        specChangeProposalId: { in: proposalIds },
        linkType: "document_section"
      }
    });
    if (sectionLinks.length === 0) {
      return [];
    }

    const sections = await this.prisma.documentSection.findMany({
      where: {
        projectId,
        id: { in: sectionLinks.map((link) => link.linkRefId) }
      },
      include: {
        documentVersion: {
          include: { document: true }
        }
      }
    });

    return sections.map((section) => ({
      sectionId: section.id,
      anchorId: section.anchorId,
      pageNumber: section.pageNumber,
      documentId: section.documentVersion.documentId,
      documentTitle: section.documentVersion.document.title,
      targetType: "document_section" as const,
      targetRef: {
        documentId: section.documentVersion.documentId,
        documentVersionId: section.documentVersionId,
        anchorId: section.anchorId,
        pageNumber: section.pageNumber ?? undefined
      }
    }));
  }

  private buildThreadOpenTarget(threadId: string) {
    return {
      targetType: "thread" as const,
      targetRef: { threadId }
    };
  }

  private buildMessageOpenTarget(messageId: string) {
    return {
      targetType: "message" as const,
      targetRef: { messageId }
    };
  }

  private async resolveOrgId(projectId: string) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });

    return project.orgId;
  }
}
