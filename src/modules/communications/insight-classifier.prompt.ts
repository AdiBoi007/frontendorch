import { z } from "zod";

export const insightRefSchema = z.object({
  id: z.string().uuid(),
  confidence: z.number().min(0).max(1).default(0.5)
});

export const communicationInsightOutputSchema = z.object({
  insightType: z.enum([
    "info",
    "clarification",
    "decision",
    "requirement_change",
    "contradiction",
    "blocker",
    "action_needed",
    "risk",
    "approval"
  ]),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  shouldCreateProposal: z.boolean(),
  shouldCreateDecision: z.boolean(),
  proposalType: z
    .enum(["requirement_change", "decision_change", "clarification", "contradiction_resolution"])
    .nullable(),
  affectedDocumentSections: z.array(insightRefSchema).default([]),
  affectedBrainNodes: z.array(insightRefSchema).default([]),
  oldUnderstanding: z.record(z.string(), z.unknown()).nullable(),
  newUnderstanding: z.record(z.string(), z.unknown()).nullable(),
  decisionStatement: z.string().nullable(),
  impactSummary: z
    .object({
      scopeImpact: z.enum(["low", "medium", "high"]).default("low"),
      engineeringImpact: z.enum(["low", "medium", "high"]).default("low"),
      clientExpectationImpact: z.enum(["low", "medium", "high"]).default("low"),
      summary: z.string().default("")
    })
    .nullable(),
  uncertainty: z.array(z.string().min(1)).default([])
});

export type CommunicationInsightOutput = z.infer<typeof communicationInsightOutputSchema>;

export function buildInsightClassifierSystemPrompt() {
  return [
    "You classify communication evidence for a product-brain system.",
    "Return valid JSON only.",
    "Insights are machine-derived, never accepted truth.",
    "Prefer clarification over requirement_change when ambiguous.",
    "Only mark approval when the wording clearly indicates approval.",
    "Do not create proposal spam from brainstorming or casual chatter.",
    "Lower confidence if affected refs are weak or uncertain.",
    "Preserve uncertainty explicitly."
  ].join(" ");
}

export function buildMessageInsightPrompt(input: {
  targetKind: "message" | "thread";
  content: string;
  acceptedProductBrainSummary: string;
  candidateSections: Array<{ id: string; label: string; excerpt: string }>;
  candidateBrainNodes: Array<{ id: string; title: string; summary: string }>;
  acceptedChanges: Array<{ id: string; title: string; summary: string }>;
  acceptedDecisions: Array<{ id: string; title: string; statement: string }>;
  unresolvedProposals: Array<{ id: string; title: string; summary: string }>;
}) {
  return `
Classify this ${input.targetKind} in the context of the current accepted Orchestra product truth.

Target content:
${input.content}

Current accepted Product Brain summary:
${input.acceptedProductBrainSummary}

Candidate document sections:
${JSON.stringify(input.candidateSections, null, 2)}

Candidate brain nodes:
${JSON.stringify(input.candidateBrainNodes, null, 2)}

Accepted changes:
${JSON.stringify(input.acceptedChanges, null, 2)}

Accepted decisions:
${JSON.stringify(input.acceptedDecisions, null, 2)}

Unresolved proposals for dedupe:
${JSON.stringify(input.unresolvedProposals, null, 2)}

Rules:
- distinguish info vs clarification vs requirement_change vs decision vs contradiction vs blocker/risk/action_needed/approval
- never mark truth as accepted
- if affected refs are uncertain, lower confidence and mention uncertainty
- if content is informative chatter only, return shouldCreateProposal=false and shouldCreateDecision=false
- proposalType must be null unless a proposal is justified
- decisionStatement must be null unless the insight is decision-like or approval-like
`.trim();
}
