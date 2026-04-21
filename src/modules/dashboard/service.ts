import type {
  ArtifactVersion,
  DashboardSnapshotScope,
  DecisionStatus,
  PrismaClient,
  ProjectRole,
  ProposalStatus
} from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { TelemetryService } from "../../lib/observability/telemetry.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";

type WorkloadLabel = "normal" | "watch" | "overloaded" | "unknown";
type AttentionLabel = "healthy" | "watch" | "attention";
type BrainFreshnessState = "current" | "processing" | "stale" | "blocked";

type SnapshotOptions = {
  forceRefresh?: boolean;
};

const SNAPSHOT_STALE_MS = 5 * 60 * 1000;
const BRAIN_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

type TeamMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  projectRole: ProjectRole;
  roleInProject: string | null;
  allocationPercent: number | null;
  weeklyCapacityHours: number | null;
  workloadLabel: WorkloadLabel;
};

type TeamSummary = {
  headcount: number;
  roleBreakdown: Record<string, number>;
  members: TeamMember[];
  workload: {
    label: "healthy" | "watch" | "attention" | "unknown";
    overloadedCount: number;
    watchCount: number;
    unknownCount: number;
  };
};

type DocumentReadiness = {
  totalCount: number;
  readinessState: "empty" | "ready" | "processing" | "watch" | "blocked";
  counts: Record<"pending" | "processing" | "ready" | "partial" | "failed", number>;
  latestProcessedAt: string | null;
  documents: Array<{
    documentId: string;
    title: string;
    currentVersionId: string | null;
    status: "pending" | "processing" | "ready" | "partial" | "failed";
    processedAt: string | null;
  }>;
};

type BrainSummary = {
  freshnessState: BrainFreshnessState;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  acceptedAt: string | null;
  latestAcceptedChangeAt: string | null;
  latestAcceptedDecisionAt: string | null;
};

type ChangeSummary = {
  pendingCount: number;
  acceptedRecentCount: number;
  latestAcceptedAt: string | null;
  pendingSummaries: Array<{ proposalId: string; title: string; summary: string | null }>;
  recentAccepted: Array<{ proposalId: string; title: string; summary: string | null; acceptedAt: string | null }>;
};

type DecisionSummary = {
  openCount: number;
  latestAcceptedAt: string | null;
  openItems: Array<{ decisionId: string; title: string }>;
};

type AttentionSummary = {
  score: number;
  label: AttentionLabel;
  reasons: string[];
};

type ProjectQuickLinks = {
  dashboardPath: string;
  brainPath: string;
  documentsPath: string;
  docViewerPath: string | null;
  docViewerState: { pageContext: "doc_viewer"; selectedRefType: "document"; selectedRefId: string } | null;
  brainViewerState: { pageContext: "brain_overview"; selectedRefType: "dashboard_scope"; selectedRefId: string };
};

