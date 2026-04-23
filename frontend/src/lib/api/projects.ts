import { apiFetch } from "../http";

export type WorkspaceRole = "manager" | "dev" | "client";
export type ProjectStatus = "active" | "paused" | "archived";

export interface ProjectMembership {
  id: string;
  projectId: string;
  userId: string;
  projectRole: WorkspaceRole;
  roleInProject: string | null;
  allocationPercent: number | null;
  weeklyCapacityHours: number | null;
  isActive: boolean;
  joinedAt: string;
  updatedAt: string;
}

export interface ProjectListItem {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  previewUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: ProjectMembership[];
}

export interface ProjectDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  previewUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberUser {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  globalRole: "owner" | "admin" | "member";
  workspaceRoleDefault: WorkspaceRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberDetail extends ProjectMembership {
  user: ProjectMemberUser;
}

export interface ProjectMembersResponse {
  members: ProjectMemberDetail[];
  summary: {
    headcount: number;
    roleSummary: Record<string, number>;
  };
}

interface Envelope<T> {
  data: T;
  meta: unknown;
  error: unknown;
}

export async function apiListProjects(): Promise<ProjectListItem[]> {
  const response = await apiFetch<Envelope<ProjectListItem[]>>("/v1/projects");
  return response.data;
}

export async function apiGetProject(projectId: string): Promise<ProjectDetail> {
  const response = await apiFetch<Envelope<ProjectDetail>>(`/v1/projects/${projectId}`);
  return response.data;
}

export async function apiGetProjectMembers(projectId: string): Promise<ProjectMembersResponse> {
  const response = await apiFetch<Envelope<ProjectMembersResponse>>(`/v1/projects/${projectId}/members`);
  return response.data;
}
