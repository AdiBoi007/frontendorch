# Feature 3: Live Doc Viewer

## 1. Feature name and purpose

Feature 3 is **Live Doc Viewer**.

Its purpose is to make Orchestra's source evidence explorable and provable. It is the evidence surface on the right side of the product, not a generic file-preview endpoint and not a second truth model. It turns parsed documents, accepted change links, message/thread links, brain links, and Socrates citations into a stable frontend read model.

The viewer must let a user:

- open parsed project documents
- navigate by section, anchor, page, and chunk-derived evidence
- inspect accepted overlays without mutating source text
- jump between source documents and linked communication evidence
- understand where a statement came from and whether accepted current truth changed it

## 2. Product role of Feature 3 in Orchestra

Feature 3 is the **evidence surface** between:

- Feature 1: Product Brain / parsing / accepted-truth versioning
- Feature 2: Socrates / citations / open-targets

Feature 1 builds the evidence graph. Feature 2 explains it conversationally. Feature 3 is where the user verifies it.

Without Feature 3:

- Socrates citations are not meaningfully explorable.
- Accepted changes are visible only as backend records.
- Product Brain provenance cannot be inspected from the same user surface.

With Feature 3:

- original source remains readable
- accepted overlays remain visible as overlays
- Socrates citations resolve to real anchors
- message -> doc and doc -> message navigation works
- Mannan's click-to-source behavior is implemented

## 3. Exact scope of Feature 3

Feature 3 includes:

- project document listing for viewer use
- document metadata and version summaries
- parsed viewer payloads from `document_sections`
- exact target resolution by `versionId`, `anchorId`, `sectionId`, `chunkId`, `highlightCitationId`
- section-window paging for large documents
- section search within a document
- accepted change overlays on affected sections
- internal decision and communication linkage
- provenance inspector / click-to-source endpoint
- message-side evidence route for message -> doc navigation
- server-side client-safe filtering
- compatibility with Feature 2 citations and `document_section` open-targets

## 4. What Feature 3 is NOT

Feature 3 is not:

- a raw file service
- a PDF-first preview system
- a collaborative annotation layer
- a Figma-like commenting UX
- a separate source of accepted truth
- a replacement for Product Brain
- a replacement for Socrates

Out of scope:

- pixel-perfect PDF parity
- broad OCR beyond uploaded-document needs
- collaborative comments
- visual diff renderer
- client-shareable message visibility model

## 5. User-facing outcomes

| User | Outcome |
|---|---|
| Manager | Opens parsed PRD/SRS/call notes, sees accepted overlays, linked decisions, linked communication evidence |
| Dev | Opens exact anchor/page, verifies what Socrates cited, inspects linked graph nodes and changes |
| Client | Opens only shared documents, sees source text plus safe overlay summaries, never sees internal-only refs |
| Any internal user | Clicks a section and gets a provenance bundle explaining where it came from and what modified it |

## 6. Core internal objects

| Object | Role in Feature 3 |
|---|---|
| `Document` | Project-scoped immutable source container |
| `DocumentVersion` | Immutable uploaded version; viewer chooses a viewable version from these |
| `DocumentSection` | Primary parsed unit rendered by the viewer |
| `DocumentChunk` | Evidence/retrieval unit that resolves upward to a section |
| `SpecChangeProposal` | Accepted changes produce viewer overlays |
| `SpecChangeLink` | Provenance join table connecting sections/messages/threads/brain nodes to changes |
| `DecisionRecord` | Internal decision object linked to overlays and provenance |
| `CommunicationMessage` / `CommunicationThread` | Message-side evidence surface and doc linkage |
| `BrainSectionLink` / `BrainNode` / `BrainEdge` | Structural context for provenance inspector |
| `SocratesCitation` | Highlight and open-target bridge from Feature 2 into Feature 3 |

## 7. Data model used by Feature 3

Feature 3 reuses existing tables from Feature 1 and 2:

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
- `socrates_citations`
- `audit_events`

### Feature 3 migration

