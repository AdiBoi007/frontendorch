# Orchestra Socrates + RAG Specification

## 1. Purpose

This document defines the **Socrates subsystem** in full detail.

Socrates is the AI copilot of Orchestra. It is not a generic chatbot. It is a **page-aware, project-aware, citation-first product copilot** that answers questions from:
- uploaded documents
- the current accepted Product Brain
- the Workflow DAG / graph
- accepted change records
- decision records
- communication threads and messages
- dashboard snapshot facts

This document should be treated as the implementation contract for:
- retrieval
- prompt construction
- page context handling
- answer schemas
- citations and open-targets
- suggestions
- streaming behavior
- persistence
- validation

---

## 2. Product rules

### 2.1 Socrates is grounding-first
Socrates must never answer from vague model memory.

Every substantive answer must come from one or more of:
- `product_brain` artifact
- `brain_graph` nodes/edges
- `document_sections`
- `document_chunks`
- `accepted change proposals`
- `decision_records`
- `communication_messages`
- `dashboard_snapshots`

### 2.2 Socrates is page-aware
The same user question can require different evidence depending on where the user is.

Example:
- on Dashboard, “What changed?” should prefer accepted changes and dashboard summaries
- on Doc Viewer, “What changed?” should prefer the currently open section, linked change markers, and source messages
- on Brain, “What changed?” should prefer current truth vs previous truth and changed graph nodes

### 2.3 Socrates must return navigable evidence
Every answer must be explorable.

If Socrates claims something, the frontend must be able to open:
- the exact document section
- the exact message/thread
- the exact brain node
- the exact change record
- or the exact dashboard drill target

### 2.4 Socrates must prefer current truth when the question is about current truth
If the user asks:
- “What is the current requirement?”
- “What should engineering follow now?”
- “What is the latest accepted understanding?”

then accepted current truth artifacts and accepted changes rank above stale original text.

### 2.5 Socrates must prefer original evidence when the question is about origin
If the user asks:
- “Where was this first mentioned?”
- “What did the original PRD say?”
- “Which Slack message introduced this?”

then original source evidence ranks above current summarized truth.

---

## 3. Main responsibilities

Socrates is responsible for five things:

1. **answering grounded product questions**
2. **explaining provenance and change history**
3. **suggesting useful prompts based on page context**
4. **opening exact targets on the right-side surface**
5. **maintaining short contextual session memory without becoming the source of truth itself**

---

## 4. Inputs Socrates depends on

## 4.1 Session context
Each Socrates session must store:
- `project_id`
- `user_id`
- `page_context`
- selected reference (`selected_ref_type`, `selected_ref_id`)
- optional viewer state (doc id, version id, page number, anchor id)
- short-turn history

## 4.2 Retrieval sources
Socrates retrieves from multiple evidence domains.

### Domain A — current product truth
- latest accepted `product_brain`
- latest accepted `clarified_brief`
- latest accepted `brain_graph`
- current graph nodes / edges

### Domain B — original documents
- `document_sections`
- `document_chunks`

### Domain C — communication
- `communication_threads`
- `communication_messages`
- `message_chunks`

### Domain D — current decisions and accepted changes
- `decision_records`
- `spec_change_proposals` in accepted status
- linked overlays/markers if materialized

### Domain E — dashboard facts
- `dashboard_snapshots`

---

## 5. Page context model

## 5.1 Canonical page contexts
Use the following enum values:
- `dashboard_general`
- `dashboard_project`
- `brain_overview`
- `brain_graph`
- `doc_viewer`
- `client_view`

Optional later contexts:
- `change_detail`
- `decision_detail`
- `brain_node_detail`

## 5.2 Context object
Recommended runtime object:

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

## 5.3 Page-specific behavior

### dashboard_general
Prefer:
- general dashboard snapshot
- org-wide recent accepted changes
- project attention summaries

### dashboard_project
Prefer:
- project dashboard snapshot
- current product brain summary
- recent accepted changes and decisions for the project

### brain_overview
Prefer:
- product brain artifact
- clarified brief
- high-level graph nodes
- accepted changes and decisions

### brain_graph
Prefer:
- graph nodes and edges
- graph-linked source sections
- accepted changes affecting graph nodes

### doc_viewer
Prefer:
- selected document section
- nearby sections / same heading path
- linked accepted changes
- linked messages
- current truth overlay for that area

### client_view
Prefer:
- client-safe filtered data only
- shared docs only
- current client-safe brain view
- no internal-only refs

---

## 6. Retrieval design

## 6.1 Retrieval domains
Socrates needs two retrieval domains:

### Document retrieval
Used for:
- PRD/SRS evidence
- doc viewer citations
- product brain grounding

