# Orchestra Role Capabilities

## 1. Purpose

This document defines the **authorization and product-capability model** for the current Orchestra.

It should be used by:
- backend engineers
- frontend engineers
- product/design
- QA and contract-test authors

It covers the three current role families:
- **Manager** (`PM / CEO / CTO / Manager`)
- **Dev**
- **Client**

This document is intentionally server-first.
The frontend may hide actions for usability, but the backend must enforce these rules.

---

## 2. Role philosophy

## 2.1 Manager role is the authoritative workspace role
Managers are the people allowed to shape current truth.
They can:
- ingest docs
- manage connectors
- review and accept/reject changes
- manage memberships
- access all manager-facing surfaces

## 2.2 Dev role is almost full-read, limited-control
Developers should not be blind.
They need most read surfaces, but not authority over client-originated accepted truth.

## 2.3 Client role is a filtered read-only projection
Client view is **not** the manager view with buttons hidden.
It is a separate filtered read model.

---

## 3. Role families

## 3.1 Manager
Applies to:
- PM
- CEO
- CTO
- Manager

For the first implementation, these can share one backend permission family.

## 3.2 Dev
Applies to:
- engineer
- engineering lead if not using manager privileges
- technical contributor

## 3.3 Client
Applies to:
- client stakeholders
- external reviewers
- anyone using a shared client-safe link/tokenized view

---

## 4. Permission scopes

There are three levels of permission:

1. **organization scope**
2. **project scope**
3. **surface/action scope**

A user may have:
- high org-level privilege but no project membership
- project membership but limited workspace role
- client-safe access without a normal logged-in account

---

## 5. Access matrix by surface

## 5.1 Dashboard

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| View general dashboard | Yes | No | No |
| View project dashboard | Yes | Yes (assigned projects only) | Limited shared-only |
| View team headcount and role breakdown | Yes | Yes (project-scoped only) | Limited summary only |
| View workload/pressure indicators | Yes | Yes (project-scoped only) | No |
| View internal change pressure | Yes | Yes | No |
| Trigger snapshot refresh | Yes | No | No |

### Notes
- General dashboard is manager-only.
- Devs can see project-level dashboard data only for projects they belong to.
- Client gets only explicitly shared summary data.

---

## 5.2 Product Brain

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| View current Product Brain | Yes | Yes | Filtered shared-only |
| View graph/project map | Yes | Yes | Filtered shared-only |
| View unresolved areas | Yes | Yes | Optional filtered summary |
| View accepted changes | Yes | Yes | Filtered shared-only |
| View internal-only source clusters | Yes | Yes | No |
| Rebuild Product Brain | Yes | No | No |
| Mark version accepted/current | Yes | No | No |

### Notes
- Devs should be able to read the Brain because they need current truth.
- Clients should only see the shared/client-safe projection.

---

## 5.3 Live Doc Viewer

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| View parsed docs | Yes | Yes | Shared docs only |
| Open exact anchors | Yes | Yes | Shared docs only |
| See citation highlights | Yes | Yes | Yes (shared-safe only) |
| See accepted change markers | Yes | Yes | Filtered shared-only |
| See linked source messages | Yes | Yes | No unless explicitly shared |
| See internal-only decision metadata | Yes | Yes | No |
| Upload docs | Yes | Limited internal-note uploads only | No |
| Reprocess docs | Yes | No | No |

### Notes
- Client document view must be safe by projection, not by hiding buttons.
- If a doc or section is not explicitly shareable, the client route must reject it.

---

## 5.4 Socrates

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| Use Socrates on manager/dev surfaces | Yes | Yes | No |
| Use client-safe Socrates in client view | Configurable | N/A | Configurable yes |
| Ask provenance questions | Yes | Yes | Limited shared-safe only |
| Receive citations | Yes | Yes | Shared-safe only |
| Open document targets | Yes | Yes | Shared-safe only |
| Open internal message/change targets | Yes | Yes | No |
| Ask about dashboard internals | Yes | Yes (project-scoped only) | No |

### Notes
- Client Socrates can exist, but only as a **client-safe mode**.
- If shipped later, it must use filtered retrieval and filtered citations.

---

## 5.5 Communication and connector management

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| Connect Slack/Gmail/WhatsApp Business | Yes | No | No |
| Trigger connector sync | Yes | No | No |
| View normalized threads/messages | Yes | Yes (project-scoped) | No by default |
| View internal communication metadata | Yes | Yes | No |
| View provider debug info | Yes | No | No |

### Notes
- Connectors are sensitive and manager-only.
- Devs may view normalized communication for projects they belong to if product chooses to expose it.

---

