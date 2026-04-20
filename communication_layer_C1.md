# Orchestra Communication Layer C1

## Purpose

This file is the implementation-grounded rebuild document for Build C1 of the Orchestra communication layer.

It is intentionally more detailed than `feature5.md`. Its purpose is:

- to preserve exactly what C1 built
- to let a future coding agent rebuild C1 without chat history
- to give Build C2 a precise baseline for what already exists

Read this together with:

- `communication_layer.md`
- `feature1.md`
- `feature2.md`
- `feature3.md`
- `feature4.md`
- `docs/DATA_MODEL.md`
- `docs/API_SPEC.md`

If those docs drift, treat this file as the source of truth for the **implemented** C1 scope.

## 1. C1 scope implemented in this repo

C1 implemented these fourteen items:

1. communication schema hardening
2. provider-agnostic connector model
3. sync run model
4. webhook event dedupe model
5. message revision model
6. attachment metadata model
7. `manual_import` provider
8. manager-only manual import route
9. timeline/thread/message APIs
10. message chunking/indexing for imported messages
11. Socrates retrieval compatibility for imported messages
12. Doc Viewer message evidence compatibility
13. Dashboard refresh hooks for communication events
14. tests and docs updates

Not built in C1:

- Slack OAuth
- Gmail OAuth
- Outlook OAuth
- Teams OAuth
- WhatsApp live webhook integration
- message insight classification
- automatic proposal generation from messages
- outbound reply/send behavior

## 2. Product invariants preserved

These were preserved explicitly during implementation:

- messages remain immutable source evidence
- changed messages create revision rows
- `bodyText` is not silently overwritten without revision capture
- no provider-specific primary storage tables were introduced
- provider tokens are not stored in plaintext in relational rows
- ingestion paths are idempotent
- server-side authz enforces manager/dev/client rules
- clients are blocked from internal communication by default
- Product Brain / Socrates / Live Doc Viewer / Dashboard behavior remains intact

## 3. Files added or changed

### Prisma

- `prisma/schema.prisma`
- `prisma/migrations/0008_communication_layer_c1/migration.sql`

### Communication helpers

- `src/lib/communications/provider-types.ts`
- `src/lib/communications/provider-normalized-types.ts`
- `src/lib/communications/idempotency.ts`
- `src/lib/communications/html-to-text.ts`
- `src/lib/communications/message-contextualize.ts`
- `src/lib/communications/sync-cursors.ts`
- `src/lib/communications/credential-vault.ts`
- `src/lib/communications/webhook-verification.ts`

### Communication module

- `src/modules/communications/authz.ts`
- `src/modules/communications/schemas.ts`
- `src/modules/communications/communications.routes.ts`
- `src/modules/communications/communications.service.ts`
- `src/modules/communications/connectors.service.ts`
- `src/modules/communications/sync.service.ts`
- `src/modules/communications/timeline.service.ts`
- `src/modules/communications/message-normalizer.service.ts`
- `src/modules/communications/message-ingestion.service.ts`
- `src/modules/communications/message-indexing.service.ts`
- `src/modules/communications/providers/provider.interface.ts`
- `src/modules/communications/providers/manual.provider.ts`
- `src/modules/communications/providers/slack.provider.ts`
- `src/modules/communications/providers/gmail.provider.ts`
- `src/modules/communications/providers/outlook.provider.ts`
- `src/modules/communications/providers/teams.provider.ts`
- `src/modules/communications/providers/whatsapp-business.provider.ts`

### Existing core files patched

- `src/app/build-app.ts`
- `src/setup-context.ts`
- `src/worker.ts`
- `src/types/index.ts`
- `src/lib/jobs/types.ts`
- `src/lib/jobs/keys.ts`
- `src/lib/retrieval/hybrid.ts`
- `src/modules/documents/routes.ts`
- `src/modules/documents/schemas.ts`

### Docs/tests

