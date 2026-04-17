# Orchestra MVP Scope

## 1. Purpose of this document

This document defines the **exact MVP scope** for the current Orchestra build.

It exists to stop scope drift and to make sure backend and frontend are aligned around the same reality.

This scope is based on:
- the latest design doc,
- the current product pivot,
- and the user-facing features explicitly listed by the team.

The written scope in this document is authoritative.

If a screenshot, sketch, old dashboard, or old Orchestra concept suggests extra features that are not listed here, they are **not automatically in scope**.

---

## 2. MVP goal

The MVP goal is to ship a working, AI-centric, minimal system where a user can:

1. create a project,
2. upload PRD/SRS and related docs,
3. generate a structured Product Brain and Project Map,
4. use Socrates from different pages with page-aware suggestions,
5. open exact cited sections in the Live Doc Viewer,
6. ingest communication from project channels,
7. detect and review communication-driven spec changes,
8. update the current accepted product truth from those changes,
9. view general and project dashboards with team headcount and breakdown,
10. and let different roles see the correct subset of that truth.

That is the MVP.

---

## 3. Authoritative MVP features

These are the **four user-facing MVP features**:

1. **Product Brain (Upload docs)**
2. **Socrates**
3. **Live Doc Viewer**
4. **Dashboard (product-wise + general) + team headcount and breakdown (product-wise + general)**

These are the public product surfaces that must exist in V1.

---

## 4. Design constraints from the current plan

The current UI and system behavior must respect these design constraints:

### 4.1 AI-centric
The product should feel like an AI-first workspace, not like a traditional cluttered SaaS dashboard with a chat box glued onto it.

### 4.2 Minimal
The system should feel:
- clean,
- low-clutter,
- obvious,
- simple to navigate,
- and not overstimulating.

### 4.3 Socrates-left, system-right
The intended shell is:
- minimal nav,
- Socrates panel on the left,
- main working surface on the right.

### 4.4 Minimal hover nav
The nav should be thin/collapsed by default and expand only when needed.

### 4.5 Images are architectural references, not feature authority
Reference screenshots and inspiration boards are for:
- layout direction,
- visual feel,
- shell architecture.

They are **not** permission to add surprise features.

---

## 5. In-scope MVP features, in detail

## 5.1 Product Brain

### Must ship
- create project
- upload PRD/SRS and supporting docs
- support at least PDF, DOCX, TXT/Markdown, pasted text
- parse documents into structured sections/chunks
- build initial structured project understanding
- generate a current Product Brain
- generate a Workflow DAG / Project Map
- keep versioned Product Brain snapshots
- show core flows/modules/dependencies/constraints/integrations
- preserve source evidence and doc references
- show unresolved areas / ambiguity

### Must also ship
- communication-driven updates can affect the current brain
- accepted updates must create a newer current truth
- accepted updates must be linked to the exact source message(s)
- the affected doc sections and brain nodes must be linkable
- the original uploaded document remains immutable

### Out of scope for MVP
- full manual PRD editing surface
- complex branching/version merging
- automatic task planning
- automatic prototype generation
- automatic Jira/Linear sync

---

## 5.2 Socrates

### Must ship
- persistent Socrates panel
- project-aware sessions
- page-aware context
- page-specific suggested prompts (3–5)
- ability to ask questions about:
  - the product,
  - source documents,
  - flows/modules,
  - communication changes,
  - decisions,
  - dashboard facts
- answer streaming
- exact citations
- target opening on the main surface

### Must also ship
- Socrates must know the current page context
- Socrates must know the selected project
- Socrates must know the selected document / section / brain node when relevant
- answers must prefer current accepted truth over stale raw text
- answers must still allow the user to inspect the original evidence

### Out of scope for MVP
- autonomous actions
- code generation
- sending outbound messages automatically
- becoming a general-purpose chat assistant outside product context

---

## 5.3 Live Doc Viewer

### Must ship
- list documents for a project
- open a document in a readable parsed form
- navigate to exact pages / sections / anchors
- highlight cited text from Socrates
- open a document at the exact place referenced by a citation
- show accepted change markers on affected sections
- show which communication message introduced or changed a requirement
- support click-to-source behavior from the doc itself

