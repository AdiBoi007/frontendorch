# CLAUDE.md

This file defines how Claude Code should behave when working on **Orchestra**.

It is adapted from the same core ideas popularized in the Karpathy-inspired `CLAUDE.md` pattern — think before coding, prefer simplicity, make surgical changes, and work against verifiable goals — but rewritten to match **this specific product, repo, and backend build**. The reference repo frames those four principles as the main guardrails for reducing common LLM coding mistakes. citeturn281048view0turn118445view0

This file is **project-specific** and should override generic agent habits.

---

## 1. What Orchestra is right now

Orchestra is a **PRD-aware, AI-centric product brain** for client-facing software teams.

This repository is **not** building the old Orchestra with prototype generation, board sync, delivery control tower, or developer-surveillance features.

The active product surfaces are only:

1. **Product Brain**
2. **Socrates**
3. **Live Doc Viewer**
4. **Dashboard**

These four surfaces and their supporting backend systems are the only active scope unless the user explicitly changes product direction. The authoritative product docs state this clearly. fileciteturn38file7 fileciteturn38file8 fileciteturn38file9

---

## 2. Source-of-truth document order

Before coding, read the smallest set of docs necessary for the task.

Use this priority order:

1. `README.md`
2. `PRODUCT_OVERVIEW.md`
3. `MVP_SCOPE.md`
4. `FEATURES.md`
5. `BUILD_PLAN.md`
6. `Backend_plan.md`
7. `docs/DATA_MODEL.md`
8. `docs/API_SPEC.md`
9. `docs/SOCRATES_RAG_SPEC.md`
10. `docs/PAGES_AND_CONTEXT.md`
11. `docs/ROLE_CAPABILITIES.md`
12. `docs/SPEC_UPDATE_RULES.md`
13. `docs/ENV_AND_DEPLOYMENT.md`
14. `docs/rag.md`

If code conflicts with docs, do **not** silently choose one.
First determine whether:
- the docs are outdated,
- the code is legacy,
- or the task requires a documented contract change.

If a contract changes, update the docs in the same task unless the user explicitly says not to.

---

## 3. Product rules that must never be violated

These are not style preferences. They are product invariants.

### 3.1 Original sources are immutable
Uploaded PRDs, SRS files, supporting documents, and ingested communication messages are immutable source evidence.

Never silently rewrite original documents or messages.

### 3.2 Current truth is derived and versioned
The system’s current truth is derived from:
- uploaded docs,
- accepted change records,
- accepted decisions,
- and the current Product Brain artifact.

Do not mutate accepted truth in place if the product rule says a new version must be created.

### 3.3 Accepted changes must keep provenance forever
Every accepted change must remain linked to:
- exact source message(s) or evidence,
- affected document section(s),
- affected brain node(s),
- approver,
- acceptance time.

### 3.4 Socrates is citation-first
Socrates must not produce “trust me” answers.
Every substantive answer must be grounded and navigable.

### 3.5 Page context is first-class
Socrates behavior must depend on page context and selected object context.

### 3.6 The frontend stays minimal because the backend is strong
Do not push complexity into the UI contract just because it is easier than modeling the backend correctly.

These rules are repeatedly reinforced across the current docs. fileciteturn38file7 fileciteturn38file12 fileciteturn38file15 fileciteturn38file17

---

## 4. The four working principles for this repo

## 4.1 Think before coding
Do not assume silently.

Before implementing anything non-trivial:
- state your assumptions explicitly,
- identify ambiguity,
- name tradeoffs,
- and ask only if the ambiguity is truly blocking.

If the docs already answer the question, do not ask the user again.

If two interpretations are possible, surface them briefly and choose the one most consistent with the current docs and user instructions.

## 4.2 Simplicity first
Write the minimum system that correctly solves the current problem.

Do not add:
- speculative flexibility,
- generic abstractions for imagined future cases,
- new subsystems outside active scope,
- “while I’m here” refactors,
- or impressive architecture with weak justification.

For Orchestra, simplicity means:
- strong explicit contracts,
- modular monolith boundaries,
- thin routes,
- clear services,
- and explicit provenance.

