v# Orchestra Build Plan

## 1. Purpose

This document defines the **system build plan** for the new Orchestra.

It is intended to align:
- backend implementation,
- frontend expectations,
- product scope,
- and delivery sequence.

This build plan is based on:
- the latest design doc,
- the current communication-first / product-brain-first Orchestra definition,
- and the currently known frontend shell assumptions.

It is **not** based on the frontend repo implementation yet.

Until the frontend repo is scanned, this build plan should be treated as:
- the authoritative backend-facing build sequence,
- and the authoritative frontend contract assumption set.

When the frontend repo arrives, route names or component assumptions may need minor adjustment, but the domain model in this document should stay stable.

---

## 2. The build target

We are building a **minimal AI-centric workspace** with four visible surfaces:

1. Dashboard  
2. Product Brain  
3. Live Doc Viewer  
4. Socrates (persistent left panel)

The backend must support:
- docs upload and parsing,
- current Product Brain generation,
- Workflow DAG / graph rendering payloads,
- page-aware Socrates,
- click-to-source doc navigation,
- communication-driven spec changes,
- current-truth updates,
- team/project dashboard data,
- role-based access,
- and a read-only client view.

---

## 3. Frontend contract assumptions (before repo scan)

These assumptions come from the design doc and should drive backend API design.

## 3.1 Layout shell
The default shell should be assumed to be:

```text
[collapsed hover nav] [Socrates panel] [main content panel]
```

The backend should therefore assume that:
- Socrates is available from almost every page
- page context changes matter
- selected entity context matters
- the main panel may need to open exact targets from Socrates answers

## 3.2 Expected main pages
The backend should assume at least these main page contracts exist:

- `/dashboard` — general dashboard
- `/projects/:projectId/dashboard` — project dashboard
- `/projects/:projectId/brain` — Product Brain / Project Map
- `/projects/:projectId/docs/:docId` — Live Doc Viewer
- `/client/:token` or equivalent — read-only client view

Socrates is not a standalone page.  
It is a persistent panel with sessions tied to page context.

## 3.3 Required page contexts
The backend should define page contexts as explicit enums, for example:

- `dashboard_general`
- `dashboard_project`
- `brain`
- `doc_viewer`
- `client_view`

Optional later contexts:
- `change_record`
- `decision_record`
- `brain_node_detail`

These page contexts drive:
- Socrates suggestions
- retrieval weighting
- answer framing
- open-target behavior

---

## 4. Core build strategy

The correct build strategy is:

### 4.1 Build backend around the product surfaces
Do not build generic backend modules and hope the UI fits them later.
Build the backend around:
- what the Dashboard needs,
- what Brain needs,
- what the Doc Viewer needs,
- and what Socrates needs.

### 4.2 Keep the visible UI minimal, keep the backend strong
The product should look simple.
The backend should not be simple-minded.

### 4.3 Preserve immutable source evidence
Original docs and source messages stay immutable.
The current truth evolves through structured accepted changes.

### 4.4 Ship the system of record first
The system must be able to answer:
- what the product currently is,
- where that came from,
- what changed,
- and why.

If that works, almost everything else becomes easier.

---

## 5. Build phases

## Phase 0 — Product contract freeze

### Goal
Freeze the product behavior before writing major backend code.

### Deliverables
- final root docs approved
- role model approved
- page context enum approved
- “original docs immutable / current truth derived” rule approved
- MVP connectors decision recorded
- client view fallback behavior approved

### Output
A stable product contract the backend can safely implement.

---

## Phase 1 — Core foundations

### Goal
Create the backend foundation every later module will depend on.

### Backend work
- repo structure
- Fastify app
- config/env validation
- Prisma + PostgreSQL
- auth
- org/project/user/membership model
- storage abstraction
- job queue
- provider abstraction for AI
- structured logging
- audit event model
- basic health endpoints
- rate limits / security baseline

### Frontend alignment
No main product page is unlocked yet, but this phase defines:
- auth contract
- project identity contract
- user/role contract

### Must be done before next phase
Everything in later phases depends on these primitives.

---

## Phase 2 — Documents + Product Brain v1

### Goal
Deliver the first complete “upload docs → structured Product Brain” path.

