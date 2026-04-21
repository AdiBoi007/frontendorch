# Orchestra Communication Layer
## Source-of-Truth Specification for the Communication Layer

Version: 1.0  
Status: Authoritative build document for the communication layer  
Audience: Claude Code, Codex, backend engineers, frontend engineers, QA, and DevOps

---

## 0. Why this file exists

This document is the **single source of truth for the Orchestra communication layer**.

Use it to build the part of Orchestra that turns external project communication into:

- normalized project memory
- message evidence
- AI-derived insights
- reviewable change/decision candidates
- accepted current-truth updates
- Doc Viewer overlays
- Socrates citations
- Dashboard pressure and freshness signals

This file is deliberately exhaustive. It exists so that Claude Code or Codex can build the communication layer without guessing.

### Authority order

Use the following authority order:

1. **README.md / PRODUCT_OVERVIEW.md / MVP_SCOPE.md / FEATURES.md / BUILD_PLAN.md / Backend_plan.md**
2. **This file (`communication_layer.md`) for all communication-layer specifics**
3. `docs/DATA_MODEL.md`
4. `docs/API_SPEC.md`
5. `docs/PAGES_AND_CONTEXT.md`
6. `docs/ROLE_CAPABILITIES.md`
7. `docs/SPEC_UPDATE_RULES.md`
8. `docs/SOCRATES_RAG_SPEC.md`
9. Other feature docs and implementation details

If the current repo implementation conflicts with this file:
- preserve existing product invariants,
- avoid breaking existing Product Brain / Socrates / Viewer / Dashboard behavior,
- and update the implementation toward this spec unless the code already preserves the intended product rules better.

---

## 1. Product context

Orchestra is **not** a generic shared inbox, not a CRM, not a task manager, and not the old prototype/control-tower product.

Orchestra is a **PRD-aware communication and understanding platform** for client-facing software teams.

The current product has four visible surfaces:

1. **Product Brain**
2. **Socrates**
3. **Live Doc Viewer**
4. **Dashboard**

The communication layer is the missing core that makes those four surfaces behave like one system instead of four disconnected features.

### The product loop this layer must enable

```text
Slack / Gmail / Outlook / Teams / WhatsApp / manual import
→ connector auth / sync / webhook ingestion
→ normalized immutable threads + messages
→ message chunking + retrieval indexing
→ AI insight classification
→ reviewable change / decision candidates
→ manager acceptance / rejection
→ new current Product Brain version
→ Doc Viewer overlays on affected sections
→ Socrates answers from updated truth with provenance
→ Dashboard freshness / pressure updates
```

That loop is the product.

---

## 2. What the communication layer is and is not

### 2.1 What it is

The communication layer is:

- a **read-first ingestion and analysis system**
- a **provider-agnostic normalization layer**
- a **project-memory timeline**
- an **AI interpretation layer**
- a **living-spec update trigger**
- a **source-provenance bridge** into Product Brain, Socrates, Viewer, and Dashboard

### 2.2 What it is not

The communication layer is **not**:

- a full shared inbox suite
- a complete outbound messaging system
- a CRM / ticketing platform
- a generic “customer support inbox”
- a replacement for Slack, Gmail, Teams, Outlook, or WhatsApp
- a place where source evidence is silently rewritten
- a direct current-truth writer that bypasses human review

### 2.3 V1 scope boundary

V1 of the communication layer should do this well:

- ingest
- normalize
- preserve
- index
- classify
- propose
- review
- update current truth after acceptance

V1 should **not** try to do everything else.

---

## 3. Non-negotiable product rules

These are hard requirements.

### 3.1 Messages are immutable source evidence

The original normalized message body is immutable source evidence.

If a provider later edits a message:
- keep the original normalized message record,
- store revisions separately,
- never silently replace the original evidence.

### 3.2 Communication does not directly update truth

A message can create:
- an insight,
- a candidate change,
- a candidate decision,
- a contradiction,
- a blocker,
- an approval signal,
- or an open question.

But no message directly updates Product Brain/current truth.

Only a manager-accepted proposal/decision can do that.

### 3.3 Every accepted change must preserve provenance forever

Every accepted communication-driven update must remain linked to:

- source platform
- connector
- provider thread id
- provider message id(s)
- normalized thread/message ids
- affected document sections
- affected brain nodes
- old understanding
- new understanding
- acceptance metadata

### 3.4 The communication model must be provider-agnostic

Slack, Gmail, Outlook, Teams, WhatsApp Business, and manual imports all normalize into one shared model.

Do not create separate primary storage tables like:

- `slack_messages`
- `gmail_messages`
- `teams_messages`
- `outlook_messages`
- `whatsapp_messages`

Provider-specific details belong in adapters and metadata, not the core data model.

### 3.5 Original docs stay immutable

Communication-driven accepted changes update the **current derived truth**, not the original PRD/SRS bytes.

The viewer must show overlays/markers, not pretend the source doc changed in place.

### 3.6 Socrates and Viewer must remain provenance-first

The communication layer must preserve enough structured metadata so that:

- Socrates can cite messages and threads,
- the viewer can open linked evidence,
- and current-truth explanations remain traceable.

### 3.7 Every sync/import must be idempotent

Repeated syncs, retries, webhook replays, and backfills must not duplicate messages or corrupt state.

### 3.8 Credentials must never be stored as plaintext tokens in the main relational model

The database can store references to credentials, not raw secrets.

### 3.9 Server-side authorization is mandatory

- managers control connectors and authoritative review actions
- devs get read access within allowed project scope
- clients do not see internal communication by default

### 3.10 Build for production, not for a fake demo

Every core flow must be:
- auditable
- retry-safe
- locked where needed
- rate-limit aware
- observable
- compatible with staging and production infra

---

## 4. Communication-layer objectives

The communication layer must enable users to answer:

- What did the client actually ask for?
- Which message changed this requirement?
- Is this a clarification or a real scope change?
- Was this approved?
- Which PRD section or Brain node does this affect?
- What is still unresolved?
- What should engineering follow now?
- Where is the exact source evidence?

These are the daily-use questions that make Orchestra valuable.

---

## 5. Architecture overview

## 5.1 High-level architecture

```text
External providers
  ├─ Slack
  ├─ Gmail
  ├─ Outlook
  ├─ Microsoft Teams
  ├─ WhatsApp Business
  └─ Manual import
         ↓
Connector edge layer
  ├─ OAuth
  ├─ webhook verification
  ├─ polling/backfill
  ├─ provider rate-limit handling
  └─ credential vault access
         ↓
Normalization layer
  ├─ provider → normalized thread
  ├─ provider → normalized message
  ├─ provider → attachment metadata
  └─ provider → revision/deletion event
         ↓
Immutable evidence storage
  ├─ communication_connectors
  ├─ communication_sync_runs
  ├─ communication_threads
  ├─ communication_messages
  ├─ message revisions
  ├─ attachments
  └─ webhook events
         ↓
Indexing and retrieval
  ├─ contextual content
  ├─ chunking
  ├─ embeddings
  ├─ lexical content
  └─ Socrates retrieval compatibility
         ↓
Intelligence layer
  ├─ message insight classification
  ├─ thread insight classification
  ├─ affected section / node resolution
  ├─ proposal candidate generation
  └─ decision candidate generation
         ↓
Governance layer
  ├─ review queue
  ├─ accept / reject / ignore
  └─ dedupe / supersession rules
         ↓
Current-truth update layer
  ├─ new Product Brain version
  ├─ graph refresh if needed
  ├─ section overlays / markers
  ├─ current-vs-original truth handling
  └─ audit trail
         ↓
Surface read models
  ├─ communication timeline
  ├─ thread detail
  ├─ message detail
  ├─ viewer overlays
  ├─ Socrates citations / open targets
  └─ dashboard pressure/freshness summary
```

