import { z } from "zod";

export const pastedTextUploadSchema = z.object({
  kind: z.enum(["prd", "srs", "meeting_note", "call_note", "reference", "internal_note", "other"]),
  title: z.string().min(2),
  visibility: z.enum(["internal", "shared_with_client"]).default("internal"),
  sourceLabel: z.string().optional(),
  pastedText: z.string().min(1)
});

export const multipartUploadMetadataSchema = z.object({
  kind: z.enum(["prd", "srs", "meeting_note", "call_note", "reference", "internal_note", "other"]).default("other"),
  title: z.string().min(2),
  visibility: z.enum(["internal", "shared_with_client"]).default("internal"),
  sourceLabel: z.string().min(1).optional()
});

export const documentParamsSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid()
});

export const anchorParamsSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
  anchorId: z.string().min(1)
});

export const messageParamsSchema = z.object({
  projectId: z.string().uuid(),
  messageId: z.string().uuid()
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25)
});

export const viewerQuerySchema = z.object({
  versionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  anchorId: z.string().min(1).optional(),
  sectionId: z.string().uuid().optional(),
  chunkId: z.string().uuid().optional(),
  highlightCitationId: z.string().uuid().optional()
});

export const anchorQuerySchema = z.object({
  versionId: z.string().uuid().optional(),
  highlightCitationId: z.string().uuid().optional()
});

export const documentSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  versionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
