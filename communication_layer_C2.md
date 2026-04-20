# Orchestra Communication Layer C2

Status: implementation-grounded rebuild document for Build C2  
Repo: current Orchestra backend  
Date baseline: 2026-04-20

This file documents exactly what Build C2 added on top of C1. It is written so a future agent can rebuild C2 from this file alone and use it as the reference baseline for C3.

---

## 1. Purpose of C2

C2 adds the first intelligence and review layer on top of the C1 communication foundation.

After C1, Orchestra could:

- ingest immutable communication evidence
- normalize connectors/threads/messages/revisions
- index message chunks for Socrates
- expose timeline/thread/message read APIs

C2 adds the missing product-aware loop:

- classify messages and threads into structured insights
- resolve likely product impact using current Product Brain and source structures
- create reviewable proposals or decision candidates from high-confidence truth-affecting communication
- dedupe repeat communication so proposal spam stays controlled
- keep the final truth update path manager-reviewed and fully provenance-linked

C2 does **not** accept truth automatically.

---

## 2. What C2 changes in the product

C2 makes Orchestra capable of turning communication into manager-reviewable change pressure.

The new product behavior is:

1. a message is imported
2. the message is indexed
3. the message is classified against accepted product truth
4. the system stores an insight row
5. if confidence and provenance are strong enough, the system creates a reviewable proposal and optional open decision candidate
6. a manager still accepts or rejects that proposal through the existing change flow
7. only then does current truth move

This keeps the system aligned with the product contract:

- messages are evidence
- insights are machine-derived
- proposals are candidates
- Product Brain remains current accepted truth

---

## 3. Schema added in C2

## 3.1 New enums

Added to `prisma/schema.prisma`:

### `MessageInsightType`

- `info`
- `clarification`
- `decision`
- `requirement_change`
- `contradiction`
- `blocker`
- `action_needed`
- `risk`
- `approval`

### `MessageInsightStatus`

- `detected`
- `ignored`
- `converted_to_proposal`
- `converted_to_decision`
- `superseded`

## 3.2 New models

### `message_insights`

Stores one insight per normalized message body state.

Important fields:

- `project_id`
- `connector_id`
- `provider`
- `message_id`
- `thread_id`
- `body_hash`
- `insight_type`
- `status`
- `summary`
- `confidence`
- `should_create_proposal`
- `should_create_decision`
- `proposal_type`
- `affected_refs_json`
- `evidence_json`
- `old_understanding_json`
- `new_understanding_json`
- `decision_statement`
- `impact_summary_json`
- `uncertainty_json`
- `model_json`
- `generated_proposal_id`
- `generated_decision_id`

Constraint:

- unique `(message_id, body_hash)`

Why that matters:

- if provider content changes and the message body hash changes, a later classification does not overwrite the earlier insight row
- the insight lifecycle stays tied to the exact body version that triggered it

### `thread_insights`

Stores one insight per thread state snapshot.

Important fields:

- `project_id`
- `connector_id`
- `provider`
- `thread_id`
- `thread_state_hash`
- `insight_type`
- `status`
- `summary`
- `confidence`
- `should_create_proposal`
- `should_create_decision`
- `proposal_type`
- `source_message_ids_json`
- `affected_refs_json`
- `evidence_json`
- `old_understanding_json`
- `new_understanding_json`
- `decision_statement`
- `impact_summary_json`
- `uncertainty_json`
- `model_json`
- `generated_proposal_id`
- `generated_decision_id`

Constraint:

- unique `(thread_id, thread_state_hash)`

Why that matters:

- thread classification is idempotent against a concrete thread message-state snapshot
- repeated reclassification of unchanged threads does not duplicate insight rows

## 3.3 Existing models reused

C2 deliberately reuses, not replaces:

- `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `artifact_versions`
- `brain_nodes`
- `document_sections`
- `communication_messages`
- `communication_threads`
- `communication_message_chunks`

## 3.4 Migration added

Added migration:

- `prisma/migrations/0009_communication_layer_c2/migration.sql`

It:

- creates the two new enums
- creates `message_insights`
- creates `thread_insights`
- adds indexes and foreign keys

No destructive communication data rewrite happens in C2.

---

## 4. Files added in C2

New files:

- `src/modules/communications/insight-classifier.prompt.ts`
- `src/modules/communications/impact-resolver.service.ts`
- `src/modules/communications/message-insights.service.ts`
- `src/modules/communications/thread-insights.service.ts`
- `src/modules/communications/communication-proposals.service.ts`
- `prisma/migrations/0009_communication_layer_c2/migration.sql`
- `tests/communication-insights.service.test.ts`

Patched files:

- `prisma/schema.prisma`
- `src/modules/communications/communications.service.ts`
- `src/modules/communications/message-indexing.service.ts`
- `src/modules/communications/timeline.service.ts`
- `src/modules/communications/communications.routes.ts`
- `src/modules/communications/schemas.ts`
- `src/modules/changes/service.ts`
- `src/lib/jobs/types.ts`
- `src/lib/jobs/keys.ts`
- `src/setup-context.ts`
- `src/worker.ts`
- `tests/change-proposal-service.test.ts`
- `tests/communications-schemas.test.ts`
- `tests/routes.test.ts`
- docs and feature files

---

## 5. New jobs in C2

Added job names:

- `classify_message_insight`
- `classify_thread_insight`
- `generate_change_proposal_from_insight`

Added idempotency key helpers:

- `classify-message:{messageId}:{bodyHash}`
- `classify-thread:{threadId}:{threadStateHash}`
- `proposal-from-insight:{insightId}`

Job wiring was added in:

- `src/setup-context.ts` for inline mode
- `src/worker.ts` for queued worker mode

---

## 6. Insight classification architecture

## 6.1 Prompt schema

`src/modules/communications/insight-classifier.prompt.ts` defines:

- `communicationInsightOutputSchema`
- system prompt builder
- prompt builder for message/thread classification

The output schema is strict and includes:

- `insightType`
- `summary`
- `confidence`
- `shouldCreateProposal`
- `shouldCreateDecision`
- `proposalType`
- `affectedDocumentSections[]`
- `affectedBrainNodes[]`
- `oldUnderstanding`
- `newUnderstanding`
- `decisionStatement`
- `impactSummary`
- `uncertainty[]`

## 6.2 Classification source context

`ImpactResolverService` builds a **targeted** context pack. It does **not** load the whole project blindly.

For message classification it loads:

- the target message
- the containing thread
- the most recent nearby thread messages
- latest accepted Product Brain summary
- candidate document sections matched by lexical overlap
- candidate brain nodes matched by lexical overlap
- accepted changes matched by lexical overlap
- accepted decisions matched by lexical overlap
- unresolved proposals matched by lexical overlap for dedupe context

For thread classification it loads:

- the target thread
- a bounded set of latest thread messages
- the same product-aware candidate context as above

## 6.3 Candidate selection strategy

Candidate selection is deterministic:

- tokenize message/thread text
- keep only a bounded token set
- query sections/nodes/changes/decisions/proposals by `contains`
- limit candidate counts
- summarize Product Brain instead of loading all artifact payload fields

This keeps classification context product-aware without turning it into a whole-project dump.

## 6.4 Fallback behavior

The generation provider already supports `fallback()`.

For C2:

- if the configured provider is the mock provider, the fallback path is used
- if Anthropic fails, the fallback path is used

The fallback is deterministic and keyword-based. It recognizes:

- blocker phrases
- approval phrases
- decision phrases
- contradiction phrases
- clarification/question phrasing
- requirement-change phrasing

It defaults to `info` if nothing truth-affecting is clear.

---

## 7. Confidence and validation rules

## 7.1 Affected ref validation

The model can only nominate refs from the candidate sets built by `ImpactResolverService`.

Validation happens after model output:

- document section refs not in the candidate section set are dropped
- brain node refs not in the candidate node set are dropped

## 7.2 Confidence degradation

`MessageInsightsService` and `ThreadInsightsService` reduce confidence when:

- truth-affecting insight types reference invalid refs
- no validated section refs remain
- no validated node refs remain

This is deliberate. The system is designed to avoid high-confidence garbage propagation.

## 7.3 Conservative thresholds used in the implementation

- `requirement_change >= 0.78`
- `decision >= 0.75`
- `approval >= 0.75`
- `contradiction >= 0.72`
- `clarification >= 0.82`
- `blocker`, `risk`, `action_needed` are insight-only by default
- `info` never creates proposals

These thresholds are implemented in service logic, not only in documentation.

---

## 8. Proposal and decision generation

## 8.1 Service

`CommunicationProposalsService` owns:

- dedupe checks
- proposal creation from insights
- optional decision candidate creation
- insight status updates
- audit events
- dashboard refresh hook after proposal creation

## 8.2 Dedupe logic

Before creating a new proposal, the service searches existing `spec_change_proposals` with:

- same `proposalType`
- status in `needs_review | accepted`
- title/summary overlap
- overlapping affected section ids
- overlapping affected brain node ids

If it finds a duplicate:

- no new proposal is created
- the insight is marked `superseded`
- `generatedProposalId` is set to the existing proposal

This is the current repo’s anti-spam guard for communication-derived proposals.

## 8.3 Proposal shape generated from insights

When a new proposal is created, the service writes:

- `title`
- `summary`
- `proposalType`
- `status = needs_review`
- `sourceMessageCount = 1`
- `oldUnderstandingJson`
- `newUnderstandingJson`
- `impactSummaryJson`
- optional `decisionRecordId`

Then it writes `spec_change_links`:

- `message` / `source`
- `thread` / `evidence`
- `document_section` / `affected`
- `brain_node` / `affected`

## 8.4 Decision candidate generation

If the insight is decision-like or approval-like:

- search existing `decision_records` in `open | accepted` for overlap
- if found, reuse that decision id
- otherwise create a new `decision_record` with:
  - `status = open`
  - `sourceSummary = "Generated from communication insight review"`

The proposal then points at that `decisionRecordId`.

## 8.5 Insight status transitions

The implementation uses:

- `detected`
- `ignored`
- `converted_to_proposal`
- `converted_to_decision`
- `superseded`

Important note:

- converting to decision in the current repo still usually creates a proposal too, because accepted truth still flows through the proposal acceptance path

---

## 9. Review queue

Route:

- `GET /v1/projects/:projectId/communication-review`

Implemented in `MessageInsightsService.getReviewQueue()`.

It returns three buckets:

- `pendingInsights`
- `generatedProposals`
- `generatedDecisionCandidates`

The queue is intentionally manager/dev facing and minimal.

It is not a dashboard. It is a communication-review operating surface.

---

## 10. Thread and message detail changes

`TimelineService` was extended so thread and message detail responses now include insights.

### Thread detail now includes

- thread metadata
- connector summary
- messages
- `insights`
- linked proposals
- linked decisions
- open targets

### Message detail now includes

- message metadata
- revisions
- attachments
- chunk metadata
- `insights`
- linked proposals
- linked decisions
- linked documents
- open targets

This keeps Feature 3 and future review tooling aligned with the communication layer.

---

## 11. Timeline filter extensions

Timeline query parsing now supports:

- `insightType`
- `hasOpenDecision`
- `hasBlocker`

Internally, `TimelineService` now derives:

- change-proposal counts by thread
- open decision presence by thread
- blocker insight counts by thread

These feed attention labels like:

- `attention` for blocker-linked threads
- `watch` for open decision or change-linked threads

---

## 12. Acceptance integration with Product Brain

This was a critical integration point.

`ChangeProposalService.accept()` was patched so:

- if a `decision_change` proposal already has a linked `decisionRecordId`
- and that decision record is still open
- acceptance updates that existing row to `accepted`
- instead of creating a duplicate decision record

Everything else in the acceptance flow stays the same:

- proposal status becomes `accepted`
- `apply_accepted_change` runs
- Product Brain gets a new accepted version
- dashboard refresh is queued

Because the communication-generated proposal still uses the existing change-application flow, the rest of the system stays in sync automatically.

---

## 13. Feature interaction after C2

## 13.1 Feature 1

Still owns:

- accepted Product Brain
- accepted graph
- current-truth versioning
- viewer overlay materialization

C2 only generates better inputs into that system.

## 13.2 Feature 2

Still retrieves:

- communication chunks as source evidence
- Product Brain as current truth

After a manager accepts a communication-generated proposal:

- current-truth answers come from the new Product Brain version
- provenance answers can still cite the original messages

## 13.3 Feature 3

Viewer compatibility survives because:

- accepted communication-derived proposals still use `spec_change_links`
- linked message ids and thread ids remain durable
- section overlays continue to derive from accepted proposals affecting document sections

## 13.4 Feature 4

Dashboard compatibility survives because:

- proposal creation from communication refreshes dashboard snapshots
- accepted proposals still refresh dashboard via the existing change flow
- `needs_review` proposals contribute to pending pressure

---

## 14. Authz model in C2

Manager:

- full insight/review/classify/proposal actions

Dev:

- read-only insight list/detail/review in assigned projects
- read-only communication timeline/thread/message access

Client:

- blocked from communication routes
- blocked from insights
- blocked from review queue
- blocked from raw communication-derived proposal routes by existing changes/authz rules

Authz remains server-side.

---

## 15. Tests added in C2

Added:

- `tests/communication-insights.service.test.ts`

Updated:

- `tests/change-proposal-service.test.ts`
- `tests/communications-schemas.test.ts`
- `tests/routes.test.ts`

The new coverage verifies:

- invalid ref handling lowers confidence and blocks proposal creation
- blockers stay insight-only
- proposal dedupe marks an insight superseded instead of spamming a duplicate proposal
- accepting a proposal tied to an existing open decision upgrades that decision instead of creating a duplicate
- route-level manager/dev/client behavior for the new C2 routes

---

## 16. Commands used to validate C2

The C2 implementation was validated with:

```powershell
npm run prisma:generate
npm run build
npm test
$env:DATABASE_URL='postgresql://test:test@localhost:5432/test'; npx prisma validate
```

At the end of the C2 implementation pass:

- build passed
- tests passed
- Prisma schema validation passed

---

## 17. Limitations intentionally left for C3+

Not built in C2:

- real live provider OAuth/connectors
- webhook endpoints
- outbound replies
- multi-message aggregation beyond current thread classification
- attachment extraction intelligence
- automatic acceptance
- client-safe communication summaries

C2 is the intelligence-and-review layer, not the full connector ecosystem.

---

## 18. Rebuild order for C2

If C2 must be rebuilt from scratch on top of C1, do it in this order:

1. add `MessageInsightType` and `MessageInsightStatus`
2. add `message_insights` and `thread_insights`
3. add the migration and regenerate Prisma
4. create `insight-classifier.prompt.ts`
5. create `impact-resolver.service.ts`
6. create `communication-proposals.service.ts`
7. create `message-insights.service.ts`
8. create `thread-insights.service.ts`
9. patch `message-indexing.service.ts` to enqueue message classification
10. patch job names / keys / inline handlers / worker
11. patch routes and schemas
12. patch timeline detail responses to surface insights
13. patch `ChangeProposalService.accept()` to upgrade existing open decision candidates
14. add tests
15. update docs

---

## 19. Final rule for C2

C2 must never turn communication directly into truth.

It must:

- classify communication conservatively
- preserve uncertainty
- generate reviewable candidates only when evidence is strong enough
- keep provenance durable
- route accepted truth changes back through the existing Product Brain acceptance pipeline

That is the implemented contract in this repo.