- `docs/DATA_MODEL.md`
- `docs/API_SPEC.md`
- `communication_layer.md`
- `feature5.md`
- `communication_layer_C1.md`
- `tests/communications-schemas.test.ts`
- `tests/communications-service.test.ts`
- `tests/routes.test.ts`
- `tests/socrates-hybrid.test.ts`
- `tests/socrates-routes.test.ts`

## 4. Prisma schema changes in detail

### 4.1 Enums added/finalized

#### `CommunicationProvider`
- `manual_import`
- `slack`
- `gmail`
- `outlook`
- `microsoft_teams`
- `whatsapp_business`

#### `CommunicationConnectorStatus`
- `pending_auth`
- `connected`
- `syncing`
- `error`
- `revoked`

#### `CommunicationSyncType`
- `manual`
- `webhook`
- `backfill`
- `incremental`

#### `CommunicationSyncStatus`
- `queued`
- `running`
- `completed`
- `partial`
- `failed`

#### `CommunicationMessageType`
- `user`
- `system`
- `bot`
- `file_share`
- `note`
- `other`

#### `AttachmentStorageStatus`
- `metadata_only`
- `stored`
- `extraction_pending`
- `extracted`
- `failed`

#### `WebhookEventStatus`
- `received`
- `ignored_duplicate`
- `queued`
- `processed`
- `failed`

### 4.2 `CommunicationConnector`

Fields:

- `id`
- `projectId`
- `provider`
- `accountLabel`
- `status`
- `credentialsRef`
- `configJson`
- `providerCursorJson`
- `lastSyncedAt`
- `lastError`
- `createdBy`
- `createdAt`
- `updatedAt`

Relations:

- `project`
- `creator`
- `syncRuns`
- `threads`
- `messages`
- `messageRevisions`
- `attachments`
- `messageChunks`
- `webhookEvents`

Constraints/indexes:

- unique `(projectId, provider)`
- index `(projectId, status)`

### 4.3 `CommunicationSyncRun`

Fields:

- `id`
- `connectorId`
- `projectId`
- `provider`
- `syncType`
- `status`
- `cursorBeforeJson`
- `cursorAfterJson`
- `summaryJson`
- `errorMessage`
- `startedAt`
- `finishedAt`
- `createdAt`

Indexes:

- `(connectorId, createdAt desc)`
- `(projectId, status)`

### 4.4 `OAuthState`

Fields:

- `id`
- `orgId`
- `projectId`
- `provider`
- `actorUserId`
- `nonceHash`
- `redirectAfter`
- `expiresAt`
- `usedAt`
- `createdAt`

Relations:

- `Organization.oauthStates`
- `Project.oauthStates`
- `User.oauthStates`

### 4.5 `ProviderWebhookEvent`

Fields:

- `id`
- `provider`
- `providerEventId`
- `connectorId`
- `projectId`
- `eventType`
- `rawPayloadHash`
- `status`
- `receivedAt`
- `processedAt`
- `createdAt`

Constraint:

- unique `(provider, providerEventId)`

### 4.6 `CommunicationThread` hardening

Added:

- `connectorId`
- `provider`
- `normalizedSubject`
- `threadUrl`
- `rawMetadataJson`

Constraint changed:

- old uniqueness became unique `(connectorId, providerThreadId)`

Indexes:

- `(projectId, provider, lastMessageAt desc)`
- `(connectorId, lastMessageAt desc)`

### 4.7 `CommunicationMessage` hardening

Added:

- `connectorId`
- `provider`
- `providerPermalink`
- `senderEmail`
- `bodyHash`
- `isEdited`
- `isDeletedByProvider`

Constraint changed:

- unique `(connectorId, providerMessageId)`

New relations:

- `connector`
- `revisions`
- `attachments`

### 4.8 `CommunicationMessageRevision`

Fields:

- `messageId`
- `projectId`
- `connectorId`
- `provider`
- `revisionIndex`
- `bodyText`
- `bodyHtml`
- `bodyHash`
- `rawMetadataJson`
- `editedAt`
- `createdAt`

