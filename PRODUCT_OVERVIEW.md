# Orchestra Product Overview

## 1. Product definition

Orchestra is a **PRD-aware communication and understanding platform** for software solution companies, devhouses, MVP studios, and similar client-facing software teams.

Its job is to bring together:

- the PRD / SRS,
- supporting project documents,
- internal and external communication,
- structured product understanding,
- and a page-aware AI copilot,

into one system that answers four questions better than Slack, Gmail, WhatsApp, docs, and human memory ever can:

1. **What are we actually building?**
2. **What did the client actually ask for?**
3. **What changed, and is that change accepted yet?**
4. **What should this specific person know right now?**

This is the new Orchestra.  
It is **not** the old prototype/board-sync/control-tower-first product.

---

## 2. The market problem

Client-facing software teams almost always operate through fragmentation.

Typical reality:
- the PRD or SRS sits in one place,
- reference docs are somewhere else,
- the client sends requests by email,
- urgent changes arrive on WhatsApp,
- internal discussions happen in Slack,
- engineers only see fragments,
- PMs and founders keep translating between all of those surfaces,
- and later nobody is fully sure what the current truth is.

This creates:
- spec drift,
- miscommunication,
- repeated explanation work,
- hidden change requests,
- lost approvals,
- stale assumptions,
- unclear handoffs,
- and too much dependency on one person remembering context.

The core Orchestra thesis is:

> **client communication becomes useful only when it is interpreted in the context of the product itself.**

That means the product is not “the inbox”.  
The product is the **project brain**.

---

## 3. The wedge

The best wedge for Orchestra is:

- software solution companies,
- devhouses,
- MVP studios,
- software agencies,
- small to medium tech businesses that deliver products for external clients.

These teams feel the pain more sharply than internal-only product teams because every project has:
- a client,
- an internal team,
- changing expectations,
- and constant translation pressure.

The first buyer is usually:
- PM / delivery manager,
- founder / CEO of the devhouse,
- CTO / engineering lead.

Engineers benefit strongly, but they are usually not the first buyer.

---

## 4. The current product surfaces

The current product is intentionally built around **four user-facing surfaces**.

## 4.1 Dashboard

The Dashboard is the top-level operating view.

It exists in two modes:
- **General dashboard** (org-wide)
- **Project dashboard** (one project)

### General dashboard responsibilities
- show all active projects in a simple list/card view
- show team headcount
- show role distribution
- show project membership distribution
- show a minimal workload / pressure view
- show project brain freshness / change pressure
- show projects that need attention

### Project dashboard responsibilities
- show project summary
- show project members and team composition
- show role breakdown for that project
- show recent change / decision pressure
- show document processing / source readiness
- show whether the current product truth is stable or moving
- act as the launch point into Brain and Doc Viewer

### Product rule
The dashboard must stay **minimal**.
It should avoid:
- heavy chart spam,
- too many cards,
- dense small text,
- unnecessary analytics just because data exists.

The dashboard is a navigation and awareness surface, not a “look how many graphs we can render” surface.

---

## 4.2 Product Brain

The Product Brain is the core product surface.

This is where Orchestra turns uploaded documents and accepted change records into one current, structured product truth.

### Product Brain responsibilities
- ingest PRD / SRS and supporting docs
- build a source-backed project understanding
- extract structured product logic
- represent flows, modules, constraints, integrations, and assumptions
- maintain a Workflow DAG / Project Map
- reflect accepted communication-driven changes
- maintain a versioned “current truth”
- let the team understand how everything connects

### What the Product Brain is made of
Internally, the Product Brain should be built from:
- **Source Package**
- **Clarified Brief**
- **Workflow DAG / Project Map**
- **accepted change records**
- **accepted decision records**

The frontend does not have to expose all of those as separate pages.  
But the backend and system model should treat them as distinct steps.

### The visual idea
The design doc’s “brain” sketches show the right mental direction:
- the brain is a connected representation,
- it can relate docs, comms, recordings, and product structure,
- and it helps the user understand the project as a system rather than as a pile of files.

The exact graph rendering can evolve, but the product meaning should stay stable.

---

## 4.3 Socrates

Socrates is the persistent AI copilot.

It lives on the **left side** of the product and is always aware of:
- which page the user is on,
- which project the user is in,
- which document / brain node / section / message is selected,
- what the current accepted product truth is.

### What Socrates must do
Socrates must:
- answer product questions
- answer source/provenance questions
- explain the current truth
- explain how it changed
- suggest context-aware prompts per page
- open exact references on the right side
- cite the exact source docs, sections, and messages it used

### Example queries Socrates must handle
- “When was this feature first mentioned?”
- “Show me the exact Slack or email message that changed this requirement.”
- “Why does the current brain say manager approval is required?”
- “Which document sections support this feature?”
- “Summarize what changed about the reporting flow.”
- “Explain the dashboard metrics for this project.”
- “Give me the current engineer-ready explanation of this module.”

### Product rule
Socrates must be:
- grounded,
- citation-first,
- page-aware,
- and never vaguely persuasive without evidence.

It should feel like a reliable research and product copilot, not a generic chat bot.

---

## 4.4 Live Doc Viewer

The Live Doc Viewer is the right-side document and evidence surface.

It exists so users can actually verify what Socrates says and inspect the raw project material with context.