### “Mannan feature” is mandatory
When the user clicks a statement in the doc/PRD, Orchestra should be able to show:
- where the statement came from,
- what evidence supports it,
- and whether any accepted communication update now modifies that area.

### Out of scope for MVP
- pixel-perfect PDF rendering parity with native PDF readers
- full collaborative annotation system
- Figma-like commenting UX
- handwritten OCR features beyond what is needed for uploaded documents

---

## 5.4 Dashboard

### Must ship
Two scopes:
- **General dashboard**
- **Project dashboard**

### General dashboard must include
- active projects list
- total team headcount
- team breakdown by role
- team/project membership overview
- minimal workload or pressure visibility
- top projects needing attention
- recent change/decision pressure summary

### Project dashboard must include
- project summary
- project members
- project team headcount and role breakdown
- simple workload / allocation view for the project
- document readiness / processing state
- latest Product Brain freshness / current truth status
- unresolved changes / decisions summary
- quick links into Brain and Docs

### Out of scope for MVP
- dense BI-grade dashboards
- too many charts
- finance as a full accounting product
- deep calendar system
- HR platform behavior

If simple placeholders or cards appear in the frontend design, they should not automatically force backend complexity unless they are part of the written MVP contract.

---

## 6. Mandatory cross-feature capabilities

These are not separate top-level pages, but they are mandatory for the MVP to actually be correct.

## 6.1 Communication ingestion
The product must ingest project communication so that the Product Brain can evolve from real discussion, not only from uploaded docs.

### MVP requirement
The system architecture must be provider-agnostic and designed for:
- Slack
- Gmail
- WhatsApp Business

### Implementation priority
For the MVP deadline, the required delivery rule is:

- **Slack + Gmail must be first-class and usable**
- **WhatsApp Business must be designed into the data model and connector layer**
- WhatsApp Business live ingestion may ship behind a readiness gate if Meta verification / credentials block implementation

This is an engineering reality decision, not a product retreat.

### Why it is still part of MVP
Even if WhatsApp Business is phased operationally, the MVP must still support:
- communication-linked change records,
- source-platform tracking,
- and per-message provenance.

---

## 6.2 Communication-driven change detection
The system must be able to detect that a message or thread contains:
- a clarification,
- a decision,
- a requirement change,
- a contradiction,
- or a blocker/risk signal.

---

## 6.3 Approved change flow
Communication-derived change candidates must be:
- reviewable,
- approvable/rejectable,
- linkable to exact messages,
- linkable to exact doc sections / brain nodes,
- and applicable to the current Product Brain.

This is non-negotiable.

---

## 6.4 Living spec layer
The current PRD/SRS truth must be represented as:

```text
original uploaded document
+ accepted structured updates from communication
= current accepted product truth
```

This is a core MVP behavior, not a future idea.

---

## 6.5 Exact provenance
Every accepted change must carry:
- source platform,
- thread/message id,
- human-readable source reference,
- affected document section(s),
- affected brain node(s),
- approval metadata.

---

## 6.6 Role-based views
The MVP must differentiate user experiences for:
- manager role
- dev role
- client role

---

## 7. Actor scope

## 7.1 Manager role (PM / CEO / CTO / Manager)
Manager role is the full-control role in MVP.

### Manager can
- create/update projects
- upload docs
- connect connectors
- rebuild Product Brain
- review/approve/reject changes
- use Socrates everywhere
- view general + project dashboards
- manage project members
- manage client sharing / preview configuration

---

## 7.2 Dev role
Dev role should be **almost feature-complete on read**, but limited on control.

### Dev must be able to
- access assigned projects
- use Socrates
- view Product Brain
- use Live Doc Viewer
- inspect linked changes and decisions
- view project dashboard
- see accepted current truth

### Dev should be allowed to
- upload internal technical notes or clarifications if the project owner allows it
- flag a thread/section as needing clarification

### Dev must not be able to
- approve or reject client-originated spec changes
- manage org-wide settings
- manage connectors for the organization
- manage other users
- publish client views
- silently rewrite accepted current truth

This resolves the “almost similar number of features as the PM” note from the design doc:  
**yes on visibility, no on authority**.

