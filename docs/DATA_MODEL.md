# Orchestra Data Model

## 1. Purpose

This document defines the **authoritative backend data model** for the current Orchestra product.

It is written for backend engineers and coding agents. It should be read together with:
- `../README.md`
- `../PRODUCT_OVERVIEW.md`
- `../MVP_SCOPE.md`
- `../FEATURES.md`
- `../BUILD_PLAN.md`
- `../Backend_plan.md`

This data model is for the **current Orchestra**, which is a **Product Brain + Socrates + Live Doc Viewer + Dashboard** system for client-facing software teams.

It is **not** the old full artifact chain product with prototype, planning, board sync, control tower, stakeholder updates, change sync, and handover as first-class shipped surfaces.

The model below is intentionally shaped around these core truths:

1. **Original source evidence is immutable.**
2. **Current truth is derived, versioned, and reviewable.**
3. **Communication can influence current truth only through structured, auditable records.**
4. **Socrates must be able to answer from evidence with exact citations.**
5. **The Live Doc Viewer must be able to open exact document anchors and exact source messages.**
6. **The Dashboard must read from fast snapshot/read models, not expensive live joins.**

---

## 2. Core modeling principles

### 2.1 Separate source evidence from derived understanding

Never store “the current product understanding” directly in uploaded documents or raw messages.

Keep these distinct:
- raw documents
- parsed documents
- raw communication messages
- derived message insights
- change proposals
- decisions
- Source Package
- Clarified Brief
- Workflow DAG / graph
- current accepted Product Brain

### 2.2 Treat accepted truth as versioned artifacts

The system should use a generic artifact version model for major derived states.

At minimum, the current product requires these artifact types:
- `source_package`
- `clarified_brief`
- `brain_graph`
- `product_brain`
- `dashboard_snapshot`

Optional future-compatible artifact types can be added later without changing the core structure.

### 2.3 Preserve message and doc provenance forever

Every accepted change and every decision must be traceable back to:
- the originating message(s)
- the originating thread
- the affected document section(s)
- the affected brain node(s)
- who accepted it
- when it was accepted

### 2.4 Favor normalized joins over giant JSON blobs for critical relationships

For major joins that the system depends on, use explicit tables instead of hiding them inside payload JSON.

Examples:
- change → message link
- change → document section link
- change → brain node link
- Socrates message → citation link

JSON is still appropriate for:
- flexible metadata
- provider payloads
- diagnostic details
- snapshot payloads

### 2.5 Make the data model provider-agnostic

Slack, Gmail, and WhatsApp Business should fit under one communication model.

Do not let provider-specific tables become the primary model.

### 2.6 Build the model for production constraints

The model must support:
- retries
- idempotent sync/integration behavior
- audits
- soft deletes / archival
- pagination
- search
- rate-limited and async workflows

---

## 3. Domain map

The backend should be thought of as 10 domain groups:

1. organization and identity
2. project and membership
3. source documents and parsing
4. Product Brain artifacts and graph
5. communication ingestion
6. message intelligence, decisions, and changes
7. Socrates sessions and citations
8. Live Doc Viewer linking and overlays
9. dashboard snapshots and team summaries
10. audit, jobs, and operational support

---

## 4. Organization and identity

## 4.1 organizations

Represents a customer workspace / company.

### Columns
- `id` UUID PK
- `name` text
- `slug` text unique
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- Use `slug` for human-safe URLs and workspace identification.
- Slug must be immutable after creation unless an explicit rename flow is added.

---

## 4.2 users

Represents a human account inside one organization.

### Columns
- `id` UUID PK
- `org_id` UUID FK → organizations.id
- `email` citext unique per org
- `password_hash` text nullable
- `display_name` text
- `job_title` text nullable
- `global_role` enum: `owner | admin | member`
- `workspace_role_default` enum: `manager | dev | client`
- `is_active` boolean
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- `workspace_role_default` is a default, not the final project-level permission.
- Project-level permissions come from `project_members`.

---

## 4.3 refresh_tokens

Used for refresh-token auth.

### Columns
- `id` UUID PK
- `user_id` UUID FK → users.id
- `org_id` UUID FK → organizations.id
- `token_hash` text unique
- `expires_at` timestamptz
- `revoked_at` timestamptz nullable
- `created_at` timestamptz

