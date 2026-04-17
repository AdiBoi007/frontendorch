# Orchestra Pages and Context Contract

## 1. Purpose

This document defines the **frontend/backend context contract** for the current Orchestra UI.

It exists because the product is explicitly designed around:
- a minimal shell
- Socrates on the left
- the main content surface on the right
- page-aware AI behavior
- click-to-source navigation

Page context is therefore not optional metadata. It is a core part of how the product behaves.

This file defines:
- canonical page contexts
- route assumptions
- selected object context
- suggestion behavior
- expected main-surface data
- open-target behavior
- frontend events that the backend must understand

---

## 2. Shell contract

The backend should assume a shell like:

```text
[collapsed hover nav] [Socrates panel] [main content panel]
```

### Product consequences
- Socrates is present on most pages
- page context changes matter immediately
- selected object context matters immediately
- Socrates answers must be able to open something on the main panel
- the main panel may change without destroying the Socrates session

---

## 3. Canonical routes (current assumptions)

Until the frontend repo is scanned, the backend should assume these top-level routes:

- `/dashboard`
- `/projects/:projectId/dashboard`
- `/projects/:projectId/brain`
- `/projects/:projectId/docs/:documentId`
- `/client/:token`

Socrates is **not** a standalone page.
It is a persistent left-side surface.

---

## 4. Canonical page contexts

Use these enum values in the backend:

- `dashboard_general`
- `dashboard_project`
- `brain_overview`
- `brain_graph`
- `doc_viewer`
- `client_view`

Optional future contexts:
- `change_detail`
- `decision_detail`
- `brain_node_detail`

The frontend may have more route-level detail later, but backend behavior should collapse into these canonical contexts.

---

## 5. Context object

Every Socrates session should be able to carry a context object like:

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
    "anchorId": "reporting_requirements"
  }
}
```

## 5.1 Fields

### `projectId`
Current active project.
Nullable only on org-wide/general dashboard if the session is intentionally org-scoped.

### `pageContext`
One of the canonical page enums.

### `selectedRef`
Current selected object, if any.

Allowed types:
- `document`
- `document_section`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_scope`

### `viewerState`
Optional state used especially on the Doc Viewer.

Recommended fields:
- `documentId`
- `documentVersionId`
- `pageNumber`
- `anchorId`
- `scrollHint` optional

---

## 6. Page definitions

## 6.1 dashboard_general

### Purpose
Org-wide awareness surface.

### Main surface should show
- active projects
- org headcount
- role breakdown
- project/member distribution
- top projects needing attention
- recent change/decision pressure

### Socrates should know
- current org scope
- optionally selected dashboard card/project
- latest general dashboard snapshot id

### Retrieval priority
Prefer:
1. general dashboard snapshot
2. recent accepted project changes
3. current Product Brain summaries per project
4. team/member data

### Suggestion examples
- Which projects changed most this week?
- Which teams need attention?
- Summarize org-wide pressure.

### Open-target examples
- open specific project dashboard
- apply dashboard filter
- open project brain

---

## 6.2 dashboard_project

### Purpose
Project-level awareness surface.

### Main surface should show
- project summary
- project members
- project headcount and role breakdown
- minimal allocation/workload indicators
- document readiness / processing state
- latest brain freshness
- unresolved change/decision pressure

### Socrates should know
- exact project id
- selected dashboard card if any
- latest project dashboard snapshot id

### Retrieval priority
Prefer:
1. project dashboard snapshot
2. latest product brain artifact
3. accepted changes and decisions
4. team/member data

### Suggestion examples
- What changed recently in this project?
- What should engineering focus on now?
- Summarize current project truth.

### Open-target examples
- open brain overview
- open doc viewer for critical PRD
- open change proposal needing review

---

## 6.3 brain_overview

### Purpose
High-level current product truth surface.

### Main surface should show
- current product summary
- key flows/modules
- constraints/integrations
- unresolved areas
- accepted changes and decisions summary
- version history summary

### Socrates should know
- project id
- current brain artifact version id
- optionally selected top-level brain card/module

### Retrieval priority
Prefer:
1. current product brain artifact
2. clarified brief
3. accepted change proposals
4. decisions
5. linked source sections

### Suggestion examples
- Explain the main flows.
- Which areas are still uncertain?
- Show recent accepted changes.

### Open-target examples
- open brain graph
- open linked document section
- open linked decision record

---

## 6.4 brain_graph

### Purpose
Structural map of flows/modules/dependencies.

### Main surface should show
- nodes
- edges
- categories
- changed/unresolved markers
- source-connected areas

### Socrates should know
- project id
- current graph artifact version id
- selected node if any

### Retrieval priority
Prefer:
1. selected node
2. directly connected nodes
3. accepted changes affecting selected node
4. linked document sections
5. decisions affecting that area

### Suggestion examples
- What does this node depend on?
- Which source docs support this area?
- Which recent changes affect this module?

### Open-target examples
- open node detail
- open linked doc section
- open linked source message

---

## 6.5 doc_viewer

### Purpose
Evidence-first reading and verification surface.

