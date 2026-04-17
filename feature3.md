# Feature 3: Live Doc Viewer

## 1. Feature name and purpose

Feature 3 is **Live Doc Viewer**.

Its job is to make Orchestra's source evidence explorable, navigable, and provable. It is not a raw file endpoint and not a separate truth model. It is the backend read-model that turns Feature 1's parsed documents, accepted change links, decision links, and Feature 2's citations/open-targets into a viewer contract the frontend can open directly.

The viewer is the **evidence surface** for Orchestra.

---

## 2. Product role of Feature 3 in Orchestra

Live Doc Viewer sits between Product Brain and Socrates:

- Feature 1 creates immutable documents, parsed sections, chunks, accepted changes, and brain links.
- Feature 2 cites those entities and returns open-targets.
- Feature 3 makes those references actually openable and understandable.

Without Feature 3:
- Socrates citations are just IDs.
- Product Brain provenance is inspectable only through raw tables or generic APIs.
- Users cannot click a section and see where it came from, what changed there, or which communication thread introduced it.

With Feature 3:
- documents open in parsed form
- exact anchors/sections/pages are navigable
- change overlays sit on top of original source text
- doc -> message and message -> doc navigation works
- Mannan's click-to-source behavior is implemented through a dedicated provenance read model

---

## 3. Exact scope of Feature 3

Feature 3 implements:

- project-scoped document list/read endpoints for the viewer
- parsed viewer payloads based on `document_sections`
- exact resolution by `versionId`, `anchorId`, `sectionId`, `chunkId`, and citation id
- section window paging for large documents
- accepted change overlays on source sections
- linked decision/message/thread references on internal views
- client-safe filtering for shared documents
- section search within a document
- a provenance inspector endpoint for click-to-source behavior
- message-side evidence read model with links back into documents
- compatibility with Socrates citations and `document_section` open-targets

Feature 3 does **not** implement:

- raw PDF-first viewing as the primary contract
- collaborative comments/annotations
- visual diff rendering
- OCR pipelines beyond what document ingestion already supports
- a second accepted-truth model separate from Product Brain

---

## 4. User-facing outcomes

### Manager / Dev
- Open a parsed PRD/SRS/call note and navigate by anchor or page.
- See which accepted changes affect a section.
- See linked decision IDs and message/thread refs for that section.
- Click a section and inspect the full provenance bundle.
- Open a message and see which document sections and change proposals it influenced.

### Client
- Open only documents with `visibility = shared_with_client`.
- See original source text and safe overlay summaries.
- Do **not** see internal message/thread refs, raw change proposal IDs, or internal-only decision identifiers.

### Socrates integration
- A citation returned by Socrates can be opened in the viewer and highlighted at the correct anchor/section.
- Viewer navigation can feed back into Socrates via the existing `viewerState` model.

---

## 5. Core backend contract

The primary frontend contract is **parsed viewer payloads**, not signed file URLs.

The main navigation unit is:

- section
- anchor
- page

Chunks remain evidence-level retrieval units. When a chunk is selected, the viewer resolves it upward to the containing section/page/anchor.

---

## 6. Data model used by Feature 3

Feature 3 does not introduce a new truth store. It reuses existing Feature 1 and 2 tables:

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

### New migration in this feature

`prisma/migrations/0006_live_doc_viewer_read_model_indexes/migration.sql`

This adds read-side indexes for:

- document version metadata lookups
- exact anchor resolution
- page/order section windowing
- chunk -> section resolution
- thread/message chronology
- citation ref lookup
- trigram-backed section search over `document_sections.normalized_text`

No new truth tables were added.

---

## 7. Server-side role filtering rules

Feature 3 enforces access through `ProjectService.ensureProjectAccess()` plus viewer-specific filtering:

### Manager / Dev
- may read internal and shared documents
- may call message evidence route
- may inspect linked decisions and raw proposal/message/thread refs

### Client
- may read only `shared_with_client` documents
- may **not** call `GET /v1/projects/:projectId/messages/:messageId`
- receives viewer payloads with:
  - no raw `changeProposalId`
  - no `decisionRecordId`
  - no `linkedDecisionIds`
  - no `linkedMessageRefs`
  - no `linkedThreadIds`
  - no internal-only brain-node references

Clients still receive safe overlay summaries so they can understand that current accepted truth differs from original source in that section.

---