### Notes
- Store only hashed refresh tokens.
- Never store raw refresh tokens.

---

## 5. Project and membership

## 5.1 projects

Represents one client-facing product engagement or internal tracked product.

### Columns
- `id` UUID PK
- `org_id` UUID FK → organizations.id
- `name` text
- `slug` text unique per org
- `description` text nullable
- `status` enum: `active | paused | archived`
- `preview_url` text nullable
- `created_by` UUID FK → users.id
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- `preview_url` is for client-facing live preview where available.
- If absent, the client view should fall back to Brain/flowchart/current truth.

---

## 5.2 project_members

Project-scoped membership and capacity information.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `user_id` UUID FK → users.id
- `project_role` enum: `manager | dev | client`
- `role_in_project` text nullable
- `allocation_percent` integer nullable
- `weekly_capacity_hours` integer nullable
- `is_active` boolean
- `joined_at` timestamptz
- `updated_at` timestamptz

### Constraints
- unique `(project_id, user_id)`

### Notes
- `allocation_percent` and `weekly_capacity_hours` are enough for minimal dashboard pressure indicators.
- Do not build a full scheduling system into the core schema.

---

## 6. Source documents and parsing

## 6.1 documents

Logical document records. One document may have many immutable versions.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `kind` enum:
  - `prd`
  - `srs`
  - `meeting_note`
  - `call_note`
  - `reference`
  - `internal_note`
  - `other`
- `title` text
- `current_version_id` UUID nullable FK → document_versions.id
- `uploaded_by` UUID FK → users.id
- `visibility` enum: `internal | shared_with_client`
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- `documents` are logical containers.
- `document_versions` hold immutable source file payloads.

---

## 6.2 document_versions

Immutable file/source versions.

### Columns
- `id` UUID PK
- `document_id` UUID FK → documents.id
- `project_id` UUID FK → projects.id
- `file_key` text
- `checksum_sha256` text
- `mime_type` text
- `file_size` bigint
- `status` enum: `pending | processing | ready | partial | failed`
- `parse_confidence` numeric(4,3) nullable
- `source_label` text nullable
- `parse_warning_json` jsonb nullable
- `uploaded_by` UUID FK → users.id
- `created_at` timestamptz
- `processed_at` timestamptz nullable

### Constraints
- unique `(document_id, checksum_sha256)`

### Notes
- The original uploaded file is immutable.
- If a document is re-uploaded, create a new version row.

---

## 6.3 document_sections

Normalized viewer-friendly sections.

### Columns
- `id` UUID PK
- `document_version_id` UUID FK → document_versions.id
- `project_id` UUID FK → projects.id
- `section_key` text
- `heading_path` text[]
- `page_number` integer nullable
- `page_start` integer nullable
- `page_end` integer nullable
- `anchor_id` text
- `anchor_text` text nullable
- `normalized_text` text
- `char_start` integer nullable
- `char_end` integer nullable
- `order_index` integer
- `metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(document_version_id, anchor_id)`
- unique `(document_version_id, section_key)`

### Notes
- The Live Doc Viewer should render sections, not chunks.
- Sections are the canonical surface for click-to-source and overlay markers.

---

## 6.4 document_chunks

Retrieval units used by Socrates and Brain generation.

