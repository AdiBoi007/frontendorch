import * as mock from "./mockData";
import { apiGetProject, apiGetProjectMembers, apiListProjects } from "./api/projects";
import { apiListDocuments, apiUploadDocument } from "./api/documents";
import type {
  AnchorProvenance,
  ChatMessage,
  Doc,
  DocViewerPayload,
  FlowGraph,
  LiveDocPayload,
  ProjectDetail,
  ProjectMember,
  RoleOption
} from "./types";

function getInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const getProjects = async () => {
  const projects = await apiListProjects();
  return projects.map((project, index) => ({
    id: project.id,
    name: project.name,
    progress: 0,
    health: project.status === "active" ? "HEALTHY" : project.status === "paused" ? "AT RISK" : "CRITICAL",
    color: index % 2 === 0 ? "#e5e7eb" : "#ede9fe",
  }));
};
export const getDeadlines = async () => mock.mockDeadlines;
export const getRequests = async () => mock.mockRequests;
export const getMeetings = async () => mock.mockMeetings;
// TODO: getMeetings -> Google Calendar OAuth
export const getCalendarEvents = async () => mock.mockCalendarEvents;
// TODO: swap mockCalendarEvents with Google Calendar API
export const getLoginRoles = async (): Promise<RoleOption[]> => mock.mockRoles;
export const getSocratesSuggestions = async (page: "dashboard" | "project") => mock.mockSocratesSuggestions[page];
export const getSocratesReply = async (page: "dashboard" | "project") => mock.mockSocratesReplies[page];
export const getSocratesMessages = async (): Promise<ChatMessage[]> => mock.mockSocratesMessages;

export const getProjectDetail = async (projectId: string): Promise<ProjectDetail> => {
  const [detail, members] = await Promise.all([apiGetProject(projectId), apiGetProjectMembers(projectId)]);

  return {
    id: detail.id,
    name: detail.name,
    health: detail.status === "active" ? "HEALTHY" : detail.status === "paused" ? "AT RISK" : "CRITICAL",
    progress: 0,
    description: detail.description ?? "No project description yet.",
    deadline: "TBD",
    sprint: "Current",
    budget: 0,
    spent: 0,
    team: members.members.map((member) => ({
      initials: getInitials(member.user.displayName),
      name: member.user.displayName,
      role: member.projectRole,
    })),
    openRoles: 0,
    subscriptions: [],
    recentChanges: [],
    brainStatus: "ACTIVE",
    docsCount: 0,
    docsReady: 0,
  };
};

export const getProjectMembers = async (projectId: string): Promise<ProjectMember[]> => {
  const response = await apiGetProjectMembers(projectId);
  return response.members.map((member) => ({
    initials: getInitials(member.user.displayName),
    name: member.user.displayName,
    role: member.projectRole,
  }));
};

export const getDocs = async (projectId: string): Promise<Doc[]> => {
  const { items } = await apiListDocuments(projectId);
  return items;
};

export const uploadDoc = async (
  projectId: string,
  formData: FormData
): Promise<{ documentId: string; documentVersionId: string; status: Doc["parseStatus"] }> => {
  return apiUploadDocument(projectId, formData);
};

// TODO: replace mock with real fetch when backend ready
// GET /v1/projects/:projectId/brain/graph/current
// Returns: { nodes: FlowNode[], edges: FlowEdge[] }
export const getFlowGraph = async (projectId: string): Promise<FlowGraph> => {
  void projectId;
  return mock.mockFlowGraph;
};

// TODO: GET /v1/projects/:projectId/documents/:documentId/view
export const getDocViewer = async (projectId: string, docId: string): Promise<DocViewerPayload> => {
  void projectId;
  void docId;
  return mock.mockDocViewer;
};

// TODO: GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance
export const getAnchorProvenance = async (
  projectId: string,
  docId: string,
  anchorId: string
): Promise<AnchorProvenance | null> => {
  void projectId;
  void docId;
  return mock.mockProvenance[anchorId] ?? null;
};

// TODO: GET /v1/projects/:projectId/brain/current
// Returns compiled living doc built from brain + accepted changes
export const getLiveDoc = async (projectId: string): Promise<LiveDocPayload> => {
  void projectId;
  return mock.mockLiveDoc;
};

// TODO: PATCH /v1/projects/:projectId/brain/current
// Saves edits to live doc section
export const saveLiveDocSection = async (projectId: string, sectionId: string, content: string) => {
  void projectId;
  void sectionId;
  void content;
  return { success: true };
};
