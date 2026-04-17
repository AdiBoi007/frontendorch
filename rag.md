# Orchestra RAG Specification

## 1. Purpose

This document defines the **authoritative Retrieval-Augmented Generation architecture** for the current Orchestra product.

It exists to answer one question clearly and permanently:

> **What is the best RAG architecture for Orchestra, given what Orchestra is actually trying to do?**

The answer for this product is:

# **CHR-RAG**
# **Contextual Hybrid Hierarchical RAG**

with:
- **query-intent routing**
- **reranking before answer generation**
- **strict provenance and open-target output**
- **page-aware retrieval biasing**
- **current-truth vs original-source precedence rules**

This is the RAG system that best fits Orchestra.

It is not chosen because it is fashionable.
It is chosen because it best satisfies Orchestra’s non-negotiables:
- Product Brain must be built from uploaded source docs.
- Socrates must be page-aware and project-aware.
- The Live Doc Viewer must support exact citations and click-to-source.
- Accepted communication-driven changes must update the current truth without mutating original evidence.
- Answers must preserve provenance all the way through.

This file should be used together with:
- `README.md`
- `PRODUCT_OVERVIEW.md`
- `MVP_SCOPE.md`
- `FEATURES.md`
- `BUILD_PLAN.md`
- `Backend_plan.md`
- `DATA_MODEL.md`
- `API_SPEC.md`
- `PAGES_AND_CONTEXT.md`
- `SPEC_UPDATE_RULES.md`
- `SOCRATES_RAG_SPEC.md`

---

## 2. What Orchestra needs from RAG

Orchestra is **not** generic document question answering.

It is a system where users need to ask questions like:
- Where was this first mentioned?
- What does the PRD currently say now?
- What did the original PRD say before communication changed it?
- Which Slack or Gmail thread changed this requirement?
- Which section supports this Brain node?
- Why is Socrates saying this is the current truth?
- What is the engineer-ready explanation of this module?
- What changed in this project recently?
- Which source evidence supports that dashboard claim?

That means Orchestra’s RAG must do much more than semantic retrieval over raw chunks.

It must support:
1. **document understanding**
2. **communication understanding**
3. **current-truth precedence**
4. **origin/provenance inspection**
5. **page-aware retrieval**
6. **exact open-target navigation**
7. **living spec behavior**

That is why a naive “chunk, embed, top-k search, ask model” pipeline is not enough.

---

## 3. Final RAG choice

## 3.1 The chosen architecture

The best RAG architecture for Orchestra is:

# **CHR-RAG**
# **Contextual Hybrid Hierarchical RAG with Intent Routing, Reranking, and Strict Provenance**

### Expansion
- **Contextual** = indexing stores more than raw chunk text; it stores chunk context
- **Hybrid** = lexical retrieval + vector retrieval, not vector-only retrieval
- **Hierarchical** = retrieve across artifact → section/thread → chunk → neighbors
- **Routed** = retrieval behavior changes depending on the question intent
- **Reranked** = retrieved candidates are reordered before answer generation
- **Provenance-first** = answers return citations + open-targets, not just text

This is the best fit for Orchestra because it optimizes for:
- traceability
- faithfulness
- product-aware reasoning
- communication-aware reasoning
- viewer navigation
- current-truth correctness

---

## 4. Why this is better than other RAG styles

## 4.1 Why not plain vector search?
Plain vector search fails too often on:
- exact wording
- feature labels
- role names
- field names
- explicit requirement text
- “show me the message that changed this” style queries

For Orchestra, exact terms matter a lot.

Examples:
- “manager approval”
- “revenue split”
- “preview URL”
- “current accepted truth”
- “accepted change”
- “brain node”
- “reporting_requirements”

A vector-only retriever will miss too many high-value exact matches.

## 4.2 Why not naive chunking?
Naive chunking loses section meaning and document context.

In Orchestra, a chunk must stay tied to:
- project
- document version
- section
- page
- heading path
- anchor
- source kind
- current-truth relevance

Without that, click-to-source breaks and answers become hard to validate.

## 4.3 Why not GraphRAG as the primary engine?
GraphRAG is powerful, but it is not the right primary retrieval engine for V1.

Why:
- Orchestra’s strongest immediate evidence is still docs + sections + messages + accepted changes
- exact provenance matters more than graph-only abstraction
- graph generation exists already as Brain / Workflow DAG, but user questions still need section/message-level evidence
- GraphRAG can become a later optimization for graph-heavy reasoning, but it should not replace grounded retrieval from source evidence in V1

## 4.4 Why not fully agentic RAG?
Fully agentic RAG adds variability, latency, and debugging pain.

