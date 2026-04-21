# Orchestra Communication Layer C4

## Purpose

This document is the implementation-grounded rebuild and handoff reference for Build C4 of the Orchestra communication layer.

Use it when:
- rebuilding C4 from scratch
- auditing the communication connector stack
- implementing later builds on top of C4
- troubleshooting provider sync or webhook behavior

This file assumes C1, C2, and C3 already exist and focuses on what C4 added or hardened.

## C4 scope

C4 delivered:

1. Outlook connector via Microsoft Graph
2. Microsoft Teams connector via Microsoft Graph
3. WhatsApp Business inbound/webhook support behind a readiness gate
4. provider sync locking and retry/backoff hardening
5. webhook hardening across providers
6. observability/metrics/logging completion for communication sync/webhook flows
7. dashboard communication-summary integration
8. provider fixture tests and route tests
9. connector setup/runbook documentation

It did **not** add:
- Outlook outbound messaging
- Teams outbound messaging
- WhatsApp outbound send
- Gmail watch push delivery
- provider subscription lifecycle automation beyond callback/webhook-readiness scaffolding

## Files changed for C4

Core code:

- `src/config/env.ts`
- `.env.example`
- `src/lib/communications/provider-types.ts`
- `src/modules/communications/providers/provider.interface.ts`
- `src/lib/communications/microsoft-graph.ts`
- `src/lib/communications/provider-http.ts`
- `src/modules/communications/providers/outlook.provider.ts`
- `src/modules/communications/providers/teams.provider.ts`
- `src/modules/communications/providers/whatsapp-business.provider.ts`
- `src/modules/communications/communications.service.ts`
- `src/modules/communications/connectors.service.ts`
- `src/modules/communications/sync.service.ts`
- `src/modules/communications/communications.routes.ts`
- `src/modules/communications/schemas.ts`
- `src/modules/dashboard/service.ts`

Tests:

- `tests/communication-providers.test.ts`
- `tests/routes.test.ts`
- `tests/dashboard-service.test.ts`

Docs:

- `communication_layer.md`
- `docs/API_SPEC.md`
- `docs/ENV_AND_DEPLOYMENT.md`
- `docs/COMMUNICATION_CONNECTORS_RUNBOOK.md`
- `feature5.md`
- `communication_layer_C4.md`

## Environment and config added in C4

Microsoft:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_TENANT_ID`

WhatsApp:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_READINESS_MODE`

Existing connector hardening:

- `CONNECTOR_CREDENTIAL_VAULT_MODE`
- `CONNECTOR_OAUTH_STATE_SECRET`
- `CONNECTOR_SYNC_BATCH_SIZE`
- `CONNECTOR_SYNC_MAX_BACKFILL_DAYS`

## Shared abstractions introduced or extended

### 1. `src/lib/communications/microsoft-graph.ts`

This file centralizes Microsoft OAuth/token and Graph HTTP behavior.

Exports:

- `buildMicrosoftOAuthUrl`
- `exchangeMicrosoftCode`
- `refreshMicrosoftAccessToken`
- `callMicrosoftGraph`
- `MicrosoftCredential` type

Behavior:

- uses Microsoft v2.0 OAuth endpoints
- exchanges authorization code for access/refresh token
- refreshes access token when expired
- sends bearer-authenticated Graph requests
- reuses generic provider error helpers for API failures

### 2. `src/lib/communications/provider-http.ts`

This file centralizes provider API error creation and retry-after parsing.

Exports:

- `parseRetryAfterMs`
- `providerRateLimitError`
- `providerApiError`

Purpose:

- allow adapters to surface rate-limit errors consistently
- give `SyncService` a single `communication_provider_rate_limited` contract

### 3. Provider interface change

`ProviderSyncResult` now supports:

- `status?: "completed" | "partial"`

`verifyWebhook` input now supports:

- `query?: Record<string, string | string[] | undefined>`

This was needed because:
- Microsoft and WhatsApp verification use query-string challenge tokens
- sync jobs need a provider-reported partial status when work is intentionally skipped or only partially complete

## Outlook provider

File:
- `src/modules/communications/providers/outlook.provider.ts`

### Implemented methods

- `connect`
- `handleOAuthCallback`
- `sync`
- `verifyWebhook`
- `revoke`

### OAuth

Scopes:

- `offline_access`
- `openid`
- `profile`
- `https://graph.microsoft.com/Mail.Read`

Connect behavior:

- requires signed OAuth state
- returns redirect URL built by `buildMicrosoftOAuthUrl`
- seeds default config:
  - `folderIds: ["Inbox"]`
  - `query: ""`
  - `backfillDays`
  - `includeAttachmentsMetadata: true`

