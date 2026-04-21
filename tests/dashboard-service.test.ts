import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "../src/modules/dashboard/service.js";

describe("DashboardService", () => {
  it("builds a minimal general dashboard snapshot with attention and freshness summaries", async () => {
    const snapshotCreate = vi.fn(async ({ data }) => ({
      id: "snap-general-1",
      computedAt: new Date("2026-04-18T00:00:00.000Z"),
      payloadJson: data.payloadJson
    }));
    const prisma = {
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: snapshotCreate,
        update: vi.fn()
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "org-1",
          name: "Acme",
          slug: "acme"
        })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "user-1", displayName: "Manager", workspaceRoleDefault: "manager" },
          { id: "user-2", displayName: "Dev", workspaceRoleDefault: "dev" }
        ])
      },
      project: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "project-1",
            name: "Apollo",
            slug: "apollo",
            status: "active",
            members: [
              {
                id: "pm-1",
                projectRole: "manager",
                roleInProject: "Lead",
                allocationPercent: 40,
                weeklyCapacityHours: 20,
                user: { id: "user-1", displayName: "Manager", workspaceRoleDefault: "manager", isActive: true }
              },
              {
                id: "pm-2",
                projectRole: "dev",
                roleInProject: "Backend",
                allocationPercent: 120,
                weeklyCapacityHours: 40,
                user: { id: "user-2", displayName: "Dev", workspaceRoleDefault: "dev", isActive: true }
              }
            ],
            documents: [
              {
                id: "doc-1",
                title: "PRD",
                currentVersionId: "ver-1",
                versions: [{ id: "ver-1", status: "failed", createdAt: new Date(), processedAt: null }]
              }
            ],
            changeProposals: [{ id: "proposal-1", title: "Change", summary: "Needs review", status: "needs_review", acceptedAt: null }],
            decisions: [{ id: "decision-1", title: "Decision", status: "open", acceptedAt: null }],
            artifacts: [],
            communicationConnectors: [],
            messageInsights: []
          }
        ])
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getGeneralDashboard({
      orgId: "org-1",
      actorUserId: "user-1",
      forceRefresh: true
    });

    expect(payload.summary.activeProjectCount).toBe(1);
    expect(payload.summary.orgHeadcount).toBe(2);
    expect(payload.summary.projectsNeedingAttention[0].attention.label).toBe("attention");
    expect(payload.summary.overloadedMembers[0]).toMatchObject({
      userId: "user-2",
      workloadLabel: "overloaded"
    });
    expect(payload.summary.brainFreshness.blocked).toBe(1);
    expect(snapshotCreate).toHaveBeenCalled();
  });

  it("returns a fresh project snapshot without rebuilding and blocks client dashboard access", async () => {
    const snapshot = {
      id: "snap-project-1",
      computedAt: new Date(),
      payloadJson: {
        scope: "project",
        computedAt: new Date().toISOString(),
        project: { id: "project-1", orgId: "org-1", name: "Apollo", slug: "apollo", status: "active", description: null, previewUrl: null, memberCount: 1, documentCount: 1 },
        teamSummary: { headcount: 1, roleBreakdown: { dev: 1 }, members: [], workload: { label: "healthy", overloadedCount: 0, watchCount: 0, unknownCount: 0 } },
        documents: { totalCount: 1, readinessState: "ready", counts: { pending: 0, processing: 0, ready: 1, partial: 0, failed: 0 }, latestProcessedAt: null, documents: [] },
        brain: { freshnessState: "current", latestVersionId: "brain-1", latestVersionNumber: 2, acceptedAt: null, latestAcceptedChangeAt: null, latestAcceptedDecisionAt: null },
        changes: { pendingCount: 0, acceptedRecentCount: 0, latestAcceptedAt: null, pendingSummaries: [], recentAccepted: [] },
        decisions: { openCount: 0, latestAcceptedAt: null, openItems: [] },
        communication: { connectedProviders: [], providerCount: 0, lastSyncedAt: null, insightCount: 0, needsReviewCount: 0, blockerCount: 0, contradictionCount: 0, connectorStatuses: [] },
        attention: { score: 0, label: "healthy", reasons: [] },
        quickLinks: { dashboardPath: "", brainPath: "", documentsPath: "", docViewerPath: null, docViewerState: null, brainViewerState: { pageContext: "brain_overview", selectedRefType: "dashboard_scope", selectedRefId: "project-1" } },
        recentActivity: { latestAcceptedChangeAt: null, latestDecisionAt: null, latestDocumentProcessedAt: null }
      }
    };
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({ orgId: "org-1" })
      },
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(snapshot)
      }
    } as any;

    const service = new DashboardService(
      prisma,
      {
        ensureProjectAccess: vi
          .fn()
          .mockResolvedValueOnce({ projectRole: "dev" })
          .mockResolvedValueOnce({ projectRole: "client" }),
        ensureProjectManager: vi.fn()
      } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getProjectDashboard("project-1", "dev-1");
    expect(payload.project.id).toBe("project-1");
    expect(prisma.dashboardSnapshot.findFirst).toHaveBeenCalled();

    await expect(service.getProjectDashboard("project-1", "client-1")).rejects.toMatchObject({
      statusCode: 403,
      code: "client_dashboard_access_forbidden"
    });
  });

  it("computes project attention from stale brain, pending changes, and processing docs", async () => {
    const snapshotCreate = vi.fn(async ({ data }) => ({
      id: "snap-project-2",
      computedAt: new Date("2026-04-18T00:00:00.000Z"),
      payloadJson: data.payloadJson
    }));
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({ orgId: "org-1" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "project-1",
          orgId: "org-1",
          name: "Apollo",
          slug: "apollo",
          status: "active",
          description: null,
          previewUrl: null,
          members: [
            {
              id: "pm-1",
              projectRole: "manager",
              roleInProject: "Lead",
              allocationPercent: 85,
              weeklyCapacityHours: 20,
              user: { id: "user-1", displayName: "Manager", workspaceRoleDefault: "manager" }
            }
          ],
          documents: [
            {
              id: "doc-1",
              title: "PRD",
              currentVersionId: "ver-1",
              versions: [{ id: "ver-1", status: "processing", createdAt: new Date(), processedAt: null }]
            }
          ],
          changeProposals: [{ id: "proposal-1", title: "Change", summary: "Pending", status: "needs_review", acceptedAt: null }],
          decisions: [{ id: "decision-1", title: "Decision", status: "open", acceptedAt: null }],
          artifacts: [
            {
              id: "brain-1",
              versionNumber: 1,
              acceptedAt: new Date("2026-03-01T00:00:00.000Z"),
              createdAt: new Date("2026-03-01T00:00:00.000Z")
            }
          ],
          communicationConnectors: [],
          messageInsights: []
        })
      },
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: snapshotCreate,
        update: vi.fn()
      }
    } as any;

    const service = new DashboardService(
      prisma,
      {
        ensureProjectAccess: vi.fn().mockResolvedValue({ projectRole: "manager" }),
        ensureProjectManager: vi.fn().mockResolvedValue({ projectRole: "manager" })
      } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getProjectDashboard("project-1", "manager-1", { forceRefresh: true });

    expect(payload.attention.label).toBe("attention");
    expect(payload.brain.freshnessState).toBe("processing");
    expect(payload.documents.readinessState).toBe("processing");
    expect(payload.teamSummary.workload.label).toBe("watch");
    expect(payload.quickLinks.brainViewerState.pageContext).toBe("brain_overview");
  });

  it("marks refresh dashboard jobs as running then completed", async () => {
    const jobRunUpsert = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      jobRun: {
        upsert: jobRunUpsert
      },
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => ({
          id: "snap-general-2",
          computedAt: new Date(),
          payloadJson: data.payloadJson
        })),
        update: vi.fn()
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme" })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([])
      },
      project: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    await service.refreshSnapshotJob({
      scope: "general",
      orgId: "org-1",
      idempotencyKey: "dashboard:general:org-1:test"
    });

    expect(jobRunUpsert.mock.calls[0][0].update.status).toBe("running");
    expect(jobRunUpsert.mock.calls.at(-1)![0].update.status).toBe("completed");
  });

  it("builds the general dashboard from active projects only", async () => {
    const prisma = {
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => ({
          id: "snap-general-active",
          computedAt: new Date("2026-04-18T00:00:00.000Z"),
          payloadJson: data.payloadJson
        })),
        update: vi.fn()
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "org-1",
          name: "Acme",
          slug: "acme"
        })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([])
      },
      project: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    await service.getGeneralDashboard({
      orgId: "org-1",
      actorUserId: "user-1",
      forceRefresh: true
    });

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1", status: "active" }
      })
    );
  });

  it("falls back to the latest stale snapshot when rebuild fails", async () => {
    const stalePayload = {
      scope: "general",
      organization: { id: "org-1", name: "Acme", slug: "acme" },
      computedAt: "2026-04-01T00:00:00.000Z",
      summary: {
        activeProjectCount: 1,
        orgHeadcount: 2,
        orgRoleBreakdown: { manager: 1, dev: 1 },
        projectMemberDistribution: [],
        overloadedMembers: [],
        overloadedCount: 0,
        watchCount: 0,
        projectsNeedingAttention: [],
        changePressure: { pendingCount: 0, recentAcceptedCount: 0, openDecisionCount: 0 },
        brainFreshness: { current: 1, processing: 0, stale: 0, blocked: 0 },
        communication: { connectedProviderCount: 0, needsReviewCount: 0, blockerCount: 0, contradictionCount: 0, lastSyncedAt: null }
      },
      projects: [],
      quickLinks: { projects: [] }
    };
    const staleSnapshot = {
      id: "snap-stale",
      computedAt: new Date("2026-04-01T00:00:00.000Z"),
      payloadJson: stalePayload
    };
    const telemetry = { increment: vi.fn(), observeDuration: vi.fn() };
    const prisma = {
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(staleSnapshot)
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockRejectedValue(new Error("db down"))
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      telemetry as any
    );

    const payload = await service.getGeneralDashboard({
      orgId: "org-1",
      actorUserId: "user-1"
    });

    expect(payload).toEqual(stalePayload);
    expect(telemetry.increment).toHaveBeenCalledWith("orchestra_dashboard_snapshot_fallback_total", {
      scope: "general"
    });
  });

  it("propagates null allocation to unknown workload when any project has missing allocationPercent", async () => {
    const snapshotCreate = vi.fn(async ({ data }) => ({
      id: "snap-alloc-1",
      computedAt: new Date("2026-04-19T10:00:00.000Z"),
      payloadJson: data.payloadJson
    }));
    const prisma = {
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: snapshotCreate,
        update: vi.fn()
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme" })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "user-1", displayName: "Dev A", workspaceRoleDefault: "dev" }
        ])
      },
      project: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "project-1",
            name: "Apollo",
            slug: "apollo",
            status: "active",
            // User has a known allocation in project-1
            members: [
              {
                id: "pm-1",
                projectRole: "dev",
                roleInProject: "Backend",
                allocationPercent: 50,
                weeklyCapacityHours: 20,
                user: { id: "user-1", displayName: "Dev A", workspaceRoleDefault: "dev", isActive: true }
              }
            ],
            documents: [],
            changeProposals: [],
            decisions: [],
            artifacts: [],
            communicationConnectors: [],
            messageInsights: []
          },
          {
            id: "project-2",
            name: "Hermes",
            slug: "hermes",
            status: "active",
            // Same user has null allocation in project-2 — total must become null
            members: [
              {
                id: "pm-2",
                projectRole: "dev",
                roleInProject: "Backend",
                allocationPercent: null,
                weeklyCapacityHours: 20,
                user: { id: "user-1", displayName: "Dev A", workspaceRoleDefault: "dev", isActive: true }
              }
            ],
            documents: [],
            changeProposals: [],
            decisions: [],
            artifacts: [],
            communicationConnectors: [],
            messageInsights: []
          }
        ])
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getGeneralDashboard({ orgId: "org-1", actorUserId: "manager-1" });

    // The overloadedMembers list (summary.overloadedMembers) contains all members
    // sorted by allocation desc. user-1 appears once with totalAllocationPercent = null
    // because one component is null, so workloadLabel must be "unknown".
    const userEntry = payload.summary.overloadedMembers.find(
      (member: { userId: string }) => member.userId === "user-1"
    );
    expect(userEntry).toBeDefined();
    expect(userEntry!.totalAllocationPercent).toBeNull();
    expect(userEntry!.workloadLabel).toBe("unknown");
  });

  it("returns movement label slow when brain is blocked and no pending changes", async () => {
    const snapshotCreate = vi.fn(async ({ data }) => ({
      id: "snap-movement-1",
      computedAt: new Date("2026-04-19T10:00:00.000Z"),
      payloadJson: data.payloadJson
    }));
    const prisma = {
      dashboardSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: snapshotCreate,
        update: vi.fn()
      },
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme" })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "user-1", displayName: "Manager", workspaceRoleDefault: "manager" }
        ])
      },
      project: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "project-1",
            name: "Blocked",
            slug: "blocked",
            status: "active",
            members: [
              {
                id: "pm-1",
                projectRole: "manager",
                roleInProject: "Lead",
                allocationPercent: 30,
                weeklyCapacityHours: 20,
                user: { id: "user-1", displayName: "Manager", workspaceRoleDefault: "manager", isActive: true }
              }
            ],
            // One failed document → no ready/partial docs → brain is "blocked"
            documents: [
              {
                id: "doc-1",
                title: "PRD",
                currentVersionId: "ver-1",
                versions: [{ id: "ver-1", status: "failed", createdAt: new Date(), processedAt: null }]
              }
            ],
            // No pending changes, no recent accepted changes
            changeProposals: [],
            decisions: [],
            // No accepted brain
            artifacts: [],
            communicationConnectors: [],
            messageInsights: []
          }
        ])
      }
    } as any;

    const service = new DashboardService(
      prisma,
      { ensureProjectAccess: vi.fn(), ensureProjectManager: vi.fn() } as any,
      { record: vi.fn() } as any,
      { increment: vi.fn(), observeDuration: vi.fn() } as any
    );

    const payload = await service.getGeneralDashboard({ orgId: "org-1", actorUserId: "manager-1" });

    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].brain.freshnessState).toBe("blocked");
    expect(payload.projects[0].movementLabel).toBe("slow");
  });
});
