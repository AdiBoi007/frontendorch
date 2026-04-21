# Orchestra

Orchestra is a **PRD-aware, AI-centric product brain and communication system** for client-facing software teams.

The current, authoritative Orchestra product is **not** the old prototype → board-sync → control-tower-heavy product.  
The current Orchestra is the product defined by the latest team design doc and the current product pivot:

- **Product Brain** (upload docs and build the current product truth)
- **Socrates** (the page-aware AI copilot)
- **Live Doc Viewer** (citation-first, click-to-source document and message navigation)
- **Dashboard** (general + project-level, with team headcount and breakdown)

This repository should be built around **those four user-facing surfaces** and the backend systems that make them trustworthy.

---

## Automated evaluation harness

Orchestra now includes a deterministic regression harness for:

- **Socrates**
- **communication/message intelligence**

The harness is fixture-backed, CI-friendly, and intended to be the authoritative quality gate for:

- current-truth precedence
- provenance precedence
- communication-origin lookup
- citation/open-target correctness
- role-safe filtering
- conservative communication classification
- proposal/de\-cision threshold behavior

Primary commands:

- `npm run eval:socrates`
- `npm run eval:messages`
- `npm run eval:all`

Reference docs:

- `evals/README.md`
- `docs/EVALS.md`

---

## 1. What Orchestra is now

Orchestra is the **communication source of truth** for software solution companies, devhouses, MVP studios, and similar client-facing software teams.

It exists to solve one repeated operational problem:

> The PRD/SRS lives in one place, client requests live in email/WhatsApp, internal discussion lives in Slack, and the team keeps losing the current shared understanding of what the product is, what changed, what was approved, and what engineering should follow.

Orchestra fixes that by making the product itself the center of the system.

The **source of truth** is not:
- the loudest Slack thread,
- the latest email,
- someone’s memory,
- or a stale PRD file.

The source of truth becomes:
1. uploaded product documents,
2. the structured Product Brain generated from them,
3. the Workflow DAG / Project Map,
4. communication updates linked back to the exact doc/message source,
5. a living current spec that reflects accepted changes,
6. Socrates answers grounded in that current truth.

---

## 2. The user-facing product surfaces

These are the **four product surfaces** that define the current Orchestra build.

### 2.1 Product Brain
The Product Brain is where the project becomes understandable.

It is responsible for:
- ingesting PRD/SRS and supporting project docs,
- parsing and indexing them,
- generating the first structured project understanding,
- turning that into a current product truth,
- surfacing the workflow graph / project map,
- tracking accepted changes to that truth over time.

### 2.2 Socrates
Socrates is the AI copilot that sits **persistently on the left side of the UI**.

It is:
- page-aware,
- project-aware,
- citation-first,
- aware of the current selected surface,
- able to suggest prompts based on page context,
- able to answer questions with exact references,
- able to open the exact document page / chunk / source message needed.

### 2.3 Live Doc Viewer
The Live Doc Viewer is the right-side document/workspace surface.

It is responsible for:
- displaying parsed documents,
- supporting exact page/section/chunk navigation,
- showing highlights and citations from Socrates,
- showing accepted change markers on affected PRD/SRS sections,
- linking those changes back to the exact communication message or thread that triggered them.

### 2.4 Dashboard
The dashboard exists in **two scopes**:
- **General / org-wide**
- **Project-specific**

It should remain **minimal**, not overstimulating.

It is responsible for:
- project listing and quick health visibility,
- team headcount and role breakdown,
- project-wise team allocation / workload visibility,
- project brain freshness / update visibility,
- unresolved changes / decision pressure,
- document processing and source coverage status.

---

## 3. The non-negotiable product rules

These are the rules every implementation decision must respect.

### 3.1 The written feature list is authoritative
The current authoritative feature list is:

1. Product Brain  
2. Socrates  
3. Live Doc Viewer  
4. Dashboard (general + project, with team headcount and breakdown)

Illustrative screenshots, UI inspiration images, and sketches are **layout and architecture references**, not permission to add random product features.

### 3.2 The system must be AI-centric and minimal
The product must feel:
- minimal,
- calm,
- easy to navigate,
- low-clutter,
- left-to-right understandable,
- centered around Socrates + one main surface.

Do not build an overstimulating dashboard full of unnecessary graphs, cards, and text.

### 3.3 Original documents stay immutable
The uploaded PRD/SRS and other source files are immutable source evidence.

If communication changes the current understanding, Orchestra must **not rewrite the original file bytes**.

Instead it must:
- create a structured change record,
- link that change to exact source messages,
- link it to affected document sections / brain nodes,
- apply it to the **current Product Brain / living spec layer**,
- visually mark affected areas in the Doc Viewer.

### 3.4 Communication-driven changes are first-class
If a client changes something in Slack, Gmail, or WhatsApp:
- Orchestra must detect it,
- classify it,
- link it to the relevant product area,
- preserve the original message/thread as evidence,
- allow approval/rejection,
- and, once accepted, update the current product truth.

