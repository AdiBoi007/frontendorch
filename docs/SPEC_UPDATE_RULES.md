# Orchestra Living Spec Update Rules

## 1. Purpose

This document defines the **exact rules by which Orchestra updates the current product truth**.

This is one of the most important documents in the entire repo.

The product’s core claim is not only that it stores PRDs, messages, and summaries.
Its core claim is that it maintains a **living, traceable current truth** of the product while preserving original source evidence.

This document tells the backend exactly how to do that.

---

## 2. The core truth model

Orchestra must distinguish between:

1. **original source evidence**
2. **derived current accepted understanding**

### Original source evidence includes
- uploaded PRD/SRS files
- uploaded supporting documents
- parsed document sections/chunks
- communication threads/messages
- original provider metadata

### Derived current accepted understanding includes
- Source Package
- Clarified Brief
- Workflow DAG / graph
- accepted decisions
- accepted change records
- current Product Brain version

The original sources are immutable.
The derived understanding evolves by version.

---

## 3. Absolute rules

## 3.1 Never rewrite the original PRD/SRS bytes
If a message changes a requirement, do **not** overwrite the stored original file.

### Instead
- preserve the original file/version
- create a structured proposal or decision record
- review it
- if accepted, create a new current-truth artifact version
- mark the affected document section visually in the Doc Viewer

---

## 3.2 No silent truth changes
Nothing should become part of the current accepted truth unless it is accepted by an authorized manager role.

Detected changes can exist in:
- `detected`
- `needs_review`
- `accepted`
- `rejected`
- `superseded`

Only `accepted` updates the living truth.

---

## 3.3 Every accepted change must remain linked forever
Every accepted change must keep durable links to:
- source platform
- source connector id
- source thread id
- source message id(s)
- affected document section id(s)
- affected brain node id(s)
- previous understanding
- new understanding
- who accepted it
- when it was accepted

If any of those links are missing, the change application is incomplete.

---

## 3.4 Current truth is versioned
Applying an accepted change must create a new current-truth version.

Do not patch the accepted current truth in place.

---

## 4. Terminology

## 4.1 Source evidence
Immutable raw material.

## 4.2 Message insight
A machine-derived classification of a message, such as:
- clarification
- decision
- change
- contradiction
- blocker
- info

Message insight is **not yet authoritative truth**.

## 4.3 Change proposal
A structured candidate update to the current truth, derived from communication or manual review.

## 4.4 Decision record
A structured accepted/rejected decision with provenance.

## 4.5 Current truth version
The latest accepted Product Brain / derived truth artifact.

## 4.6 Overlay marker
A viewer-visible marker that indicates the original source section has an accepted change affecting it.

---

## 5. Which events can create change candidates

A change candidate can be created from:
- a new communication message/thread
- a re-synced edited communication message
- a manager-created manual proposal
- a contradiction found between source evidence and current truth
- a clarification thread that materially changes understanding

A change candidate should **not** be created for every informational message.

---

## 6. Supported update classes

Use these conceptual classes:
- `clarification`
- `decision`
- `requirement_addition`
- `requirement_modification`
- `requirement_removal`
- `constraint_change`
- `integration_change`
- `contradiction_resolution`

These can map to one or more database enums such as `proposal_type` and `insight_type`.

---

## 7. Update lifecycle

## Step 1: detect candidate
A new or edited message arrives.
The system classifies it as possible:
- clarification
- decision
- change
- contradiction
- blocker

At this point, nothing has changed in current truth.

---

## Step 2: resolve impact
The system maps the candidate to:
- affected document sections
- affected brain nodes
- current change/decision context
- likely old understanding vs likely new understanding

This should be explicit and queryable.

---

## Step 3: create structured proposal
Create a `spec_change_proposal` with:
- title
- summary
- proposal_type
- status = `detected` or `needs_review`
- old understanding
- new understanding
- impact summary
- source links
- affected section/node links

At this stage, it is still only a candidate.

---

## Step 4: review by authorized manager
A manager reviews the proposal and chooses:
- accept
- reject
- supersede / replace via later proposal

Devs may help interpret, but they must not accept/reject authoritative truth changes.

---

## Step 5: apply accepted proposal
If accepted, the backend must:
1. create a new current Product Brain artifact version
2. update or regenerate the graph projection if needed
3. persist acceptance metadata on the proposal
4. persist links to source messages and affected refs
5. attach overlay markers to affected document sections
6. update dashboard freshness / change pressure
7. make the new version the current accepted truth

---

## Step 6: preserve history
After acceptance:
- original doc remains unchanged
- original message remains unchanged
- accepted change remains queryable forever
- previous accepted brain version remains available for diff/history

---

## 8. Decision lifecycle

Decisions should follow a similar but slightly different path.

## Step 1: detect or create decision candidate
A message or review process identifies a decision.

## Step 2: normalize into decision record
Create `decision_record` with:
- title
- statement
- source summary
- status = `open`

