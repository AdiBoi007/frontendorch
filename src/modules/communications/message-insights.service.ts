import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher } from "../../lib/jobs/types.js";
import type { TelemetryService } from "../../lib/observability/telemetry.js";
import type { GenerationProvider } from "../../lib/ai/provider.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";
import { ensureCommunicationManager, ensureCommunicationReadAccess } from "./authz.js";
import { CommunicationProposalsService } from "./communication-proposals.service.js";
import { buildInsightClassifierSystemPrompt, buildMessageInsightPrompt, communicationInsightOutputSchema, type CommunicationInsightOutput } from "./insight-classifier.prompt.js";
import { ImpactResolverService } from "./impact-resolver.service.js";

function toNumber(value: Prisma.Decimal | number) {
  return value instanceof Prisma.Decimal ? value.toNumber() : value;
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

type ValidatedRefs = {
  documentSectionIds: string[];
  brainNodeIds: string[];
};

export class MessageInsightsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generationProvider: GenerationProvider,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher,
    private readonly impactResolver: ImpactResolverService,
    private readonly proposalService: CommunicationProposalsService,
    private readonly telemetry: TelemetryService
  ) {}
  async list(
    projectId: string,
    actorUserId: string,
    query: {
      status?: string;
      insightType?: string;
      threadId?: string;
      messageId?: string;
      provider?: string;
      minConfidence?: number;
      hasProposal?: boolean;
      cursor?: string;
      limit: number;
    }
  ) {
    await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);

    const items = await this.prisma.messageInsight.findMany({
      where: {
        projectId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.insightType ? { insightType: query.insightType as never } : {}),
        ...(query.threadId ? { threadId: query.threadId } : {}),
        ...(query.messageId ? { messageId: query.messageId } : {}),
        ...(query.provider ? { provider: query.provider as never } : {}),
        ...(query.minConfidence != null ? { confidence: { gte: new Prisma.Decimal(query.minConfidence) } } : {}),
        ...(query.hasProposal === true ? { generatedProposalId: { not: null } } : {}),
        ...(query.hasProposal === false ? { generatedProposalId: null } : {})
      },
      include: {
        message: true,
        thread: true
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1
    });

    const hasMore = items.length > query.limit;
    const page = items.slice(0, query.limit);

    return {
      items: page.map((item) => this.mapInsightSummary(item)),
      meta: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
      }
    };
  }

  async get(projectId: string, insightId: string, actorUserId: string) {
    await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const insight = await this.prisma.messageInsight.findFirstOrThrow({
      where: { id: insightId, projectId },
      include: {
        message: true,
        thread: true,
        generatedProposal: {
          include: { links: true, decisionRecord: true }
        },
        generatedDecision: true
      }
    });

    return {
      ...this.mapInsightSummary(insight),
      evidence: insight.evidenceJson,
      oldUnderstanding: insight.oldUnderstandingJson,
      newUnderstanding: insight.newUnderstandingJson,
      impactSummary: insight.impactSummaryJson,
      uncertainty: Array.isArray(insight.uncertaintyJson) ? insight.uncertaintyJson : [],
      generatedProposal: insight.generatedProposal
        ? {
            id: insight.generatedProposal.id,
            title: insight.generatedProposal.title,
            status: insight.generatedProposal.status,
            proposalType: insight.generatedProposal.proposalType,
            decisionRecordId: insight.generatedProposal.decisionRecordId
          }
        : null,
      generatedDecision: insight.generatedDecision
        ? {
            id: insight.generatedDecision.id,
            title: insight.generatedDecision.title,
            status: insight.generatedDecision.status
          }
        : null
    };
  }

  async ignore(projectId: string, insightId: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });

    const insight = await this.prisma.messageInsight.update({
      where: { id: insightId },
      data: { status: "ignored" }
    });

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "message_insight_ignored",
      entityType: "message_insight",
      entityId: insightId,
      payload: {}
    });

    return this.get(projectId, insightId, actorUserId);
  }

  async classifyMessage(projectId: string, messageId: string, actorUserId: string | null) {
    if (actorUserId) {
      await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    }

    const context = await this.impactResolver.buildMessageContext(projectId, messageId);
    const prompt = buildMessageInsightPrompt({
      targetKind: "message",
      content: [
        `Thread subject: ${context.thread.subject ?? "(none)"}`,
        ...context.threadMessages.map((item) => `${item.senderLabel} @ ${item.sentAt.toISOString()}: ${item.bodyText}`)
      ].join("\n"),
      acceptedProductBrainSummary: context.acceptedProductBrainSummary,
      candidateSections: context.candidateSections,
      candidateBrainNodes: context.candidateBrainNodes,
      acceptedChanges: context.acceptedChanges,
      acceptedDecisions: context.acceptedDecisions,
      unresolvedProposals: context.unresolvedProposals
    });

    const output = await this.generationProvider.generateObject({
      schema: communicationInsightOutputSchema,
      systemPrompt: buildInsightClassifierSystemPrompt(),
      prompt,
      fallback: () => this.heuristicFallback(context.target.bodyText)
    });

    const validatedRefs = this.validateRefs(output, context.candidateSections, context.candidateBrainNodes);
    const confidence = this.adjustConfidence(output, validatedRefs);
    const shouldCreateProposal = this.shouldCreateProposal(output, confidence, validatedRefs);
    const shouldCreateDecision = this.shouldCreateDecision(output, confidence);

    const insight = await this.prisma.messageInsight.upsert({
      where: {
        messageId_bodyHash: {
          messageId: context.target.id,
          bodyHash: context.target.bodyHash
        }
      },
      create: {
        projectId,
        connectorId: context.target.connectorId,
        provider: context.target.provider,
        messageId: context.target.id,
        threadId: context.thread.id,
        bodyHash: context.target.bodyHash,
        insightType: output.insightType,
        status: "detected",
        summary: output.summary,
        confidence: new Prisma.Decimal(confidence.toFixed(3)),
        shouldCreateProposal,
        shouldCreateDecision,
        proposalType: output.proposalType,
        affectedRefsJson: {
          documentSectionIds: validatedRefs.documentSectionIds,
          brainNodeIds: validatedRefs.brainNodeIds
        },
        evidenceJson: {
          sourceMessageIds: [context.target.id],
          threadId: context.thread.id,
          candidateSectionIds: context.candidateSections.map((item) => item.id),
          candidateBrainNodeIds: context.candidateBrainNodes.map((item) => item.id)
        },
        oldUnderstandingJson: toJsonInput(output.oldUnderstanding ?? undefined),
        newUnderstandingJson: toJsonInput(output.newUnderstanding ?? undefined),
        decisionStatement: output.decisionStatement,
        impactSummaryJson: toJsonInput(output.impactSummary ?? undefined),
        uncertaintyJson: output.uncertainty,
        modelJson: {
          provider: this.generationProvider.constructor.name
        }
      },
      update: {
        insightType: output.insightType,
        status: "detected",
        summary: output.summary,
        confidence: new Prisma.Decimal(confidence.toFixed(3)),
        shouldCreateProposal,
        shouldCreateDecision,
        proposalType: output.proposalType,
        affectedRefsJson: {
          documentSectionIds: validatedRefs.documentSectionIds,
          brainNodeIds: validatedRefs.brainNodeIds
        },
        evidenceJson: {
          sourceMessageIds: [context.target.id],
          threadId: context.thread.id,
          candidateSectionIds: context.candidateSections.map((item) => item.id),
          candidateBrainNodeIds: context.candidateBrainNodes.map((item) => item.id)
        },
        oldUnderstandingJson: toJsonInput(output.oldUnderstanding ?? undefined),
        newUnderstandingJson: toJsonInput(output.newUnderstanding ?? undefined),
        decisionStatement: output.decisionStatement,
        impactSummaryJson: toJsonInput(output.impactSummary ?? undefined),
        uncertaintyJson: output.uncertainty,
        modelJson: {
          provider: this.generationProvider.constructor.name
        }
      }
    });

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });
    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId: actorUserId ?? undefined,
      eventType: "message_insight_created",
      entityType: "message_insight",
      entityId: insight.id,
      payload: {
        messageId,
        insightType: insight.insightType,
        confidence
      }
    });
    this.telemetry.increment("communication_insights_created_total", {
      insight_type: insight.insightType,
      provider: context.target.provider
    });

    if ((shouldCreateProposal || shouldCreateDecision) && !insight.generatedProposalId) {
      const key = jobKeys.generateChangeProposalFromInsight(insight.id);
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: key },
        update: {
          jobType: JobNames.generateChangeProposalFromInsight,
          status: "pending",
          payloadJson: { projectId, insightId: insight.id, idempotencyKey: key }
        },
        create: {
          jobType: JobNames.generateChangeProposalFromInsight,
          status: "pending",
          idempotencyKey: key,
          payloadJson: { projectId, insightId: insight.id, idempotencyKey: key }
        }
      });
      await this.jobs.enqueue(JobNames.generateChangeProposalFromInsight, { projectId, insightId: insight.id, idempotencyKey: key }, key);
    }

    const threadKey = jobKeys.classifyThreadInsight(context.thread.id, context.threadStateHash);
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey: threadKey },
      update: {
        jobType: JobNames.classifyThreadInsight,
        status: "pending",
        payloadJson: { projectId, threadId: context.thread.id, idempotencyKey: threadKey }
      },
      create: {
        jobType: JobNames.classifyThreadInsight,
        status: "pending",
        idempotencyKey: threadKey,
        payloadJson: { projectId, threadId: context.thread.id, idempotencyKey: threadKey }
      }
    });
    await this.jobs.enqueue(JobNames.classifyThreadInsight, { projectId, threadId: context.thread.id, idempotencyKey: threadKey }, threadKey);

    if (actorUserId) {
      return this.get(projectId, insight.id, actorUserId);
    }

    const stored = await this.prisma.messageInsight.findFirstOrThrow({
      where: { id: insight.id, projectId },
      include: { message: true, thread: true }
    });
    return this.mapInsightSummary(stored);
  }

  async runClassificationJob(input: { projectId: string; messageId: string; idempotencyKey?: string }) {
    if (input.idempotencyKey) {
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {
          jobType: JobNames.classifyMessageInsight,
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: null,
          attemptCount: { increment: 1 }
        },
        create: {
          jobType: JobNames.classifyMessageInsight,
          status: "running",
          idempotencyKey: input.idempotencyKey,
          startedAt: new Date(),
          attemptCount: 1
        }
      });
    }

    try {
      const result = await this.classifyMessage(input.projectId, input.messageId, null);
      if (input.idempotencyKey) {
        await this.prisma.jobRun.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { status: "completed", finishedAt: new Date(), lastError: null }
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
            lastError: error instanceof Error ? error.message : "Unknown message insight classification error"
          }
        });
      }
      throw error;
    }
  }

  async createProposal(projectId: string, insightId: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    return this.createProposalInternal(projectId, insightId, actorUserId);
  }

  async autoCreateProposal(projectId: string, insightId: string) {
    return this.createProposalInternal(projectId, insightId, null);
  }

  private async createProposalInternal(projectId: string, insightId: string, actorUserId: string | null) {
    const insight = await this.prisma.messageInsight.findFirstOrThrow({
      where: { id: insightId, projectId }
    });
    const affectedRefs = this.parseAffectedRefs(insight.affectedRefsJson);
    const result = await this.proposalService.createProposalFromMessageInsight(projectId, insightId, actorUserId, {
      insight,
      messageId: insight.messageId,
      validatedRefs: affectedRefs
    });

    return {
      insightId,
      proposalId: result.proposalId,
      decisionId: result.decisionId,
      deduped: result.deduped
    };
  }

  async getReviewQueue(projectId: string, actorUserId: string) {
    await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const [insights, proposals, decisions] = await Promise.all([
      this.prisma.messageInsight.findMany({
        where: {
          projectId,
          status: { in: ["detected", "converted_to_proposal", "converted_to_decision"] },
          confidence: { gte: new Prisma.Decimal(0.6) }
        },
        include: { message: true, thread: true },
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: 15
      }),
      this.prisma.specChangeProposal.findMany({
        where: {
          projectId,
          status: "needs_review",
          links: {
            some: {
              linkType: { in: ["message", "thread"] }
            }
          }
        },
        include: { links: true, decisionRecord: true },
        orderBy: { createdAt: "desc" },
        take: 15
      }),
      this.prisma.decisionRecord.findMany({
        where: {
          projectId,
          status: "open",
          proposals: {
            some: {
              links: {
                some: {
                  linkType: { in: ["message", "thread"] }
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 10
      })
    ]);

    return {
      pendingInsights: insights.map((item) => this.mapInsightSummary(item)),
      generatedProposals: proposals.map((proposal) => ({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        proposalType: proposal.proposalType,
        status: proposal.status,
        sourceLabels: proposal.links
          .filter((link) => link.linkType === "message" || link.linkType === "thread")
          .map((link) => ({ linkType: link.linkType, refId: link.linkRefId })),
        openTarget: {
          targetType: "change_proposal" as const,
          targetRef: { proposalId: proposal.id }
        }
      })),
      generatedDecisionCandidates: decisions.map((decision) => ({
        decisionId: decision.id,
        title: decision.title,
        statement: decision.statement,
        status: decision.status,
        openTarget: {
          targetType: "decision_record" as const,
          targetRef: { decisionId: decision.id }
        }
      }))
    };
  }

  private mapInsightSummary(
    item: {
      id: string;
      messageId: string;
      threadId: string;
      provider: string;
      insightType: string;
      status: string;
      summary: string;
      confidence: Prisma.Decimal | number;
      generatedProposalId?: string | null;
      generatedDecisionId?: string | null;
      affectedRefsJson?: unknown;
      message?: { senderLabel: string; sentAt: Date; bodyText: string } | null;
      thread?: { subject: string | null } | null;
    }
  ) {
    const refs = this.parseAffectedRefs(item.affectedRefsJson ?? null);
    return {
      id: item.id,
      messageId: item.messageId,
      threadId: item.threadId,
      provider: item.provider,
      insightType: item.insightType,
      status: item.status,
      summary: item.summary,
      confidence: toNumber(item.confidence),
      generatedProposalId: item.generatedProposalId ?? null,
      generatedDecisionId: item.generatedDecisionId ?? null,
      sourceLabel: item.message
        ? `${item.message.senderLabel} @ ${item.message.sentAt.toISOString()}`
        : null,
      threadLabel: item.thread?.subject ?? null,
      affectedDocumentSectionIds: refs.documentSectionIds,
      affectedBrainNodeIds: refs.brainNodeIds,
      openTargets: {
        message: {
          targetType: "message" as const,
          targetRef: { messageId: item.messageId }
        },
        thread: {
          targetType: "thread" as const,
          targetRef: { threadId: item.threadId }
        }
      }
    };
  }

  private validateRefs(
    output: CommunicationInsightOutput,
    candidateSections: Array<{ id: string }>,
    candidateBrainNodes: Array<{ id: string }>
  ): ValidatedRefs {
    const sectionIds = new Set(candidateSections.map((item) => item.id));
    const nodeIds = new Set(candidateBrainNodes.map((item) => item.id));
    return {
      documentSectionIds: output.affectedDocumentSections.map((item) => item.id).filter((id) => sectionIds.has(id)),
      brainNodeIds: output.affectedBrainNodes.map((item) => item.id).filter((id) => nodeIds.has(id))
    };
  }

  private adjustConfidence(output: CommunicationInsightOutput, refs: ValidatedRefs) {
    let confidence = output.confidence;
    const truthAffecting = ["clarification", "decision", "requirement_change", "contradiction", "approval"].includes(output.insightType);
    if (
      truthAffecting &&
      (refs.documentSectionIds.length !== output.affectedDocumentSections.length ||
        refs.brainNodeIds.length !== output.affectedBrainNodes.length)
    ) {
      confidence *= 0.78;
    }
    if (truthAffecting && (refs.documentSectionIds.length === 0 || refs.brainNodeIds.length === 0)) {
      confidence *= 0.72;
    }

    return Math.max(0, Math.min(0.999, confidence));
  }

  private shouldCreateProposal(output: CommunicationInsightOutput, confidence: number, refs: ValidatedRefs) {
    if (refs.documentSectionIds.length === 0 || refs.brainNodeIds.length === 0) {
      return false;
    }

    switch (output.insightType) {
      case "requirement_change":
        return confidence >= 0.78;
      case "decision":
        return confidence >= 0.75;
      case "approval":
        return confidence >= 0.75;
      case "contradiction":
        return confidence >= 0.72;
      case "clarification":
        return confidence >= 0.82;
      default:
        return false;
    }
  }

  private shouldCreateDecision(output: CommunicationInsightOutput, confidence: number) {
    return ["decision", "approval"].includes(output.insightType) && confidence >= 0.75;
  }

  private heuristicFallback(bodyText: string): CommunicationInsightOutput {
    const text = normalizeText(bodyText);
    const containsAny = (needles: string[]) => needles.some((needle) => text.includes(needle));

    if (containsAny(["blocked", "blocking", "waiting on", "stuck"])) {
      return {
        insightType: "blocker",
        summary: "Message describes a delivery blocker.",
        confidence: 0.86,
        shouldCreateProposal: false,
        shouldCreateDecision: false,
        proposalType: null,
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: null,
        impactSummary: {
          scopeImpact: "low",
          engineeringImpact: "medium",
          clientExpectationImpact: "medium",
          summary: "Execution is blocked and needs review."
        },
        uncertainty: []
      };
    }

    if (containsAny(["approved", "go ahead", "looks good", "ship it"])) {
      return {
        insightType: "approval",
        summary: "Message contains an approval signal.",
        confidence: 0.82,
        shouldCreateProposal: true,
        shouldCreateDecision: true,
        proposalType: "decision_change",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: bodyText,
        impactSummary: {
          scopeImpact: "medium",
          engineeringImpact: "medium",
          clientExpectationImpact: "high",
          summary: "Approval may change accepted product direction."
        },
        uncertainty: ["Approval scope may still need manager review."]
      };
    }

    if (containsAny(["decided", "we will use", "let's use", "go with"])) {
      return {
        insightType: "decision",
        summary: "Message states a product or implementation decision.",
        confidence: 0.84,
        shouldCreateProposal: true,
        shouldCreateDecision: true,
        proposalType: "decision_change",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: bodyText,
        impactSummary: {
          scopeImpact: "medium",
          engineeringImpact: "medium",
          clientExpectationImpact: "medium",
          summary: "A decision candidate was identified."
        },
        uncertainty: []
      };
    }

    if (containsAny(["instead of", "no longer", "change from", "not x but"])) {
      return {
        insightType: "contradiction",
        summary: "Message appears to contradict current understanding.",
        confidence: 0.8,
        shouldCreateProposal: true,
        shouldCreateDecision: false,
        proposalType: "contradiction_resolution",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: null,
        impactSummary: {
          scopeImpact: "medium",
          engineeringImpact: "medium",
          clientExpectationImpact: "high",
          summary: "Potential contradiction to accepted truth."
        },
        uncertainty: []
      };
    }

    if (containsAny(["clarify", "confirm", "?"])) {
      return {
        insightType: "clarification",
        summary: "Message asks for clarification or confirms details.",
        confidence: 0.74,
        shouldCreateProposal: false,
        shouldCreateDecision: false,
        proposalType: "clarification",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: null,
        impactSummary: {
          scopeImpact: "low",
          engineeringImpact: "low",
          clientExpectationImpact: "medium",
          summary: "Clarification may affect accepted truth if confirmed."
        },
        uncertainty: ["Intent is ambiguous and may be only informational."]
      };
    }

    if (containsAny(["need", "must", "should", "please add", "remove", "update"])) {
      return {
        insightType: "requirement_change",
        summary: "Message suggests a requirement change.",
        confidence: 0.8,
        shouldCreateProposal: true,
        shouldCreateDecision: false,
        proposalType: "requirement_change",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: null,
        impactSummary: {
          scopeImpact: "medium",
          engineeringImpact: "medium",
          clientExpectationImpact: "high",
          summary: "Potential product requirement change."
        },
        uncertainty: []
      };
    }

    return {
      insightType: "info",
      summary: "Message is informational and does not clearly change accepted truth.",
      confidence: 0.58,
      shouldCreateProposal: false,
      shouldCreateDecision: false,
      proposalType: null,
      affectedDocumentSections: [],
      affectedBrainNodes: [],
      oldUnderstanding: null,
      newUnderstanding: null,
      decisionStatement: null,
      impactSummary: {
        scopeImpact: "low",
        engineeringImpact: "low",
        clientExpectationImpact: "low",
        summary: "No truth-affecting change detected."
      },
      uncertainty: []
    };
  }

  private parseAffectedRefs(value: unknown): ValidatedRefs {
    if (!value || typeof value !== "object") {
      return { documentSectionIds: [], brainNodeIds: [] };
    }
    const refs = value as { documentSectionIds?: unknown; brainNodeIds?: unknown };
    return {
      documentSectionIds: Array.isArray(refs.documentSectionIds)
        ? refs.documentSectionIds.filter((item): item is string => typeof item === "string")
        : [],
      brainNodeIds: Array.isArray(refs.brainNodeIds)
        ? refs.brainNodeIds.filter((item): item is string => typeof item === "string")
        : []
    };
  }

}