### Columns
- `id` UUID PK
- `document_version_id` UUID FK → document_versions.id
- `section_id` UUID nullable FK → document_sections.id
- `project_id` UUID FK → projects.id
- `chunk_index` integer
- `content` text
- `contextual_content` text nullable
- `embedding` vector nullable
- `token_count` integer
- `page_number` integer nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(document_version_id, chunk_index)`

### Notes
- Store raw chunk text plus optional contextualized chunk text.
- Embedding column should use `vector(1536)` if using `text-embedding-3-small`.
- If embeddings are abstracted later, store provider/model metadata in `metadata_json`.

---

## 6.5 document_processing_runs (recommended)

Tracks async parse/index activity.

### Columns
- `id` UUID PK
- `document_version_id` UUID FK → document_versions.id
- `project_id` UUID FK → projects.id
- `status` enum: `queued | parsing | chunking | embedding | completed | partial | failed`
- `summary_json` jsonb nullable
- `started_at` timestamptz nullable
- `finished_at` timestamptz nullable
- `created_at` timestamptz

### Notes
- This is strongly recommended even if not in the first migration.
- It makes job/UI reconciliation much easier.

---

## 7. Product Brain artifacts and graph

## 7.1 artifact_versions

Generic versioned artifact store for major derived states.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `artifact_type` enum:
  - `source_package`
  - `clarified_brief`
  - `brain_graph`
  - `product_brain`
  - `dashboard_snapshot`
- `version_number` integer
- `parent_version_id` UUID nullable FK → artifact_versions.id
- `status` enum: `draft | accepted | superseded | failed`
- `source_refs_json` jsonb nullable
- `payload_json` jsonb
- `change_summary` text nullable
- `created_by` UUID FK → users.id
- `created_at` timestamptz
- `accepted_at` timestamptz nullable

### Constraints
- unique `(project_id, artifact_type, version_number)`
- at most one `accepted` version per `(project_id, artifact_type)` where appropriate

### Notes
- `source_package`, `clarified_brief`, and `product_brain` should all be modeled as immutable artifact versions.
- `brain_graph` should also be versioned as an artifact even if graph nodes/edges are normalized separately.

---

## 7.2 brain_nodes

Represents structured nodes in the current graph.

### Columns
- `id` UUID PK
- `artifact_version_id` UUID FK → artifact_versions.id
- `project_id` UUID FK → projects.id
- `node_key` text
- `node_type` enum:
  - `module`
  - `flow`
  - `constraint`
  - `integration`
  - `decision`
  - `unknown`
  - `source_cluster`
- `title` text
- `summary` text
- `status` enum: `active | unresolved | changed | deprecated`
- `priority` enum: `high | medium | low` nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(artifact_version_id, node_key)`

### Notes
- `source_cluster` supports the design direction where the brain can connect product structure to source domains such as docs, communications, or recordings.

---

## 7.3 brain_edges

Represents graph relationships.

### Columns
- `id` UUID PK
- `artifact_version_id` UUID FK → artifact_versions.id
- `project_id` UUID FK → projects.id
- `from_node_id` UUID FK → brain_nodes.id
- `to_node_id` UUID FK → brain_nodes.id
- `edge_type` enum:
  - `depends_on`
  - `relates_to`
  - `changed_by`
  - `supported_by`
  - `references`
- `weight` numeric(5,2) nullable
- `metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(artifact_version_id, from_node_id, to_node_id, edge_type)`

---

## 7.4 brain_section_links

Maps graph nodes to document sections.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `artifact_version_id` UUID FK → artifact_versions.id
- `brain_node_id` UUID FK → brain_nodes.id
- `document_section_id` UUID FK → document_sections.id
- `relationship` enum: `supports | defines | changes | clarifies | contradicts`
- `created_at` timestamptz

### Notes
- This table is critical for click-to-source and change overlays.
- Do not hide this linkage in artifact payload JSON only.

---

## 8. Communication ingestion

## 8.1 communication_connectors

Project-scoped provider-agnostic communication connectors.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `provider` enum:
  - `manual_import`
  - `slack`
  - `gmail`
  - `outlook`
  - `microsoft_teams`
  - `whatsapp_business`
- `account_label` text
- `status` enum:
  - `pending_auth`
  - `connected`
  - `syncing`
  - `error`
  - `revoked`
- `credentials_ref` text nullable
- `config_json` jsonb nullable
- `provider_cursor_json` jsonb nullable
- `last_synced_at` timestamptz nullable
- `last_error` text nullable
- `created_by` UUID FK → users.id
- `created_at` timestamptz
- `updated_at` timestamptz

### Constraints
- unique `(project_id, provider)`

### Notes
- `manual_import` is the only fully implemented provider in C1.
- `credentials_ref` points to a credential-vault reference, not plaintext tokens.
- C1 intentionally uses one connector per project per provider.

---

## 8.2 communication_sync_runs

Tracks sync/backfill/webhook processing windows.

### Columns
- `id` UUID PK
- `connector_id` UUID FK → communication_connectors.id
- `project_id` UUID FK → projects.id
- `provider` enum matching connector provider
- `sync_type` enum:
  - `manual`
  - `webhook`
  - `backfill`
  - `incremental`
