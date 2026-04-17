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