Callback behavior:

- exchanges code through Microsoft OAuth token endpoint
- fetches `/me?$select=id,displayName,userPrincipalName`
- stores credential fields:
  - access token
  - refresh token
  - expiry date
  - account label
  - Graph user id
- returns provider cursor:
  - `latestReceivedDateTime`
  - `deltaLink`

### Sync

Inputs:

- project id
- connector
- credential
- sync type
- batch size
- max backfill days

Behavior:

- refreshes token if expiring within 60 seconds
- parses connector config and cursor
- for incremental sync with existing `deltaLink`, uses Graph delta endpoint
- otherwise performs bounded backfill from configured mail folders
- stores metadata-only attachments
- normalizes messages using:
  - `providerThreadId = conversationId || id`
  - `providerMessageId = id`
- HTML body goes through `htmlToText`
- response includes:
  - normalized batches
  - updated cursor
  - updated credential if refresh occurred
  - summary

### Webhook verification

Behavior:

- if query includes `validationToken`, returns immediate 200 with the raw token
- otherwise treats body as Graph notification list
- derives connector ids from `clientState`
- builds provider event id from `subscriptionId:resourceData.id` when present

## Microsoft Teams provider

File:
- `src/modules/communications/providers/teams.provider.ts`

### Implemented methods

- `connect`
- `handleOAuthCallback`
- `sync`
- `verifyWebhook`
- `revoke`

### OAuth

Scopes:

- `offline_access`
- `openid`
- `profile`
- `https://graph.microsoft.com/Channel.ReadBasic.All`
- `https://graph.microsoft.com/ChannelMessage.Read.All`
- `https://graph.microsoft.com/Team.ReadBasic.All`

Connect behavior:

- requires signed OAuth state
- returns Microsoft OAuth URL
- seeds default config:
  - `teams: []`
  - `backfillDays`
  - `includeBotMessages`

### Sync

Config contract:

```json
{
  "teams": [
    {
      "teamId": "team-1",
      "channelIds": ["channel-1"]
    }
  ],
  "backfillDays": 30,
  "includeBotMessages": false
}
```

Behavior:

- refreshes token if expiring within 60 seconds
- exits cleanly with zero-count summary when no teams/channels are configured
- fetches channel root messages
- fetches replies for each root message
- skips bot/application messages when `includeBotMessages=false`
- skips deleted messages
- normalizes:
  - `providerThreadId = teamId:channelId:rootMessageId`
  - `providerMessageId = teamId:channelId:messageId`
- thread cursor stored as:
  - `channels[teamId:channelId].latestCreatedDateTime`
- incremental/manual syncs use cursor to ignore older messages

### Webhook verification

Behavior mirrors Outlook Graph notifications:

- immediate `validationToken` echo when present
- otherwise extracts connector ids from `clientState`
- creates provider event id from notification metadata where possible

## WhatsApp Business provider

File:
- `src/modules/communications/providers/whatsapp-business.provider.ts`

### Implemented methods

- `connect`
- `sync`
- `verifyWebhook`
- `revoke`

### Readiness gate

Environment:

- `WHATSAPP_READINESS_MODE=disabled | webhook_inbound`

Connect behavior:

- if mode is `webhook_inbound`, connector status becomes `connected`
- otherwise connector remains `pending_auth`
- config defaults:
  - `phoneNumberIds: []`
  - `readinessMode`
  - `includeMediaMetadata: true`

### Webhook verification

GET verification:

- validates `hub.verify_token`
- returns `hub.challenge`

POST verification:

- optionally verifies `x-hub-signature-256` using `WHATSAPP_APP_SECRET`
- finds connectors by matching configured `phoneNumberIds`
- derives event id from:
  - first inbound message id, or
  - first status id, or
  - fallback `phoneNumberId:timestamp`

### Sync behavior

WhatsApp is webhook-first in C4.

- non-webhook sync types return a safe no-op summary
- webhook sync takes already-verified webhook payload
- status-only events do not create user messages
- inbound `messages` array is normalized into a single provider-agnostic batch

Normalization rules:

- `providerMessageId = message.id`
- `providerThreadId = conversation.id || phoneNumberId:wa_id`
- attachments metadata only for image/video/audio/document
- no outbound send

## Connector service changes

File:
- `src/modules/communications/connectors.service.ts`

### New behavior

1. Dynamic Microsoft callback dispatch:
   - `handleOAuthCallbackFromState(query, ["outlook", "microsoft_teams"])`
   - verifies signed state first
   - ensures only allowed providers can use the shared endpoint

