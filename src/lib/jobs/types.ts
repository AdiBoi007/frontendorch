export const JobNames = {
  parseDocument: "parse_document",
  chunkDocument: "chunk_document",
  embedDocumentChunks: "embed_document_chunks",
  generateSourcePackage: "generate_source_package",
  generateClarifiedBrief: "generate_clarified_brief",
  generateBrainGraph: "generate_brain_graph",
  generateProductBrain: "generate_product_brain",
  applyAcceptedChange: "apply_accepted_change",
  precomputeSocratesSuggestions: "precompute_socrates_suggestions",
  refreshDashboardSnapshot: "refresh_dashboard_snapshot",
  syncCommunicationConnector: "sync_communication_connector",
  ingestCommunicationBatch: "ingest_communication_batch",
  indexCommunicationMessage: "index_communication_message"
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

export interface JobDispatcher {
  enqueue<TPayload>(name: JobName, payload: TPayload, idempotencyKey: string): Promise<void>;
}
