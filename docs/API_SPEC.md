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

### Validation rules
- only one of `anchorId`, `sectionId`, or `chunkId` may be provided at a time
- if explicit `versionId` is provided for the viewer, it must point to a parsed/viewable version
- if no explicit `versionId` is provided and the current version is not yet viewable, the backend may fall back to the latest `ready|partial` version for parsed-view routes

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
- must not silently fail when the current document version is still parsing if an older parsed version exists

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

The current communication layer is Build C1 + C2 + C3 + C4:
- provider-agnostic schema hardening
- manual import
- connector read models
- sync-run tracking
- message indexing
- machine-derived insight classification
- review queues
- communication-driven proposal generation
- production-safe credential vaulting
- Slack OAuth + sync + verified webhook ingestion
- Gmail OAuth + polling/incremental sync ingestion
- Outlook OAuth + Microsoft Graph sync ingestion
- Microsoft Teams OAuth + Microsoft Graph channel/reply sync ingestion
- WhatsApp Business inbound/webhook ingestion
- provider sync locking, retry/backoff, and communication-summary dashboard integration

### Authorization rules
- manager-only:
  - connector list/detail/update/connect/revoke
  - manual import
  - connector sync
  - sync-run history
  - classify message/thread
  - ignore insights
  - create proposals from insights
- manager + assigned dev:
  - timeline
  - thread detail
  - message evidence detail
  - message insight list/detail
  - communication review read model
- client:
  - blocked from internal communication routes by default

## 8.1 GET /v1/projects/:projectId/connectors
Manager-only connector list.

### Filters
- `provider`
- `status`

### Response includes
- connector id/provider/status
- account label
- last sync state
- last error
- thread/message/sync-run counts

---

## 8.2 GET /v1/projects/:projectId/connectors/:connectorId
Manager-only connector detail.

### Response includes
- connector metadata
- config JSON
- recent sync runs
- thread/message counts

### Security notes
- `credentialsRef` is internal-only and never returned
- raw OAuth access tokens and refresh tokens are never returned

---

## 8.3 PATCH /v1/projects/:projectId/connectors/:connectorId
Manager-only connector update.

### Body
```json
{
  "accountLabel": "Client email import",
  "config": {
    "channelIds": ["C123"]
  }
}
```

### Notes
- provider cannot be changed
- C1 allows metadata/config updates only

---

## 8.4 POST /v1/projects/:projectId/connectors/:provider/connect
Manager-only provider connect/init route.

### Supported providers in the current repo
- `manual_import` → creates or reuses a connected manual connector
- `slack` → starts OAuth and returns a Slack OAuth URL
- `gmail` → starts OAuth and returns a Google OAuth URL
- `outlook` → starts Microsoft OAuth and returns a Microsoft OAuth URL
- `microsoft_teams` → starts Microsoft OAuth and returns a Microsoft OAuth URL
- `whatsapp_business` → readiness-gated inbound webhook setup flow

### Behavior
- `manual_import` returns a connected connector immediately
- `slack`, `gmail`, `outlook`, and `microsoft_teams` return `pending_auth` plus a provider OAuth URL
- `whatsapp_business` returns a readiness-gated connector record intended for webhook-first ingestion

---

## 8.4A GET /v1/oauth/slack/callback
Unauthenticated Slack OAuth callback.

### Behavior
- verifies and consumes one-time OAuth state
- exchanges the Slack code for bot credentials
- stores credentials through `CredentialVault`
- creates or updates the Slack connector
- enqueues initial `backfill` sync

---

## 8.4B GET /v1/oauth/google/callback
Unauthenticated Google OAuth callback for Gmail.

### Behavior
- verifies and consumes one-time OAuth state
- exchanges the Google code for Gmail read-only credentials
- stores credentials through `CredentialVault`
- creates or updates the Gmail connector
- enqueues initial `backfill` sync

---

## 8.4C POST /v1/webhooks/slack
Unauthenticated Slack Events API webhook.

### Behavior
- verifies Slack request signature and timestamp
- responds immediately to `url_verification`
- dedupes webhook events by `event_id`
- enqueues webhook sync work for matching Slack connectors
- does not perform heavy ingestion inline

---

## 8.4D GET /v1/oauth/microsoft/callback
Unauthenticated Microsoft OAuth callback shared by Outlook and Microsoft Teams.

