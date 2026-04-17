# Orchestra Backend Plan

## 1. Purpose

This document is the **backend implementation blueprint** for the current Orchestra product.

It is written so that a strong backend engineer — human or coding agent — can use it as an implementation contract.

The product this backend is for is:

- **not** the old prototype/board-sync/control-tower Orchestra,
- **not** a generic shared inbox,
- **not** a task manager.

It is the current Orchestra:

> a PRD-aware, AI-centric product brain and communication system for client-facing software teams.

The backend must power:

1. Product Brain  
2. Socrates  
3. Live Doc Viewer  
4. Dashboard  

and the mandatory underlying system behavior that makes those four surfaces correct.

---

## 2. Backend non-negotiables

These rules are product rules, not coding preferences.

## 2.1 Original sources are immutable
Uploaded docs and ingested messages are immutable source evidence.
Never rewrite or silently mutate them.

## 2.2 Current truth is derived
The system’s “current truth” is derived from:
- uploaded docs
- accepted structured interpretation
- accepted change records
- accepted decisions

## 2.3 Every accepted change must remain linked
If communication changes the spec, the accepted change must remain linked to:
- source platform
- source thread/message
- affected document section(s)
- affected brain node(s)
- who accepted it
- when it was accepted

## 2.4 Socrates is citation-first
The backend must never return hand-wavy answers without source targets.

## 2.5 Page context is first-class
The backend must treat current page context as part of the Socrates contract.

## 2.6 Minimal frontend, strong backend
The frontend is intentionally minimal.  
That means the backend must expose clean, composable read models instead of raw internal tables.

## 2.7 Provider-agnostic communication model
The system must support multiple comms providers under one normalized data model.

## 2.8 Build for production, not only demo
All core flows must be:
- idempotent
- retry-safe
- auditable
- role-gated
- observable

---

## 3. Proposed backend stack

This plan chooses the stack that best fits the current product and design constraints.

### Runtime
- **Node.js**
- **TypeScript**
- **Fastify**

### Primary database
- **PostgreSQL**
- **pgvector** extension for embeddings

### ORM / schema
- **Prisma** (or Drizzle if you decide to switch, but this document assumes Prisma)

### Queue / async jobs
- **BullMQ + Redis**
- Redis also used for rate limiting / short-lived caches

### Storage
- **S3-compatible object storage**
- local storage allowed only in development

### AI
- **Primary reasoning model:** Anthropic Claude Sonnet 4
- **Embeddings:** OpenAI `text-embedding-3-small` (or Voyage as a later swap)
- **Transcription (if needed):** Whisper / equivalent
- Provider abstraction required

### Streaming / realtime
- **SSE** for Socrates streaming
- optional **WebSocket** or SSE event channel for job/dashboard invalidation
- do not make the product depend on WebSocket for correctness

### Auth
- JWT access tokens
- refresh tokens
- role-based access control
- project-scoped authorization

### Observability
- structured logs
- Sentry or equivalent error tracking
- metrics / traces (OpenTelemetry if possible)
- job monitoring

---

## 4. High-level architecture

```text
Frontend clients
  ├─ manager workspace
  ├─ dev workspace
  └─ client read-only view
           ↓
      Fastify API
           ↓
  Domain modules / services
  ├─ auth
  ├─ projects
  ├─ documents
  ├─ brain
  ├─ communications
  ├─ changes
  ├─ decisions
  ├─ socrates
  ├─ viewer
  ├─ dashboard
  ├─ jobs
  ├─ audit
  └─ realtime
           ↓
 Shared infrastructure
  ├─ AI provider layer
  ├─ embeddings / retrieval
  ├─ storage
  ├─ parsers
  ├─ security
  └─ metrics/logging
           ↓
 PostgreSQL + pgvector
 Redis
 S3
```

---

## 5. Recommended module structure

