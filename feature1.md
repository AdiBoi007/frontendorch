# Feature 1: Product Brain

## 1. Feature name and purpose
Feature 1 is **Product Brain**. Its job is to turn immutable project source material into a versioned, evidence-grounded, current product truth that Orchestra can trust and later expose to Socrates, the Live Doc Viewer, and the Dashboard.

This implementation is backend-first. It covers document intake, parsing, sectioning, chunking, embeddings, structured artifact generation, versioned truth updates, accepted change integration, and viewer-facing provenance payloads.

## 2. Product role of Feature 1 in Orchestra
Feature 1 is the core truth engine for the current Orchestra product. It supports the four active product surfaces, but only implements the backend for the first one directly:

- Product Brain: fully implemented in this repo
- Socrates: only the retrieval-ready foundation is implemented now
- Live Doc Viewer: backend payloads are implemented now
- Dashboard: not implemented, but the data model and audit trail support it later

Feature 1 establishes the system rules that everything else must follow:

- original source documents remain immutable
- current truth is derived and versioned
- accepted changes create newer truth versions instead of patching source files
- provenance is preserved at the level of source docs, sections, messages, nodes, and acceptance events

## 3. Exact scope of Feature 1
Implemented scope:

- auth and project creation
- immutable document upload and document version creation
- voice-note / audio upload via the same document ingestion endpoint with server-side transcription before parsing
- local or S3-backed source storage
- parsing of PDF, DOCX, TXT, Markdown, and pasted text
- normalized sections with anchors, heading paths, and page data when available
- chunk generation with contextual chunk text
- embeddings persisted into `pgvector`
- lexical retrieval material persisted in Postgres
- communication-message chunking and embeddings for retrieval-ready message provenance
- Source Package generation
- Clarified Brief generation
- Brain Graph generation plus normalized nodes/edges/section links
- Product Brain generation
- artifact versioning with explicit accepted/superseded states
- manual change proposal creation
- manager-only proposal accept/reject
- accepted proposal application into new current Product Brain truth
- decision record creation for accepted decision changes
- viewer payloads that can show change markers, decision ids, and message refs
- client-safe current-brain and graph projections for client members
- in-process telemetry and a Prometheus-style `/metrics` endpoint
- worker/job infrastructure with BullMQ or inline execution

## 4. What Feature 1 is NOT
This implementation does not build:

- prototype generation
- task planning
- board sync
- delivery control tower
- VS Code integration
- dev surveillance
- communication connector ingestion pipelines
- Socrates answering
- dashboard routes
- client-safe filtered views
- diff endpoints between artifact versions

## 5. User-facing outcomes
From a user perspective, Feature 1 enables:

- creating a project
- uploading PRDs, SRS files, notes, pasted text, or recorded voice-note style source input
- having those sources parsed and indexed
- generating a current Product Brain backed by evidence
- viewing a structural graph of flows/modules/constraints
- creating and reviewing structured change proposals
- accepting a proposal to create a newer current truth
- opening a document viewer payload that shows where accepted changes touch the source

## 6. Core internal objects
The main internal objects are:

- `Document`: logical source document inside a project
- `DocumentVersion`: immutable uploaded source version for a document
- `DocumentSection`: parsed section for a specific `DocumentVersion` and `parseRevision`
- `DocumentChunk`: retrieval chunk for a specific section and `parseRevision`
- `ArtifactVersion`: immutable derived artifact version
- `BrainNode`: normalized node in the accepted Brain Graph
- `BrainEdge`: normalized structural edge in the accepted Brain Graph
- `BrainSectionLink`: provenance join from a graph node to a source section
- `SpecChangeProposal`: manager-reviewed structured change request
- `SpecChangeLink`: provenance join from a proposal to sections, nodes, and messages
- `DecisionRecord`: accepted decision object, created automatically for accepted decision-change proposals
- `CommunicationMessageChunk`: retrieval-ready semantic chunk for immutable communication evidence
- `JobRun`: idempotency and execution tracking record for async jobs