Orchestra needs:
- reliable answers
- structured citations
- page-aware consistency
- predictable retrieval
- deterministic enough behavior for production

So use a **controlled retrieval pipeline**, not a wandering agent loop.

## 4.5 Why not LangChain-heavy RAG as the core?
Because Orchestra needs tight control over:
- source precedence
- page context
- open-target generation
- artifact versions
- current-truth overlays
- message/document provenance

The core RAG system should be custom and explicit. Frameworks can assist experiments, but they should not own the main logic.

---

## 5. Core design goals of Orchestra RAG

The RAG system should optimize for the following, in this order:

1. **Correctness of current truth**
2. **Preservation of provenance**
3. **Exact navigability into the Viewer / messages / Brain**
4. **Strong retrieval recall across docs and communications**
5. **Low hallucination rate**
6. **Useful page-aware behavior**
7. **Reasonable latency**

If a tradeoff appears between “more cleverness” and “stronger provenance”, provenance wins.

---

## 6. Retrieval domains

Orchestra RAG must retrieve from multiple evidence domains.

## 6.1 Domain A — Current accepted truth
These sources answer “what is true now?”

- latest accepted `product_brain`
- latest accepted `clarified_brief`
- latest accepted `brain_graph`
- accepted `spec_change_proposals`
- accepted `decision_records`

## 6.2 Domain B — Original document evidence
These sources answer “what did the docs actually say?”

- `document_sections`
- `document_chunks`
- optionally raw version metadata

## 6.3 Domain C — Communication evidence
These sources answer “what did people actually say?”

- `communication_threads`
- `communication_messages`
- `message_chunks`

## 6.4 Domain D — Graph evidence
These sources answer “how does the product structure relate?”

- `brain_nodes`
- `brain_edges`
- `brain_section_links`

## 6.5 Domain E — Dashboard facts
These sources answer “what is the current dashboard status?”

- `dashboard_snapshots`
- optional team summary snapshots/read models

---

## 7. The six layers of CHR-RAG

## 7.1 Layer 1 — Contextual indexing

This happens at ingestion/index time.

### Rule
Do **not** embed raw chunk text only.

For every chunk, store:
- raw chunk text
- contextualized retrieval text
- document title
- document kind
- heading path
- page number
- section id
- anchor id
- project id
- version id
- optional current artifact linkage

### Example
Raw chunk:
> Revenue split is 80/20 for Pro users.

Contextualized retrieval text:
> PRD: Creator Monetization / Revenue Rules / Page 6 — Revenue split is 80/20 for Pro users.

### Why
Chunking destroys context. Contextualized retrieval text restores it enough for better lexical and semantic search.

### Document chunk fields
Recommended document chunk retrieval payload:
- `content`
- `contextual_content`
- `project_id`
- `document_version_id`
- `section_id`
- `page_number`
- `heading_path`
- `anchor_id`
- `token_count`
- `embedding`

### Message chunk fields
Recommended message chunk retrieval payload:
- `content`
- optional `contextual_content`
- `project_id`
- `thread_id`
- `message_id`
- `provider`
- `sent_at`
- `participants`
- `embedding`

---

## 7.2 Layer 2 — Hybrid retrieval

At query time, retrieval must combine:
- **vector retrieval**
- **lexical retrieval**

### Why hybrid is mandatory
Orchestra users often ask a blend of:
- semantic questions
- provenance questions
- exact-term questions
- entity lookup questions

Examples:
- “Where was manager approval mentioned?”
- “Show me the Slack message that changed revenue split”
- “What does the PRD currently say about onboarding?”
- “Which section supports this brain node?”

These are not pure semantic-search questions.

### Recommended hybrid design
For each query:
1. run vector retrieval over relevant domains
2. run lexical retrieval over relevant domains
3. normalize the scores
4. combine using weights that depend on intent and page context

### Lexical options
For V1, the best pragmatic choice is:
- Postgres `tsvector` / `tsquery`
- plus optional trigram similarity for fuzzy matches

This avoids introducing a second dedicated lexical engine too early.

### Vector options
For V1, use:
- `pgvector`
- cosine distance or inner product depending on embedding setup

### Recommended starting formula
For each candidate:

`combined_score = (vector_score * vector_weight) + (lexical_score * lexical_weight) + boosts`

Boosts may include:
- page-context boost
- selected-object boost
- accepted-truth boost
- section-neighbor boost
- recency boost for communications
- role visibility penalty or filtering

---

## 7.3 Layer 3 — Hierarchical retrieval

Do **not** retrieve from one flat pool only.

Use a retrieval hierarchy.