## Step 3: accept/reject decision
Authorized manager accepts or rejects.

## Step 4: if accepted and truth-affecting, update current truth
If the decision changes the product understanding, create a new current Product Brain version or include the decision in the next accepted version.

---

## 9. Source precedence rules

## 9.1 Current-truth questions
For questions like:
- What should engineering follow?
- What is the current requirement?
- What is the accepted scope now?

The precedence is:
1. latest accepted Product Brain
2. accepted changes
3. accepted decisions
4. original documents/messages

## 9.2 Origin/provenance questions
For questions like:
- Where was this first mentioned?
- What did the original PRD say?
- Which message introduced this change?

The precedence is:
1. original docs/messages
2. accepted change/decision overlays
3. current truth summaries

## 9.3 Conflict rule
If current truth differs from original text:
- do not hide original text
- do not pretend the original text changed
- show the difference through overlay markers and linked accepted changes

---

## 10. What counts as a truth update vs a note

## Truth update
A proposal/decision updates current truth if it changes:
- requirement meaning
- scope
- constraint
- integration
- flow/module logic
- accepted interpretation

## Informational note
A message may stay informational if it only:
- discusses timing casually
- repeats existing understanding
- asks a question without resolution
- provides context without changing accepted meaning

The system must not over-upgrade informational chatter into current-truth changes.

---

## 11. Document overlay rules

The Live Doc Viewer must expose the difference between:
- original document text
- accepted current-truth overlays

## 11.1 Overlay marker requirements
For every affected section, the backend should be able to return:
- change proposal id
- change status
- linked message ids
- linked thread ids
- affected brain node ids
- short change summary
- acceptance metadata

## 11.2 Overlay semantics
Markers should communicate:
- this section has an accepted change
- what changed at a high level
- where to inspect the source message

## 11.3 Viewer rule
The viewer must never imply that the raw document itself was rewritten.

---

## 12. Product Brain versioning rules

## 12.1 New version creation
Create a new `product_brain` artifact version when:
- accepted change proposal materially affects product truth
- accepted decision materially affects product truth
- manager explicitly rebuilds current truth from accepted state

## 12.2 Parent linkage
Every new version should reference:
- parent version id
- change summary
- source refs

## 12.3 Accepted version uniqueness
At most one accepted current Product Brain version should be current for a given project at a time.

---

## 13. Change proposal validity requirements

A change proposal is valid only if it has:
- at least one source message link
- at least one affected document section or brain node, unless it is a global clarification/decision
- old understanding or enough context to infer what is changing
- proposed new understanding or decision statement

The system should reject “accepted” proposals that lack enough provenance.

---

## 14. Role and authority rules

## Manager role
Can:
- accept/reject authoritative changes
- accept/reject authoritative decisions
- trigger rebuild of current truth

## Dev role
Can:
- inspect proposals and decisions
- potentially create notes/proposals if product allows
- never accept/reject authoritative truth updates

## Client role
Can:
- view filtered accepted current truth
- never create or accept authoritative internal truth changes in the MVP

---

## 15. Dashboard update rules

Accepted changes should influence dashboard state.

After applying accepted change:
- project dashboard freshness should update
- recent change pressure should update
- unresolved proposal counts should update
- “projects needing attention” may update

Dashboard is not the source of truth, but it must reflect truth movement.

---

## 16. Socrates rules for living truth

When answering from current truth, Socrates must:
- prefer accepted current truth over stale raw text
- still cite the exact accepted change/decision when relevant
- allow the user to inspect the original source section/message

When answering from original text, Socrates must:
- not silently replace it with current truth
- explain that the current understanding has changed if relevant

---

## 17. Rejection and supersession rules

## 17.1 Rejected proposal
- does not affect current truth
- remains in history for audit
- may still be useful as evidence for later discussions

## 17.2 Superseded proposal
- was replaced by a later better proposal
- remains in history
- must not affect the current accepted truth directly anymore

## 17.3 Superseded decision
- remains queryable
- must no longer be treated as the active accepted decision

---

## 18. Rollback semantics

Rollback should never mean deleting history.

If a later accepted change effectively undoes an earlier one:
- create a new accepted change
- create a new current truth version
- keep earlier accepted versions and earlier accepted changes intact in history

---

## 19. Minimum implementation checklist

The update engine is not complete unless it can do all of the following:

- ingest immutable source messages
- detect change candidates
- link candidates to source evidence
- review/accept/reject candidates
- create new current truth version on acceptance
- link accepted changes to affected doc sections and brain nodes
- show change markers in the Live Doc Viewer
- let Socrates answer from current truth and original provenance
- preserve old versions and old accepted changes

---

## 20. Final rule

The system must never “quietly rewrite the PRD.”

It must maintain a **living accepted truth on top of immutable sources**, with every meaningful change linked to the exact evidence that caused it.
