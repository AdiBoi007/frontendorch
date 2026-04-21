# Feature 5: Communication Layer (C1 + C2 + C3 + C4)

## Purpose

Feature 5 turns external project communication into immutable, provider-agnostic project evidence, then layers conservative AI interpretation and manager-reviewed truth updates on top of that evidence.

## Completed builds

- `C1`: connector and ingestion foundation
- `C2`: insight classification, impact resolution, review queue, and communication-driven proposal generation
- `C3`: production-safe credential vault, Slack OAuth/sync/webhooks, and Gmail OAuth/polling sync
- `C4`: Outlook + Microsoft Teams connectors, WhatsApp Business inbound/webhook support, sync locking, retry/backoff, observability, and dashboard communication summary integration

## What the current implementation covers

- provider-agnostic connectors and sync runs
- manual import for normalized threads/messages
- encrypted/file-backed or in-memory credential vaulting behind `CredentialVault`
- one-time OAuth state verification
- Slack OAuth callback handling
- verified Slack webhook handling
- Slack history + replies sync
- Gmail OAuth callback handling
- Gmail polling/incremental sync
- Outlook OAuth callback handling through Microsoft identity
- Outlook message sync through Microsoft Graph
- Microsoft Teams OAuth callback handling through Microsoft identity
- Microsoft Teams channel + reply sync through Microsoft Graph
- WhatsApp Business webhook challenge/signature verification and inbound normalization
- immutable normalized messages plus revision history for edits
- attachment metadata capture
- provider-aware message chunking and embeddings
- timeline, thread, and message evidence APIs
- message insight classification
- optional thread insight classification
- product-aware impact resolution against current Product Brain, graph nodes, doc sections, accepted changes, and accepted decisions
- auto-generation of reviewable `spec_change_proposals`
- open decision candidate generation
- dedupe / supersession handling
- manager review routes
- preservation of provenance into Product Brain, Viewer, Socrates, and Dashboard
- provider sync runtime locking
- provider rate-limit retry/backoff handling
- dashboard communication summary contribution

## What it does not do yet

- Gmail push/watch webhook ingestion
- Outlook/Teams subscription lifecycle automation beyond provider-ready callback/webhook handling
- outbound messaging
- CRM/helpdesk workflows
- automatic acceptance of truth changes
- client-visible communication intelligence
- WhatsApp outbound send/reply

## Core invariants

- messages remain immutable source evidence
- edited provider messages create `communication_message_revisions`
- provider deletes do not delete evidence; they mark `isDeletedByProvider`
- insights are machine-derived and never count as accepted truth
- only manager acceptance of a proposal updates Product Brain
- accepted communication-derived truth changes still flow through the existing `apply_accepted_change` path
- raw OAuth tokens never live in Prisma rows
- clients are blocked from internal communication, insights, and review queues
- provider sync is connector-locked and retry-safe

## Main schema objects

Connector/evidence objects:

- `communication_connectors`
- `communication_sync_runs`
- `oauth_states`
- `provider_webhook_events`
- `communication_threads`
- `communication_messages`
- `communication_message_revisions`
- `communication_attachments`
- `communication_message_chunks`

Intelligence/governance objects:

- `message_insights`
- `thread_insights`
- `spec_change_proposals`
- `spec_change_links`
- `decision_records`

## Main routes

Connector/OAuth/webhook:

- `GET /v1/projects/:projectId/connectors`
- `GET /v1/projects/:projectId/connectors/:connectorId`
- `PATCH /v1/projects/:projectId/connectors/:connectorId`
- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `GET /v1/oauth/slack/callback`
- `GET /v1/oauth/google/callback`
- `GET /v1/oauth/microsoft/callback`
- `POST /v1/webhooks/slack`
- `POST /v1/webhooks/outlook`
- `POST /v1/webhooks/teams`
- `GET /v1/webhooks/whatsapp-business`
- `POST /v1/webhooks/whatsapp-business`
- `POST /v1/projects/:projectId/connectors/:connectorId/sync`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`
- `GET /v1/projects/:projectId/connectors/:connectorId/sync-runs`

Evidence/timeline:

- `POST /v1/projects/:projectId/communications/import`
- `GET /v1/projects/:projectId/communications/timeline`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/threads/:threadId`
- `GET /v1/projects/:projectId/messages/:messageId`

Intelligence/review:

- `GET /v1/projects/:projectId/message-insights`
- `GET /v1/projects/:projectId/message-insights/:insightId`
- `POST /v1/projects/:projectId/message-insights/:insightId/ignore`
- `POST /v1/projects/:projectId/message-insights/:insightId/create-proposal`
- `POST /v1/projects/:projectId/messages/:messageId/classify`
- `POST /v1/projects/:projectId/threads/:threadId/classify`
- `GET /v1/projects/:projectId/communication-review`

## High-level flows

### C1 ingestion flow

1. A manager imports normalized thread/message payloads through `manual_import`.
2. The system creates or reuses a project `manual_import` connector.
3. Threads upsert by `(connectorId, providerThreadId)`.
4. Messages upsert by `(connectorId, providerMessageId)`.
5. If the body changed, the previous message body is copied to `communication_message_revisions`.
6. Attachment metadata is stored.
7. Message indexing jobs chunk and embed the message.
8. Dashboard refresh is enqueued.

### C2 classification and proposal flow