### Hierarchy
**Level 1 — accepted current-truth artifacts**
- product brain
- clarified brief
- accepted changes
- accepted decisions

**Level 2 — structural/document/message summary units**
- document sections
- thread summaries (when available)
- brain nodes

**Level 3 — granular retrieval units**
- document chunks
- message chunks

**Level 4 — local expansion**
- neighboring chunks
- adjacent sections
- linked messages
- linked document sections
- connected brain nodes

### Why
Different question types need different evidence granularity.

Example:
- “What is the current requirement?” → Level 1 first
- “Which section supports this?” → Level 2 + Level 3
- “Where did this change come from?” → Level 3 + linked message/doc refs
- “What else around this paragraph matters?” → Level 4 expansion

### Neighbor expansion rule
After retrieval and before answer generation, expand around the highest-value candidate with:
- preceding/following chunks from same section
- same-heading sections
- linked change markers
- linked messages or linked brain node refs

Do not just send isolated chunk text to the model.

---

## 7.4 Layer 4 — Query-intent routing

This is a non-negotiable part of Orchestra RAG.

Before retrieval, classify the query into one of a few intents.

## Recommended intent set
- `current_truth`
- `original_source`
- `change_history`
- `decision_history`
- `doc_local`
- `brain_local`
- `dashboard_status`
- `communication_lookup`
- `comparison_or_diff`
- `explain_for_role`

### Intent meanings

#### `current_truth`
User asks what the current accepted understanding is.

Prefer:
- accepted Product Brain
- accepted changes
- accepted decisions
- then original docs/messages for support

#### `original_source`
User asks what the original PRD/SRS/message said.

Prefer:
- original document sections
- original messages
- then overlays and accepted changes as explanation

#### `change_history`
User asks what changed and when.

Prefer:
- accepted changes
- source messages
- affected sections/nodes
- previous/current brain versions

#### `decision_history`
User asks who decided something, whether it was approved, or when.

Prefer:
- decision records
- source messages
- linked product areas

#### `doc_local`
User asks something while in Doc Viewer about the current section/page.

Prefer:
- selected section
- nearby sections
- linked changes/messages
- then current-truth overlays

#### `brain_local`
User asks about a selected Brain node/graph area.

Prefer:
- selected node
- connected nodes
- linked doc sections
- linked accepted changes

#### `dashboard_status`
User asks about dashboard facts.

Prefer:
- snapshots
- recent accepted changes
- team summaries

#### `communication_lookup`
User asks about a specific message/thread/provider-originated change.

Prefer:
- messages/threads
- message chunks
- linked proposals/decisions

#### `comparison_or_diff`
User asks what changed between versions or between source and current truth.

Prefer:
- version diffs
- accepted changes
- old/new understanding pairs

#### `explain_for_role`
User asks for PM/dev/client/CTO-friendly explanation.

Prefer:
- current truth
- linked evidence
- then apply role-aware response formatting

### Why routing matters
Without intent routing, retrieval becomes noisy and inconsistent. Orchestra cannot use one retriever behavior for every question.

---

## 7.5 Layer 5 — Reranking

After hybrid retrieval, rerank the candidates.

### Why reranking matters
Initial retrieval is about recall.
Reranking is about precision.

The best behavior is:
- retrieve 20–40 candidates
- rerank them
- keep top 6–10
- then build answer context

### Reranking options
Pragmatic order of preference:

#### Option A — external reranker (best pragmatic quality)
- Cohere Rerank or similar high-quality reranker

#### Option B — local cross-encoder reranker
- a BGE reranker or other cross-encoder if infra allows it later

#### Option C — lightweight heuristic reranker (fallback)
If you cannot use a dedicated reranker at first:
- combine hybrid score
- section/anchor boost
- selected object boost
- accepted-truth boost
- recency boost
- provenance boost

But the goal should still be to add a true reranker.

### Reranking inputs
Each candidate passed to the reranker should include:
- candidate text
- candidate type
- document/message title or label
- heading path
- page number
- project/source metadata
- optionally a short structural description

### Candidate diversity rule
After reranking, do not keep 10 nearly identical chunks from the same exact spot.
Apply diversity control:
- max 2–3 candidates from identical narrow context unless clearly necessary
- prefer evidence spread when it improves answer quality

---

## 7.6 Layer 6 — Provenance-first answer generation

The answer step should never return plain text only.

It should return a structured object.

## Required response schema

```json
{
  "answer_md": "...",
  "citations": [],
  "open_targets": [],
  "suggested_prompts": [],
  "confidence": 0.0
}
```

### Required fields
- `answer_md`
- `citations[]` for all non-trivial answers