`prisma/migrations/0006_live_doc_viewer_read_model_indexes/migration.sql`

This adds/supports read-side indexes for:

- version metadata lookup
- exact anchor resolution
- section-window paging by `orderIndex`
- page-based ordering
- chunk -> section resolution
- message/thread chronology
- citation lookup by `(project_id, citation_type, ref_id)`
- section search with trigram index on `document_sections.normalized_text`

### Relevant schema-level indexes

Feature 3 also relies on indexes declared in `prisma/schema.prisma`, including:

- `DocumentVersion(documentId, createdAt desc)`
- `DocumentVersion(projectId, status, processedAt desc)`
- `DocumentSection(projectId, anchorId)`
- `DocumentSection(documentVersionId, parseRevision, orderIndex)`
- `DocumentSection(projectId, pageNumber, orderIndex)`
- `DocumentChunk(projectId, sectionId)`
- `DocumentChunk(documentVersionId, parseRevision, sectionId)`
- `SpecChangeLink(projectId, linkType, linkRefId)`
- `CommunicationThread(projectId, lastMessageAt desc)`
- `CommunicationMessage(projectId, sentAt desc)`
- `CommunicationMessage(threadId, sentAt desc)`
- `SocratesCitation(projectId, citationType, refId)`

## 8. API routes used by Feature 3

### Existing routes enhanced

- `GET /v1/projects/:projectId/documents`
- `GET /v1/projects/:projectId/documents/:documentId`
- `GET /v1/projects/:projectId/documents/:documentId/view`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId`

### New routes added

- `GET /v1/projects/:projectId/documents/:documentId/search`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance`
- `GET /v1/projects/:projectId/messages/:messageId`

### Related route hardening

- `GET /v1/projects/:projectId/change-proposals`
- `GET /v1/projects/:projectId/change-proposals/:proposalId`

These remain part of Feature 1 but were hardened for Feature 3 compatibility: manager/dev only. Clients receive only safe change overlay summaries from viewer payloads.

## 9. Full document list/read-model flow

### Route

`GET /v1/projects/:projectId/documents?page=<n>&pageSize=<n>`

### Implementation

`DocumentService.listDocuments(projectId, actorUserId, opts)`

### Flow

1. Enforce project access with `ProjectService.ensureProjectAccess`.
2. If actor is a client, add `visibility = shared_with_client`.
3. Count matching docs.
4. Page docs ordered by `createdAt DESC`.
5. Load their current versions in bulk.
6. Return viewer-oriented metadata.

### Response fields

- `id`
- `projectId`
- `title`
- `kind`
- `visibility`
- `createdAt`
- `updatedAt`
- `parseStatus`
- `lastProcessedAt`
- `currentVersion`

### Pagination meta

- `page`
- `pageSize`
- `totalCount`
- `totalPages`
- `hasMore`

## 10. Full parsed viewer payload model

### Route

`GET /v1/projects/:projectId/documents/:documentId/view`

### Query params

- `versionId`
- `page`
- `pageSize`
- `anchorId`
- `sectionId`
- `chunkId`
- `highlightCitationId`

### Validation rules

- `pageSize <= 200`
- `sectionId` must be UUID
- `chunkId` must be UUID
- `highlightCitationId` must be UUID
- only **one** of `anchorId`, `sectionId`, or `chunkId` may be present at once

### Response shape

- `document`
- `version`
- `viewerState`
- `selected`
- `highlight`
- `sections[]`
- `meta`

### `sections[]` payload

Each section contains:

- `sectionId`
- `anchorId`
- `citationLabel`
- `pageNumber`
- `headingPath`
- `orderIndex`
- `text`
- `changeMarkers[]`
- `linkedDecisionIds[]` for internal users only
- `linkedMessageRefs[]` for internal users only
- `hasCurrentTruthOverlay`
- `currentTruthSummary[] | null`

### Paging/window behavior

The viewer never loads the whole document by default.

If no explicit target exists:

- use requested `page`
- clamp to valid total pages