- `status` enum: `queued | running | completed | partial | failed`
- `cursor_before_json` jsonb nullable
- `cursor_after_json` jsonb nullable
- `started_at` timestamptz nullable
- `finished_at` timestamptz nullable
- `summary_json` jsonb nullable
- `error_message` text nullable
- `created_at` timestamptz

### Notes
- Sync runs are auditable and idempotency-keyed through `job_runs`.
- In C1, `manual_import` sync is a no-op/provider-summary path; real provider adapters are stubs.

---

## 8.3 oauth_states

One-time OAuth state records for future provider connect flows.

### Columns
- `id` UUID PK
- `org_id` UUID FK → organizations.id
- `project_id` UUID FK → projects.id
- `provider` enum matching `communication_connectors.provider`
- `actor_user_id` UUID FK → users.id
- `nonce_hash` text unique
- `redirect_after` text nullable
- `expires_at` timestamptz
- `used_at` timestamptz nullable
- `created_at` timestamptz

### Notes
- C1 persists the future-safe model now even though OAuth callback flows are not implemented yet.

---

## 8.4 provider_webhook_events

Deduplicated inbound webhook event log for future real providers.

### Columns
- `id` UUID PK
- `provider` enum matching `communication_connectors.provider`
- `provider_event_id` text
- `connector_id` UUID nullable FK → communication_connectors.id
- `project_id` UUID nullable FK → projects.id
- `event_type` text
- `raw_payload_hash` text
- `status` enum:
  - `received`
  - `ignored_duplicate`
  - `queued`
  - `processed`
  - `failed`
- `received_at` timestamptz
- `processed_at` timestamptz nullable
- `created_at` timestamptz

### Constraints
- unique `(provider, provider_event_id)`

---

## 8.5 communication_threads

Normalized provider-agnostic threads/conversations.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `provider_thread_id` text
- `subject` text nullable
- `normalized_subject` text nullable
- `participants_json` jsonb
- `started_at` timestamptz nullable
- `last_message_at` timestamptz nullable
- `thread_url` text nullable
- `raw_metadata_json` jsonb nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### Constraints
- unique `(connector_id, provider_thread_id)`

### Notes
- `provider` is stored explicitly on the thread for retrieval/read-model efficiency.
- `message_type` is never used to encode provider identity.

---

## 8.6 communication_messages

Immutable normalized source messages with revision-aware updates.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `thread_id` UUID FK → communication_threads.id
- `provider` enum matching connector provider
- `provider_message_id` text
- `provider_permalink` text nullable
- `sender_label` text
- `sender_external_ref` text nullable
- `sender_email` text nullable
- `sent_at` timestamptz
- `body_text` text
- `body_html` text nullable
- `body_hash` text
- `message_type` enum: `user | system | bot | file_share | note | other`
- `is_edited` boolean
- `is_deleted_by_provider` boolean
- `reply_to_message_id` UUID nullable FK → communication_messages.id
- `raw_metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(connector_id, provider_message_id)`

### Notes
- A later import/sync may update the canonical current message row, but the prior body must be preserved in `communication_message_revisions`.
- `body_hash` drives idempotency and re-index behavior.

---

## 8.7 communication_message_revisions

Preserved pre-edit message bodies for immutable evidence history.

### Columns
- `id` UUID PK
- `message_id` UUID FK → communication_messages.id
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `revision_index` integer
- `body_text` text
- `body_html` text nullable
- `body_hash` text
- `raw_metadata_json` jsonb nullable
- `edited_at` timestamptz nullable
- `created_at` timestamptz

### Constraints
- unique `(message_id, revision_index)`

### Notes
- C1 creates a revision only when imported body text/html changes.

---

## 8.8 communication_attachments

Attachment metadata associated with normalized messages.

### Columns
- `id` UUID PK
- `message_id` UUID FK → communication_messages.id
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `provider_attachment_id` text
- `filename` text nullable
- `mime_type` text nullable
- `file_size` bigint nullable
- `provider_url` text nullable
- `storage_status` enum:
  - `metadata_only`
  - `stored`
  - `extraction_pending`
  - `extracted`
  - `failed`
- `file_key` text nullable
- `extraction_text` text nullable
- `raw_metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(message_id, provider_attachment_id)`

### Notes
- C1 stores metadata only. Attachment extraction/storage is deferred.

---

## 8.9 communication_message_chunks

