# Communication Connectors Runbook

## Scope

This runbook covers the currently implemented production connector paths in Orchestra:

- Slack
- Gmail
- Outlook
- Microsoft Teams
- WhatsApp Business inbound
- manual import

It focuses on setup, callback/webhook routing, sync troubleshooting, revocation, and safe backfills.

## Required environment

Slack:
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_REDIRECT_URI`

Google:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Microsoft:
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_TENANT_ID`

Connector security:
- `CONNECTOR_CREDENTIAL_VAULT_MODE`
- `CONNECTOR_OAUTH_STATE_SECRET`
- `CONNECTOR_SYNC_BATCH_SIZE`
- `CONNECTOR_SYNC_MAX_BACKFILL_DAYS`

WhatsApp:
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` optional but recommended
- `WHATSAPP_READINESS_MODE`

## Callback and webhook URLs

Use environment-specific HTTPS URLs in staging/production.

OAuth callbacks:
- Slack: `/v1/oauth/slack/callback`
- Gmail: `/v1/oauth/google/callback`
- Microsoft: `/v1/oauth/microsoft/callback`

Webhooks:
- Slack: `/v1/webhooks/slack`
- Outlook: `/v1/webhooks/outlook`
- Teams: `/v1/webhooks/teams`
- WhatsApp verify: `GET /v1/webhooks/whatsapp-business`
- WhatsApp inbound: `POST /v1/webhooks/whatsapp-business`

## Vault rules

- Never store raw provider tokens in Prisma rows.
- `communication_connectors.credentials_ref` is a vault pointer only.
- Production must use `CONNECTOR_CREDENTIAL_VAULT_MODE=encrypted_file`.
- `memory` mode is dev/test only.

## Safe connect flow

1. Manager calls `POST /v1/projects/:projectId/connectors/:provider/connect`.
2. Orchestra creates signed one-time OAuth state where applicable.
3. Provider redirects back to Orchestra callback.
4. Orchestra verifies and consumes state.
5. Credentials are written through `CredentialVault`.
6. Initial backfill sync is enqueued.

## Safe sync flow

1. Manager triggers manual sync or webhook enqueue occurs.
2. `sync_communication_connector` checks for revoked connector.
3. Runtime lock rejects concurrent active sync for the same connector.
4. Provider credentials load from `CredentialVault`.
5. Provider adapter syncs and returns normalized batches.
6. Ingestion persists threads/messages/revisions/attachments.
7. Indexing and classification continue through existing jobs.
8. Cursor advances only after persistence succeeds.
9. Dashboard refresh is enqueued.

## Rate-limit handling

- Provider adapters throw `communication_provider_rate_limited` with `retryAfterMs`.
- Sync service retries provider sync up to 3 times.
- Retry delay honors provider `Retry-After` where available.
- Metrics:
  - `communication_provider_rate_limited_total`
  - `communication_sync_duration_ms`
  - `communication_sync_failures_total`

## Troubleshooting

### Connector stuck in `error`
- Inspect `lastError` on connector detail.
- Inspect `communication_sync_runs` for recent failures.
- Re-run manual sync after fixing provider config.

### Duplicate syncs
- Expected behavior is suppression/partial skip.
- Check sync run summary for `reason: "connector_locked"`.

### Webhook accepted but no new messages
- Check `provider_webhook_events` for dedupe status.
- Verify connector config matches the inbound channel/folder/phone number.
- For WhatsApp, confirm inbound event is a `messages` event, not only `statuses`.

### Revocation
- Use `POST /v1/projects/:projectId/connectors/:connectorId/revoke`.
- Historical evidence stays intact.
- Revoked connectors cannot sync until reconnected.

## Safe backfills

- Backfills are bounded by `CONNECTOR_SYNC_MAX_BACKFILL_DAYS`.
- Re-running backfill is safe because message upserts are idempotent.
- Message edits create revisions instead of overwriting original evidence.

## Provider notes

### Outlook
- Thread id uses `conversationId` when present.
- Message id uses Graph message id.
- Attachments are metadata-only.

### Microsoft Teams
- Thread id uses `teamId:channelId:rootMessageId`.
- Message id uses `teamId:channelId:messageId`.
- Replies remain in the same normalized thread.

### WhatsApp Business
- Readiness-gated by `WHATSAPP_READINESS_MODE`.
- Webhook-first only in current implementation.
- Status events do not create user messages.