### Live Doc Viewer responsibilities
- show uploaded docs in a readable way
- support exact page / section / chunk navigation
- highlight cited text from Socrates
- let users click a statement and see where it came from
- show accepted change markers on affected PRD/SRS sections
- show which message thread introduced or modified a requirement
- let users jump from message → doc section and doc section → linked message

### Product rule
The Doc Viewer is not just a file previewer.
It is the **evidence surface** of the system.

That means the backend must support:
- anchors,
- citations,
- source references,
- and explicit section/message linking.

---

## 5. The hidden but critical product capabilities

The four visible surfaces only work because Orchestra has deeper system capabilities.

These are not “extra nice-to-haves.” They are part of the real product.

## 5.1 Upload, parsing, and indexing
Orchestra must:
- accept PRD/SRS and supporting docs
- parse them
- structure them
- section them
- chunk/index them
- make them retrievable and navigable

## 5.2 Clarified product understanding
Orchestra must not rely on raw docs only.
It should create a structured, cleaner internal truth from those docs.

## 5.3 Workflow DAG / Project Map
Orchestra must represent the project structurally:
- flows,
- modules,
- dependencies,
- rules,
- integrations,
- unresolved areas.

## 5.4 Communication ingestion
Orchestra must ingest communication from external platforms and normalize it into project memory.

Primary target platforms:
- Slack
- Gmail
- WhatsApp Business

The system should be provider-agnostic even if connector rollout is phased.

## 5.5 AI communication intelligence
Messages must be classified as:
- clarification,
- decision,
- change,
- contradiction,
- blocker,
- action-needed,
- or informational context.

And they must be mapped back to:
- doc sections,
- brain nodes,
- flows,
- or product areas.

## 5.6 Living spec update engine
This is a core product truth.

The original PRD/SRS must remain immutable.  
But the current accepted understanding must evolve.

So accepted communication-driven changes should:
- create a change record,
- stay linked to source messages,
- stay linked to affected doc sections and brain nodes,
- update the current Product Brain / current spec view,
- and visibly mark affected sections in the Doc Viewer.

This is one of the most important parts of the whole product.

## 5.7 Decision and change memory
The system must maintain:
- decision log
- change log
- source links
- approval state
- acceptance history

## 5.8 Role-based output generation
The same truth should be translated differently for:
- PMs
- CTOs / engineering leads
- founders / CEOs
- developers
- clients

---

## 6. The living PRD / SRS model

This deserves its own section because it is central to the product.

### The wrong model
The wrong model is:
- upload a PRD once,
- leave it static forever,
- treat later communication as separate noise,
- and force humans to manually reconcile the difference.

### The right model
The right model is:

1. upload the original PRD/SRS and supporting docs  
2. parse and structure them  
3. generate the first Product Brain  
4. ingest communication over time  
5. detect candidate changes / decisions  
6. review and accept/reject them  
7. create a new accepted current truth  
8. keep all accepted changes visibly linked to their source messages  
9. keep the original documents immutable  
10. show overlays/markers where the current accepted truth differs from or extends the original doc

### Why this matters
This is how Orchestra becomes a source-of-truth product instead of a summary product.

It means users can answer:
- what the original document said,
- what later changed,
- why it changed,
- who requested it,
- whether it was accepted,
- and what the current truth now is.

That is real value.

---

## 7. Actor-specific value

## 7.1 PM / Delivery Manager
They get:
- one place to understand the project,
- one place to inspect source evidence,
- one place to review changes,
- one place to generate engineer/client summaries,
- much less repeated translation work.

## 7.2 CTO / Engineering Lead
They get:
- clearer interpretation of requirements,
- less confusion about current scope,
- a structured graph of the product,
- direct visibility into why something changed,
- and better engineer-facing handoff quality.

## 7.3 Founder / CEO / Studio Owner
They get:
- less client chaos,
- a stable current truth,
- easier visibility into project status,
- and less dependence on one PM “just knowing what’s going on.”

## 7.4 Developer
They get:
- better access to what the client actually wants,
- less raw communication noise,
- more context-rich doc navigation,
- and faster answers to “where did this come from?”

## 7.5 Client
They get:
- clearer read-only project understanding,
- live preview URL if one exists,
- otherwise a structured brain / flowchart fallback,
- and a system that makes the team look more aligned and professional.

---

## 8. The frontend shell model

The product shell should follow this model:

```text
[Minimal hover nav] [Socrates panel] [Main working surface]
```

Main working surfaces:
- general dashboard
- project dashboard
- product brain
- live doc viewer
- client project view

Socrates should not feel bolted on.
It is part of the primary navigation and working model.

---

## 9. What Orchestra is not

To keep the product sharp, Orchestra should **not** currently be positioned as:

- a generic shared inbox,
- a general CRM,
- a task management tool,
- a Jira replacement,
- a prototype generator,
- a developer surveillance tool,
- a full org operating system.

The product is:

> **the PRD-aware system of record for client software delivery understanding and communication.**

---

## 10. Why this can become must-have

Orchestra becomes must-have if teams start using it:
- before replying to the client,
- before handing something to engineering,
- before summarizing status,
- before approving a scope change,
- and before asking “what is the current truth?”

If it becomes the fastest trustworthy place to answer those questions, it becomes part of the daily operating loop.

That is the bar.

---

## 11. One-line positioning

**Orchestra is the AI-centric product brain for client-facing software teams — turning documents, communication, and accepted changes into one current, navigable, traceable product truth.**
