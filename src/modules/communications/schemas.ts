import { z } from "zod";

export const communicationProviderSchema = z.enum([
  "manual_import",
  "slack",
  "gmail",
  "outlook",
  "microsoft_teams",
  "whatsapp_business"
]);

export const connectorStatusSchema = z.enum(["pending_auth", "connected", "syncing", "error", "revoked"]);
export const syncTypeSchema = z.enum(["manual", "webhook", "backfill", "incremental"]);
export const syncStatusSchema = z.enum(["queued", "running", "completed", "partial", "failed"]);
export const communicationMessageTypeSchema = z.enum(["user", "system", "bot", "file_share", "note", "other"]);
export const messageInsightTypeSchema = z.enum([
  "info",
  "clarification",
  "decision",
  "requirement_change",
  "contradiction",
  "blocker",
  "action_needed",
  "risk",
  "approval"
]);
export const messageInsightStatusSchema = z.enum([
  "detected",
  "ignored",
  "converted_to_proposal",
  "converted_to_decision",
  "superseded"
]);

export const projectParamsSchema = z.object({
  projectId: z.string().uuid()
});

export const connectorParamsSchema = z.object({
  projectId: z.string().uuid(),
  connectorId: z.string().uuid()
});

export const providerConnectParamsSchema = z.object({
  projectId: z.string().uuid(),
  provider: communicationProviderSchema
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional()
});

export const webhookChallengeQuerySchema = z.object({
  validationToken: z.string().optional(),
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional()
});

export const threadParamsSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid()
});

export const messageParamsSchema = z.object({
  projectId: z.string().uuid(),
  messageId: z.string().uuid()
});

export const messageInsightParamsSchema = z.object({
  projectId: z.string().uuid(),
  insightId: z.string().uuid()
});

export const connectorPatchBodySchema = z.object({
  accountLabel: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export const connectorListQuerySchema = z.object({
  provider: communicationProviderSchema.optional(),
  status: connectorStatusSchema.optional()
});

export const syncQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const connectorSyncBodySchema = z.object({
  syncType: syncTypeSchema.default("manual")
});

export const participantSchema = z.object({
  label: z.string().min(1),
  externalRef: z.string().optional().nullable(),
  email: z.string().email().optional().nullable()
});

export const attachmentSchema = z.object({
  providerAttachmentId: z.string().min(1).optional().nullable(),
  filename: z.string().min(1).optional().nullable(),
  mimeType: z.string().min(1).optional().nullable(),
  fileSize: z.coerce.number().int().nonnegative().optional().nullable(),
  providerUrl: z.string().url().optional().nullable(),
  rawMetadata: z.record(z.string(), z.unknown()).optional().nullable()
});

export const manualImportThreadSchema = z.object({
  providerThreadId: z.string().min(1),
  subject: z.string().optional().nullable(),
  participants: z.array(participantSchema).default([]),
  startedAt: z.string().datetime().optional().nullable(),
  threadUrl: z.string().url().optional().nullable(),
  rawMetadata: z.record(z.string(), z.unknown()).optional().nullable()
});

export const manualImportMessageSchema = z.object({
  providerMessageId: z.string().min(1),
  senderLabel: z.string().min(1),
  senderExternalRef: z.string().optional().nullable(),
  senderEmail: z.string().email().optional().nullable(),
  sentAt: z.string().datetime(),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional().nullable(),
  messageType: communicationMessageTypeSchema,
  providerPermalink: z.string().url().optional().nullable(),
  replyToProviderMessageId: z.string().optional().nullable(),
  rawMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
  attachments: z.array(attachmentSchema).default([])
});

export const manualImportBodySchema = z.object({
  provider: z.literal("manual_import").default("manual_import"),
  accountLabel: z.string().min(1).max(200).default("Manual import"),
  thread: manualImportThreadSchema,
  messages: z.array(manualImportMessageSchema).min(1)
});

export const timelineQuerySchema = z.object({
  provider: communicationProviderSchema.optional(),
  insightType: messageInsightTypeSchema.optional(),
  hasChangeProposal: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value ? value === "true" : undefined)),
  hasOpenDecision: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value ? value === "true" : undefined)),
  hasBlocker: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value ? value === "true" : undefined)),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const threadListQuerySchema = z.object({
  provider: communicationProviderSchema.optional(),
  updatedSince: z.string().datetime().optional(),
  search: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const messageInsightListQuerySchema = z.object({
  status: messageInsightStatusSchema.optional(),
  insightType: messageInsightTypeSchema.optional(),
  threadId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  provider: communicationProviderSchema.optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  hasProposal: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value ? value === "true" : undefined)),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
