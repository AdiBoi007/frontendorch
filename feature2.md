# Feature 2: Socrates

## 1. Feature name and purpose

**Socrates** is the persistent AI assistant embedded in Orchestra.

Its purpose is to answer grounded product questions from any page of the Orchestra UI, using explicit evidence retrieved from the project's own data — current document chunks, the accepted Product Brain, brain nodes, accepted changes, decisions, communications, and dashboard facts.

Socrates is **not** a general-purpose chatbot. It is a **page-aware, project-aware, citation-first product copilot** that enables team members to:
- ask questions about the current accepted product truth
- ask provenance questions about where something was first introduced or decided
- understand the history of how a requirement changed
- navigate directly to the exact source evidence
- get contextual prompt suggestions based on where they are in the product

---

## 2. Product role of Feature 2 in Orchestra

Socrates sits on top of the Feature 1 foundations (Product Brain, document indexing, brain graph, accepted changes, decision records).

It is the **conversational surface through which users interact with the structured product knowledge** built by Feature 1.

Without Socrates:
- The Product Brain and documents are read-only artifacts
- Users cannot ask natural-language questions against the product's current truth
- Evidence is only inspectable by browsing, not by asking

With Socrates:
- Users can ask any product question from any page and get a grounded, navigable answer
- Stakeholders on the client view can ask questions and get role-safe answers
- The UI can open the exact source section, message, or graph node from any answer

---

## 3. Exact scope of Feature 2

Feature 2 implements:
- Socrates session creation and management
- Page context and selected-object awareness with server-side target validation
- Query-intent classification (lexical, 10 intent types)
- Retrieval domain selection (deterministic, per page context + intent)
- Hybrid retrieval (vector + lexical over current document chunks, the accepted Product Brain, brain nodes, change proposals, decision records, dashboard snapshots, and semantically chunked communication messages)
- Hierarchical neighbor-section expansion (doc_viewer adjacent sections)
- Reranking with page-context and intent-based boosts + selected-object hard boost
- Prompt construction (context pack + history + evidence)
- Streaming answer generation via Anthropic Claude (SSE)
- Structured answer schema validation (Zod)
- Retry with strict re-prompt on malformed JSON
- Citation persistence after backend validation against retrieved candidates and project entities
- Open-target persistence with backend validation per target type
- Role-safe filtering (client context never receives internal-only refs, including internal-only brain nodes)
- Session history retrieval
- Page-aware contextual suggestion generation with LLM
- Suggestion TTL caching (15 min)
- Suggestion cache invalidation on context change and accepted-truth refresh
- Async suggestion precompute job (BullMQ)
- Audit event `socrates_answered`
- Request/job telemetry exposed via `/metrics`

---

## 4. What Feature 2 is NOT

- Not a general-purpose assistant. Every answer must be grounded in project evidence.
- Not a code generator. Socrates does not generate code.
- Not an autonomous agent. It does not take actions outside of answering and suggesting.
- Not a communication client. It reads communications but does not send them.
- Not the source of truth. It explains and navigates truth derived from Feature 1.
- Not a replacement for the doc viewer, brain graph, or dashboard. It is a companion surface.

---

## 5. User-facing outcomes

| User | Outcome |
|------|---------|
| Manager on Dashboard | "What projects need attention?" → grounded answer with dashboard facts + accepted changes |
| Engineer on Brain Graph | "What depends on this auth module?" → answer citing brain nodes + source docs |
| PM on Doc Viewer | "When was this feature first mentioned?" → provenance answer citing original message + doc section |
| Client on Client View | "What changed recently?" → role-safe answer citing only shared docs and approved brain data |
| Any user | Contextual suggestions for their current page updated after each answer |

---

## 6. Core internal objects

| Object | Description |
|--------|-------------|
| `SocratesSession` | Per-user, per-project session with page context and selected object state |
| `SocratesMessage` | One user or assistant message belonging to a session |
| `SocratesCitation` | A citation record linked to a specific assistant message |
| `SocratesOpenTarget` | A navigable open-target linked to a specific assistant message |
| `SocratesSuggestion` | Cached suggestion batch for a session + page context |
| `RetrievalCandidate` | Internal pipeline object representing a scored evidence candidate |
| `AnswerSchema` | Zod-validated shape of every Claude response before persistence |

---

## 7. Data model used by Feature 2

All tables are in the `orchestra` PostgreSQL database. Migrations are in:
- `prisma/migrations/0002_socrates_and_dashboard/`
- `prisma/migrations/0003_socrates_perf_indexes/`
- `prisma/migrations/0004_socrates_hardening/`
- `prisma/migrations/0005_communication_embeddings/`

### `socrates_sessions`
```
id               UUID PK
project_id       UUID FK → projects
user_id          UUID FK → users
page_context     SocratesPageContext enum
selected_ref_type SocratesSelectedRefType? enum
selected_ref_id  UUID?
viewer_state_json JSONB?
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
```
Index: `(project_id, page_context)`

### `socrates_messages`
```
id               UUID PK
session_id       UUID FK → socrates_sessions
role             SocratesMessageRole enum (user | assistant)
content          TEXT
response_status  SocratesResponseStatus? (streaming | completed | failed)
created_at       TIMESTAMPTZ
```
Indexes: `(session_id)`, `(session_id, created_at DESC)` — compound for history queries

