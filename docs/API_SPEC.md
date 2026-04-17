# Orchestra API Specification

## 1. Purpose

This document defines the **backend API contract** for the current Orchestra product.

It should be used by:
- backend engineers
- frontend engineers
- Claude Code / Codex / other coding agents
- QA / contract-test authors

It describes the **current product**, not the old artifact-chain-first UI.

The user-facing surfaces this API must support are:
1. Dashboard
2. Product Brain
3. Live Doc Viewer
4. Socrates

The API may expose more internal workflows than the frontend surfaces show, but those workflows must still serve the current product.

---

## 2. API design rules

### 2.1 Versioned base path
All routes must live under:

```text
/v1
```

### 2.2 Org/project scoping is server-enforced
The frontend must never be trusted to hide unauthorized resources.

Every route must enforce:
- authenticated user
- organization scoping
- project membership / visibility
- role-specific permissions

### 2.3 Thin route handlers, strong service layer
Routes validate, authorize, and delegate.
Business logic must live in services.

### 2.4 Async work should be explicit
Long-running operations must be modeled as async jobs or task states.
Routes should return:
- accepted / queued state
- current status
- next place to poll or subscribe

### 2.5 Surface APIs and internal workflow APIs can coexist
The frontend should consume **surface-friendly** endpoints.
The backend may also expose more granular internal workflow endpoints for generation, rebuild, review, and audits.

### 2.6 Every explainable answer needs exact references
Any route that returns derived truth, AI answers, or change views must include enough target information for the frontend to open the source.

---

## 3. Common conventions

## 3.1 Authentication

### Manager/dev authenticated routes
Use bearer JWT access tokens.

```http
Authorization: Bearer <access_token>
```

### Client read-only routes
Use tokenized share links and filtered read models.

---

## 3.2 Standard response shape

Not every route must wrap responses in an envelope, but the recommended pattern is:

```json
{
  "data": { ... },
  "meta": { ... },
  "error": null
}
```

