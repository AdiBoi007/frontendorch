import { BASE_URL, apiFetch } from "../http";
import { getAccessToken } from "../auth-storage";

export type SocratesPageContext =
  | "dashboard_general"
  | "dashboard_project"
  | "brain_overview"
  | "brain_graph"
  | "doc_viewer"
  | "live_doc"
  | "client_view";

export type SocratesSelectedRefType =
  | "document"
  | "document_section"
  | "live_doc_section"
  | "brain_node"
  | "change_proposal"
  | "decision_record"
  | "dashboard_scope";

export interface SocratesViewerState {
  documentId?: string;
  documentVersionId?: string;
  pageNumber?: number;
  anchorId?: string;
  sectionKey?: string;
  scrollHint?: string;
}

export interface SocratesSessionPayload {
  pageContext: SocratesPageContext;
  selectedRefType?: SocratesSelectedRefType;
  selectedRefId?: string;
  viewerState?: SocratesViewerState;
}

export interface SocratesSession {
  id: string;
  projectId: string;
  userId: string;
  pageContext: SocratesPageContext;
  selectedRefType: SocratesSelectedRefType | null;
  selectedRefId: string | null;
  viewerStateJson: SocratesViewerState | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocratesCitation {
  id?: string;
  citationType?: string;
  type?: string;
  refId: string;
  label: string;
  pageNumber?: number;
  confidence?: number | null;
}

export interface SocratesOpenTarget {
  id?: string;
  targetType: string;
  targetRef?: Record<string, unknown>;
  targetPayloadJson?: Record<string, unknown>;
}

export interface SocratesMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  responseStatus: "streaming" | "completed" | "failed" | null;
  createdAt: string;
  citations?: SocratesCitation[];
  openTargets?: SocratesOpenTarget[];
}

interface Envelope<T> {
  data: T;
  meta: unknown;
  error: unknown;
}

export async function apiCreateSocratesSession(projectId: string, payload: SocratesSessionPayload): Promise<SocratesSession> {
  const response = await apiFetch<Envelope<SocratesSession>>(`/v1/projects/${projectId}/socrates/sessions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function apiPatchSocratesContext(
  projectId: string,
  sessionId: string,
  payload: {
    pageContext?: SocratesPageContext;
    selectedRefType?: SocratesSelectedRefType | null;
    selectedRefId?: string | null;
    viewerState?: SocratesViewerState | null;
  }
): Promise<SocratesSession> {
  const response = await apiFetch<Envelope<SocratesSession>>(
    `/v1/projects/${projectId}/socrates/sessions/${sessionId}/context`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  return response.data;
}

export async function apiGetSocratesSuggestions(projectId: string, sessionId: string): Promise<string[]> {
  const response = await apiFetch<Envelope<{ suggestions: string[]; cached: boolean }>>(
    `/v1/projects/${projectId}/socrates/sessions/${sessionId}/suggestions`
  );
  return response.data.suggestions;
}

export async function apiGetSocratesHistory(projectId: string, sessionId: string): Promise<SocratesMessage[]> {
  const response = await apiFetch<Envelope<Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    responseStatus: "streaming" | "completed" | "failed" | null;
    createdAt: string;
    citations?: Array<{
      id: string;
      citationType: string;
      refId: string;
      label: string;
      pageNumber?: number | null;
      confidence?: number | null;
    }>;
    openTargets?: Array<{
      id: string;
      targetType: string;
      targetPayloadJson: Record<string, unknown>;
    }>;
  }>>>(
    `/v1/projects/${projectId}/socrates/sessions/${sessionId}/messages`
  );

  return response.data.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    responseStatus: message.responseStatus,
    createdAt: message.createdAt,
    citations: message.citations?.map((citation) => ({
      id: citation.id,
      type: citation.citationType,
      refId: citation.refId,
      label: citation.label,
      pageNumber: citation.pageNumber ?? undefined,
      confidence: citation.confidence ?? undefined,
    })),
    openTargets: message.openTargets?.map((target) => ({
      id: target.id,
      targetType: target.targetType,
      targetPayloadJson: target.targetPayloadJson,
      targetRef: target.targetPayloadJson,
    })),
  }));
}

export interface StreamHandlers {
  onMessageCreated?: (payload: { userMessageId: string; assistantMessageId: string }) => void;
  onDelta?: (payload: { text: string }) => void;
  onDone?: (payload: {
    assistantMessageId: string;
    answer_md: string;
    citations: SocratesCitation[];
    open_targets: SocratesOpenTarget[];
    suggested_prompts: string[];
    confidence?: number;
  }) => void;
  onError?: (payload: { code: string; message: string }) => void;
}

type DonePayload = NonNullable<StreamHandlers["onDone"]> extends (payload: infer T) => void ? T : never;

export async function apiStreamSocratesMessage(
  projectId: string,
  sessionId: string,
  content: string,
  handlers: StreamHandlers
): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${BASE_URL}/v1/projects/${projectId}/socrates/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    throw new Error(body.error?.message ?? "Socrates stream failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (rawEvent: string) => {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;

    switch (eventName) {
      case "message_created":
        handlers.onMessageCreated?.(payload as { userMessageId: string; assistantMessageId: string });
        break;
      case "delta":
        handlers.onDelta?.(payload as { text: string });
        break;
      case "done":
        handlers.onDone?.(payload as DonePayload);
        break;
      case "error":
        handlers.onError?.(payload as { code: string; message: string });
        break;
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (rawEvent) {
        flushEvent(rawEvent);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