If an explicit target exists:

- compute the containing window page from `section.orderIndex / pageSize`

## 11. Exact target-resolution model

Implemented by:

- `resolveDocumentVersion()`
- `resolveExplicitTarget()`
- `resolveHighlightCandidate()`
- `resolveHighlightForVersion()`
- `loadSectionByAnchor()`
- `loadSectionById()`

### Resolution inputs

- document id
- version id
- anchor id
- section id
- chunk id
- Socrates citation id

### Visible navigation unit

- section
- anchor
- page

Chunks are not rendered directly. `chunkId` resolves upward to the parent section.

### Version resolution rules

For parsed-view routes (`view`, `anchor`, `search`, `provenance`):

1. If explicit `versionId` is provided:
   - version must belong to the project/document
   - version must be `ready` or `partial`
   - otherwise return `409 document_version_not_viewable`
2. If no explicit version is provided:
   - try `document.currentVersionId`
   - if current version is not parsed/viewable, fall back to latest `ready|partial` version by `processedAt DESC, createdAt DESC`
   - if none exists, return `409 document_not_viewable`

This prevents the viewer from breaking when a new upload becomes current before parsing completes.

### Exact anchor rules

`GET /anchors/:anchorId` uses a direct lookup scoped to:

- `projectId`
- `documentVersionId`
- `parseRevision`
- `anchorId`

It does not depend on the current page window already being loaded.

### Invalid target behavior

- invalid project/document/version relationships -> `404`/`403` via scoped queries
- invalid unparsed explicit version -> `409`
- invalid chunk without section -> `409 chunk_missing_section`
- invalid highlight citation type -> `422 invalid_viewer_highlight`
- citation from another document/version -> `409`

## 12. Full citation/open-target rendering flow

Feature 2 returns citations/open-targets. Feature 3 consumes them.

### Supported highlight source types

- `document_section`
- `document_chunk`

### Highlight flow

1. `highlightCitationId` arrives on `/view`.
2. `resolveHighlightCandidate()` loads the Socrates citation.
3. Validate:
   - citation belongs to project
   - citation type is viewable
   - citation belongs to requested document
   - citation is client-safe if actor is a client
4. If citation is `document_chunk`, resolve upward to parent section.
5. Ensure citation version matches the chosen viewer version.
6. Return `highlight` block:
   - `citationId`
   - `citationType`
   - `refId`
   - `sectionId`
   - `anchorId`
   - `pageNumber`
   - `chunkId`
   - `citationLabel`
   - `openTarget`

### Socrates compatibility guarantee

Feature 3 is in sync with Feature 2 because `document_section` open-targets use:

```json
{
  "targetType": "document_section",
  "targetRef": {
    "documentId": "uuid",
    "documentVersionId": "uuid",
    "anchorId": "string",
    "pageNumber": 12
  }
}
```

The viewer consumes this contract directly.

## 13. Full change-overlay model

Overlays are assembled from accepted `spec_change_links` on `document_section`.

### Query basis

`SpecChangeLink where linkType = document_section and proposal.status = accepted`

### Enriched overlay joins

For each accepted proposal linked to the section, Feature 3 also loads related links of type:

- `message`
- `thread`
- `brain_node`

### Marker fields

- `changeProposalId` or `null` for clients
- `proposalType`
- `status`
- `acceptedAt`
- `acceptedBy` or `null` for clients
- `title`
- `summary`
- `decisionRecordId` or `null` for clients
- `linkedBrainNodeIds[]` or empty for clients
- `linkedThreadIds[]` or empty for clients
- `linkedMessageRefs[]` or empty for clients

### Overlay rules

- source section `text` is never mutated
- `hasCurrentTruthOverlay` means accepted current truth differs in that area
- `currentTruthSummary[]` communicates the accepted effect
- markers are sorted newest-first by `acceptedAt`
- message refs are de-duplicated per section

## 14. Full click-to-source / provenance-inspector flow

### Route

`GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance`

### Purpose