Retrieval units for communication.

### Columns
- `id` UUID PK
- `message_id` UUID FK → communication_messages.id
- `thread_id` UUID FK → communication_threads.id
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `chunk_index` integer
- `content` text
- `contextual_content` text nullable
- `lexical_content` text
- `embedding` vector nullable
- `token_count` integer
- `metadata_json` jsonb nullable
- `created_at` timestamptz

### Constraints
- unique `(message_id, chunk_index)`

### Notes
- Chunks are provider-aware and retrieval-ready.
- C1 builds contextual content from sender, thread subject, timestamp, and attachment names.

---

## 9. Message intelligence, changes, and decisions

## 9.1 message_insights

Stores machine-derived, reviewable insight rows per message body revision.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `message_id` UUID FK → communication_messages.id
- `thread_id` UUID FK → communication_threads.id
- `body_hash` text
- `insight_type` enum:
  - `info`
  - `clarification`
  - `decision`
  - `requirement_change`
  - `contradiction`
  - `blocker`
  - `action_needed`
  - `risk`
  - `approval`
- `status` enum:
  - `detected`
  - `ignored`
  - `converted_to_proposal`
  - `converted_to_decision`
  - `superseded`
- `summary` text
- `confidence` numeric(4,3)
- `should_create_proposal` boolean
- `should_create_decision` boolean
- `proposal_type` enum nullable:
  - `requirement_change`
  - `decision_change`
  - `clarification`
  - `contradiction_resolution`
- `affected_refs_json` jsonb nullable
- `evidence_json` jsonb nullable
- `old_understanding_json` jsonb nullable
- `new_understanding_json` jsonb nullable
- `decision_statement` text nullable
- `impact_summary_json` jsonb nullable
- `uncertainty_json` jsonb nullable
- `model_json` jsonb nullable
- `generated_proposal_id` UUID nullable FK → spec_change_proposals.id
- `generated_decision_id` UUID nullable FK → decision_records.id
- `created_at` timestamptz
- `updated_at` timestamptz

### Constraints
- unique `(message_id, body_hash)`

### Notes
- Message insights are machine-derived, not authoritative truth.
- Each row is tied to a specific normalized message body hash, so reclassified edits do not overwrite prior insight history.
- They feed review queues and reviewable proposals, but never mark truth as accepted by themselves.

---

## 9.2 thread_insights

Stores optional thread-level insight rows across a thread state snapshot.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `connector_id` UUID FK → communication_connectors.id
- `provider` enum matching connector provider
- `thread_id` UUID FK → communication_threads.id
- `thread_state_hash` text
- `insight_type` enum matching `message_insights.insight_type`
- `status` enum matching `message_insights.status`
- `summary` text
- `confidence` numeric(4,3)
- `should_create_proposal` boolean
- `should_create_decision` boolean
- `proposal_type` enum nullable
- `source_message_ids_json` jsonb
- `affected_refs_json` jsonb nullable
- `evidence_json` jsonb nullable
- `old_understanding_json` jsonb nullable
- `new_understanding_json` jsonb nullable
- `decision_statement` text nullable
- `impact_summary_json` jsonb nullable
- `uncertainty_json` jsonb nullable
- `model_json` jsonb nullable
- `generated_proposal_id` UUID nullable FK → spec_change_proposals.id
- `generated_decision_id` UUID nullable FK → decision_records.id
- `created_at` timestamptz
- `updated_at` timestamptz

### Constraints
- unique `(thread_id, thread_state_hash)`

### Notes
- Thread insights are recommended rather than mandatory, but C2 implements them.
- They summarize a thread state and can generate proposals or decisions using the same review flow.

---

## 9.3 spec_change_proposals

Structured candidate changes derived from communication and/or manual review.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `title` text
- `summary` text
- `proposal_type` enum:
  - `requirement_change`
  - `decision_change`
  - `clarification`
  - `contradiction_resolution`
- `status` enum: `detected | needs_review | accepted | rejected | superseded`
- `source_message_count` integer
- `old_understanding_json` jsonb nullable
- `new_understanding_json` jsonb nullable
- `impact_summary_json` jsonb nullable
- `accepted_brain_version_id` UUID nullable FK → artifact_versions.id
- `accepted_by` UUID nullable FK → users.id
- `accepted_at` timestamptz nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- A proposal can exist without being accepted.
- Accepting a proposal creates or helps create a new current truth artifact.
- Communication-generated proposals are created with `status = needs_review` so dashboard pressure and manager review queues can see them immediately.