Constraint:

- unique `(messageId, revisionIndex)`

### 4.9 `CommunicationAttachment`

Fields:

- `messageId`
- `projectId`
- `connectorId`
- `provider`
- `providerAttachmentId`
- `filename`
- `mimeType`
- `fileSize`
- `providerUrl`
- `storageStatus`
- `fileKey`
- `extractionText`
- `rawMetadataJson`
- `createdAt`

Constraint:

- unique `(messageId, providerAttachmentId)`

### 4.10 `CommunicationMessageChunk` hardening

Added:

- `threadId`
- `connectorId`
- `provider`
- `contextualContent`
- `lexicalContent`

Indexes:

- unique `(messageId, chunkIndex)`
- `(projectId, provider, threadId)`
- vector and lexical indexes created in SQL migration

## 5. Migration `0008_communication_layer_c1`

This migration does four things:

1. creates the new enums and tables
2. hardens existing communication tables with provider/connector/body-hash fields
3. backfills legacy rows into per-project `manual_import` connectors
4. recreates indexes for retrieval and timeline access

### Backfill rules

For each project with legacy communication rows but no connector:

- create a `communication_connectors` row with:
  - `provider = manual_import`
  - `status = connected`
  - `account_label = 'Manual import'`
- assign `connector_id` on existing threads/messages/chunks
- assign `provider = manual_import`
- compute `body_hash` from existing `body_text` / `body_html`

This is why existing evidence survives C1 safely.

## 6. Provider abstraction

### Interface

Every provider adapter follows `provider.interface.ts`.

Core methods:

- `connect(...)`
- `sync(...)`
- `normalizeImport(...)`

### `manual.provider.ts`

Implemented fully:

- `connect()` returns connected state immediately
- `sync()` returns no-op summary
- `normalizeImport()` validates with `manualImportBodySchema`

### Stub providers

These exist and intentionally return not implemented behavior:

- `slack.provider.ts`
- `gmail.provider.ts`
- `outlook.provider.ts`
- `teams.provider.ts`
- `whatsapp-business.provider.ts`

This was deliberate so C2/C3 can add provider logic without redesigning the module shape.

## 7. Credential vault

### Implementation

`src/lib/communications/credential-vault.ts`

Methods:

- `putCredential`
- `getCredential`
- `revokeCredential`

### C1 behavior

- `manual_import` stores `null`/no-op credentials in an in-memory map
- non-manual providers throw `501 credential_storage_not_implemented`

### Why this matters

This prevents later builds from accidentally dropping plaintext tokens into connector rows while still giving C1 a production-safe abstraction boundary.

## 8. Manual import request contract

Route:

`POST /v1/projects/:projectId/communications/import`

Validated by `manualImportBodySchema`.

Important details:

- one thread per request in C1
- one or more messages per request
- attachments optional
- `provider` is fixed to `manual_import`
- timestamps must be ISO datetimes
- attachment URLs must be valid URLs if present

## 9. Normalization pipeline

`MessageNormalizerService` converts incoming manual import shape into `NormalizedCommunicationBatch`.

Normalization details:

- participants become structured `{ label, externalRef?, email? }`
- attachments are normalized and missing `providerAttachmentId` is synthesized deterministically
- thread/message `rawMetadata` is preserved
- `replyToProviderMessageId` remains provider-side until ingestion resolves it

## 10. Ingestion pipeline

Main entrypoint:

`MessageIngestionService.ingestNormalizedBatch(batch)`

### Step-by-step

1. load connector by:
   - `id`
   - `projectId`
   - `provider`
2. fail if connector does not belong to the project/provider
3. require at least one thread
4. upsert the first thread using `(connectorId, providerThreadId)`
5. sort messages by `sentAt`
6. for each message:
   - resolve reply target from imported map or DB lookup
   - load current message by `(connectorId, providerMessageId)`
   - compute `bodyHash`
   - create row if missing
   - if row exists and hash changed:
     - read latest revision index
     - create `CommunicationMessageRevision`
   - update current row with latest normalized values
   - mark `isEdited` if revision created
   - upsert attachments
