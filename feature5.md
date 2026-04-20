# Feature 5: Communication Layer C1

## 1. Feature name and purpose

Feature 5 is the first production-safe build of Orchestra's communication layer. It turns imported communication into immutable, provider-agnostic project evidence that can be indexed, retrieved by Socrates, opened in the Live Doc Viewer, and reflected in Dashboard refresh flows.

This build is foundation-only. It hardens the schema, connector model, sync model, revision model, attachment metadata model, manual import ingestion path, and timeline/thread/message read APIs without yet adding OAuth connectors, automatic insight classification, or outbound messaging.

## 2. Product role of Feature 5 in Orchestra

The communication layer is the evidence bridge between external conversation and Orchestra's four existing surfaces:

- Product Brain uses accepted communication-derived changes as linked source evidence.
- Socrates retrieves indexed communication chunks and cites threads/messages.
- Live Doc Viewer opens message evidence and doc/message provenance paths.
- Dashboard refreshes when communication state changes.

Without C1, communication exists only as partial tables. With C1, communication becomes an auditable subsystem with explicit connectors, sync runs, revisions, chunk indexing, and internal-only read models.

## 3. Exact scope of Feature 5

Implemented in C1:

- communication schema hardening
- provider-agnostic connector model
- sync run model
- OAuth state model
- webhook event dedupe model
- message revision model
- attachment metadata model
- manual_import provider
- manager-only manual import route
- connector management routes
- timeline/thread/message read routes
- message chunking and embedding for imported messages
- Socrates retrieval compatibility for message chunks
- Doc Viewer message evidence compatibility
- Dashboard refresh hooks after communication changes
- tests and documentation

Not implemented in C1:

- Slack OAuth
- Gmail OAuth
- Outlook OAuth
- Teams OAuth
- WhatsApp webhook ingestion
- message insight classification
- automatic proposal generation from messages
- outbound reply/send flows

## 4. What Feature 5 is NOT

- not a shared inbox
- not a CRM
- not a helpdesk
- not a provider-specific data silo
- not a direct truth-writer
- not a client-visible communication portal

## 5. User-facing outcomes

Managers can:

- create or reuse a `manual_import` connector for a project
- import one normalized thread plus messages into immutable evidence storage
- see connector state and sync-run history
- trigger manual/no-op syncs
- revoke a connector without deleting evidence

Managers and assigned devs can:

- browse a project communication timeline
- open thread detail
- open message evidence detail
- navigate from communication evidence to linked document sections and change proposals

Clients cannot:

- list connectors
- import messages
- open timeline/thread/message evidence routes

## 6. Core internal objects

- `CommunicationConnector`
- `CommunicationSyncRun`
- `OAuthState`
- `ProviderWebhookEvent`
- `CommunicationThread`
- `CommunicationMessage`
- `CommunicationMessageRevision`
- `CommunicationAttachment`
- `CommunicationMessageChunk`

## 7. Data model used by Feature 5

### Enums

- `CommunicationProvider`
  - `manual_import`
  - `slack`
  - `gmail`
  - `outlook`
  - `microsoft_teams`
  - `whatsapp_business`
- `CommunicationConnectorStatus`
  - `pending_auth`
  - `connected`
  - `syncing`
  - `error`
  - `revoked`
- `CommunicationSyncType`
  - `manual`
  - `webhook`
  - `backfill`
  - `incremental`
- `CommunicationSyncStatus`
  - `queued`
  - `running`
  - `completed`
  - `partial`
  - `failed`
- `CommunicationMessageType`
  - `user`
  - `system`
  - `bot`
  - `file_share`
  - `note`
  - `other`
- `AttachmentStorageStatus`
  - `metadata_only`
  - `stored`
  - `extraction_pending`
  - `extracted`
  - `failed`
- `WebhookEventStatus`
  - `received`
  - `ignored_duplicate`
  - `queued`
  - `processed`
  - `failed`

### Core model rules

- `provider` is explicit on connectors, threads, messages, revisions, attachments, and chunks.
- `messageType` is never overloaded to mean provider.
- thread uniqueness is `(connectorId, providerThreadId)`.
- message uniqueness is `(connectorId, providerMessageId)`.
- imported edits create `communication_message_revisions`.
- attachments are metadata-only in C1.
- message chunks store both lexical and embedding-ready content.