---

## 9.4 spec_change_links

Normalizes linkage between a proposal and its evidence/affected objects.

### Columns
- `id` UUID PK
- `spec_change_proposal_id` UUID FK → spec_change_proposals.id
- `link_type` enum: `message | thread | document_section | brain_node`
- `link_ref_id` UUID
- `relationship` enum: `source | affected | evidence`
- `created_at` timestamptz

### Notes
- This table is required for traceability and overlays.
- Communication-generated proposals use:
  - `message` as `source`
  - `thread` as `evidence`
  - `document_section` as `affected`
  - `brain_node` as `affected`

---

## 9.5 decision_records

Authoritative accepted/rejected decisions.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `title` text
- `statement` text
- `status` enum: `open | accepted | rejected | superseded`
- `source_summary` text nullable
- `accepted_by` UUID nullable FK → users.id
- `accepted_at` timestamptz nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### Notes
- Communication-derived decision candidates are first created as `open`.
- If the linked communication proposal is accepted later, the existing decision row is upgraded to `accepted` instead of creating a duplicate decision record.

---

## 9.6 section_change_markers (recommended read model)

Optional but strongly recommended for the Doc Viewer.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `document_section_id` UUID FK → document_sections.id
- `spec_change_proposal_id` UUID FK → spec_change_proposals.id
- `status` enum: `accepted | pending`
- `display_payload_json` jsonb
- `created_at` timestamptz

### Notes
- This can also be derived on read.
- If performance becomes an issue, materialize it.

---

## 10. Socrates

## 10.1 socrates_sessions

Persistent contextual sessions.

### Columns
- `id` UUID PK
- `project_id` UUID FK → projects.id
- `user_id` UUID FK → users.id
- `page_context` enum:
  - `dashboard_general`
  - `dashboard_project`
  - `brain_overview`
  - `brain_graph`
  - `doc_viewer`
  - `client_view`
- `selected_ref_type` enum nullable:
  - `document`
  - `document_section`
  - `brain_node`
  - `change_proposal`
  - `decision_record`
  - `dashboard_scope`
- `selected_ref_id` UUID nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### Constraints
- active session uniqueness is optional; multiple sessions per user/project are fine.

---

## 10.2 socrates_messages

Conversation history.

### Columns
- `id` UUID PK
- `session_id` UUID FK → socrates_sessions.id
- `role` enum: `user | assistant`
- `content` text
- `response_status` enum nullable: `streaming | completed | failed`
- `created_at` timestamptz

---

## 10.3 socrates_citations

Normalized citations attached to assistant messages.

### Columns
- `id` UUID PK
- `assistant_message_id` UUID FK → socrates_messages.id
- `project_id` UUID FK → projects.id
- `citation_type` enum: `document_section | document_chunk | message | brain_node | change_proposal | decision_record`
- `ref_id` UUID
- `label` text
- `page_number` integer nullable
- `confidence` numeric(4,3) nullable
- `order_index` integer
- `created_at` timestamptz

### Notes
- Do not keep citations only inside message JSON if the UI needs validation and cross-linking.

---

## 10.4 socrates_open_targets

Represents actionable targets the frontend can open from a Socrates answer.

### Columns
- `id` UUID PK
- `assistant_message_id` UUID FK → socrates_messages.id
- `target_type` enum: `document_section | message | brain_node | dashboard_filter | change_proposal | decision_record`
- `target_payload_json` jsonb
- `order_index` integer
- `created_at` timestamptz

---

## 10.5 socrates_suggestions

Cached page-aware prompt suggestions.

### Columns
- `id` UUID PK
- `session_id` UUID FK → socrates_sessions.id
- `page_context` text
- `suggestions_json` jsonb
- `created_at` timestamptz
- `expires_at` timestamptz nullable

---

## 11. Dashboard snapshots and team summaries

## 11.1 dashboard_snapshots

Precomputed dashboard payloads.

### Columns
- `id` UUID PK
- `project_id` UUID nullable FK → projects.id
- `org_id` UUID FK → organizations.id
- `scope` enum: `general | project`
- `payload_json` jsonb
- `computed_at` timestamptz