### Communication retrieval
Used for:
- source-message provenance
- change history
- decision history
- clarification history

---

## 6.2 Retrieval strategy
Use hybrid retrieval, not vector-only retrieval.

Signals should include:
- semantic similarity
- lexical/keyword overlap
- section/anchor priority
- page-context weighting
- source type weighting
- recency weighting for communication
- accepted-truth weighting for current-truth questions

---

## 6.3 Retrieval source ranking rules

When the user asks about **current truth**:
1. accepted `product_brain`
2. accepted `spec_change_proposals`
3. `decision_records`
4. `brain_nodes` / `brain_edges`
5. original documents
6. communication messages

When the user asks about **original mention / provenance**:
1. original document sections / document chunks
2. original communication messages
3. accepted changes and decisions
4. current brain summary

When the user asks about **dashboard status**:
1. dashboard snapshot
2. latest accepted changes affecting project
3. current brain summary

When the user is on **doc_viewer** and has a selected section:
- selected section and same-heading neighbors must receive a very strong ranking bonus

When the user is on **brain_graph** and has a selected node:
- selected node, directly connected nodes, and linked document sections must receive a strong ranking bonus

---

## 6.4 Retrieval depth guidelines

Recommended initial limits:
- top 8–12 candidates before reranking
- 4–6 final citations in typical answers
- max 2 citations from the same exact source object unless the answer truly requires it

Avoid flooding the answer with redundant citations.

---

## 7. Document chunking rules

## 7.1 Chunking goals
Chunks must be:
- retrieval-friendly
- semantically coherent
- traceable to sections/pages
- robust enough for both Socrates and Brain generation

## 7.2 Recommended chunking strategy

### Unit of chunking
Chunk from normalized section text, not from raw file bytes.

### Chunk window
Recommended starting point:
- 500–700 tokens per chunk
- 50–100 token overlap

### Preserve section metadata on every chunk
Each chunk should retain:
- `project_id`
- `document_version_id`
- `section_id`
- `chunk_index`
- `page_number`
- `heading_path`
- `anchor_id`

## 7.3 Contextualized chunk text
Store both:
- `content` = raw chunk text
- `contextual_content` = chunk text prefixed with lightweight context, such as:
  - document title
  - kind
  - heading path
  - page number

This improves retrieval without changing viewer rendering.

---

## 8. Communication chunking rules

## 8.1 Why message chunks exist
Long message threads should be retrievable like documents.

## 8.2 Message chunking rules
- chunk only long messages or normalized thread summaries when needed
- preserve provider ids and timestamps
- link chunks back to exact message ids

## 8.3 Thread summary retrieval (recommended later)
Once enough thread history exists, maintain lightweight retrievable thread summaries for faster provenance answers.

---

## 9. Prompt construction

## 9.1 System prompt requirements
The system prompt must enforce:
- answer only from supplied evidence
- do not invent facts
- prefer current truth or original evidence based on question intent
- cite exact evidence refs
- surface uncertainty honestly
- keep output structured

## 9.2 User prompt composition
Recommended composition:

```text
1. Session context
2. Page context
3. Selected entity context
4. Current question
5. Short conversation history
6. Ranked retrieval evidence pack
7. Output schema instruction
```

## 9.3 History policy
Use short recent history only.
Suggested default:
- last 8–10 turns max
- summarize older context if needed

The source of truth is evidence, not chat memory.

---

## 10. Answer contract

Every assistant response must validate before persistence.

## 10.1 Required response schema

```json
{
  "answer_md": "The reporting requirement was first introduced in the PRD and later changed in a Slack thread on April 10.",
  "citations": [
    {
      "type": "document_section",
      "refId": "uuid",
      "label": "PRD — Reporting Requirements",
      "pageNumber": 6,
      "confidence": 0.94
    },
    {
      "type": "message",
      "refId": "uuid",
      "label": "Slack message from Jack",
      "confidence": 0.88
    }
  ],
  "open_targets": [
    {
      "targetType": "document_section",
      "targetRef": {
        "documentId": "uuid",
        "anchorId": "reporting_requirements"
      }
    }
  ],
  "suggested_prompts": [
    "Show me all accepted changes affecting reporting",
    "Summarize the current reporting flow for engineering"
  ],
  "confidence": 0.89
}
```

## 10.2 Schema rules
- `answer_md` is required
- `citations[]` required for all non-trivial answers
- `open_targets[]` optional but strongly preferred when citations can be opened directly
- `suggested_prompts[]` optional
- `confidence` optional but recommended

## 10.3 Citation types
Allowed citation types:
- `document_section`
- `document_chunk`
- `message`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_snapshot`

---

## 11. Open-target behavior

Open-targets are not UI sugar. They are part of the answer contract.

### 11.1 Allowed target types
- `document_section`
- `message`
- `thread`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_filter`