## 5.2 The layer model

The communication layer has **10 layers**.

### Layer A — Connector edge layer
Responsible for:
- OAuth / setup
- webhook verification
- manual import
- sync scheduling
- provider cursors
- provider-specific config

### Layer B — Credential and security layer
Responsible for:
- safe token storage
- state verification
- secret redaction
- signature verification
- callback replay prevention

### Layer C — Provider adapter layer
Responsible for:
- calling provider APIs
- interpreting provider payloads
- converting them into normalized types

### Layer D — Normalization layer
Responsible for:
- immutable normalized threads/messages
- participant modeling
- revision/deletion event handling
- attachment metadata handling
- message hashes for dedupe/edit detection

### Layer E — Evidence persistence layer
Responsible for:
- storing connectors, sync runs, threads, messages, revisions, attachments, webhook events
- preserving provider ids and metadata

### Layer F — Indexing and retrieval layer
Responsible for:
- message chunking
- contextual content generation
- embeddings
- lexical material
- retrieval metadata for Socrates

### Layer G — Intelligence layer
Responsible for:
- message insights
- thread insights
- affected section/node resolution
- duplicate suppression
- proposal/decision suggestion triggers

### Layer H — Review and governance layer
Responsible for:
- review queue
- ignore / accept / reject / supersede actions
- proposal state transitions
- authority enforcement

### Layer I — Current-truth update layer
Responsible for:
- updating Product Brain only after acceptance
- applying accepted communication-driven changes
- creating a new current truth artifact version
- building overlays and markers

### Layer J — Surface-read-model layer
Responsible for:
- communication timeline
- thread detail
- message detail
- Socrates citations/open-targets
- Viewer overlays
- Dashboard pressure/freshness signals

---

## 6. How each layer works

## 6.1 Connector edge layer

### Purpose
This is where Orchestra meets external providers.

### Responsibilities
- initiate OAuth for providers that require it
- store connector config and status
- receive webhooks
- run manual syncs
- backfill historical messages
- renew provider watches/subscriptions where needed
- track sync state and cursors

### Outputs
- verified provider payloads
- normalized sync jobs
- status transitions on connectors
- sync run records

### Design rules
- all heavy work goes to jobs
- webhooks must return fast
- OAuth callback must be one-time-state verified
- manual import must exist even before real providers are live

## 6.2 Credential and security layer

### Purpose
Keep provider auth safe.

### Responsibilities
- secret storage abstraction
- OAuth state creation and validation
- signing secret / signature verification
- token rotation compatibility
- revoke flows

### Outputs
- `credentialsRef`
- verified webhook requests
- safe credential envelopes for provider adapters

### Design rules
- plaintext tokens must not live in normal connector rows
- never log raw tokens, auth headers, or provider secrets
- production must fail fast if unsafe credential mode is enabled

## 6.3 Provider adapter layer

### Purpose
Hide provider-specific quirks behind one interface.

### Responsibilities
- OAuth URL generation
- callback exchange
- webhook verification
- incremental sync
- backfill sync
- normalization

### Outputs
- normalized thread/message objects
- provider cursor updates
- revoke operations

### Design rules
- provider-specific payloads stop at this boundary
- the rest of the system sees provider-agnostic normalized objects

## 6.4 Normalization layer

### Purpose
Turn incoming provider data into one consistent internal representation.

### Responsibilities
- map provider thread/message ids to normalized rows
- derive subjects when providers do not have them
- normalize participants
- store raw metadata safely
- compute message body hash
- detect edits
- detect deletes

### Outputs
- immutable `communication_threads`
- immutable `communication_messages`
- `communication_message_revisions`
- `communication_attachments`

### Design rules
- original body preserved
- revisions separate
- provider ids preserved
- dedupe rules explicit

## 6.5 Evidence persistence layer

### Purpose
Preserve communication as project evidence.

### Responsibilities
- connector state
- sync runs
- webhook events
- thread/message history
- attachment metadata
- provider metadata
- audit trail

### Outputs
- durable communication memory for the project

### Design rules
- communication must become searchable project evidence
- source-platform and provider ids must survive forever

## 6.6 Indexing and retrieval layer

### Purpose
Make communication available to Socrates and search.

### Responsibilities
- contextualize message content
- chunk long messages
- embed chunks
- build lexical fields
- attach timestamps, thread ids, provider info, metadata

### Outputs
- `communication_message_chunks`

### Design rules
- contextual content should include enough light metadata to improve retrieval
- indexing must be idempotent
- short messages can be one chunk
- long messages may need split+overlap

## 6.7 Intelligence layer

### Purpose
Decide what messages mean **in the context of the product**.

### Responsibilities
- classify individual messages
- optionally classify thread-level outcomes
- map messages to affected document sections and brain nodes
- distinguish info vs. truth-affecting change
- create proposal/decision candidates when appropriate

### Outputs
- `message_insights`
- optional `thread_insights`
- candidate change/decision jobs

### Design rules
- false positives are worse than missing low-value chatter
- preserve uncertainty
- do not auto-accept truth changes
- map to product structure, not just free text

## 6.8 Review and governance layer

### Purpose
Keep human authority over the truth.

### Responsibilities
- expose review queue
- ignore insights
- convert insights into proposals/decisions
- enforce manager-only acceptance
- dedupe and supersede candidate records

### Outputs
- proposal status transitions
- decision status transitions
- audit events

### Design rules
- no silent auto-accept
- dedupe similar proposals
- authoritative current truth changes only after explicit acceptance

## 6.9 Current-truth update layer

### Purpose
Update the living spec correctly.

### Responsibilities
- apply accepted change proposal
- create new Product Brain version
- regenerate graph if needed
- attach overlay markers to affected sections
- refresh dashboard and Socrates caches

### Outputs
- new accepted Product Brain/current truth
- viewer overlay markers
- dashboard change/freshness updates

### Design rules
- original docs do not change
- original messages do not change
- current truth changes by version, not mutation

## 6.10 Surface-read-model layer

### Purpose
Expose everything cleanly to the UI.

### Responsibilities
- timeline
- threads
- message detail
- review queue
- viewer overlay metadata
- Socrates message/thread open targets
- dashboard pressure summary

### Outputs
- stable frontend-friendly APIs

### Design rules
- thin routes, strong services
- paginated lists
- no raw provider payloads dumped to frontend
- no internal-only communication to client view unless explicitly supported

---

## 7. Recommended final data model

The communication layer must extend the current Orchestra schema to the following final shape.

## 7.1 Enums

```text
CommunicationProvider
- manual_import
- slack
- gmail
- outlook
- microsoft_teams
- whatsapp_business

CommunicationConnectorStatus
- pending_auth
- connected
- syncing
- error
- revoked

CommunicationSyncType
- manual
- webhook
- backfill
- incremental

CommunicationSyncStatus
- queued
- running
- completed
- partial
- failed

CommunicationMessageType
- user
- system
- bot
- file_share
- note
- other

AttachmentStorageStatus
- metadata_only
- stored
- extraction_pending
- extracted
- failed

WebhookEventStatus
- received
- ignored_duplicate
- queued
- processed
- failed

MessageInsightType
- info
- clarification
- decision
- requirement_change
- contradiction
- blocker
- action_needed
- risk
- approval

MessageInsightStatus
- detected
- ignored
- converted_to_proposal
- converted_to_decision
- superseded
```

## 7.2 Core models