### `socrates_citations`
```
id                   UUID PK
assistant_message_id UUID FK → socrates_messages
project_id           UUID FK → projects
citation_type        SocratesCitationType enum
ref_id               UUID
label                TEXT
page_number          INT?
confidence           DECIMAL(4,3)?
order_index          INT
created_at           TIMESTAMPTZ
```
Indexes: `(assistant_message_id)`, `(project_id, citation_type, ref_id)`

### `socrates_open_targets`
```
id                   UUID PK
assistant_message_id UUID FK → socrates_messages
target_type          SocratesOpenTargetType enum
target_payload_json  JSONB
order_index          INT
created_at           TIMESTAMPTZ
```
Index: `(assistant_message_id)`

### `socrates_suggestions`
```
id               UUID PK
session_id       UUID FK → socrates_sessions
page_context     SocratesPageContext enum
suggestions_json JSONB
created_at       TIMESTAMPTZ
expires_at       TIMESTAMPTZ?
```
Indexes: `(session_id, page_context)`, `(session_id, page_context, expires_at DESC)`

### `dashboard_snapshots`
```
id           UUID PK
project_id   UUID? FK → projects
org_id       UUID FK → organizations
scope        DashboardSnapshotScope enum (general | project)
payload_json JSONB
computed_at  TIMESTAMPTZ
```
Indexes: `(org_id, scope, computed_at DESC)`, `(project_id, scope, computed_at DESC)`

### `communication_message_chunks`
```
id                 UUID PK
message_id         UUID FK → communication_messages
thread_id          UUID FK → communication_threads
project_id         UUID FK → projects
chunk_index        INT
content            TEXT
contextual_content TEXT?
lexical_content    TEXT
embedding          VECTOR(1536)?
token_count        INT
metadata_json      JSONB?
created_at         TIMESTAMPTZ
```
Indexes: unique `(message_id, chunk_index)`, btree `(project_id, thread_id)`, btree `(message_id)`, pgvector cosine index, GIN lexical index

### Enums added by Feature 2

| Enum | Values |
|------|--------|
| `SocratesPageContext` | `dashboard_general`, `dashboard_project`, `brain_overview`, `brain_graph`, `doc_viewer`, `client_view` |
| `SocratesSelectedRefType` | `document`, `document_section`, `brain_node`, `change_proposal`, `decision_record`, `dashboard_scope` |
| `SocratesMessageRole` | `user`, `assistant` |
| `SocratesResponseStatus` | `streaming`, `completed`, `failed` |
| `SocratesCitationType` | `document_section`, `document_chunk`, `message`, `brain_node`, `product_brain`, `change_proposal`, `decision_record`, `dashboard_snapshot` |
| `SocratesOpenTargetType` | `document_section`, `message`, `thread`, `brain_node`, `change_proposal`, `decision_record`, `dashboard_filter` |
| `DashboardSnapshotScope` | `general`, `project` |

---

## 8. API routes used by Feature 2

