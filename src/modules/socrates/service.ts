/**
 * SocratesService — Feature 2 core service.
 *
 * Responsibilities:
 *  - session CRUD and context updates
 *  - page-aware suggestion generation / caching
 *  - streaming answer pipeline (CHR-RAG → prompt → Claude → persist)
 *  - citation + open-target persistence with backend validation
 *  - role-safe filtering (client context cannot see internal refs)
 *  - history retrieval
 */

import Anthropic from "@anthropic-ai/sdk";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { PrismaClient, ProjectRole } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { GenerationProvider } from "../../lib/ai/provider.js";
import type { EmbeddingProvider } from "../../lib/ai/provider.js";
import type { AppEnv } from "../../config/env.js";
import { classifyIntent } from "../../lib/retrieval/intent.js";
import { selectDomains } from "../../lib/retrieval/domains.js";
import { hybridRetrieve } from "../../lib/retrieval/hybrid.js";
import { rerank } from "../../lib/retrieval/rerank.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";
import {
  answerSchema,
  citationSchema,
  createSessionBodySchema,
  patchContextBodySchema,
  type AnswerSchema,
  type CitationSchema,
  type OpenTargetRef,
  type PageContext,
} from "./schemas.js";
import {
  SOCRATES_SYSTEM_PROMPT,
  buildSuggestionPrompt,
  buildUserPrompt,
} from "./prompts.js";

const suggestionsOutputSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(5),
});

// Suggestion TTL: 15 min
const SUGGESTION_TTL_MS = 15 * 60 * 1000;
// Max history turns to include in prompt
const MAX_HISTORY_TURNS = 8;