### CommunicationConnector

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| projectId | UUID FK → Project | |
| provider | CommunicationProvider | |
| accountLabel | string | human-readable label |
| status | CommunicationConnectorStatus | |
| credentialsRef | string? | secret reference, not raw token |
| configJson | json? | provider-specific config |
| providerCursorJson | json? | sync cursor state |
| lastSyncedAt | datetime? | |
| lastError | string? | |
| createdBy | UUID FK → User | |
| createdAt | datetime | |
| updatedAt | datetime | |

Indexes:
- `(projectId, provider)`
- `(projectId, status)`

### CommunicationSyncRun

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| connectorId | UUID FK → CommunicationConnector | |
| projectId | UUID FK → Project | |
| provider | CommunicationProvider | denormalized for query ease |
| syncType | CommunicationSyncType | |
| status | CommunicationSyncStatus | |
| cursorBeforeJson | json? | |
| cursorAfterJson | json? | |
| summaryJson | json? | |
| errorMessage | string? | |
| startedAt | datetime? | |
| finishedAt | datetime? | |
| createdAt | datetime | |

Indexes:
- `(connectorId, createdAt)`
- `(projectId, status)`

### OAuthState

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| orgId | UUID FK → Organization | |
| projectId | UUID FK → Project | |
| provider | CommunicationProvider | |
| actorUserId | UUID FK → User | |
| nonceHash | string unique | |
| redirectAfter | string? | |
| expiresAt | datetime | |
| usedAt | datetime? | |
| createdAt | datetime | |

Indexes:
- `(projectId, provider)`
- `(expiresAt)`

### ProviderWebhookEvent

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| provider | CommunicationProvider | |
| providerEventId | string | unique together with provider |
| connectorId | UUID? | |
| projectId | UUID? | |
| eventType | string | |
| rawPayloadHash | string | dedupe safety |
| status | WebhookEventStatus | |
| receivedAt | datetime | |
| processedAt | datetime? | |
| createdAt | datetime | optional alias of receivedAt if needed |

Constraint:
- unique `(provider, providerEventId)`

Indexes:
- `(provider, receivedAt)`

### CommunicationThread

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| projectId | UUID FK → Project | |
| connectorId | UUID FK → CommunicationConnector | |
| provider | CommunicationProvider | |
| providerThreadId | string | stable provider thread id |
| subject | string? | may be null for chat-like providers |
| normalizedSubject | string? | normalized search field |
| participantsJson | json | |
| threadUrl | string? | deep link when available |
| rawMetadataJson | json? | |
| startedAt | datetime? | |
| lastMessageAt | datetime? | |
| createdAt | datetime | |
| updatedAt | datetime | |

Constraint:
- unique `(connectorId, providerThreadId)`

Indexes:
- `(projectId, provider, lastMessageAt)`
- `(projectId, lastMessageAt)`

### CommunicationMessage

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| projectId | UUID FK → Project | |
| connectorId | UUID FK → CommunicationConnector | |
| threadId | UUID FK → CommunicationThread | |
| provider | CommunicationProvider | |
| providerMessageId | string | stable provider id |
| providerThreadId | string? | convenience duplicate |
| providerPermalink | string? | |
| senderLabel | string | |
| senderExternalRef | string? | user id / phone / other |
| senderEmail | string? | email-like providers |
| sentAt | datetime | event time |
| receivedAt | datetime | ingest time |
| bodyText | text | original normalized text |
| bodyHtml | text? | email/chat HTML when present |
| bodyHash | string | normalized hash used for edit detection |
| messageType | CommunicationMessageType | |
| replyToMessageId | UUID? | normalized self-FK |
| isEdited | bool | |
| isDeletedByProvider | bool | |
| rawMetadataJson | json? | |
| createdAt | datetime | |

Constraint:
- unique `(connectorId, providerMessageId)`

Indexes:
- `(projectId, provider, sentAt)`
- `(threadId, sentAt)`
- `(projectId, bodyHash)`

### CommunicationMessageRevision

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| messageId | UUID FK → CommunicationMessage | |
| providerEditId | string? | |
| bodyText | text | |
| bodyHtml | text? | |
| bodyHash | string | |
| editedAt | datetime | |
| rawMetadataJson | json? | |
| createdAt | datetime | |

Index:
- `(messageId, editedAt)`

### CommunicationAttachment

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| messageId | UUID FK → CommunicationMessage | |
| providerAttachmentId | string? | |
| filename | string? | |
| mimeType | string? | |
| fileSize | bigint? | |
| providerUrl | string? | |
| fileKey | string? | stored asset if later downloaded |
| storageStatus | AttachmentStorageStatus | |
| extractedDocumentId | UUID? | optional future doc extraction |
| rawMetadataJson | json? | |
| createdAt | datetime | |

Index:
- `(messageId)`

### CommunicationMessageChunk

Use the existing table name in the repo if present.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| messageId | UUID FK → CommunicationMessage | |
| threadId | UUID FK → CommunicationThread | |
| projectId | UUID FK → Project | |
| chunkIndex | int | |
| content | text | raw chunk |
| contextualContent | text? | message + sender + thread context |
| lexicalContent | text | |
| embedding | vector(1536)? | |
| tokenCount | int | |
| provider | CommunicationProvider | |
| sentAt | datetime | |
| metadataJson | json? | |
| createdAt | datetime | |

Constraint:
- unique `(messageId, chunkIndex)`

Indexes:
- `(projectId, threadId)`
- `(projectId, provider, sentAt)`
- vector index on `embedding`
- lexical index on `lexicalContent`

### MessageInsight

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| projectId | UUID FK → Project | |
| messageId | UUID FK → CommunicationMessage | |
| threadId | UUID FK → CommunicationThread | |
| insightType | MessageInsightType | |
| status | MessageInsightStatus | default `detected` |
| summary | string | |
| confidence | decimal(4,3) | |
| affectedRefsJson | json? | linked section/node suggestions |
| evidenceJson | json? | model rationale/evidence refs |
| modelJson | json? | provider/model metadata |
| createdAt | datetime | |
| updatedAt | datetime | |

Indexes:
- `(projectId, insightType, status)`
- `(messageId)`
- `(threadId)`

### ThreadInsight (recommended)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| projectId | UUID FK → Project | |
| threadId | UUID FK → CommunicationThread | |
| insightType | MessageInsightType | |
| status | MessageInsightStatus | |
| summary | string | |
| confidence | decimal(4,3) | |
| sourceMessageIds | json | |
| affectedRefsJson | json? | |
| evidenceJson | json? | |
| modelJson | json? | |
| createdAt | datetime | |
| updatedAt | datetime | |

Indexes:
- `(projectId, insightType, status)`
- `(threadId)`

## 7.3 Existing Orchestra models this layer must reuse

Do **not** duplicate these. Reuse them:

- `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `artifact_versions`
- `brain_nodes`
- `brain_edges`
- `brain_section_links`
- `document_sections`
- `document_chunks`
- `socrates_sessions`
- `socrates_messages`
- `socrates_citations`
- `socrates_open_targets`
- `dashboard_snapshots`
- `audit_events`
- `job_runs`

---

## 8. Recommended lifecycle state machines

## 8.1 Connector lifecycle

```text
pending_auth
→ connected
→ syncing
→ connected
→ error
→ syncing
→ connected
→ revoked
```

Rules:
- only manual import may start directly as `connected`
- revoked connectors cannot sync
- error connectors keep historical messages; revoking does not delete evidence

## 8.2 Sync run lifecycle

```text
queued
→ running
→ completed
→ partial
→ failed
```

Rules:
- partial means some channels/folders/messages failed but usable state was ingested
- failed means run did not produce a safe cursor advancement

## 8.3 Message lifecycle

```text
new normalized message
→ indexed
→ optionally classified
→ optionally linked to proposal/decision
→ maybe revised
→ maybe marked deleted by provider
```

Rules:
- original row persists
- revisions are append-only
- provider delete marks `isDeletedByProvider=true`

## 8.4 Insight lifecycle

```text
detected
→ ignored
→ converted_to_proposal
→ converted_to_decision
→ superseded
```

Rules:
- ignored means “do not promote this insight”
- superseded means replaced by later/better thread/message understanding

## 8.5 Proposal lifecycle (existing Orchestra)
Use existing proposal states but communication layer must respect:

```text
detected / needs_review
→ accepted
→ rejected
→ superseded
```

## 8.6 Current truth lifecycle

```text
current Product Brain version
+ accepted communication-driven proposal/decision
→ new Product Brain version
→ previous version superseded
→ overlays/markers updated
→ dashboard freshness updated
→ Socrates retrieval sees new truth
```

---

## 9. Provider abstraction

## 9.1 Interface

All providers implement one interface.

```ts
interface CommunicationProviderAdapter {
  provider: CommunicationProvider