All routes are under `/v1`. Auth is required (Bearer JWT) on all routes.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/projects/:projectId/socrates/sessions` | Create a new Socrates session |
| `PATCH` | `/v1/projects/:projectId/socrates/sessions/:sessionId/context` | Update page context and/or selected object |
| `GET` | `/v1/projects/:projectId/socrates/sessions/:sessionId/suggestions` | Get current contextual suggestions |
| `POST` | `/v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream` | Stream an answer (SSE) |
| `GET` | `/v1/projects/:projectId/socrates/sessions/:sessionId/messages` | Get message history |

### Request/response shapes

**POST sessions body:**
```json
{
  "pageContext": "brain_graph",
  "selectedRefType": "brain_node",       // optional
  "selectedRefId": "uuid",               // optional, must be UUID
  "viewerState": { "anchorId": "...", "pageNumber": 3 }  // optional
}
```

**PATCH context body:**
```json
{
  "pageContext": "doc_viewer",           // optional
  "selectedRefType": "document_section", // optional, nullable
  "selectedRefId": "uuid",               // optional, nullable
  "viewerState": { ... }                 // optional, nullable
}
```

**POST messages/stream body:**
```json
{ "content": "What is the current auth requirement?" }
```

Content max length: 8000 chars.

**SSE events emitted by stream route:**
| Event | Payload |
|-------|---------|
| `message_created` | `{ userMessageId, assistantMessageId }` |
| `delta` | `{ text }` — streaming token chunk |
| `done` | Full answer: `{ assistantMessageId, answer_md, citations, open_targets, suggested_prompts, confidence }` |
| `error` | `{ code, message }` |

Standard JSON envelope `{ data, meta, error }` is used for all non-SSE routes.

---

## 9. Full session creation and context flow

1. Frontend calls `POST /v1/projects/:projectId/socrates/sessions` with `pageContext` and optionally `selectedRefType`/`selectedRefId`/`viewerState`.
2. `SocratesService.createSession` verifies project membership via `ProjectService.ensureProjectAccess`.
3. If a selected ref is supplied, the backend verifies that the target exists in the same project and is allowed in the caller's context.
4. If `viewerState` is supplied, the backend verifies that the referenced document/version/anchor resolves to the current project state.
5. Creates `SocratesSession` record. Returns the session object.
4. Frontend stores `sessionId`. Uses it for all subsequent calls in this browser session.
5. When user navigates to a different page or selects a different object, frontend calls `PATCH .../:sessionId/context`.
6. `SocratesService.patchContext` validates the next full context state, then updates the session record.
7. If `pageContext` or `selectedRef*` changed, all existing `SocratesSuggestion` rows for this session are deleted to force fresh generation.

**Session ownership rule:** A session is private to the creating user (`userId`). Other project members cannot read or update another user's session or message history.

---

## 10. Full page-aware context model

Six canonical page contexts determine both retrieval domain selection and reranking boosts:

| Page context | Primary evidence | Key bias |
|---|---|---|
| `dashboard_general` | Dashboard snapshots, org-wide accepted changes, brain nodes | Boost `dashboard_snapshot` 2.0×, `change_proposal` 1.4× |
| `dashboard_project` | Project dashboard snapshot, accepted Product Brain, recent changes/decisions | Boost `dashboard_snapshot` 1.8×, `product_brain` 1.5× |
| `brain_overview` | Accepted Product Brain, accepted changes/decisions, brain nodes | Boost `product_brain` 2.0×, `brain_node` 1.8× |
| `brain_graph` | Selected node + neighbors, linked sections, changes | Boost `brain_node` 2.0×, selected node 3.0× hard |
| `doc_viewer` | Selected section + ±2 adjacent sections, linked changes/messages | Boost `document_chunk` 2.0×, selected section 3.0× hard, neighbors 1.5× |
| `client_view` | Client-safe documents + shared-evidence brain nodes + dashboard only | Never expose `isInternalOnly=true` candidates |

Six selected-ref types trigger specific behavior:
- `document_section` → selected section hard boost + neighbor expansion
- `brain_node` → selected node hard boost + edge-neighbor expansion
- `change_proposal` → selected proposal gets a hard rerank boost if retrieved
- `decision_record` → selected decision gets a hard rerank boost if retrieved
- `document` / `dashboard_scope` → used for label resolution in suggestions and validated on session create/patch

---

## 11. Full suggestion generation flow

1. `GET .../:sessionId/suggestions` is called.
2. Service checks `socratesSuggestion` for a fresh (non-expired) row matching `sessionId` + current `pageContext`.
3. **Cache hit:** return `{ suggestions, cached: true }`.
4. **Cache miss:** call `generateAndCacheSuggestions`.
5. Resolve `selectedLabel` by looking up the selected ref entity (section anchor text, node title, etc.).
6. Build prompt via `buildSuggestionPrompt(pageContext, projectName, selectedLabel)`.
7. Call `generationProvider.generateObject` with `suggestionsOutputSchema` (1–5 strings).
8. On failure, fall back to `fallbackSuggestions(pageContext)` — deterministic per-page defaults.
9. Delete any older suggestion rows for the same `(sessionId, pageContext)`.
10. Store result in `socratesSuggestion` with `expiresAt = now + 15 min`.
11. Return `{ suggestions, cached: false }`.

**Invalidation triggers:**
- `patchContext` deletes all suggestion rows for the session when `pageContext` or `selectedRef*` changes.
- Feature 1 accepted artifact creation deletes all Socrates suggestions for sessions in the affected project, so Product Brain rebuilds and accepted-change application do not leave stale prompt suggestions behind.

**Async precompute:** `precompute_socrates_suggestions` job (BullMQ) calls `precomputeSuggestions(projectId, sessionId)` — skips if session or member no longer exists.

**Suggestion style contract:** ≤5 suggestions, ≤12 words each, page-specific, immediately actionable.

---

## 12. Full retrieval / CHR-RAG orchestration flow

CHR-RAG = Contextual Hybrid Hierarchical RAG. Six explicit layers:

```
Layer 1  selectDomains(pageContext, intent)  →  RetrievalDomains
Layer 2  hybridRetrieve(...)                 →  raw RetrievalCandidate[]
Layer 3  (embedded in Layer 2)               →  neighbor expansion
Layer 4  classifyIntent(query)               →  QueryIntent  (done before Layer 1)
Layer 5  rerank(candidates, ctx)             →  top-K RetrievalCandidate[]
Layer 6  buildUserPrompt(query, ctx)         →  prompt string → Claude
```

### Layer 1 — Domain selection (`src/lib/retrieval/domains.ts`)

`selectDomains(pageContext, intent)` returns a `RetrievalDomains` boolean struct:
```ts
{ includeDocuments, includeBrainNodes, includeProductBrain, includeChanges, includeDecisions, includeDashboard, includeCommunications }
```
- Each page context has a base domain set.
- Intent overrides expand the active domains (e.g., `change_history` enables `includeChanges`).
- `client_view` NEVER enables `includeChanges`, `includeDecisions`, or `includeCommunications` regardless of intent.
- `current_truth` and `explain_for_role` enable `includeProductBrain` for non-client contexts.

### Layer 2 — Hybrid retrieval (`src/lib/retrieval/hybrid.ts`)

Seven parallel retrievers, gated by domains:

| Retriever | Method | Score |
|---|---|---|
| Document chunks | `$queryRawUnsafe` with pgvector `<=>` | `(0.6 × vecSim + 0.4 × lex) × docWeight` |
| Product Brain | Prisma `findFirst` on latest accepted `product_brain` artifact | `0.75 × acceptedTruthBoost` |
| Brain nodes | Prisma `findMany` on latest accepted `brain_graph` artifact | `(isPriority ? 2.0 : lex + 0.3) × acceptedTruthBoost` |
| Change proposals | Prisma `findMany` on `accepted` proposals | `(lex + 0.4) × acceptedTruthBoost` |
| Decision records | Prisma `findMany` on `accepted` decisions | `(lex + 0.35) × acceptedTruthBoost` |
| Dashboard snapshot | Prisma `findFirst` on most recent project snapshot | Fixed `0.7` |
| Communication messages | pgvector retrieval over `communication_message_chunks` with lexical fallback | `(0.6 × vecSim + 0.4 × lex) × commWeight` |

`Promise.allSettled` is used so a failed retriever does not kill the whole pipeline.

**Vector scoring:** pgvector returns cosine distance `[0,2]`; converted to similarity via `1 - dist`. Only chunks with non-null embeddings are returned (WHERE clause: `AND dc.embedding IS NOT NULL`).

**Parse-revision safety:** document retrieval explicitly enforces `document_chunks.parse_revision = document_versions.parse_revision` and only joins `document_sections` from that same current parse revision. This prevents Socrates from citing stale chunks or stale anchors after Feature 1 reprocesses a document.

**Client context enforcement:** Changes, decisions, communications, and Product Brain retrieval are fully skipped (not just filtered post-retrieval) when `isClientContext=true`. Remaining candidates with `isInternalOnly=true` are filtered in the reranker.

**Communication retrieval path:** before semantic communication retrieval runs, Socrates ensures recent immutable `communication_messages` have chunk rows in `communication_message_chunks`. Missing chunks are created on demand, embedded once, and then reused by later queries. The unique `(message_id, chunk_index)` constraint plus duplicate-conflict handling keeps this safe under concurrent retrieval.

### Layer 3 — Hierarchical neighbor expansion

When `selectedSectionId` is set, `resolveNeighborSectionIds` fetches the ±2 adjacent sections in the same document version and the same parse revision (by `orderIndex`). After retrieval, candidates whose `documentSectionId` is in the neighbor set are tagged `isNeighborSection=true`.

For brain node expansion: selected node's edge neighbors and section-linked nodes are included in the brain node query directly.

### Layer 4 — Intent classification (`src/lib/retrieval/intent.ts`)

`classifyIntent(query)` uses ordered regex patterns. No LLM call.

10 intent types (in order of check priority):
1. `comparison_or_diff` — compare/diff/vs patterns
2. `change_history` — what changed/list changes/accepted changes
3. `decision_history` — decision records/why was chosen
4. `original_source` — first mentioned/original PRD/which slack introduced
5. `communication_lookup` — slack/gmail/thread/message
6. `dashboard_status` — project status/workload/pressure
7. `brain_local` — brain/module/flow/architecture
8. `doc_local` — this section/in this doc/page N
9. `explain_for_role` — explain to client/plain language
10. `current_truth` — fallback (what is/currently/latest)

**Key ordering constraint:** `comparison_or_diff` before `original_source` (prevents "original vs" false-positive). `original_source` before `communication_lookup` (prevents "which Slack message introduced" routing to generic slack lookup).

### Layer 5 — Reranking (`src/lib/retrieval/rerank.ts`)

`rerank({ candidates, pageContext, intent, selectedRefId, selectedSectionId, selectedNodeId, topK, isClientContext })`:

1. Filter: if `isClientContext`, remove all `isInternalOnly=true` candidates.
2. Score each candidate: `score = base × PAGE_BOOST × INTENT_BOOST`.
3. Selected-object hard boost: `× 3.0` if `documentSectionId === selectedSectionId` or `id === selectedRefId` / `selectedNodeId`.
4. Neighbor-section moderate boost: `× 1.5` if `isNeighborSection=true`.
5. Sort descending by final score.
6. Deduplicate by `id`. Enforce `maxPerSource=2` cap (same `containerId`).
7. Return first `topK` results. Early return if `topK <= 0`.
8. Candidates below `RETRIEVAL_MIN_SCORE` are dropped before reranking.

---

## 13. Query-intent routing model

See Layer 4 above. Key product routing rules:

| Intent | Evidence prioritized |
|---|---|
| `current_truth` | Product Brain → brain nodes → accepted changes → decisions → docs |
| `original_source` | Document chunks → communication messages → changes |
| `change_history` | Change proposals → communication messages |
| `decision_history` | Decision records → change proposals |
| `communication_lookup` | Communication messages |
| `dashboard_status` | Dashboard snapshots → change proposals |
| `brain_local` | Brain nodes |
| `doc_local` | Document chunks (with section hard boost) |

These are implemented as `INTENT_BOOST` multipliers in `rerank.ts`, not as separate retrieval pipelines.

---

## 14. Current-truth vs original-source precedence model

The system enforces **two distinct evidence modes** through the reranking multipliers:

**Current-truth mode** (intent = `current_truth`):
- `product_brain`: `× 2.0` boost
- `brain_node`: `× 1.5` boost
- `change_proposal`: `× 1.4` boost
- `decision_record`: `× 1.3` boost
- Result: accepted truth surfaces above stale original text

**Original-source mode** (intent = `original_source`):
- `document_chunk`: `× 1.8` boost
- `communication_message`: `× 1.5` boost
- Result: original doc sections and messages surface above derived summaries

The system prompt reinforces this: rule 2 says "prefer current accepted truth for current-state questions" and rule 3 says "prefer original document sections for provenance questions".

---

## 15. Full answer generation flow

1. `classifyIntent(userContent)` → `intent`
2. `selectDomains(pageContext, intent)` → `domains`
3. `embeddingProvider.embedText(userContent)` → `queryEmbedding`
4. `hybridRetrieve(...)` → raw candidates
5. `rerank(...)` → top-K candidates
6. `loadHistory(sessionId, 8)` → last 8 completed turns (user + completed assistant only)
7. `buildUserPrompt(userContent, ctx)` → prompt string
8. `client.messages.stream({ model, max_tokens: 3000, system: SOCRATES_SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] })` → streaming response
9. Accumulate `fullText` from `stream.on("text", ...)`
10. `await stream.finalMessage()` — waits for completion
11. Parse `JSON.parse(fullText.trim())` → validate with `answerSchema.parse(...)`
12. On parse failure: `retryStructuredAnswer(prompt, malformedText)` — one retry via `generationProvider.generateObject`
13. `validateOpenTargets(parsedAnswer.open_targets, projectId, isClientContext)` — DB-validate each target
14. Transaction: update assistant message to `completed`, persist citations, persist valid open-targets
15. Fire-and-forget: `generateAndCacheSuggestions(session, ...)` — update suggestions post-answer
16. `auditService.record({ eventType: "socrates_answered", ... })`
17. `sendEvent("done", { assistantMessageId, answer_md, citations, open_targets, suggested_prompts, confidence })`

---

## 16. Full streaming lifecycle

```
Client                    Server (SocratesService.streamAnswer)
------                    -----------------------------------------
POST .../messages/stream
                          1. Guard: ANTHROPIC_API_KEY present?
                          2. ensureSessionAccess + ensureProjectAccess
                          3. Persist user SocratesMessage
                          4. Create placeholder assistant message (responseStatus=streaming)
                          5. writeHead(200, SSE headers)
                          6. sendEvent("message_created", {...})
                          7. Start CHR-RAG pipeline (intent/domains/embed/retrieve/rerank)
                          8. Build prompt
                          9. client.messages.stream(...)