### Main surface should show
- parsed document content
- ordered sections
- anchors / page refs
- citation highlights
- change markers
- message/source linkage for affected sections

### Socrates should know
- document id
- document version id
- selected section or anchor
- page number when relevant

### Retrieval priority
Prefer:
1. selected document section
2. nearby sections in same heading path
3. linked accepted changes
4. linked messages
5. current brain interpretation of that area

### Suggestion examples
- When was this feature first mentioned?
- Show accepted changes affecting this section.
- Summarize this module for engineering.

### Open-target examples
- open another section in same document
- open linked message thread
- open change proposal
- open brain node for this section

### Special rule
If the user clicks text in the doc, the backend should support returning:
- the exact section/anchor
- supporting brain node links
- accepted change markers
- linked message evidence

This is the core “Mannan feature.”

---

## 6.6 client_view

### Purpose
Filtered read-only client experience.

### Main surface should show
- project summary
- shared current truth
- shared docs/sections
- preview URL if configured
- flowchart/brain fallback if preview URL absent

### Socrates should know
- client-safe project scope
- client-safe selected item only
- no internal-only refs

### Retrieval priority
Prefer:
1. client-safe current Product Brain
2. shared docs/sections
3. preview metadata
4. client-safe accepted changes

### Suggestion examples
- Summarize current shared scope.
- What changed recently?
- What should the client know next?

### Open-target examples
- open shared doc section
- open client-safe brain view
- open preview

### Critical rule
No internal-only source, change, or decision refs may be returned in this context.

---

## 7. Selected-object context

Selected-object context is how the frontend tells the backend what the user is focused on.

## 7.1 Allowed selected-ref types
- `document`
- `document_section`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_scope`

## 7.2 Selected-ref payload examples

### Document section
```json
{
  "type": "document_section",
  "id": "sec_123"
}
```

### Brain node
```json
{
  "type": "brain_node",
  "id": "node_456"
}
```

### Change proposal
```json
{
  "type": "change_proposal",
  "id": "chg_789"
}
```

## 7.3 Why selected-ref matters
It changes:
- retrieval weighting
- suggestion generation
- answer framing
- open-target defaults

---

## 8. Frontend events the backend must understand

## 8.1 Session created
Triggered when the page shell initializes Socrates for a project.

### Backend effect
- create session
- persist page context
- optionally precompute suggestions

---

## 8.2 Page context changed
Triggered when the user navigates between top-level pages.

### Backend effect
- update session context
- invalidate stale suggestions
- optionally trigger suggestion precompute job

---

## 8.3 Selected object changed
Triggered when user selects a node, section, change, or decision.

### Backend effect
- update `selectedRef`
- update viewer state if relevant
- refresh suggestions

---

## 8.4 Socrates answer requested
Triggered when user submits prompt.

### Backend effect
- load session + context
- retrieve evidence using current context
- stream answer
- persist citations/open-targets

---

## 8.5 Open target requested
Triggered when user clicks a citation/open-target returned by Socrates.

### Backend effect
- validate visibility
- return normalized target payload if needed

---

## 8.6 Doc text clicked
Triggered when user clicks a statement/paragraph/section in the Live Doc Viewer.

### Backend effect
- update selected ref to that section
- enable source/provenance query behavior
- optionally request contextual suggestions

---

## 9. Suggestion generation rules by page

Suggestion generation is not generic autocomplete.

It should depend on:
- page context
- selected object
- latest brain/change freshness
- recent unanswered open questions where relevant

### Suggestion quality rules
- max 3–5 suggestions visible at once
- short plain-English phrasing
- avoid duplicates
- avoid irrelevant prompts for the current page
- suggestions must be useful immediately from the user’s current context

---

## 10. Open-target contract

Every Socrates answer may include open-targets.

## 10.1 Allowed target types
- `document_section`
- `message`
- `thread`
- `brain_node`
- `change_proposal`
- `decision_record`
- `dashboard_filter`

## 10.2 Open-target payload shape

```json
{
  "targetType": "document_section",
  "targetRef": {
    "documentId": "uuid",
    "documentVersionId": "uuid",
    "anchorId": "reporting_requirements",
    "pageNumber": 6
  }
}
```

## 10.3 Validation rule
The backend must validate target existence and visibility before the frontend uses it.

---

## 11. Page-specific data dependencies

## 11.1 dashboard_general requires
- org-wide dashboard snapshot
- project list
- headcount summary

## 11.2 dashboard_project requires
- project dashboard snapshot
- team summary
- recent change/decision summary

## 11.3 brain_overview requires
- current product brain artifact
- accepted change summaries
- decision summaries

## 11.4 brain_graph requires
- current graph payload
- graph-linked source references
- changed/unresolved markers

## 11.5 doc_viewer requires
- parsed document sections
- exact anchor navigation
- change markers
- linked messages/decisions

## 11.6 client_view requires
- filtered client-safe read model
- preview configuration
- shared docs/brain subset

---

## 12. Final context rule

If the backend treats page context as an afterthought, Socrates will feel generic.

If the backend treats page context as a first-class input, the product will feel intelligent, minimal, and trustworthy.