### Constraints
- unique `(org_id, scope, project_id)` where appropriate if keeping only the latest snapshot
- or allow history and keep latest via query/index

### Notes
- Snapshots should be cheap to read and safe to invalidate/recompute.

---

## 11.2 team_summary_snapshots (optional)

Useful if you want dedicated lightweight team-summary reads.

### Columns
- `id` UUID PK
- `project_id` UUID nullable FK → projects.id
- `org_id` UUID FK → organizations.id
- `scope` enum: `general | project`
- `payload_json` jsonb
- `computed_at` timestamptz

---

## 12. Audit and jobs

## 12.1 audit_events

Global auditable event stream.

### Columns
- `id` UUID PK
- `project_id` UUID nullable FK → projects.id
- `org_id` UUID FK → organizations.id
- `actor_user_id` UUID nullable FK → users.id
- `event_type` text
- `entity_type` text
- `entity_id` UUID nullable
- `payload_json` jsonb
- `created_at` timestamptz

### Examples
- `document_uploaded`
- `document_processed`
- `brain_generated`
- `change_detected`
- `change_accepted`
- `decision_accepted`
- `socrates_answered`
- `client_view_token_created`

---

## 12.2 job_runs

Async job control plane.

### Columns
- `id` UUID PK
- `job_type` text
- `status` enum: `pending | running | completed | failed | dead`
- `idempotency_key` text unique nullable
- `payload_json` jsonb nullable
- `attempt_count` integer
- `scheduled_at` timestamptz
- `started_at` timestamptz nullable
- `finished_at` timestamptz nullable
- `last_error` text nullable
- `created_at` timestamptz

### Job types for current product
- `parse_document`
- `chunk_document`
- `embed_document_chunks`
- `generate_source_package`
- `generate_clarified_brief`
- `generate_brain_graph`
- `generate_product_brain`
- `sync_communication_connector`
- `ingest_communication_batch`
- `index_communication_message`
- `precompute_socrates_suggestions`
- `refresh_dashboard_snapshot`

---

## 13. Recommended indexes

## 13.1 Retrieval-critical indexes
- ivfflat/hnsw on `document_chunks.embedding`
- ivfflat/hnsw on `message_chunks.embedding`
- btree `(project_id, document_version_id)` on chunks
- btree `(project_id, message_id)` on message_chunks
- btree `(project_id, page_context)` on socrates_sessions

## 13.2 Viewer-critical indexes
- btree `(document_version_id, order_index)` on document_sections
- btree `(document_version_id, anchor_id)` on document_sections
- btree `(document_section_id)` on section marker/link tables

## 13.3 Communication-critical indexes
- unique `(connector_id, provider_thread_id)`
- unique `(connector_id, provider_message_id)`
- btree `(project_id, sent_at desc)` on communication_messages
- btree `(thread_id, sent_at)` on communication_messages

## 13.4 Artifact/version indexes
- unique `(project_id, artifact_type, version_number)`
- partial unique on latest accepted artifact per project/type when needed
- btree `(project_id, artifact_type, status, created_at desc)`

## 13.5 Dashboard indexes
- btree `(org_id, scope, computed_at desc)` on dashboard_snapshots
- btree `(project_id, scope, computed_at desc)` where relevant

---

## 14. Recommended migration order

Create tables in this order:

1. organizations
2. users
3. refresh_tokens
4. projects
5. project_members
6. documents
7. document_versions
8. document_sections
9. document_chunks
10. artifact_versions
11. brain_nodes
12. brain_edges
13. brain_section_links
14. communication_connectors
15. communication_sync_runs
16. communication_threads
17. communication_messages
18. message_chunks
19. message_insights
20. spec_change_proposals
21. spec_change_links
22. decision_records
23. socrates_sessions
24. socrates_messages
25. socrates_citations
26. socrates_open_targets
27. socrates_suggestions
28. dashboard_snapshots
29. audit_events
30. job_runs
31. optional performance/materialized read-model tables

---

## 15. Final modeling rule

If a future engineer has to choose between:
- making the schema slightly more complex,
- or losing provenance and truth tracking,

choose the more explicit schema.

Orchestra only works if it can always answer:
- what is the current truth,
- where did it come from,
- what changed,
- and why.