```text
src/
  app/
    server.ts
    worker.ts
    middleware/
      auth.ts
      request-context.ts
      errors.ts
  config/
    env.ts
  db/
    prisma.ts
  lib/
    ai/
      provider.ts
      anthropic.ts
      openai-embeddings.ts
      mock.ts
    storage/
      s3.ts
      local.ts
    parsers/
      pdf.ts
      docx.ts
      text.ts
      html.ts
      url.ts
    retrieval/
      embeddings.ts
      hybrid-search.ts
      ranking.ts
    security/
      validation.ts
      crypto.ts
    ids/
      stable-ids.ts
    logging/
      logger.ts
  modules/
    auth/
    organizations/
    users/
    projects/
    memberships/
    documents/
    brain/
    communications/
    changes/
    decisions/
    socrates/
    viewer/
    dashboard/
    jobs/
    audit/
    realtime/
  types/
    *.ts
prisma/
  schema.prisma
  migrations/
```

---

## 6. Core domain model

The backend should be organized around a small set of stable domain objects.

## 6.1 Organization and identity

### organizations
- `id`
- `name`
- `slug`
- `created_at`
- `updated_at`

### users
- `id`
- `org_id`
- `email`
- `password_hash` or auth_provider linkage
- `display_name`
- `job_title`
- `global_role` (`owner`, `admin`, `member`)
- `workspace_role_default` (`manager`, `dev`, `client`)
- `created_at`
- `updated_at`

### refresh_tokens
- `id`
- `user_id`
- `org_id`
- `token_hash`
- `expires_at`
- `revoked_at`
- `created_at`

---

## 6.2 Projects and membership

### projects
- `id`
- `org_id`
- `name`
- `slug`
- `description`
- `status` (`active`, `paused`, `archived`)
- `preview_url` nullable
- `created_by`
- `created_at`
- `updated_at`

### project_members
- `id`
- `project_id`
- `user_id`
- `project_role` (`manager`, `dev`, `client`)
- `role_in_project` text
- `allocation_percent` nullable
- `weekly_capacity_hours` nullable
- `is_active`
- `joined_at`
- `updated_at`

### Why allocation fields matter
The current MVP dashboard requires:
- team headcount,
- team breakdown,
- project-wise and general breakdown,
- and a minimal pressure/workload view.

Those allocation/capacity fields are enough to support that without building a full task/HR system.

---

## 6.3 Documents and parsing

### documents
Logical document record.

- `id`
- `project_id`
- `kind` (`prd`, `srs`, `meeting_note`, `call_note`, `reference`, `internal_note`, `other`)
- `title`
- `current_version_id`
- `uploaded_by`
- `created_at`
- `updated_at`

### document_versions
Immutable source-file versions.

- `id`
- `document_id`
- `project_id`
- `file_key`
- `mime_type`
- `file_size`
- `status` (`pending`, `processing`, `ready`, `partial`, `failed`)
- `parse_confidence`
- `source_label`
- `uploaded_by`
- `created_at`
- `processed_at`

### document_sections
Structured parsed sections/anchors for viewer + citations.

- `id`
- `document_version_id`
- `project_id`
- `section_key`
- `heading_path`
- `page_number` nullable
- `anchor_text`
- `normalized_text`
- `char_start` nullable
- `char_end` nullable
- `order_index`
- `metadata_json`
- `created_at`

### document_chunks
Retrieval units for docs.

- `id`
- `document_version_id`
- `section_id` nullable
- `project_id`
- `chunk_index`
- `content`
- `embedding`
- `token_count`
- `page_number` nullable
- `metadata_json`
- `created_at`

### Important rule
The viewer should not rely on chunks for rendering.  
Chunks are for retrieval.  
Sections/anchors are for user navigation.

---

## 6.4 Versioned artifacts

The backend should use a generic artifact table for major derived states.

### artifact_versions
- `id`
- `project_id`
- `artifact_type`
- `version_number`
- `parent_version_id` nullable
- `status` (`draft`, `accepted`, `superseded`, `failed`)
- `source_refs_json`
- `payload_json`
- `change_summary`
- `created_by`
- `created_at`
- `accepted_at` nullable

### Recommended artifact types
- `source_package`
- `clarified_brief`
- `project_brain`
- `brain_graph`
- `dashboard_snapshot`

### Why generic artifacts
This lets the system keep:
- immutable versions,
- lineage,
- compares,
- and history,

without building a one-off versioning system for every derived state.

---

## 6.5 Product Brain graph

### brain_nodes
- `id`
- `artifact_version_id`
- `project_id`
- `node_key`
- `node_type` (`module`, `flow`, `constraint`, `integration`, `decision`, `unknown`, `source_cluster`)
- `title`
- `summary`
- `status`
- `priority`
- `metadata_json`
- `created_at`

