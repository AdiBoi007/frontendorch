export interface DeadlineItem {
  id: string;
  project: string;
  task: string;
  dueDate: string;
  daysLeft: number;
  status: "on-track" | "at-risk" | "critical";
}

export interface RequestItem {
  id: string;
  from: string;
  message: string;
  time: string;
  status: "pending" | "accepted";
  platform: "slack" | "email" | "whatsapp";
}

export interface MeetingItem {
  id: string;
  title: string;
  time: string;
  duration: string;
  type: "standup" | "review" | "client" | "meeting";
  project: string;
}

export interface CalendarDayData {
  meetings: MeetingItem[];
  deadlines: DeadlineItem[];
}

export interface ProjectCardItem {
  id: string;
  name: string;
  progress: number;
  health: "HEALTHY" | "AT RISK" | "CRITICAL";
  color: string;
}

export interface ProjectMember {
  initials: string;
  name: string;
  role: "manager" | "dev" | "client";
}

export interface ProjectSubscription {
  id: string;
  name: string;
  category: string;
  cost: number;
  billing: "monthly" | "per-transaction";
  status: "active";
}

export interface ProjectRecentChange {
  id: string;
  title: string;
  status: "accepted" | "pending";
  timeAgo: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  health: "HEALTHY" | "AT RISK" | "CRITICAL";
  progress: number;
  description: string;
  deadline: string;
  sprint: string;
  budget: number;
  spent: number;
  team: ProjectMember[];
  openRoles: number;
  subscriptions: ProjectSubscription[];
  recentChanges: ProjectRecentChange[];
  brainStatus: "ACTIVE";
  docsCount: number;
  docsReady: number;
}

// ── Document types (aligned with backend DocumentItem / DocumentDetail) ────────

export type DocumentKind =
  | "prd"
  | "srs"
  | "meeting_note"
  | "call_note"
  | "reference"
  | "internal_note"
  | "other";

export type DocumentParseStatus = "pending" | "processing" | "ready" | "partial" | "failed";

export type DocumentVisibility = "internal" | "shared_with_client";

export interface DocumentVersionSummary {
  id: string;
  status: DocumentParseStatus;
  parseRevision: number;
  parseConfidence: number | null;
  sourceLabel: string | null;
  createdAt: string;
  processedAt: string | null;
  isCurrent: boolean;
}

export interface Doc {
  id: string;
  projectId: string;
  title: string;
  kind: DocumentKind;
  visibility: DocumentVisibility;
  createdAt: string;
  updatedAt: string;
  parseStatus: DocumentParseStatus | null;
  lastProcessedAt: string | null;
  currentVersion: DocumentVersionSummary | null;
}

export type DocFilter = "all" | DocumentKind;

export interface FlowNode {
  id: string;
  label: string;
  type: "flow" | "module" | "integration" | "approval" | "unresolved";
  status: "critical" | "at-risk" | "stable" | "unresolved";
  description: string;
  docRefs: string[];
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  style: "solid" | "dashed";
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface DocSection {
  id: string;
  anchorId: string;
  type: "heading" | "paragraph" | "list" | "code";
  level?: number;
  content: string;
  hasChange: boolean;
  changeId?: string;
  citationIds?: string[];
}

export interface DocViewerPayload {
  id: string;
  title: string;
  version: string;
  uploadedBy: string;
  uploadedAt: string;
  totalPages: number;
  sections: DocSection[];
}

export interface AnchorProvenance {
  anchorId: string;
  sourceDoc: string;
  excerpt: string;
  linkedMessages: {
    id: string;
    from: string;
    platform: "slack" | "email" | "whatsapp";
    content: string;
    sentAt: string;
  }[];
  acceptedChanges: {
    id: string;
    summary: string;
    acceptedAt: string;
    acceptedBy: string;
  }[];
}

export interface LiveDocSection {
  id: string;
  anchorId: string;
  sectionLabel: string;
  type: "title" | "section-heading" | "body" | "highlighted";
  content: string;
  highlight?: {
    text: string;
    start: number;
    end: number;
  };
  sourceIds: string[];
}

export interface LiveDocComment {
  id: string;
  authorInitials: string;
  authorName: string;
  time: string;
  date: string;
  content: string;
  source: string;
  linkedSectionId: string;
}

export interface LiveDocPayload {
  projectName: string;
  docType: string;
  version: string;
  status: "DRAFT" | "REVIEW" | "ACCEPTED";
  sections: LiveDocSection[];
  comments: LiveDocComment[];
}

export type BrainCategoryId = "docs" | "comms" | "team" | "changes" | "decisions";

export type BrainNodeKind = "core" | "category" | "sub";

export type BrainIconKey = "file-text" | "message-square" | "users" | "git-branch" | "git-pull-request" | "check-square";

export type BrainItemAction = "detail" | "navigate-docs" | "navigate-requests";

export interface BrainDetailItem {
  id: string;
  label: string;
  description: string;
  action: BrainItemAction;
}

export interface BrainNodeData {
  id: string;
  kind: BrainNodeKind;
  label: string;
  x: number;
  y: number;
  size: number;
  category?: BrainCategoryId;
  parentId?: string;
  icon?: BrainIconKey;
  background: string;
  borderColor: string;
  textColor: string;
  accentColor?: string;
  shadow?: string;
  tooltip: string;
  countLabel: string;
  detailItems?: BrainDetailItem[];
}

export interface ProjectBrainData {
  projectId: string;
  projectName: string;
  nodes: BrainNodeData[];
}

export interface RoleOption {
  key: "manager" | "dev" | "client";
  label: "MANAGER" | "DEV" | "CLIENT";
  icon: "briefcase" | "code" | "eye";
}

export interface SocratesSuggestionGroups {
  dashboard: string[];
  project: string[];
}

export interface SocratesReplyGroups {
  dashboard: string;
  project: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