---

## 7.3 Client role

### MVP baseline
Client gets a simplified read-only project view.

### Client must be able to
- view selected project summary
- view the current shared understanding
- view the project flow / brain graph
- view explicitly shared docs or sections
- see live preview if a preview URL has been configured
- otherwise see flowchart/brain fallback

### Client must not be able to
- view internal-only docs
- view internal-only comments
- view internal-only change proposals
- view unapproved decisions
- manage connectors
- change the accepted truth directly

### Live preview rule
If a `preview_url` exists and is shared, the client view should surface it.
If it does not, the default client artifact is the read-only Product Brain / flowchart view.

That is the MVP client interpretation of “Live preview if possible (else flowchart view).”

---

## 8. End-to-end MVP journeys

## 8.1 Manager kickoff journey
1. Create project
2. Upload PRD/SRS and related docs
3. Wait for doc processing
4. View Product Brain and graph
5. Ask Socrates questions
6. Open cited docs in Live Doc Viewer

## 8.2 Manager change-review journey
1. New message arrives from Slack/Gmail/WhatsApp
2. System creates a change candidate
3. Manager reviews the candidate
4. Accepts or rejects it
5. If accepted, Orchestra updates the current Product Brain
6. Affected doc sections show change markers linked to the source message

## 8.3 Developer clarification journey
1. Dev opens assigned project dashboard
2. Opens Brain or Doc Viewer
3. Uses Socrates to ask where something came from or what changed
4. Opens exact cited doc/message evidence
5. Works from the current accepted truth instead of raw chat history

## 8.4 Client visibility journey
1. Client opens project view
2. Sees live preview if configured, else flowchart/current truth
3. Can read the simplified current product understanding
4. Can inspect selected shared docs or highlighted references if permitted

---

## 9. Out of scope for this MVP

These should stay out unless the product definition changes again.

- prototype generation
- prototype approval workflow
- Jira/Linear board sync
- execution planning / task planning
- delivery control tower
- full PM/task management
- developer surveillance
- VS Code extension
- full CRM/shared inbox suite
- full finance module
- full calendar/meeting system
- codebase-aware coding agents

If these are reintroduced later, they must come through an explicit scope change, not by quiet creep.

---

## 10. Non-functional requirements for MVP

The MVP must also satisfy these baseline quality bars.

### 10.1 Performance
- upload acknowledgement should be immediate
- doc processing should be asynchronous
- viewer payloads should open fast enough for normal docs
- Socrates responses should start streaming quickly
- dashboard reads should be snapshot-backed, not heavy live aggregation

### 10.2 Security
- project and org scoping required
- role-based access control required
- public client view must be tokenized or role-gated
- connectors and tokens must not be stored unsafely
- raw docs must not be exposed across project boundaries

### 10.3 Reliability
- document processing jobs must be retryable
- connector sync must be retryable
- accepted truth versions must be immutable
- change acceptance must be idempotent

### 10.4 Observability
- job status visible
- doc processing status visible
- connector sync status visible
- Socrates errors/logging visible
- audit trail for accepted changes visible

---

## 11. Definition of done

The MVP is done when all of the following are true:

### Product Brain
- docs can be uploaded
- they process successfully
- the user can see a structured current Product Brain
- a graph / project map exists

### Socrates
- Socrates is persistent
- page context affects suggestions
- answers contain citations
- answers can open exact targets on the right

### Live Doc Viewer
- documents open
- citations highlight the right place
- change markers appear on affected sections
- linked message evidence is navigable

### Dashboard
- general dashboard exists
- project dashboard exists
- team headcount and breakdown exist in both scopes
- the UI stays minimal

### Change-linked current truth
- a communication-driven change can be detected,
- reviewed,
- accepted,
- linked to exact source message(s),
- and reflected in the current accepted Product Brain.

If that last point does not work, the MVP is not actually correct.

---

## 12. Final MVP statement

**The Orchestra MVP is a minimal, AI-centric system with four user-facing surfaces — Product Brain, Socrates, Live Doc Viewer, and Dashboard — backed by communication-aware change tracking so the current PRD/SRS truth can evolve visibly and traceably from real project communication.**