### brain_edges
- `id`
- `artifact_version_id`
- `project_id`
- `from_node_id`
- `to_node_id`
- `edge_type` (`depends_on`, `relates_to`, `changed_by`, `supported_by`, `references`)
- `weight` nullable
- `metadata_json`
- `created_at`

### Why `source_cluster`
The design sketch for the Brain suggests a connected representation of:
- docs
- comms
- recordings
- other source groups

So the graph should support both:
- product structure nodes
- source-domain nodes

without collapsing them into one flat type.

---

## 6.6 Communication model

### communication_connectors
- `id`
- `project_id`
- `provider` (`slack`, `gmail`, `whatsapp_business`)
- `account_label`
- `status` (`connected`, `syncing`, `error`, `revoked`)
- `credentials_ref`
- `config_json`
- `last_synced_at`
- `created_by`
- `created_at`
- `updated_at`

### communication_sync_runs
- `id`
- `connector_id`
- `status`
- `started_at`
- `finished_at`
- `summary_json`
- `error_message` nullable

### communication_threads
- `id`
- `project_id`
- `connector_id`
- `provider_thread_id`
- `subject` nullable
- `participants_json`
- `started_at`
- `last_message_at`
- `created_at`
- `updated_at`

### communication_messages
- `id`
- `project_id`
- `connector_id`
- `thread_id`
- `provider_message_id`
- `sender_label`
- `sender_email_or_user_id` nullable
- `sent_at`
- `body_text`
- `body_html` nullable
- `message_type`
- `reply_to_message_id` nullable
- `raw_metadata_json`
- `created_at`

### message_chunks
- `id`
- `message_id`
- `project_id`
- `chunk_index`
- `content`
- `embedding`
- `token_count`
- `metadata_json`
- `created_at`

### Important rule
Messages are immutable.  
Insights and changes are derived on top of them.

---

## 6.7 Message intelligence and change tracking

### message_insights
- `id`
- `project_id`
- `message_id`
- `insight_type` (`clarification`, `decision`, `change`, `contradiction`, `blocker`, `info`)
- `summary`
- `confidence`
- `affected_refs_json`
- `created_at`

### spec_change_proposals
- `id`
- `project_id`
- `title`
- `summary`
- `proposal_type` (`requirement_change`, `decision_change`, `clarification`, `contradiction_resolution`)
- `status` (`detected`, `needs_review`, `accepted`, `rejected`, `superseded`)
- `source_message_count`
- `old_understanding_json`
- `new_understanding_json`
- `impact_summary_json`
- `accepted_brain_version_id` nullable
- `accepted_by` nullable
- `accepted_at` nullable
- `created_at`
- `updated_at`

### spec_change_links
- `id`
- `spec_change_proposal_id`
- `link_type` (`message`, `thread`, `document_section`, `brain_node`)
- `link_ref_id`
- `relationship` (`source`, `affected`, `evidence`)
- `created_at`

### decision_records
- `id`
- `project_id`
- `title`
- `statement`
- `status` (`open`, `accepted`, `rejected`, `superseded`)
- `source_summary`
- `accepted_by` nullable
- `accepted_at` nullable
- `created_at`
- `updated_at`

### Why separate proposals from decisions
Not every communication update is a final decision.
The system must be able to hold:
- detected candidate,
- under review,
- accepted,
- rejected,
- superseded

without corrupting the history.

---

## 6.8 Socrates model

### socrates_sessions
- `id`
- `project_id`
- `user_id`
- `page_context`
- `selected_ref_type` nullable
- `selected_ref_id` nullable
- `created_at`
- `updated_at`

### socrates_messages
- `id`
- `session_id`
- `role` (`user`, `assistant`)
- `content`
- `citations_json`
- `open_targets_json`
- `created_at`

### socrates_suggestions
- `id`
- `session_id`
- `page_context`
- `suggestions_json`
- `created_at`
- `expires_at`

### Key idea
Socrates is not just chat history.  
It is a contextual working session.

---

## 6.9 Dashboard model

### dashboard_snapshots
- `id`
- `project_id` nullable
- `org_id`
- `scope` (`general`, `project`)
- `payload_json`
- `computed_at`

