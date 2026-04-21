# Orchestra Evaluation Harness

## Purpose

Orchestra now ships with a deterministic automated evaluation harness for two critical AI subsystems:

1. Socrates
2. communication/message intelligence

This harness is the regression gate for product-correctness rules that were previously only documented or manually spot-checked.

## Why it exists

The product depends on rules that cannot be left implicit:

- current truth must beat stale originals for current-truth questions
- original evidence must beat summaries for provenance questions
- communication-origin lookup must cite the right message/thread when evidence exists
- citations and open-targets must be navigable
- unaccepted communication intelligence must not become truth
- false-positive proposal creation is costly and must be resisted
- client-safe mode must never leak internal evidence

The eval harness makes these rules repeatable, testable, and CI-enforceable.

## Commands

- `npm run eval:socrates`
- `npm run eval:messages`
- `npm run eval:all`

Optional category filters:

- `npm run eval:socrates -- --category=provenance`
- `npm run eval:messages -- --category=proposal_generation`

## Suites

### Socrates suite

Fixture cases live under `evals/socrates/`.

Implemented categories:

- `current_truth` — 12 cases
- `provenance` — 12 cases
- `communication_origin` — 10 cases
- `citation_correctness` — 10 cases
- `role_safety` — 8 cases

The runner uses the real retrieval/orchestration path via `SocratesService.answerForEval(...)`.

Deterministic scoring dimensions:

- `answer_behavior_pass`
- `citation_presence_pass`
- `citation_type_pass`
- `open_target_pass`
- `truth_precedence_pass`
- `provenance_precedence_pass`
- `role_safety_pass`

### Communication/message-intelligence suite

Fixture cases live under `evals/message_intelligence/`.

Implemented categories:

- `classification` — 12 cases
- `false_positive_guard` — 12 cases
- `proposal_generation` — 10 cases
- `decision_candidate` — 8 cases

The runner uses the real:

- `MessageInsightsService`
- `ThreadInsightsService`
- `CommunicationProposalsService`

Deterministic scoring dimensions:

- `insight_type_pass`
- `proposal_creation_pass`
- `decision_creation_pass`
- `false_positive_guard_pass`
- `affected_refs_pass`
- `uncertainty_pass`

## Fixture model

The harness does not call live providers or require external credentials.

It uses a deterministic in-memory Orchestra world created by `evals/helpers/fixture-world.ts`, including:

- organizations
- users
- projects
- memberships
- documents / sections / chunks
- accepted Product Brain and Brain Graph artifacts
- accepted changes and decisions
- communication connectors / threads / messages
- dashboard snapshots

Seeded projects:

- `project_alpha`
- `project_beta`
- `project_gamma`
- `project_client_safe`

## Reports

Each run emits machine-readable and human-readable reports to `evals/outputs/`:

- `socrates-report.json`
- `socrates-report.md`
- `message-intelligence-report.json`
- `message-intelligence-report.md`

These generated files are ignored by Git so local and CI runs can overwrite them freely.

## Bugs this harness already caught

The harness implementation surfaced and fixed real product bugs:

- provenance/original-source routing was skipping communications in some internal-origin queries
- Socrates open-target validation rejected valid `document_chunk` → `document_section` viewer targets
- communication false-positive logic was too permissive for exploratory/off-topic language
- contradiction detection in heuristic fallback could be shadowed by requirement-change phrasing
- thread-derived proposal conversion was updating the wrong table (`messageInsight` instead of `threadInsight`)

## CI policy

Recommended CI gate:

1. `npm run typecheck`
2. `npm test`
3. `npm run eval:all`

Any failed eval suite must fail CI with a non-zero exit code.

## Intentionally deferred

The harness is deterministic by default. It does not yet include:

- live-provider end-to-end evals
- LLM-judge grading in CI
- longitudinal drift dashboards across many historical model versions

Those can be layered on later, but deterministic rule-based scoring remains the baseline gate.
