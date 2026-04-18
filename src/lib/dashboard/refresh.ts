import type { PrismaClient } from "@prisma/client";
import { jobKeys } from "../jobs/keys.js";
import { JobNames, type JobDispatcher } from "../jobs/types.js";

type DashboardRefreshScope = "general" | "project";

function triggerBucket() {
  return new Date().toISOString().slice(0, 16);
}

async function enqueueDashboardRefresh(
  prisma: PrismaClient,
  jobs: JobDispatcher,
  input: {
    scope: DashboardRefreshScope;
    orgId: string;
    projectId?: string | null;
    reason: string;
  }
) {
  const key = jobKeys.refreshDashboardSnapshot(
    input.scope,
    input.projectId ?? input.orgId,
    `${input.reason}:${triggerBucket()}`
  );
  const payload = {
    scope: input.scope,
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    reason: input.reason,
    idempotencyKey: key
  };

  await prisma.jobRun.upsert({
    where: { idempotencyKey: key },
    update: {
      jobType: JobNames.refreshDashboardSnapshot,
      status: "pending",
      payloadJson: payload,
      finishedAt: null,
      lastError: null
    },
    create: {
      jobType: JobNames.refreshDashboardSnapshot,
      status: "pending",
      idempotencyKey: key,
      payloadJson: payload
    }
  });

  await jobs.enqueue(JobNames.refreshDashboardSnapshot, payload, key);
}

export async function enqueueGeneralDashboardRefresh(
  prisma: PrismaClient,
  jobs: JobDispatcher,
  orgId: string,
  reason: string
) {
  await enqueueDashboardRefresh(prisma, jobs, {
    scope: "general",
    orgId,
    reason
  });
}

export async function enqueueProjectDashboardRefreshByProjectId(
  prisma: PrismaClient,
  jobs: JobDispatcher,
  projectId: string,
  reason: string
) {
  if (!("project" in prisma) || typeof prisma.project?.findUnique !== "function") {
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true }
  });

  if (!project) {
    return;
  }

  await Promise.all([
    enqueueDashboardRefresh(prisma, jobs, {
      scope: "project",
      orgId: project.orgId,
      projectId: project.id,
      reason
    }),
    enqueueDashboardRefresh(prisma, jobs, {
      scope: "general",
      orgId: project.orgId,
      reason
    })
  ]);
}