## 4.3 Surgical changes
Touch only what the task requires.

Do not:
- reformat unrelated files,
- clean up unrelated dead code,
- rename large areas of the repo for taste,
- or refactor stable modules unless the task requires it.

If your changes create new dead code, remove **only** what your changes orphaned.

## 4.4 Goal-driven execution
Convert requests into verifiable goals.

For each significant task, define:
1. what must change,
2. how it will be verified,
3. what “done” means,
4. what remains intentionally out of scope.

The Karpathy-style guideline repo explicitly centers these four principles, and this file applies them to Orchestra’s current codebase and product constraints. citeturn281048view0turn118445view0

---

## 5. Active build scope

Unless the user explicitly changes it, this repo is building:

### Feature 1 — Product Brain
- upload docs
- parse
- section
- chunk
- contextualize
- embed
- store in DB
- retrieval-ready indexing
- Source Package
- Clarified Brief
- Product Brain
- Workflow DAG / Project Map
- versioned current truth
- accepted change integration

### Feature 2 — Socrates
- project-aware sessions
- page-aware context
- suggestion generation
- RAG retrieval over docs + current truth
- citation-first answers
- open-target output

### Feature 3 — Live Doc Viewer
- parsed document view
- exact anchors / pages / sections
- citation highlighting
- change markers
- source-message link display

### Feature 4 — Dashboard
- minimal general dashboard
- minimal project dashboard
- team headcount and role breakdown
- project/brain freshness / change pressure indicators

If a task starts to drift into any of the following, stop and treat it as out of scope unless explicitly requested:
- prototype generation
- Jira/Linear sync
- delivery control tower
- task planning engine
- VS Code extension
- codebase-aware per-dev agents
- developer surveillance
- CRM behavior
- omnichannel send/reply suite

These exclusions are required by the current product docs. fileciteturn38file8 fileciteturn38file9

---

## 6. Backend architecture rules

Unless the user instructs otherwise, follow these architecture choices:

- **Node.js + TypeScript + Fastify**
- **PostgreSQL + pgvector**
- **Prisma**
- **Redis + BullMQ**
- **S3-compatible object storage**
- **SSE for Socrates streaming**
- **modular monolith**, not microservices

Use:
- thin route handlers,
- strong service layer,
- explicit domain modules,
- idempotent jobs,
- audit events,
- versioned artifacts,
- normalized provenance links.

Do not introduce a second database, a second search engine, or a second orchestration layer unless the current docs make it necessary.

This matches the current backend plan and deployment/environment docs. fileciteturn38file6 fileciteturn38file13 fileciteturn38file17

---

## 7. RAG rules for Orchestra

The active RAG architecture is:

# CHR-RAG
# Contextual Hybrid Hierarchical RAG

with:
- query-intent routing,
- reranking,
- strict provenance,
- page-aware retrieval biasing,
- current-truth vs original-source precedence.

### 7.1 What this means in practice
At indexing time:
- store raw chunk text,
- store contextualized chunk text,
- preserve title, heading path, page number, section id, anchor id, project id, version id.

At query time:
- classify intent,
- select retrieval domains,
- run hybrid retrieval (vector + lexical),
- rerank candidates,
- expand with nearby/linked evidence,
- produce structured answer schema.

### 7.2 Do not use these as the primary approach
- vector-only retrieval
- naive chunking only
- GraphRAG as the primary engine
- fully agentic retrieval
- LangChain as the core runtime abstraction
- “top-k chunks into model and hope”

### 7.3 Build split
Feature 1 owns:
- parsing
- sectioning
- chunking
- contextualization
- embeddings
- lexical index material
- provenance metadata

Feature 2 owns:
- query-intent classifier
- retrieval routing
- hybrid retrieval
- reranking
- answer schema
- citations
- open-targets
- page-aware suggestions

These are the locked RAG decisions for this repo. fileciteturn38file19 fileciteturn38file16 fileciteturn38file21

---

## 8. How to approach every task

For any non-trivial task, follow this sequence:

### Step 1 — Read only the docs you need
Do not read everything blindly if the task is local.
Read the smallest relevant set.

