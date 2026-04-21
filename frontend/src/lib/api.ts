// TODO: replace with real fetch when backend ready
// BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"
// AUTH = Authorization: Bearer localStorage.getItem("orchestra_token")

import * as mock from "./mockData";
import type { AnchorProvenance, ChatMessage, Doc, DocViewerPayload, FlowGraph, LiveDocPayload, RoleOption } from "./types";

export const getProjects = async () => mock.mockProjects;
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

// TODO: replace with GET /v1/projects/:projectId/documents
export const getDocs = async (projectId: string): Promise<Doc[]> => {
  void projectId;
  return mock.mockDocs;
};

// TODO: replace with POST /v1/projects/:projectId/documents/upload
export const uploadDoc = async (projectId: string, file: File, type: string): Promise<Doc> => {
  void projectId;

  return {
    id: Date.now().toString(),
    name: file.name,
    type: type as Doc["type"],
    size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    pages: 1,
    status: "processing",
    uploadedBy: "SC",
    uploadedAt: "Just now",
    excerpt: "Processing document..."
  };
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