  startOAuth?(input: StartOAuthInput): Promise<OAuthStartResult>
  handleOAuthCallback?(input: OAuthCallbackInput): Promise<OAuthConnectionResult>

  verifyWebhook?(input: VerifyWebhookInput): Promise<VerifiedWebhookEvent[]>

  syncIncremental(input: SyncInput): Promise<ProviderSyncResult>
  syncBackfill(input: BackfillInput): Promise<ProviderSyncResult>

  normalizeThread(input: unknown): NormalizedThread
  normalizeMessage(input: unknown): NormalizedMessage

  revoke?(input: RevokeInput): Promise<void>
}
```

### NormalizedThread

```ts
type NormalizedThread = {
  provider: CommunicationProvider
  providerThreadId: string
  subject?: string | null
  normalizedSubject?: string | null
  participants: NormalizedParticipant[]
  startedAt?: Date | null
  lastMessageAt?: Date | null
  threadUrl?: string | null
  rawMetadata: unknown
}
```

### NormalizedMessage

```ts
type NormalizedMessage = {
  provider: CommunicationProvider
  providerMessageId: string
  providerThreadId?: string | null
  providerPermalink?: string | null

  senderLabel: string
  senderExternalRef?: string | null
  senderEmail?: string | null

  sentAt: Date
  bodyText: string
  bodyHtml?: string | null
  messageType: CommunicationMessageType
  replyToProviderMessageId?: string | null

  attachments?: NormalizedAttachment[]
  rawMetadata: unknown
}
```

### NormalizedParticipant

```ts
type NormalizedParticipant = {
  label: string
  externalRef?: string | null
  email?: string | null
  role?: "sender" | "recipient" | "cc" | "member" | "unknown"
}
```

### NormalizedAttachment

```ts
type NormalizedAttachment = {
  providerAttachmentId?: string | null
  filename?: string | null
  mimeType?: string | null
  fileSize?: number | null
  providerUrl?: string | null
  rawMetadata?: unknown
}
```

---

## 10. Provider-specific design

## 10.1 Manual import provider (must build first)

### Purpose
Development, QA, fixtures, demos, and initial product-loop testing.

### Connect behavior
`POST /v1/projects/:projectId/connectors/manual_import/connect`
- create or return a manual_import connector
- status = `connected`

### Import behavior
`POST /v1/projects/:projectId/communications/import`
- manager-only
- upsert thread by `(connectorId, providerThreadId)`
- upsert messages by `(connectorId, providerMessageId)`
- detect edits via `bodyHash`
- create revisions when needed
- enqueue indexing and classification

### Why it exists
This lets frontend and AI work start immediately without waiting for OAuth or app review.

## 10.2 Slack

### Primary use in Orchestra
Internal team discussion, client shared channels, thread-based clarification, rapid decisions, blockers.

### Official implementation references
- Authentication / OAuth: <https://api.slack.com/authentication>
- OAuth v2 install flow: <https://api.slack.com/authentication/oauth-v2>
- OAuth code exchange: <https://api.slack.com/methods/oauth.v2.access>
- Verify requests: <https://api.slack.com/docs/verifying-requests-from-slack>
- Events API: <https://api.slack.com/apis/connections/events-api>
- URL verification event: <https://api.slack.com/events/url_verification>
- conversation history: <https://api.slack.com/methods/conversations.history>
- thread replies: <https://api.slack.com/methods/conversations.replies>

### Recommended scopes
Use least privilege needed for read-first ingestion. A typical starting point:

- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- plus any user/team metadata scopes you genuinely need

### Ingestion strategy
Preferred initial architecture:
- channel-scoped ingestion
- not whole-workspace ingestion by default

Connector config:
```json
{
  "channelIds": ["C123"],
  "includeBotMessages": false,
  "backfillDays": 30
}
```

### ID mapping
- `providerThreadId = channelId + ":" + (thread_ts || ts)`
- `providerMessageId = channelId + ":" + ts`

### Sync behavior
- backfill: `conversations.history` + `conversations.replies`
- incremental: webhook-triggered or cursor/time-based history fetch
- permalink: `chat.getPermalink` when available / rate-limit-safe

### Edit/delete handling
- message edits → `CommunicationMessageRevision`
- message deletes → mark `isDeletedByProvider=true`

### Important caution
Slack’s official docs now call out stricter rate limits for some non-Marketplace apps on history/replies methods. Build Slack sync as:
- incremental
- channel-scoped
- cursor/time-window aware
- background-job based
- retry/backoff aware

### Webhook handling
- verify Slack signature from headers
- support `url_verification`
- dedupe events by `(provider, providerEventId)`
- acknowledge quickly with 2xx
- do heavy sync in jobs

## 10.3 Gmail

### Primary use in Orchestra
Client emails, approval emails, requirement changes, formal decisions, threaded discussions, attachments.

### Official implementation references
- Gmail API reference: <https://developers.google.com/workspace/gmail/api/reference/rest>
- Push notifications guide: <https://developers.google.com/workspace/gmail/api/guides/push>
- `users.watch`: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch>
- `users.history.list`: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list>
- `users.threads.get`: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get>
- `users.messages.get`: <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get>

### Recommended scopes
Prefer read-only first:
- `https://www.googleapis.com/auth/gmail.readonly`
- or `gmail.metadata` if you truly only need metadata
- `gmail.modify` only if a later feature requires it

### Ingestion strategy
Preferred V1:
- watch + history-based incremental sync if infra is configured
- polling fallback if watch/PubSub is unavailable

Connector config:
```json
{
  "query": "label:project-client OR from:client@example.com",
  "labelIds": ["INBOX"],
  "backfillDays": 30,
  "includeAttachmentsMetadata": true
}
```

### ID mapping
- `providerThreadId = Gmail threadId`
- `providerMessageId = Gmail message id`

### Thread/message normalization
- use `users.threads.get` for full thread detail
- use `users.messages.get` where individual fetch is needed
- subject from headers
- participants from From / To / Cc / Bcc
- sentAt from `internalDate` with header fallback
- bodyText from text/plain or HTML-to-text fallback
- attachments metadata only in V1

### Watch / incremental sync
- `users.watch` returns `historyId` and `expiration`
- use `users.history.list` from the last stored historyId
- renew watches before expiration
- if watch is not available, poll with `q` + time window + idempotent ingest

### HTML handling
- strip scripts/styles
- convert to readable text
- collapse quoted reply chains where reasonable
- preserve raw HTML only as evidence metadata, not frontend render default

## 10.4 Outlook (Microsoft Graph mail)

### Primary use in Orchestra
Client mail in Microsoft-heavy organizations.

### Official implementation references
- List messages: <https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0>
- Get message: <https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0>
- Delta query overview: <https://learn.microsoft.com/en-us/graph/delta-query-overview>
- Message delta / incremental mail sync: <https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0>

