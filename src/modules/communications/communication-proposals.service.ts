import type { PrismaClient, ProposalType } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import type { JobDispatcher } from "../../lib/jobs/types.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";

type ValidatedRefs = {
  documentSectionIds: string[];
  brainNodeIds: string[];
};

type InsightRecord = {
  id: string;
  projectId: string;
  threadId: string;
  summary: string;
  confidence: { toNumber(): number } | number;
  insightType: string;
  proposalType: ProposalType | null;
  shouldCreateProposal: boolean;
  shouldCreateDecision: boolean;
  oldUnderstandingJson: unknown;
  newUnderstandingJson: unknown;
  impactSummaryJson: unknown;
  uncertaintyJson: unknown;
  decisionStatement: string | null;
  generatedProposalId: string | null;
  generatedDecisionId: string | null;
};

export class CommunicationProposalsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly jobs: JobDispatcher
  ) {}

  async createProposalFromMessageInsight(
    projectId: string,
    insightId: string,
    actorUserId: string | null,
    input: {
      insight: InsightRecord;
      messageId: string;
      validatedRefs: ValidatedRefs;
    }
  ) {
    if (actorUserId) {
      await this.projectService.ensureProjectManager(projectId, actorUserId);
    }

    if (!input.insight.shouldCreateProposal && !input.insight.shouldCreateDecision) {
      throw new AppError(422, "Insight is not eligible for proposal generation", "insight_not_proposal_eligible");
    }

    if (
      input.validatedRefs.documentSectionIds.length === 0 ||
      input.validatedRefs.brainNodeIds.length === 0
    ) {
      throw new AppError(422, "Insight is missing validated affected refs", "insight_missing_validated_refs");
    }

    const deduped = await this.findDuplicate(projectId, {
      proposalType: input.insight.proposalType ?? this.mapProposalType(input.insight.insightType),
      summary: input.insight.summary,
      documentSectionIds: input.validatedRefs.documentSectionIds,
      brainNodeIds: input.validatedRefs.brainNodeIds
    });
    if (deduped) {
      await this.prisma.messageInsight.update({
        where: { id: insightId },
        data: {
          status: "superseded",
          generatedProposalId: deduped.id
        }
      });

      return {
        proposalId: deduped.id,
        decisionId: deduped.decisionRecordId ?? null,
        deduped: true
      };
    }

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { orgId: true }
    });

    const created = await this.prisma.$transaction(async (tx) => {
      let decisionId: string | null = null;
      if (input.insight.shouldCreateDecision || input.insight.insightType === "decision" || input.insight.insightType === "approval") {
        const duplicateDecision = await tx.decisionRecord.findFirst({
          where: {
            projectId,
            status: { in: ["open", "accepted"] },
            OR: [
              { title: { contains: input.insight.summary.slice(0, 80), mode: "insensitive" } },
              ...(input.insight.decisionStatement
                ? [{ statement: { contains: input.insight.decisionStatement.slice(0, 120), mode: "insensitive" as const } }]
                : [])
            ]
          }
        });
        if (duplicateDecision) {
          decisionId = duplicateDecision.id;
        } else {
          const decision = await tx.decisionRecord.create({
            data: {
              projectId,
              title: input.insight.summary.slice(0, 180),
              statement: input.insight.decisionStatement ?? input.insight.summary,
              status: "open",
              sourceSummary: "Generated from communication insight review"
            }
          });
          decisionId = decision.id;
        }
      }

      const proposal = await tx.specChangeProposal.create({
        data: {
          projectId,
          title: input.insight.summary.slice(0, 180),
          summary: input.insight.summary,
          proposalType: input.insight.proposalType ?? this.mapProposalType(input.insight.insightType),
          status: "needs_review",
          sourceMessageCount: 1,
          oldUnderstandingJson: this.toJsonObject(input.insight.oldUnderstandingJson),
          newUnderstandingJson: this.toJsonObject(input.insight.newUnderstandingJson),
          impactSummaryJson: this.toJsonObject(input.insight.impactSummaryJson),
          externalEvidenceRefsJson: [],
          decisionRecordId: decisionId
        }
      });

      const links = [
        {
          specChangeProposalId: proposal.id,
          projectId,
          linkType: "message" as const,
          linkRefId: input.messageId,
          relationship: "source" as const
        },
        {
          specChangeProposalId: proposal.id,
          projectId,
          linkType: "thread" as const,
          linkRefId: input.insight.threadId,
          relationship: "evidence" as const
        },
        ...input.validatedRefs.documentSectionIds.map((sectionId) => ({
          specChangeProposalId: proposal.id,
          projectId,
          linkType: "document_section" as const,
          linkRefId: sectionId,
          relationship: "affected" as const
        })),
        ...input.validatedRefs.brainNodeIds.map((nodeId) => ({
          specChangeProposalId: proposal.id,
          projectId,
          linkType: "brain_node" as const,
          linkRefId: nodeId,
          relationship: "affected" as const
        }))
      ];
      await tx.specChangeLink.createMany({ data: links });

      await tx.messageInsight.update({
        where: { id: insightId },
        data: {
          status: decisionId ? "converted_to_decision" : "converted_to_proposal",
          generatedProposalId: proposal.id,
          generatedDecisionId: decisionId
        }
      });

      return { proposalId: proposal.id, decisionId };
    });

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId: actorUserId ?? undefined,
      eventType: "communication_change_proposal_created",
      entityType: "spec_change_proposal",
      entityId: created.proposalId,
      payload: { insightId, decisionId: created.decisionId }
    });

    if (created.decisionId) {
      await this.auditService.record({
        orgId: project.orgId,
        projectId,
        actorUserId: actorUserId ?? undefined,
        eventType: "communication_decision_candidate_created",
        entityType: "decision_record",
        entityId: created.decisionId,
        payload: { insightId, proposalId: created.proposalId }
      });
    }

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "communication_proposal_created");

    return {
      proposalId: created.proposalId,
      decisionId: created.decisionId,
      deduped: false
    };
  }

  private async findDuplicate(
    projectId: string,
    input: {
      proposalType: ProposalType;
      summary: string;
      documentSectionIds: string[];
      brainNodeIds: string[];
    }
  ) {
    const candidates = await this.prisma.specChangeProposal.findMany({
      where: {
        projectId,
        proposalType: input.proposalType,
        status: { in: ["needs_review", "accepted"] },
        OR: [
          { title: { contains: input.summary.slice(0, 40), mode: "insensitive" } },
          { summary: { contains: input.summary.slice(0, 60), mode: "insensitive" } }
        ]
      },
      include: { links: true }
    });

    return candidates.find((candidate) => {
      const sectionIds = candidate.links.filter((link) => link.linkType === "document_section").map((link) => link.linkRefId);
      const nodeIds = candidate.links.filter((link) => link.linkType === "brain_node").map((link) => link.linkRefId);
      return (
        sectionIds.some((id) => input.documentSectionIds.includes(id)) &&
        nodeIds.some((id) => input.brainNodeIds.includes(id))
      );
    });
  }

  private mapProposalType(insightType: string): ProposalType {
    switch (insightType) {
      case "decision":
      case "approval":
        return "decision_change";
      case "contradiction":
        return "contradiction_resolution";
      case "clarification":
        return "clarification";
      default:
        return "requirement_change";
    }
  }

  private toJsonObject(value: unknown) {
    return value && typeof value === "object" ? (value as object) : undefined;
  }
}