7. create/update `job_runs` for indexing
8. enqueue `index_communication_message`
9. enqueue project dashboard refresh

### Output

Returns:

- `threadId`
- `messageIds`
- `createdMessageCount`
- `updatedRevisionCount`
- `indexedMessageCount`

## 11. Revision creation rules

Revision rows are created only when:

- the existing message exists, and
- incoming body hash differs from stored body hash

The revision stores the old body before the canonical row is updated.

Repeated import of the same body:

- updates no revision
- remains idempotent

## 12. Attachment handling rules

For each imported attachment:

- upsert on `(messageId, providerAttachmentId)`
- store filename/type/size/url/raw metadata
- default `storageStatus = metadata_only`

Attachment binary extraction is intentionally deferred to a later build.

## 13. Indexing pipeline

Main code:

`MessageIndexingService.indexCommunicationMessage(messageId)`

### Step-by-step

1. load message + thread + connector + project + attachments
2. repair `bodyHash` if stale
3. load existing chunks for the message
4. compute message content signature
5. if stored chunk signature matches current signature:
   - return early with `indexed: false`
6. delete stale chunks
7. chunk message body
8. for each chunk:
   - build contextual text
   - build lexical text
   - request embedding
   - insert `communication_message_chunks`
   - update `embedding` via SQL vector cast
9. record `communication_message_indexed`

### Contextual content fields used

- provider
- sender label
- sender email
- sent timestamp
- thread subject
- attachment filenames
- body text

### Why this matters

This matches the repo’s existing retrieval pattern so Socrates can use imported communication without a parallel retrieval stack.

## 14. Timeline service

`TimelineService` provides all communication read models.

### `getTimeline()`

Filters:

- provider
- hasChangeProposal
- dateFrom
- dateTo
- search
- cursor
- limit

Query behavior:

- base table is `communication_threads`
- ordered by `lastMessageAt desc, id desc`
- search matches:
  - `subject`
  - `normalizedSubject`
  - message body text
- counts proposals through `spec_change_links`
- emits `communication_thread_opened` audit event

### `listThreads()`

Same base read path, lighter semantics for thread list pages.

### `getThread()`

Returns:

- thread metadata
- connector metadata
- full message list ascending by `sentAt`
- linked proposals
- linked decisions
- document targets from linked proposal section refs
- `viewerState` for Socrates/Viewer integration

### `getMessage()`

Returns:

- connector metadata
- thread metadata + thread open target
- message metadata
- revisions
- attachments
- chunk metadata
- linked changes
- linked decisions
- linked documents
- open-targets

Also emits `communication_message_opened`.

## 15. Open-target/read-model compatibility

C1 preserved compatibility with existing surfaces.

### Doc Viewer

- `/v1/projects/:projectId/messages/:messageId` now comes from the communications module
- response includes `linkedDocuments`
- response includes thread/message/doc open-targets

### Socrates

- `src/lib/retrieval/hybrid.ts` now understands provider-aware `communication_message_chunks`
- if chunks are missing, it can index them on demand
- generated chunks now include:
  - `connectorId`
  - `provider`
  - contextual/lexical content

### Dashboard

Dashboard refresh is enqueued after:

- connector create
- connector revoke
- communication ingest
- sync start
- sync completion

## 16. Authz rules in code

### `ensureCommunicationManager()`

Used by:

- connector list/get/update/connect/revoke
- queue sync
- manual import
- sync-run history

### `ensureCommunicationReadAccess()`

Used by:

- timeline
- thread detail
- message detail

Behavior:

- assigned manager/dev allowed
- client throws `403 client_communication_access_forbidden`

## 17. Route list

Registered in `src/modules/communications/communications.routes.ts`.

### Manager-only