On error:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "validation_error",
    "message": "Readable explanation",
    "details": { ... }
  }
}
```

---

## 3.3 IDs
Use UUIDs for all internal entity IDs.
Do not expose implementation-specific sequential IDs.

---

## 3.4 Timestamps
Use ISO-8601 UTC timestamps in all responses.

---

## 3.5 Pagination
List endpoints must support cursor or limit/offset pagination.
Preferred standard:

```http
GET /v1/projects?limit=20&cursor=...
```

Response:

```json
{
  "data": [...],
  "meta": {
    "nextCursor": "...",
    "hasMore": true
  }
}
```

---

## 4. Surface API groups

The current product should be exposed through these route groups:

1. auth
2. projects and memberships
3. documents and Product Brain
4. communications
5. changes and decisions
6. Socrates
7. dashboard
8. client views
9. realtime / streaming

---

## 5. Auth routes

## 5.1 POST /v1/auth/signup
Create user in an organization.

### Body
```json
{
  "orgName": "Arrayah Studio",
  "email": "founder@arrayah.com",
  "password": "...",
  "displayName": "Mannan"
}
```

### Notes
- If org creation is out of current scope, replace with invite-only onboarding.
- At minimum the schema should support standalone local setup and seeded first user.

---

## 5.2 POST /v1/auth/login

### Body
```json
{
  "email": "founder@arrayah.com",
  "password": "..."
}
```

### Response
```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "id": "uuid",
      "orgId": "uuid",
      "displayName": "Mannan",
      "globalRole": "owner",
      "workspaceRoleDefault": "manager"
    }
  }
}
```

---

## 5.3 POST /v1/auth/refresh
Refresh access token.

---

## 5.4 POST /v1/auth/logout
Revoke refresh token / current session.

---

## 5.5 GET /v1/auth/me
Return authenticated user + org context.

---

## 6. Project and membership routes

## 6.1 GET /v1/projects
List projects the user can access.

### Response shape
Include only fields needed for top-level dashboard/project switchers:
- id
- name
- slug
- status
- previewUrl presence
- latestBrainVersionAt
- unresolvedChangeCount
- docReadinessSummary
- memberCounts

---

## 6.2 POST /v1/projects
Manager-only.

### Body
```json
{
  "name": "Rental management platform",
  "description": "Client delivery project",
  "previewUrl": null
}
```

---

## 6.3 GET /v1/projects/:projectId
Project detail.

---

## 6.4 PATCH /v1/projects/:projectId
Update name, description, status, previewUrl.

---

## 6.5 GET /v1/projects/:projectId/members
Project member list + headcount breakdown.

### Response should include
- member list
- project roles
- allocation_percent
- weekly_capacity_hours
- headcount summary
- role summary

---

## 6.6 POST /v1/projects/:projectId/members
Add manager/dev/client to project.

---

## 6.7 PATCH /v1/projects/:projectId/members/:memberId
Update role, allocation, active state.

---

## 7. Documents and Product Brain routes

## 7.1 POST /v1/projects/:projectId/documents/upload
Upload one document.

### Multipart fields
- `file`
- `kind`
- `title` optional
- `visibility` optional
- `sourceLabel` optional

### Response
```json
{
  "data": {
    "documentId": "uuid",
    "documentVersionId": "uuid",
    "status": "pending"
  }
}
```

### Behavior
- persist logical document + immutable version
- enqueue parse job
- return quickly

---

## 7.2 GET /v1/projects/:projectId/documents
List documents.

### Filters
- `kind`
- `status`
- `visibility`
- `search`

### Response should include
- document id
- title
- kind
- current version id
- current parse status
- parse confidence
- uploaded by
- created/updated timestamps
- whether shared with client

---

## 7.3 GET /v1/projects/:projectId/documents/:documentId
Document metadata + current version summary.

---

## 7.4 GET /v1/projects/:projectId/documents/:documentId/view
Live Doc Viewer payload.

### Query params
- `versionId`
- `page`
- `pageSize`
- `anchorId`
- `sectionId`
- `chunkId`
- `highlightCitationId`

### Response contract
```json
{
  "data": {
    "document": {
      "id": "uuid",
      "title": "Core PRD",
      "kind": "prd",
      "currentVersionId": "uuid"
    },
    "version": {
      "id": "uuid",
      "status": "ready",
      "parseConfidence": 0.94,
      "sourceLabel": "Client PRD v3"
    },
    "viewerState": {
      "documentId": "uuid",
      "documentVersionId": "uuid",
      "pageNumber": 6,
      "anchorId": "reporting_requirements"
    },
    "selected": {
      "source": "anchor",
      "documentId": "uuid",
      "documentVersionId": "uuid",
      "sectionId": "uuid",
      "anchorId": "reporting_requirements",
      "pageNumber": 6,
      "chunkId": null
    },
    "highlight": {
      "citationId": "uuid",
      "citationType": "document_section",
      "refId": "uuid",
      "sectionId": "uuid",
      "anchorId": "reporting_requirements",
      "pageNumber": 6,
      "chunkId": null,
      "citationLabel": "Core PRD · p.6 · Features > Reporting",
      "openTarget": {
        "targetType": "document_section",
        "targetRef": {
          "documentId": "uuid",
          "documentVersionId": "uuid",
          "anchorId": "reporting_requirements",
          "pageNumber": 6
        }
      }
    },
    "sections": [
      {
        "sectionId": "uuid",
        "anchorId": "reporting_requirements",
        "citationLabel": "Core PRD · p.6 · Features > Reporting",
        "pageNumber": 6,
        "headingPath": ["Features", "Reporting"],
        "orderIndex": 12,
        "text": "...",
        "changeMarkers": [
          {
            "changeProposalId": "uuid",
            "proposalType": "requirement_update",
            "status": "accepted",
            "acceptedAt": "2026-04-17T12:00:00.000Z",
            "acceptedBy": "uuid",
            "title": "Reporting frequency updated",
            "summary": "Client approved weekly reporting instead of monthly",
            "decisionRecordId": "uuid",
            "linkedBrainNodeIds": ["uuid"],
            "linkedThreadIds": ["uuid"],
            "linkedMessageRefs": [
              {
                "type": "message",
                "id": "uuid",
                "senderLabel": "Client",
                "sentAt": "2026-04-12T10:00:00.000Z",
                "threadId": "uuid"
              }
            ]
          }
        ],
        "linkedDecisionIds": ["uuid"],
        "linkedMessageRefs": [
          {
            "type": "message",
            "id": "uuid",
            "senderLabel": "Client",
            "sentAt": "2026-04-12T10:00:00.000Z",
            "threadId": "uuid"
          }
        ],
        "hasCurrentTruthOverlay": true,
        "currentTruthSummary": ["Client approved weekly reporting instead of monthly"]
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 50,
      "totalCount": 120,
      "totalPages": 3,
      "hasMore": true
    }
  }
}
```

### Requirements
- paginated for large docs
- supports opening exact anchors
- includes change/decision overlays

---

## 7.5 GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId
Open one exact anchor/section.

This is the endpoint Socrates open-target behavior should use when opening precise locations.

The anchor lookup must be a direct indexed lookup scoped to the chosen/current version, not an in-memory scan of the current page window.

---

## 7.6 GET /v1/projects/:projectId/documents/:documentId/search?q=...
Section-first lexical search within one document version.

### Response should include
- matching section ids
- anchor ids
- snippets
- page numbers
- citation labels
- open-targets back into the viewer

---

## 7.7 GET /v1/projects/:projectId/documents/:documentId/anchors/:anchorId/provenance
Click-to-source provenance bundle for one anchor.

### Response should include
- selected section identity
- nearby supporting sections
- linked chunks/evidence refs
- linked brain nodes
- linked accepted changes
- linked decision records
- linked message/thread refs where allowed
- whether current accepted truth differs from original source in that area
- open-targets for related evidence

---

## 7.8 POST /v1/projects/:projectId/documents/:documentId/reprocess
Manager-only.
Reparse/reindex a document version.

## 7.9 POST /v1/projects/:projectId/brain/rebuild
Trigger full current-truth rebuild.

### What rebuild means
- regenerate Source Package if needed
- regenerate Clarified Brief if needed
- regenerate / recompute graph projection
- rebuild current Product Brain artifact
- do **not** mutate original documents/messages

### Response
Return queued/accepted status plus current latest artifact refs.

---

## 7.10 GET /v1/projects/:projectId/brain/current
Return current accepted Product Brain.

### Response should include
- current brain artifact version
- source package summary
- clarified brief summary
- graph summary
- latest accepted changes
- latest accepted decisions
- freshness metadata

---

## 7.11 GET /v1/projects/:projectId/brain/versions
Return Product Brain version history.

## 7.12 GET /v1/projects/:projectId/brain/graph/current
Return current graph payload.

### Response should include
- nodes
- edges
- risk/unresolved markers
- source section references
- changed node markers

---

## 7.13 GET /v1/projects/:projectId/brain/diff?from=:id&to=:id
Compare two Product Brain versions.

---

## 8. Communication routes

## 8.1 POST /v1/projects/:projectId/connectors/:provider/connect
Connect Slack, Gmail, or WhatsApp Business.

### Providers
- `slack`
- `gmail`
- `whatsapp_business`

### Notes
- For OAuth providers, this route may initiate the flow and return a redirect URL.
- For internal/dev mode, allow inline test credentials in non-production only.

---

## 8.2 POST /v1/webhooks/slack
Webhook ingestion endpoint.

---

## 8.3 POST /v1/webhooks/gmail
Webhook or ingestion callback endpoint.

---

## 8.4 POST /v1/webhooks/whatsapp-business
Webhook ingestion endpoint.

---

## 8.5 GET /v1/projects/:projectId/threads
List normalized project threads.

### Filters
- provider
- updatedSince
- search
- hasOpenChangeProposal

---

## 8.6 GET /v1/projects/:projectId/threads/:threadId
Return thread details + message list + linked insights.

---

## 8.7 GET /v1/projects/:projectId/messages/:messageId
Return one message with linked insights, changes, decisions, and open targets.

This is an internal-only evidence route for the Live Doc Viewer and provenance inspection. Client-safe viewer payloads must not expose raw message bodies or direct message routes until a future explicit shareability model exists.

---

## 8.8 POST /v1/projects/:projectId/connectors/:connectorId/sync
Trigger manual incremental sync.

---

## 9. Changes and decisions routes

## 9.1 GET /v1/projects/:projectId/change-proposals
List change proposals.

### Filters
- status
- proposalType
- affectedNodeId
- affectedSectionId
- sourceProvider

---

## 9.2 GET /v1/projects/:projectId/change-proposals/:proposalId
Return one change proposal with full provenance.

### Must include
- old understanding
- new understanding
- linked messages
- linked sections
- linked brain nodes
- review/acceptance metadata

---

## 9.3 POST /v1/projects/:projectId/change-proposals/:proposalId/accept
Manager-only.

### Behavior
- mark proposal accepted
- create new Product Brain version
- update graph if required
- attach markers to affected sections
- refresh dashboard freshness/change pressure

---

## 9.4 POST /v1/projects/:projectId/change-proposals/:proposalId/reject
Manager-only.
Reject proposal without mutating current truth.

---

## 9.5 GET /v1/projects/:projectId/decisions
List decision records.

---

## 9.6 GET /v1/projects/:projectId/decisions/:decisionId
Return one decision + provenance.

---

## 9.7 POST /v1/projects/:projectId/decisions/:decisionId/accept
Optional if decisions are separated from proposals in UI.

---

## 10. Socrates routes

## 10.1 POST /v1/projects/:projectId/socrates/sessions
Create a Socrates session.

### Body
```json
{
  "pageContext": "brain_overview",
  "selectedRef": {
    "type": "brain_node",
    "id": "uuid"
  }
}
```

### Response
```json
{
  "data": {
    "sessionId": "uuid",
    "pageContext": "brain_overview",
    "selectedRef": {
      "type": "brain_node",
      "id": "uuid"
    }
  }
}
```

---

## 10.2 PATCH /v1/projects/:projectId/socrates/sessions/:sessionId/context
Update page context or selected object.

### Body
```json
{
  "pageContext": "doc_viewer",
  "selectedRef": {
    "type": "document_section",
    "id": "uuid"
  },
  "viewerState": {
    "documentId": "uuid",
    "documentVersionId": "uuid",
    "pageNumber": 6,
    "anchorId": "reporting_requirements"
  }
}
```

---

## 10.3 GET /v1/projects/:projectId/socrates/sessions/:sessionId/suggestions
Return page-aware prompt suggestions.

### Response
```json
{
  "data": {
    "pageContext": "doc_viewer",
    "suggestions": [
      "When was this feature first mentioned?",
      "Show me accepted changes affecting this section",
      "Summarize this module for engineering"
    ]
  }
}
```

---

## 10.4 POST /v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream
Primary Socrates answer route.

### Body
```json
{
  "content": "When was this feature first mentioned?"
}
```

### Transport
- SSE recommended for token streaming
- final persisted assistant message should be queryable afterward

### Final answer contract
```json
{
  "answer_md": "The reporting feature first appears in the PRD and was later modified in Slack on April 10.",
  "citations": [
    {
      "type": "document_section",
      "refId": "uuid",
      "label": "PRD — Reporting Requirements",
      "pageNumber": 6
    },
    {
      "type": "message",
      "refId": "uuid",
      "label": "Slack message from Jack"
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
  ]
}
```

---

## 10.5 GET /v1/projects/:projectId/socrates/sessions/:sessionId/messages
Return session history.

---

## 11. Dashboard routes

## 11.1 GET /v1/dashboard/general
Return org-wide dashboard snapshot.

### Must include
- active projects summary
- total team headcount
- role breakdown
- project/member distribution
- projects needing attention
- recent change/decision pressure

---

## 11.2 GET /v1/projects/:projectId/dashboard
Return project dashboard snapshot.

### Must include
- project summary
- member list summary
- role breakdown
- document readiness
- latest brain version summary
- accepted/pending change pressure
- quick navigation references

---

## 11.3 GET /v1/projects/:projectId/team-summary
Return project-level team read model.

This supports dashboard cards and secondary views without loading full brain/doc data.

---

## 11.4 POST /v1/projects/:projectId/dashboard/refresh
Manager-only internal/admin route to force refresh snapshot.

---

## 12. Client view routes

## 12.1 GET /v1/client/:token/project-summary
Read-only filtered project summary.

---

## 12.2 GET /v1/client/:token/brain
Read-only filtered Product Brain / flowchart.

---

## 12.3 GET /v1/client/:token/preview
Return preview configuration.

### Behavior
If preview URL exists and sharing is enabled:
- return preview metadata / URL

Else:
- return fallback brain/flowchart payload metadata

---

## 12.4 GET /v1/client/:token/docs/:documentId/view
Client-safe document view.

### Must enforce
- only explicitly shared documents/sections
- no internal-only change metadata
- no internal-only decision metadata

---

## 13. Realtime and streaming

## 13.1 SSE /v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream
Token stream for Socrates.

---

## 13.2 Optional SSE /v1/projects/:projectId/events
Project-scoped server-sent events for:
- document processing state
- dashboard snapshot invalidation
- connector sync completion
- change acceptance notifications
- suggestion cache invalidation

### Note
This is optional but strongly recommended.
Do not make product correctness depend on it.

---

## 14. Internal lifecycle/workflow APIs (optional but recommended)

These are useful for backend-admin tooling and for keeping workflow steps explicit.
They do not need to be surfaced directly in the main frontend.

Recommended internal groups:
- source package generation endpoints
- clarified brief generation endpoints
- graph regeneration endpoints
- proposal review/audit endpoints
- snapshot repair endpoints
- connector replay/backfill endpoints

---

## 15. Endpoint-to-surface mapping

## 15.1 Dashboard surface depends on
- `/v1/dashboard/general`
- `/v1/projects/:projectId/dashboard`
- `/v1/projects/:projectId/team-summary`
- `/v1/projects`

## 15.2 Product Brain surface depends on
- `/v1/projects/:projectId/brain/current`
- `/v1/projects/:projectId/brain/graph/current`
- `/v1/projects/:projectId/brain/versions`
- `/v1/projects/:projectId/change-proposals`
- `/v1/projects/:projectId/decisions`

## 15.3 Live Doc Viewer depends on
- `/v1/projects/:projectId/documents/:documentId/view`
- `/v1/projects/:projectId/documents/:documentId/anchors/:anchorId`
- `/v1/projects/:projectId/messages/:messageId`
- `/v1/projects/:projectId/change-proposals/:proposalId`

## 15.4 Socrates depends on
- `/v1/projects/:projectId/socrates/sessions`
- `/v1/projects/:projectId/socrates/sessions/:sessionId/context`
- `/v1/projects/:projectId/socrates/sessions/:sessionId/suggestions`
- `/v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream`
- `/v1/projects/:projectId/socrates/sessions/:sessionId/messages`

---

## 16. Final API rule

If an endpoint returns derived understanding without enough provenance for the frontend to open the evidence, the endpoint is incomplete.