### Why snapshots
The design doc explicitly suggests snapshotting for dashboard performance.
This is correct.
Dashboards should read from precomputed snapshots, not expensive live joins on every page load.

---

## 6.10 Audit and jobs

### audit_events
- `id`
- `project_id` nullable
- `org_id`
- `actor_user_id` nullable
- `event_type`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

### job_runs
- `id`
- `job_type`
- `status`
- `idempotency_key`
- `payload_json`
- `attempt_count`
- `scheduled_at`
- `started_at`
- `finished_at`
- `last_error`
- `created_at`

---

## 7. Main backend workflows

## 7.1 Document ingestion workflow

```text
upload file
→ persist document + document_version
→ enqueue parse job
→ parse file into sections
→ create section anchors
→ create retrieval chunks
→ embed chunks
→ mark document_version ready/partial/failed
→ emit processing event
→ refresh source package / brain if needed
```

### Requirements
- parsing must be async
- failures must be visible
- partial parsing must be represented honestly
- original file must stay accessible
- parsed sections must be viewer-friendly
- chunks must be retrieval-friendly

---

## 7.2 Product Brain generation workflow

```text
ready documents
→ build Source Package
→ build Clarified Brief
→ build Project Brain artifact
→ build Brain Graph projection
→ mark current accepted version
```

### Important rule
The backend should separate:
- raw parsed documents
- structured source package
- clarified brief
- current product brain
- graph projection

Even if the frontend mostly exposes “Brain” as one surface, these are different system steps.

---

## 7.3 Communication ingestion workflow

```text
connector sync/webhook
→ normalize thread + messages
→ store immutable messages
→ chunk/index messages
→ run message insight classification
→ create change/decision candidates if relevant
→ notify project workspace
```

### Requirements
- every message must preserve provider ids
- the sync must be idempotent
- retries must not duplicate messages
- message updates/edits must be handled per provider rules
- system must preserve which platform the change came from

---

## 7.4 Accepted change application workflow

```text
change proposal detected
→ manager reviews
→ accept change
→ create new Product Brain version
→ update graph if needed
→ persist link to source messages
→ mark affected document sections
→ expose new current truth
```

### Critical rule
Accepting a change must **not** mutate:
- original documents
- original messages

It creates a new derived current truth.

---

## 7.5 Socrates answer workflow

```text
receive user message
→ load session + page context + selected entity
→ load latest accepted brain version
→ retrieve top relevant document sections
→ retrieve top relevant messages / changes / decisions
→ build grounded context bundle
→ ask model
→ validate output schema
→ return streamed answer with citations + open targets
→ store assistant message
```

### Requirements
- citations must point to exact navigable targets
- answers should prioritize current truth over stale original text
- answers must still expose original evidence
- page context should bias retrieval and suggestion generation

---

## 7.6 Doc Viewer navigation workflow

```text
open doc
→ fetch viewer payload
→ open at anchor/page if provided
→ if citation selected, highlight section/chunk
→ if section has accepted change marker, show linked change record
→ if change selected, show linked source messages
```

### Requirements
The viewer must support both directions:
- answer/message → doc
- doc → source/change/message context

---

## 7.7 Dashboard snapshot workflow

```text
cron or event trigger
→ compute general metrics
→ compute project metrics
→ compute team headcount/breakdown
→ compute workload summaries
→ compute change pressure / brain freshness
→ persist dashboard snapshots
→ invalidate dashboard cache
```

### Why event + cron
- cron gives a stable freshness floor
- events allow quicker refresh after meaningful actions

---

## 8. Suggested API surface

## 8.1 Auth
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

## 8.2 Projects
- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/:projectId`
- `PATCH /v1/projects/:projectId`
- `GET /v1/projects/:projectId/members`
- `POST /v1/projects/:projectId/members`
- `PATCH /v1/projects/:projectId/members/:memberId`

## 8.3 Documents / Brain
- `POST /v1/projects/:projectId/documents/upload`
- `GET /v1/projects/:projectId/documents`
- `GET /v1/projects/:projectId/documents/:documentId`
- `GET /v1/projects/:projectId/documents/:documentId/view`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId`
- `POST /v1/projects/:projectId/brain/rebuild`
- `GET /v1/projects/:projectId/brain/current`
- `GET /v1/projects/:projectId/brain/versions`
- `GET /v1/projects/:projectId/brain/graph/current`
- `GET /v1/projects/:projectId/brain/diff?from=:id&to=:id`