### 11.2 Validation rule
The backend must validate that:
- target exists
- target belongs to the project
- target is visible to the requester

Never let the frontend invent open-targets without backend validation.

---

## 12. Suggestion generation

## 12.1 When suggestions should be generated
Suggestions should be generated when:
- a session is created
- page context changes
- selected entity changes
- a major accepted change updates current truth
- the user asks a question and the assistant finishes answering

## 12.2 Suggestion style
Suggestions must be:
- short
- contextual
- actionable
- grounded in the current page

## 12.3 Page-specific examples

### dashboard_general
- Which projects changed most this week?
- Which teams need attention?
- Summarize org-wide pressure.

### dashboard_project
- What changed recently in this project?
- What should engineering focus on now?
- Summarize current project truth.

### brain_overview
- Explain the main flows.
- Which areas are still uncertain?
- Show recent accepted changes.

### brain_graph
- What does this node depend on?
- Which source docs support this area?
- Which recent changes affect this module?

### doc_viewer
- When was this feature first mentioned?
- Show accepted changes affecting this section.
- Give engineering-ready explanation for this section.

### client_view
- Summarize current shared scope.
- What changed recently?
- What should the client know next?

---

## 13. Streaming behavior

## 13.1 Transport
Use **SSE** for primary answer streaming.

Why:
- simpler than WebSocket for request-response assistant behavior
- easier to debug
- easier through proxies/CDNs
- sufficient for current product needs

## 13.2 Message lifecycle
Recommended write pattern:
1. persist user message
2. create placeholder assistant message in `streaming`
3. stream answer tokens
4. finalize answer
5. persist citations + open-targets + suggestions
6. mark assistant message `completed`

## 13.3 Failure handling
If generation fails:
- assistant message should be marked `failed`
- frontend receives a readable failure event
- no half-valid citations should be persisted

---

## 14. Persistence design

## 14.1 Persisted session state
Persist:
- sessions
- messages
- citations
- open-targets
- suggestions

## 14.2 Do not persist raw prompt blobs by default
Unless debugging mode explicitly requires it.

If prompt persistence is needed later, store it in a separate debug/audit table with retention rules.

---

## 15. Fallback behavior

Socrates should fail gracefully.

## 15.1 If retrieval is weak
- answer should explicitly say evidence is weak
- suggest opening the relevant doc or asking a narrower question

## 15.2 If the model cannot produce valid structured output
- retry once with stricter instructions
- if still invalid, return a deterministic fallback answer shape:
  - short answer
  - citations only from the highest-confidence retrieved refs
  - no unsupported claims

## 15.3 If a target is not openable
- keep the citation
- omit invalid open-target
- log the issue for repair

---

## 16. Security and safety rules

## 16.1 Prompt-injection defense
Sanitize free text before prompt insertion.

## 16.2 Client-safe filtering
If session is in client context, internal-only refs must be removed before answer generation or before final response serialization.

## 16.3 Provenance integrity
Citations must be backend-validated.
The frontend must never create or modify them.

---

## 17. Testing and evaluation

## 17.1 Unit tests
- chunk ranking
- page-context weighting
- target validation
- suggestion generation
- citation serialization

## 17.2 Integration tests
- doc upload → parse → chunk → embed → ask question → get cited answer
- click-to-source target open for document section
- accepted change reflected in current-truth answers
- original evidence still available for provenance queries

## 17.3 Golden evaluation set

This repository now includes a deterministic Socrates regression harness under `evals/socrates/` with CI-friendly runners:

- `npm run eval:socrates`
- `npm run eval:all`

Case format is JSONL. Each case specifies:

- fixture world/setup
- session page context and role
- query
- required current-truth or provenance behavior
- allowed/required citation types
- required open-target types
- required/forbidden answer phrases

Implemented categories:

- `current_truth` — accepted Product Brain / accepted changes must override stale originals
- `provenance` — origin questions must prefer original docs/messages over summaries
- `communication_origin` — source message/thread lookup must work when evidence exists
- `citation_correctness` — citations/open-targets must point to real entities
- `role_safety` — client-safe queries must not leak internal evidence

Deterministic scoring dimensions:

- `answer_behavior_pass`
- `citation_presence_pass`
- `citation_type_pass`
- `open_target_pass`
- `truth_precedence_pass`
- `provenance_precedence_pass`
- `role_safety_pass`

Reports are emitted as JSON and Markdown under `evals/outputs/`.

---

## 18. Final Socrates rule

A Socrates answer is only “good” if the user can verify it and navigate from it.

If the system returns pretty text without grounded citations and open-targets, the system is incomplete.