export class SocratesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly generationProvider: GenerationProvider,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService
  ) {}

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  async createSession(projectId: string, actorUserId: string, body: z.infer<typeof createSessionBodySchema>) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    await this.assertContextTargetsValid(projectId, member.projectRole, body.pageContext, {
      selectedRefType: body.selectedRefType ?? null,
      selectedRefId: body.selectedRefId ?? null,
      viewerState: body.viewerState ?? null,
    });

    const session = await this.prisma.socratesSession.create({
      data: {
        projectId,
        userId: actorUserId,
        pageContext: body.pageContext,
        selectedRefType: body.selectedRefType ?? null,
        selectedRefId: body.selectedRefId ?? null,
        viewerStateJson: body.viewerState ? (body.viewerState as object) : undefined,
      },
    });

    return session;
  }

  async patchContext(
    projectId: string,
    sessionId: string,
    actorUserId: string,
    body: z.infer<typeof patchContextBodySchema>
  ) {
    const session = await this.ensureSessionAccess(projectId, sessionId, actorUserId);
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    const nextPageContext = body.pageContext ?? (session.pageContext as PageContext);
    const nextSelectedRefType =
      Object.prototype.hasOwnProperty.call(body, "selectedRefType")
        ? (body.selectedRefType ?? null)
        : session.selectedRefType;
    const nextSelectedRefId =
      Object.prototype.hasOwnProperty.call(body, "selectedRefId")
        ? (body.selectedRefId ?? null)
        : session.selectedRefId;
    const nextViewerState =
      Object.prototype.hasOwnProperty.call(body, "viewerState")
        ? (body.viewerState ?? null)
        : ((session.viewerStateJson as z.infer<typeof createSessionBodySchema>["viewerState"] | null) ?? null);

    await this.assertContextTargetsValid(projectId, member.projectRole, nextPageContext, {
      selectedRefType: nextSelectedRefType,
      selectedRefId: nextSelectedRefId,
      viewerState: nextViewerState,
    });

    const updates: Record<string, unknown> = {};
    if (body.pageContext !== undefined) updates["pageContext"] = body.pageContext;
    if ("selectedRefType" in body) updates["selectedRefType"] = body.selectedRefType ?? null;
    if ("selectedRefId" in body) updates["selectedRefId"] = body.selectedRefId ?? null;
    if ("viewerState" in body) updates["viewerStateJson"] = body.viewerState ?? null;

    const updated = await this.prisma.socratesSession.update({
      where: { id: sessionId },
      data: updates,
    });

    // Invalidate stale suggestions whenever context changes so the next
    // getSuggestions call generates fresh page-aware suggestions.
    const pageContextChanged = body.pageContext !== undefined && body.pageContext !== session.pageContext;
    const refChanged = ("selectedRefType" in body || "selectedRefId" in body);
    if (pageContextChanged || refChanged) {
      await this.prisma.socratesSuggestion.deleteMany({
        where: { sessionId },
      });
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Suggestions
  // ---------------------------------------------------------------------------

  async getSuggestions(projectId: string, sessionId: string, actorUserId: string) {
    const session = await this.ensureSessionAccess(projectId, sessionId, actorUserId);

    // Check cached suggestions (not expired).
    const cached = await this.prisma.socratesSuggestion.findFirst({
      where: {
        sessionId,
        pageContext: session.pageContext,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (cached) {
      const parsed = cached.suggestionsJson as { suggestions: string[] };
      return { suggestions: parsed.suggestions, cached: true };
    }

    return this.generateAndCacheSuggestions(session, projectId, actorUserId);
  }

  async precomputeSuggestions(projectId: string, sessionId: string) {
    const session = await this.prisma.socratesSession.findFirst({
      where: { id: sessionId, projectId },
    });
    if (!session) return;

    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: session.userId, isActive: true },
    });
    if (!member) return;

    await this.generateAndCacheSuggestions(session, projectId, session.userId);
  }

  private async generateAndCacheSuggestions(
    session: { id: string; pageContext: string; selectedRefId?: string | null; selectedRefType?: string | null },
    projectId: string,
    _actorUserId: string
  ) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    const projectSummary = project?.name ?? projectId;

    let selectedLabel: string | undefined;
    if (session.selectedRefId && session.selectedRefType) {
      selectedLabel = await this.resolveRefLabel(session.selectedRefType, session.selectedRefId, projectId);
    }

    const prompt = buildSuggestionPrompt(
      session.pageContext as PageContext,
      projectSummary,
      selectedLabel
    );

    const result = await this.generationProvider.generateObject({
      prompt,
      schema: suggestionsOutputSchema,
      fallback: () => ({
        suggestions: this.fallbackSuggestions(session.pageContext as PageContext),
      }),
    });

    const expiresAt = new Date(Date.now() + SUGGESTION_TTL_MS);

    await this.prisma.socratesSuggestion.deleteMany({
      where: {
        sessionId: session.id,
        pageContext: session.pageContext as PageContext
      }
    });

    await this.prisma.socratesSuggestion.create({
      data: {
        sessionId: session.id,
        pageContext: session.pageContext as PageContext,
        suggestionsJson: { suggestions: result.suggestions },
        expiresAt,
      },
    });

    return { suggestions: result.suggestions, cached: false };
  }

  private fallbackSuggestions(pageContext: PageContext): string[] {
    const defaults: Record<PageContext, string[]> = {
      dashboard_general: ["Which projects changed most this week?", "Summarize org-wide pressure.", "Which teams need attention?"],
      dashboard_project: ["What changed recently in this project?", "What should engineering focus on?", "Summarize current truth."],
      brain_overview: ["Explain the main flows.", "Which areas are uncertain?", "Show recent accepted changes."],
      brain_graph: ["What does this node depend on?", "Which source docs support this?", "What changed recently here?"],
      doc_viewer: ["When was this feature first mentioned?", "Show changes affecting this section.", "Explain this section for engineering."],
      client_view: ["Summarize shared scope.", "What changed recently?", "What should the client know next?"],
    };
    return defaults[pageContext];
  }

  // ---------------------------------------------------------------------------
  // Streaming answer pipeline
  // ---------------------------------------------------------------------------

  async streamAnswer(
    projectId: string,
    sessionId: string,
    actorUserId: string,
    userContent: string,
    reply: FastifyReply
  ) {
    if (!this.env.ANTHROPIC_API_KEY) {
      throw new AppError(503, "Socrates is not available: missing AI provider configuration", "ai_provider_not_configured");
    }

    // ensureSessionAccess already verifies project access internally; no second check needed.
    const session = await this.ensureSessionAccess(projectId, sessionId, actorUserId);
    // Retrieve member record separately only to check role (ensureSessionAccess may short-circuit
    // if session.userId === actorUserId without fetching role).
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    const isClientContext = member.projectRole === "client" || session.pageContext === "client_view";

    // 1. Persist user message.
    const userMessage = await this.prisma.socratesMessage.create({
      data: {
        sessionId,
        role: "user",
        content: userContent,
        responseStatus: null,
      },
    });

    // 2. Create placeholder assistant message.
    const assistantMessage = await this.prisma.socratesMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: "",
        responseStatus: "streaming",
      },
    });

    // Setup SSE headers.
    void reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("message_created", { userMessageId: userMessage.id, assistantMessageId: assistantMessage.id });

    let streamTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      // 3. Build context for retrieval.
      const intent = classifyIntent(userContent);
      const domains = selectDomains(session.pageContext as PageContext, intent);

      const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

      // Embed the query.
      const queryEmbedding = await this.embeddingProvider.embedText(userContent);

      // Retrieve candidates via CHR-RAG.
      const rawCandidates = await hybridRetrieve(
        this.prisma,
        this.embeddingProvider,
        project.orgId,
        {
          projectId,
          pageContext: session.pageContext,
          query: userContent,
          queryEmbedding,
          intent,
          domains,
          selectedSectionId: session.selectedRefType === "document_section" ? (session.selectedRefId ?? undefined) : undefined,
          selectedNodeId: session.selectedRefType === "brain_node" ? (session.selectedRefId ?? undefined) : undefined,
          topK: this.env.RETRIEVAL_TOP_K,
          minScore: this.env.RETRIEVAL_MIN_SCORE,
          isClientContext,
          acceptedTruthBoost: this.env.RETRIEVAL_ACCEPTED_TRUTH_BOOST,
          docWeight: this.env.RETRIEVAL_DOC_WEIGHT,
          commWeight: this.env.RETRIEVAL_COMM_WEIGHT,
        }
      );

      // Rerank candidates.
      const candidates = rerank({
        candidates: rawCandidates,
        pageContext: session.pageContext as Parameters<typeof rerank>[0]["pageContext"],
        intent,
        selectedRefId: session.selectedRefId ?? undefined,
        selectedSectionId: session.selectedRefType === "document_section" ? (session.selectedRefId ?? undefined) : undefined,
        selectedNodeId: session.selectedRefType === "brain_node" ? (session.selectedRefId ?? undefined) : undefined,
        topK: Math.min(this.env.RETRIEVAL_TOP_K, 10),
        isClientContext,
      });

      const candidateIds = new Set(candidates.map((candidate) => candidate.id));

      // 4. Load recent conversation history.
      const history = await this.loadHistory(sessionId, MAX_HISTORY_TURNS);

      // 5. Build prompt.
      const userPrompt = buildUserPrompt(userContent, {
        projectId,
        pageContext: session.pageContext as PageContext,
        intent,
        selectedRefType: session.selectedRefType ?? undefined,
        selectedRefId: session.selectedRefId ?? undefined,
        viewerState: session.viewerStateJson as { documentId?: string; anchorId?: string; pageNumber?: number } | undefined,
        recentHistory: history,
        candidates,
        isClientContext,
      });

      // 6. Stream from Claude.
      // ANTHROPIC_API_KEY presence is verified at the top of streamAnswer.
      const anthropicClient = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY! });
      const abortController = new AbortController();
      streamTimeout = setTimeout(() => abortController.abort(), 120_000);
      const stream = anthropicClient.messages.stream(
        {
          model: this.env.ANTHROPIC_MODEL_REASONING,
          max_tokens: 3000,
          system: SOCRATES_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        },
        { signal: abortController.signal }
      );

      let fullText = "";

      stream.on("text", (text) => {
        fullText += text;
        sendEvent("delta", { text });
      });

      await stream.finalMessage();

      // 7. Parse and validate the answer schema.
      let parsedAnswer: AnswerSchema;
      try {
        parsedAnswer = answerSchema.parse(JSON.parse(fullText.trim()));
      } catch {
        // Retry with stricter re-prompt.
        parsedAnswer = await this.retryStructuredAnswer(userPrompt, fullText);
      }

      const validatedCitations = await this.validateCitations(
        parsedAnswer.citations,
        candidateIds,
        projectId,
        isClientContext
      );

      // 8. Validate open-targets (ensure they exist and belong to this project).
      const validatedTargets = await this.validateOpenTargets(
        parsedAnswer.open_targets,
        validatedCitations,
        projectId,
        isClientContext
      );

      // 9. Persist citations and open-targets.
      await this.prisma.$transaction(async (tx) => {
        // Mark assistant message completed with final content.
        await tx.socratesMessage.update({
          where: { id: assistantMessage.id },
          data: { content: parsedAnswer.answer_md, responseStatus: "completed" },
        });

        // Persist citations.
        for (const [index, citation] of validatedCitations.entries()) {
          await tx.socratesCitation.create({
            data: {
              assistantMessageId: assistantMessage.id,
              projectId,
              citationType: citation.type as never,
              refId: citation.refId,
              label: citation.label,
              pageNumber: citation.pageNumber ?? null,
              confidence: citation.confidence != null ? String(citation.confidence) : null,
              orderIndex: index,
            },
          });
        }

        // Persist valid open-targets.
        for (const [index, target] of validatedTargets.entries()) {
          await tx.socratesOpenTarget.create({
            data: {
              assistantMessageId: assistantMessage.id,
              targetType: target.targetType,
              targetPayloadJson: target.targetRef as object,
              orderIndex: index,
            },
          });
        }
      });

      // 10. Update suggestions after answer.
      void this.generateAndCacheSuggestions(session, projectId, actorUserId).catch(() => {
        // Non-critical — don't fail the main flow.
      });

      // 11. Audit.
      await this.auditService.record({
        orgId: project.orgId,
        projectId,
        actorUserId,
        eventType: "socrates_answered",
        entityType: "socrates_message",
        entityId: assistantMessage.id,
        payload: {
          sessionId,
          intent,
          pageContext: session.pageContext,
          citationCount: validatedCitations.length,
          openTargetCount: validatedTargets.length,
        },
      });

      sendEvent("done", {
        assistantMessageId: assistantMessage.id,
        answer_md: parsedAnswer.answer_md,
        citations: validatedCitations,
        open_targets: validatedTargets,
        suggested_prompts: parsedAnswer.suggested_prompts,
        confidence: parsedAnswer.confidence,
      });
    } catch (error) {
      // Mark assistant message as failed.
      await this.prisma.socratesMessage.update({
        where: { id: assistantMessage.id },
        data: { responseStatus: "failed", content: "" },
      }).catch(() => undefined);

      const message = error instanceof Error ? error.message : "Generation failed";
      sendEvent("error", { code: "generation_failed", message });
    } finally {
      clearTimeout(streamTimeout);
      reply.raw.end();
    }
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  async getHistory(projectId: string, sessionId: string, actorUserId: string) {
    await this.ensureSessionAccess(projectId, sessionId, actorUserId);

    const messages = await this.prisma.socratesMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      include: {
        citations: { orderBy: { orderIndex: "asc" } },
        openTargets: { orderBy: { orderIndex: "asc" } },
      },
    });

    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ensureSessionAccess(projectId: string, sessionId: string, userId: string) {
    const session = await this.prisma.socratesSession.findFirst({
      where: { id: sessionId, projectId },
    });
    if (!session) {
      throw new AppError(404, "Session not found", "session_not_found");
    }
    await this.projectService.ensureProjectAccess(projectId, userId);
    if (session.userId !== userId) {
      throw new AppError(403, "Socrates session access denied", "socrates_session_access_denied");
    }
    return session;
  }

  private async loadHistory(
    sessionId: string,
    maxTurns: number
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const messages = await this.prisma.socratesMessage.findMany({
      where: {
        sessionId,
        OR: [
          // Include all user messages.
          { role: "user" },
          // Only include assistant messages that completed successfully.
          { role: "assistant", responseStatus: "completed", content: { not: "" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: maxTurns,
      select: { role: true, content: true },
    });

    return messages
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  private async retryStructuredAnswer(originalPrompt: string, malformedText: string): Promise<AnswerSchema> {
    const retryPrompt =
      `${originalPrompt}\n\n` +
      `## IMPORTANT: Your previous response was not valid JSON:\n${malformedText.slice(0, 500)}\n\n` +
      `Return ONLY a valid JSON object matching the output schema. No markdown fences. No extra text.`;

    return this.generationProvider.generateObject({
      prompt: retryPrompt,
      systemPrompt: SOCRATES_SYSTEM_PROMPT,
      schema: answerSchema,
      fallback: () => ({
        answer_md:
          "I was unable to produce a structured answer at this time. Please try rephrasing your question.",
        citations: [],
        open_targets: [],
        suggested_prompts: [],
      }),
    });
  }

  private async validateOpenTargets(
    rawTargets: OpenTargetRef[],
    citations: CitationSchema[],
    projectId: string,
    isClientContext: boolean
  ): Promise<OpenTargetRef[]> {
    const valid: OpenTargetRef[] = [];

    for (const target of rawTargets) {
      try {
        const ok = await this.checkTargetExists(target, citations, projectId, isClientContext);
        if (ok) valid.push(target);
      } catch {
        // Invalid target — skip it per spec.
      }
    }

    return valid;
  }

  private async checkTargetExists(
    target: OpenTargetRef,
    citations: CitationSchema[],
    projectId: string,
    isClientContext: boolean
  ): Promise<boolean> {
    switch (target.targetType) {
      case "document_section": {
        const ref = target.targetRef;
        if (!ref.anchorId) return false;
        const sections = await this.prisma.documentSection.findMany({
          where: {
            projectId,
            anchorId: ref.anchorId,
            ...(ref.documentVersionId ? { documentVersionId: ref.documentVersionId } : {}),
            ...(ref.documentId ? { documentVersion: { documentId: ref.documentId } } : {})
          },
          include: { documentVersion: { include: { document: true } } },
          orderBy: [{ parseRevision: "desc" }, { createdAt: "desc" }]
        });
        const section = sections.find((candidate) => candidate.parseRevision === candidate.documentVersion.parseRevision);
        if (!section) return false;
        if (isClientContext && section.documentVersion.document.visibility === "internal") return false;
        return citations.some(
          (citation) => citation.type === "document_section" && citation.refId === section.id
        );
      }
      case "message": {
        if (isClientContext) return false;
        const msg = await this.prisma.communicationMessage.findFirst({
          where: { id: target.targetRef.messageId, projectId },
        });
        if (!msg) return false;
        return citations.some((citation) => citation.type === "message" && citation.refId === msg.id);
      }
      case "thread": {
        if (isClientContext) return false;
        const thread = await this.prisma.communicationThread.findFirst({
          where: { id: target.targetRef.threadId, projectId },
        });
        if (!thread) return false;
        const citedMessage = await this.prisma.communicationMessage.findFirst({
          where: { threadId: thread.id, projectId, id: { in: citations.filter((citation) => citation.type === "message").map((citation) => citation.refId) } }
        });
        return Boolean(citedMessage);
      }
      case "brain_node": {
        const node = await this.prisma.brainNode.findFirst({
          where: { id: target.targetRef.nodeId, projectId },
        });
        if (!node) return false;
        if (isClientContext) {
          const links = await this.prisma.brainSectionLink.findMany({
            where: { projectId, brainNodeId: node.id },
            include: {
              documentSection: {
                include: {
                  documentVersion: {
                    include: { document: true }
                  }
                }
              }
            }
          });
          const hasOnlySharedEvidence =
            links.length > 0 &&
            links.every((link) => link.documentSection.documentVersion.document.visibility === "shared_with_client");
          if (!hasOnlySharedEvidence) {
            return false;
          }
        }
        return citations.some((citation) => citation.type === "brain_node" && citation.refId === node.id);
      }
      case "change_proposal": {
        if (isClientContext) return false;
        const proposal = await this.prisma.specChangeProposal.findFirst({
          where: { id: target.targetRef.proposalId, projectId },
        });
        if (!proposal) return false;
        return citations.some((citation) => citation.type === "change_proposal" && citation.refId === proposal.id);
      }
      case "decision_record": {
        if (isClientContext) return false;
        const decision = await this.prisma.decisionRecord.findFirst({
          where: { id: target.targetRef.decisionId, projectId },
        });
        if (!decision) return false;
        return citations.some((citation) => citation.type === "decision_record" && citation.refId === decision.id);
      }
      case "dashboard_filter":
        return citations.some((citation) => citation.type === "dashboard_snapshot");
      default:
        return false;
    }
  }

  private async validateCitations(
    rawCitations: CitationSchema[],
    candidateIds: Set<string>,
    projectId: string,
    isClientContext: boolean
  ): Promise<CitationSchema[]> {
    const valid: CitationSchema[] = [];

    for (const rawCitation of rawCitations) {
      const citation = citationSchema.parse(rawCitation);
      if (!candidateIds.has(citation.refId)) {
        continue;
      }
      if (await this.citationExists(citation, projectId, isClientContext)) {
        valid.push(citation);
      }
    }

    return valid;
  }

  private async citationExists(
    citation: CitationSchema,
    projectId: string,
    isClientContext: boolean
  ): Promise<boolean> {
    switch (citation.type) {
      case "document_section": {
        const section = await this.prisma.documentSection.findFirst({
          where: { id: citation.refId, projectId },
          include: {
            documentVersion: {
              include: { document: true }
            }
          }
        });
        if (!section) return false;
        return !isClientContext || section.documentVersion.document.visibility === "shared_with_client";
      }
      case "document_chunk": {
        const chunk = await this.prisma.documentChunk.findFirst({
          where: { id: citation.refId, projectId },
          include: {
            documentVersion: {
              include: { document: true }
            }
          }
        });
        if (!chunk) return false;
        return !isClientContext || chunk.documentVersion.document.visibility === "shared_with_client";
      }
      case "message":
        return !isClientContext && Boolean(await this.prisma.communicationMessage.findFirst({ where: { id: citation.refId, projectId } }));
      case "brain_node": {
        const node = await this.prisma.brainNode.findFirst({
          where: { id: citation.refId, projectId }
        });
        if (!node) return false;
        if (!isClientContext) return true;
        const links = await this.prisma.brainSectionLink.findMany({
          where: { projectId, brainNodeId: node.id },
          include: {
            documentSection: {
              include: {
                documentVersion: {
                  include: { document: true }
                }
              }
            }
          }
        });
        return links.length > 0 && links.every((link) => link.documentSection.documentVersion.document.visibility === "shared_with_client");
      }
      case "product_brain":
        return !isClientContext && Boolean(await this.prisma.artifactVersion.findFirst({
          where: { id: citation.refId, projectId, artifactType: "product_brain", status: "accepted" }
        }));
      case "change_proposal":
        return !isClientContext && Boolean(await this.prisma.specChangeProposal.findFirst({ where: { id: citation.refId, projectId } }));
      case "decision_record":
        return !isClientContext && Boolean(await this.prisma.decisionRecord.findFirst({ where: { id: citation.refId, projectId } }));
      case "dashboard_snapshot":
        return Boolean(await this.prisma.dashboardSnapshot.findFirst({ where: { id: citation.refId, projectId } }));
      default:
        return false;
    }
  }

  private async resolveRefLabel(refType: string, refId: string, projectId: string): Promise<string | undefined> {
    try {
      switch (refType) {
        case "document_section": {
          const s = await this.prisma.documentSection.findFirst({ where: { id: refId, projectId } });
          return s?.anchorText ?? s?.anchorId ?? undefined;
        }
        case "brain_node": {
          const n = await this.prisma.brainNode.findFirst({ where: { id: refId, projectId } });
          return n?.title ?? undefined;
        }
        case "change_proposal": {
          const c = await this.prisma.specChangeProposal.findFirst({ where: { id: refId, projectId } });
          return c?.title ?? undefined;
        }
        case "decision_record": {
          const d = await this.prisma.decisionRecord.findFirst({ where: { id: refId, projectId } });
          return d?.title ?? undefined;
        }
        case "document": {
          const doc = await this.prisma.document.findFirst({ where: { id: refId, projectId } });
          return doc?.title ?? undefined;
        }
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  private async assertContextTargetsValid(
    projectId: string,
    projectRole: ProjectRole,
    pageContext: PageContext,
    input: {
      selectedRefType: z.infer<typeof createSessionBodySchema>["selectedRefType"] | null;
      selectedRefId: string | null;
      viewerState: z.infer<typeof createSessionBodySchema>["viewerState"] | null;
    }
  ) {
    const isClientContext = projectRole === "client" || pageContext === "client_view";
    await this.assertSelectedRefValid(projectId, input.selectedRefType ?? null, input.selectedRefId ?? null, isClientContext);
    await this.assertViewerStateValid(projectId, input.viewerState ?? null, isClientContext);
  }

  private async assertSelectedRefValid(
    projectId: string,
    selectedRefType: z.infer<typeof createSessionBodySchema>["selectedRefType"] | null,
    selectedRefId: string | null,
    isClientContext: boolean
  ) {
    if (!selectedRefType && !selectedRefId) {
      return;
    }

    if (!selectedRefType || !selectedRefId) {
      throw new AppError(422, "Selected reference type and id must be set together", "invalid_selected_ref");
    }

    switch (selectedRefType) {
      case "document": {
        const document = await this.prisma.document.findFirst({
          where: { id: selectedRefId, projectId }
        });
        if (!document) {
          throw new AppError(422, "Selected document does not belong to the project", "invalid_selected_ref");
        }
        if (isClientContext && document.visibility === "internal") {
          throw new AppError(403, "Client context cannot select internal documents", "client_context_ref_forbidden");
        }
        return;
      }
      case "document_section": {
        const section = await this.prisma.documentSection.findFirst({
          where: { id: selectedRefId, projectId },
          include: { documentVersion: { include: { document: true } } }
        });
        if (!section) {
          throw new AppError(422, "Selected document section does not belong to the project", "invalid_selected_ref");
        }
        if (isClientContext && section.documentVersion.document.visibility === "internal") {
          throw new AppError(403, "Client context cannot select internal document sections", "client_context_ref_forbidden");
        }
        return;
      }
      case "brain_node": {
        const node = await this.prisma.brainNode.findFirst({
          where: { id: selectedRefId, projectId }
        });
        if (!node) {
          throw new AppError(422, "Selected brain node does not belong to the project", "invalid_selected_ref");
        }
        if (isClientContext) {
          const links = await this.prisma.brainSectionLink.findMany({
            where: { projectId, brainNodeId: selectedRefId },
            include: {
              documentSection: {
                include: {
                  documentVersion: {
                    include: { document: true }
                  }
                }
              }
            }
          });
          const hasOnlySharedEvidence =
            links.length > 0 &&
            links.every((link) => link.documentSection.documentVersion.document.visibility === "shared_with_client");
          if (!hasOnlySharedEvidence) {
            throw new AppError(403, "Client context cannot select internal-only brain nodes", "client_context_ref_forbidden");
          }
        }
        return;
      }
      case "change_proposal": {
        if (isClientContext) {
          throw new AppError(403, "Client context cannot select internal change proposals", "client_context_ref_forbidden");
        }
        const proposal = await this.prisma.specChangeProposal.findFirst({
          where: { id: selectedRefId, projectId }
        });
        if (!proposal) {
          throw new AppError(422, "Selected change proposal does not belong to the project", "invalid_selected_ref");
        }
        return;
      }
      case "decision_record": {
        if (isClientContext) {
          throw new AppError(403, "Client context cannot select internal decision records", "client_context_ref_forbidden");
        }
        const decision = await this.prisma.decisionRecord.findFirst({
          where: { id: selectedRefId, projectId }
        });
        if (!decision) {
          throw new AppError(422, "Selected decision record does not belong to the project", "invalid_selected_ref");
        }
        return;
      }
      case "dashboard_scope":
        return;
      default:
        throw new AppError(422, "Unsupported selected reference type", "invalid_selected_ref");
    }
  }

  private async assertViewerStateValid(
    projectId: string,
    viewerState: z.infer<typeof createSessionBodySchema>["viewerState"] | null,
    isClientContext: boolean
  ) {
    if (!viewerState) {
      return;
    }

    if (viewerState.documentId) {
      const document = await this.prisma.document.findFirst({
        where: { id: viewerState.documentId, projectId }
      });
      if (!document) {
        throw new AppError(422, "Viewer state document does not belong to the project", "invalid_viewer_state");
      }
      if (isClientContext && document.visibility === "internal") {
        throw new AppError(403, "Client context cannot point viewer state at internal documents", "client_context_ref_forbidden");
      }
    }

    if (viewerState.documentVersionId) {
      const version = await this.prisma.documentVersion.findFirst({
        where: { id: viewerState.documentVersionId, projectId },
        include: { document: true }
      });
      if (!version) {
        throw new AppError(422, "Viewer state document version does not belong to the project", "invalid_viewer_state");
      }
      if (viewerState.documentId && version.documentId !== viewerState.documentId) {
        throw new AppError(422, "Viewer state document and version do not match", "invalid_viewer_state");
      }
      if (isClientContext && version.document.visibility === "internal") {
        throw new AppError(403, "Client context cannot point viewer state at internal documents", "client_context_ref_forbidden");
      }
    }

    if (viewerState.anchorId) {
      const sections = await this.prisma.documentSection.findMany({
        where: {
          projectId,
          anchorId: viewerState.anchorId,
          ...(viewerState.documentVersionId ? { documentVersionId: viewerState.documentVersionId } : {}),
          ...(viewerState.documentId ? { documentVersion: { documentId: viewerState.documentId } } : {})
        },
        include: {
          documentVersion: {
            include: { document: true }
          }
        },
        orderBy: [{ parseRevision: "desc" }, { createdAt: "desc" }]
      });
      const section = sections.find((candidate) => candidate.parseRevision === candidate.documentVersion.parseRevision);
      if (!section) {
        throw new AppError(422, "Viewer state anchor does not resolve to a current section", "invalid_viewer_state");
      }
      if (isClientContext && section.documentVersion.document.visibility === "internal") {
        throw new AppError(403, "Client context cannot point viewer state at internal anchors", "client_context_ref_forbidden");
      }
    }
  }
}