### Step 2 — Restate the task in Orchestra terms
Translate the request into:
- which surface is affected,
- which backend module is affected,
- what invariants must remain true,
- what is out of scope.

### Step 3 — State assumptions
If assumptions are needed, state them briefly before coding.
Do not bury them in code.

### Step 4 — Define success criteria
Use verifiable checks, such as:
- migration applies,
- endpoint returns contract shape,
- job completes idempotently,
- citation opens exact anchor,
- current truth version increments correctly,
- tests pass.

### Step 5 — Implement the smallest correct slice
Prefer vertical slices over speculative full frameworks.

### Step 6 — Verify
Run the appropriate subset of:
- typecheck,
- lint,
- unit tests,
- integration tests,
- contract tests,
- manual verification notes.

### Step 7 — Report clearly
At the end of the task, say:
- what changed,
- what was verified,
- what assumptions were made,
- what remains intentionally unbuilt.

---

## 9. How to behave when changing existing code

When modifying existing files:
- preserve current style unless the task says otherwise,
- do not refactor for taste,
- do not rename symbols broadly without need,
- do not remove old code unless your change orphaned it,
- do not “clean up” unrelated modules.

If you discover deeper problems, mention them separately rather than folding them into the same task.

The reference Karpathy-inspired guide emphasizes this “surgical changes” rule strongly, and it is especially important here because Orchestra’s domain rules are easy to damage with broad edits. citeturn281048view0turn118445view0

---

## 10. Required output quality bar

Any code written for this repo must be:
- typed,
- explicit,
- modular,
- testable,
- provenance-safe,
- role-safe,
- retry-safe for async jobs,
- and aligned with the current API/data-model contracts.

Do not ship:
- hand-wavy TODO logic in critical paths,
- silent fallback behavior that hides errors,
- untracked mutation of current truth,
- or AI outputs that bypass schema validation.

---

## 11. Tests and verification expectations

For meaningful backend work, add or update tests.

### Minimum expectations by task type
- **schema/migrations** → migration sanity + Prisma generation
- **parsing/chunking** → unit tests
- **retrieval / Socrates logic** → integration tests with deterministic fixtures
- **change acceptance / current truth updates** → versioning + provenance tests
- **API routes** → contract/integration tests
- **dashboard reads** → snapshot/read-model tests

Goal-driven execution means code is not done when “it compiles.” It is done when the success criteria are verified.

---

## 12. Docs must stay aligned with the build

If you change any contract affecting:
- API routes,
- data model,
- page context,
- role capabilities,
- RAG behavior,
- current-truth rules,

then update the relevant markdown docs in the same task, unless the user explicitly says not to.

This repo treats docs as active build contracts, not decoration.

---

## 13. When to ask the user vs when to proceed

Ask only when the ambiguity is truly blocking and the docs do not resolve it.

Proceed without asking when:
- the docs already imply the correct choice,
- the user has already locked the scope,
- there is a safe, minimal default,
- or the task can be completed with a clearly documented assumption.

For trivial tasks, use judgment and move quickly.
For structural tasks, be more explicit and cautious.

This caution-over-speed tradeoff is also part of the original Karpathy-style guidance. citeturn281048view0turn118445view0

---

## 14. Current top-level priorities

Until the user changes priority, work in this order:

1. **Feature 1: Product Brain**
2. **Feature 2: Socrates**
3. **Feature 3: Live Doc Viewer**
4. **Feature 4: Dashboard**

And while building Feature 1, the default vertical slice should be:

```text
upload doc
→ store immutable source
→ parse into sections
→ chunk + contextualize
→ embed + index
→ build Source Package
→ build Clarified Brief
→ build Brain Graph
→ build Product Brain
→ expose viewer-safe + retrieval-safe outputs
```

That priority order is directly aligned with the current MVP and build docs. fileciteturn38file8 fileciteturn38file10 fileciteturn38file20

---

## 15. Final instruction

Build Orchestra as a **versioned product-truth engine with page-aware AI and strict provenance**.

If a change makes the system look more magical but less traceable, it is the wrong change.
If a change makes the system simpler, more verifiable, and more faithful to source evidence, it is probably the right change.
