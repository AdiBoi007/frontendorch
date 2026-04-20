# Feature 5: Communication Layer (C1 + C2)

## Purpose

Feature 5 turns project communication into immutable, provider-agnostic source evidence, then adds a conservative intelligence layer that classifies important messages and generates manager-reviewable change or decision candidates without silently changing truth.

This feature now has two completed builds:

- `C1`: connector and ingestion foundation
- `C2`: insight classification, impact resolution, review queue, and communication-driven proposal generation

## What it does

The current implementation covers:

- provider-agnostic connectors and sync runs
- manual import for normalized threads/messages
- immutable messages plus revision history for edits
- attachment metadata capture
- provider-aware message chunking and embeddings
- timeline, thread, and message read APIs
- message insight classification
- optional thread insight classification
- product-aware impact resolution against current Product Brain, graph nodes, doc sections, accepted changes, and accepted decisions
- auto-generation of reviewable `spec_change_proposals`
- open decision candidate generation
- dedupe / supersession handling
- manager review routes
- preservation of provenance into Product Brain, Viewer, Socrates, and Dashboard

## What it does not do yet

- live Slack/Gmail/Outlook/Teams/WhatsApp connectors
- outbound messaging
- CRM/helpdesk workflows
- automatic acceptance of truth changes
- client-visible communication intelligence

## Core invariants

- messages remain immutable source evidence
- edited provider messages create `communication_message_revisions`
- insights are machine-derived and never count as accepted truth
- only manager acceptance of a proposal updates Product Brain
- accepted communication-derived truth changes still flow through the existing `apply_accepted_change` path
- clients are blocked from internal communication, insights, and review queues

## Main schema objects

Existing C1 objects:

- `communication_connectors`
- `communication_sync_runs`
- `oauth_states`
- `provider_webhook_events`
- `communication_threads`
- `communication_messages`
- `communication_message_revisions`
- `communication_attachments`
- `communication_message_chunks`

Added in C2:

- `message_insights`
- `thread_insights`

Reused truth/update objects:

- `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `artifact_versions`

## Main routes

Connector and timeline:

- `GET /v1/projects/:projectId/connectors`
- `GET /v1/projects/:projectId/connectors/:connectorId`
- `PATCH /v1/projects/:projectId/connectors/:connectorId`
- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `POST /v1/projects/:projectId/connectors/:connectorId/sync`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`
- `GET /v1/projects/:projectId/connectors/:connectorId/sync-runs`
- `POST /v1/projects/:projectId/communications/import`
- `GET /v1/projects/:projectId/communications/timeline`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/threads/:threadId`
- `GET /v1/projects/:projectId/messages/:messageId`

C2 review/intelligence:

- `GET /v1/projects/:projectId/message-insights`
- `GET /v1/projects/:projectId/message-insights/:insightId`
- `POST /v1/projects/:projectId/message-insights/:insightId/ignore`
- `POST /v1/projects/:projectId/message-insights/:insightId/create-proposal`
- `POST /v1/projects/:projectId/messages/:messageId/classify`
- `POST /v1/projects/:projectId/threads/:threadId/classify`
- `GET /v1/projects/:projectId/communication-review`

## High-level flow

### C1 ingestion flow

1. A manager imports normalized thread/message payloads through `manual_import`.
2. The system creates or reuses a project `manual_import` connector.
3. Threads upsert by `(connectorId, providerThreadId)`.
4. Messages upsert by `(connectorId, providerMessageId)`.
5. If the body changed, the previous message body is copied to `communication_message_revisions`.
6. Attachment metadata is stored.
7. Message indexing jobs chunk and embed the message.
8. Dashboard refresh is enqueued.

### C2 classification flow

1. Indexing completion enqueues `classify_message_insight`.
2. `ImpactResolverService` builds a targeted context pack from:
   - current message or thread
   - nearby thread context
   - accepted Product Brain summary
   - likely matching document sections
   - likely matching graph nodes
   - accepted changes
   - accepted decisions
   - unresolved proposals for dedupe context
3. `MessageInsightsService` or `ThreadInsightsService` calls the generation provider with a strict schema.
4. Returned refs are validated against the candidate sets.
5. Confidence is lowered when affected refs are weak or invalid.
6. Only threshold-satisfying truth-affecting insights are eligible for proposal generation.
7. Eligible insights enqueue `generate_change_proposal_from_insight`.

### C2 proposal generation flow

1. `CommunicationProposalsService` checks for duplicate open/accepted proposals in the same area.
2. If a duplicate exists, the insight is marked `superseded` and linked to the existing proposal.
3. Otherwise, the system creates:
   - a `spec_change_proposal` with `status = needs_review`
   - optional open `decision_record` for decision/approval-like insights
   - `spec_change_links` for:
     - source `message`
     - evidence `thread`
     - affected `document_section`
     - affected `brain_node`
4. Insight status becomes:
   - `converted_to_proposal`, or
   - `converted_to_decision`

### Acceptance flow

1. A manager accepts the generated proposal through the existing changes subsystem.
2. If the proposal already points at an open decision candidate, acceptance upgrades that decision to `accepted` instead of creating a second decision row.
3. `apply_accepted_change` generates a new Product Brain version.
4. Viewer overlays, Socrates current-truth answers, and Dashboard pressure/freshness all update through the existing Feature 1–4 paths.

## Authorization

- manager:
  - full connector management
  - manual import
  - sync/revoke
  - classify message/thread
  - ignore insights
  - create communication-derived proposals
  - full read access
- dev:
  - read-only timeline/thread/message access
  - read-only insight/review queue access
  - no proposal/decision truth-changing actions
- client:
  - blocked from internal communication routes, insights, and review

## Jobs

- `sync_communication_connector`
- `index_communication_message`
- `classify_message_insight`
- `classify_thread_insight`
- `generate_change_proposal_from_insight`

## Integration points

- Feature 1:
  - proposals created from communication still use `spec_change_links`
  - acceptance still creates new current Product Brain versions
- Feature 2:
  - Socrates continues retrieving `communication_message_chunks`
  - accepted communication-driven proposals affect current-truth answers through Product Brain
- Feature 3:
  - thread/message routes remain the evidence surface for communication provenance
  - linked document open-targets remain valid
- Feature 4:
  - connector/import/proposal creation and proposal acceptance refresh dashboard snapshots

## File map

- `src/modules/communications/communications.service.ts`
- `src/modules/communications/communications.routes.ts`
- `src/modules/communications/connectors.service.ts`
- `src/modules/communications/sync.service.ts`
- `src/modules/communications/timeline.service.ts`
- `src/modules/communications/message-ingestion.service.ts`
- `src/modules/communications/message-indexing.service.ts`
- `src/modules/communications/message-insights.service.ts`
- `src/modules/communications/thread-insights.service.ts`
- `src/modules/communications/impact-resolver.service.ts`
- `src/modules/communications/communication-proposals.service.ts`
- `src/modules/communications/insight-classifier.prompt.ts`

## Testing status

The repo now includes coverage for:

- manual import idempotency
- revision creation on message edits
- attachment metadata
- message indexing
- message insight classification thresholds
- blocker insight no-proposal behavior
- dedupe/supersession against existing proposals
- route-level authz for new C2 actions
- existing decision candidate acceptance behavior

## Rebuild reference

`communication_layer_C1.md` documents the foundation build.

`communication_layer_C2.md` is the exhaustive rebuild/reference file for the current C2 implementation and should be treated as the detailed baseline for future C3 work.