event: delta { text }  ←  10. stream.on("text") fires repeatedly
                          11. await stream.finalMessage()
                          12. Parse + validate answer JSON
                          13. Validate open-targets
                          14. $transaction: update msg to completed + persist citations/targets
                          15. Update suggestion cache (non-blocking)
                          16. Record audit event
event: done {...}      ←  17. sendEvent("done", full answer)
                          18. reply.raw.end()  [in finally block]

On error at any step:
                          - Update assistant message to responseStatus=failed
event: error {...}     ←  - sendEvent("error", { code, message })
                          - reply.raw.end()  [in finally block]
```

**Failure invariant:** On any error after the placeholder message is created, it is always marked `failed`. No half-persisted citations are possible because citations/targets are persisted in a single transaction that only runs on successful answer validation.

---

## 17. Citation model

Each citation is persisted as a `SocratesCitation` row:

```ts
{
  type: "document_section" | "document_chunk" | "message" | "brain_node" 
      | "product_brain" | "change_proposal" | "decision_record" | "dashboard_snapshot"
  refId: UUID        // ID of the cited entity
  label: string      // human-readable label
  pageNumber?: int
  confidence?: 0–1
}
```

Citations are generated by Claude from the evidence pack, then validated before persistence:
- `refId` must match an actual retrieved candidate id from this answer
- the cited entity must still exist inside the same project
- client context may only cite client-safe entities
- invalid or hallucinated citations are dropped before `socrates_citations` rows are written

---

## 18. Open-target model

Each open-target is persisted as a `SocratesOpenTarget` row and validated before persistence.

The `targetPayloadJson` shape depends on `targetType`:

| `targetType` | `targetRef` shape |
|---|---|
| `document_section` | `{ documentId?, documentVersionId?, anchorId, pageNumber? }` |
| `message` | `{ messageId, threadId? }` |
| `thread` | `{ threadId }` |
| `brain_node` | `{ nodeId, artifactVersionId? }` |
| `change_proposal` | `{ proposalId }` |
| `decision_record` | `{ decisionId }` |
| `dashboard_filter` | `{ filter, value? }` — always passes validation (no DB entity) |

**Backend validation rules per type:**

- `document_section`: must exist in DB with matching `projectId` and `anchorId`. If `isClientContext`, document `visibility` must be `shared_with_client`.
- `message`: blocked entirely in client context. Must exist with matching `projectId` and also correspond to a validated `message` citation from this answer.
- `thread`: blocked entirely in client context. Must exist with matching `projectId` and contain at least one validated cited message from this answer.
- `brain_node`: must exist with matching `projectId`. In client context, every linked source document must be `shared_with_client`, and the node must already be cited in the answer.
- `change_proposal`: blocked in client context. Must exist with matching `projectId` and correspond to a validated `change_proposal` citation.
- `decision_record`: blocked in client context. Must exist with matching `projectId` and correspond to a validated `decision_record` citation.
- `dashboard_filter`: only valid when a `dashboard_snapshot` citation exists in the same answer.

Invalid targets are silently dropped (not an error). The citation remains; only the open-target is omitted.

---

## 19. Role filtering / client-safe rules

Client context is determined when:
```ts
const isClientContext = member.projectRole === "client" || session.pageContext === "client_view";
```

**Retrieval layer:**
- `hybridRetrieve`: never fetches `includeChanges`, `includeDecisions`, or `includeCommunications` for client context (skipped at task level, not filtered post-retrieval)
- `hybridRetrieve`: never fetches `includeProductBrain` for client context
- Document chunk retrieval: adds `AND d.visibility = 'shared_with_client'` SQL filter
- Brain node retrieval marks a node as client-safe only when it has linked source sections and every linked source document is `shared_with_client`

**Domain selection:**
- `selectDomains`: `client_view` base domains never include changes/decisions/communications
- Intent overrides are guarded: `if (!isClientContext)` before adding change/decision/communication domains

**Reranker:**
- All `isInternalOnly=true` candidates are filtered before scoring

**Open-target validation:**
- `message`, `thread`, `change_proposal`, `decision_record` all return `false` for `isClientContext`

**Prompt:**
- `buildUserPrompt` adds `CLIENT-SAFE (internal refs must NOT appear in your answer)` notice when `isClientContext=true`

**System prompt:**
- Rule 1: "Answer ONLY from the supplied evidence" — evidence pack is already client-filtered

---

## 20. History and persistence model

`GET .../:sessionId/messages` returns all messages for the session in `createdAt ASC` order, including citations and open-targets.

`loadHistory` (used for prompt context) fetches the last 8 turns in `createdAt DESC` order, then reverses them. Filters:
- User messages: all included
- Assistant messages: only `responseStatus = 'completed'` with non-empty content

This prevents:
- Streaming placeholder messages (empty content, `streaming` status) from polluting context
- Failed messages from being included in conversational history

Timestamps are set by PostgreSQL `DEFAULT now()`. No client-provided timestamps accepted.

`responseStatus` lifecycle:
- Created as `streaming`
- Updated to `completed` in the same transaction as citation/target persistence
- Updated to `failed` in the catch block on any generation error

---

## 21. Tech stack used

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict) |
| HTTP framework | Fastify |
| ORM | Prisma |
| Database | PostgreSQL 15+ with pgvector extension |
| Queue | BullMQ (Redis-backed) or inline mode for tests |
| AI generation | Anthropic Claude (via `@anthropic-ai/sdk`) |
| Embeddings | OpenAI `text-embedding-3-small` (via `openai` SDK) |
| Validation | Zod |
| Testing | Vitest |

---

## 22. Libraries/packages/services used

| Package | Used for |
|---|---|
| `@anthropic-ai/sdk` | Streaming Claude responses via `client.messages.stream()` |
| `openai` | Embedding generation via `text-embedding-3-small` |
| `@prisma/client` | All database access |
| `zod` | Request body validation, AI output schema validation |
| `fastify` | HTTP server and route registration |
| `bullmq` | Async suggestion precompute job |
| `pino` | Structured logging |
| `jsonwebtoken` / `@fastify/jwt` | JWT auth guards |

---

## 23. Validation and security rules

### Input validation
- All route parameters and bodies validated with Zod schemas before service call
- `projectId` and `sessionId` must be valid UUIDs
- `pageContext` must be one of the 6 canonical values
- `selectedRefType` must be one of the 6 canonical values if present
- `content` (stream message) min 1 char, max 8000 chars

### AI output validation
- `answerSchema` (Zod) validates the full Claude response before any persistence
- `answer_md` must be non-empty
- `citations[]` validated for allowed types, UUID refIds, confidence 0–1
- `open_targets[]` validated by discriminated union per targetType
- `suggested_prompts[]` max 5 items
- Retry once with stricter prompt if parse fails; deterministic fallback if retry fails

### Prompt injection defense
- User query and conversation history are sanitized before prompt insertion
- `sanitizeUserText` strips null bytes and converts Markdown heading markers (`##`) to full-width `＃` characters to prevent prompt section hijacking

