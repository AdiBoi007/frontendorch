# Communication Layer C3

## Purpose

This file is the implementation-grounded rebuild document for Build C3 of the Orchestra communication layer.

Use it if:
- the chat context is gone
- C4 needs to extend Slack/Gmail provider work
- the repo must be rebuilt from the communication layer docs alone

C3 is the provider-integration and security build. It sits on top of:
- `communication_layer_C1.md`
- `communication_layer_C2.md`

## What C3 added

C3 added:
- production-safe credential storage behind `CredentialVault`
- signed one-time OAuth state handling
- Slack OAuth
- Slack history/replies sync
- Slack webhook verification and dedupe
- Gmail OAuth
- Gmail polling/manual incremental sync
- provider cursor advancement during sync
- connector sync job hardening around credentials, ingestion, cursor advancement, and revocation

C3 did **not** add:
- Outlook
- Teams
- WhatsApp live ingestion
- Gmail push/watch webhook handling
- outbound messaging

## Files added or materially changed

### New or materially rewritten code

- `src/lib/communications/credential-vault.ts`
- `src/lib/communications/oauth-state.ts`
- `src/modules/communications/providers/provider.interface.ts`
- `src/modules/communications/providers/slack.provider.ts`
- `src/modules/communications/providers/gmail.provider.ts`
- `src/modules/communications/connectors.service.ts`
- `src/modules/communications/sync.service.ts`

### Existing code patched

- `src/config/env.ts`
- `.env.example`
- `src/app/build-app.ts`
- `src/types/fastify.d.ts`
- `src/modules/communications/communications.service.ts`
- `src/modules/communications/communications.routes.ts`
- `src/modules/communications/schemas.ts`
- `src/modules/communications/message-ingestion.service.ts`
- `src/lib/communications/provider-types.ts`
- `src/setup-context.ts`
- `feature5.md`
- `communication_layer.md`
- `docs/API_SPEC.md`
- `docs/ENV_AND_DEPLOYMENT.md`

### Tests added or updated

- `tests/communication-providers.test.ts`
- `tests/routes.test.ts`
- `tests/communications-service.test.ts`

## Environment and config added in C3

