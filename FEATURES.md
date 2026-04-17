# Orchestra Detailed Feature Breakdown

This document breaks Orchestra down feature by feature, with the current product definition as the source of truth.

The product should be understood in two layers:

1. **customer-visible surfaces**  
2. **supporting system capabilities** that make those surfaces correct

The visible product is intentionally small and minimal.  
The backend capabilities under it are what make it trustworthy.

---

# 1. Customer-visible feature set

## 1.1 Product Brain

The Product Brain is the central product feature.

It is not just “upload docs.”  
It is the system that turns source material into the current accepted truth of the project.

### Product Brain includes
- document upload
- document parsing and indexing
- structured source package generation
- clarified product understanding
- current product truth generation
- workflow graph / project map
- versioning of the current truth
- accepted change integration
- unresolved area visibility

### User-facing outcomes
A user should be able to open the Brain and understand:
- what the product is,
- who it is for,
- the main flows,
- the main modules,
- constraints,
- integrations,
- unresolved areas,
- and what recently changed.

### Core sub-capabilities

#### A. Source Package generation
Turns messy project inputs into:
- summary
- users / actors
- features
- constraints
- integrations
- contradictions
- unknowns
- risks
- source confidence

#### B. Clarified product understanding
Turns the raw source package into a cleaner internal truth by:
- merging overlapping ideas,
- clarifying structure,
- preserving uncertainty instead of guessing,
- establishing the base truth for later change handling.

#### C. Workflow DAG / Project Map
Represents:
- flows
- modules
- dependencies
- critical paths
- risky areas
- unresolved nodes
- supporting source domains

#### D. Current truth versioning
The Product Brain should always have a **current accepted version**.
If accepted changes arrive later, a newer version is created.

#### E. Change-linked Brain updates
Accepted communication-driven changes must update the current brain version and stay linked to:
- the exact message(s)
- the exact source sections
- the exact affected brain node(s)

### Why Product Brain matters
Without the Brain, Orchestra becomes:
- a document store,
- a shared inbox,
- or a chat assistant.

The Brain is what makes it a product-understanding system.

---

## 1.2 Socrates

Socrates is the persistent AI assistant.

### Socrates includes
- page-aware context
- project-aware memory
- selected-object awareness
- streaming responses
- contextual prompt suggestions
- citations
- open-target actions
- answer history

### Core sub-capabilities

#### A. Page context awareness
Socrates must know what page the user is on:
- general dashboard
- project dashboard
- brain
- doc viewer
- client view

This context changes:
- suggestions
- retrieval priority
- phrasing style
- answer focus

#### B. Selected object awareness
If the user has selected:
- a document,
- a section,
- a brain node,
- a change record,
- or a project,

Socrates should treat that as a first-class signal.

#### C. Suggested prompts
Under the input, Socrates should show 3–5 page-aware prompts.

Examples:

**Dashboard**
- Which projects need attention?
- What changed most this week?
- Which teams are overloaded?

**Brain**
- Explain the core flows.
- Which areas are still uncertain?
- Show me the modules affected by recent changes.

**Doc Viewer**
- When was this feature first mentioned?
- Show me all accepted changes affecting this section.
- Which messages changed this requirement?

#### D. Retrieval and citations
Socrates must answer using:
- the current Product Brain
- document sections/chunks
- communication messages/threads
- decision records
- change records

It must produce:
- answer
- citations
- optional follow-up prompts
- open target actions

#### E. Open-target behavior
The backend response must allow the frontend to open:
- a document at a specific page/anchor
- a message thread
- a change record
- a brain node
- a dashboard filter

### Why Socrates matters
Socrates is what makes the product feel AI-centric.  
But its real value is not “chat.”  
Its value is **contextual, grounded, navigable understanding**.

---

## 1.3 Live Doc Viewer

The Live Doc Viewer is the evidence surface.

### Live Doc Viewer includes
- document list
- document metadata
- parsed content
- page/section/anchor navigation
- citation highlighting
- section search
- change markers
- source-message link display
- click-to-source explanation

### Core sub-capabilities

#### A. Parsed document view
The viewer should show documents in a parsed, interactive form rather than only as raw file downloads.

#### B. Exact anchor support
The backend must support exact references like:
- document id
- version id
- page number
- section id
- anchor id
- chunk id

#### C. Socrates citation rendering
When Socrates cites a section, the viewer should:
- open to the right location
- highlight it
- show the context cleanly

#### D. Change overlays
The viewer should mark sections that have accepted changes affecting them.

Each marker should link to:
- the accepted change record
- the original message/thread
- and optionally the updated current-brain interpretation

#### E. “Mannan feature”
Clicking text in the doc should expose:
- where it came from,
- supporting context,
- related source evidence,
- and related communication updates if they exist.

### Why the Doc Viewer matters
Without the viewer, users have to trust summaries blindly.
The viewer is what lets the product prove itself.

---

## 1.4 Dashboard

The dashboard is the awareness and operating surface.

It exists in:
- general scope
- project scope

### Dashboard includes
- project listing
- team headcount
- team role breakdown
- project team breakdown
- workload / pressure visibility
- recent changes / decisions summary
- document/brain freshness signals
- quick navigation into product surfaces