### Authorization
- All routes require `authGuard` (Bearer JWT)
- `ensureSessionAccess`: session must belong to project; caller must be project member (or own the session)
- `ensureProjectAccess`: caller must be active project member
- Client-safe filtering is fully server-side — not gated by client-provided flags

### API key guard
- `streamAnswer` throws `503 ai_provider_not_configured` immediately if `ANTHROPIC_API_KEY` is absent, before any DB writes

---

## 24. Error handling and edge cases

| Scenario | Behavior |
|---|---|
| Claude returns malformed JSON | Retry once with stricter prompt. If still invalid, return deterministic fallback answer shape. |
| Open-target ref not found in DB | Target silently dropped. Citation retained. |
| All retrieval tasks fail | Empty candidate list → Claude told "No evidence retrieved. Acknowledge the gap clearly." |
| Generation throws mid-stream | Assistant message marked `failed`. Error SSE event sent. `reply.raw.end()` called in `finally`. |
| `ANTHROPIC_API_KEY` missing | 503 thrown before any DB writes. |
| Session not found | 404 `session_not_found` |
| Project access denied | 403 `project_access_denied` |
| Invalid pageContext | 400 `validation_error` (Zod) |
| pgvector query fails | `Promise.allSettled` catches it; other retrievers continue |
| Suggestion generation fails | Deterministic fallback suggestions returned. No error surfaced to user. |
| precomputeSuggestions — session gone | Returns early. No error. |