### Strongly preferred fields
- `open_targets[]`
- `suggested_prompts[]`
- `confidence`

### Citation types Orchestra must support
- `document_section`
- `document_chunk`
- `message`
- `thread`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_snapshot`

### Open-target types Orchestra must support
- `document_section`
- `message`
- `thread`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_filter`

### Provenance rule
If the backend cannot produce a valid citation/open-target for a claim, it should not state that claim confidently.

---

## 8. Source precedence rules

This is where Orchestra becomes different from generic RAG.

## 8.1 Current-truth questions
For questions like:
- What is the current requirement?
- What should engineering follow now?
- What is the accepted scope now?

Use this precedence:
1. latest accepted Product Brain
2. accepted changes
3. accepted decisions
4. original docs/messages

### Behavior
- answer from current truth
- cite accepted change/decision if it materially shaped the truth
- still allow inspection of original source

## 8.2 Provenance questions
For questions like:
- Where was this first mentioned?
- What did the original PRD say?
- Which message introduced this change?

Use this precedence:
1. original docs/messages
2. accepted change/decision overlays
3. current truth summaries

### Behavior
- start from original evidence
- explain how current truth changed if relevant

## 8.3 Conflict rule
If current truth differs from original text:
- do not hide original text
- do not pretend the original text was rewritten
- show overlay/change lineage

This rule must be preserved in prompt design and answer logic.

---

## 9. Page-aware retrieval biasing

Page context is first-class.

## 9.1 `dashboard_general`
Bias toward:
- general dashboard snapshot
- org-wide recent accepted changes
- project summaries

## 9.2 `dashboard_project`
Bias toward:
- project dashboard snapshot
- current project brain
- recent project changes/decisions

## 9.3 `brain_overview`
Bias toward:
- current Product Brain
- clarified brief
- graph summary
- accepted changes/decisions

## 9.4 `brain_graph`
Bias toward:
- selected brain node
- connected nodes
- graph edges
- linked doc sections
- linked changes

## 9.5 `doc_viewer`
Bias toward:
- selected document section
- nearby sections
- linked accepted changes
- linked messages
- current truth overlay of that area

## 9.6 `client_view`
Bias toward:
- client-safe current truth
- shared docs only
- shared-safe accepted changes
- no internal refs

### Rule
Page context should adjust:
- retrieval source ordering
- score boosts
- answer framing
- suggested prompt generation

---

## 10. Data model impact

CHR-RAG requires some specific data choices.

## 10.1 Required tables/entities
At minimum the RAG system depends on:
- `document_sections`
- `document_chunks`
- `message_chunks`
- `artifact_versions`
- `brain_nodes`
- `brain_edges`
- `brain_section_links`
- `spec_change_proposals`
- `spec_change_links`
- `decision_records`
- `socrates_sessions`
- `socrates_messages`
- `socrates_citations`
- `socrates_open_targets`
- `socrates_suggestions`
- `dashboard_snapshots`

## 10.2 Required chunk metadata
Each chunk/message-chunk must be attributable to:
- project
- source object
- anchor/section/message/thread
- page or sent time
- version
- visibility rules

## 10.3 Current-truth support
Accepted change/decision references must be linkable into retrieval.

That means accepted changes cannot just be a textual note. They must be queryable objects with impact links.

---

## 11. Indexing pipeline

This is Feature 1 territory.

## 11.1 Document ingestion steps
1. upload file
2. parse file
3. normalize into sections
4. create anchors
5. chunk sections
6. build contextualized chunk text
7. embed chunks
8. create lexical search material
9. persist chunks + metadata
10. mark document version ready

## 11.2 Message ingestion steps
1. ingest provider message/thread
2. normalize message
3. chunk long messages or create retrievable thread summaries when needed
4. embed chunks
5. persist lexical search material
6. run message insight classification
7. create proposals/decision candidates if relevant

## 11.3 Lexical search material
Store lexical search material in one of these forms:
- Postgres `tsvector`
- or precomputed search text for an external engine later

For V1, Postgres full-text search is enough.

---

## 12. Query pipeline

This is Feature 2 territory.

## 12.1 Full pipeline

```text
Receive query
→ Load Socrates session + page context + selected object
→ Classify query intent
→ Choose source precedence + retrieval domains
→ Run hybrid retrieval across relevant domains
→ Merge candidates
→ Rerank candidates
→ Apply diversity control
→ Expand with neighbors / linked evidence
→ Build final context pack
→ Call reasoning model with strict answer schema
→ Validate structured output
→ Persist citations + open-targets + answer
→ Return stream/final answer
```