Added in `src/config/env.ts` and `.env.example`:

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_REDIRECT_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_PUBSUB_TOPIC`
- `CONNECTOR_CREDENTIAL_VAULT_MODE`
- `CONNECTOR_OAUTH_STATE_SECRET`
- `CONNECTOR_SYNC_BATCH_SIZE`
- `CONNECTOR_SYNC_MAX_BACKFILL_DAYS`

### Env rules implemented

- partial Slack/Google OAuth config is rejected
- production rejects `CONNECTOR_CREDENTIAL_VAULT_MODE=memory`
- production rejects default-like `CONNECTOR_OAUTH_STATE_SECRET`

## CredentialVault implementation

### File

- `src/lib/communications/credential-vault.ts`

### Interface

- `putCredential`
- `getCredential`
- `revokeCredential`

### Modes

- `memory`
  - dev/test only
  - rejected in production
- `encrypted_file`
  - current production-safe mode in repo
  - stores encrypted envelopes under:
    - `./.vault/connectors/`

### Storage behavior

- `communication_connectors.credentials_ref` stores only a vault ref
- live Slack/Gmail credentials are never stored in Prisma token columns
- the file payload is AES-256-GCM encrypted
- encryption key is derived from `CONNECTOR_OAUTH_STATE_SECRET`

### Important implementation detail

Refs are sanitized for filesystem safety. This fixed a Windows path bug during C3 testing.

## OAuth state implementation

### File

- `src/lib/communications/oauth-state.ts`

### State format

The callback state is:

`base64url(payload) + "." + hex_hmac_signature`

Payload fields:
- `nonce`
- `provider`
- `projectId`
- `issuedAt`

### Persistence

The DB row lives in `oauth_states` and stores:
- org
- project
- provider
- actor user
- `nonce_hash`
- expiry
- `used_at`

### Verification rules

1. signature must verify against `CONNECTOR_OAUTH_STATE_SECRET`
2. payload provider must match callback route
3. `oauth_states` row must exist
4. state must not be expired
5. state must not already be used

## Raw-body webhook handling

### File

- `src/app/build-app.ts`

### What changed

The app now registers a JSON content-type parser with `parseAs: "string"` and stores `request.rawBody`.

This was necessary because Slack signatures must be calculated over the exact raw request body, not a reserialized JSON object.

### Fastify typing

- `src/types/fastify.d.ts`
  - added `rawBody?: string`

## Provider interface changes

### File

- `src/modules/communications/providers/provider.interface.ts`

### New responsibilities

Each provider adapter can now:
- start OAuth
- handle OAuth callback
- verify webhooks
- sync using credentials/cursors/config
- optionally revoke provider-side auth

The sync result can now return:
- normalized batches
- cursor updates
- deleted message ids
- refreshed credentials
- sync summary

## Slack provider

### File

- `src/modules/communications/providers/slack.provider.ts`

### Implemented methods

- `connect`
- `handleOAuthCallback`
- `sync`
- `verifyWebhook`
- `revoke`

### OAuth behavior

Uses Slack OAuth v2 authorize URL with:
- `client_id`
- `scope`
- `redirect_uri`
- `state`

Scopes used:
- `channels:read`
- `channels:history`
- `groups:read`
- `groups:history`

Callback exchanges the code via:
- `oauth.v2.access`

Credential envelope stores:
- `accessToken`
- `scope`
- `teamId`
- `teamName`
- `authedUserId`
- `botUserId`

### Slack connector config shape used in repo

```json
{
  "channelIds": ["C123"],
  "includeBotMessages": false,
  "backfillDays": 30,
  "teamId": "T123",
  "teamName": "Arrayah"
}
```

### Sync behavior

Backfill/manual/incremental sync:
- loads configured channel ids
- calls `conversations.history`
- fetches thread replies using `conversations.replies`
- normalizes one batch across the fetched channels
- advances per-channel latest-ts cursor only after persistence

### Slack message normalization rules

- provider thread id:
  - root `thread_ts` or `ts`
- provider message id:
  - exact `ts`
- channel id stored in raw metadata
- thread subject:
  - synthetic `Slack <channelId> thread`
- edits:
  - current body re-ingested
  - revision creation handled by the generic ingestion service
- deletes:
  - webhook sync returns `deletedProviderMessageIds`
  - sync service marks `isDeletedByProvider=true`

### Slack webhook behavior

Route:
- `POST /v1/webhooks/slack`

Behavior:
- verifies `x-slack-request-timestamp`
- verifies `x-slack-signature`
- rejects stale timestamps
- supports `url_verification`
- dedupes `event_id` in `provider_webhook_events`
- finds matching connectors by provider + stored team/channel config
- enqueues `sync_communication_connector` with `syncType=webhook`

Heavy processing is not done inline.

## Gmail provider

### File

- `src/modules/communications/providers/gmail.provider.ts`

### Implemented methods

- `connect`
- `handleOAuthCallback`
- `sync`
- `revoke`

### OAuth behavior

Uses Google OAuth with:
- `client_id`
- `redirect_uri`
- `response_type=code`
- `scope=https://www.googleapis.com/auth/gmail.readonly`
- `access_type=offline`
- `prompt=consent`
- `state`

Callback exchanges the code at:
- `https://oauth2.googleapis.com/token`

Then fetches Gmail profile:
- `users/me/profile`

Credential envelope stores:
- `accessToken`
- `refreshToken`
- `expiryDate`
- `emailAddress`
- `tokenType`
- `scope`

### Gmail connector config shape used in repo

```json
{
  "query": "label:client-project",
  "labelIds": ["INBOX"],
  "backfillDays": 30,
  "includeAttachmentsMetadata": true,
  "emailAddress": "client@example.com"
}
```

### Sync behavior

Current repo implementation uses polling/manual sync, not watch delivery.

Backfill/manual path:
- lists thread ids using Gmail query + label ids + `after:`
- fetches full threads via `users/threads/get`

Incremental path:
- if `historyId` exists and no custom query is configured, uses `users/history`
- otherwise falls back to a query-based incremental pass using last seen internal date

### Gmail normalization rules

- provider thread id:
  - exact Gmail `threadId`
- provider message id:
  - exact Gmail `id`
- `sentAt`:
  - `internalDate`