### Backend work
- doc upload endpoints
- document versioning
- parsing pipeline (PDF/DOCX/TXT/Markdown)
- section extraction
- chunking + embeddings
- source package generation
- clarified brief generation
- brain version generation
- brain graph payload generation
- artifacts/versioning for source package, clarified brief, brain, graph
- retrieval diagnostics and parse status

### Frontend surfaces unlocked
- Product Brain page can exist in early form
- doc list can exist
- doc processing status can exist

### Contract to frontend
The frontend should be able to:
- upload docs
- poll or subscribe to processing status
- fetch current Product Brain
- fetch current graph payload
- list uploaded docs

### Required acceptance
A manager should be able to upload docs and see a first current Product Brain without touching communication connectors yet.

---

## Phase 3 — Live Doc Viewer

### Goal
Make source evidence explorable.

### Backend work
- doc viewer payload endpoint
- doc page/section/anchor model
- search within document
- exact anchor resolution
- citation target response model
- selected-section context endpoint
- source reference objects for Socrates

### Frontend surfaces unlocked
- Live Doc Viewer
- open-to-anchor behavior
- selected-text / selected-section interactions

### Contract to frontend
The frontend should be able to:
- open a document
- jump to a section/page/anchor
- highlight cited sections
- ask Socrates about the current section

### Required acceptance
A cited answer must be able to open the exact document location that supports it.

---

## Phase 4 — Socrates core

### Goal
Deliver the page-aware AI experience.

### Backend work
- Socrates session model
- page context update endpoint
- suggestion generation
- Socrates RAG retrieval across brain/docs
- answer schema with citations
- SSE or streaming response endpoint
- open-target response model
- conversation history storage
- selected object context support

### Frontend surfaces unlocked
- persistent Socrates panel
- page-aware suggestions
- answers with citations
- click-from-answer to right panel target

### Contract to frontend
The frontend should be able to:
- create/reuse a Socrates session per project/page
- update page context
- fetch suggested prompts
- send a message and receive streamed answer tokens
- receive structured citations and target-open actions

### Required acceptance
Socrates must answer differently on Dashboard vs Brain vs Doc Viewer and must produce actionable citations.

---

## Phase 5 — Communication ingestion + change intelligence

### Goal
Make Orchestra a living source of truth instead of a doc-only system.

### Backend work
- communication connector model
- Slack ingestion
- Gmail ingestion
- WhatsApp Business interface model
- normalized threads/messages
- message embeddings / indexing
- message intelligence classification
- change candidate creation
- decision candidate creation
- contradiction detection across communication vs docs
- change review endpoints
- accepted/rejected change states
- linking change records to:
  - source messages
  - document sections
  - brain nodes

### Frontend surfaces unlocked
- Brain can now show accepted changes
- Doc Viewer can now show change markers
- Socrates can now answer from docs + comms
- Dashboard can now show change pressure

### Contract to frontend
The frontend should be able to:
- show recent communication-driven changes
- open source messages/threads
- see which sections/brain nodes are affected
- review and accept/reject change candidates (manager role)

### Required acceptance
A communication-originated requirement change must be able to become an accepted structured change that updates the current Product Brain and remains linked to the original message.

---

## Phase 6 — Living spec application

### Goal
Turn accepted changes into a real updated current truth.

### Backend work
- living spec / brain overlay logic
- accepted change application pipeline
- new brain version creation on accepted change
- affected section marker generation
- change lineage persistence
- decision log persistence
- “current vs original” truth queries
- diff endpoints between brain versions

### Frontend surfaces unlocked
- Brain reflects current accepted truth
- Doc Viewer shows “this section has changed since original”
- Socrates can explain what changed and why
- users can inspect exact source-message lineage

### Required acceptance
The original document remains unchanged, but the system clearly shows the current accepted interpretation and what communication changed it.

---

## Phase 7 — Dashboard implementation

### Goal
Deliver general and project dashboards aligned to the current minimal design direction.

### Backend work
- org/project dashboard aggregation
- dashboard snapshot model
- headcount and team breakdown aggregation
- project membership summaries
- allocation / workload summary model
- project attention scoring
- brain freshness / unresolved change pressure metrics
- dashboard read endpoints

### Frontend surfaces unlocked
- general dashboard
- project dashboard
- team headcount and breakdown
- workload visuals
- attention / change pressure cards