## 12.2 Context pack construction
The final context pack should include:
- short explanation of page context
- selected entity context
- highest-rank evidence snippets
- linked current-truth overlays if relevant
- original-source snippets if provenance requested
- explicit instruction about precedence

Do not just concatenate top-k chunks blindly.

---

## 13. Answer-generation rules

## 13.1 When evidence is weak
If retrieval is weak:
- say evidence is weak
- avoid pretending certainty
- suggest narrower follow-up

## 13.2 When sources disagree
If current truth and original source differ:
- say so
- identify which is original and which is current
- explain accepted-change linkage if available

## 13.3 When no visible target exists
If there is a valid citation but no open-target can be safely opened:
- return the citation
- omit the invalid open-target
- log the integrity issue

## 13.4 When answer is dashboard-based
If the answer comes mainly from dashboard snapshots:
- cite snapshot/time basis
- avoid overclaiming real-time exactness if snapshot freshness matters

---

## 14. Suggestion generation

Suggestion generation should be retrieval-backed too.

## 14.1 Inputs
- page context
- selected object
- recent accepted changes
- relevant open questions
- recent retrieved evidence in that context

## 14.2 Output style
- 3–5 prompts
- short plain English
- immediately useful
- page-specific
- not generic filler

## 14.3 Example prompts by page

### Dashboard
- Which projects need attention?
- What changed most this week?
- Which teams are overloaded?

### Brain
- Explain the core flows.
- Which areas are still uncertain?
- Show me modules affected by recent changes.

### Doc Viewer
- When was this first mentioned?
- Show accepted changes affecting this section.
- Summarize this section for engineering.

### Client View
- Summarize current shared scope.
- What changed recently?
- What should the client know next?

---

## 15. Latency design

RAG quality matters most, but the system still has to feel good.

## 15.1 Performance targets (pragmatic)
- upload acknowledgement: fast
- document indexing: async job
- first token from Socrates: as fast as practical
- retrieval + rerank: efficient enough for interactive use
- viewer open-target navigation: near-immediate after response

## 15.2 Strategies
- async document indexing
- precompute contextual chunks at ingestion time
- cache page-aware suggestions briefly
- cache current accepted artifact lookup
- use lightweight snapshots for dashboard retrieval

---

## 16. Evaluation framework

You should not trust RAG because it sounds good.
You should evaluate it.

## 16.1 Golden query sets
Create evaluation sets for:
- current-truth questions
- provenance questions
- change-history questions
- brain-node questions
- section-local questions
- dashboard questions

## 16.2 Metrics
Track:
- citation correctness
- open-target validity
- answer usefulness
- hallucination rate
- source-precedence correctness
- retrieval recall
- rerank quality
- first-token latency

## 16.3 Example evaluation questions
- Where was manager approval first mentioned?
- What is the current accepted onboarding requirement?
- Which Slack message changed the revenue split?
- Why does the Brain say this section changed?
- Summarize the current reporting flow for engineering.

---

## 17. What not to do

Do not build Orchestra RAG like this:

### Bad pattern 1
upload → chunk → embed → top-8 vector search → dump to Claude

### Bad pattern 2
current truth and original evidence mixed without precedence rules

### Bad pattern 3
citations returned as plain text references with no open-target structure

### Bad pattern 4
graph used as a buzzword without source-grounded retrieval

### Bad pattern 5
full agent loop for basic retrieval questions

### Bad pattern 6
framework-owned magic that hides retrieval decisions from you

---

## 18. Mapping to build phases

## Feature 1 — Product Brain
Implement:
- parsing
- sectioning
- chunking
- contextualized retrieval text
- embeddings
- lexical index
- pgvector storage
- provenance metadata
- accepted-truth artifact readiness

## Feature 2 — Socrates
Implement:
- query-intent classifier
- source precedence routing
- hybrid retrieval
- reranking
- neighbor expansion
- structured answer schema
- citations
- open-targets
- page-aware suggestions

## Feature 3 — Live Doc Viewer
Support:
- exact anchor/page open
- citation highlight
- change overlays
- source-message jumps

## Feature 4 — Dashboard
Support:
- dashboard-context retrieval
- snapshot-based factual answering
- project/general context distinctions

---

## 19. Final answer

The best RAG for Orchestra is:

# **CHR-RAG**
# **Contextual Hybrid Hierarchical RAG with Intent Routing, Reranking, and Strict Provenance**

That is the best fit because Orchestra needs:
- grounded current truth
- preserved original evidence
- exact citations
- open-target navigation
- page-aware Socrates
- communication-linked spec evolution

It is the right architecture for this product.
