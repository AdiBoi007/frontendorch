import { apiFetch } from "../http";
import type { ProjectStatus, WorkspaceRole } from "./projects";

interface Envelope<T> {
  data: T;
  meta: unknown;
  error: unknown;
}

type WorkloadLabel = "normal" | "watch" | "overloaded" | "unknown";
type BrainFreshnessState = "current" | "processing" | "stale" | "blocked";
type AttentionLabel = "healthy" | "watch" | "attention";

export interface GeneralDashboardProjectCard {
  projectId: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  team: {
    headcount: number;
    roleBreakdown: Record<string, number>;
  };
  workload: {
    label: "healthy" | "watch" | "attention" | "unknown";
    overloadedCount: number;
    watchCount: number;
  };
  documents: {
    readinessState: "empty" | "ready" | "processing" | "watch" | "blocked";
    totalCount: number;
    processingCount: number;
    failedCount: number;
  };
  brain: {
    freshnessState: BrainFreshnessState;
    latestVersionId: string | null;
    latestVersionNumber: number | null;
    acceptedAt: string | null;
    latestAcceptedChangeAt: string | null;
    latestAcceptedDecisionAt: string | null;
  };
  changes: {
    pendingCount: number;
    acceptedRecentCount: number;
    latestAcceptedAt: string | null;
  };
  decisions: {
    openCount: number;
    latestAcceptedAt: string | null;
  };
  communication: {
    connectedProviders: string[];
    providerCount: number;
    lastSyncedAt: string | null;
    insightCount: number;
    needsReviewCount: number;
    blockerCount: number;
    contradictionCount: number;
  };
  attention: {
    score: number;
    label: AttentionLabel;
    reasons: string[];
  };
  movementLabel: "fast" | "steady" | "slow";
  quickLinks: {
    dashboardPath: string;
    brainPath: string;
    documentsPath: string;
    docViewerPath: string | null;
  };
}

export interface GeneralDashboardPayload {
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
    projectsNeedingAttention: GeneralDashboardProjectCard[];
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
  projects: GeneralDashboardProjectCard[];
  quickLinks: {
    projects: Array<{
      projectId: string;
      name: string;
      dashboardPath: string;
      brainPath: string;
      documentsPath: string;
    }>;
  };
}

export interface ProjectDashboardPayload {
  scope: "project";
  computedAt: string;
  project: {
    id: string;
    orgId: string;
    name: string;
    slug: string;
    status: ProjectStatus;
    description: string | null;
    previewUrl: string | null;
    memberCount: number;
    documentCount: number;
  };
  teamSummary: {
    headcount: number;
    roleBreakdown: Record<string, number>;
    members: Array<{
      membershipId: string;
      userId: string;
      displayName: string;
      projectRole: WorkspaceRole;
      roleInProject: string | null;
      allocationPercent: number | null;
      weeklyCapacityHours: number | null;
      workloadLabel: WorkloadLabel;
    }>;
    workload: {
      label: "healthy" | "watch" | "attention" | "unknown";
      overloadedCount: number;
      watchCount: number;
      unknownCount: number;
    };
  };
  documents: {
    totalCount: number;
    readinessState: "empty" | "ready" | "processing" | "watch" | "blocked";
    counts: Record<"pending" | "processing" | "ready" | "partial" | "failed", number>;
    latestProcessedAt: string | null;
  };
  brain: {
    freshnessState: BrainFreshnessState;
    latestVersionId: string | null;
    latestVersionNumber: number | null;
    acceptedAt: string | null;
  };
  changes: {
    pendingCount: number;
    acceptedRecentCount: number;
    latestAcceptedAt: string | null;
    pendingSummaries: Array<{ proposalId: string; title: string; summary: string | null }>;
    recentAccepted: Array<{ proposalId: string; title: string; summary: string | null; acceptedAt: string | null }>;
  };
  decisions: {
    openCount: number;
    latestAcceptedAt: string | null;
    openItems: Array<{ decisionId: string; title: string }>;
  };
  communication: {
    connectedProviders: string[];
    providerCount: number;
    lastSyncedAt: string | null;
    insightCount: number;
    needsReviewCount: number;
    blockerCount: number;
    contradictionCount: number;
  };
  attention: {
    score: number;
    label: AttentionLabel;
    reasons: string[];
  };
  quickLinks: {
    dashboardPath: string;
    brainPath: string;
    documentsPath: string;
    docViewerPath: string | null;
  };
  recentActivity: {
    latestAcceptedChangeAt: string | null;
    latestDecisionAt: string | null;
    latestDocumentProcessedAt: string | null;
  };
}

export interface TeamSummaryPayload {
  headcount: number;
  roleBreakdown: Record<string, number>;
  members: ProjectDashboardPayload["teamSummary"]["members"];
  workload: ProjectDashboardPayload["teamSummary"]["workload"];
}

export async function apiGetGeneralDashboard(): Promise<GeneralDashboardPayload> {
  const response = await apiFetch<Envelope<GeneralDashboardPayload>>("/v1/dashboard/general");
  return response.data;
}

export async function apiGetProjectDashboard(projectId: string): Promise<ProjectDashboardPayload> {
  const response = await apiFetch<Envelope<ProjectDashboardPayload>>(`/v1/projects/${projectId}/dashboard`);
  return response.data;
}

export async function apiGetProjectTeamSummary(projectId: string): Promise<TeamSummaryPayload> {
  const response = await apiFetch<Envelope<TeamSummaryPayload>>(`/v1/projects/${projectId}/team-summary`);
  return response.data;
}