### Behavior
- verifies and consumes one-time OAuth state
- routes callback handling from the signed state payload to either `outlook` or `microsoft_teams`
- stores credentials through `CredentialVault`
- creates or updates the connector
- enqueues initial `backfill` sync

---

## 8.4E POST /v1/webhooks/outlook
Unauthenticated Microsoft Graph notification endpoint for Outlook.

### Behavior
- returns `validationToken` immediately when Microsoft validates the subscription
- dedupes notifications through `provider_webhook_events`
- enqueues connector incremental sync

---

## 8.4F POST /v1/webhooks/teams
Unauthenticated Microsoft Graph notification endpoint for Microsoft Teams.

### Behavior
- returns `validationToken` immediately when Microsoft validates the subscription
- dedupes notifications through `provider_webhook_events`
- enqueues connector incremental sync

---

## 8.4G GET /v1/webhooks/whatsapp-business
WhatsApp Business verification challenge endpoint.

### Behavior
- validates `hub.verify_token`
- returns `hub.challenge`

---

## 8.4H POST /v1/webhooks/whatsapp-business
WhatsApp Business inbound webhook endpoint.

### Behavior
- verifies signature when `WHATSAPP_APP_SECRET` is configured
- dedupes inbound events
- normalizes inbound messages into provider-agnostic thread/message batches
- ignores status-only events as user-message evidence
- enqueues indexing/classification through the standard communication ingestion flow

---

## 8.5 POST /v1/projects/:projectId/connectors/:connectorId/sync
Manager-only sync trigger.

### Body
```json
{
  "syncType": "manual"
}
```

### Response
```json
{
  "data": {
    "connectorId": "uuid",
    "syncRunId": "uuid",
    "queued": true
  }
}
```

### Notes
- `manual_import` sync is a no-op/provider-summary path
- `slack` supports:
  - OAuth-based connect
  - manual/incremental backfill sync
  - verified webhook-triggered sync
- `gmail` supports:
  - OAuth-based connect
  - manual/incremental polling sync
  - watch/webhook delivery is intentionally deferred in the current repo
- `outlook` supports:
  - OAuth-based connect
  - manual/incremental Microsoft Graph sync
  - provider-ready webhook callback handling
- `microsoft_teams` supports:
  - OAuth-based connect
  - manual/incremental Microsoft Graph sync for configured teams/channels
  - provider-ready webhook callback handling
- `whatsapp_business` supports:
  - readiness-gated inbound webhook ingestion
  - safe no-op manual sync summary because it is webhook-first
- repeated syncs are idempotent at the evidence layer and must not duplicate messages

---

## 8.6 POST /v1/projects/:projectId/connectors/:connectorId/revoke
Manager-only revoke route.

### Behavior
- sets connector status to `revoked`
- clears live usability without deleting historical threads/messages/chunks

---

## 8.7 GET /v1/projects/:projectId/connectors/:connectorId/sync-runs
Manager-only sync run history.

### Filters
- `limit`

---

## 8.8 POST /v1/projects/:projectId/communications/import
Manager-only manual import route.

### Purpose
Imports normalized communication evidence without OAuth/provider APIs.

### Body
```json
{
  "provider": "manual_import",
  "accountLabel": "Demo import",
  "thread": {
    "providerThreadId": "thread-reporting-001",
    "subject": "Reporting requirement discussion",
    "participants": [
      {
        "label": "Client",
        "externalRef": "client@example.com",
        "email": "client@example.com"
      }
    ],
    "startedAt": "2026-04-19T10:00:00.000Z",
    "threadUrl": null,
    "rawMetadata": {}
  },
  "messages": [
    {
      "providerMessageId": "msg-001",
      "senderLabel": "Client",
      "senderExternalRef": "client@example.com",
      "senderEmail": "client@example.com",
      "sentAt": "2026-04-19T10:01:00.000Z",
      "bodyText": "Can we add weekly reporting for managers?",
      "bodyHtml": null,
      "messageType": "user",
      "providerPermalink": null,
      "replyToProviderMessageId": null,
      "rawMetadata": {},
      "attachments": []
    }
  ]
}
```

### Behavior
- creates or reuses the project's `manual_import` connector
- upserts one normalized thread
- upserts messages idempotently by `(connectorId, providerMessageId)`
- creates `communication_message_revisions` when body changes
- stores attachment metadata
- queues or runs message indexing depending on job mode
- emits `communication_manual_imported`

---