## 7. Data model used by Feature 1
The Prisma schema lives in `prisma/schema.prisma`. The initial SQL migration is `prisma/migrations/0001_init/migration.sql`.

Core tables:

- `organizations`
- `users`
- `refresh_tokens`
- `projects`
- `project_members`
- `documents`
- `document_versions`
- `document_sections`
- `document_chunks`
- `artifact_versions`
- `brain_nodes`
- `brain_edges`
- `brain_section_links`
- `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `communication_threads`
- `communication_messages`
- `communication_message_chunks`
- `audit_events`
- `job_runs`

Critical model semantics:

- `document_versions` are source-evidence records. They are never replaced in place.
- `document_versions.parse_revision` tracks reprocessing of the same uploaded bytes.
- `document_sections` and `document_chunks` are versioned by `(document_version_id, parse_revision, ...)`.
- reprocessing creates a new parse revision instead of deleting historical section/chunk evidence.
- `artifact_versions` store immutable derived truth objects of type:
  - `source_package`
  - `clarified_brief`
  - `brain_graph`
  - `product_brain`
- `artifact_versions.status` is one of `draft`, `accepted`, `superseded`, `failed`.
- exactly one accepted artifact per `(project_id, artifact_type)` is enforced by a partial unique SQL index.
- `artifact_versions.change_summary` is used in this repo as a **state signature** for idempotent generation.
- `spec_change_links` and `brain_section_links` use explicit join tables for provenance-critical relationships.

Key indexes and constraints:

- pgvector index on `document_chunks.embedding`
- GIN lexical index on `to_tsvector('english', lexical_content)`
- unique accepted artifact partial index:
  - `artifact_versions_single_accepted_idx`
- unique chunk index per `(document_version_id, parse_revision, chunk_index)`
- unique section key and anchor id per `(document_version_id, parse_revision, ...)`
- unique proposal link rows per `(spec_change_proposal_id, link_type, link_ref_id, relationship)`
- unique communication chunk rows per `(message_id, chunk_index)`

## 8. API routes used by Feature 1
Auth:

- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`

Projects:

- `POST /v1/projects`
- `GET /v1/projects`
- `GET /v1/projects/:projectId`
- `GET /v1/projects/:projectId/members`

Documents:

- `POST /v1/projects/:projectId/documents/upload`
- `GET /v1/projects/:projectId/documents`
- `GET /v1/projects/:projectId/documents/:documentId`
- `GET /v1/projects/:projectId/documents/:documentId/view`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId`
- `POST /v1/projects/:projectId/documents/:documentId/reprocess`

Brain:

- `POST /v1/projects/:projectId/brain/rebuild`
- `GET /v1/projects/:projectId/brain/current`
- `GET /v1/projects/:projectId/brain/versions`
- `GET /v1/projects/:projectId/brain/graph/current`

Change proposals:

- `GET /v1/projects/:projectId/change-proposals`
- `POST /v1/projects/:projectId/change-proposals`
- `GET /v1/projects/:projectId/change-proposals/:proposalId`
- `POST /v1/projects/:projectId/change-proposals/:proposalId/accept`
- `POST /v1/projects/:projectId/change-proposals/:proposalId/reject`

## 9. Full document ingestion flow
1. A manager uploads a file or JSON pasted text to `POST /documents/upload`.
2. The backend computes a SHA-256 checksum.
3. The backend checks whether the same logical document already exists in the same project with the same title/kind/visibility and identical checksum.
4. If an identical version already exists, the upload is deduplicated and the existing version is returned.
5. Otherwise:
   - the source bytes are stored through the storage abstraction
   - a new `document_versions` row is created with `status=pending` and `parse_revision=1`
   - `documents.current_version_id` is updated to the new version
6. A `parse_document` job is queued with payload `{ documentVersionId, parseRevision }`.
7. Parsing reads the bytes from storage and routes by MIME/file name:
   - PDF: `src/lib/parsers/pdf.ts`
   - DOCX: `src/lib/parsers/docx.ts`
   - TXT/Markdown: `src/lib/parsers/text.ts`
   - Audio: `src/lib/ai/openai-transcription.ts` or mock provider, then transcript is parsed as text
8. Parsed sections are normalized into `document_sections`.
9. Chunking builds contextual chunks from section text, not raw file bytes.
10. Embedding writes vectors into `document_chunks.embedding`.
11. When embedding finishes, the source package generation job is queued.

Reprocessing flow:

1. Manager calls `POST /documents/:documentId/reprocess`.
2. The backend increments `document_versions.parse_revision`.
3. It resets status to `pending` and clears parse warnings.
4. It queues a new parse job for the new parse revision.
5. Older section/chunk rows remain in the database for provenance.
6. Viewer payloads only expose the current parse revision for the current document version.

## 10. Full Source Package generation flow
Implemented in `src/modules/brain/service.ts` as `generateSourcePackage`.

Inputs:

- all `document_versions` in `status=ready`
- only the sections matching each version’s current `parse_revision`
- accepted communication evidence remains separate and immutable; it is not merged into source documents

Behavior:

- computes a deterministic source-state signature from ready versions
- starts a tracked job run using that signature
- builds a fallback doc-grounded structure from sections:
  - `projectSummary`
  - `actors`
  - `features`
  - `constraints`
  - `integrations`
  - `contradictions`
  - `unknowns`
  - `risks`
  - `sourceConfidence`
  - `evidenceRefs`
- asks the generation provider to return schema-valid JSON
- if AI output fails or is missing, the fallback is used
- creates a new accepted `source_package` artifact only if the input signature changed
- queues Clarified Brief generation

## 11. Full Clarified Brief generation flow
Implemented in `generateClarifiedBrief`.

Inputs:

- latest accepted Source Package artifact

Behavior:

- derives a deterministic signature from the source package artifact id
- builds a fallback clarified brief from source package data
- generates schema-validated JSON containing:
  - `summary`
  - `targetUsers`
  - `flows`
  - `scope`
  - `constraints`
  - `integrations`
  - `unresolvedDecisions`
  - `assumptions`
  - `risks`
  - `evidenceRefs`
- creates a new accepted `clarified_brief` artifact only when inputs changed
- queues Brain Graph generation

## 12. Full Brain Graph / Project Map generation flow
Implemented in `generateBrainGraph` and `materializeGraph`.

Inputs:

- latest accepted Clarified Brief

Behavior:

- derives a deterministic signature from the clarified brief artifact id
- creates structural fallback nodes for:
  - modules
  - flows
  - constraints
  - integrations
  - unresolved items
- creates structural fallback edges such as:
  - flow -> module `depends_on`
  - constraint -> module `supported_by`
  - integration -> module `relates_to`
- persists accepted `brain_graph` artifact immutably
- normalizes the accepted graph into:
  - `brain_nodes`
  - `brain_edges`
  - `brain_section_links`
- only materializes nodes/edges once per accepted artifact id
- validates linked section ids before creating section links
- queues Product Brain generation

## 13. Full Product Brain generation flow
Implemented in `generateProductBrain`.

Inputs:

- latest accepted Source Package
- latest accepted Clarified Brief
- latest accepted Brain Graph
- all accepted change proposals
- all accepted decision records

Behavior:

- computes a deterministic signature from:
  - source package artifact id
  - clarified brief artifact id
  - graph artifact id
  - accepted proposal ids + timestamps
  - accepted decision ids + timestamps
- generates schema-validated JSON containing:
  - `whatTheProductIs`
  - `whoItIsFor`
  - `mainFlows`
  - `modules`
  - `constraints`
  - `integrations`
  - `unresolvedAreas`
  - `acceptedDecisions`
  - `recentAcceptedChanges`
  - `evidenceRefs`
- stores it as a new accepted `product_brain` artifact only if the signature changed

## 14. Current-truth versioning model
Current truth is represented by accepted rows in `artifact_versions`.

Important rules implemented in code:

- artifact rows are immutable once created
- newer current truth is represented by a new artifact version, never an in-place update
- prior accepted artifact rows are marked `superseded`
- only one accepted artifact per type is allowed by SQL
- `version_number` increments monotonically per `(project, artifact_type)`
- `parent_version_id` points to the prior version of the same artifact type
- `change_summary` stores the generation signature used to make artifact generation idempotent
- every newly accepted artifact invalidates cached Socrates suggestions for sessions in the same project so Feature 2 does not drift behind current truth

## 15. Accepted change integration flow
Implemented in `src/modules/changes/service.ts`.

Create proposal:

1. Manager submits a structured proposal.
2. Validation requires:
   - at least one affected document section
   - at least one affected brain node
   - at least one source message id or explicit external evidence ref
3. The service checks that linked sections, nodes, and messages belong to the project.
4. The proposal is stored as `status=needs_review`.
5. `spec_change_links` rows are created for sections, nodes, and messages.

Accept proposal:

1. Manager-only server-side check runs.
2. Proposal status must still be reviewable.
3. Provenance-critical links are rechecked before acceptance.
4. If the proposal type is `decision_change`, a `decision_records` row is created automatically.
5. Proposal status becomes `accepted`, with `accepted_by` and `accepted_at`.
6. An `apply_accepted_change` job is queued.

Apply accepted proposal:

1. If the proposal already has `accepted_brain_version_id` and that artifact exists, the job returns the existing artifact.
2. If the proposal touches sections or nodes, the Brain Graph may be regenerated.
3. Product Brain is regenerated.
4. The proposal stores `accepted_brain_version_id`.
5. Source documents remain untouched.

Reject proposal:

- manager-only
- changes proposal status to `rejected`
- does not mutate current truth

## 16. Viewer support / anchors / markers / source links
Implemented in `DocumentService.getViewerPayload` and `getAnchor`.

Viewer payload contains:

- document metadata
- current document version metadata
- current parse revision
- ordered sections
- anchor ids
- page numbers
- change markers for accepted proposals touching each section
- linked decision ids from accepted proposals that created decision records
- linked message/thread refs when available
- client-safe document filtering: client members only receive payloads for `shared_with_client` documents

Important behavior:

- viewer uses the current parse revision only
- old parse revisions remain in the database for provenance
- accepted change markers are driven by `spec_change_links` on `document_section`
- message refs are derived from proposal-level message/thread links

## 17. Retrieval-ready RAG foundation used in Feature 1
Implemented now for Feature 2 to build on later:

- section extraction
- chunk extraction
- contextual chunk text
- token counts
- lexical content
- vector embeddings
- provenance metadata in chunk `metadata_json`
- pgvector index
- GIN lexical index
- communication message chunk extraction
- communication message chunk embeddings in `communication_message_chunks.embedding`
- communication lexical material in `communication_message_chunks.lexical_content`

Chunk contextual text is built in `src/lib/retrieval/chunking.ts` from:

- document title
- document kind
- heading path
- page number
- chunk content

This repo does **not** implement full retrieval querying or answer synthesis yet. It only implements the storage and indexing substrate.

## 18. Jobs and workers used
Job names:

- `parse_document`
- `chunk_document`
- `embed_document_chunks`
- `generate_source_package`
- `generate_clarified_brief`
- `generate_brain_graph`
- `generate_product_brain`
- `apply_accepted_change`

Execution modes:

- `QUEUE_MODE=inline`: jobs run immediately inside the API process
- `QUEUE_MODE=bullmq`: jobs run through BullMQ + Redis workers

Idempotency:

- document jobs use `documentVersionId + parseRevision`
- artifact jobs use hashed state signatures or prerequisite artifact ids
- apply-change jobs use `proposalId`

Job runs are tracked in `job_runs`.

## 19. Tech stack used
- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- pgvector
- Redis
- BullMQ
- local filesystem or S3-compatible object storage

## 20. Libraries/packages/services used
Key packages from `package.json`:

- `fastify`
- `@fastify/cors`
- `@fastify/jwt`
- `@fastify/multipart`
- `@fastify/sensible`
- `@prisma/client`
- `prisma`
- `bullmq`
- `ioredis`
- `bcryptjs`
- `jsonwebtoken`
- `pdf-parse`
- `mammoth`
- `slugify`
- `pino`
- `zod`
- `@anthropic-ai/sdk`
- `openai`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `vitest`

## 21. Validation and security rules
- env is validated through Zod in `src/config/env.ts`
- S3 configuration is enforced when `STORAGE_DRIVER=s3`
- JWT auth is required for all Feature 1 routes
- manager-only actions are enforced in both route guards and service-layer project-role checks
- multipart metadata and JSON bodies are validated with Zod
- proposal creation enforces provenance-critical minimums
- linked section/node/message ids are validated against the project before proposal creation
- duplicate source uploads are deduplicated by checksum within the same logical document

## 22. Error handling and edge cases
Implemented edge-case handling:

- stale parse/chunk/embed jobs are skipped if a newer parse revision exists
- parse failures write `status=failed` and persist parse warnings
- embed failures write `status=partial`
- viewer calls fail if a document has no current version
- proposals cannot be accepted after rejection/supersession
- accepted proposals cannot be rejected later
- duplicate apply-change runs return the already accepted brain artifact if present
- project slug collisions are resolved by suffixing

Important remaining edge behavior:

- login still assumes a single active user per email across orgs for the login route
- there is no separate parse-run table; parse revision is carried on `document_versions`

## 23. Testing strategy
Current automated coverage is in `tests/` and uses Vitest.

Covered now:

- markdown section parsing
- contextual chunk generation
- stable anchor ids
- stale parse revision skipping
- monotonic chunk indexes across sections
- viewer payload linkage for change markers, decisions, and messages
- client-safe document filtering
- audio transcription ingestion for voice-note style uploads
- invalid proposal link rejection
- automatic decision record creation on accepted decision changes
- idempotent accepted-change reapplication
- current brain read model contents
- client-safe current brain projection
- route contracts for auth, project creation, viewer payload, and manager-only change acceptance
- metrics route contract

## 24. Production-readiness notes
Production hardening done in this repo:

- storage abstraction supports real S3-compatible storage
- env validation fails fast
- structured request error logging is enabled
- current-truth artifact creation is transactional
- accepted artifact uniqueness is enforced by SQL
- generation jobs are signature-based and retry-safe
- provenance joins are explicit and unique
- doc reprocessing preserves historical parse evidence
- voice uploads are transcribed through a provider abstraction before parse normalization
- client members receive formal server-side filtered document and truth projections
- request and job telemetry are exported through `/metrics`

Operational note:

- `.env.example` uses `QUEUE_MODE=inline` for local development convenience
- production should use BullMQ workers

## 25. How the feature was actually implemented in this repo
The code is organized as a modular monolith:

- `src/app/*`: Fastify assembly, auth guard helpers, error handling, request context
- `src/config/env.ts`: env parsing and validation
- `src/lib/*`: AI providers, storage, parsers, jobs, retrieval helpers, auth helpers, logging
- `src/modules/projects/*`: project service and routes
- `src/modules/documents/*`: upload, parse, chunk, embed, viewer payloads
- `src/modules/brain/*`: Source Package, Clarified Brief, Brain Graph, Product Brain
- `src/modules/changes/*`: proposal review and accepted-change application
- `src/modules/audit/*`: audit event persistence
- `prisma/*`: schema, migration, seed
- `tests/*`: unit and service-level contract tests

## 26. File/module map of the implementation
Primary entrypoints:

- `src/server.ts`
- `src/worker.ts`
- `src/setup-context.ts`

Feature modules:

- `src/modules/auth/service.ts`
- `src/modules/auth/routes.ts`
- `src/modules/projects/service.ts`
- `src/modules/projects/routes.ts`
- `src/modules/documents/service.ts`
- `src/modules/documents/routes.ts`
- `src/modules/documents/schemas.ts`
- `src/modules/brain/service.ts`
- `src/modules/brain/routes.ts`
- `src/modules/brain/schemas.ts`
- `src/modules/changes/service.ts`
- `src/modules/changes/routes.ts`
- `src/modules/changes/schemas.ts`
- `src/modules/audit/service.ts`

Supporting libs:

- `src/lib/parsers/*`
- `src/lib/retrieval/chunking.ts`
- `src/lib/observability/telemetry.ts`
- `src/lib/jobs/keys.ts`
- `src/lib/jobs/queue.ts`
- `src/lib/storage/*`
- `src/lib/ai/*`

## 27. How Feature 2 (Socrates) will build on Feature 1
Feature 2 should build on:

- `document_sections`
- `document_chunks`
- `document_chunks.embedding`
- `document_chunks.lexical_content`
- `artifact_versions` for accepted Product Brain / Source Package / Clarified Brief / Brain Graph
- `brain_nodes`, `brain_edges`, `brain_section_links`
- `spec_change_proposals`, `spec_change_links`
- `communication_messages`
- `communication_message_chunks`

Socrates can use these to:

- retrieve from current accepted truth first
- cite exact source sections and messages
- open the right document anchor on the Live Doc Viewer
- reason over structural graph nodes instead of flat text only

## 28. Known limitations / intentionally deferred items
- No full Socrates answer orchestration yet
- No retrieval query API yet
- No connector ingestion pipeline for Slack/Gmail/WhatsApp yet
- No full client-facing derived product surface beyond the current client-safe brain/graph filtering
- No Dashboard routes yet
- No artifact diff API yet
- No real Postgres-backed end-to-end integration harness in tests yet; current tests are service and route contract level
- No separate parse-run table; parse revisioning is attached to `document_versions`
- The generation logic still uses fallback heuristics when AI providers are absent or invalid; this is intentional, but not a substitute for richer domain prompts later

---

## Audit Notes — 2026-04-17

Production audit completed against the implemented codebase.

### Constructor signature (current)
```typescript
new DocumentService(
  prisma: PrismaClient,
  storage: StorageDriver,
  jobs: JobDispatcher,
  embeddings: EmbeddingProvider,
  transcriptionProvider: TranscriptionProvider,  // Added: audio upload support
  projectService: ProjectService,
  auditService: AuditService,
  telemetry: TelemetryService                    // Added: metrics/duration observability
)
```

### Migrations applied (6 total)
| Migration | Purpose |
|-----------|---------|
| 0001_init | Core schema: orgs, projects, users, documents, sections, chunks, brain, audit |
| 0002_socrates_and_dashboard | Socrates sessions/messages/citations/open-targets; dashboard snapshot |
| 0003_socrates_perf_indexes | Retrieval + suggestion indexes for Socrates |
| 0004_socrates_hardening | Suggestion TTL, precomputed suggestion table |
| 0005_communication_embeddings | Communication message chunk embeddings for CHR-RAG |
| 0006_live_doc_viewer_read_model_indexes | Read-model indexes for viewer payload queries |

### Bug fix applied
**Stale suggestion window on embed completion**: `embedDocumentChunks` now calls `socratesSuggestion.deleteMany` for the project immediately after marking the document version `ready`, before enqueueing `generate_source_package`. Previously, suggestions were only invalidated at the end of the full brain pipeline (`createAcceptedArtifact`). If the pipeline failed midway, stale suggestions persisted until the 15-minute TTL expired.

### Test coverage
- 117 tests passing across all pipeline stages
- Covers: stale parse revision skipping, monotonic chunk indices, viewer markers, provenance, search, audio transcription, fallback version selection, and message evidence

## Launch-Gate Loop — 2026-04-21

`tests/launch_gate_communication_truth.e2e.test.ts` proves the full end-to-end loop.

Feature 1 integration confirmed:
- `applyAcceptedProposal()` calls `brainService.generateBrainGraph()` then `generateProductBrain()` after manager acceptance
- New `artifactVersion` (v2) is created with `status: "accepted"`, superseding v1
- `specChangeProposal.acceptedBrainVersionId` is set to the new brain artifact ID
- Original document sections remain immutable throughout