### 3.5 Socrates must always answer from current truth + provenance
Socrates should never answer from vague memory alone.

It must be grounded in:
- uploaded docs,
- parsed document sections/chunks,
- the current accepted Product Brain,
- the Workflow DAG,
- accepted decisions,
- accepted change records,
- linked communication evidence.

### 3.6 Every important answer must be explorable
If Socrates says:
- where a feature was first mentioned,
- where a requirement changed,
- why a section now reads differently,
- which message introduced a change,

the user must be able to open the exact referenced evidence in the right-hand surface.

---

## 4. Current actor model

### 4.1 Manager role (PM / CEO / CTO / Manager)
This is one backend permission family for now.

Managers can:
- create and manage projects,
- upload and manage docs,
- connect communication sources,
- generate/rebuild the Product Brain,
- review and accept/reject changes,
- use Socrates across all surfaces,
- view general and project dashboards,
- manage team memberships,
- manage client sharing settings.

### 4.2 Dev role
Devs should have **nearly the same read surfaces** as Managers, but not the same control power.

Devs can:
- access assigned projects,
- use Socrates,
- view the Product Brain,
- use the Live Doc Viewer,
- inspect changes and decisions,
- view the project dashboard,
- upload internal notes or engineering clarification docs if allowed.

Devs cannot:
- approve or reject client-originated spec changes,
- manage org-wide settings,
- change project membership,
- publish client-facing views,
- alter the accepted current product truth directly.

### 4.3 Client role
Clients should have a **simplified read-only view**.

Baseline behavior:
- read-only selected project view,
- read-only Product Brain / flowchart / high-level current truth,
- read-only selected documents if explicitly shared,
- live preview URL if configured,
- otherwise flowchart / current-brain fallback.

Client view should never expose:
- internal-only notes,
- internal-only decision metadata,
- internal team-only communication,
- internal-only source documents or sections not explicitly shared.

---

## 5. The current frontend shell assumptions

Until the frontend repo is scanned, the backend should assume the following shell contract from the design doc:

- **far-left minimal nav**: collapsed by default, expands on hover
- **left working panel**: Socrates
- **main right panel**: current page surface (dashboard / brain / doc viewer / client view)
- **Socrates prompt suggestions depend on current page context**
- **asking Socrates should be able to open a target on the right**
- **doc interactions should be able to inform Socrates context**

The backend must expose APIs that fit this shell even before the exact frontend routes/components are finalized.

---

## 6. The source-of-truth model

The backend and product must use this mental model:

```text
Uploaded source docs
        ↓
Source Package
        ↓
Clarified Brief
        ↓
Product Brain / current structured truth
        ↓
Workflow DAG / graph projection
        ↓
Communication-linked changes and decisions
        ↓
Current accepted project truth
```

The “current truth” is therefore a **derived, versioned layer**, not a mutable raw document.

This is the single most important implementation rule in the system.

---

## 7. What this repo should not build by accident

Unless the scope changes later, do **not** rebuild the old Orchestra chain as the main product.

That means this repo should **not** drift back into:
- prototype studio as a core user-facing feature,
- Jira/Linear board sync as a core user-facing feature,
- delivery control tower as the product center,
- task manager / PM board behavior,
- developer surveillance,
- VS Code extensions,
- “run the whole company” product sprawl.

The current product is a **communication-first, product-brain-first system**.

---

## 8. Current active docs

The root product docs in this repo should be treated as the current build truth:

- `README.md`
- `PRODUCT_OVERVIEW.md`
- `MVP_SCOPE.md`
- `FEATURES.md`
- `BUILD_PLAN.md`
- `Backend_plan.md`

These are the active build docs.

Old materials, older feature docs, or older backend references should be treated as **reference only**, not as the current product definition.

---

## 9. Implementation philosophy

This repo should be built with the following philosophy:

- **backend-first**
- **contract-first**
- **versioned**
- **evidence-grounded**
- **minimal UI assumptions**
- **page-aware AI**
- **no hidden rewrites**
- **every meaningful change leaves a trail**
- **frontend and backend should share a stable surface contract**

---

## 10. One-line product statement

**Orchestra is a PRD-aware, AI-centric product brain for client-facing software teams — turning documents and communication into one current, traceable product truth that people can navigate, query, and trust.**

---

## Backend bootstrap

This repo now includes a backend-first Feature 1 scaffold for Product Brain built with:
- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL + pgvector
- Redis + BullMQ
- local/S3 storage abstraction

Core commands:
- `npm install`
- `npm run prisma:generate`
- `npm run build`
- `npm run dev`
- `npm run worker`
- `npm test`

Feature 1 currently covers:
- auth + project creation
- immutable document uploads and document versions
- parse → section → chunk → embed pipeline
- Source Package, Clarified Brief, Brain Graph, and Product Brain artifact generation
- accepted change proposal review + current-truth version updates
- viewer-ready document payloads for Live Doc Viewer integration
