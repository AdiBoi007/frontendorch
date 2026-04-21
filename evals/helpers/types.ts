export type SocratesEvalCategory =
  | "current_truth"
  | "provenance"
  | "communication_origin"
  | "citation_correctness"
  | "role_safety";

export type MessageEvalCategory =
  | "classification"
  | "false_positive_guard"
  | "proposal_generation"
  | "decision_candidate";

export type ProjectFixtureKey =
  | "project_alpha"
  | "project_beta"
  | "project_gamma"
  | "project_client_safe";

export type EvalRole = "manager" | "dev" | "client";

export interface SocratesEvalCase {
  id: string;
  category: SocratesEvalCategory;
  title: string;
  setup: {
    projectFixture: ProjectFixtureKey;
    documents?: string[];
    messages?: string[];
    acceptedChanges?: string[];
    acceptedDecisions?: string[];
  };
  session: {
    pageContext: "dashboard_general" | "dashboard_project" | "brain_overview" | "brain_graph" | "doc_viewer" | "client_view";
    selectedRefType: "document" | "document_section" | "brain_node" | "change_proposal" | "decision_record" | "dashboard_scope" | null;
    selectedRefId: string | null;
    viewerState: {
      documentId?: string;
      documentVersionId?: string;
      pageNumber?: number;
      anchorId?: string;
      scrollHint?: string;
    } | null;
    role: EvalRole;
  };
  query: string;
  expectations: {
    mustUseCurrentTruth?: boolean;
    mustPreferOriginalEvidence?: boolean;
    mustPreferCommunicationEvidence?: boolean;
    mustNotPreferStaleOriginalOnly?: boolean;
    requiredCitationTypes?: string[];
    allowedCitationTypes?: string[];
    disallowedCitationTypes?: string[];
    mustOpenTargetTypes?: string[];
    disallowedOpenTargetTypes?: string[];
    mustMention?: string[];
    mustNotMention?: string[];
  };
}

export interface MessageEvalCase {
  id: string;
  category: MessageEvalCategory;
  title: string;
  setup: {
    projectFixture: ProjectFixtureKey;
    documents?: string[];
    messages: string[];
  };
  targetKind?: "message" | "thread";
  messageIdRef?: string;
  expectations: {
    allowedInsightTypes?: string[];
    disallowedInsightTypes?: string[];
    mustCreateProposal?: boolean;
    mustNotCreateProposal?: boolean;
    mustCreateDecision?: boolean;
    mustNotCreateDecision?: boolean;
    mustPreserveUncertainty?: boolean;
    requireAffectedRefs?: boolean;
    mustFilterInvalidRefs?: boolean;
  };
}

export interface EvalCaseResult {
  id: string;
  category: string;
  title: string;
  passed: boolean;
  checks: Record<string, boolean>;
  reasons: string[];
  observed: Record<string, unknown>;
}

export interface EvalSuiteReport {
  suite: "socrates" | "message_intelligence" | "all";
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    byCategory: Record<string, { total: number; passed: number; failed: number }>;
  };
  results: EvalCaseResult[];
}
