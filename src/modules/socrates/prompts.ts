/**
 * Prompt construction for Socrates.
 *
 * Separates prompt assembly from business logic.  No LLM calls here.
 */

import type { RetrievalCandidate } from "../../lib/retrieval/types.js";
import type { PageContext } from "./schemas.js";
import type { QueryIntent } from "../../lib/retrieval/intent.js";

export const SOCRATES_SYSTEM_PROMPT = `You are Socrates, the AI copilot of Orchestra.
You answer questions about a software product in progress.

Rules you must always follow:
1. Answer ONLY from the supplied evidence. Do not invent or hallucinate facts.
2. Prefer current accepted truth (Product Brain, accepted changes, accepted decisions) for questions about the current state.
3. Prefer original document sections and original messages for questions about provenance or history.
4. Every substantive answer must include at least one citation from the supplied evidence.
5. If the evidence is weak or absent for the specific question, say so clearly and suggest a narrower question.
6. Produce a JSON object that strictly matches the output schema. No markdown fences. No extra keys.
7. open_targets must only reference refIds that appear in the supplied citations.
8. suggested_prompts must be short, plain-English, and useful from the user's current context.

Output schema (required, no extra keys, no markdown):
{
  "answer_md": "Markdown answer string",
  "citations": [
    {
      "type": "document_section | document_chunk | message | brain_node | change_proposal | decision_record | dashboard_snapshot",
      "refId": "uuid",
      "label": "Human-readable label",
      "pageNumber": 6,         // optional integer
      "confidence": 0.88       // optional 0–1
    }
  ],
  "open_targets": [
    {
      "targetType": "document_section | message | thread | brain_node | change_proposal | decision_record | dashboard_filter",
      "targetRef": { ... }     // shape depends on targetType
    }
  ],
  "suggested_prompts": ["Prompt 1", "Prompt 2"],
  "confidence": 0.9            // optional overall 0–1
}`;

export interface PromptContext {
  projectId: string;
  pageContext: PageContext;
  intent: QueryIntent;
  selectedRefType?: string;
  selectedRefId?: string;
  viewerState?: {
    documentId?: string;
    anchorId?: string;
    pageNumber?: number;
  };
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>;
  candidates: RetrievalCandidate[];
  isClientContext: boolean;
}

/**
 * Sanitize free text before insertion into prompts.
 * Strips control characters and limits section-header injection.
 */
function sanitizeUserText(text: string): string {
  // Remove null bytes and control characters.
  // Replace any sequence of "##" that could hijack prompt section headers.
  return text
    .replace(/\x00/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^#{1,6}\s/gm, (match) => match.replace(/#/g, "＃"));
}

export function buildUserPrompt(userQuery: string, ctx: PromptContext): string {
  const safeQuery = sanitizeUserText(userQuery);
  const parts: string[] = [];

  parts.push(`## Session context`);
  parts.push(`- Project ID: ${ctx.projectId}`);
  parts.push(`- Page: ${ctx.pageContext}`);
  parts.push(`- Query intent (pre-classified): ${ctx.intent}`);
  if (ctx.selectedRefType) {
    parts.push(`- Selected object: ${ctx.selectedRefType} / ${ctx.selectedRefId ?? "unknown"}`);
  }
  if (ctx.viewerState?.anchorId) {
    parts.push(
      `- Doc viewer anchor: ${ctx.viewerState.anchorId} (page ${ctx.viewerState.pageNumber ?? "?"})`
    );
  }
  if (ctx.isClientContext) {
    parts.push(`- Context mode: CLIENT-SAFE (internal refs must NOT appear in your answer)`);
  }

  if (ctx.recentHistory.length > 0) {
    parts.push(`\n## Recent conversation history (most recent last)`);
    for (const turn of ctx.recentHistory.slice(-8)) {
      parts.push(`[${turn.role.toUpperCase()}]: ${sanitizeUserText(turn.content).slice(0, 400)}`);
    }
  }

  parts.push(`\n## User question`);
  parts.push(safeQuery);

  if (ctx.candidates.length > 0) {
    parts.push(`\n## Retrieved evidence (use this to answer — cite by refId)`);
    for (const [index, candidate] of ctx.candidates.entries()) {
      const contextText = candidate.contextualContent ?? candidate.content;
      parts.push(
        `\n### Evidence [${index + 1}]\n` +
          `- refId: ${candidate.id}\n` +
          `- type: ${candidate.sourceType}\n` +
          `- label: ${candidate.label}\n` +
          (candidate.pageNumber ? `- page: ${candidate.pageNumber}\n` : "") +
          (candidate.anchorId ? `- anchorId: ${candidate.anchorId}\n` : "") +
          `- content: ${contextText.slice(0, 600)}`
      );
    }
  } else {
    parts.push(`\n## Evidence\nNo evidence retrieved. Acknowledge the gap clearly.`);
  }

  parts.push(
    `\n## Instruction\nProduce a JSON object matching the output schema exactly. Return only the JSON object.`
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Suggestion prompt (separate, cheaper call)
// ---------------------------------------------------------------------------

const PAGE_SUGGESTION_EXAMPLES: Record<PageContext, string[]> = {
  dashboard_general: [
    "Which projects changed most this week?",
    "Which teams need attention?",
    "Summarize org-wide pressure.",
  ],
  dashboard_project: [
    "What changed recently in this project?",
    "What should engineering focus on now?",
    "Summarize current project truth.",
  ],
  brain_overview: [
    "Explain the main flows.",
    "Which areas are still uncertain?",
    "Show recent accepted changes.",
  ],
  brain_graph: [
    "What does this node depend on?",
    "Which source docs support this area?",
    "Which recent changes affect this module?",
  ],
  doc_viewer: [
    "When was this feature first mentioned?",
    "Show accepted changes affecting this section.",
    "Give an engineering-ready explanation for this section.",
  ],
  client_view: [
    "Summarize current shared scope.",
    "What changed recently?",
    "What should the client know next?",
  ],
};

export function buildSuggestionPrompt(
  pageContext: PageContext,
  projectSummary: string,
  selectedLabel?: string
): string {
  const examples = PAGE_SUGGESTION_EXAMPLES[pageContext].join("\n- ");
  return (
    `Generate 3–5 short, plain-English, immediately useful prompt suggestions for a user on the "${pageContext}" page ` +
    `of Orchestra, a product-brain system for software teams.\n\n` +
    `Project context: ${projectSummary}\n` +
    (selectedLabel ? `Currently selected: ${selectedLabel}\n` : "") +
    `\nExamples of good suggestions for this page:\n- ${examples}\n\n` +
    `Return a JSON object with one field:\n` +
    `{ "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"] }\n\n` +
    `Keep each suggestion under 12 words. No duplicates. Return only the JSON object.`
  );
}