## 8.9 GET /v1/projects/:projectId/communications/timeline
Manager/dev-only project communication timeline.

### Filters
- `provider`
- `insightType`
- `hasChangeProposal`
- `hasOpenDecision`
- `hasBlocker`
- `dateFrom`
- `dateTo`
- `search`
- `cursor`
- `limit`

### Response includes
- thread summary items
- latest message excerpt
- change proposal counts
- thread open-targets
- attention hints when linked proposals exist

---

## 8.10 GET /v1/projects/:projectId/threads
Manager/dev-only thread list.

### Filters
- `provider`
- `updatedSince`
- `search`
- `cursor`
- `limit`

---

## 8.11 GET /v1/projects/:projectId/threads/:threadId
Manager/dev-only thread detail.

### Response includes
- connector metadata
- thread metadata
- messages ordered ascending by `sentAt`
- thread insights
- linked change proposals
- linked decisions
- document open-targets
- Socrates-compatible `viewerState`

---

## 8.12 GET /v1/projects/:projectId/messages/:messageId
Manager/dev-only message evidence route.

### Response includes
- connector summary
- thread summary
- message body + provider metadata
- revisions
- attachments
- chunk metadata
- message insights
- linked proposals and decisions
- linked document targets
- open-targets for thread, message, and documents

### Notes
- This is the internal evidence route used by Live Doc Viewer provenance paths and Socrates citations/open-target validation.
- Client-safe viewer payloads must not expose raw message bodies or direct message routes until a later explicit shareability model exists.

---

## 8.13 GET /v1/projects/:projectId/message-insights
Manager/dev-only insight list.

### Filters
- `status`
- `insightType`
- `threadId`
- `messageId`
- `provider`
- `minConfidence`
- `hasProposal`
- `cursor`
- `limit`

### Response includes
- insight summary
- confidence
- source message/thread labels
- affected section/node ids
- open targets for message/thread

---

## 8.14 GET /v1/projects/:projectId/message-insights/:insightId
Manager/dev-only insight detail.

### Response includes
- summary + confidence
- evidence payload
- old/new understanding
- impact summary
- uncertainty
- linked generated proposal/decision ids

---

## 8.15 POST /v1/projects/:projectId/message-insights/:insightId/ignore
Manager-only.

### Behavior
- marks the insight as `ignored`
- does not change accepted truth

---

## 8.16 POST /v1/projects/:projectId/message-insights/:insightId/create-proposal
Manager-only.

### Behavior
- validates the insight is truth-affecting and has affected refs
- dedupes against existing open/accepted proposals in the same area
- creates or links a `spec_change_proposal`
- may also create/open a `decision_record`
- does not accept truth automatically

---

## 8.17 POST /v1/projects/:projectId/messages/:messageId/classify
Manager-only/debug route.

### Behavior
- builds a targeted product-aware context pack
- classifies the message into an insight
- persists the insight
- may enqueue proposal generation if thresholds are met

---

## 8.18 POST /v1/projects/:projectId/threads/:threadId/classify
Manager-only/debug route.

### Behavior
- classifies the thread state as a whole
- persists a `thread_insight`
- may enqueue proposal generation if thresholds are met

---

## 8.19 GET /v1/projects/:projectId/communication-review
Manager/dev-only review read model.

### Response includes
- pending important insights
- generated proposals in `needs_review`
- generated open decision candidates
- source labels
- confidence
- open targets

### Notes
- this is a review surface, not accepted truth
- manager acceptance still uses the existing change-proposal accept route

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
- active project list
- total team headcount
- role breakdown
- project/member distribution
- projects needing attention
- recent change/decision pressure
- optional `forceRefresh=true` query for manager-triggered inline rebuild

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
- optional `forceRefresh=true` query for inline rebuild of the project snapshot

### Current implementation notes
- manager and assigned dev only
- clients do not have a public dashboard route yet
- stale or missing snapshots rebuild inline
- if inline rebuild fails and an older snapshot exists, the older snapshot is returned instead of failing hard

---

## 11.3 GET /v1/projects/:projectId/team-summary
Return project-level team read model.

This supports dashboard cards and secondary views without loading full brain/doc data.

---

## 11.4 POST /v1/projects/:projectId/dashboard/refresh
Manager-only internal/admin route to force refresh snapshot.

### Response
- `queued`
- `scope`
- `snapshotId`
- `computedAt`

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
