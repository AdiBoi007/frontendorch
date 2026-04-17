import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DocumentVisibility, PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { EmbeddingProvider } from "../../lib/ai/provider.js";
import type { TranscriptionProvider } from "../../lib/ai/provider.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import type { JobDispatcher } from "../../lib/jobs/types.js";
import { JobNames } from "../../lib/jobs/types.js";
import { parseDocumentBuffer } from "../../lib/parsers/index.js";
import { parseTextDocument } from "../../lib/parsers/text.js";
import type { TelemetryService } from "../../lib/observability/telemetry.js";
import { chunkText } from "../../lib/retrieval/chunking.js";
import type { StorageDriver } from "../../lib/storage/types.js";
import { toAnchorId } from "../../lib/utils/anchors.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";

type UploadInput = {
  projectId: string;
  actorUserId: string;
  kind: "prd" | "srs" | "meeting_note" | "call_note" | "reference" | "internal_note" | "other";
  title: string;
  visibility: "internal" | "shared_with_client";
  sourceLabel?: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

type JobPayload = {
  documentVersionId: string;
  parseRevision: number;
};

function ensureNonEmptySections(
  sections: Array<{ title: string; headingPath: string[]; pageNumber: number | null; text: string }>
) {
  return sections
    .map((section) => ({
      ...section,
      text: section.text.trim()
    }))
    .filter((section) => section.text.length > 0);
}

export class DocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageDriver,
    private readonly jobs: JobDispatcher,
    private readonly embeddings: EmbeddingProvider,
    private readonly transcriptionProvider: TranscriptionProvider,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly telemetry: TelemetryService
  ) {}

  async uploadFile(input: UploadInput) {
    await this.projectService.ensureProjectManager(input.projectId, input.actorUserId);

    const checksumSha256 = createHash("sha256").update(input.buffer).digest("hex");
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: input.projectId }
    });

    const existingDocument = await this.prisma.document.findFirst({
      where: {
        projectId: input.projectId,
        kind: input.kind,
        title: input.title,
        visibility: input.visibility
      },
      include: {
        versions: {
          where: {
            checksumSha256
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    const duplicateVersion = existingDocument?.versions[0];
    if (duplicateVersion) {
      await this.auditService.record({
        orgId: project.orgId,
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        eventType: "document_upload_deduplicated",
        entityType: "document_version",
        entityId: duplicateVersion.id,
        payload: { documentId: existingDocument.id, checksumSha256, title: input.title }
      });

      return {
        documentId: existingDocument.id,
        documentVersionId: duplicateVersion.id,
        status: duplicateVersion.status,
        parseRevision: duplicateVersion.parseRevision,
        deduplicated: true
      };
    }

    const fileKey = `${input.projectId}/documents/${checksumSha256}-${input.fileName}`;
    await this.storage.putObject({
      key: fileKey,
      body: input.buffer,
      contentType: input.contentType
    });

    const created = await this.prisma.$transaction(async (tx) => {
      if (existingDocument) {
        const version = await tx.documentVersion.create({
          data: {
            documentId: existingDocument.id,
            projectId: input.projectId,
            fileKey,
            checksumSha256,
            mimeType: input.contentType,
            fileSize: BigInt(input.buffer.length),
            status: "pending",
            sourceLabel: input.sourceLabel,
            uploadedBy: input.actorUserId,
            parseRevision: 1
          }
        });

        await tx.document.update({
          where: { id: existingDocument.id },
          data: {
            currentVersionId: version.id
          }
        });

        return {
          documentId: existingDocument.id,
          documentVersionId: version.id,
          status: version.status,
          parseRevision: version.parseRevision
        };
      }

      const document = await tx.document.create({
        data: {
          projectId: input.projectId,
          kind: input.kind,
          title: input.title,
          uploadedBy: input.actorUserId,
          visibility: input.visibility
        }
      });

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          projectId: input.projectId,
          fileKey,
          checksumSha256,
          mimeType: input.contentType,
          fileSize: BigInt(input.buffer.length),
          status: "pending",
          sourceLabel: input.sourceLabel,
          uploadedBy: input.actorUserId,
          parseRevision: 1
        }
      });

      await tx.document.update({
        where: { id: document.id },
        data: {
          currentVersionId: version.id
        }
      });

      return {
        documentId: document.id,
        documentVersionId: version.id,
        status: version.status,
        parseRevision: version.parseRevision
      };
    });

    const parseKey = jobKeys.parseDocument(created.documentVersionId, created.parseRevision);
    const payload = {
      documentVersionId: created.documentVersionId,
      parseRevision: created.parseRevision
    };

    await this.recordQueuedJob(JobNames.parseDocument, parseKey, payload);
    await this.jobs.enqueue(JobNames.parseDocument, payload, parseKey);

    await this.auditService.record({
      orgId: project.orgId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      eventType: "document_uploaded",
      entityType: "document",
      entityId: created.documentId,
      payload: {
        versionId: created.documentVersionId,
        title: input.title,
        parseRevision: created.parseRevision
      }
    });

    return created;
  }

  async listDocuments(projectId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    return this.prisma.document.findMany({
      where: {
        projectId,
        ...(this.clientDocumentFilter(member.projectRole) ?? {})
      },
      include: {
        versions: {
          take: 1,
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async getDocument(projectId: string, documentId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    return this.prisma.document.findFirstOrThrow({
      where: {
        id: documentId,
        projectId,
        ...(this.clientDocumentFilter(member.projectRole) ?? {})
      },
      include: {
        versions: {
          orderBy: { createdAt: "desc" }
        }
      }
    });
  }

  async getViewerPayload(
    projectId: string,
    documentId: string,
    actorUserId: string,
    opts: { page?: number; pageSize?: number } = {}
  ) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);

    const document = await this.prisma.document.findFirstOrThrow({
      where: {
        id: documentId,
        projectId,
        ...(this.clientDocumentFilter(member.projectRole) ?? {})
      }
    });

    if (!document.currentVersionId) {
      throw new AppError(400, "Document has no current version", "missing_current_version");
    }

    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: {
        id: document.currentVersionId
      }
    });

    const pageSize = Math.min(opts.pageSize ?? 200, 200);
    const page = Math.max(opts.page ?? 1, 1);
    const skip = (page - 1) * pageSize;

    const totalCount = await this.prisma.documentSection.count({
      where: {
        documentVersionId: version.id,
        parseRevision: version.parseRevision
      }
    });

    const sections = await this.prisma.documentSection.findMany({
      where: {
        documentVersionId: version.id,
        parseRevision: version.parseRevision
      },
      orderBy: {
        orderIndex: "asc"
      },
      skip,
      take: pageSize
    });

    const sectionIds = sections.map((section) => section.id);
    const acceptedLinks = sectionIds.length
      ? await this.prisma.specChangeLink.findMany({
          where: {
            projectId,
            linkType: "document_section",
            linkRefId: {
              in: sectionIds
            },
            proposal: {
              status: "accepted"
            }
          },
          include: {
            proposal: {
              include: {
                decisionRecord: true
              }
            }
          }
        })
      : [];

    const proposalIds = Array.from(new Set(acceptedLinks.map((link) => link.specChangeProposalId)));
    const proposalMessageLinks = proposalIds.length
      ? await this.prisma.specChangeLink.findMany({
          where: {
            projectId,
            specChangeProposalId: {
              in: proposalIds
            },
            linkType: {
              in: ["message", "thread"]
            }
          }
        })
      : [];

    const messageIds = proposalMessageLinks
      .filter((link) => link.linkType === "message")
      .map((link) => link.linkRefId);
    const threadIds = proposalMessageLinks
      .filter((link) => link.linkType === "thread")
      .map((link) => link.linkRefId);

    const [messages, threads] = await Promise.all([
      messageIds.length
        ? this.prisma.communicationMessage.findMany({
            where: {
              id: {
                in: messageIds
              }
            }
          })
        : Promise.resolve([]),
      threadIds.length
        ? this.prisma.communicationThread.findMany({
            where: {
              id: {
                in: threadIds
              }
            }
          })
        : Promise.resolve([])
    ]);

    const messageById = new Map(messages.map((message) => [message.id, message]));
    const threadById = new Map(threads.map((thread) => [thread.id, thread]));

    const messageRefsByProposal = proposalMessageLinks.reduce<
      Record<string, Array<Record<string, string | null>>>
    >((accumulator, link) => {
      accumulator[link.specChangeProposalId] ??= [];

      if (link.linkType === "message") {
        const message = messageById.get(link.linkRefId);
        accumulator[link.specChangeProposalId].push({
          type: "message",
          id: link.linkRefId,
          senderLabel: message?.senderLabel ?? null,
          sentAt: message?.sentAt.toISOString?.() ?? null,
          threadId: message?.threadId ?? null
        });
      } else {
        const thread = threadById.get(link.linkRefId);
        accumulator[link.specChangeProposalId].push({
          type: "thread",
          id: link.linkRefId,
          subject: thread?.subject ?? null,
          lastMessageAt: thread?.lastMessageAt?.toISOString?.() ?? null
        });
      }

      return accumulator;
    }, {});

    const markersBySection = acceptedLinks.reduce<
      Record<
        string,
        Array<{
          changeProposalId: string;
          status: string;
          acceptedAt: string | null;
          acceptedBy: string | null;
        }>
      >
    >((accumulator, link) => {
      accumulator[link.linkRefId] ??= [];
      accumulator[link.linkRefId].push({
        changeProposalId: link.specChangeProposalId,
        status: link.proposal.status,
        acceptedAt: link.proposal.acceptedAt?.toISOString() ?? null,
        acceptedBy: link.proposal.acceptedBy ?? null
      });
      return accumulator;
    }, {});

    const decisionIdsBySection = acceptedLinks.reduce<Record<string, string[]>>((accumulator, link) => {
      if (!link.proposal.decisionRecordId) {
        return accumulator;
      }

      accumulator[link.linkRefId] ??= [];
      accumulator[link.linkRefId].push(link.proposal.decisionRecordId);
      return accumulator;
    }, {});

    const messageRefsBySection = acceptedLinks.reduce<Record<string, Array<Record<string, string | null>>>>(
      (accumulator, link) => {
        accumulator[link.linkRefId] ??= [];
        accumulator[link.linkRefId].push(...(messageRefsByProposal[link.specChangeProposalId] ?? []));
        return accumulator;
      },
      {}
    );

    return {
      document: {
        id: document.id,
        title: document.title,
        kind: document.kind,
        currentVersionId: version.id
      },
      version: {
        id: version.id,
        status: version.status,
        parseRevision: version.parseRevision,
        parseConfidence: version.parseConfidence,
        sourceLabel: version.sourceLabel
      },
      sections: sections.map((section) => ({
        sectionId: section.id,
        anchorId: section.anchorId,
        pageNumber: section.pageNumber,
        headingPath: section.headingPath,
        text: section.normalizedText,
        changeMarkers: markersBySection[section.id] ?? [],
        linkedDecisionIds: Array.from(new Set(decisionIdsBySection[section.id] ?? [])),
        linkedMessageRefs: messageRefsBySection[section.id] ?? []
      })),
      meta: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasMore: skip + sections.length < totalCount
      }
    };
  }

  async getAnchor(projectId: string, documentId: string, anchorId: string, actorUserId: string) {
    const payload = await this.getViewerPayload(projectId, documentId, actorUserId);
    const section = payload.sections.find((item) => item.anchorId === anchorId);

    if (!section) {
      throw new AppError(404, "Anchor not found", "anchor_not_found");
    }

    return {
      document: payload.document,
      version: payload.version,
      section
    };
  }

  async reprocess(projectId: string, documentId: string, actorUserId: string) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);
    const document = await this.prisma.document.findFirstOrThrow({
      where: {
        id: documentId,
        projectId
      },
      include: {
        project: true
      }
    });

    if (!document.currentVersionId) {
      throw new AppError(400, "Document has no current version", "missing_current_version");
    }

    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: {
        id: document.currentVersionId
      }
    });

    const nextParseRevision = version.parseRevision + 1;
    await this.prisma.documentVersion.update({
      where: { id: version.id },
      data: {
        status: "pending",
        parseRevision: nextParseRevision,
        parseConfidence: null,
        parseWarningJson: Prisma.DbNull,
        processedAt: null
      }
    });

    const payload = {
      documentVersionId: version.id,
      parseRevision: nextParseRevision
    };
    const parseKey = jobKeys.parseDocument(version.id, nextParseRevision);

    await this.recordQueuedJob(JobNames.parseDocument, parseKey, payload);
    await this.jobs.enqueue(JobNames.parseDocument, payload, parseKey);

    await this.auditService.record({
      orgId: document.project.orgId,
      projectId,
      actorUserId,
      eventType: "document_reprocessed",
      entityType: "document_version",
      entityId: version.id,
      payload: {
        parseRevision: nextParseRevision
      }
    });

    return {
      ok: true,
      documentVersionId: version.id,
      parseRevision: nextParseRevision
    };
  }

  async processDocumentVersion(documentVersionId: string, parseRevision?: number) {
    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: documentVersionId },
      include: {
        document: true
      }
    });

    const targetParseRevision = parseRevision ?? version.parseRevision;
    const parseKey = jobKeys.parseDocument(documentVersionId, targetParseRevision);

    if (version.parseRevision !== targetParseRevision) {
      await this.finishJob(JobNames.parseDocument, parseKey);
      return { skipped: true, reason: "stale_parse_revision" as const };
    }

    await this.startJob(JobNames.parseDocument, parseKey, {
      documentVersionId,
      parseRevision: targetParseRevision
    });
    await this.prisma.documentVersion.update({
      where: { id: documentVersionId },
      data: { status: "processing" }
    });

    try {
      const buffer = await this.storage.getObject(version.fileKey);
      const parsed = await this.parseVersionContent(version.mimeType, buffer, version.document.title);
      const sections = ensureNonEmptySections(parsed.sections);

      if (sections.length === 0) {
        throw new AppError(422, "Parser returned no usable sections", "empty_parse_result");
      }

      await this.prisma.documentChunk.deleteMany({
        where: {
          documentVersionId,
          parseRevision: targetParseRevision
        }
      });
      await this.prisma.documentSection.deleteMany({
        where: {
          documentVersionId,
          parseRevision: targetParseRevision
        }
      });

      for (const [index, section] of sections.entries()) {
        await this.prisma.documentSection.create({
          data: {
            documentVersionId,
            projectId: version.projectId,
            parseRevision: targetParseRevision,
            sectionKey: `${targetParseRevision}-${index + 1}`,
            headingPath: section.headingPath,
            pageNumber: section.pageNumber,
            pageStart: section.pageNumber,
            pageEnd: section.pageNumber,
            anchorId: toAnchorId(section.title, index),
            anchorText: section.title,
            normalizedText: section.text,
            orderIndex: index,
            metadataJson: { title: section.title }
          }
        });
      }

      await this.prisma.documentVersion.updateMany({
        where: {
          id: documentVersionId,
          parseRevision: targetParseRevision
        },
        data: {
          status: "processing",
          parseConfidence: "0.900",
          parseWarningJson: Prisma.DbNull,
          processedAt: new Date()
        }
      });

      await this.finishJob(JobNames.parseDocument, parseKey);
      const payload = {
        documentVersionId,
        parseRevision: targetParseRevision
      };
      const chunkKey = jobKeys.chunkDocument(documentVersionId, targetParseRevision);
      await this.recordQueuedJob(JobNames.chunkDocument, chunkKey, payload);
      await this.jobs.enqueue(JobNames.chunkDocument, payload, chunkKey);
      return { skipped: false };
    } catch (error) {
      await this.prisma.documentVersion.updateMany({
        where: {
          id: documentVersionId,
          parseRevision: targetParseRevision
        },
        data: {
          status: "failed",
          parseWarningJson: {
            error: error instanceof Error ? error.message : "Unknown parse error"
          }
        }
      });
      await this.failJob(JobNames.parseDocument, parseKey, error);
      throw error;
    }
  }

  async chunkDocumentVersion(documentVersionId: string, parseRevision?: number) {
    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: documentVersionId },
      include: {
        document: true
      }
    });

    const targetParseRevision = parseRevision ?? version.parseRevision;
    const chunkKey = jobKeys.chunkDocument(documentVersionId, targetParseRevision);

    if (version.parseRevision !== targetParseRevision) {
      await this.finishJob(JobNames.chunkDocument, chunkKey);
      return { skipped: true, reason: "stale_parse_revision" as const };
    }

    await this.startJob(JobNames.chunkDocument, chunkKey, {
      documentVersionId,
      parseRevision: targetParseRevision
    });

    try {
      const sections = await this.prisma.documentSection.findMany({
        where: {
          documentVersionId,
          parseRevision: targetParseRevision
        },
        orderBy: {
          orderIndex: "asc"
        }
      });

      if (sections.length === 0) {
        throw new AppError(422, "No parsed sections available to chunk", "missing_sections_for_chunking");
      }

      await this.prisma.documentChunk.deleteMany({
        where: {
          documentVersionId,
          parseRevision: targetParseRevision
        }
      });

      let globalChunkIndex = 0;
      for (const section of sections) {
        const chunks = chunkText({
          content: section.normalizedText,
          documentTitle: version.document.title,
          kind: version.document.kind,
          headingPath: section.headingPath,
          pageNumber: section.pageNumber
        });

        for (const chunk of chunks) {
          await this.prisma.documentChunk.create({
            data: {
              documentVersionId,
              sectionId: section.id,
              projectId: version.projectId,
              parseRevision: targetParseRevision,
              chunkIndex: globalChunkIndex,
              content: chunk.content,
              contextualContent: chunk.contextualContent,
              lexicalContent: chunk.contextualContent,
              tokenCount: chunk.tokenCount,
              pageNumber: section.pageNumber,
              metadataJson: {
                headingPath: section.headingPath,
                anchorId: section.anchorId,
                sectionChunkIndex: chunk.chunkIndex
              }
            }
          });
          globalChunkIndex += 1;
        }
      }

      await this.finishJob(JobNames.chunkDocument, chunkKey);
      const payload = {
        documentVersionId,
        parseRevision: targetParseRevision
      };
      const embedKey = jobKeys.embedDocumentChunks(documentVersionId, targetParseRevision);
      await this.recordQueuedJob(JobNames.embedDocumentChunks, embedKey, payload);
      await this.jobs.enqueue(JobNames.embedDocumentChunks, payload, embedKey);
      return { skipped: false };
    } catch (error) {
      await this.failJob(JobNames.chunkDocument, chunkKey, error);
      throw error;
    }
  }

  async embedDocumentChunks(documentVersionId: string, parseRevision?: number) {
    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: documentVersionId }
    });

    const targetParseRevision = parseRevision ?? version.parseRevision;
    const embedKey = jobKeys.embedDocumentChunks(documentVersionId, targetParseRevision);

    if (version.parseRevision !== targetParseRevision) {
      await this.finishJob(JobNames.embedDocumentChunks, embedKey);
      return { skipped: true, reason: "stale_parse_revision" as const };
    }

    await this.startJob(JobNames.embedDocumentChunks, embedKey, {
      documentVersionId,
      parseRevision: targetParseRevision
    });
    try {
      const chunks = await this.prisma.documentChunk.findMany({
        where: {
          documentVersionId,
          parseRevision: targetParseRevision
        },
        orderBy: {
          chunkIndex: "asc"
        }
      });

      if (chunks.length === 0) {
        throw new AppError(422, "No chunks available to embed", "missing_chunks_for_embedding");
      }

      for (const chunk of chunks) {
        const embedding = await this.embeddings.embedText(chunk.contextualContent ?? chunk.content);
        const vectorLiteral = `[${embedding.join(",")}]`;
        await this.prisma.$executeRawUnsafe(
          "UPDATE document_chunks SET embedding = CAST($1 AS vector) WHERE id = CAST($2 AS uuid)",
          vectorLiteral,
          chunk.id
        );
      }

      await this.prisma.documentVersion.updateMany({
        where: {
          id: documentVersionId,
          parseRevision: targetParseRevision
        },
        data: { status: "ready" }
      });

      await this.finishJob(JobNames.embedDocumentChunks, embedKey);
      const sourceKey = jobKeys.generateSourcePackage(version.projectId, await this.buildSourcePackageSignature(version.projectId));
      await this.recordQueuedJob(JobNames.generateSourcePackage, sourceKey, { projectId: version.projectId });
      await this.jobs.enqueue(JobNames.generateSourcePackage, { projectId: version.projectId }, sourceKey);
      return { skipped: false };
    } catch (error) {
      await this.prisma.documentVersion.updateMany({
        where: {
          id: documentVersionId,
          parseRevision: targetParseRevision
        },
        data: { status: "partial" }
      });
      await this.failJob(JobNames.embedDocumentChunks, embedKey, error);
      throw error;
    }
  }

  private async buildSourcePackageSignature(projectId: string) {
    const readyVersions = await this.prisma.documentVersion.findMany({
      where: {
        projectId,
        status: "ready"
      },
      select: {
        id: true,
        checksumSha256: true,
        parseRevision: true,
        processedAt: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return createHash("sha256").update(JSON.stringify(readyVersions)).digest("hex").slice(0, 16);
  }

  private async recordQueuedJob(jobType: string, idempotencyKey: string, payload: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        status: "pending",
        payloadJson: payload as object,
        lastError: null,
        finishedAt: null
      },
      create: {
        jobType,
        status: "pending",
        idempotencyKey,
        payloadJson: payload as object
      }
    });
  }

  private async startJob(jobType: string, idempotencyKey: string, payload?: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "running",
        payloadJson: payload as object | undefined,
        startedAt: new Date(),
        finishedAt: null,
        lastError: null,
        attemptCount: {
          increment: 1
        }
      },
      create: {
        jobType,
        status: "running",
        idempotencyKey,
        payloadJson: payload as object | undefined,
        startedAt: new Date(),
        attemptCount: 1
      }
    });
  }

  private async finishJob(jobType: string, idempotencyKey: string) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "completed",
        finishedAt: new Date(),
        lastError: null
      },
      create: {
        jobType,
        status: "completed",
        idempotencyKey,
        finishedAt: new Date()
      }
    });
  }

  private async failJob(jobType: string, idempotencyKey: string, error: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "failed",
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      },
      create: {
        jobType,
        status: "failed",
        idempotencyKey,
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }

  private clientDocumentFilter(projectRole: string) {
    if (projectRole !== "client") {
      return null;
    }

    return {
      visibility: "shared_with_client" as DocumentVisibility
    };
  }

  private async parseVersionContent(contentType: string, buffer: Buffer, title: string) {
    const startedAt = process.hrtime.bigint();
    try {
      if (contentType.toLowerCase().startsWith("audio/")) {
        const transcript = await this.transcriptionProvider.transcribeAudio({
          fileName: title,
          contentType,
          buffer
        });

        this.telemetry.increment("orchestra_voice_transcriptions_total", {
          provider: transcript.provider
        });
        return parseTextDocument(transcript.text);
      }

      return await parseDocumentBuffer(contentType, buffer, title);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.telemetry.observeDuration("orchestra_document_parse_duration_ms", durationMs, {
        parser: contentType.toLowerCase().startsWith("audio/") ? "audio_transcription" : "document_parser"
      });
    }
  }
}
