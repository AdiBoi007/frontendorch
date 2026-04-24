import { apiFetch, apiUploadFetch } from "../http";

// ── Enums (mirroring backend Prisma enums) ────────────────────────────────────

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

// ── Response shapes ───────────────────────────────────────────────────────────

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

export interface DocumentItem {
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

export interface DocumentDetail extends DocumentItem {
  versions: DocumentVersionSummary[];
}

export interface UploadResult {
  documentId: string;
  documentVersionId: string;
  status: DocumentParseStatus;
  parseRevision: number;
  deduplicated?: boolean;
}

export interface DocumentListMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

// ── Internal envelope types ───────────────────────────────────────────────────

interface Envelope<T> {
  data: T;
  meta: unknown;
  error: unknown;
}

interface ListEnvelope<T> {
  data: T[];
  meta: DocumentListMeta;
  error: unknown;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function apiListDocuments(
  projectId: string,
  params?: { page?: number; pageSize?: number }
): Promise<{ items: DocumentItem[]; meta: DocumentListMeta }> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("pageSize", String(params.pageSize));
  const qsStr = qs.toString();
  const response = await apiFetch<ListEnvelope<DocumentItem>>(
    `/v1/projects/${projectId}/documents${qsStr ? `?${qsStr}` : ""}`
  );
  return { items: response.data, meta: response.meta };
}

export async function apiGetDocument(
  projectId: string,
  documentId: string
): Promise<DocumentDetail> {
  const response = await apiFetch<Envelope<DocumentDetail>>(
    `/v1/projects/${projectId}/documents/${documentId}`
  );
  return response.data;
}

// Upload expects a FormData with:
//   file      — the binary file
//   kind      — DocumentKind value
//   title     — optional, defaults to filename on backend
//   visibility — optional, defaults to "internal"
//   sourceLabel — optional
export async function apiUploadDocument(
  projectId: string,
  formData: FormData
): Promise<UploadResult> {
  const response = await apiUploadFetch<Envelope<UploadResult>>(
    `/v1/projects/${projectId}/documents/upload`,
    formData
  );
  return response.data;
}

export async function apiReprocessDocument(
  projectId: string,
  documentId: string
): Promise<{ documentVersionId: string; status: DocumentParseStatus }> {
  const response = await apiFetch<Envelope<{ documentVersionId: string; status: DocumentParseStatus }>>(
    `/v1/projects/${projectId}/documents/${documentId}/reprocess`,
    { method: "POST" }
  );
  return response.data;
}

// ── Brain rebuild (lives here as it's triggered from the docs page CTA) ───────

export interface BrainRebuildResult {
  queued: boolean;
  jobId?: string;
  message?: string;
}

export async function apiRebuildBrain(projectId: string): Promise<BrainRebuildResult> {
  const response = await apiFetch<Envelope<BrainRebuildResult>>(
    `/v1/projects/${projectId}/brain/rebuild`,
    { method: "POST" }
  );
  return response.data;
}
