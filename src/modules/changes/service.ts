import { AppError } from "../../app/errors.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import type { JobDispatcher } from "../../lib/jobs/types.js";
import { JobNames } from "../../lib/jobs/types.js";
import { AuditService } from "../audit/service.js";
import { BrainService } from "../brain/service.js";
import { ProjectService } from "../projects/service.js";
import type { PrismaClient } from "@prisma/client";

export class ChangeProposalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: JobDispatcher,
    private readonly projectService: ProjectService,
    private readonly brainService: BrainService,
    private readonly auditService: AuditService
  ) {}

  async list(projectId: string, actorUserId: string) {
    await this.projectService.ensureProjectAccess(projectId, actorUserId);
    return this.prisma.specChangeProposal.findMany({
      where: {
        projectId
      },
      include: {
        links: true,
        decisionRecord: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async get(projectId: string, proposalId: string, actorUserId: string) {
    await this.projectService.ensureProjectAccess(projectId, actorUserId);
    return this.prisma.specChangeProposal.findFirstOrThrow({
      where: {
        id: proposalId,
        projectId
      },
      include: {
        links: true,
        decisionRecord: true
      }
    });
  }

  async create(
    projectId: string,
    actorUserId: string,
    input: {
      title: string;
      summary: string;
      proposalType: "requirement_change" | "decision_change" | "clarification" | "contradiction_resolution";
      oldUnderstanding?: Record<string, unknown>;
      newUnderstanding?: Record<string, unknown>;
      impactSummary?: Record<string, unknown>;
      affectedDocumentSectionIds: string[];
      affectedBrainNodeIds: string[];
      communicationMessageIds: string[];
      externalEvidenceRefs: string[];
    }
  ) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await this.validateLinkTargets(projectId, input);

    const proposal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.specChangeProposal.create({
        data: {
          projectId,
          title: input.title,
          summary: input.summary,
          proposalType: input.proposalType,
          status: "needs_review",
          sourceMessageCount: input.communicationMessageIds.length,
          oldUnderstandingJson: input.oldUnderstanding as object | undefined,
          newUnderstandingJson: input.newUnderstanding as object | undefined,
          impactSummaryJson: input.impactSummary as object | undefined,
          externalEvidenceRefsJson: input.externalEvidenceRefs
        }
      });

      const links = [
        ...input.affectedDocumentSectionIds.map((sectionId) => ({
          specChangeProposalId: created.id,
          projectId,
          linkType: "document_section" as const,
          linkRefId: sectionId,
          relationship: "affected" as const
        })),
        ...input.affectedBrainNodeIds.map((nodeId) => ({
          specChangeProposalId: created.id,
          projectId,
          linkType: "brain_node" as const,
          linkRefId: nodeId,
          relationship: "affected" as const
        })),
        ...input.communicationMessageIds.map((messageId) => ({
          specChangeProposalId: created.id,
          projectId,
          linkType: "message" as const,
          linkRefId: messageId,
          relationship: "source" as const
        }))
      ];

      if (links.length > 0) {
        await tx.specChangeLink.createMany({
          data: links
        });
      }

      return created;
    });

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "change_proposal_created",
      entityType: "spec_change_proposal",
      entityId: proposal.id,
      payload: input
    });

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "change_proposal_created");

    return this.get(projectId, proposal.id, actorUserId);
  }

  async accept(projectId: string, proposalId: string, actorUserId: string) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const proposal = await this.prisma.specChangeProposal.findFirstOrThrow({
      where: {
        id: proposalId,
        projectId
      },
      include: {
        links: true,
        decisionRecord: true
      }
    });

    if (proposal.status === "accepted") {
      return this.get(projectId, proposalId, actorUserId);
    }

    if (proposal.status === "rejected" || proposal.status === "superseded") {
      throw new AppError(409, "Proposal can no longer be accepted", "proposal_not_acceptable");
    }

    const hasSourceEvidence =
      proposal.sourceMessageCount > 0 || (Array.isArray(proposal.externalEvidenceRefsJson) && proposal.externalEvidenceRefsJson.length > 0);
    const hasAffectedSections = proposal.links.some((link) => link.linkType === "document_section");
    const hasAffectedNodes = proposal.links.some((link) => link.linkType === "brain_node");
    if (!hasSourceEvidence || !hasAffectedSections || !hasAffectedNodes) {
      throw new AppError(
        422,
        "Proposal is missing provenance-critical links required for acceptance",
        "proposal_missing_provenance"
      );
    }

    await this.prisma.$transaction(async (tx) => {
      let decisionRecordId = proposal.decisionRecordId;
      if (proposal.proposalType === "decision_change" && !decisionRecordId) {
        const decision = await tx.decisionRecord.create({
          data: {
            projectId,
            title: proposal.title,
            statement: proposal.summary,
            status: "accepted",
            sourceSummary:
              proposal.sourceMessageCount > 0
                ? `Accepted from ${proposal.sourceMessageCount} linked communication messages`
                : "Accepted from explicit external evidence refs",
            acceptedBy: actorUserId,
            acceptedAt: new Date()
          }
        });
        decisionRecordId = decision.id;
      }

      await tx.specChangeProposal.update({
        where: { id: proposalId },
        data: {
          status: "accepted",
          acceptedBy: actorUserId,
          acceptedAt: new Date(),
          decisionRecordId
        }
      });
    });

    const jobKey = jobKeys.applyAcceptedChange(proposalId);
    await this.prisma.jobRun.upsert({
      where: {
        idempotencyKey: jobKey
      },
      update: {
        status: "pending",
        payloadJson: {
          projectId,
          proposalId
        }
      },
      create: {
        jobType: JobNames.applyAcceptedChange,
        status: "pending",
        idempotencyKey: jobKey,
        payloadJson: {
          projectId,
          proposalId
        }
      }
    });

    await this.jobs.enqueue(JobNames.applyAcceptedChange, { projectId, proposalId }, jobKey);

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "change_proposal_accepted",
      entityType: "spec_change_proposal",
      entityId: proposalId,
      payload: {}
    });

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "change_proposal_accepted");

    return this.get(projectId, proposalId, actorUserId);
  }

  async reject(projectId: string, proposalId: string, actorUserId: string) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const proposal = await this.prisma.specChangeProposal.findFirstOrThrow({
      where: { id: proposalId, projectId }
    });

    if (proposal.status === "accepted") {
      throw new AppError(409, "Accepted proposals cannot be rejected", "accepted_proposal_cannot_be_rejected");
    }

    await this.prisma.specChangeProposal.update({
      where: { id: proposalId },
      data: {
        status: "rejected"
      }
    });

    await this.auditService.record({
      orgId: project.orgId,
      projectId,
      actorUserId,
      eventType: "change_proposal_rejected",
      entityType: "spec_change_proposal",
      entityId: proposalId,
      payload: {}
    });

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "change_proposal_rejected");

    return this.get(projectId, proposalId, actorUserId);
  }

  async applyAcceptedProposal(projectId: string, proposalId: string) {
    const proposal = await this.prisma.specChangeProposal.findFirst({
      where: {
        id: proposalId,
        projectId,
        status: "accepted"
      },
      include: {
        links: true
      }
    });

    if (!proposal) {
      throw new AppError(404, "Accepted proposal not found", "accepted_proposal_not_found");
    }

    if (proposal.acceptedBrainVersionId) {
      const existing = await this.prisma.artifactVersion.findUnique({
        where: {
          id: proposal.acceptedBrainVersionId
        }
      });

      if (existing) {
        return existing;
      }
    }

    const shouldRefreshGraph = proposal.links.some(
      (link) => link.linkType === "brain_node" || link.linkType === "document_section"
    );

    if (shouldRefreshGraph) {
      await this.brainService.generateBrainGraph(projectId, proposal.acceptedBy);
    }

    const productBrain = await this.brainService.generateProductBrain(projectId, proposal.acceptedBy);
    await this.prisma.specChangeProposal.update({
      where: { id: proposalId },
      data: {
        acceptedBrainVersionId: productBrain.id
      }
    });

    await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "accepted_change_applied");

    return productBrain;
  }

  private async validateLinkTargets(
    projectId: string,
    input: {
      affectedDocumentSectionIds: string[];
      affectedBrainNodeIds: string[];
      communicationMessageIds: string[];
    }
  ) {
    const [sections, nodes, messages] = await Promise.all([
      input.affectedDocumentSectionIds.length
        ? this.prisma.documentSection.count({
            where: {
              projectId,
              id: {
                in: input.affectedDocumentSectionIds
              }
            }
          })
        : Promise.resolve(0),
      input.affectedBrainNodeIds.length
        ? this.prisma.brainNode.count({
            where: {
              projectId,
              id: {
                in: input.affectedBrainNodeIds
              }
            }
          })
        : Promise.resolve(0),
      input.communicationMessageIds.length
        ? this.prisma.communicationMessage.count({
            where: {
              projectId,
              id: {
                in: input.communicationMessageIds
              }
            }
          })
        : Promise.resolve(0)
    ]);

    if (sections !== input.affectedDocumentSectionIds.length) {
      throw new AppError(422, "One or more document section links are invalid", "invalid_document_section_links");
    }

    if (nodes !== input.affectedBrainNodeIds.length) {
      throw new AppError(422, "One or more brain node links are invalid", "invalid_brain_node_links");
    }

    if (messages !== input.communicationMessageIds.length) {
      throw new AppError(422, "One or more communication message links are invalid", "invalid_message_links");
    }
  }
}