2. Webhook verification now receives query params:
   - required for Graph `validationToken`
   - required for WhatsApp challenge flow

3. Redirect resolution:
   - supports Outlook and Teams through `MICROSOFT_REDIRECT_URI`

4. Telemetry:
   - `communication_connectors_total`
   - `communication_webhook_events_total`
   - `communication_webhook_duplicates_total`

## Sync service hardening

File:
- `src/modules/communications/sync.service.ts`

### C4 changes

1. Runtime connector lock:
   - before doing heavy sync work, checks for another `running` sync on the same connector
   - if found:
     - current sync run is marked `partial`
     - summary contains:
       - `skipped: true`
       - `reason: "connector_locked"`
       - `competingSyncRunId`
     - job run completes cleanly instead of double-syncing

2. Provider rate-limit retry:
   - provider sync wrapped in `runProviderSyncWithRetry`
   - retries up to 3 times
   - only retries `communication_provider_rate_limited`
   - uses `retryAfterMs` from provider error details

3. Partial status propagation:
   - if provider returns `status: "partial"`, sync run persists as partial

4. Telemetry:
   - `communication_sync_runs_total`
   - `communication_sync_duration_ms`
   - `communication_sync_failures_total`
   - `communication_provider_rate_limited_total`

## Route changes

File:
- `src/modules/communications/communications.routes.ts`

### Added routes

- `GET /v1/oauth/microsoft/callback`
- `POST /v1/webhooks/outlook`
- `POST /v1/webhooks/teams`
- `GET /v1/webhooks/whatsapp-business`
- `POST /v1/webhooks/whatsapp-business`

### Route behavior

- Slack webhook route now forwards query params too
- webhook POST body size is limited to 1 MB on these routes
- heavy work still stays async through connector/sync services

## Dashboard integration

File:
- `src/modules/dashboard/service.ts`

### C4 communication summary model

Added `CommunicationSummary` to project cards and project dashboard payloads:

- `connectedProviders`
- `providerCount`
- `lastSyncedAt`
- `insightCount`
- `needsReviewCount`
- `blockerCount`
- `contradictionCount`
- `connectorStatuses`

General dashboard summary now aggregates:

- total connected provider count
- total needs-review insight count
- total blocker count
- total contradiction count
- latest communication sync timestamp

Attention scoring now incorporates:

- communication insights needing review
- communication blockers
- unresolved contradictions

## Test coverage added or updated

File:
- `tests/communication-providers.test.ts`

Added:

- Outlook OAuth callback fixture
- Outlook message sync fixture
- Teams sync fixture
- WhatsApp challenge verification fixture
- WhatsApp inbound normalization fixture
- connector lock partial-skip behavior
- provider rate-limit retry behavior

File:
- `tests/routes.test.ts`

Added:

- Microsoft callback route coverage
- Outlook webhook route coverage
- Teams webhook route coverage
- WhatsApp challenge route coverage
- WhatsApp inbound webhook route coverage

File:
- `tests/dashboard-service.test.ts`

Updated:

- fixtures for new `communicationConnectors` / `messageInsights`
- snapshot payload expectations for new `summary.communication`

## Verification commands used

- `npm run build`
- `npm test`

`prisma validate` still requires `DATABASE_URL` in the environment; C4 did not change that requirement.

## Operational notes

### Secrets

- never log access tokens or refresh tokens
- never return provider secrets or `credentialsRef` to clients
- use `CredentialVault` only

### Revocation

- revocation changes connector status to `revoked`
- historical evidence remains queryable
- revoked connectors cannot sync

### Manual sync

- remains available for all providers
- safe no-op summary for WhatsApp because inbound flow is webhook-first

### Webhook strategy

- webhooks return quickly
- verification/dedupe happens before queueing
- heavy normalization/indexing/classification continues through jobs/services

## Known deferred items after C4

- Gmail push/watch delivery
- Outlook/Teams subscription renewal management
- WhatsApp outbound send/reply
- provider-wide org sync beyond explicit scoped config
- live infra verification against real Microsoft/Meta tenants

## How to continue in C5+

If building the next communication build:

1. Treat C4 as the connector-security and provider-hardening baseline.
2. Do not bypass `CredentialVault`, OAuth state verification, or runtime connector locking.
3. Extend provider-specific lifecycle automation on top of the existing shared connector model.
4. Keep WhatsApp webhook-first and provider-agnostic.
5. Preserve the same downstream contracts into Product Brain, Viewer, Socrates, and Dashboard.