### Recommended scopes
Least-privilege read access where possible:
- delegated: `Mail.ReadBasic` or `Mail.Read`
- application: `Mail.ReadBasic.All` or `Mail.Read`

### Ingestion strategy
- folder-scoped sync
- delta query preferred for incremental
- polling fallback where necessary

Connector config:
```json
{
  "folderIds": ["Inbox"],
  "query": "from:client@example.com",
  "backfillDays": 30,
  "includeAttachmentsMetadata": true
}
```

### ID mapping
- `providerThreadId = conversationId || message.id`
- `providerMessageId = message.id`
- `providerPermalink = webLink || null`

### Important Graph notes
- delta query is **per folder**
- store `@odata.deltaLink` / delta token in `providerCursorJson`
- use `$select` aggressively for performance
- prefer text body or request header to shape body response when needed

## 10.5 Microsoft Teams

### Primary use in Orchestra
Internal channel discussion in Microsoft-centric teams; sometimes client-shared Teams spaces.

### Official implementation references
- Teams messaging overview: <https://learn.microsoft.com/en-us/graph/teams-messaging-overview>
- List channel messages: <https://learn.microsoft.com/graph/api/channel-list-messages?tabs=http&view=graph-rest-1.0>
- Chat/channel message notifications: <https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage>

### Recommended scopes
Start with least-privileged read access that supports the required context:
- delegated: `ChannelMessage.Read.All` or equivalent documented read scope
- application scopes only if necessary for the target deployment pattern

### Ingestion strategy
- configured team/channel pairs
- channel messages + replies
- change notifications for low-latency incremental sync where possible
- polling fallback if notifications are not configured

Connector config:
```json
{
  "teams": [
    {
      "teamId": "team-1",
      "channelIds": ["channel-1", "channel-2"]
    }
  ],
  "backfillDays": 30,
  "includeBotMessages": false
}
```

### ID mapping
- `providerThreadId = teamId + ":" + channelId + ":" + rootMessageId`
- `providerMessageId = teamId + ":" + channelId + ":" + messageId`

### Important Graph notes
- channel root messages and replies are separate fetch patterns
- change notifications can deliver created/updated changes
- long-lived subscriptions may require lifecycle notification handling depending on expiration

## 10.6 WhatsApp Business (Cloud API / Business Platform)

### Primary use in Orchestra
Fast-moving client clarifications, urgent changes, approvals, field communication, media messages.

### Official implementation references
- Official Cloud API overview: <https://developers.facebook.com/docs/whatsapp/cloud-api/overview>
- Official Meta Postman collection: <https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-08213e00-c6d0-48a2-8be8-62247b8d29bd>

### Important product note
WhatsApp Business can be operationally slower to deploy because of:
- Meta app/business verification
- WABA setup
- phone number onboarding
- webhook configuration

That must **not** block the architecture. The data model and provider adapter must support WhatsApp from day one even if live rollout is behind a readiness gate.

### Ingestion strategy
- webhook-first for inbound messages
- manual setup/connect flow rather than classic OAuth
- message normalization from webhook payloads
- metadata-only media handling in V1

### ID mapping
- `providerMessageId = WhatsApp message id`
- `providerThreadId = conversation.id when present; otherwise phoneNumberId + ":" + wa_id`
- `senderExternalRef = wa_id / phone number`
- `providerPermalink = null`

### Important webhook rules
- verify webhook challenge/verification token
- verify signature if configured and supported by chosen Meta setup
- store webhook events and dedupe
- only normalize inbound content and relevant status events
- ignore non-user status payloads as messages

### V1 constraint
Do not build outbound template/window logic until the read-first project-memory loop is done.

---

## 11. Connector configuration model

Each provider may have config. Keep it in `configJson`, validated by provider-specific schemas.

### Slack config
```json
{
  "channelIds": ["C123", "C456"],
  "includeBotMessages": false,
  "backfillDays": 30
}
```

### Gmail config
```json
{
  "query": "label:client-project",
  "labelIds": ["INBOX"],
  "backfillDays": 30,
  "includeAttachmentsMetadata": true
}
```

### Outlook config
```json
{
  "folderIds": ["Inbox"],
  "query": "from:client@example.com",
  "backfillDays": 30,
  "includeAttachmentsMetadata": true
}
```

### Teams config
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

### WhatsApp Business config
```json
{
  "wabaId": "123456",
  "phoneNumberId": "78910",
  "verifyTokenRef": "secret-ref",
  "readinessGateEnabled": true
}
```

### Manual import config
```json
{
  "label": "Demo import source"
}
```

---

## 12. Message ingestion pipeline

## 12.1 Canonical ingestion flow

```text
sync/webhook/manual import
→ provider adapter fetches data
→ provider adapter emits normalized thread/message objects
→ ingestion service validates and upserts thread/message evidence
→ edit detection checks bodyHash
→ revisions stored if needed
→ attachment metadata stored
→ indexing job enqueued
→ optional classification job enqueued
→ connector cursor advanced only after safe persistence
```

## 12.2 Ingestion service contract

Core method:

```ts
ingestNormalizedBatch({
  projectId,
  connectorId,
  provider,
  syncRunId,
  threads,
  messages
})
```

Responsibilities:
- ensure connector belongs to project
- upsert threads idempotently
- upsert messages idempotently
- create revisions on edit
- mark deleted when provider deletion event arrives
- insert attachments metadata
- enqueue indexing/classification
- return counts

## 12.3 Idempotency rules

Use unique constraints and safe hashes.

Minimum dedupe guarantees:
- threads unique by `(connectorId, providerThreadId)`
- messages unique by `(connectorId, providerMessageId)`
- chunks unique by `(messageId, chunkIndex)`
- webhook events unique by `(provider, providerEventId)`

Repeated syncs must be safe.

## 12.4 Edit rules

If an existing message with the same provider id arrives and `bodyHash` changed:
- do not overwrite original `bodyText`
- create `CommunicationMessageRevision`
- set `isEdited = true`

## 12.5 Delete rules

If provider signals deletion:
- do not hard delete row
- set `isDeletedByProvider = true`
- preserve original evidence and revisions

---

## 13. Indexing and retrieval integration

## 13.1 Why message indexing exists

Messages are part of project memory and must be retrievable by:
- Socrates
- review tooling
- provenance flows
- future search/filter features

## 13.2 Indexing flow

```text
load message + thread + connector
→ build contextual content
→ chunk
→ compute lexical content
→ embed
→ upsert communication_message_chunks
```

### Example contextual content
```text
Provider: Slack
Thread: Reporting requirement discussion
Sender: Client
Sent: 2026-04-19T10:01:00Z
Message: Can we add weekly reporting for managers?
```

## 13.3 Chunking rules

- short message: one chunk
- longer message: coherent chunks with overlap
- preserve `provider`, `sentAt`, `threadId`, `messageId`, `projectId`
- include metadata like sender/participants when useful

## 13.4 Retrieval rules for Socrates

Communication chunks must be available for:
- `communication_lookup`
- `change_history`
- `decision_history`
- `original_source` (when the origin is a message)
- `doc_viewer` context if a section has linked messages
- `brain_graph` context when nodes have message-linked changes

## 13.5 Open-target support

Communication layer must support open targets of:
- `message`
- `thread`

Message detail and thread detail routes must return enough metadata for UI navigation.

---

## 14. AI message intelligence layer

## 14.1 Purpose

Raw communication is not enough. Orchestra must understand messages **against the product**.

## 14.2 Inputs to classifier

For each classification, build a context pack from:
- current message
- nearby thread context
- latest accepted Product Brain
- relevant brain nodes
- relevant document sections
- accepted changes
- accepted decisions
- unresolved proposals where relevant