## 8. API routes implemented for Feature 3

## 8.1 Existing routes enhanced

- `GET /v1/projects/:projectId/documents`
- `GET /v1/projects/:projectId/documents/:documentId`
- `GET /v1/projects/:projectId/documents/:documentId/view`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId`

## 8.2 New routes added

- `GET /v1/projects/:projectId/documents/:documentId/search?q=...`
- `GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance`
- `GET /v1/projects/:projectId/messages/:messageId`

## 8.3 Related internal-only route behavior tightened

- `GET /v1/projects/:projectId/change-proposals`
- `GET /v1/projects/:projectId/change-proposals/:proposalId`

These raw proposal detail/list routes are now manager/dev only. Clients get safe overlay summaries from viewer payloads instead of internal proposal records.

---

## 9. `GET /documents` read model

`DocumentService.listDocuments(projectId, actorUserId, { page, pageSize })`

Returns:

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

Plus pagination meta:

- `page`
- `pageSize`
- `totalCount`
- `totalPages`
- `hasMore`

Ordering is `createdAt DESC`.

Client members only see shared documents.

---

## 10. `GET /documents/:documentId` read model

`DocumentService.getDocument(projectId, documentId, actorUserId)`

Returns:

- base document identity
- `parseStatus`
- `currentVersion`
- `versions[]`

This is metadata + version summary, not the parsed document body.

---

## 11. Parsed viewer payload

`GET /v1/projects/:projectId/documents/:documentId/view`

Query parameters supported:

- `versionId`
- `page`
- `pageSize`
- `anchorId`
- `sectionId`
- `chunkId`
- `highlightCitationId`

### Resolution rules

1. Resolve the accessible document.
2. Resolve the requested/current document version.
3. If `highlightCitationId` is present, validate that the Socrates citation:
   - belongs to the same project
   - is of type `document_section` or `document_chunk`
   - belongs to the requested document
   - is client-safe if the actor is a client
4. Resolve explicit target priority:
   - `chunkId`
   - `sectionId`
   - `anchorId`
5. If a target exists, compute the page window from `section.orderIndex`.
6. Load only that section window.

### Response shape

- `document`
- `version`
- `viewerState`
- `selected`
- `highlight`
- `sections[]`
- `meta`

### Section payload shape

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

`citationLabel` format is:

`<document title> · p.<page>|section · <heading path or anchor>`

---

## 12. Exact target resolution

Exact resolution is implemented in `DocumentService.resolveExplicitTarget()`.

### Supported selectors

- `versionId`
- `sectionId`
- `anchorId`
- `chunkId`
- `highlightCitationId`

### Important behavior

- `chunkId` resolves to its parent section. Chunks are never rendered as standalone rows.
- `GET /anchors/:anchorId` does a direct indexed lookup by `(project_id, document_version_id, parse_revision, anchor_id)`.
- anchor reads do **not** depend on the first page window already being loaded.

This is what fixes the old weak viewer behavior where anchors could only be found if they happened to be in the currently loaded window.

---

## 13. Change overlays

Change overlays are assembled from `spec_change_links` where:

- `link_type = document_section`
- linked proposal `status = accepted`

Per section, the service collects:

- accepted proposal summary
- proposal type/status
- accepted metadata
- linked brain node IDs
- linked thread IDs
- linked message refs
- linked decision IDs
- `currentTruthSummary[]`

Original section text is never rewritten.

The overlay model is:

- original source stays in `text`
- accepted current-truth effect appears in `changeMarkers` and `currentTruthSummary`

---

## 14. Provenance inspector (Mannan feature)

Route:

`GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance`

This is the backend contract for “where did this come from?”

It returns:

- `document`
- `version`
- `selectedSection`
- `supportingSections`
- `supportingEvidence` from `document_chunks`
- `linkedBrainNodes`
- `linkedChanges`
- `linkedDecisions`
- `linkedMessageRefs`
- `currentTruth`
- `openTargets`

### `currentTruth`

```json
{
  "differsFromSource": true,
  "summaries": ["Accepted client feedback changed this requirement"]
}
```

### `openTargets`

Includes validated viewer/openable targets for:

- selected section
- nearby supporting sections
- linked brain nodes
- linked decisions
- linked change proposals (internal only)
- linked threads/messages (internal only)

---

## 15. Message-side evidence read model

Route:

`GET /v1/projects/:projectId/messages/:messageId`

Internal only.

Returns:

- message identity/body
- thread metadata
- linked document sections
- linked change proposals
- linked decision records
- open-targets back into thread/doc viewer

This uses:

- `spec_change_links` of type `message` / `thread`
- then joins back to `document_section` links for those proposals

The route de-duplicates:

- linked proposals
- linked sections

so the frontend receives a stable evidence bundle instead of repeated join rows.

---

## 16. Section search

Route:

`GET /v1/projects/:projectId/documents/:documentId/search?q=...&versionId=...&limit=...`

Search is section-first and role-safe.

Implementation:

- scope to the selected/current document version
- query `document_sections.normalized_text` with case-insensitive lexical matching
- rank results with a simple deterministic score:
  - heading-path boost
  - earlier match position boost
- return:
  - `sectionId`
  - `anchorId`
  - `citationLabel`
  - `pageNumber`
  - `headingPath`
  - `orderIndex`
  - `snippet`
  - `score`
  - `openTarget`

Read-side support index:

- `document_sections_normalized_text_trgm_idx`

---

## 17. Feature 2 integration

Feature 3 is wired specifically to Socrates output.

### Highlight compatibility

`highlightCitationId` lets the viewer open a Socrates citation and return:

- the correct window page
- the selected anchor/section
- a `highlight` block with `openTarget`

### Open-target compatibility

Socrates `document_section` targets already use:

```json
{
  "targetType": "document_section",
  "targetRef": {
    "documentId": "...",
    "documentVersionId": "...",
    "anchorId": "...",
    "pageNumber": 12
  }
}
```

Feature 3 consumes that contract directly.

### Viewer -> Socrates loop

Feature 3 returns `viewerState` in the same shape Socrates stores in session context:

- `documentId`
- `documentVersionId`
- `pageNumber`
- `anchorId`

This lets the frontend push viewer navigation back to:

`PATCH /v1/projects/:projectId/socrates/sessions/:sessionId/context`

without translation glue.

---

## 18. Files and modules used

Feature 3 is intentionally implemented by extending the existing `documents` module instead of creating a separate viewer micro-module.

### Primary implementation files

- `src/modules/documents/service.ts`
- `src/modules/documents/routes.ts`
- `src/modules/documents/schemas.ts`

### Related supporting files

- `src/modules/changes/routes.ts`
- `src/modules/socrates/schemas.ts`
- `src/modules/socrates/service.ts`
- `src/app/auth.ts`
- `prisma/schema.prisma`
- `prisma/migrations/0006_live_doc_viewer_read_model_indexes/migration.sql`

---

## 19. Notable implementation details

### No new module for viewer truth

The viewer does not persist its own projection. It assembles read models on demand from Feature 1 and 2 data.

### Exact lookups are indexed

The main critical paths are:

- anchor lookup
- section window loading by `orderIndex`
- chunk -> section resolution
- message/thread chronology
- citation id -> referenced entity

### Client-safe filtering is explicit

The service strips internal-only refs at assembly time. The frontend is not trusted to hide them.

---

## 20. Tests added/updated

Feature 3 added/updated tests in:

- `tests/document-service.test.ts`
- `tests/routes.test.ts`

Verified scenarios:

- document listing pagination
- client document filtering
- parsed viewer payload contract
- exact anchor lookup outside the first page window
- manager-only message evidence route
- client blocking on raw change proposal routes
- section search route
- provenance route
- client-safe stripping of message refs and decision ids

Feature 2 integration remains covered by:

- `tests/socrates-routes.test.ts`
- `tests/socrates-service.test.ts`
- `tests/socrates-hybrid.test.ts`

---

## 21. Production-readiness notes

Feature 3 is production-ready at the application layer:

- deterministic read-model assembly
- explicit role filtering
- no hidden rewrites of source text
- real exact-resolution behavior
- viewer/search/provenance routes under test
- migration-backed indexes for the new read patterns

Remaining infra caveat is the same as earlier features:

- no live staging validation against a real Postgres/Redis/S3 deployment in this repo pass

---

## 22. Intentionally deferred items

- raw file download as a first-class viewer contract
- PDF visual parity
- inline annotations/comments
- document diff renderer
- client-shareable message visibility model
- communication thread list/detail routes beyond the single-message evidence read model

These belong to later product work, not Feature 3.
