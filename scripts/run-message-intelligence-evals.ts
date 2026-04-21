import path from "node:path";
import { buildEvalWorld } from "../evals/helpers/fixture-world.js";
import { loadJsonlFile, writeEvalReports } from "../evals/helpers/io.js";
import { buildReport } from "../evals/helpers/report.js";
import type { EvalCaseResult, MessageEvalCase } from "../evals/helpers/types.js";

const CATEGORY_FILES: Record<string, string> = {
  classification: path.resolve("evals", "message_intelligence", "classification.jsonl"),
  false_positive_guard: path.resolve("evals", "message_intelligence", "false_positive_guard.jsonl"),
  proposal_generation: path.resolve("evals", "message_intelligence", "proposal_generation.jsonl"),
  decision_candidate: path.resolve("evals", "message_intelligence", "decision_candidate.jsonl")
};

function parseArgs() {
  const categoryArg = process.argv.find((arg) => arg.startsWith("--category="));
  return {
    category: categoryArg ? categoryArg.split("=")[1] : null
  };
}

function scoreCase(
  testCase: MessageEvalCase,
  observed: {
    insightType: string;
    shouldCreateProposal: boolean;
    shouldCreateDecision: boolean;
    uncertainty: unknown[];
    affectedDocumentSectionIds: string[];
    affectedBrainNodeIds: string[];
    proposalId: string | null;
    decisionId: string | null;
  }
): EvalCaseResult {
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];

  checks.insight_type_pass =
    (testCase.expectations.allowedInsightTypes ?? [observed.insightType]).includes(observed.insightType) &&
    !(testCase.expectations.disallowedInsightTypes ?? []).includes(observed.insightType);
  if (!checks.insight_type_pass) reasons.push(`Unexpected insight type: ${observed.insightType}`);

  checks.proposal_creation_pass =
    (testCase.expectations.mustCreateProposal !== true || Boolean(observed.proposalId)) &&
    (testCase.expectations.mustNotCreateProposal !== true || !observed.proposalId);
  if (!checks.proposal_creation_pass) reasons.push("Proposal creation behavior did not match expectations");

  checks.decision_creation_pass =
    (testCase.expectations.mustCreateDecision !== true || Boolean(observed.decisionId)) &&
    (testCase.expectations.mustNotCreateDecision !== true || !observed.decisionId);
  if (!checks.decision_creation_pass) reasons.push("Decision creation behavior did not match expectations");

  checks.false_positive_guard_pass =
    testCase.category !== "false_positive_guard" || (!observed.proposalId && !observed.decisionId);
  if (!checks.false_positive_guard_pass) reasons.push("False-positive guard failed");

  checks.affected_refs_pass =
    !testCase.expectations.requireAffectedRefs ||
    (observed.affectedDocumentSectionIds.length > 0 && observed.affectedBrainNodeIds.length > 0);
  if (!checks.affected_refs_pass) reasons.push("Affected refs were missing");

  checks.uncertainty_pass =
    !testCase.expectations.mustPreserveUncertainty || observed.uncertainty.length > 0;
  if (!checks.uncertainty_pass) reasons.push("Expected uncertainty annotations were missing");

  const passed = Object.values(checks).every(Boolean);
  return {
    id: testCase.id,
    category: testCase.category,
    title: testCase.title,
    passed,
    checks,
    reasons,
    observed
  };
}

async function main() {
  const { category } = parseArgs();
  const filePaths = category ? [CATEGORY_FILES[category]] : Object.values(CATEGORY_FILES);
  if (category && !CATEGORY_FILES[category]) {
    throw new Error(`Unknown message-intelligence eval category: ${category}`);
  }

  const cases = (await Promise.all(filePaths.map((filePath) => loadJsonlFile<MessageEvalCase>(filePath)))).flat();
  const results: EvalCaseResult[] = [];

  for (const testCase of cases) {
    const world = buildEvalWorld();
    const injected = world.addFixtureMessages(testCase.setup.projectFixture, testCase.setup.messages);
    const projectId = world.refs.resolveProjectId(testCase.setup.projectFixture);
    const actorUserId = world.refs.resolveUserId("manager");
    const targetKind = testCase.targetKind ?? "message";

    let insightId: string;
    if (targetKind === "thread") {
      const firstRef = injected[testCase.setup.messages[0]];
      const classified = await world.services.threadInsightsService.classifyThread(projectId, firstRef.threadId, actorUserId);
      insightId = classified.id;
    } else {
      const targetRef = testCase.messageIdRef ? injected[testCase.messageIdRef] : injected[testCase.setup.messages[testCase.setup.messages.length - 1]];
      const classified = await world.services.messageInsightsService.classifyMessage(projectId, targetRef.messageId, actorUserId);
      insightId = classified.id;
    }

    const insightStore = targetKind === "thread" ? world.store.threadInsights : world.store.messageInsights;
    const insight = insightStore.get(insightId);

    let proposalId: string | null = null;
    let decisionId: string | null = null;
    if (insight?.shouldCreateProposal || insight?.shouldCreateDecision) {
      const created = targetKind === "thread"
        ? await world.services.threadInsightsService.autoCreateProposal(projectId, insightId)
        : await world.services.messageInsightsService.autoCreateProposal(projectId, insightId);
      proposalId = created.proposalId ?? null;
      decisionId = created.decisionId ?? null;
    }

    results.push(
      scoreCase(testCase, {
        insightType: insight.insightType,
        shouldCreateProposal: insight.shouldCreateProposal,
        shouldCreateDecision: insight.shouldCreateDecision,
        uncertainty: Array.isArray(insight.uncertaintyJson) ? insight.uncertaintyJson : [],
        affectedDocumentSectionIds: Array.isArray(insight.affectedRefsJson?.documentSectionIds) ? insight.affectedRefsJson.documentSectionIds : [],
        affectedBrainNodeIds: Array.isArray(insight.affectedRefsJson?.brainNodeIds) ? insight.affectedRefsJson.brainNodeIds : [],
        proposalId,
        decisionId
      })
    );
  }

  const report = buildReport("message_intelligence", results);
  const { jsonPath, mdPath } = await writeEvalReports("message-intelligence-report", report);

  console.log(`Message-intelligence evals: ${report.summary.passed}/${report.summary.total} passed`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

void main();