## 14.3 Supported classification outputs

Every message insight should answer:

- What type of message is this?
- How confident are we?
- Does it likely affect current truth?
- Which sections/nodes are affected?
- Is this a decision candidate, change candidate, blocker, approval, or just context?
- What uncertainty remains?

## 14.4 Recommended insight output schema

```json
{
  "insightType": "requirement_change",
  "summary": "Client requested weekly reporting for managers.",
  "confidence": 0.88,
  "shouldCreateProposal": true,
  "shouldCreateDecision": false,
  "proposalType": "requirement_change",
  "affectedDocumentSections": [
    {
      "sectionId": "uuid",
      "relationship": "affected",
      "confidence": 0.87
    }
  ],
  "affectedBrainNodes": [
    {
      "brainNodeId": "uuid",
      "relationship": "affected",
      "confidence": 0.84
    }
  ],
  "oldUnderstanding": {
    "reporting": "No manager-only weekly report requirement"
  },
  "newUnderstanding": {
    "reporting": "Manager weekly reporting required"
  },
  "decisionStatement": null,
  "impactSummary": {
    "scopeImpact": "medium",
    "engineeringImpact": "medium",
    "clientExpectationImpact": "high",
    "summary": "Adds reporting scope and affects dashboard/reporting flows."
  },
  "uncertainty": [
    "The exact report fields were not specified."
  ]
}
```

## 14.5 Classification rules

- do not mark casual brainstorming as a requirement change unless it truly changes accepted understanding
- prefer clarification if intent is ambiguous
- mark contradiction when communication conflicts with current Product Brain or PRD
- mark blocker when implementation is blocked
- mark approval only when wording clearly indicates approval
- preserve uncertainty explicitly

## 14.6 When to create proposals automatically

Suggested thresholds:
- requirement_change: `>= 0.78`
- decision: `>= 0.75`
- approval: `>= 0.75`
- contradiction: `>= 0.72`
- clarification (truth-affecting): `>= 0.82`
- blocker/risk/action_needed: usually insight only, not proposal
- info: no proposal

Use conservative defaults.

---

## 15. Review queue and proposal generation

## 15.1 Review queue purpose

Provide one place where a manager can review:
- important message insights
- generated change proposals
- generated decision candidates
- linked source evidence
- affected product areas

## 15.2 Proposal generation rules

A communication-derived proposal must include:
- title
- summary
- proposal type
- status (`detected` or `needs_review`)
- old understanding
- new understanding
- impact summary
- source message count
- links to source messages/threads
- links to affected document sections/brain nodes

Use `spec_change_links` for durable provenance.

## 15.3 Deduplication

Before creating a new proposal:
- search for open/needs_review proposals for same area
- compare title/summary similarity
- if duplicate, link insight to existing proposal or mark as converted to existing proposal

Do not spam proposals.

## 15.4 Decision candidate generation

For explicit decisions such as:
- “Let’s use Stripe.”
- “Approved — manager approval is required.”
- “Remove admin export from MVP.”

Create a decision candidate / record through the repo’s existing decision path.

Still require manager acceptance.

---

## 16. How PRD/current truth gets updated from communication

This is the core behavior the user explicitly asked for.

## 16.1 The wrong behavior

Wrong:
- overwrite the PRD bytes
- mutate the parsed document text directly
- let messages silently become truth
- lose who said it and where it came from

## 16.2 The correct behavior

Correct:
1. ingest message as immutable evidence
2. classify message
3. resolve affected sections/nodes
4. create a proposal or decision candidate
5. manager reviews and accepts
6. create a new Product Brain/current truth artifact version
7. keep the original PRD unchanged
8. attach overlay markers to affected sections in the viewer
9. let Socrates answer from current truth while still exposing the original evidence

## 16.3 Detailed update algorithm

```text
new message arrives
→ normalized immutable message stored
→ message indexed
→ classifier builds product-aware context
→ insight persisted
→ optional proposal candidate generated
→ manager reviews
→ accepted proposal triggers applyAcceptedChange
→ new accepted Product Brain version generated
→ brain graph refreshed if necessary
→ affected document sections get change markers / overlays
→ dashboard refresh enqueued
→ Socrates retrieval sees updated current truth
```

## 16.4 Viewer behavior after acceptance

The Live Doc Viewer must show:
- the original source section text
- a marker that this section has an accepted change
- a short summary of the accepted change
- a link to the exact message/thread that caused it
- a link to the accepted change record
- optionally the affected brain nodes

## 16.5 Socrates behavior after acceptance

For current-truth questions:
- prefer latest accepted Product Brain
- then accepted changes/decisions
- then original docs/messages as support

For origin/provenance questions:
- prefer original docs/messages
- then accepted overlays/changes
- then current truth summary

---

## 17. API specification for the communication layer

All routes under `/v1`.

## 17.1 Connector routes

