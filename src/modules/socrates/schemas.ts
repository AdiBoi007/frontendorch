import { z } from "zod";

// ---------------------------------------------------------------------------
// Session / context schemas
// ---------------------------------------------------------------------------

export const pageContextEnum = z.enum([
  "dashboard_general",
  "dashboard_project",
  "brain_overview",
  "brain_graph",
  "doc_viewer",
  "client_view",
]);
export type PageContext = z.infer<typeof pageContextEnum>;

export const selectedRefTypeEnum = z.enum([
  "document",
  "document_section",
  "brain_node",
  "change_proposal",
  "decision_record",
  "dashboard_scope",
]);

export const viewerStateSchema = z.object({
  documentId: z.string().uuid().optional(),
  documentVersionId: z.string().uuid().optional(),
  pageNumber: z.number().int().positive().optional(),
  anchorId: z.string().optional(),
  scrollHint: z.string().optional(),
});

export const createSessionBodySchema = z.object({
  pageContext: pageContextEnum,
  selectedRefType: selectedRefTypeEnum.optional(),
  selectedRefId: z.string().uuid().optional(),
  viewerState: viewerStateSchema.optional(),
}).superRefine((value, context) => {
  const hasSelectedRefType = value.selectedRefType !== undefined;
  const hasSelectedRefId = value.selectedRefId !== undefined;
  if (hasSelectedRefType !== hasSelectedRefId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasSelectedRefType ? ["selectedRefId"] : ["selectedRefType"],
      message: "selectedRefType and selectedRefId must be provided together",
    });
  }
});

export const patchContextBodySchema = z.object({
  pageContext: pageContextEnum.optional(),
  selectedRefType: selectedRefTypeEnum.optional().nullable(),
  selectedRefId: z.string().uuid().optional().nullable(),
  viewerState: viewerStateSchema.optional().nullable(),
}).superRefine((value, context) => {
  const hasSelectedRefType = Object.prototype.hasOwnProperty.call(value, "selectedRefType");
  const hasSelectedRefId = Object.prototype.hasOwnProperty.call(value, "selectedRefId");
  if (hasSelectedRefType !== hasSelectedRefId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasSelectedRefType ? ["selectedRefId"] : ["selectedRefType"],
      message: "selectedRefType and selectedRefId must be updated together",
    });
    return;
  }

  if (hasSelectedRefType && hasSelectedRefId) {
    const cleared = value.selectedRefType === null && value.selectedRefId === null;
    const setTogether = value.selectedRefType !== null && value.selectedRefId !== null;
    if (!cleared && !setTogether) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedRefId"],
        message: "selectedRefType and selectedRefId must either both be null or both be set",
      });
    }
  }
});

export const sessionParamsSchema = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Message stream schemas
// ---------------------------------------------------------------------------

export const streamMessageBodySchema = z.object({
  content: z.string().min(1).max(8000),
});

// ---------------------------------------------------------------------------
// AI answer output schema (validated before persistence)
// ---------------------------------------------------------------------------

export const citationSchema = z.object({
  type: z.enum([
    "document_section",
    "document_chunk",
    "message",
    "brain_node",
    "product_brain",
    "change_proposal",
    "decision_record",
    "dashboard_snapshot",
  ]),
  refId: z.string().uuid(),
  label: z.string(),
  pageNumber: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const openTargetRefSchema = z.union([
  z.object({
    targetType: z.literal("document_section"),
    targetRef: z.object({
      documentId: z.string().uuid().optional(),
      documentVersionId: z.string().uuid().optional(),
      anchorId: z.string(),
      pageNumber: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    targetType: z.literal("message"),
    targetRef: z.object({ messageId: z.string().uuid(), threadId: z.string().uuid().optional() }),
  }),
  z.object({
    targetType: z.literal("thread"),
    targetRef: z.object({ threadId: z.string().uuid() }),
  }),
  z.object({
    targetType: z.literal("brain_node"),
    targetRef: z.object({ nodeId: z.string().uuid(), artifactVersionId: z.string().uuid().optional() }),
  }),
  z.object({
    targetType: z.literal("change_proposal"),
    targetRef: z.object({ proposalId: z.string().uuid() }),
  }),
  z.object({
    targetType: z.literal("decision_record"),
    targetRef: z.object({ decisionId: z.string().uuid() }),
  }),
  z.object({
    targetType: z.literal("dashboard_filter"),
    targetRef: z.object({ filter: z.string(), value: z.string().optional() }),
  }),
]);

export const answerSchema = z.object({
  answer_md: z.string().min(1),
  citations: z.array(citationSchema).default([]),
  open_targets: z.array(openTargetRefSchema).default([]),
  suggested_prompts: z.array(z.string()).max(5).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export type AnswerSchema = z.infer<typeof answerSchema>;
export type CitationSchema = z.infer<typeof citationSchema>;
export type OpenTargetRef = z.infer<typeof openTargetRefSchema>;