- participants:
  - parsed from `From`, `To`, `Cc`, `Bcc`
- body text:
  - prefer `text/plain`
  - otherwise convert `text/html` using `htmlToText`
- body html:
  - preserved when present
- attachments:
  - metadata only in C3
- refreshed access tokens:
  - returned through `updatedCredential`
  - written back through `CredentialVault` by the sync service

## Connectors service changes

### File

- `src/modules/communications/connectors.service.ts`

### New responsibilities in C3

- create signed OAuth state rows
- start Slack/Gmail OAuth
- handle Slack/Gmail callbacks
- store credentials through `CredentialVault`
- create or update connected connectors after callback
- enqueue initial backfill sync
- verify and dedupe Slack webhooks
- map webhook events to matching connectors

### Routes now served through this service

- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `GET /v1/oauth/slack/callback`
- `GET /v1/oauth/google/callback`
- `POST /v1/webhooks/slack`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`

## Sync service changes

### File

- `src/modules/communications/sync.service.ts`

### New responsibilities in C3

- internal enqueue path for callbacks/webhooks
- active sync-run reuse for duplicate manager sync requests
- revoked connector blocking
- load credentials from `CredentialVault`
- call provider adapter sync
- ingest normalized batches through `MessageIngestionService`
- mark deleted provider messages
- write refreshed credentials back to the vault
- advance connector cursor only after persistence
- update connector status to `connected` or `error`
- write sync summaries into `communication_sync_runs`
- emit audit events and dashboard refreshes

### Idempotency and concurrency behavior

- duplicate manager sync requests reuse an active `queued|running` sync run
- evidence-layer upserts still protect against message duplication
- webhook events are deduped before sync enqueue

## Message ingestion fix made during C3

### File

- `src/modules/communications/message-ingestion.service.ts`

### Fix

Indexing jobs were previously keyed using `syncRunId` instead of the message `bodyHash`.

C3 changed indexing enqueue to use:
- `jobKeys.indexCommunicationMessage(messageId, bodyHash)`

This matters because provider re-syncs and edits must enqueue indexing/classification based on content identity, not arbitrary sync-run identity.

## Route surface after C3

### New unauthenticated callback/webhook routes

- `GET /v1/oauth/slack/callback`
- `GET /v1/oauth/google/callback`
- `POST /v1/webhooks/slack`

### Existing connector routes now backed by live provider behavior

- `POST /v1/projects/:projectId/connectors/slack/connect`
- `POST /v1/projects/:projectId/connectors/gmail/connect`
- `POST /v1/projects/:projectId/connectors/:connectorId/sync`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`

## Tests added in C3

### File

- `tests/communication-providers.test.ts`

### Coverage

- vault encryption/reference behavior
- Slack OAuth URL generation and callback exchange
- Slack history + replies sync fixtures
- Slack webhook signature verification and `url_verification`
- Gmail token refresh + polling sync
- Gmail HTML cleanup
- Gmail attachment metadata extraction
- OAuth callback storing credentials and queuing initial backfill
- duplicate active sync reuse

### Existing tests updated

- `tests/routes.test.ts`
  - callback/webhook route contracts
  - env additions in mocked app context
- `tests/communications-service.test.ts`
  - classification job enqueue after indexing

## Commands run during C3

- `npm run build`
- `npm test`

After implementation, the repo reached:
- 19 test files passing
- 147 tests passing

## Intentional limitations after C3

- no Outlook / Teams / WhatsApp live providers yet
- no Gmail push/watch notification ingestion yet
- no provider-side outbound send/reply flows
- no shared-inbox or CRM behavior
- Slack webhook routing currently matches connectors by stored team/channel config
- Gmail connector currently uses polling/manual incremental sync as the safe default

## Recommended C4 starting points

If you build C4 next, start from these paths:

- `src/modules/communications/providers/outlook.provider.ts`
- `src/modules/communications/providers/teams.provider.ts`
- `src/modules/communications/providers/whatsapp-business.provider.ts`
- `src/modules/communications/connectors.service.ts`
- `src/modules/communications/sync.service.ts`
- `communication_layer.md`
- `feature5.md`

## Final C3 rule

Do not bypass `CredentialVault`, do not bypass OAuth state verification, and do not let provider syncs mutate or erase original message evidence.