### GET `/v1/projects/:projectId/connectors`
Return all connectors for the project.

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "provider": "slack",
      "accountLabel": "Arrayah Slack",
      "status": "connected",
      "lastSyncedAt": "2026-04-19T10:00:00.000Z",
      "lastError": null,
      "configSummary": {
        "channelCount": 2
      }
    }
  ]
}
```

### GET `/v1/projects/:projectId/connectors/:connectorId`
Return one connector detail (manager-only if it includes debug fields).

### PATCH `/v1/projects/:projectId/connectors/:connectorId`
Update config, label, channel selection, folder selection, etc.
Never allow provider change.

### POST `/v1/projects/:projectId/connectors/:provider/connect`
Provider connect/init route.

Behavior by provider:
- `manual_import` → create/return connected manual connector
- `slack` → return OAuth URL and pending auth state
- `gmail` → return OAuth URL and pending auth state
- `outlook` → return OAuth URL and pending auth state
- `microsoft_teams` → return OAuth URL and pending auth state
- `whatsapp_business` → setup/pending config flow

### POST `/v1/projects/:projectId/connectors/:connectorId/sync`
Manager-only. Queue incremental/manual sync.

Response:
```json
{
  "data": {
    "connectorId": "uuid",
    "syncRunId": "uuid",
    "queued": true
  }
}
```

### POST `/v1/projects/:projectId/connectors/:connectorId/revoke`
Revoke credentials and set status=`revoked`.
Do not delete historical evidence.

### GET `/v1/projects/:projectId/connectors/:connectorId/sync-runs`
Return paginated sync run history.

## 17.2 OAuth callback routes

### GET `/v1/oauth/slack/callback`
- verify OAuth state
- exchange code
- store credential
- create/update connector
- enqueue initial backfill
- redirect or return JSON depending frontend pattern

### GET `/v1/oauth/google/callback`
Same for Gmail.

### GET `/v1/oauth/microsoft/callback`
Same for Outlook/Teams.

## 17.3 Webhook routes

### POST `/v1/webhooks/slack`
- verify signature
- handle `url_verification`
- dedupe event
- enqueue sync/ingest
- respond quickly

### POST `/v1/webhooks/gmail`
- verify source/token if watch-based infra is used
- dedupe
- enqueue connector incremental sync

### POST `/v1/webhooks/outlook`
- validate Graph subscription notification
- enqueue sync

### POST `/v1/webhooks/teams`
- validate Graph notification
- enqueue sync

### POST `/v1/webhooks/whatsapp-business`
- verify challenge/token
- verify signature if configured
- dedupe
- normalize inbound messages / media metadata
- enqueue ingest/classification
- return quickly

## 17.4 Manual import route

### POST `/v1/projects/:projectId/communications/import`

Manager-only.

Request:
```json
{
  "provider": "manual_import",
  "accountLabel": "Demo import",
  "thread": {
    "providerThreadId": "thread-reporting-001",
    "subject": "Reporting requirement discussion",
    "participants": [
      { "label": "Client", "externalRef": "client@example.com" },
      { "label": "PM", "externalRef": "pm@studio.com" }
    ],
    "startedAt": "2026-04-19T10:00:00.000Z",
    "threadUrl": "optional"
  },
  "messages": [
    {
      "providerMessageId": "msg-001",
      "senderLabel": "Client",
      "senderExternalRef": "client@example.com",
      "senderEmail": "client@example.com",
      "sentAt": "2026-04-19T10:01:00.000Z",
      "bodyText": "Can we add weekly reporting for managers?",
      "bodyHtml": null,
      "messageType": "user",
      "providerPermalink": "optional",
      "replyToProviderMessageId": null,
      "attachments": []
    }
  ]
}
```

Response:
```json
{
  "data": {
    "connectorId": "uuid",
    "threadId": "uuid",
    "messageIds": ["uuid"],
    "createdMessageCount": 1,
    "updatedRevisionCount": 0,
    "indexed": true,
    "insightJobIds": ["uuid"]
  }
}
```

## 17.5 Timeline, thread, and message routes

### GET `/v1/projects/:projectId/communications/timeline`
Filters:
- provider
- insightType
- hasChangeProposal
- hasOpenDecision
- hasBlocker
- dateFrom
- dateTo
- search
- cursor
- limit

Response items are threads or important grouped timeline units.

### GET `/v1/projects/:projectId/threads`
Filters:
- provider
- updatedSince
- search
- cursor
- limit

### GET `/v1/projects/:projectId/threads/:threadId`
Return:
- thread metadata
- messages ordered ASC by `sentAt`
- thread insights
- linked proposals/decisions
- open targets

### GET `/v1/projects/:projectId/messages/:messageId`
Return:
- message
- message revisions if any
- thread summary
- connector/provider info
- chunks metadata
- linked change proposals
- linked decisions
- linked document sections
- open targets

## 17.6 Insight routes

### GET `/v1/projects/:projectId/message-insights`
Filters:
- status
- insightType
- threadId
- messageId
- provider
- minConfidence
- hasProposal
- cursor
- limit

### GET `/v1/projects/:projectId/message-insights/:insightId`

### POST `/v1/projects/:projectId/message-insights/:insightId/ignore`
Manager-only.

### POST `/v1/projects/:projectId/message-insights/:insightId/create-proposal`
Manager-only.

### POST `/v1/projects/:projectId/messages/:messageId/classify`
Manager-only/debug route.

### POST `/v1/projects/:projectId/threads/:threadId/classify`
Manager-only/debug route.

## 17.7 Review queue route

### GET `/v1/projects/:projectId/communication-review`
Return:
- pending insights needing review
- generated proposals needing review
- generated decision candidates
- source labels
- affected refs
- confidence
- impact summary
- open targets

---

## 18. Authz rules for communication layer

## 18.1 Manager
Can:
- connect/revoke providers
- configure connectors
- run syncs
- import messages
- view all project communication
- view insights
- review and accept/reject proposals
- view provider diagnostics

## 18.2 Dev
Can:
- view project communication if assigned to the project and if product policy allows
- view thread/message detail
- inspect linked proposals/decisions
- use Socrates over communication evidence
- not connect/revoke providers
- not accept/reject truth-affecting proposals

## 18.3 Client
Cannot view internal communication by default.

Possible later exceptions:
- explicitly shared client-safe message summaries
- explicitly shared external-thread evidence only if product decides to expose it

V1 should default to **no internal communication access for clients**.

---

## 19. Job catalog

Recommended communication-layer jobs:

- `sync_communication_connector`
- `ingest_communication_batch`
- `index_communication_message`
- `classify_message_insight`
- `classify_thread_insight`
- `generate_change_proposal_from_insight`
- `renew_gmail_watch`
- `refresh_dashboard_snapshot`
- `apply_accepted_change` (existing Orchestra job)

### Idempotency key examples

- `sync_connector:{connectorId}:{syncType}:{cursorHash}`
- `ingest_message:{connectorId}:{providerMessageId}`
- `index_message:{messageId}:{bodyHash}`
- `classify_message:{messageId}:{bodyHash}`
- `proposal_from_insight:{insightId}`
- `renew_watch:{connectorId}:{dayBucket}`

### Concurrency rules

- never allow two active sync jobs for the same connector at once
- use DB row lock, advisory lock, Redis lock, or transactional guard
- repeated enqueues should return existing running sync when possible

---

## 20. Observability and audit

## 20.1 Audit events

Minimum audit events:
- `communication_connector_created`
- `communication_connector_revoked`
- `communication_manual_imported`
- `communication_sync_started`
- `communication_sync_completed`
- `communication_sync_failed`
- `communication_message_indexed`
- `message_insight_created`
- `communication_change_proposal_created`
- `communication_decision_candidate_created`
- `communication_thread_opened`
- `communication_message_opened`

## 20.2 Metrics

Recommended metrics:
- `communication_connectors_total`
- `communication_sync_runs_total`
- `communication_sync_failures_total`
- `communication_sync_duration_ms`
- `communication_messages_ingested_total`
- `communication_message_revisions_total`
- `communication_message_chunks_indexed_total`
- `communication_insights_created_total`
- `communication_proposals_created_total`
- `communication_provider_rate_limited_total`
- `communication_webhook_events_total`
- `communication_webhook_duplicates_total`

## 20.3 Structured logging

Always log:
- requestId
- projectId
- connectorId
- syncRunId
- provider
- threadId
- messageId
- jobId

Never log:
- access tokens
- refresh tokens
- auth headers
- signing secrets
- webhook secrets
- full raw payloads unless explicit redacted debug mode

---

## 21. Security requirements

## 21.1 Credential storage
- use `CredentialVault` abstraction
- no raw provider tokens in connector rows
- encrypted secret envelope or managed secret store

## 21.2 OAuth security
- one-time state values
- short expiry
- verify actor/project/org
- reject replay/expired state

## 21.3 Webhook security
- verify signatures/tokens
- request size limits
- dedupe by provider event id or payload hash
- quick 2xx response
- heavy work deferred to jobs

## 21.4 HTML / content safety
- HTML-to-text conversion must strip unsafe content
- never render raw provider HTML directly in trusted admin UI without sanitization
- attachments metadata only in V1

## 21.5 Access control
- communication routes are project-scoped
- manager-only for connector control and truth-affecting review
- dev read-only within allowed project scope
- client blocked by default

---

## 22. Performance requirements

- sync must be incremental, not whole-account refetch by default
- webhook requests must not do heavy DB/AI work inline
- timeline endpoints must paginate
- thread detail must order messages cheaply by indexed `sentAt`
- message indexing/classification must run async where needed
- provider APIs must use `$select` / field filtering / pagination / cursor tokens aggressively

---

## 23. Build plan: recommended 4-build split

## Build C1 — Communication foundation
Deliver:
- schema hardening
- connectors table
- sync runs table
- webhook events table
- message revisions/attachments
- manual import connector
- timeline/thread/message routes
- indexing of imported messages
- Socrates retrieval compatibility

## Build C2 — AI communication intelligence
Deliver:
- message insights
- thread insights
- classifier
- affected section/node resolution
- proposal/decision candidate generation
- review queue
- living-spec acceptance flow integration

## Build C3 — Slack + Gmail production connectors
Deliver:
- Slack OAuth + sync + webhook
- Gmail OAuth + watch/poll sync
- secure credential vault
- provider adapters
- cursor management
- rate-limit aware sync jobs

## Build C4 — Outlook + Teams + WhatsApp + hardening
Deliver:
- Outlook connector
- Teams connector
- WhatsApp Business inbound/webhook support
- locking, observability, retry/backoff
- e2e communication-to-brain tests
- production runbooks

---

## 24. Acceptance criteria

The communication layer is complete only when all of the following are true:

1. A manager can create/connect a communication source.
2. The system can ingest messages into normalized threads/messages.
3. Ingestion is idempotent.
4. Message edits do not overwrite original evidence.
5. Messages are chunked and retrievable.
6. Socrates can cite normalized messages.
7. Timeline/thread/message APIs work.
8. The system can classify important messages.
9. The system can generate reviewable proposals/decisions from message insights.
10. A manager can accept a communication-driven proposal.
11. Acceptance creates a new Product Brain/current truth version.
12. The Live Doc Viewer shows overlay markers on affected sections.
13. Dashboard freshness/pressure updates after acceptance.
14. Clients do not see internal communication by default.
15. Provider secrets are stored safely.
16. Webhooks are verified and deduped.
17. All core flows are auditable and retry-safe.

---

## 24A. C1 implementation status in this repo

Build C1 is now implemented in this repository as the communication-foundation slice of the larger communication-layer plan.

What C1 implements:

- hardened communication enums and core tables
- provider-agnostic connectors
- sync runs
- OAuth state and webhook-event dedupe tables
- message revisions
- attachment metadata
- `manual_import` provider
- manager-only manual import
- connector management routes
- timeline/thread/message read routes
- message chunking and embedding
- Socrates retrieval compatibility
- Live Doc Viewer message evidence compatibility
- Dashboard refresh hooks

What remains for later builds:

- OAuth callbacks
- webhook endpoints
- secure live credential storage for real providers
- message insight classification
- automatic proposal/decision generation
- review queue
- outbound messaging

For implementation-grounded details of the finished C1 build, use:

- `feature5.md`
- `communication_layer_C1.md`

---

## 24B. C2 implementation status in this repo

Build C2 is now implemented on top of C1 in this repository.

What C2 implements:

- `message_insights`
- `thread_insights`
- product-aware impact resolution using targeted context packs
- strict-schema message/thread classification
- confidence degradation when affected refs are weak or invalid
- conservative thresholds for proposal generation
- blocker/risk/action-needed insight-only behavior by default
- dedupe / supersession logic against existing open or accepted proposals
- communication-derived `spec_change_proposals`
- open `decision_records` for decision/approval candidates
- manager/dev review queue read model
- manager-only ignore / create-proposal / classify routes
- integration with the existing accepted-change flow so accepted communication proposals still create new Product Brain versions

Current repo-specific clarifications:

- communication-generated proposals are created in `needs_review`, not `detected`
- communication-generated proposal links use:
  - `message` as `source`
  - `thread` as `evidence`
  - `document_section` as `affected`
  - `brain_node` as `affected`
- if a decision candidate already exists when a linked proposal is accepted, the existing `decision_record` is upgraded to `accepted` instead of creating a duplicate decision row
- clients remain blocked from internal communication intelligence by default

For implementation-grounded details of the finished C2 build, use:

- `feature5.md`
- `communication_layer_C2.md`

---

## 24C. C3 implementation status in this repo

Build C3 is now implemented on top of C1 and C2 in this repository.

What C3 implements:

- `CredentialVault` as the only storage path for live provider credentials
- HMAC-signed one-time OAuth state verification using `oauth_states`
- Slack OAuth callback flow
- Gmail OAuth callback flow
- Slack history + replies sync
- Slack Events API webhook verification + dedupe + job enqueue
- Gmail polling/manual incremental sync
- provider cursor advancement through `communication_connectors.provider_cursor_json`
- connector sync job loading credentials through the vault
- safe revocation without deleting historical evidence

Current repo-specific clarifications:

- Gmail is implemented with robust polling/manual incremental sync; push/watch notification handling is still deferred
- provider credentials are not stored in Prisma rows; only `credentials_ref` is stored there
- development/test may use in-memory vault mode, but production must use encrypted file mode
- Slack delete events mark `isDeletedByProvider = true` and preserve the original normalized evidence rows
- message edits still create `communication_message_revisions` through the existing ingestion service

For implementation-grounded details of the finished C3 build, use:

- `feature5.md`
- `communication_layer_C3.md`

---

## 24D. C4 implementation status in this repo

Build C4 is now implemented on top of C1, C2, and C3 in this repository.

What C4 implements:

- Outlook connector via Microsoft Graph
- Microsoft Teams connector via Microsoft Graph
- WhatsApp Business inbound/webhook verification and normalization
- shared Microsoft OAuth callback handling
- provider sync runtime locking so one connector cannot run multiple live syncs at once
- retry-after aware provider sync retry/backoff handling
- communication-summary integration into dashboard snapshots
- additional observability counters for syncs, rate limits, webhooks, and connector creation

Current repo-specific clarifications:

- Outlook and Teams are functional with mocked/provider-fixture coverage and use the shared `/v1/oauth/microsoft/callback` route
- Outlook sync uses Microsoft Graph mail folder message reads and stores metadata-only attachments
- Teams sync ingests configured team/channel roots and replies and stores them in the provider-agnostic thread/message model
- WhatsApp Business is inbound/webhook-first; manual sync remains a safe no-op summary path
- WhatsApp status-only events do not create user-message evidence rows
- Gmail watch/webhook flow is still deferred; Gmail remains polling/manual incremental in the current repo
- Microsoft/WhatsApp webhook endpoints are provider-ready and deduped, but full subscription lifecycle automation is still a later hardening layer

For implementation-grounded details of the finished C4 build, use:

- `feature5.md`
- `communication_layer_C4.md`

---

## 25. Source-of-truth references inside the repo

This file is specifically aligned to these repo concepts:

- communication ingestion is mandatory for MVP
- communication-driven change detection is mandatory
- current truth is versioned and derived, not rewritten
- Product Brain / Socrates / Viewer / Dashboard must stay coherent
- current truth vs original source precedence must remain explicit

When implementing, always preserve those rules.

---

## 26. External provider references (official docs)

Use these official docs when coding providers:

### Slack
- <https://api.slack.com/authentication>
- <https://api.slack.com/authentication/oauth-v2>
- <https://api.slack.com/methods/oauth.v2.access>
- <https://api.slack.com/docs/verifying-requests-from-slack>
- <https://api.slack.com/apis/connections/events-api>
- <https://api.slack.com/events/url_verification>
- <https://api.slack.com/methods/conversations.history>
- <https://api.slack.com/methods/conversations.replies>

### Gmail
- <https://developers.google.com/workspace/gmail/api/reference/rest>
- <https://developers.google.com/workspace/gmail/api/guides/push>
- <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch>
- <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list>
- <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get>
- <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get>

### Microsoft Graph (Outlook / Teams)
- <https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0>
- <https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0>
- <https://learn.microsoft.com/en-us/graph/delta-query-overview>
- <https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0>
- <https://learn.microsoft.com/graph/api/channel-list-messages?tabs=http&view=graph-rest-1.0>
- <https://learn.microsoft.com/en-us/graph/teams-messaging-overview>
- <https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage>

### WhatsApp Business / Cloud API
- <https://developers.facebook.com/docs/whatsapp/cloud-api/overview>
- <https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-08213e00-c6d0-48a2-8be8-62247b8d29bd>

---

## 27. Final engineering principle

Do **not** build the communication layer as “a multi-channel inbox with AI summaries.”

Build it as:

**a provider-agnostic, evidence-first communication system that updates the living product truth only through auditable, reviewable, source-linked change and decision flows.**

That is the communication layer Orchestra actually needs.