---

## 25. Testing strategy

### Test files

| File | What it tests |
|---|---|
| `tests/socrates-intent.test.ts` | `classifyIntent` — 9 cases covering all intent types and fall-through |
| `tests/socrates-domains.test.ts` | `selectDomains` — 6 cases including client-safe blocking |
| `tests/socrates-rerank.test.ts` | `rerank` — 7 cases: boosts, hard boost, client filter, dedup, per-source cap |
| `tests/socrates-rerank-neighbor.test.ts` | Extended rerank: neighbor boost, current-truth vs original-source precedence, edge cases |
| `tests/socrates-hybrid.test.ts` | Hybrid retrieval: parse-revision safety, Product Brain retrieval, neighbor parse revision, semantic communication chunk indexing |
| `tests/socrates-schemas.test.ts` | Zod schema validation — 15 cases for all request/response schemas |
| `tests/socrates-prompts.test.ts` | Prompt construction + sanitization — 13 cases including injection defense |
| `tests/socrates-service.test.ts` | Service unit tests — suggestion invalidation, cache hit/miss, precompute, owner-only sessions, selected-ref validation, API key guard |
| `tests/socrates-routes.test.ts` | Route contract tests — 8 cases via Fastify `inject` with mocked service |

All tests are pure unit tests (no DB, no LLM, no network).