- `GET /v1/projects/:projectId/connectors`
- `GET /v1/projects/:projectId/connectors/:connectorId`
- `PATCH /v1/projects/:projectId/connectors/:connectorId`
- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `POST /v1/projects/:projectId/connectors/:connectorId/sync`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`
- `GET /v1/projects/:projectId/connectors/:connectorId/sync-runs`
- `POST /v1/projects/:projectId/communications/import`

### Manager + assigned dev

- `GET /v1/projects/:projectId/communications/timeline`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/threads/:threadId`
- `GET /v1/projects/:projectId/messages/:messageId`

## 18. Build-app and worker integration

### `src/app/build-app.ts`

Registers `registerCommunicationRoutes`.

### `src/setup-context.ts`

Creates `CommunicationsService` and wires:

- inline `sync_communication_connector`
- inline `index_communication_message`

### `src/worker.ts`

Adds worker handlers for:

- communication sync job execution
- message indexing job execution

## 19. Job catalog changes

Added to `src/lib/jobs/types.ts`:

- `sync_communication_connector`
- `ingest_communication_batch`
- `index_communication_message`

Added to `src/lib/jobs/keys.ts`:

- `syncCommunicationConnector(connectorId, syncType, cursorHash)`
- `ingestCommunicationBatch(connectorId, syncRunId, batchHash)`
- `indexCommunicationMessage(messageId, bodyHash)`

## 20. Tests added and what they verify

### `tests/communications-schemas.test.ts`

Verifies schema expectations and route body validation behavior.

### `tests/communications-service.test.ts`

Verifies:

- first import creates message and attachment metadata
- indexing job is enqueued
- changed import creates exactly one revision
- duplicate same-body import does not create an extra revision
- indexing creates provider-aware message chunks

### `tests/routes.test.ts`

Verifies:

- connector list/connect/sync/sync-run/import/timeline/revoke routes
- manager success paths
- client blocking on timeline/message evidence reads

### `tests/socrates-hybrid.test.ts`

Verifies:

- communication retrieval still works with the hardened chunk model
- on-demand chunk creation includes `connectorId` and `provider`

### `tests/socrates-routes.test.ts`

Ensures route-layer app context remains compatible with new communication service wiring.

## 21. Build/debug commands used

Commands run during implementation:

```powershell
npm run prisma:generate
npm run build
npm test
$env:DATABASE_URL='postgresql://test:test@localhost:5432/test'; npx prisma validate
```

Important issue fixed during implementation:

- Prisma generation initially failed because `OAuthState.organization` had no opposite relation on `Organization`
- fix applied: `Organization.oauthStates`

## 22. Integration contracts preserved

### Product Brain

- no truth-writing bypass introduced
- communication remains evidence linked through `spec_change_links`

### Socrates

- communication chunks still feed retrieval
- message ids and thread ids remain navigable

### Live Doc Viewer

- message evidence route remains available internally
- linked document targets preserved

### Dashboard

- communication events refresh project snapshots

## 23. Deferred items for C2 and beyond

Explicitly left for later:

- message insight classifiers
- thread insight classifiers
- review queue
- auto proposal/decision generation
- real provider OAuth callbacks
- real provider webhook endpoints
- secure external credential store
- attachment download/extraction
- outbound messaging

## 24. Recommended C2 starting points

When building C2, reuse C1 exactly as follows:

- do not redesign connectors/sync runs/revisions
- build message insight tables and services on top of existing normalized messages
- reuse `communication_message_chunks` for retrieval grounding
- write new review/proposal logic through `spec_change_links`
- keep clients blocked from raw communication unless explicit sharing rules are added
- preserve the distinction between evidence and accepted truth

## 25. Final statement

C1 was implemented as a production-safe communication foundation, not a demo inbox. It gives Orchestra:

- provider-agnostic communication evidence storage
- manual import
- idempotent ingest
- immutable edit history through revisions
- retrieval-ready message chunks
- timeline/thread/message APIs
- compatibility with Product Brain, Socrates, Viewer, and Dashboard

That is the complete baseline C2 must extend, not replace.