### Backfill compatibility

The migration backfills legacy communication rows by:

- creating one `manual_import` connector per project when needed
- assigning legacy threads/messages/chunks to that connector
- defaulting provider to `manual_import`
- computing `body_hash` for existing messages

No existing communication evidence is deleted.

## 8. API routes used by Feature 5

### Connector routes

- `GET /v1/projects/:projectId/connectors`
- `GET /v1/projects/:projectId/connectors/:connectorId`
- `PATCH /v1/projects/:projectId/connectors/:connectorId`
- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `POST /v1/projects/:projectId/connectors/:connectorId/sync`
- `POST /v1/projects/:projectId/connectors/:connectorId/revoke`
- `GET /v1/projects/:projectId/connectors/:connectorId/sync-runs`

### Import route

- `POST /v1/projects/:projectId/communications/import`

### Timeline routes

- `GET /v1/projects/:projectId/communications/timeline`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/threads/:threadId`
- `GET /v1/projects/:projectId/messages/:messageId`

## 9. Full connector-management flow

### Connect

1. Route validates `projectId` and `provider`.
2. `ConnectorsService.connect()` enforces manager access through `ensureCommunicationManager()`.
3. Adapter is selected from the provider registry.
4. For `manual_import`, `ManualImportProvider.connect()` returns immediate `connected`.
5. Connector is created or updated with:
   - `projectId`
   - `provider`
   - `accountLabel`
   - `status`
   - `configJson`
   - `createdBy`
6. `CredentialVault.putCredential()` is called for `manual_import` with a null credential.
7. Audit event `communication_connector_created` is recorded.
8. Project dashboard refresh is enqueued.

### Update

1. Manager authz enforced.
2. `accountLabel` and `configJson` may change.
3. `provider` cannot change.

### Revoke

1. Manager authz enforced.
2. `CredentialVault.revokeCredential()` is invoked.
3. Connector status becomes `revoked`.
4. Historical threads/messages are preserved.
5. Audit event `communication_connector_revoked` is recorded.
6. Project dashboard refresh is enqueued.

## 10. Full manual-import ingestion flow

1. Route validates payload with `manualImportBodySchema`.
2. `CommunicationsService.importManualBatch()` creates or reuses a `manual_import` connector.
3. Batch is normalized by `MessageNormalizerService`.
4. `MessageIngestionService.ingestNormalizedBatch()`:
   - verifies connector belongs to the project and provider
   - upserts the thread via `(connectorId, providerThreadId)`
   - sorts messages by `sentAt`
   - resolves `replyToProviderMessageId` to internal `replyToMessageId`
   - creates or updates message rows idempotently
   - creates revision rows when body hash changed
   - upserts attachment metadata
   - creates `job_runs` for indexing
   - enqueues `index_communication_message`
   - enqueues dashboard refresh
5. `communication_manual_imported` audit event is written.
6. Response returns:
   - `connectorId`
   - `threadId`
   - `messageIds`
   - `createdMessageCount`
   - `updatedRevisionCount`
   - `indexed`

## 11. Message revision model

### Trigger

A revision is created only when the normalized current body hash differs from the incoming body hash.

### Stored revision data

- previous `bodyText`
- previous `bodyHtml`
- previous `bodyHash`
- previous `rawMetadataJson`
- `revisionIndex`
- `provider`
- `connectorId`
- `editedAt`

### Important invariant

The current message row may reflect the latest imported provider state, but every prior imported body is preserved in revision rows. C1 never silently overwrites a changed body without creating a revision row first.

## 12. Attachment metadata model

Attachments are stored as metadata only in C1:

- provider attachment id
- filename
- MIME type
- size
- provider URL
- raw metadata
- storage status

Default status is `metadata_only`. No attachment binary fetch or extraction runs yet.

## 13. Message indexing flow

`MessageIndexingService.indexCommunicationMessage(messageId)`:

1. loads message + thread + connector + project + attachments
2. recomputes/repairs `bodyHash` if needed
3. checks existing chunk signatures
4. deletes stale chunks when content changed
5. chunks message body using the shared retrieval chunker
6. builds contextual content with:
   - provider
   - sender label/email
   - sentAt
   - thread subject
   - attachment filenames
7. builds lexical content for keyword retrieval
8. embeds contextual content using the existing embedding provider
9. inserts `communication_message_chunks`
10. writes vector embeddings with raw SQL update
11. records `communication_message_indexed`

Idempotency is driven by body/content signature and message-specific job keys.

## 14. Timeline/thread/message read model

### Timeline

`TimelineService.getTimeline()` returns thread-centric timeline items:

- thread identity
- connector/provider/account label
- participants
- latest message excerpt
- linked proposal count
- thread open-target
- optional lightweight attention marker when proposals are linked

Supports:

- `provider`
- `hasChangeProposal`
- `dateFrom`
- `dateTo`
- `search`
- cursor pagination
- `limit`

### Thread detail

`TimelineService.getThread()` returns:

- thread metadata
- connector summary
- messages ordered ascending by `sentAt`
- linked change proposals
- linked decisions
- document open-targets derived through `spec_change_links`
- Socrates-compatible `viewerState`

### Message detail

`TimelineService.getMessage()` returns:

- connector summary
- thread summary
- message metadata/body
- revisions
- attachments
- chunk metadata
- linked changes
- linked decisions
- linked documents
- open-targets for thread, message, and linked docs

## 15. Authorization model

Server-side authz is centralized in `src/modules/communications/authz.ts`.

- `ensureCommunicationManager()` delegates to `ProjectService.ensureProjectManager()`
- `ensureCommunicationReadAccess()` delegates to `ProjectService.ensureProjectAccess()` and explicitly rejects `client`

Resulting policy:

- manager:
  - full connector control
  - manual import
  - sync
  - timeline/thread/message reads
- dev:
  - timeline/thread/message reads only if assigned to the project
- client:
  - blocked from all communication routes in C1

## 16. Interaction with Feature 1

Feature 5 reuses Feature 1 structures instead of introducing a second truth model:

- `spec_change_links` already link proposals to messages/threads/document sections/brain nodes
- Product Brain remains the only accepted current-truth model
- imported communication is immutable evidence, not truth

Doc/message cross-navigation uses existing section links already used by Product Brain and Viewer provenance.

## 17. Interaction with Feature 2

Feature 5 preserves Socrates compatibility by:

- indexing `communication_message_chunks` with the same embedding provider
- keeping provider-aware chunk metadata
- keeping message and thread IDs stable for open-target validation
- preserving the internal message route consumed by Live Doc Viewer/Socrates provenance paths

`src/lib/retrieval/hybrid.ts` was hardened so missing communication chunks can be indexed on demand using the new provider-aware schema.

## 18. Interaction with Feature 3

Feature 3 already depends on opening exact message evidence by `messageId`.

C1 keeps that working by:

- moving the canonical message evidence route into the communications module
- returning linked document targets from message evidence reads
- keeping client users blocked from raw communication evidence

## 19. Interaction with Feature 4

Dashboard does not gain a new UI route in C1, but it is kept in sync operationally:

- connector create/revoke
- manual import
- sync start/completion

All of those enqueue project dashboard snapshot refreshes through the shared dashboard refresh helper.

## 20. Jobs used by Feature 5

- `sync_communication_connector`
- `ingest_communication_batch`
- `index_communication_message`

### Job key patterns

- `sync-connector:{connectorId}:{syncType}:{cursorHash}`
- `ingest-batch:{connectorId}:{syncRunId}:{batchHash}`
- `index-message:{messageId}:{bodyHashOrSyncRef}`

### C1 note

`ingest_communication_batch` is modeled in the job catalog and key helpers for forward compatibility, but the C1 route path calls ingestion directly and enqueues message indexing jobs.

## 21. Libraries and infrastructure reused

- Fastify for routes
- Zod for request validation
- Prisma/PostgreSQL for relational storage
- pgvector for communication chunk embeddings
- existing embedding provider abstraction
- BullMQ-style job dispatcher abstraction already used across the repo
- existing audit service
- existing dashboard refresh helper

## 22. Files/modules added or changed

### New communication library helpers

- `src/lib/communications/provider-types.ts`
- `src/lib/communications/provider-normalized-types.ts`
- `src/lib/communications/idempotency.ts`
- `src/lib/communications/html-to-text.ts`
- `src/lib/communications/message-contextualize.ts`
- `src/lib/communications/sync-cursors.ts`
- `src/lib/communications/credential-vault.ts`
- `src/lib/communications/webhook-verification.ts`

### New communication module

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
- provider stub files for Slack/Gmail/Outlook/Teams/WhatsApp

### Existing files patched

- `prisma/schema.prisma`
- `prisma/migrations/0008_communication_layer_c1/migration.sql`
- `src/app/build-app.ts`
- `src/setup-context.ts`
- `src/worker.ts`
- `src/types/index.ts`
- `src/lib/jobs/types.ts`
- `src/lib/jobs/keys.ts`
- `src/lib/retrieval/hybrid.ts`
- `src/modules/documents/routes.ts`
- `src/modules/documents/schemas.ts`
- docs/test files

## 23. Validation and security rules

- all public route inputs validated with Zod
- no plaintext token storage for future live providers
- non-manual provider credential access intentionally throws `501`
- client communication access denied server-side
- manager-only connector mutation routes
- idempotent uniqueness anchored to connector + provider identifiers
- webhook verification helper exists but live webhook routes are not enabled in C1

## 24. Error handling and edge cases

- connector not found for project → `404 communication_connector_not_found`
- unsupported provider adapter → `404 communication_provider_not_supported`
- client read attempt → `403 client_communication_access_forbidden`
- non-manual credential storage/retrieval/revoke in C1 → `501 credential_storage_not_implemented`
- missing thread in manual import → `422 communication_thread_required`
- cross-project/cross-thread message collision → `409 communication_message_conflict`

## 25. Testing strategy

Added/updated tests cover:

- schema enum/route validation
- manual import happy path
- duplicate import idempotency
- revision creation on changed message body
- attachment metadata storage
- message chunk indexing
- route contracts for connectors/timeline/import
- client blocking on communication reads
- Socrates retrieval compatibility for provider-aware message chunk indexing

## 26. Production-readiness notes

C1 is production-ready for the implemented scope:

- schema and migration are explicit
- legacy communication rows are backfilled safely
- manual import is idempotent
- edits create revisions
- chunks are retrieval-ready
- timeline/thread/message routes are paginated and server-authorized

Still intentionally deferred:

- real provider OAuth and token exchange
- secure external secret store implementation beyond the current `CredentialVault` safety stub
- webhook ingestion endpoints
- message insight classification
- automatic proposal generation
- outbound messaging

## 27. Known limitations / intentionally deferred items

- only `manual_import` is fully implemented
- one-thread-per-import request shape in C1
- attachment binaries are not fetched
- no message insight or review queue routes yet
- no connector-level locking beyond idempotent job keys and DB uniqueness
- no periodic communication sync scheduler yet

## 28. Rebuild checklist

If rebuilding C1 from scratch, do this in order:

1. add communication enums and hardened models to Prisma
2. add the backfill migration for legacy communication rows
3. add provider-normalized types and helper libs
4. build manager/dev/client authz helpers
5. implement provider registry with `manual_import` + stubs
6. implement connector service
7. implement sync service and job wiring
8. implement normalization, ingestion, and revision logic
9. implement message indexing and embedding
10. implement timeline/thread/message read models
11. register routes and remove duplicate legacy message route
12. patch retrieval to use the new provider-aware message chunks
13. add dashboard refresh hooks
14. add tests
15. update docs

## 29. Final implementation status

Build C1 is complete when all of the following are true, and this repo now satisfies them:

- migration applies
- `manual_import` connector works
- messages ingest idempotently
- revisions are created on edits
- imported messages are indexed
- timeline/thread/message APIs work
- Socrates can retrieve indexed imported messages
- clients cannot access internal communication
- build/tests/docs are green