### Coverage intent
- Deterministic pipeline layers (intent, domains, rerank) have exhaustive unit tests
- Schema validation tests cover happy path, empty arrays, invalid types, range violations
- Prompt tests verify structural sections and sanitization
- Service tests verify business logic invariants (invalidation, auth guard, caching)
- Route tests verify HTTP contract shape and auth enforcement

---

## 26. Production-readiness notes

### Environment variables required for Socrates

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes for streaming | — | Optional in schema but validated at runtime in `streamAnswer` |
| `ANTHROPIC_MODEL_REASONING` | Yes | `claude-3-7-sonnet-latest` | Claude model ID |
| `OPENAI_API_KEY` | Yes for embeddings | — | Required for vector retrieval |
| `OPENAI_EMBEDDING_MODEL` | Yes | `text-embedding-3-small` | Must match the dimension used for stored embeddings |
| `RETRIEVAL_TOP_K` | No | `8` | Number of candidates before reranking |
| `RETRIEVAL_MIN_SCORE` | No | `0.2` | Candidates below this score are discarded before reranking |
| `RETRIEVAL_DOC_WEIGHT` | No | `1.0` | Multiplier applied to document chunk scores |
| `RETRIEVAL_COMM_WEIGHT` | No | `0.8` | Multiplier applied to communication message scores |
| `RETRIEVAL_ACCEPTED_TRUTH_BOOST` | No | `1.2` | Multiplier applied to accepted-truth sources (changes, decisions, brain nodes) |
| `METRICS_TOKEN` | No | unset | If set, `/metrics` requires matching `x-metrics-token` header |

### Deployment checklist
- [ ] PostgreSQL must have `pgvector` extension enabled
- [ ] All Feature 1 migrations applied before Feature 2 migrations
- [ ] `ANTHROPIC_API_KEY` set in production environment
- [ ] `OPENAI_API_KEY` set in production environment (or substitute embedding provider)
- [ ] Redis running and `REDIS_URL` set if using BullMQ mode for suggestion precompute
- [ ] `QUEUE_MODE=bullmq` for production; `inline` for dev/test only
- [ ] Document chunks indexed with embeddings before Socrates queries are expected to return results

### Operational concerns
- Each `streamAnswer` call embeds the query (OpenAI API call) before retrieval — latency ~150-400ms at cold start
- Suggestion generation adds one Claude API call per page context change — gated by 15-min TTL
- `$queryRawUnsafe` with pgvector requires that the embedding dimension matches exactly; mismatched dimensions will throw a pgvector error at query time
- High-volume deployments should consider connection pool settings for the Prisma client (default Prisma pool is sufficient for moderate load)
- `socrates_messages` with compound index `(session_id, created_at DESC)` ensures history queries are fast even with many messages per session
- `/metrics` exposes request and job counters/histograms in Prometheus text format; protect it with `METRICS_TOKEN` outside local development

---

## 27. How the feature was actually implemented in this repo

Feature 2 was implemented as a set of new modules on top of the existing modular monolith:

1. **Prisma schema extension** (`prisma/schema.prisma`): Added 7 new enums and 5 new models + `DashboardSnapshot`. Migration in `0002_socrates_and_dashboard`.
2. **CHR-RAG pipeline** (`src/lib/retrieval/`): Four new files — `intent.ts`, `domains.ts`, `hybrid.ts`, `rerank.ts`. Extended `types.ts` with `isNeighborSection` flag.
3. **Socrates module** (`src/modules/socrates/`): `schemas.ts`, `prompts.ts`, `service.ts`, `routes.ts`, `index.ts`.
4. **Wiring**: `src/types/index.ts` extended with `socratesService`. `src/setup-context.ts` instantiates `SocratesService` and adds inline job handler. `src/app/build-app.ts` registers routes. `src/worker.ts` registers BullMQ handler. `src/lib/jobs/types.ts` adds `precomputeSocratesSuggestions`.

---

## 28. File/module map of the implementation

