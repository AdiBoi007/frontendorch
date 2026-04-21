# Orchestra Eval Harness

This directory contains the deterministic regression harness for:

- Socrates
- communication/message intelligence

The harness is fixture-backed and CI-friendly. It is intended to be the authoritative quality gate for:

- current-truth precedence
- provenance precedence
- communication-origin lookup
- citation/open-target correctness
- role/client-safe filtering
- conservative message classification
- proposal-generation thresholds
- decision-candidate behavior

## Layout

```text
evals/
  README.md
  helpers/
    fixture-world.ts
    io.ts
    report.ts
    types.ts
  socrates/
    current_truth.jsonl
    provenance.jsonl
    communication_origin.jsonl
    citation_correctness.jsonl
    role_safety.jsonl
  message_intelligence/
    classification.jsonl
    false_positive_guard.jsonl
    proposal_generation.jsonl
    decision_candidate.jsonl
  outputs/
    .gitkeep
```

## Commands

- `npm run eval:socrates`
- `npm run eval:messages`
- `npm run eval:all`

Optional filters:

- `npm run eval:socrates -- --category=current_truth`
- `npm run eval:messages -- --category=false_positive_guard`

## Case format

Cases are JSONL. One line = one case.

### Socrates case shape

```json
{
  "id": "ct_001",
  "category": "current_truth",
  "title": "Accepted change overrides stale original PRD",
  "setup": {
    "projectFixture": "project_alpha",
    "documents": ["prd_v1"],
    "messages": ["msg_manager_approval"],
    "acceptedChanges": ["proposal_manager_approval"]
  },
  "session": {
    "pageContext": "brain_overview",
    "selectedRefType": null,
    "selectedRefId": null,
    "viewerState": null,
    "role": "manager"
  },
  "query": "What is the current assignment approval flow?",
  "expectations": {
    "mustUseCurrentTruth": true,
    "requiredCitationTypes": ["product_brain", "change_proposal"],
    "mustOpenTargetTypes": ["change_proposal"],
    "mustMention": ["manager approval"]
  }
}
```

### Message-intelligence case shape

```json
{
  "id": "mi_amb_001",
  "category": "false_positive_guard",
  "title": "Brainstorming should not become proposal",
  "setup": {
    "projectFixture": "project_alpha",
    "messages": ["msg_maybe_reporting"]
  },
  "messageIdRef": "msg_maybe_reporting",
  "expectations": {
    "allowedInsightTypes": ["info", "clarification", "action_needed"],
    "disallowedInsightTypes": ["requirement_change"],
    "mustNotCreateProposal": true,
    "mustPreserveUncertainty": true
  }
}
```

## Fixture strategy

The harness uses `evals/helpers/fixture-world.ts` to build a deterministic in-memory Orchestra world with:

- org
- users
- project memberships
- documents / sections / chunks
- accepted Product Brain and Brain Graph artifacts
- accepted changes and decisions
- communication connectors / threads / messages / chunks
- dashboard snapshots

Reusable projects:

- `project_alpha`
- `project_beta`
- `project_gamma`
- `project_client_safe`

These are intentionally shaped to exercise:

- current-truth override behavior
- provenance lookup
- contradiction and blocker handling
- client-safe filtering

## Scoring

### Socrates

Each Socrates case is scored with:

- `answer_behavior_pass`
- `citation_presence_pass`
- `citation_type_pass`
- `open_target_pass`
- `truth_precedence_pass`
- `provenance_precedence_pass`
- `role_safety_pass`

### Message intelligence

Each communication-intelligence case is scored with:

- `insight_type_pass`
- `proposal_creation_pass`
- `decision_creation_pass`
- `false_positive_guard_pass`
- `affected_refs_pass`
- `uncertainty_pass`

Final case result:

- pass only if all required checks pass
- failure output includes exact reasons plus observed citations/open-targets/insight output

## Reports

Reports are written to `evals/outputs/`:

- `socrates-report.json`
- `socrates-report.md`
- `message-intelligence-report.json`
- `message-intelligence-report.md`

Generated reports are ignored by Git. Keep `.gitkeep` only.

## Adding new cases

1. Add a JSONL line to the relevant category file.
2. Reuse one of the seeded project fixtures when possible.
3. If a new fixture message is needed, add it to `MESSAGE_FIXTURES` in `evals/helpers/fixture-world.ts`.
4. Prefer deterministic expectations:
   - required/forbidden phrases
   - required citation/open-target types
   - proposal/decision creation booleans
   - uncertainty expectations
5. Run the suite locally before committing.

## CI expectation

- `npm run eval:socrates` must exit non-zero on any failure.
- `npm run eval:messages` must exit non-zero on any failure.
- `npm run eval:all` runs both suites and is suitable for CI gating.