This is the mandatory Mannan feature. It answers:

- where did this statement come from?
- what source evidence supports it?
- what brain nodes does it influence?
- what accepted communications modified it?

### Response

- `document`
- `version`
- `selectedSection`
- `supportingSections`
- `supportingEvidence`
- `linkedBrainNodes`
- `linkedChanges`
- `linkedDecisions`
- `linkedMessageRefs`
- `currentTruth`
- `openTargets`

### Supporting evidence behavior

- `supportingSections` = adjacent parsed sections by `orderIndex`
- `supportingEvidence` = `document_chunks` for the selected section
- `linkedBrainNodes` = current accepted `brain_graph` links for this section
- `linkedChanges` = accepted change proposals affecting this section
- `linkedDecisions` = linked decision records for those accepted proposals
- `linkedMessageRefs` = resolved related messages/threads where allowed

### `currentTruth`

```json
{
  "differsFromSource": true,
  "summaries": ["Client requested weekly reporting"]
}
```

### Client-safe behavior

Clients still receive provenance, but:

- no raw proposal IDs
- no decision IDs
- no raw message/thread refs
- no internal-only brain-node references

## 15. Search-within-document model

### Route

`GET /v1/projects/:projectId/documents/:documentId/search?q=...&versionId=...&limit=...`

### Search model

Search is section-first, lexical, deterministic, and scoped to one parsed document version.

### Flow

1. Resolve accessible document.
2. Resolve viewable version with parsed-version fallback rules.
3. Query `document_sections.normalized_text contains q`.
4. Score each hit:
   - heading-path boost
   - earlier match position boost
5. Sort by `score DESC`, then `orderIndex ASC`.
6. Return up to `limit` results.

### Search result payload

- `sectionId`
- `anchorId`
- `citationLabel`
- `pageNumber`
- `headingPath`
- `orderIndex`
- `snippet`
- `score`
- `openTarget`

### Performance note

The query is backed by the trigram index on `document_sections.normalized_text`, but the implementation still uses deterministic lexical matching, not vector search.

## 16. Role filtering / client-safe rules

### Manager / Dev

- full internal document access within the project
- full message evidence route access
- linked decisions shown
- linked message refs shown
- linked thread ids shown
- raw proposal ids shown
- internal graph nodes shown

### Client

- only documents with `visibility = shared_with_client`
- no message evidence route
- no raw change proposal ids in overlays
- no raw decision ids
- no linked message refs
- no linked thread ids
- no internal-only graph nodes in provenance

### Enforcement location

All filtering happens server-side in `DocumentService` and route guards. The frontend is never trusted for hiding unsafe refs.

## 17. Interaction with Feature 1

Feature 3 depends on Feature 1 for:

