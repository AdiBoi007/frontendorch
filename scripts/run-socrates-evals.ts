import path from "node:path";
import { buildEvalWorld } from "../evals/helpers/fixture-world.js";
import { loadJsonlFile, writeEvalReports } from "../evals/helpers/io.js";
import { buildReport } from "../evals/helpers/report.js";
import type { EvalCaseResult, SocratesEvalCase } from "../evals/helpers/types.js";

const CATEGORY_FILES: Record<string, string> = {
  current_truth: path.resolve("evals", "socrates", "current_truth.jsonl"),
  provenance: path.resolve("evals", "socrates", "provenance.jsonl"),
  communication_origin: path.resolve("evals", "socrates", "communication_origin.jsonl"),
  citation_correctness: path.resolve("evals", "socrates", "citation_correctness.jsonl"),
  role_safety: path.resolve("evals", "socrates", "role_safety.jsonl")
};

function parseArgs() {
  const categoryArg = process.argv.find((arg) => arg.startsWith("--category="));
  return {
    category: categoryArg ? categoryArg.split("=")[1] : null
  };
}

function includesAll(values: string[], needles: string[]) {
  return needles.every((needle) => values.includes(needle));
}

function scoreCase(testCase: SocratesEvalCase, response: Awaited<ReturnType<ReturnType<typeof buildEvalWorld>["services"]["socratesService"]["answerForEval"]>>): EvalCaseResult {
  const answer = response.answer_md.toLowerCase();
  const citationTypes = response.citations.map((citation) => citation.type);
  const openTargetTypes = response.open_targets.map((target) => target.targetType);
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];

  checks.answer_behavior_pass =
    (testCase.expectations.mustMention ?? []).every((phrase) => answer.includes(phrase.toLowerCase())) &&
    (testCase.expectations.mustNotMention ?? []).every((phrase) => !answer.includes(phrase.toLowerCase()));
  if (!checks.answer_behavior_pass) reasons.push("Answer text did not match mention constraints");

  checks.citation_presence_pass =
    (testCase.expectations.requiredCitationTypes?.length ?? 0) === 0 || response.citations.length > 0;
  if (!checks.citation_presence_pass) reasons.push("Required citations were missing");

  checks.citation_type_pass =
    includesAll(citationTypes, testCase.expectations.requiredCitationTypes ?? []) &&
    citationTypes.every((type) => (testCase.expectations.allowedCitationTypes ?? citationTypes).includes(type as string)) &&
    (testCase.expectations.disallowedCitationTypes ?? []).every((type) => !citationTypes.includes(type as (typeof citationTypes)[number]));
  if (!checks.citation_type_pass) reasons.push("Citation types did not satisfy the case contract");

  checks.open_target_pass =
    includesAll(openTargetTypes, testCase.expectations.mustOpenTargetTypes ?? []) &&
    (testCase.expectations.disallowedOpenTargetTypes ?? []).every((type) => !openTargetTypes.includes(type as (typeof openTargetTypes)[number]));
  if (!checks.open_target_pass) reasons.push("Open target types were missing or unsafe");

  checks.truth_precedence_pass =
    !testCase.expectations.mustUseCurrentTruth ||
    citationTypes.some((type) =>
      testCase.session.role === "client"
        ? ["brain_node", "document_chunk", "dashboard_snapshot"].includes(type)
        : ["product_brain", "change_proposal", "decision_record", "brain_node"].includes(type)
    );
  if (!checks.truth_precedence_pass) reasons.push("Current-truth precedence was not preserved");

  checks.provenance_precedence_pass =
    (!testCase.expectations.mustPreferOriginalEvidence ||
      response.citations.some((citation, index) => index === 0 && ["message", "document_chunk", "document_section"].includes(citation.type))) &&
    (!testCase.expectations.mustPreferCommunicationEvidence ||
      response.citations.some((citation, index) => index === 0 && citation.type === "message"));
  if (!checks.provenance_precedence_pass) reasons.push("Original-source provenance precedence was not preserved");

  checks.role_safety_pass =
    testCase.session.role !== "client" ||
    citationTypes.every((type) => !["message", "change_proposal", "decision_record", "product_brain"].includes(type)) &&
      openTargetTypes.every((type) => !["message", "thread", "change_proposal", "decision_record"].includes(type));
  if (!checks.role_safety_pass) reasons.push("Client-safe filtering leaked internal evidence");

  const passed = Object.values(checks).every(Boolean);
  return {
    id: testCase.id,
    category: testCase.category,
    title: testCase.title,
    passed,
    checks,
    reasons,
    observed: {
      intent: response.debug.intent,
      citationTypes,
      citations: response.citations,
      openTargetTypes,
      answer: response.answer_md
    }
  };
}

async function main() {
  const { category } = parseArgs();
  const filePaths = category ? [CATEGORY_FILES[category]] : Object.values(CATEGORY_FILES);
  if (category && !CATEGORY_FILES[category]) {
    throw new Error(`Unknown Socrates eval category: ${category}`);
  }

  const cases = (await Promise.all(filePaths.map((filePath) => loadJsonlFile<SocratesEvalCase>(filePath)))).flat();
  const results: EvalCaseResult[] = [];

  for (const testCase of cases) {
    const world = buildEvalWorld();
    if (testCase.setup.messages?.length) {
      world.addFixtureMessages(testCase.setup.projectFixture, testCase.setup.messages);
    }
    const projectId = world.refs.resolveProjectId(testCase.setup.projectFixture);
    const actorUserId = world.refs.resolveUserId(testCase.session.role);
    const response = await world.services.socratesService.answerForEval(projectId, actorUserId, {
      content: testCase.query,
      pageContext: testCase.session.pageContext,
      selectedRefType: testCase.session.selectedRefType ?? null,
      selectedRefId: testCase.session.selectedRefId ?? null,
      viewerState: testCase.session.viewerState ?? null
    });
    results.push(scoreCase(testCase, response));
  }

  const report = buildReport("socrates", results);
  const { jsonPath, mdPath } = await writeEvalReports("socrates-report", report);

  console.log(`Socrates evals: ${report.summary.passed}/${report.summary.total} passed`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

void main();