type CommunicationSummary = {
  connectedProviders: string[];
  providerCount: number;
  lastSyncedAt: string | null;
  insightCount: number;
  needsReviewCount: number;
  blockerCount: number;
  contradictionCount: number;
  connectorStatuses: Array<{
    connectorId: string;
    provider: string;
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
};

type ProjectCard = {
  projectId: string;
  name: string;
  slug: string;
  status: string;
  team: {
    headcount: number;
    roleBreakdown: Record<string, number>;
  };
  workload: {
    label: TeamSummary["workload"]["label"];
    overloadedCount: number;
    watchCount: number;
  };
  documents: {
    readinessState: DocumentReadiness["readinessState"];
    totalCount: number;
    processingCount: number;
    failedCount: number;
  };
  brain: BrainSummary;
  changes: ChangeSummary;
  decisions: DecisionSummary;
  communication: CommunicationSummary;
  attention: AttentionSummary;
  movementLabel: "fast" | "steady" | "slow";
  quickLinks: ProjectQuickLinks;
};

type GeneralDashboardPayload = {
  scope: "general";
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  computedAt: string;
  summary: {
    activeProjectCount: number;
    orgHeadcount: number;
    orgRoleBreakdown: Record<string, number>;
    projectMemberDistribution: Array<{ projectId: string; name: string; memberCount: number }>;
    overloadedMembers: Array<{
      userId: string;
      displayName: string;
      totalAllocationPercent: number | null;
      projects: string[];
      workloadLabel: WorkloadLabel;
    }>;
    overloadedCount: number;
    watchCount: number;
    projectsNeedingAttention: ProjectCard[];
    changePressure: {
      pendingCount: number;
      recentAcceptedCount: number;
      openDecisionCount: number;
    };
    brainFreshness: Record<BrainFreshnessState, number>;
    communication: {
      connectedProviderCount: number;
      needsReviewCount: number;
      blockerCount: number;
      contradictionCount: number;
      lastSyncedAt: string | null;
    };
  };
  projects: ProjectCard[];
  quickLinks: {
    projects: Array<{
      projectId: string;
      name: string;
      dashboardPath: string;
      brainPath: string;
      documentsPath: string;
    }>;
  };
};

type ProjectDashboardPayload = {
  scope: "project";
  computedAt: string;
  project: {
    id: string;
    orgId: string;
    name: string;
    slug: string;
    status: string;
    description: string | null;
    previewUrl: string | null;
    memberCount: number;
    documentCount: number;
  };
  teamSummary: TeamSummary;
  documents: DocumentReadiness;
  brain: BrainSummary;
  changes: ChangeSummary;
  decisions: DecisionSummary;
  communication: CommunicationSummary;
  attention: AttentionSummary;
  quickLinks: ProjectQuickLinks;
  recentActivity: {
    latestAcceptedChangeAt: string | null;
    latestDecisionAt: string | null;
    latestDocumentProcessedAt: string | null;
  };
};

export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService,
    private readonly telemetry: TelemetryService
  ) {}

  async getGeneralDashboard(input: { orgId: string; actorUserId: string; forceRefresh?: boolean }) {
    const startedAt = process.hrtime.bigint();
    const payload = await this.getOrBuildGeneralSnapshot(input.orgId, input.forceRefresh ?? false);

    await this.auditService.record({
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      eventType: "dashboard_general_opened",
      entityType: "dashboard_snapshot",
      entityId: payload.snapshot.id,
      payload: { scope: "general", computedAt: payload.snapshot.computedAt }
    });

    this.observeDashboardDuration(startedAt, "general");
    return payload.data;
  }

  async getProjectDashboard(projectId: string, actorUserId: string, options: SnapshotOptions = {}) {
    const startedAt = process.hrtime.bigint();
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    this.assertProjectDashboardRole(member.projectRole);

    const payload = await this.getOrBuildProjectSnapshot(projectId, options.forceRefresh ?? false);

    await this.auditService.record({
      orgId: payload.data.project.orgId,
      projectId,
      actorUserId,
      eventType: "dashboard_project_opened",
      entityType: "dashboard_snapshot",
      entityId: payload.snapshot.id,
      payload: { scope: "project", computedAt: payload.snapshot.computedAt }
    });

    this.observeDashboardDuration(startedAt, "project");
    return payload.data;
  }

  async getProjectTeamSummary(projectId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    this.assertProjectDashboardRole(member.projectRole);
    const payload = await this.getOrBuildProjectSnapshot(projectId, false);
    return payload.data.teamSummary;
  }

  async refreshProjectDashboard(projectId: string, actorUserId: string) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);
    const payload = await this.buildAndPersistProjectSnapshot(projectId);

    await this.auditService.record({
      orgId: payload.data.project.orgId,
      projectId,
      actorUserId,
      eventType: "dashboard_snapshot_refreshed",
      entityType: "dashboard_snapshot",
      entityId: payload.snapshot.id,
      payload: { scope: "project" }
    });

    return {
      queued: false,
      scope: "project",
      snapshotId: payload.snapshot.id,
      computedAt: payload.snapshot.computedAt
    };
  }

  async refreshSnapshotJob(input: {
    scope: DashboardSnapshotScope;
    orgId: string;
    projectId?: string | null;
    reason?: string;
    idempotencyKey?: string;
  }) {
    const idempotencyKey = input.idempotencyKey ?? `dashboard:${input.scope}:${input.projectId ?? input.orgId}`;
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType: "refresh_dashboard_snapshot",
        status: "running",
        payloadJson: input as object,
        startedAt: new Date(),
        finishedAt: null,
        lastError: null,
        attemptCount: {
          increment: 1
        }
      },
      create: {
        jobType: "refresh_dashboard_snapshot",
        status: "running",
        idempotencyKey,
        payloadJson: input as object,
        startedAt: new Date(),
        attemptCount: 1
      }
    });

    try {
      if (input.scope === "general") {
        const result = await this.buildAndPersistGeneralSnapshot(input.orgId);
        await this.finishRefreshJob(idempotencyKey);
        return result;
      }
      if (!input.projectId) {
        throw new AppError(400, "Project dashboard refresh requires projectId", "dashboard_project_id_required");
      }
      const result = await this.buildAndPersistProjectSnapshot(input.projectId);
      await this.finishRefreshJob(idempotencyKey);
      return result;
    } catch (error) {
      await this.failRefreshJob(idempotencyKey, error);
      throw error;
    }
  }

  private async getOrBuildGeneralSnapshot(orgId: string, forceRefresh: boolean) {
    const latest = await this.prisma.dashboardSnapshot.findFirst({
      where: { orgId, scope: "general", projectId: null },
      orderBy: { computedAt: "desc" }
    });

    if (!forceRefresh && latest && !this.isSnapshotStale(latest.computedAt)) {
      this.telemetry.increment("orchestra_dashboard_snapshot_cache_hits_total", { scope: "general" });
      return { snapshot: latest, data: latest.payloadJson as GeneralDashboardPayload };
    }

    this.telemetry.increment("orchestra_dashboard_snapshot_rebuilds_total", { scope: "general" });

    try {
      return await this.buildAndPersistGeneralSnapshot(orgId);
    } catch (error) {
      if (!latest) {
        throw error;
      }

      this.telemetry.increment("orchestra_dashboard_snapshot_fallback_total", { scope: "general" });
      return { snapshot: latest, data: latest.payloadJson as GeneralDashboardPayload };
    }
  }

  private async getOrBuildProjectSnapshot(projectId: string, forceRefresh: boolean) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true }
    });
    if (!project) {
      throw new AppError(404, "Project not found", "project_not_found");
    }

    const latest = await this.prisma.dashboardSnapshot.findFirst({
      where: { orgId: project.orgId, projectId, scope: "project" },
      orderBy: { computedAt: "desc" }
    });

    if (!forceRefresh && latest && !this.isSnapshotStale(latest.computedAt)) {
      this.telemetry.increment("orchestra_dashboard_snapshot_cache_hits_total", { scope: "project" });
      return { snapshot: latest, data: latest.payloadJson as ProjectDashboardPayload };
    }

    this.telemetry.increment("orchestra_dashboard_snapshot_rebuilds_total", { scope: "project" });

    try {
      return await this.buildAndPersistProjectSnapshot(projectId);
    } catch (error) {
      if (!latest) {
        throw error;
      }

      this.telemetry.increment("orchestra_dashboard_snapshot_fallback_total", { scope: "project" });
      return { snapshot: latest, data: latest.payloadJson as ProjectDashboardPayload };
    }
  }

  private async buildAndPersistGeneralSnapshot(orgId: string) {
    const startedAt = process.hrtime.bigint();
    const data = await this.buildGeneralDashboardPayload(orgId);
    const snapshot = await this.persistSnapshot("general", orgId, null, data);
    this.telemetry.increment("orchestra_dashboard_snapshots_total", { scope: "general" });
    this.observeSnapshotDuration(startedAt, "general");
    return { snapshot, data };
  }

  private async buildAndPersistProjectSnapshot(projectId: string) {
    const startedAt = process.hrtime.bigint();
    const data = await this.buildProjectDashboardPayload(projectId);
    const snapshot = await this.persistSnapshot("project", data.project.orgId, projectId, data);
    this.telemetry.increment("orchestra_dashboard_snapshots_total", { scope: "project" });
    this.observeSnapshotDuration(startedAt, "project");
    return { snapshot, data };
  }

  private async persistSnapshot(
    scope: DashboardSnapshotScope,
    orgId: string,
    projectId: string | null,
    payload: GeneralDashboardPayload | ProjectDashboardPayload
  ) {
    const now = new Date();
    const latest = await this.prisma.dashboardSnapshot.findFirst({
      where: { orgId, scope, projectId },
      orderBy: { computedAt: "desc" }
    });

    if (latest && JSON.stringify(latest.payloadJson) === JSON.stringify(payload)) {
      return this.prisma.dashboardSnapshot.update({
        where: { id: latest.id },
        data: { payloadJson: payload as object, computedAt: now }
      });
    }

    return this.prisma.dashboardSnapshot.create({
      data: {
        orgId,
        projectId,
        scope,
        payloadJson: payload as object,
        computedAt: now
      }
    });
  }

  private async buildGeneralDashboardPayload(orgId: string): Promise<GeneralDashboardPayload> {
    const [organization, users, projects] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { id: true, name: true, slug: true }
      }),
      this.prisma.user.findMany({
        where: { orgId, isActive: true },
        select: { id: true, displayName: true, workspaceRoleDefault: true }
      }),
      this.prisma.project.findMany({
        where: { orgId, status: "active" },
        orderBy: [{ createdAt: "desc" }],
        include: {
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: { id: true, displayName: true, workspaceRoleDefault: true, isActive: true }
              }
            }
          },
          documents: {
            orderBy: { createdAt: "desc" },
            include: {
              versions: {
                orderBy: { createdAt: "desc" },
                select: { id: true, status: true, createdAt: true, processedAt: true }
              }
            }
          },
          changeProposals: {
            where: { status: { in: ["needs_review", "accepted"] } },
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, summary: true, status: true, acceptedAt: true }
          },
          decisions: {
            where: { status: { in: ["open", "accepted"] } },
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, status: true, acceptedAt: true }
          },
          artifacts: {
            where: { artifactType: "product_brain", status: "accepted" },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, acceptedAt: true, createdAt: true }
          },
          communicationConnectors: {
            select: { id: true, provider: true, status: true, lastSyncedAt: true, lastError: true }
          },
          messageInsights: {
            where: {
              status: { in: ["detected", "converted_to_proposal", "converted_to_decision"] }
            },
            select: { id: true, insightType: true, generatedProposalId: true }
          }
        }
      })
    ]);

    const roleBreakdown = users.reduce<Record<string, number>>((accumulator, user) => {
      accumulator[user.workspaceRoleDefault] = (accumulator[user.workspaceRoleDefault] ?? 0) + 1;
      return accumulator;
    }, {});

    const projectCards = projects
      .map((project) => this.buildProjectCard(project))
      .sort((left, right) => right.attention.score - left.attention.score || left.name.localeCompare(right.name));
    const attentionProjects = projectCards
      .filter((project) => project.attention.label !== "healthy")
      .slice(0, 5);
    const allocationSummary = this.buildOrgAllocationSummary(projects);
    const freshnessSummary = projectCards.reduce<Record<BrainFreshnessState, number>>(
      (accumulator, project) => {
        accumulator[project.brain.freshnessState] += 1;
        return accumulator;
      },
      { current: 0, processing: 0, stale: 0, blocked: 0 }
    );
    const communicationSummary = projectCards.reduce(
      (accumulator, project) => {
        accumulator.connectedProviderCount += project.communication.providerCount;
        accumulator.needsReviewCount += project.communication.needsReviewCount;
        accumulator.blockerCount += project.communication.blockerCount;
        accumulator.contradictionCount += project.communication.contradictionCount;
        if (
          project.communication.lastSyncedAt &&
          (!accumulator.lastSyncedAt || project.communication.lastSyncedAt > accumulator.lastSyncedAt)
        ) {
          accumulator.lastSyncedAt = project.communication.lastSyncedAt;
        }
        return accumulator;
      },
      {
        connectedProviderCount: 0,
        needsReviewCount: 0,
        blockerCount: 0,
        contradictionCount: 0,
        lastSyncedAt: null as string | null
      }
    );

    return {
      scope: "general",
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      computedAt: new Date().toISOString(),
      summary: {
        activeProjectCount: projectCards.length,
        orgHeadcount: users.length,
        orgRoleBreakdown: roleBreakdown,
        projectMemberDistribution: projectCards
          .map((project) => ({
            projectId: project.projectId,
            name: project.name,
            memberCount: project.team.headcount
          }))
          .sort((left, right) => right.memberCount - left.memberCount || left.name.localeCompare(right.name)),
        overloadedMembers: allocationSummary.members,
        overloadedCount: allocationSummary.members.filter((member) => member.workloadLabel === "overloaded").length,
        watchCount: allocationSummary.members.filter((member) => member.workloadLabel === "watch").length,
        projectsNeedingAttention: attentionProjects,
        changePressure: {
          pendingCount: projectCards.reduce((sum, project) => sum + project.changes.pendingCount, 0),
          recentAcceptedCount: projectCards.reduce((sum, project) => sum + project.changes.acceptedRecentCount, 0),
          openDecisionCount: projectCards.reduce((sum, project) => sum + project.decisions.openCount, 0)
        },
        brainFreshness: freshnessSummary,
        communication: communicationSummary
      },
      projects: projectCards,
      quickLinks: {
        projects: projectCards.slice(0, 6).map((project) => ({
          projectId: project.projectId,
          name: project.name,
          dashboardPath: `/projects/${project.projectId}/dashboard`,
          brainPath: `/projects/${project.projectId}/brain/current`,
          documentsPath: `/projects/${project.projectId}/documents`
        }))
      }
    };
  }

  private async buildProjectDashboardPayload(projectId: string): Promise<ProjectDashboardPayload> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        members: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, displayName: true, workspaceRoleDefault: true }
            }
          }
        },
        documents: {
          orderBy: { createdAt: "desc" },
          include: {
            versions: {
              orderBy: { createdAt: "desc" },
              select: { id: true, status: true, createdAt: true, processedAt: true }
            }
          }
        },
        changeProposals: {
          where: { status: { in: ["needs_review", "accepted"] } },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, summary: true, status: true, acceptedAt: true }
        },
        decisions: {
          where: { status: { in: ["open", "accepted"] } },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, status: true, acceptedAt: true }
        },
        artifacts: {
          where: { artifactType: "product_brain", status: "accepted" },
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { id: true, versionNumber: true, acceptedAt: true, createdAt: true }
        },
        communicationConnectors: {
          select: { id: true, provider: true, status: true, lastSyncedAt: true, lastError: true }
        },
        messageInsights: {
          where: {
            status: { in: ["detected", "converted_to_proposal", "converted_to_decision"] }
          },
          select: { id: true, insightType: true, generatedProposalId: true }
        }
      }
    });

    const teamSummary = this.buildTeamSummary(project.members);
    const documents = this.buildDocumentReadiness(project.documents);
    const brain = this.buildBrainFreshness(project.artifacts[0] ?? null, documents, project.changeProposals, project.decisions);
    const changes = this.buildChangeSummary(project.changeProposals);
    const decisions = this.buildDecisionSummary(project.decisions);
    const communication = this.buildCommunicationSummary(project.communicationConnectors, project.messageInsights);
    const attention = this.buildAttention({
      overloadedCount: teamSummary.workload.overloadedCount,
      watchCount: teamSummary.workload.watchCount,
      pendingChanges: changes.pendingCount,
      openDecisions: decisions.openCount,
      processingDocs: documents.counts.processing + documents.counts.pending,
      failedDocs: documents.counts.failed,
      brainState: brain.freshnessState,
      sourceReadyCount: documents.counts.ready + documents.counts.partial,
      sourceTotalCount: documents.totalCount,
      needsReview: communication.needsReviewCount,
      blockers: communication.blockerCount,
      contradictions: communication.contradictionCount
    });

    return {
      scope: "project",
      computedAt: new Date().toISOString(),
      project: {
        id: project.id,
        orgId: project.orgId,
        name: project.name,
        slug: project.slug,
        status: project.status,
        description: project.description,
        previewUrl: project.previewUrl,
        memberCount: teamSummary.headcount,
        documentCount: documents.totalCount
      },
      teamSummary,
      documents,
      brain,
      changes,
      decisions,
      communication,
      attention,
      quickLinks: this.buildProjectQuickLinks(project.id, project.documents),
      recentActivity: {
        latestAcceptedChangeAt: changes.latestAcceptedAt,
        latestDecisionAt: decisions.latestAcceptedAt,
        latestDocumentProcessedAt: documents.latestProcessedAt
      }
    };
  }

  private buildProjectCard(project: {
    id: string;
    name: string;
    slug: string;
    status: string;
    members: Parameters<DashboardService["buildTeamSummary"]>[0];
    documents: Parameters<DashboardService["buildDocumentReadiness"]>[0];
    changeProposals: Parameters<DashboardService["buildChangeSummary"]>[0];
    decisions: Parameters<DashboardService["buildDecisionSummary"]>[0];
    artifacts: Array<Pick<ArtifactVersion, "id" | "versionNumber" | "acceptedAt" | "createdAt">>;
    communicationConnectors: Array<{ id: string; provider: string; status: string; lastSyncedAt: Date | null; lastError: string | null }>;
    messageInsights: Array<{ id: string; insightType: string; generatedProposalId: string | null }>;
  }): ProjectCard {
    const teamSummary = this.buildTeamSummary(project.members);
    const documents = this.buildDocumentReadiness(project.documents);
    const brain = this.buildBrainFreshness(project.artifacts[0] ?? null, documents, project.changeProposals, project.decisions);
    const changes = this.buildChangeSummary(project.changeProposals);
    const decisions = this.buildDecisionSummary(project.decisions);
    const communication = this.buildCommunicationSummary(project.communicationConnectors, project.messageInsights);
    const attention = this.buildAttention({
      overloadedCount: teamSummary.workload.overloadedCount,
      watchCount: teamSummary.workload.watchCount,
      pendingChanges: changes.pendingCount,
      openDecisions: decisions.openCount,
      processingDocs: documents.counts.processing + documents.counts.pending,
      failedDocs: documents.counts.failed,
      brainState: brain.freshnessState,
      sourceReadyCount: documents.counts.ready + documents.counts.partial,
      sourceTotalCount: documents.totalCount,
      needsReview: communication.needsReviewCount,
      blockers: communication.blockerCount,
      contradictions: communication.contradictionCount
    });

    return {
      projectId: project.id,
      name: project.name,
      slug: project.slug,
      status: project.status,
      team: {
        headcount: teamSummary.headcount,
        roleBreakdown: teamSummary.roleBreakdown
      },
      workload: {
        label: teamSummary.workload.label,
        overloadedCount: teamSummary.workload.overloadedCount,
        watchCount: teamSummary.workload.watchCount
      },
      documents: {
        readinessState: documents.readinessState,
        totalCount: documents.totalCount,
        processingCount: documents.counts.processing + documents.counts.pending,
        failedCount: documents.counts.failed
      },
      brain,
      changes,
      decisions,
      communication,
      attention,
      movementLabel: this.buildMovementLabel(changes, documents, brain),
      quickLinks: this.buildProjectQuickLinks(project.id, project.documents)
    };
  }

  private buildTeamSummary(
    members: Array<{
      id: string;
      projectRole: ProjectRole;
      roleInProject: string | null;
      allocationPercent: number | null;
      weeklyCapacityHours: number | null;
      user: { id: string; displayName: string };
    }>
  ): TeamSummary {
    const roleBreakdown = members.reduce<Record<string, number>>((accumulator, member) => {
      accumulator[member.projectRole] = (accumulator[member.projectRole] ?? 0) + 1;
      return accumulator;
    }, {});

    const mappedMembers = members.map((member) => ({
      membershipId: member.id,
      userId: member.user.id,
      displayName: member.user.displayName,
      projectRole: member.projectRole,
      roleInProject: member.roleInProject,
      allocationPercent: member.allocationPercent,
      weeklyCapacityHours: member.weeklyCapacityHours,
      workloadLabel: this.buildWorkloadLabel(member.allocationPercent)
    }));

    const overloadedCount = mappedMembers.filter((member) => member.workloadLabel === "overloaded").length;
    const watchCount = mappedMembers.filter((member) => member.workloadLabel === "watch").length;
    const unknownCount = mappedMembers.filter((member) => member.workloadLabel === "unknown").length;

    return {
      headcount: mappedMembers.length,
      roleBreakdown,
      members: mappedMembers,
      workload: {
        label:
          overloadedCount > 0
            ? "attention"
            : watchCount > 0
              ? "watch"
              : unknownCount === mappedMembers.length && mappedMembers.length > 0
                ? "unknown"
                : "healthy",
        overloadedCount,
        watchCount,
        unknownCount
      }
    };
  }

  private buildDocumentReadiness(
    documents: Array<{
      id: string;
      title: string;
      currentVersionId: string | null;
      versions: Array<{
        id: string;
        status: "pending" | "processing" | "ready" | "partial" | "failed";
        createdAt: Date;
        processedAt: Date | null;
      }>;
    }>
  ): DocumentReadiness {
    const counts = {
      pending: 0,
      processing: 0,
      ready: 0,
      partial: 0,
      failed: 0
    } as DocumentReadiness["counts"];
    let latestProcessedAt: string | null = null;

    const mapped = documents.map((document) => {
      const currentVersion =
        document.versions.find((version) => version.id === document.currentVersionId) ?? document.versions[0] ?? null;
      const status = currentVersion?.status ?? "pending";
      counts[status] += 1;

      if (currentVersion?.processedAt) {
        const iso = currentVersion.processedAt.toISOString();
        if (!latestProcessedAt || iso > latestProcessedAt) {
          latestProcessedAt = iso;
        }
      }

      return {
        documentId: document.id,
        title: document.title,
        currentVersionId: currentVersion?.id ?? null,
        status,
        processedAt: currentVersion?.processedAt?.toISOString() ?? null
      };
    });

    const totalCount = documents.length;
    const readinessState =
      totalCount === 0
        ? "empty"
        : counts.failed > 0 && counts.ready + counts.partial === 0
          ? "blocked"
          : counts.processing > 0 || counts.pending > 0
            ? "processing"
            : counts.failed > 0
              ? "watch"
              : "ready";

    return {
      totalCount,
      readinessState,
      counts,
      latestProcessedAt,
      documents: mapped
    };
  }

  private buildBrainFreshness(
    latestBrain: Pick<ArtifactVersion, "id" | "versionNumber" | "acceptedAt" | "createdAt"> | null,
    documents: DocumentReadiness,
    changes: Array<{ acceptedAt: Date | null }>,
    decisions: Array<{ acceptedAt: Date | null; status: DecisionStatus }>
  ): BrainSummary {
    const acceptedAtMs = latestBrain?.acceptedAt?.getTime() ?? latestBrain?.createdAt.getTime() ?? 0;
    const latestAcceptedChangeAt = changes
      .map((change) => change.acceptedAt?.getTime() ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const latestAcceptedDecisionAt = decisions
      .map((decision) => (decision.status === "accepted" ? decision.acceptedAt?.getTime() ?? 0 : 0))
      .reduce((max, value) => Math.max(max, value), 0);

    let freshnessState: BrainFreshnessState;
    if (!latestBrain && documents.totalCount === 0) {
      freshnessState = "blocked";
    } else if (!latestBrain && documents.counts.ready + documents.counts.partial === 0) {
      freshnessState = "blocked";
    } else if (documents.counts.processing + documents.counts.pending > 0) {
      freshnessState = "processing";
    } else if (!latestBrain) {
      freshnessState = "blocked";
    } else if (documents.latestProcessedAt && new Date(documents.latestProcessedAt).getTime() > acceptedAtMs) {
      freshnessState = "stale";
    } else if (latestAcceptedChangeAt > acceptedAtMs || latestAcceptedDecisionAt > acceptedAtMs) {
      freshnessState = "stale";
    } else if (Date.now() - acceptedAtMs > BRAIN_STALE_AFTER_MS) {
      freshnessState = "stale";
    } else {
      freshnessState = "current";
    }

    return {
      freshnessState,
      latestVersionId: latestBrain?.id ?? null,
      latestVersionNumber: latestBrain?.versionNumber ?? null,
      acceptedAt: latestBrain?.acceptedAt?.toISOString() ?? null,
      latestAcceptedChangeAt: latestAcceptedChangeAt ? new Date(latestAcceptedChangeAt).toISOString() : null,
      latestAcceptedDecisionAt: latestAcceptedDecisionAt ? new Date(latestAcceptedDecisionAt).toISOString() : null
    };
  }

  private buildChangeSummary(
    proposals: Array<{
      id: string;
      title: string;
      summary: string | null;
      status: ProposalStatus;
      acceptedAt: Date | null;
    }>
  ): ChangeSummary {
    const pending = proposals.filter((proposal) => proposal.status === "needs_review");
    const accepted = proposals.filter((proposal) => proposal.status === "accepted");
    const recentAccepted = accepted.filter((proposal) => {
      if (!proposal.acceptedAt) {
        return false;
      }
      return Date.now() - proposal.acceptedAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
    });

    return {
      pendingCount: pending.length,
      acceptedRecentCount: recentAccepted.length,
      latestAcceptedAt: accepted[0]?.acceptedAt?.toISOString() ?? null,
      pendingSummaries: pending.slice(0, 5).map((proposal) => ({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.summary
      })),
      recentAccepted: recentAccepted.slice(0, 5).map((proposal) => ({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        acceptedAt: proposal.acceptedAt?.toISOString() ?? null
      }))
    };
  }

  private buildDecisionSummary(
    decisions: Array<{
      id: string;
      title: string;
      status: DecisionStatus;
      acceptedAt: Date | null;
    }>
  ): DecisionSummary {
    const open = decisions.filter((decision) => decision.status === "open");
    const accepted = decisions.filter((decision) => decision.status === "accepted");

    return {
      openCount: open.length,
      latestAcceptedAt: accepted[0]?.acceptedAt?.toISOString() ?? null,
      openItems: open.slice(0, 5).map((decision) => ({
        decisionId: decision.id,
        title: decision.title
      }))
    };
  }

  private buildProjectQuickLinks(
    projectId: string,
    documents: Array<{ id: string }>
  ): ProjectQuickLinks {
    const primaryDocumentId = documents[0]?.id ?? null;
    return {
      dashboardPath: `/projects/${projectId}/dashboard`,
      brainPath: `/projects/${projectId}/brain/current`,
      documentsPath: `/projects/${projectId}/documents`,
      docViewerPath: primaryDocumentId ? `/projects/${projectId}/documents/${primaryDocumentId}/view` : null,
      docViewerState: primaryDocumentId
        ? {
            pageContext: "doc_viewer",
            selectedRefType: "document",
            selectedRefId: primaryDocumentId
          }
        : null,
      brainViewerState: {
        pageContext: "brain_overview",
        selectedRefType: "dashboard_scope",
        selectedRefId: projectId
      }
    };
  }

  private buildWorkloadLabel(allocationPercent: number | null): WorkloadLabel {
    if (allocationPercent === null || allocationPercent === undefined) {
      return "unknown";
    }
    if (allocationPercent > 100) {
      return "overloaded";
    }
    if (allocationPercent >= 80) {
      return "watch";
    }
    return "normal";
  }

  private buildOrgAllocationSummary(
    projects: Array<{
      name: string;
      members: Array<{
        allocationPercent: number | null;
        user: { id: string; displayName: string };
      }>;
    }>
  ) {
    const members = new Map<
      string,
      {
        userId: string;
        displayName: string;
        totalAllocationPercent: number | null;
        projects: string[];
      }
    >();

    for (const project of projects) {
      for (const member of project.members) {
        const current =
          members.get(member.user.id) ??
          {
            userId: member.user.id,
            displayName: member.user.displayName,
            totalAllocationPercent: 0,
            projects: []
          };

        // Propagate null: if any project has an unknown allocation, the cross-project
        // total is also unknown. Silently ignoring nulls would undercount the load.
        current.totalAllocationPercent =
          member.allocationPercent === null || current.totalAllocationPercent === null
            ? null
            : current.totalAllocationPercent + member.allocationPercent;
        current.projects = Array.from(new Set([...current.projects, project.name]));
        members.set(member.user.id, current);
      }
    }

    return {
      members: Array.from(members.values())
        .map((member) => ({
          ...member,
          workloadLabel: this.buildWorkloadLabel(member.totalAllocationPercent)
        }))
        .sort((left, right) => (right.totalAllocationPercent ?? -1) - (left.totalAllocationPercent ?? -1))
        .slice(0, 8)
    };
  }

  private buildAttention(input: {
    overloadedCount: number;
    watchCount: number;
    pendingChanges: number;
    openDecisions: number;
    processingDocs: number;
    failedDocs: number;
    brainState: BrainFreshnessState;
    sourceReadyCount: number;
    sourceTotalCount: number;
    needsReview: number;
    blockers: number;
    contradictions: number;
  }): AttentionSummary {
    const reasons: string[] = [];
    let score = 0;

    if (input.failedDocs > 0) {
      score += 4;
      reasons.push(`${input.failedDocs} failed document${input.failedDocs === 1 ? "" : "s"}`);
    }
    if (input.processingDocs > 0) {
      score += 2;
      reasons.push(`${input.processingDocs} document${input.processingDocs === 1 ? "" : "s"} processing`);
    }
    if (input.pendingChanges > 0) {
      score += Math.min(4, input.pendingChanges);
      reasons.push(`${input.pendingChanges} pending change${input.pendingChanges === 1 ? "" : "s"}`);
    }
    if (input.needsReview > 0) {
      score += Math.min(3, input.needsReview);
      reasons.push(`${input.needsReview} communication insight${input.needsReview === 1 ? "" : "s"} need review`);
    }
    if (input.blockers > 0) {
      score += Math.min(4, input.blockers * 2);
      reasons.push(`${input.blockers} communication blocker${input.blockers === 1 ? "" : "s"}`);
    }
    if (input.contradictions > 0) {
      score += Math.min(3, input.contradictions);
      reasons.push(`${input.contradictions} unresolved contradiction${input.contradictions === 1 ? "" : "s"}`);
    }
    if (input.openDecisions > 0) {
      score += Math.min(3, input.openDecisions);
      reasons.push(`${input.openDecisions} open decision${input.openDecisions === 1 ? "" : "s"}`);
    }
    if (input.overloadedCount > 0) {
      score += Math.min(4, input.overloadedCount * 2);
      reasons.push(`${input.overloadedCount} overloaded member${input.overloadedCount === 1 ? "" : "s"}`);
    } else if (input.watchCount > 0) {
      score += Math.min(2, input.watchCount);
      reasons.push(`${input.watchCount} member${input.watchCount === 1 ? "" : "s"} near capacity`);
    }
    if (input.sourceTotalCount > 0 && input.sourceReadyCount === 0) {
      score += 3;
      reasons.push("no ready source documents");
    }
    if (input.brainState === "blocked") {
      score += 4;
      reasons.push("Product Brain blocked");
    } else if (input.brainState === "stale") {
      score += 3;
      reasons.push("Product Brain stale");
    } else if (input.brainState === "processing") {
      score += 1;
      reasons.push("Product Brain processing");
    }

    return {
      score,
      label: score >= 7 ? "attention" : score >= 3 ? "watch" : "healthy",
      reasons
    };
  }

  private buildCommunicationSummary(
    connectors: Array<{ id: string; provider: string; status: string; lastSyncedAt: Date | null; lastError: string | null }>,
    insights: Array<{ id: string; insightType: string; generatedProposalId: string | null }>
  ): CommunicationSummary {
    const lastSyncedAt = connectors
      .map((connector) => connector.lastSyncedAt?.toISOString() ?? null)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      connectedProviders: connectors.filter((connector) => connector.status === "connected").map((connector) => connector.provider),
      providerCount: connectors.filter((connector) => connector.status === "connected").length,
      lastSyncedAt,
      insightCount: insights.length,
      needsReviewCount: insights.filter((insight) => !insight.generatedProposalId).length,
      blockerCount: insights.filter((insight) => insight.insightType === "blocker").length,
      contradictionCount: insights.filter((insight) => insight.insightType === "contradiction").length,
      connectorStatuses: connectors.map((connector) => ({
        connectorId: connector.id,
        provider: connector.provider,
        status: connector.status,
        lastSyncedAt: connector.lastSyncedAt?.toISOString() ?? null,
        lastError: connector.lastError
      }))
    };
  }

  private buildMovementLabel(changes: ChangeSummary, documents: DocumentReadiness, brain: BrainSummary) {
    if (changes.acceptedRecentCount >= 2 || documents.counts.processing + documents.counts.pending > 0) {
      return "fast" as const;
    }
    if ((brain.freshnessState === "stale" || brain.freshnessState === "blocked") && changes.pendingCount === 0) {
      return "slow" as const;
    }
    return "steady" as const;
  }

  private assertProjectDashboardRole(projectRole: ProjectRole) {
    if (projectRole === "client") {
      throw new AppError(403, "Client dashboard access is not available", "client_dashboard_access_forbidden");
    }
  }

  private isSnapshotStale(computedAt: Date) {
    return Date.now() - computedAt.getTime() > SNAPSHOT_STALE_MS;
  }

  private observeDashboardDuration(startedAt: bigint, scope: "general" | "project") {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.telemetry.increment("orchestra_dashboard_requests_total", { scope });
    this.telemetry.observeDuration("orchestra_dashboard_request_duration_ms", durationMs, { scope });
  }

  private observeSnapshotDuration(startedAt: bigint, scope: "general" | "project") {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.telemetry.observeDuration("orchestra_dashboard_snapshot_build_duration_ms", durationMs, { scope });
  }

  private async finishRefreshJob(idempotencyKey: string) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType: "refresh_dashboard_snapshot",
        status: "completed",
        finishedAt: new Date(),
        lastError: null
      },
      create: {
        jobType: "refresh_dashboard_snapshot",
        status: "completed",
        idempotencyKey,
        finishedAt: new Date()
      }
    });
  }

  private async failRefreshJob(idempotencyKey: string, error: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType: "refresh_dashboard_snapshot",
        status: "failed",
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      },
      create: {
        jobType: "refresh_dashboard_snapshot",
        status: "failed",
        idempotencyKey,
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
}
