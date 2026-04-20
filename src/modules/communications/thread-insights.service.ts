import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
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

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

export class ThreadInsightsService {
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

  async classifyThread(projectId: string, threadId: string, actorUserId: string | null) {
    if (actorUserId) {
      await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    }

    const context = await this.impactResolver.buildThreadContext(projectId, threadId);
    const prompt = buildMessageInsightPrompt({
      targetKind: "thread",
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
      fallback: () => this.threadFallback(context.thread.subject ?? "", context.threadMessages.map((item) => item.bodyText).join("\n"))
    });

    const sectionIds = new Set(context.candidateSections.map((item) => item.id));
    const nodeIds = new Set(context.candidateBrainNodes.map((item) => item.id));
    const validatedRefs = {
      documentSectionIds: output.affectedDocumentSections.map((item) => item.id).filter((id) => sectionIds.has(id)),
      brainNodeIds: output.affectedBrainNodes.map((item) => item.id).filter((id) => nodeIds.has(id))
    };
    const confidence = this.adjustConfidence(output, validatedRefs.documentSectionIds.length, validatedRefs.brainNodeIds.length);
    const shouldCreateProposal = this.shouldCreateProposal(output, confidence, validatedRefs.documentSectionIds.length, validatedRefs.brainNodeIds.length);
    const shouldCreateDecision = ["decision", "approval"].includes(output.insightType) && confidence >= 0.75;

    const insight = await this.prisma.threadInsight.upsert({
      where: {
        threadId_threadStateHash: {
          threadId: context.thread.id,
          threadStateHash: context.threadStateHash
        }
      },
      create: {
        projectId,
        connectorId: context.thread.connectorId,
        provider: context.thread.provider,
        threadId: context.thread.id,
        threadStateHash: context.threadStateHash,
        insightType: output.insightType,
        status: "detected",
        summary: output.summary,
        confidence: new Prisma.Decimal(confidence.toFixed(3)),
        shouldCreateProposal,
        shouldCreateDecision,
        proposalType: output.proposalType,
        sourceMessageIdsJson: context.threadMessages.map((item) => item.id),
        affectedRefsJson: validatedRefs,
        evidenceJson: { sourceMessageIds: context.threadMessages.map((item) => item.id) },
        oldUnderstandingJson: toJsonInput(output.oldUnderstanding ?? undefined),
        newUnderstandingJson: toJsonInput(output.newUnderstanding ?? undefined),
        decisionStatement: output.decisionStatement,
        impactSummaryJson: toJsonInput(output.impactSummary ?? undefined),
        uncertaintyJson: output.uncertainty,
        modelJson: { provider: this.generationProvider.constructor.name }
      },
      update: {
        insightType: output.insightType,
        status: "detected",
        summary: output.summary,
        confidence: new Prisma.Decimal(confidence.toFixed(3)),
        shouldCreateProposal,
        shouldCreateDecision,
        proposalType: output.proposalType,
        sourceMessageIdsJson: context.threadMessages.map((item) => item.id),
        affectedRefsJson: validatedRefs,
        evidenceJson: { sourceMessageIds: context.threadMessages.map((item) => item.id) },
        oldUnderstandingJson: toJsonInput(output.oldUnderstanding ?? undefined),
        newUnderstandingJson: toJsonInput(output.newUnderstanding ?? undefined),
        decisionStatement: output.decisionStatement,
        impactSummaryJson: toJsonInput(output.impactSummary ?? undefined),
        uncertaintyJson: output.uncertainty,
        modelJson: { provider: this.generationProvider.constructor.name }
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
      eventType: "thread_insight_created",
      entityType: "thread_insight",
      entityId: insight.id,
      payload: { threadId, insightType: insight.insightType, confidence }
    });
    this.telemetry.increment("communication_thread_insights_created_total", {
      insight_type: insight.insightType,
      provider: context.thread.provider
    });

    if ((shouldCreateProposal || shouldCreateDecision) && !insight.generatedProposalId) {
      const key = jobKeys.generateChangeProposalFromInsight(insight.id);
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: key },
        update: {
          jobType: JobNames.generateChangeProposalFromInsight,
          status: "pending",
          payloadJson: { projectId, threadInsightId: insight.id, idempotencyKey: key }
        },
        create: {
          jobType: JobNames.generateChangeProposalFromInsight,
          status: "pending",
          idempotencyKey: key,
          payloadJson: { projectId, threadInsightId: insight.id, idempotencyKey: key }
        }
      });
      await this.jobs.enqueue(JobNames.generateChangeProposalFromInsight, { projectId, threadInsightId: insight.id, idempotencyKey: key }, key);
    }

    if (actorUserId) {
      return this.get(projectId, insight.id, actorUserId);
    }

    return {
      id: insight.id,
      threadId: insight.threadId,
      provider: insight.provider,
      insightType: insight.insightType,
      status: insight.status,
      summary: insight.summary,
      confidence: toNumber(insight.confidence),
      sourceMessageIds: Array.isArray(insight.sourceMessageIdsJson) ? insight.sourceMessageIdsJson : [],
      affectedDocumentSectionIds: Array.isArray((insight.affectedRefsJson as { documentSectionIds?: unknown })?.documentSectionIds)
        ? ((insight.affectedRefsJson as { documentSectionIds?: unknown }).documentSectionIds as string[])
        : [],
      affectedBrainNodeIds: Array.isArray((insight.affectedRefsJson as { brainNodeIds?: unknown })?.brainNodeIds)
        ? ((insight.affectedRefsJson as { brainNodeIds?: unknown }).brainNodeIds as string[])
        : [],
      generatedProposalId: insight.generatedProposalId,
      generatedDecisionId: insight.generatedDecisionId,
      openTargets: {
        thread: { targetType: "thread" as const, targetRef: { threadId: insight.threadId } }
      }
    };
  }

  async runClassificationJob(input: { projectId: string; threadId: string; idempotencyKey?: string }) {
    if (input.idempotencyKey) {
      await this.prisma.jobRun.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {
          jobType: JobNames.classifyThreadInsight,
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: null,
          attemptCount: { increment: 1 }
        },
        create: {
          jobType: JobNames.classifyThreadInsight,
          status: "running",
          idempotencyKey: input.idempotencyKey,
          startedAt: new Date(),
          attemptCount: 1
        }
      });
    }
    try {
      const result = await this.classifyThread(input.projectId, input.threadId, null);
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
            lastError: error instanceof Error ? error.message : "Unknown thread insight classification error"
          }
        });
      }
      throw error;
    }
  }

  async get(projectId: string, insightId: string, actorUserId: string) {
    await ensureCommunicationReadAccess(this.projectService, projectId, actorUserId);
    const insight = await this.prisma.threadInsight.findFirstOrThrow({
      where: { id: insightId, projectId },
      include: {
        thread: true,
        generatedProposal: true,
        generatedDecision: true
      }
    });

    const refs = (insight.affectedRefsJson ?? {}) as { documentSectionIds?: string[]; brainNodeIds?: string[] };
    return {
      id: insight.id,
      threadId: insight.threadId,
      provider: insight.provider,
      insightType: insight.insightType,
      status: insight.status,
      summary: insight.summary,
      confidence: toNumber(insight.confidence),
      sourceMessageIds: Array.isArray(insight.sourceMessageIdsJson) ? insight.sourceMessageIdsJson : [],
      affectedDocumentSectionIds: Array.isArray(refs.documentSectionIds) ? refs.documentSectionIds : [],
      affectedBrainNodeIds: Array.isArray(refs.brainNodeIds) ? refs.brainNodeIds : [],
      generatedProposalId: insight.generatedProposalId,
      generatedDecisionId: insight.generatedDecisionId,
      openTargets: {
        thread: { targetType: "thread" as const, targetRef: { threadId: insight.threadId } }
      }
    };
  }

  async createProposal(projectId: string, insightId: string, actorUserId: string) {
    await ensureCommunicationManager(this.projectService, projectId, actorUserId);
    return this.createProposalInternal(projectId, insightId, actorUserId);
  }

  async autoCreateProposal(projectId: string, insightId: string) {
    return this.createProposalInternal(projectId, insightId, null);
  }

  private async createProposalInternal(projectId: string, insightId: string, actorUserId: string | null) {
    const insight = await this.prisma.threadInsight.findFirstOrThrow({
      where: { id: insightId, projectId }
    });
    const refs = (insight.affectedRefsJson ?? {}) as { documentSectionIds?: string[]; brainNodeIds?: string[] };
    const sourceMessageIds = Array.isArray(insight.sourceMessageIdsJson)
      ? insight.sourceMessageIdsJson.filter((item): item is string => typeof item === "string")
      : [];
    if (sourceMessageIds.length === 0) {
      throw new Error("Thread insight has no source messages");
    }

    return this.proposalService.createProposalFromMessageInsight(projectId, insightId, actorUserId, {
      insight: {
        ...insight,
        messageId: sourceMessageIds[0]
      } as any,
      messageId: sourceMessageIds[0],
      validatedRefs: {
        documentSectionIds: Array.isArray(refs.documentSectionIds) ? refs.documentSectionIds : [],
        brainNodeIds: Array.isArray(refs.brainNodeIds) ? refs.brainNodeIds : []
      }
    });
  }

  private adjustConfidence(output: CommunicationInsightOutput, sectionCount: number, nodeCount: number) {
    let confidence = output.confidence;
    if (["requirement_change", "decision", "clarification", "contradiction", "approval"].includes(output.insightType)) {
      if (sectionCount === 0 || nodeCount === 0) {
        confidence *= 0.74;
      }
    }
    return Math.max(0, Math.min(0.999, confidence));
  }

  private shouldCreateProposal(output: CommunicationInsightOutput, confidence: number, sectionCount: number, nodeCount: number) {
    if (sectionCount === 0 || nodeCount === 0) {
      return false;
    }
    switch (output.insightType) {
      case "requirement_change":
        return confidence >= 0.78;
      case "decision":
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

  private threadFallback(subject: string, combinedText: string): CommunicationInsightOutput {
    const text = `${subject}\n${combinedText}`.toLowerCase();
    if (text.includes("approved") || text.includes("go ahead")) {
      return {
        insightType: "approval",
        summary: "Thread contains an approval signal.",
        confidence: 0.78,
        shouldCreateProposal: true,
        shouldCreateDecision: true,
        proposalType: "decision_change",
        affectedDocumentSections: [],
        affectedBrainNodes: [],
        oldUnderstanding: null,
        newUnderstanding: null,
        decisionStatement: combinedText,
        impactSummary: {
          scopeImpact: "medium",
          engineeringImpact: "medium",
          clientExpectationImpact: "high",
          summary: "Thread appears to approve a product direction."
        },
        uncertainty: ["Exact approval scope may still need manager confirmation."]
      };
    }

    return {
      insightType: "info",
      summary: "Thread is informational and does not clearly change accepted truth.",
      confidence: 0.55,
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
        summary: "No clear truth-affecting change was detected."
      },
      uncertainty: []
    };
  }
}