### General dashboard sub-capabilities
- active project list
- org headcount
- org role mix
- project count
- project member distribution
- who is overloaded / overallocated
- which projects are moving fast / slowly
- brain freshness / unresolved-change pressure

### Project dashboard sub-capabilities
- project summary
- project members
- role breakdown for the project
- allocation / workload view
- latest accepted brain version info
- pending or recent change summary
- document processing state
- quick launch into Brain and Docs

### Why the Dashboard matters
The dashboard should help a manager or devhouse founder answer:
- what projects exist,
- how people are allocated,
- which projects are changing,
- and where to go next.

It should do this with **minimal visual load**.

---

# 2. Critical supporting capabilities

These are not always top-level UI pages, but they are part of the real product.

## 2.1 Communication Ingestion

Orchestra must ingest communication from:
- Slack
- Gmail
- WhatsApp Business

### Required behavior
- normalize messages and threads into a project-aware model
- preserve platform metadata
- preserve participants and timestamps
- make communication retrievable by project
- support provider-agnostic extension

### MVP priority
- Slack and Gmail first-class
- WhatsApp Business architected in the system and added when operationally possible

---

## 2.2 AI Communication Intelligence

Messages must be analyzed against:
- uploaded docs
- current Product Brain
- Workflow DAG
- existing decisions and changes

### Required classifications
- clarification needed
- decision made
- scope / requirement change
- contradiction
- blocker / risk
- action needed
- informational context

### Required mappings
A message insight should be linkable to:
- a document section
- a brain node
- a flow
- a module
- a requirement area
- a decision
- a change record

### Why this matters
This is the layer that turns raw communication into product understanding.

---

## 2.3 Decision Ledger

Every real decision should become a structured record.

### A decision record must include
- title / summary
- statement
- source platform
- source thread/message
- project
- affected area
- status (open, accepted, rejected, superseded)
- created/accepted metadata
- evidence links

### Why it matters
This removes “I think we already agreed to that” from the team’s operating model.

---

## 2.4 Change Ledger

Every meaningful requirement change should become a structured record.

### A change record must include
- what changed
- old understanding
- new understanding
- requester/source
- source message(s)
- affected document section(s)
- affected brain node(s)
- approval state
- accepted version linkage

### Why it matters
This is how Orchestra becomes a living source of truth instead of a static doc tool.

---

## 2.5 Living Spec Update Engine

This is one of the deepest product capabilities.

### Required behavior
- original docs stay immutable
- accepted changes create new current-brain / current-spec versions
- doc viewer shows markers on affected areas
- change records stay linked to messages
- Socrates answers from the latest accepted truth, not only the original raw doc

### Why it matters
This is what makes “the PRD/SRS is updated with communication updates” actually true without corrupting source evidence.

---

## 2.6 Searchable Project Memory

The system should be able to answer:
- when something was first mentioned
- what changed after that
- whether it is accepted
- what the current truth is
- where the exact supporting evidence is

### Search must work across
- documents
- document sections
- messages
- change records
- decision records
- brain nodes
- Socrates conversation history if needed

---

## 2.7 Role-based access and output shaping

The same project truth should be presented differently to:
- managers
- devs
- clients

### Manager experience
- full product surfaces
- full project control
- approval authority

### Dev experience
- almost full read access within assigned projects
- no approval authority over client-originated truth

### Client experience
- simplified read-only selected view
- shared docs only
- live preview if configured, else flowchart/current brain

---

# 3. Feature interactions

The most important thing to understand is that Orchestra’s features are not separate.

They interact like this:

```text
Docs upload
→ Product Brain generated
→ Workflow graph built
→ Communication arrives
→ Message is classified
→ Change candidate created
→ Manager accepts change
→ Current brain version updates
→ Doc Viewer shows marker
→ Socrates answers from updated truth
→ Dashboard shows updated change pressure
```

That is the real product loop.

---

# 4. Frontend-visible modules vs backend-only modules

## Frontend-visible modules
- Dashboard
- Product Brain
- Live Doc Viewer
- Socrates
- Client read-only project view

## Backend-heavy modules
- doc ingestion and parsing
- indexing / retrieval
- communication connectors
- message intelligence
- decision ledger
- change ledger
- living spec updater
- snapshot computation
- realtime events

This distinction matters because the user sees four clean product surfaces, but the backend needs significantly more machinery to make them reliable.

---

# 5. Features explicitly out of scope

To keep Orchestra sharp, these stay out:

- prototype generation
- scope approval workflow as a top-level user feature
- task planning
- Jira/Linear board sync
- delivery control tower
- VS Code extension
- dev surveillance
- CRM / ticketing sprawl
- finance suite
- calendar suite
- autonomous agent orchestration
- codebase-aware per-dev execution agents

---

# 6. Final feature summary

## The user-facing product is:
1. Product Brain  
2. Socrates  
3. Live Doc Viewer  
4. Dashboard  

## The backend-critical support system is:
5. Communication ingestion  
6. AI communication intelligence  
7. Decision ledger  
8. Change ledger  
9. Living spec update engine  
10. Searchable project memory  
11. Role-based access and outputs  

---

# 7. Final one-line feature definition

**Orchestra is a minimal, AI-centric workspace where documents, communication, accepted changes, and page-aware AI come together to create one current, traceable product truth.**