### Required acceptance
The dashboard should be useful and minimal, not noisy.

---

## Phase 8 — Role model + client view

### Goal
Make the product safe and aligned for all three actor types.

### Backend work
- manager/dev/client permission matrix
- project-scoped read filtering
- shared-doc filtering
- client-safe brain payload
- client preview URL configuration
- client flowchart fallback payload
- public or token-gated client view access

### Frontend surfaces unlocked
- dev-specific restricted experience
- client read-only view
- preview URL if configured
- flowchart/current-brain fallback if not

### Required acceptance
Client and dev views must not depend on the manager manually re-explaining the project.

---

## Phase 9 — Hardening, realtime, observability

### Goal
Make the system production-safe.

### Backend work
- retry-safe workers
- idempotent change acceptance
- connector failure handling
- audit events
- WebSocket/SSE events for:
  - doc processing
  - Socrates streaming
  - dashboard invalidation
  - change review updates
- observability
- rate limits
- security tests
- API contract tests

### Required acceptance
The system should be deployable without “we’ll harden it later” shortcuts.

---

## 6. Build order by user-visible value

If forced to prioritize by visible value:

1. Docs upload + Product Brain  
2. Live Doc Viewer  
3. Socrates  
4. Communication-linked change engine  
5. Dashboard  
6. Role-based restrictions  
7. Client view polish

This order is important because:
- the Brain is the foundation,
- the Viewer proves the evidence,
- Socrates makes the system useful,
- the change engine makes it alive,
- the Dashboard makes it operational.

---

## 7. Frontend-backend contract by page

## 7.1 General Dashboard
### Backend must provide
- org summary
- active projects
- team headcount
- role breakdown
- team/project distribution
- workload summary
- latest change pressure summary

### Frontend expects
- light cards/list/heatmap data
- not raw SQL-shaped payloads
- no huge graph payloads here

---

## 7.2 Project Dashboard
### Backend must provide
- project summary
- project members
- role breakdown
- workload summary
- document processing state
- current brain freshness
- recent changes / decisions

### Frontend expects
- concise, minimal sections
- drill-through links into Brain/Docs

---

## 7.3 Product Brain page
### Backend must provide
- current accepted brain version
- graph/node/edge payload
- summary + unresolved areas
- recent accepted changes
- linked doc sections
- linked messages

### Frontend expects
- one central structured brain surface
- graph or connected map payload
- clean navigation into source evidence

---

## 7.4 Live Doc Viewer
### Backend must provide
- doc metadata
- structured view payload
- pages/sections/anchors
- citation target payload
- change markers
- linked message references
- selected section context for Socrates

### Frontend expects
- open to exact place
- highlight exact place
- show exact linked change/message context

---

## 7.5 Socrates
### Backend must provide
- create session
- update page context
- get suggestions
- stream answer
- citations
- open-target actions

### Frontend expects
- persistent panel behavior
- page-aware prompts
- streaming response UX

---

## 8. Risks that can break alignment

These are the biggest backend/frontend alignment risks right now.

### Risk 1 — frontend adds extra pages not in product scope
Mitigation:
- build off written scope, not screenshot drift

### Risk 2 — backend overbuilds old Orchestra features
Mitigation:
- keep prototype/planning/sync/control-tower out of current product scope

### Risk 3 — Socrates returns text but not openable targets
Mitigation:
- citation contract must include target metadata, not just text spans

### Risk 4 — communication changes exist but do not update current truth
Mitigation:
- build accepted-change → new brain version flow as core, not later

### Risk 5 — dashboard becomes cluttered because backend exposes too much data
Mitigation:
- dashboard endpoints should be explicitly snapshot-based and minimal

---

## 9. Completion bar for backend/frontend alignment

The backend and frontend are aligned when:

- every visible page has a stable contract,
- Socrates knows page context,
- citations can open exact targets,
- accepted changes update the current brain,
- doc viewer shows those updates,
- dashboard reads from dedicated snapshot endpoints,
- role restrictions are enforced on the server.

If those are not true, the product may look right but will not actually behave right.

---

## 10. Final build principle

**Build the backend so the frontend can stay minimal.**  
The UI should feel simple because the backend is carrying the real complexity in a structured, reliable way.