## 8.4 Communications
- `POST /v1/projects/:projectId/connectors/:provider/connect`
- `POST /v1/webhooks/slack`
- `POST /v1/webhooks/gmail`
- `POST /v1/webhooks/whatsapp-business`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/threads/:threadId`
- `GET /v1/projects/:projectId/messages/:messageId`

## 8.5 Changes / Decisions
- `GET /v1/projects/:projectId/change-proposals`
- `GET /v1/projects/:projectId/change-proposals/:proposalId`
- `POST /v1/projects/:projectId/change-proposals/:proposalId/accept`
- `POST /v1/projects/:projectId/change-proposals/:proposalId/reject`
- `GET /v1/projects/:projectId/decisions`
- `GET /v1/projects/:projectId/decisions/:decisionId`

## 8.6 Socrates
- `POST /v1/projects/:projectId/socrates/sessions`
- `PATCH /v1/projects/:projectId/socrates/sessions/:sessionId/context`
- `GET /v1/projects/:projectId/socrates/sessions/:sessionId/suggestions`
- `POST /v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream`
- `GET /v1/projects/:projectId/socrates/sessions/:sessionId/messages`

## 8.7 Dashboard
- `GET /v1/dashboard/general`
- `GET /v1/projects/:projectId/dashboard`
- `GET /v1/projects/:projectId/team-summary`

## 8.8 Client view
- `GET /v1/client/:token/project-summary`
- `GET /v1/client/:token/brain`
- `GET /v1/client/:token/preview`
- `GET /v1/client/:token/docs/:documentId/view`

---

## 9. Socrates answer contract

The Socrates backend should return structured assistant messages like:

```json
{
  "answer_md": "The reporting requirement was first introduced in the PRD and later changed in a Slack thread on April 10.",
  "citations": [
    {
      "type": "document_section",
      "documentId": "doc_123",
      "documentVersionId": "docv_1",
      "anchorId": "anchor_reporting_2",
      "pageNumber": 6,
      "label": "PRD — Reporting Requirements"
    },
    {
      "type": "message",
      "threadId": "thread_456",
      "messageId": "msg_789",
      "label": "Slack message from Jack"
    }
  ],
  "open_targets": [
    {
      "targetType": "document_section",
      "targetRef": {
        "documentId": "doc_123",
        "anchorId": "anchor_reporting_2"
      }
    }
  ],
  "suggested_prompts": [
    "Show me all accepted changes affecting reporting",
    "Summarize the current reporting flow for engineering"
  ]
}
```

This contract is what makes frontend click-through behavior possible.

---

## 10. Live Doc Viewer contract

The doc viewer endpoint should return something like:

```json
{
  "document": {
    "id": "doc_123",
    "title": "Core PRD",
    "versionId": "docv_1",
    "kind": "prd"
  },
  "sections": [
    {
      "sectionId": "sec_1",
      "anchorId": "anchor_reporting_2",
      "pageNumber": 6,
      "headingPath": ["Features", "Reporting"],
      "text": "...",
      "changeMarkers": [
        {
          "changeProposalId": "chg_1",
          "status": "accepted",
          "sourceMessageIds": ["msg_789"]
        }
      ]
    }
  ]
}
```

This is critical because the frontend needs markers and anchors, not just raw PDF URLs.

---

## 11. Role and authorization model

## 11.1 Manager role
Can:
- write docs
- manage connectors
- accept/reject changes
- manage members
- access general dashboard
- configure client sharing

## 11.2 Dev role
Can:
- read assigned projects
- use Socrates
- read docs, brain, changes, project dashboard
- optionally upload internal notes

Cannot:
- accept/reject authoritative client changes
- view org-wide manager-only summaries
- manage connectors or memberships

## 11.3 Client role
Can:
- read explicitly shared project view
- read explicitly shared docs
- read current shared brain
- use preview URL if shared

Cannot:
- view internal-only change history
- view internal-only docs
- view internal decisions not meant for client

Authorization must be enforced on the server, not hidden by the frontend.

---

## 12. Security and production readiness

The backend must ship with:

- strict request validation
- org/project scoping
- hashed refresh tokens
- connector credential encryption or vault references
- file type allowlists
- size limits
- SSRF-safe URL ingestion
- secret leak detection for generated/public content
- signed object URLs
- audit events for approvals and access-sensitive actions
- rate limits for auth and public routes

Also required:
- no local filesystem storage in production
- production env validation at boot
- no dev auth mode in production

---

## 13. Observability and operations

## 13.1 Logging
Use structured logs with:
- request id
- project id
- user id
- job id
- connector id
- session id

## 13.2 Error tracking
Use Sentry or equivalent.

## 13.3 Metrics
Track:
- doc ingestion time
- parse success/failure
- retrieval latency
- Socrates answer latency
- connector sync lag
- snapshot generation time
- accepted change count
- dashboard cache freshness

## 13.4 Audit trail
Audit events should exist for:
- doc uploads
- connector changes
- accepted/rejected spec changes
- brain version creation
- preview sharing changes
- membership changes

---

## 14. Testing plan

## 14.1 Unit tests
- parser logic
- section/chunk generation
- retrieval ranking
- change classification
- current-truth application logic
- citation target construction
- role guards
- snapshot aggregation

## 14.2 Integration tests
- upload doc → brain generated
- connect Slack/Gmail → messages ingested
- message → change proposal created
- accept change → new brain version created
- Socrates answer → exact doc/message citation returned
- dashboard snapshot → general and project payload valid

## 14.3 Contract tests
- dashboard payloads
- brain payload
- viewer payload
- Socrates response schema
- change proposal / decision endpoints

## 14.4 End-to-end tests
- manager journey
- dev journey
- client read-only journey

---

## 15. Delivery sequencing recommendation

### Sequence 1
Foundation + auth + projects + storage + jobs

### Sequence 2
Documents + parsing + section/chunk model

### Sequence 3
Source package + clarified brief + brain version + graph

### Sequence 4
Viewer payloads + anchors + citations

### Sequence 5
Socrates sessions + suggestions + streaming answers

### Sequence 6
Slack/Gmail ingestion + message intelligence + change proposals

### Sequence 7
Accepted change → new brain version + markers

### Sequence 8
Dashboard snapshots + team summaries

### Sequence 9
Client read-only projection + sharing controls

### Sequence 10
Hardening, telemetry, rollback handling

---

## 16. Final engineering principle

**Do not build Orchestra as “chat over docs”.**  
Build it as a versioned, communication-aware product-truth system with AI on top.

That is the difference between a nice demo and a real product.


---

## 17. Job catalog and worker design

All long-running or retry-sensitive work should go through `job_runs`.

### Recommended job types
- `parse_document_version`
- `embed_document_chunks`
- `build_source_package`
- `build_clarified_brief`
- `build_project_brain`
- `build_brain_graph`
- `sync_connector_messages`
- `classify_message_insights`
- `build_change_proposal`
- `apply_accepted_change`
- `precompute_socrates_suggestions`
- `refresh_dashboard_snapshot`
- `backfill_document_sections`
- `backfill_message_chunks`

### Worker rules
- workers claim jobs atomically
- every job must have an idempotency key
- every job must be safe to retry
- session/object state must roll back or remain coherent if enqueue fails
- jobs must emit audit events for meaningful lifecycle points

### Example idempotency key patterns
- `parse_document_version:{documentVersionId}:{updatedAt}`
- `sync_connector_messages:{connectorId}:{cursorHash}`
- `apply_accepted_change:{changeProposalId}:{statusVersion}`
- `refresh_dashboard_snapshot:{scope}:{projectId or orgId}:{timeBucket}`

---

## 18. Retrieval design

Orchestra needs two retrieval domains:

### 18.1 Document retrieval
Used by:
- Socrates
- Doc Viewer
- Product Brain generation
- click-to-source features

### 18.2 Communication retrieval
Used by:
- Socrates
- change detection
- message-to-spec linking
- historical provenance queries

### Retrieval strategy
Use hybrid retrieval:
- semantic vector similarity
- lexical / keyword match
- section priority
- page-context weighting
- recency weighting for communications
- accepted-truth weighting for current-brain answers

### Retrieval sources for Socrates
Socrates should retrieve from:
1. current accepted brain artifact
2. brain nodes / edges
3. document sections
4. document chunks
5. accepted change records
6. decision records
7. communication messages / chunks
8. selected page context and selected entity

### Retrieval rule
If the user asks about “current truth”, accepted brain + accepted changes rank above raw original text.
If the user asks “where was this originally mentioned”, original documents rank above current-truth summary.

---

## 19. Communication provider design

The connector layer must be provider-agnostic.

## 19.1 Slack
Preferred modes:
- app + OAuth
- event/webhook ingestion where useful
- periodic backfill sync for missed events

Minimum message capture:
- channel / thread ids
- sender
- timestamp
- text
- message edits if available
- permalink / provider deep link

## 19.2 Gmail
Preferred modes:
- Google OAuth
- Gmail watch / polling hybrid depending operational setup

Minimum message capture:
- thread id
- message id
- from / to
- subject
- body text / HTML
- sent_at
- labels if useful

## 19.3 WhatsApp Business
This should be designed in from day one even if operational rollout is later.

Minimum model support:
- conversation id
- message id
- sender/recipient
- timestamp
- text
- media metadata
- reply relationships

Important note:
WhatsApp Business rollout may be blocked by external approval / account setup.  
That must not break the architecture.

### Connector safety rules
- never store raw OAuth access tokens in plaintext
- store provider cursor/state separately
- sync must be idempotent
- provider rate limits must be respected
- every message must carry stable provider ids

---

## 20. Living spec update engine — exact backend behavior

This is the most important logic in the new Orchestra backend.

### Step 1: detect candidate
A new or edited message arrives.
It is classified as a possible:
- clarification
- decision
- requirement change
- contradiction
- blocker

### Step 2: resolve impact
The system links the message to:
- affected document section(s)
- affected brain node(s)
- current decision/change context

### Step 3: create proposal
A `spec_change_proposal` is created with:
- old understanding
- proposed new understanding
- source evidence
- impact summary

### Step 4: review
A manager accepts or rejects the proposal.

### Step 5: apply accepted proposal
If accepted:
- create a new Product Brain artifact version
- update or regenerate the graph projection
- persist change links
- attach markers to affected document sections
- update dashboard freshness/change pressure
- make new version current

### Step 6: preserve history
The original docs remain unchanged.
The accepted change remains queryable forever.

### Absolute rule
The system must never “quietly rewrite the PRD”.  
It must apply **structured overlays / updated current truth**, not destructive mutation.

---

## 21. Page-aware Socrates design

Page context is not cosmetic.  
It must change retrieval and output behavior.

### 21.1 Context object
Each Socrates session should have a context object like:

```json
{
  "projectId": "proj_x",
  "pageContext": "doc_viewer",
  "selectedRef": {
    "type": "document_section",
    "id": "sec_123"
  },
  "viewerState": {
    "documentId": "doc_1",
    "documentVersionId": "docv_3",
    "pageNumber": 6,
    "anchorId": "anchor_reporting"
  }
}
```

### 21.2 Suggestion generation
Suggestions should be generated when:
- a session is created,
- page context changes,
- selected entity changes,
- a relevant brain/change update occurs.

### 21.3 Answer schema
Every assistant response should validate before persistence/return.

Recommended response schema:
- `answer_md`
- `citations[]`
- `open_targets[]`
- `suggested_prompts[]`
- `confidence` optional

### 21.4 Streaming
Use SSE for token streaming because:
- it is simpler to debug,
- easier behind proxies,
- good enough for request-response assistant flows.

---

## 22. Live Doc Viewer backend contract in detail

The doc viewer should not be a raw signed-URL page.

It needs structured data for:
- rendering parsed content
- exact navigation
- section metadata
- change markers
- linked message evidence
- hover/click context

### Recommended viewer payload composition
- document metadata
- ordered sections
- per-section anchors
- per-section page info
- per-section related change markers
- per-section related decision ids
- per-section related message ids
- citation-friendly labels

### Why parsed view matters
If you only return a signed PDF URL:
- Socrates can cite it,
- but the frontend cannot reliably open/highlight the exact place,
- and Mannan’s click-to-source requirement becomes weak.

So the parsed viewer payload is a requirement, not a nicety.

---

## 23. Dashboard computation model

The dashboard should be built from precomputed snapshot services.

### General dashboard sources
- projects
- project_members
- latest product brain version timestamps
- accepted changes in last window
- unresolved change proposals
- allocation/capacity values

### Project dashboard sources
- project metadata
- project members
- role distribution
- allocation/capacity
- latest doc processing status
- latest brain version
- accepted/review-pending changes
- latest decision pressure

### Snapshot cadence
Recommended:
- event-triggered invalidation on meaningful writes
- periodic recompute (e.g. every 5–15 minutes) as a floor

### Dashboard rule
The backend should not expose 50 raw metrics because it can.
It should expose the exact subset the minimal UI needs.

---

## 24. Client view backend design

The client view must be a filtered projection, not the manager view with hidden buttons.

### Client view should include
- project title/summary
- selected brain / flowchart view
- selected shared documents or sections
- live preview URL if configured
- accepted current truth, filtered for client safety

### Client view must exclude
- internal-only docs
- unapproved changes
- internal-only notes
- internal-only change proposals
- internal role-only decision metadata

### Preview behavior
If `preview_url` exists and sharing is enabled:
- return preview info
- allow frontend to embed or link

Else:
- return flowchart/current-brain payload as default preview object

---

## 25. Security requirements specific to this product

Beyond general security, Orchestra needs product-specific guardrails.

### 25.1 Source and evidence isolation
Users may only access docs, messages, and brain versions for:
- their org
- and their allowed projects

### 25.2 Client-safe projections
Client output must always come from filtered read models.

### 25.3 Connector credential safety
- use secret manager or app-level encryption
- do not expose raw tokens to handlers beyond what is necessary
- rotate refresh/access tokens safely

### 25.4 Message and doc provenance integrity
A citation must not be forgeable at the frontend layer.
The backend should validate that:
- cited ref exists
- cited ref belongs to the project
- cited ref is visible to the requester

### 25.5 Change acceptance authority
Only manager-role users should be able to accept or reject authoritative spec changes.

---

## 26. Performance expectations

### Document ingest
- fast upload acknowledgment
- background parse and embed
- partial status supported

### Socrates
- first token quickly
- retrieval under reasonable latency
- no repeated full-brain regeneration per question

### Dashboard
- snapshot reads only
- avoid expensive joins at request time

### Communication sync
- incremental sync, not full refetch
- cursors/watermarks per connector

### Viewer
- section/page payloads must be paginated for large docs
- anchors must open directly without loading the entire corpus into the browser

---

## 27. Deployment topology

Recommended production deployment:

### Services
- **API service**
- **Worker service**
- **Postgres + pgvector**
- **Redis**
- **S3-compatible storage**

### Optional
- CDN / Cloudflare in front
- background scheduler / cron

### Environment rules
- production boot must fail on invalid env
- local storage disabled in production
- insecure dev auth disabled in production

### Monitoring
- error tracking
- metrics
- structured logs
- queue monitoring
- connector sync health dashboards

---

## 28. What not to build into the backend

Do not reintroduce old Orchestra scope by habit.

Unless the product definition changes again, do not build:
- prototype studio APIs
- scope approval workflow
- Jira/Linear sync APIs
- delivery control tower APIs
- task planning engine
- codebase-aware dev agents
- full CRM flows

The backend should stay loyal to the current product.

---

## 29. Definition of backend done

The backend is “done enough” for this product version when:

1. docs upload and parse successfully
2. Product Brain can be built and versioned
3. Brain graph can be fetched
4. doc viewer can open exact cited locations
5. Slack/Gmail comms can be ingested
6. message insights and change proposals can be created
7. accepted change proposals create a new current brain version
8. accepted changes remain linked to exact source messages
9. Socrates can answer with citations and open-target actions
10. dashboards can load from snapshots
11. manager/dev/client role filtering works

If one of those is missing, the product is incomplete.

---

## 30. Final backend principle

**Build Orchestra as a versioned product-truth engine with communication-aware updates, then layer AI interactions on top of that truth.**

If you do that, the frontend can stay simple and the product will still feel intelligent, reliable, and coherent.