- immutable `documents` and `document_versions`
- parsed `document_sections`
- evidence `document_chunks`
- accepted `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `brain_graph` / `brain_section_links`

Feature 3 reuses Feature 1's versioning model exactly:

- original documents remain immutable
- accepted changes appear as overlays and linked records
- no source bytes are rewritten
- accepted current truth is presented as overlay summaries, not silent source mutation

## 18. Interaction with Feature 2

Feature 3 depends on Feature 2 for:

- `socrates_citations`
- `document_section` open-target contract
- session `viewerState` shape

Feature 3 keeps Feature 2 in sync by:

- validating highlight citations against real project/doc/version entities
- resolving chunk citations up to sections
- returning `viewerState` in the same shape Socrates persists
- making viewer selections usable for `PATCH /socrates/sessions/:sessionId/context`

If Feature 2 cites something Feature 3 cannot open, the system is broken. The current implementation explicitly rejects invalid/stale citation targets.

## 19. Tech stack used

- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- pgvector
- Redis / BullMQ available in the broader system
- existing Product Brain + Socrates stack

Feature 3 itself is a read-model layer in the modular monolith, not a separate service.

## 20. Libraries/packages/services used

### Runtime

- `fastify`
- `zod`
- Prisma Client

### Internal services

- `ProjectService`
- `AuditService`
- `TelemetryService`
- `DocumentService`

### Existing Feature 1/2 artifacts reused

- Product Brain graph artifacts
- accepted change links
- Socrates citations

## 21. Validation and security rules

### Request validation

- route params validated in Zod
- viewer query validated in Zod
- only one exact selector among `anchorId`, `sectionId`, `chunkId`
- explicit `versionId` must be UUID
- `highlightCitationId` must be UUID

### Security rules

- every route requires auth except health/metrics
- project access enforced by membership
- manager/dev/client filtering enforced server-side
- client cannot access internal message route
- client cannot access raw change proposal detail/list routes
- client cannot highlight internal citations
- client cannot point viewer state at internal documents through Socrates session context

## 22. Error handling and edge cases

### Main handled edge cases

- current version exists but is still `pending|processing|failed`
  - fallback to latest parsed version for parsed-view routes
- explicit `versionId` is unparsed
  - `409 document_version_not_viewable`
- document has no parsed version at all
  - `409 document_not_viewable`
- chunk citation missing parent section
  - `409 chunk_missing_section`
- citation belongs to another document
  - `409 citation_document_mismatch`
- citation belongs to another version than the selected explicit version
  - `409 citation_version_mismatch`
- unsupported citation type for highlighting
  - `422 invalid_viewer_highlight`
- ambiguous exact targets
  - request validation failure
- page query outside valid range
  - clamp to valid total pages

### Failure behavior

Viewer routes return explicit API errors through the shared Fastify error handler. They do not silently fall back to raw file downloads.

## 23. Testing strategy

Feature 3 is covered by:

- unit/service tests in `tests/document-service.test.ts`
- route contract tests in `tests/routes.test.ts`
- Feature 2 compatibility tests in existing Socrates tests

### Verified scenarios

- document list pagination
- client document filtering
- parsed viewer payload shape
- exact anchor lookup outside current page window
- client-safe overlay stripping
- section search snippets and open-targets
- provenance bundles
- message evidence route
- client blocking on raw change proposal detail route
- fallback to latest parsed version when current version is unparsed
- invalid ambiguous target selector rejection
- viewer telemetry/audit emission on read paths

## 24. Performance/read-model strategy

Feature 3 is optimized as an explicit read model, not a denormalized materialized view.

### Strategy

- page/window load by `orderIndex`
- no full-document load requirement
- exact anchor lookups use scoped indexes
- chunk ids resolve upward, avoiding chunk-level render lists
- message route de-duplicates proposal/document joins
- section search stays inside a single document version

### Common request-time joins

- section overlay expansion
- accepted proposal -> message/thread/brain-node links
- current graph links for provenance
- message -> proposal -> section joins

These joins are acceptable because they are scoped to one project/document/anchor/message and backed by indexes.

## 25. Production-readiness notes

Feature 3 is production-ready at the application layer after audit hardening.

### Hardened points

- current-version fallback for parsed-view routes
- server-side client-safe filtering
- exact anchor resolution independent of page window
- validation against ambiguous selectors
- viewer telemetry counters/histograms
- audit events for viewer opens, searches, provenance, and message evidence reads
- stable overlay sorting and de-duplication

Remaining caveat:

- no live infra-backed staging validation against real Postgres/Redis/S3 in this repo pass

## 26. How the feature was actually implemented in this repo

Feature 3 was implemented by extending the existing `documents` module instead of creating a new module tree.

### Main service methods

- `listDocuments()`
- `getDocument()`
- `getViewerPayload()`
- `getAnchor()`
- `searchDocument()`
- `getAnchorProvenance()`
- `getMessageEvidence()`

### Main private helpers

- `resolveDocumentVersion()`
- `resolveExplicitTarget()`
- `resolveHighlightCandidate()`
- `resolveHighlightForVersion()`
- `buildSectionPayloads()`
- `loadSectionOverlays()`
- `loadRelatedMessageRefs()`
- `filterClientSafeBrainLinks()`
- `recordViewerAction()`
- `observeViewerActionDuration()`

## 27. File/module map of the implementation

### Core implementation

- `src/modules/documents/service.ts`
- `src/modules/documents/routes.ts`
- `src/modules/documents/schemas.ts`

### Integration / guards

- `src/modules/changes/routes.ts`
- `src/app/auth.ts`
- `src/modules/socrates/service.ts`
- `src/modules/socrates/schemas.ts`

### Schema / migrations

- `prisma/schema.prisma`
- `prisma/migrations/0006_live_doc_viewer_read_model_indexes/migration.sql`

### Tests

- `tests/document-service.test.ts`
- `tests/routes.test.ts`
- `tests/socrates-hybrid.test.ts`

## 28. How Feature 4 (Dashboard) or later features consume Feature 3 outputs

Feature 4 does not directly depend on Feature 3 for truth creation. But later surfaces can consume Feature 3 outputs as evidence-navigation contracts:

- Dashboard can deep-link unresolved/freshness/change cards into the viewer using document-section open-targets.
- Future client-review surfaces can reuse the client-safe viewer payload as the canonical evidence contract.
- Future diff/review tooling can build on the provenance endpoint instead of inventing a new provenance graph.
- Feature 2 already consumes the same viewer target contract indirectly via citations/open-targets.

## 29. Known limitations / intentionally deferred items

| Item | Status | Notes |
|---|---|---|
| Raw file preview parity | Deferred | Parsed viewer payload is the primary contract. |
| PDF-native rendering parity | Deferred | Not required for the current product. |
| Visual diff renderer | Deferred | Current truth shows as overlays and summaries, not visual diffs. |
| Client-shareable message content | Deferred | Clients cannot open message evidence directly yet. |
| Thread list/detail viewer | Deferred | Only single-message evidence route exists for now. |
| Vector-based document search in viewer | Deferred | Viewer search remains lexical and deterministic. |
| Full infra-backed staging validation | Deferred | Application-level build/test/Prisma validation are complete. |

---

## Audit Notes — 2026-04-17

Production audit completed against the implemented codebase.

### Core Feature 3 methods confirmed implemented
| Method | Purpose |
|--------|---------|
| `getViewerPayload` | Paginated viewer payload: sections, highlights, change markers, message refs, open targets |
| `searchDocument` | Lexical section search with snippet extraction and open-target generation |
| `getAnchorProvenance` | Full provenance bundle for a given anchor: chunks, brain nodes, changes, decisions, message refs |
| `getMessageEvidence` | Reverse evidence navigation: given a messageId, return linked sections and changes |

### Migration 0006 — live_doc_viewer_read_model_indexes
Added indexes specifically for viewer payload query performance:
- `document_sections(document_version_id, order_index)` — section page window queries
- `document_sections(document_version_id, anchor_id)` — anchor lookup for provenance
- `spec_change_links(link_ref_id, link_type)` — change marker resolution

### Test coverage
- `searchDocument`: covered (returns snippet, open target, and role-filtered results)
- `getAnchorProvenance`: covered (brain nodes, changes, decisions, message refs, open targets)
- `getMessageEvidence`: 3 new tests added in this audit
  - Returns full evidence payload with linked documents, changes, and decisions
  - Returns empty arrays when message has no proposal associations
  - Rejects client role with 403 `client_message_access_forbidden`

### Role enforcement
- `getViewerPayload`: client role strips message refs and decision ids from sections
- `searchDocument`: client role excluded from internal-visibility documents
- `getAnchorProvenance`: manager/dev only (enforced by project access check)
- `getMessageEvidence`: client role explicitly rejected with 403

### Interaction with Feature 1 and 2
- Feature 1 produces `documentSection`, `documentChunk`, `specChangeLink`, `brainSectionLink` records consumed by Feature 3
- Feature 2 citations produce `open_target` payloads that match the `document_section` open-target shape from Feature 3
- Socrates citation highlighting in the viewer reuses the same anchor contracts defined by Feature 3
