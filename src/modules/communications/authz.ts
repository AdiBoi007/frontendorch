import { AppError } from "../../app/errors.js";
import type { ProjectService } from "../projects/service.js";

export async function ensureCommunicationManager(
  projectService: ProjectService,
  projectId: string,
  actorUserId: string
) {
  return projectService.ensureProjectManager(projectId, actorUserId);
}

export async function ensureCommunicationReadAccess(
  projectService: ProjectService,
  projectId: string,
  actorUserId: string
) {
  const member = await projectService.ensureProjectAccess(projectId, actorUserId);
  if (member.projectRole === "client") {
    throw new AppError(403, "Client communication access is not available", "client_communication_access_forbidden");
  }

  return member;
}
