/**
 * Shared retrieval types used across the CHR-RAG pipeline.
 */

export type RetrievalSourceType =
  | "document_chunk"
  | "brain_node"
  | "product_brain"
  | "change_proposal"
  | "decision_record"
  | "dashboard_snapshot"
  | "communication_message";

export interface RetrievalCandidate {
  id: string;
  sourceType: RetrievalSourceType;
  /** Raw snippet to include in the prompt context pack. */
  content: string;
  /** Enriched contextual content (document title, heading path, etc.) */
  contextualContent?: string;
  /** Provenance / label used in citations. */
  label: string;
  /** Optional section / anchor that this chunk belongs to. */
  documentSectionId?: string;
  anchorId?: string;
  pageNumber?: number;
  /** ID of the containing document, thread, or artifact. */
  containerId?: string;
  /** Vector similarity score (0–1). */
  vectorScore?: number;
  /** Lexical BM25-style score (normalised 0–1). */
  lexicalScore?: number;
  /** Final combined score after reranking. */
  finalScore: number;
  /** Is this candidate from client-safe sources only? */
  isClientSafe: boolean;
  /** Internal-only flag (should be hidden from client context). */
  isInternalOnly: boolean;
  /**
   * True when the candidate belongs to a section adjacent to the selected
   * section (hierarchical neighbor expansion).  The reranker applies a
   * moderate boost relative to the hard 3× selected-object boost.
   */
  isNeighborSection?: boolean;
}

export interface RetrievalDomains {
  includeDocuments: boolean;
  includeBrainNodes: boolean;
  includeProductBrain: boolean;
  includeChanges: boolean;
  includeDecisions: boolean;
  includeDashboard: boolean;
  includeCommunications: boolean;
}