## 5.6 Changes and decisions

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| View change proposals | Yes | Yes | No unless shared summary exists |
| View decisions | Yes | Yes | Filtered accepted shared-only |
| Accept/reject change proposals | Yes | No | No |
| Accept/reject decisions | Yes | No | No |
| Create manual review notes | Yes | Yes | No |
| View full provenance on accepted changes | Yes | Yes | Filtered/no internal message ids |

### Notes
- This is the most important authority boundary in the product.
- Only managers can change the accepted truth.

---

## 5.7 Membership and sharing

| Capability | Manager | Dev | Client |
|---|---:|---:|---:|
| Add/remove project members | Yes | No | No |
| Update project roles | Yes | No | No |
| Configure client sharing | Yes | No | No |
| Generate/rotate client access token | Yes | No | No |
| Use client tokenized view | No | No | Yes |

---

## 6. Endpoint access policy by route group

## 6.1 /v1/auth
- public for login/signup/refresh/logout flows as appropriate
- authenticated `/me`

## 6.2 /v1/projects
- `GET /v1/projects`: manager/dev only for their org/project membership set
- `POST /v1/projects`: manager only
- `GET /v1/projects/:projectId`: manager/dev project member only
- `PATCH /v1/projects/:projectId`: manager only

## 6.3 /v1/projects/:projectId/members
- GET: manager and dev project member
- POST/PATCH: manager only

## 6.4 /v1/projects/:projectId/documents*
- manager: full project docs
- dev: assigned-project docs
- client: only via client-safe document routes or shared projections

## 6.5 /v1/projects/:projectId/brain*
- manager: full
- dev: read
- client: only via filtered client routes

## 6.6 /v1/projects/:projectId/connectors*
- manager only

## 6.7 /v1/projects/:projectId/change-proposals*
- manager: read/write review actions
- dev: read only
- client: not directly

## 6.8 /v1/projects/:projectId/decisions*
- manager: full read
- dev: read only
- client: filtered shared projection only if surfaced in client view

## 6.9 /v1/projects/:projectId/socrates*
- manager/dev: authenticated project members
- client: only via client-safe dedicated mode if enabled

## 6.10 /v1/dashboard/general
- manager only

## 6.11 /v1/projects/:projectId/dashboard
- manager/dev project members
- client via filtered client projection only if included in client surface

## 6.12 /v1/client/:token/*
- public-token authenticated only
- always filtered
- never returns internal-only data

---

## 7. Client-safe projection rules

Client-safe projection is not optional.

### Must always remove
- internal-only docs
- internal-only change proposals
- internal message ids/permalinks unless explicitly intended for client
- internal decision notes
- team allocation/workload data unless deliberately shared
- internal-only graph nodes and source clusters

### May include
- project title/summary
- current shared Product Brain / flowchart
- shared docs/sections
- preview URL if configured
- accepted client-safe changes
- high-level next-step or status summaries if later added

---

## 8. Dev-role policy details

Devs should have broad read access because they need context.

### Devs should be able to
- read current product truth
- inspect documents
- inspect accepted changes and decisions
- use Socrates
- view project dashboard
- upload internal technical notes if the project enables it

### Devs should not be able to
- alter project membership
- manage communication connectors
- accept/reject authoritative spec changes
- publish client-safe views
- change what is considered the accepted current truth

### Why this matters
If devs cannot see enough, Orchestra becomes useless to them.
If devs can approve truth changes, authority becomes muddy.

---

## 9. Manager-role policy details

Managers are responsible for project truth governance.

### Managers must be able to
- create projects
- upload/manage docs
- connect communication providers
- rebuild source package/clarified brief/brain/graph
- review and accept/reject changes
- review and accept/reject decisions
- manage members and sharing
- view all dashboards
- use Socrates across all internal contexts

### Why this matters
The current truth of the product must be governed by a responsible role.

---

## 10. Client-role policy details

Clients are not second-class users, but they are intentionally sandboxed.

### Clients should be able to
- understand the product at a high level
- inspect shared source material
- see the current shared truth
- use preview if configured
- optionally use a client-safe Socrates mode

### Clients should not be able to
- view internal-only artifacts
- view unaccepted or under-review changes
- inspect internal communication
- inspect internal decisions not meant for them
- change any project state

---

## 11. Auditing requirements by role-sensitive action

The backend must log at least these actions:
- manager accepted change proposal
- manager rejected change proposal
- manager accepted decision
- manager updated project membership
- manager generated/rotated client token
- user opened client-safe doc/view if audit requirements call for it

These should land in `audit_events`.

---

## 12. Final authorization rule

If a role can change the accepted truth, it must be explicit in this document.

If it is not explicitly allowed here, it should be denied by default.
