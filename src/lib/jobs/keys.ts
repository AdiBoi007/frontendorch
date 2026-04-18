export const jobKeys = {
  parseDocument(documentVersionId: string, parseRevision: number) {
    return `parse:${documentVersionId}:${parseRevision}`;
  },
  chunkDocument(documentVersionId: string, parseRevision: number) {
    return `chunk:${documentVersionId}:${parseRevision}`;
  },
  embedDocumentChunks(documentVersionId: string, parseRevision: number) {
    return `embed:${documentVersionId}:${parseRevision}`;
  },
  generateSourcePackage(projectId: string, signature: string) {
    return `source-package:${projectId}:${signature}`;
  },
  generateClarifiedBrief(projectId: string, sourceArtifactId: string) {
    return `clarified-brief:${projectId}:${sourceArtifactId}`;
  },
  generateBrainGraph(projectId: string, clarifiedBriefArtifactId: string) {
    return `brain-graph:${projectId}:${clarifiedBriefArtifactId}`;
  },
  generateProductBrain(projectId: string, signature: string) {
    return `product-brain:${projectId}:${signature}`;
  },
  applyAcceptedChange(proposalId: string) {
    return `apply-change:${proposalId}`;
  },
  refreshDashboardSnapshot(scope: "general" | "project", targetId: string, signature: string) {
    return `dashboard:${scope}:${targetId}:${signature}`;
  }
} as const;