```
src/
  modules/
    socrates/
      schemas.ts      — Zod schemas: createSession, patchContext, streamMessage, answerSchema, citationSchema, openTargetRefSchema
      prompts.ts      — SOCRATES_SYSTEM_PROMPT, buildUserPrompt, buildSuggestionPrompt, sanitizeUserText
      service.ts      — SocratesService: createSession, patchContext, getSuggestions, streamAnswer, getHistory
      routes.ts       — 5 Fastify routes
      index.ts        — barrel re-export
  lib/
    retrieval/
      intent.ts       — classifyIntent (lexical, no LLM)
      domains.ts      — selectDomains (deterministic)
      hybrid.ts       — hybridRetrieve (6 parallel retrievers, neighbor expansion)
      rerank.ts       — rerank (page/intent/selected-object boosts, dedup, per-source cap)
      types.ts        — RetrievalCandidate, RetrievalDomains, RetrievalSourceType

prisma/
  schema.prisma       — SocratesSession, SocratesMessage, SocratesCitation, SocratesOpenTarget, SocratesSuggestion, DashboardSnapshot + all enums
  migrations/
    0002_socrates_and_dashboard/migration.sql
    0003_socrates_perf_indexes/migration.sql

tests/
  socrates-intent.test.ts
  socrates-domains.test.ts
  socrates-rerank.test.ts
  socrates-rerank-neighbor.test.ts
  socrates-schemas.test.ts
  socrates-prompts.test.ts
  socrates-service.test.ts
  socrates-routes.test.ts
```

---

## 29. How Feature 2 depends on Feature 1

Feature 2 is a pure consumer of Feature 1's outputs. It does not write to any Feature 1 entities.

| Feature 1 entity | How Feature 2 uses it |
|---|---|
| `document_chunks` | Primary vector retrieval source; requires `embedding` column populated by Feature 1 pipeline |
| `document_sections` | Anchor lookup for open-target validation; neighbor-section expansion |
| `document_versions` | JOIN target in vector query; `status = 'ready'` filter |
| `documents` | `visibility` filter for client-safe retrieval |
| `artifact_versions` (brain_graph) | `SocratesService` queries latest `accepted` brain_graph artifact to scope brain node retrieval |
| `artifact_versions` (product_brain) | `hybridRetrieve` can inject the latest accepted Product Brain as current-truth evidence |
| `brain_nodes` | Retrieved as evidence; cited; used as open-targets |
| `brain_edges` | Neighbor expansion for selected node |
| `brain_section_links` | Expansion: find brain nodes linked to the selected section |
| `spec_change_proposals` (accepted) | Retrieved as evidence; cited; used as open-targets |
| `decision_records` (accepted) | Retrieved as evidence; cited; used as open-targets |
| `communication_messages` | Retrieved as evidence; cited; used as open-targets |
| `communication_message_chunks` | Semantic message retrieval store used before lexical fallback |
| `communication_threads` | Used for open-target `thread` type validation |

**Dependency:** If no `document_chunks` exist (Feature 1 pipeline not run), Socrates still functions — it falls back to brain nodes, changes, decisions, and dashboard facts. Suggestions and answers about specific doc sections will be weaker.

---

## 30. How Feature 3 (Live Doc Viewer) and later features consume Feature 2 outputs

### Feature 3 — Live Doc Viewer
- The `open_targets` returned by Socrates include `document_section` targets with `anchorId`.
- Feature 3's viewer must support scrolling to an `anchorId` in the currently open document when triggered by a Socrates open-target action.
- Citations of type `document_chunk` or `document_section` should highlight the relevant section in the viewer.
- Feature 3 should update the Socrates session's `viewerState` (via `PATCH .../context`) when the user navigates to a new section, so subsequent Socrates answers are biased toward that section.

### Feature 4 — Dashboard
- `DashboardSnapshot` rows are written by Feature 4's snapshot compute job.
- Socrates reads these as retrieval candidates for `dashboard_status` intent queries.
- Feature 4 should trigger suggestion cache invalidation (delete `socrates_suggestions` for affected sessions) when a new snapshot is published, to keep suggestions fresh after dashboard facts change.

### Future features
- A `brain_node_detail` page context may be added — the system supports it by adding a new value to `SocratesPageContext` enum and a new entry in the `BASE_DOMAINS` map in `domains.ts` and `PAGE_BOOST` in `rerank.ts`.
- Suggestion precompute can be triggered from any event that updates accepted truth (change accepted, brain graph rebuilt) by enqueuing `precompute_socrates_suggestions` for all active sessions in the affected project.

---

## 31. Known limitations / intentionally deferred items

| Item | Status | Notes |
|---|---|---|
| Communication message embeddings | Implemented | Missing `communication_message_chunks` are indexed on demand and reused by later retrievals. |
| `RETRIEVAL_MIN_SCORE` hard filter | Implemented | `hybridRetrieve` now filters candidates below `minScore` before reranking. |
| `neighborSectionIds` manual override | Deferred | The `HybridRetrievalInput` accepts `neighborSectionIds[]` for manual injection but callers always pass `undefined`, triggering auto-resolution. |
| Suggestion invalidation on accepted change | Implemented | Feature 1 accepted artifact creation deletes Socrates suggestions for sessions in the affected project. |
| Streaming timeout | Deferred | No explicit server-side timeout or cancellation budget is applied to the Anthropic stream yet. |
| Dashboard snapshot writes | Not Feature 2 | `DashboardSnapshot` schema is present; writes are the responsibility of Feature 4. |
| Golden evaluation set | Not yet built | Manual evaluation questions are documented in `docs/SOCRATES_RAG_SPEC.md §17.3` but no automated evaluation harness exists yet. |
| Multi-session per user | Not restricted | A user can have multiple sessions per project. No deduplication. Session state is lightweight (no cost per idle session). |