1. Message indexing completion enqueues `classify_message_insight`.
2. The impact resolver builds a targeted context pack from nearby messages, accepted Product Brain, likely sections/nodes, accepted changes, accepted decisions, and unresolved proposals.
3. The generation provider returns a strict-schema insight.
4. Affected refs are validated and confidence is degraded when refs are weak or invalid.
5. Threshold-satisfying truth-affecting insights enqueue `generate_change_proposal_from_insight`.
6. Dedupe/supersession prevents proposal spam.
7. Managers still accept/reject through the existing change workflow.

### C3 Slack/Gmail provider flow

1. A manager starts Slack or Gmail connect.
2. Orchestra creates a short-lived, one-time OAuth state row.
3. The provider adapter returns an OAuth URL containing the signed state.
4. The callback verifies the state, exchanges the code, and stores credentials through `CredentialVault`.
5. The connector is moved to `connected`.
6. An initial `backfill` sync is enqueued.

### C4 Microsoft provider flow

1. A manager starts `outlook` or `microsoft_teams` connect.
2. Orchestra creates signed one-time OAuth state and redirects to Microsoft identity.
3. `/v1/oauth/microsoft/callback` verifies state and dispatches to the correct provider from the state payload.
4. Credentials are stored only through `CredentialVault`.
5. A connector is created or updated and initial backfill sync is enqueued.
6. Outlook sync normalizes email threads/messages and metadata-only attachments.
7. Teams sync normalizes channel roots and replies into shared thread/message models.

### C4 WhatsApp inbound flow

1. A manager creates or reuses a `whatsapp_business` connector.
2. Meta verifies the webhook challenge through `GET /v1/webhooks/whatsapp-business`.
3. Inbound POST payloads are signature-verified when `WHATSAPP_APP_SECRET` is configured.
4. Status-only events are ignored as user-message evidence.
5. Inbound text/media metadata normalizes into shared thread/message rows.
6. Existing indexing/classification/proposal flows continue on top of the normalized evidence.

## Authorization

- manager:
  - full connector management
  - OAuth connect/revoke
  - manual import
  - sync/revoke
  - classify message/thread
  - ignore insights
  - create communication-derived proposals
  - full read access
- dev:
  - read-only timeline/thread/message access
  - read-only insight/review queue access
  - no connector management
  - no truth-changing actions
- client:
  - blocked from internal communication routes, insights, and review

## Jobs

- `sync_communication_connector`
- `index_communication_message`
- `classify_message_insight`
- `classify_thread_insight`
- `generate_change_proposal_from_insight`

## Connector security

- `CredentialVault` is the only storage path for live provider credentials
- development/test may use `memory` mode
- production requires `encrypted_file` mode
- OAuth state is HMAC-signed, one-time-use, and expires quickly
- Slack webhook verification uses signed raw-body validation
- Gmail is currently implemented with safe polling/manual sync instead of push notifications
- Outlook and Teams are implemented through Microsoft Graph using the shared Microsoft OAuth callback route
- WhatsApp Business is inbound/webhook-first and can be readiness-gated with `WHATSAPP_READINESS_MODE`
- connector sync jobs reject revoked connectors, suppress duplicate active syncs, retry provider sync on rate limits, and update dashboard communication summary after connect/import/revoke/sync flows

## Integration points

- Feature 1:
  - communication-generated proposals still use `spec_change_links`
  - acceptance still creates new current Product Brain versions
- Feature 2:
  - Socrates continues retrieving `communication_message_chunks`
  - accepted communication-driven proposals affect current-truth answers through Product Brain
- Feature 3:
  - thread/message routes remain the evidence surface for communication provenance
  - linked document open-targets remain valid
- Feature 4:
  - connector/import/proposal creation and proposal acceptance refresh dashboard snapshots
  - dashboard snapshots now include communication provider counts, sync freshness, blockers, contradictions, and review pressure

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
- `src/modules/communications/providers/slack.provider.ts`
- `src/modules/communications/providers/gmail.provider.ts`
- `src/modules/communications/providers/outlook.provider.ts`
- `src/modules/communications/providers/teams.provider.ts`
- `src/modules/communications/providers/whatsapp-business.provider.ts`
- `src/lib/communications/credential-vault.ts`
- `src/lib/communications/oauth-state.ts`
- `src/lib/communications/microsoft-graph.ts`
- `src/lib/communications/provider-http.ts`

## Testing status

The repo now includes coverage for:

- manual import idempotency
- revision creation on message edits
- attachment metadata
- message indexing and classification enqueue
- message insight classification thresholds
- blocker insight no-proposal behavior
- dedupe/supersession against existing proposals
- Slack OAuth callback normalization
- Slack history/replies sync fixtures
- Slack webhook signature verification
- Gmail OAuth/token refresh and polling sync fixtures
- Gmail HTML cleanup and attachment metadata extraction
- Outlook OAuth callback and Graph sync fixtures
- Teams Graph sync fixtures
- WhatsApp challenge and inbound webhook fixtures
- OAuth callback connector bootstrap and initial backfill enqueue
- duplicate active sync reuse
- runtime connector lock handling
- provider rate-limit retry/backoff
- route-level callback/webhook contracts

## Rebuild reference

- `communication_layer_C1.md` documents the foundation build
- `communication_layer_C2.md` documents the intelligence/review build
- `communication_layer_C3.md` documents Slack/Gmail production connector work
- `communication_layer_C4.md` documents Outlook/Teams/WhatsApp and hardening work
