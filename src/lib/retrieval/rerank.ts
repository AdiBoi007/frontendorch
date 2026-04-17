/**
 * CHR-RAG Layer 5: Reranking.
 *
 * Applies page-context and selected-object biasing on top of raw scores,
 * deduplicates by source object, caps citations from the same source,
 * and returns the top-N final candidates.
 */

import type { RetrievalCandidate, RetrievalSourceType } from "./types.js";
import type { QueryIntent } from "./intent.js";

type PageContext =
  | "dashboard_general"
  | "dashboard_project"
  | "brain_overview"
  | "brain_graph"
  | "doc_viewer"
  | "client_view";

/** Source-type boost multipliers per page context. */
const PAGE_BOOST: Record<PageContext, Partial<Record<RetrievalSourceType, number>>> = {
  dashboard_general: {
    dashboard_snapshot: 2.0,
    change_proposal: 1.4,
    product_brain: 1.3,
    brain_node: 1.1,
  },
  dashboard_project: {
    dashboard_snapshot: 1.8,
    change_proposal: 1.5,
    decision_record: 1.3,
    product_brain: 1.5,
    brain_node: 1.2,
  },
  brain_overview: {
    brain_node: 1.8,
    product_brain: 2.0,
    change_proposal: 1.5,
    decision_record: 1.4,
    document_chunk: 1.0,
  },
  brain_graph: {
    brain_node: 2.0,
    product_brain: 1.4,
    change_proposal: 1.4,
    document_chunk: 1.1,
  },
  doc_viewer: {
    document_chunk: 2.0,
    product_brain: 1.1,
    change_proposal: 1.3,
    communication_message: 1.2,
  },
  client_view: {
    document_chunk: 1.5,
    brain_node: 1.2,
    dashboard_snapshot: 1.0,
  },
};

/** Intent-based source-type boost multipliers. */
const INTENT_BOOST: Record<QueryIntent, Partial<Record<RetrievalSourceType, number>>> = {
  current_truth: {
    brain_node: 1.5,
    product_brain: 2.0,
    change_proposal: 1.4,
    decision_record: 1.3,
  },
  original_source: {
    document_chunk: 1.8,
    communication_message: 1.5,
  },
  change_history: {
    change_proposal: 2.0,
    communication_message: 1.4,
  },
  decision_history: {
    decision_record: 2.0,
    change_proposal: 1.3,
  },
  doc_local: {
    document_chunk: 2.0,
  },
  brain_local: {
    brain_node: 2.0,
  },
  dashboard_status: {
    dashboard_snapshot: 2.0,
    change_proposal: 1.2,
  },
  communication_lookup: {
    communication_message: 2.0,
  },
  comparison_or_diff: {
    change_proposal: 1.8,
    document_chunk: 1.3,
    brain_node: 1.2,
  },
  explain_for_role: {
    brain_node: 1.4,
    document_chunk: 1.3,
  },
};

export interface RerankInput {
  candidates: RetrievalCandidate[];
  pageContext: PageContext;
  intent: QueryIntent;
  selectedRefId?: string;
  selectedSectionId?: string;
  selectedNodeId?: string;
  topK: number;
  /** Max citations from the same source container. */
  maxPerSource?: number;
  isClientContext: boolean;
}

export function rerank(input: RerankInput): RetrievalCandidate[] {
  const { candidates, pageContext, intent, selectedRefId, selectedSectionId, selectedNodeId, topK } = input;
  const maxPerSource = input.maxPerSource ?? 2;

  if (topK <= 0 || candidates.length === 0) return [];

  // Apply boosts and filter client-context.
  const scored = candidates
    .filter((c) => !input.isClientContext || !c.isInternalOnly)
    .map((c) => {
      let score = c.finalScore;

      // Page context boost.
      const pageBoost = PAGE_BOOST[pageContext]?.[c.sourceType] ?? 1.0;
      score *= pageBoost;

      // Intent boost.
      const intentBoost = INTENT_BOOST[intent]?.[c.sourceType] ?? 1.0;
      score *= intentBoost;

      // Selected-object hard boost (3×).
      if (c.documentSectionId && c.documentSectionId === selectedSectionId) {
        score *= 3.0;
      }
      if (selectedRefId && c.id === selectedRefId) {
        score *= 3.0;
      }
      if (c.id === selectedNodeId) {
        score *= 3.0;
      }

      // Neighbor-section moderate boost (1.5×) for sections adjacent to the
      // selected section — weaker than the selected-object boost but still
      // surfaces nearby context above unrelated chunks.
      if (c.isNeighborSection) {
        score *= 1.5;
      }

      return { ...c, finalScore: score };
    });

  // Sort descending by final score.
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Deduplicate by id and enforce per-source cap.
  const seen = new Set<string>();
  const sourceCount = new Map<string, number>();
  const result: RetrievalCandidate[] = [];

  for (const candidate of scored) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    const sourceKey = candidate.containerId ?? candidate.id;
    const count = sourceCount.get(sourceKey) ?? 0;
    if (count >= maxPerSource) continue;

    sourceCount.set(sourceKey, count + 1);
    result.push(candidate);

    if (result.length >= topK) break;
  }

  return result;
}
