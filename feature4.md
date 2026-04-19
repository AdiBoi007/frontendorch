# Feature 4: Dashboard

## 1. Feature name and purpose
Feature 4 is `Dashboard`.

It is Orchestra's minimal awareness and operating surface. It does not create truth. It reads current state from Feature 1, summarizes operational pressure deterministically, and gives managers and assigned developers a fast way to answer:

- what projects exist
- how people are allocated
- which projects need attention
- whether source material and Product Brain are fresh
- where to go next in Brain and Docs

## 2. Product role of Feature 4 in Orchestra
Dashboard is the top-level operating read surface above Product Brain, Live Doc Viewer, and Socrates.

It exists in two scopes:

- `general`: org-wide awareness for managers
- `project`: one-project operating summary for managers and assigned devs

Feature 4 is intentionally small. It is not a source of truth, not a BI system, and not an HR or scheduling product. It reflects truth movement from Feature 1 and exposes navigation into Feature 3 and the Brain surface.

## 3. Exact scope of Feature 4
Implemented:

- org-wide dashboard snapshot
- project dashboard snapshot
- project team-summary read model
- deterministic workload labels
- deterministic attention scoring
- deterministic Product Brain freshness states
- document readiness summaries
- quick links into Brain and Docs
- project and general snapshot refresh logic
- job-backed refresh path
- refresh hooks from project, document, Product Brain, and accepted-change transitions
- Socrates retrieval compatibility for dashboard contexts

Not implemented:

- client-facing dashboard surface
- chart-heavy analytics
- timesheets or calendar scheduling
- finance/accounting reporting
- workforce planning beyond simple allocation labels

## 4. What Feature 4 is NOT
Feature 4 is not:

- a source-of-truth system
- a replacement for Product Brain
- a task board
- a delivery control tower
- a finance dashboard
- an HR platform
- a dense analytics/BI layer
- a place to review or accept changes

If the dashboard becomes chart-heavy, opaque, or operationally noisy, it is wrong.

## 5. User-facing outcomes
General dashboard lets a manager see:

- active project count
- active project list
- org headcount
- org role mix
- cross-project allocation pressure
- which projects need attention first
- whether the org has stale or blocked Product Brain state

Project dashboard lets a manager or assigned dev see:

- project identity and status
- current team shape
- member allocations and workload labels
- document readiness
- Product Brain freshness
- pending or recently accepted change pressure
- open decision pressure
- quick launch into Brain and Docs

## 6. Core internal objects
Feature 4 uses these internal objects:

- `dashboard_snapshots`
- `job_runs`
- `projects`
- `project_members`
- `documents`
- `document_versions`
- `artifact_versions` for accepted `product_brain`
- `spec_change_proposals`
- `decision_records`
- `audit_events`

No separate analytics warehouse or denormalized fact store is introduced.

## 7. Data model used by Feature 4

### `dashboard_snapshots`
Persisted snapshot rows.

| Column | Purpose |
| --- | --- |
| `id` | Snapshot identity |
| `org_id` | Owning organization |
| `project_id` | Nullable for `general`, set for `project` |
| `scope` | `general` or `project` |
| `payload_json` | Full read-model payload returned to frontend |
| `computed_at` | Snapshot computation timestamp |

Indexes used:

- `@@index([orgId, scope, computedAt(sort: Desc)])`
- `@@index([projectId, scope, computedAt(sort: Desc)])`

### Source data reused

#### `projects`
- `id`
- `org_id`
- `name`
- `slug`
- `status`
- `description`
- `preview_url`

#### `project_members`
- `project_role`
- `role_in_project`
- `allocation_percent`
- `weekly_capacity_hours`
- `is_active`

#### `documents`
- `current_version_id`
- `visibility`

#### `document_versions`
- `status`
- `processed_at`
- `created_at`

#### `artifact_versions`
- `artifact_type = product_brain`
- `status = accepted`
- `version_number`
- `accepted_at`
- `created_at`

#### `spec_change_proposals`
- `status`
- `accepted_at`
- `summary`

#### `decision_records`
- `status`
- `accepted_at`
- `title`

#### `job_runs`
- refresh lifecycle auditability for `refresh_dashboard_snapshot`

## 8. API routes used by Feature 4

### `GET /v1/dashboard/general`
Manager-only.

Query:

- `forceRefresh?: boolean`

Behavior:

1. validate auth and manager role
2. load latest general snapshot for the org
3. if snapshot is fresh and `forceRefresh=false`, return it
4. otherwise rebuild inline
5. if rebuild fails and a prior snapshot exists, serve the stale snapshot instead of failing hard

### `GET /v1/projects/:projectId/dashboard`
Manager or assigned dev only.

Query:

- `forceRefresh?: boolean`

Behavior mirrors `general`, but is project-scoped.

### `GET /v1/projects/:projectId/team-summary`
Manager or assigned dev only.

Returns only the `teamSummary` fragment from the project snapshot.

### `POST /v1/projects/:projectId/dashboard/refresh`
Manager-only.

Forces an immediate project snapshot rebuild and returns:

- `queued`
- `scope`
- `snapshotId`
- `computedAt`

Public general refresh route is not exposed.

## 9. Full general-dashboard flow
Flow:

1. Route validates JWT and requires manager role.
2. `DashboardService.getGeneralDashboard()` is called with `orgId`, `actorUserId`, and `forceRefresh`.
3. Service reads latest `dashboard_snapshots` row for `scope=general` and `project_id IS NULL`.
4. If snapshot age is <= 5 minutes and `forceRefresh=false`, return cached payload.
5. Otherwise service rebuilds from live source tables:
   - active projects only
   - active users in org
   - active project members
   - document readiness per project
   - latest accepted Product Brain per project
   - pending/recent accepted change proposals
   - open/accepted decisions
6. Service computes project cards, org-wide allocation summary, pressure summary, and freshness counts.
7. Snapshot is persisted:
   - if payload is unchanged, only `computed_at` is updated
   - if payload changed, a new snapshot row is inserted
8. Audit event `dashboard_general_opened` is written.
9. Telemetry counters/histograms are emitted.

Returned general payload:

```json
{
  "scope": "general",
  "organization": {
    "id": "uuid",
    "name": "Acme Studio",
    "slug": "acme-studio"
  },
  "computedAt": "2026-04-19T01:02:03.000Z",
  "summary": {
    "activeProjectCount": 3,
    "orgHeadcount": 9,
    "orgRoleBreakdown": {
      "manager": 2,
      "dev": 7
    },
    "projectMemberDistribution": [],
    "overloadedMembers": [],
    "overloadedCount": 1,
    "watchCount": 2,
    "projectsNeedingAttention": [],
    "changePressure": {
      "pendingCount": 4,
      "recentAcceptedCount": 2,
      "openDecisionCount": 1
    },
    "brainFreshness": {
      "current": 1,
      "processing": 1,
      "stale": 1,
      "blocked": 0
    }
  },
  "projects": [],
  "quickLinks": {
    "projects": []
  }
}
```

## 10. Full project-dashboard flow
Flow:

1. Route validates JWT.
2. `ProjectService.ensureProjectAccess()` verifies membership.
3. `DashboardService.assertProjectDashboardRole()` denies clients.
4. Service loads latest project snapshot.
5. If fresh, return it. If stale/missing, rebuild inline. If rebuild fails and an older snapshot exists, return the older snapshot.
6. Project rebuild reads:
   - project metadata
   - active members
   - documents and their current/latest versions
   - accepted Product Brain artifact
   - pending/recent accepted change proposals
   - open/accepted decisions
7. Service computes:
   - `teamSummary`
   - `documents`
   - `brain`
   - `changes`
   - `decisions`
   - `attention`
   - `quickLinks`
   - `recentActivity`
8. Snapshot is persisted with the same duplicate-suppression rules as general.
9. Audit event `dashboard_project_opened` is written.

Returned project payload:

```json
{
  "scope": "project",
  "computedAt": "2026-04-19T01:02:03.000Z",
  "project": {
    "id": "uuid",
    "orgId": "uuid",
    "name": "Apollo",
    "slug": "apollo",
    "status": "active",
    "description": "Client delivery project",
    "previewUrl": null,
    "memberCount": 4,
    "documentCount": 3
  },
  "teamSummary": {},
  "documents": {},
  "brain": {},
  "changes": {},
  "decisions": {},
  "attention": {},
  "quickLinks": {},
  "recentActivity": {}
}
```

## 11. Snapshot/read-model architecture
Dashboard is snapshot-backed, not request-join-heavy.

### Read path
- find latest snapshot by `(orgId, scope)` or `(orgId, projectId, scope)`
- use snapshot if age <= `SNAPSHOT_STALE_MS` and not forced
- otherwise rebuild inline and persist

### Rebuild path
- aggregate from current source tables
- compute deterministic read model
- persist snapshot

### Duplicate behavior
- identical payloads do not create duplicate rows
- service updates `computed_at` on the latest row instead

### Fallback behavior
- if rebuild fails and an earlier snapshot exists, service returns the earlier snapshot
- fallback is instrumented through telemetry
- if no prior snapshot exists, error is returned

### Freshness metadata
- every payload includes top-level `computedAt`
- snapshot staleness is inferred from `computedAt` + client-side time if needed

## 12. Pressure / attention scoring model
Attention is deterministic and explainable.

Inputs:

- failed documents
- processing/pending documents
- pending change proposals
- open decisions
- overloaded members
- watch members
- no ready source documents
- Product Brain freshness state

Scoring rules in `buildAttention()`:

- failed docs: `+4`
- processing docs: `+2`
- pending changes: `+1` each, capped at `+4`
- open decisions: `+1` each, capped at `+3`
- overloaded members: `+2` each, capped at `+4`
- watch members when no overloads: `+1` each, capped at `+2`
- no ready source docs with non-zero total docs: `+3`
- Product Brain `blocked`: `+4`
- Product Brain `stale`: `+3`
- Product Brain `processing`: `+1`

Output:

- `score`
- `label`
- `reasons[]`

Label thresholds:

- `attention` if `score >= 7`
- `watch` if `score >= 3`
- `healthy` otherwise

This is intentionally not machine learned.

## 13. Freshness model
Brain freshness is computed in `buildBrainFreshness()`.

States:

- `blocked`
- `processing`
- `stale`
- `current`

Rules:

1. if no accepted brain and no docs, `blocked`
2. if no accepted brain and no ready/partial docs, `blocked`
3. if any docs are pending/processing, `processing`
4. if no accepted brain but usable docs exist, `blocked`
5. if latest ready/partial document processing time is newer than the accepted Product Brain timestamp, `stale`
6. if accepted change or accepted decision is newer than the accepted Product Brain timestamp, `stale`
7. if accepted Product Brain is older than 14 days, `stale`
8. otherwise `current`

`acceptedAt` uses `artifact.acceptedAt` when available, otherwise `artifact.createdAt`.

## 14. Document readiness model
Document readiness is computed per project in `buildDocumentReadiness()`.

For each document:

- use `document.currentVersionId` when present
- otherwise fall back to the latest version

Tracked counts:

- `pending`
- `processing`
- `ready`
- `partial`
- `failed`

Derived readiness states:

- `empty`: zero documents
- `blocked`: failed docs and no ready/partial docs
- `processing`: any pending/processing docs
- `watch`: there are failed docs but at least one ready/partial doc exists
- `ready`: no failures and nothing in flight

`latestProcessedAt` is the max `processedAt` of effective document versions.

## 15. Role filtering / authorization model

### General dashboard
- manager only
- enforced in route with `requireManager(request)`

### Project dashboard
- manager or assigned dev only
- enforced by `ensureProjectAccess()` and `assertProjectDashboardRole()`

### Clients
- clients are denied from all dashboard routes in the current implementation
- there is no client-safe dashboard projection route yet

### Server-side only
All role enforcement is backend-side. There is no trust in frontend-only hiding.

## 16. Interaction with Feature 1
Dashboard consumes Feature 1 state directly:

- documents and document versions for readiness
- accepted `product_brain` artifact version for freshness
- change proposals and decisions for pressure
- project membership for headcount and allocations

Refresh hooks already exist in Feature 1 mutation paths:

- project creation
- document upload
- document reprocess / processing state transitions
- accepted Product Brain generation
- accepted/rejected change proposal transitions

Dashboard does not mutate Product Brain or source evidence.

## 17. Interaction with Feature 2
Dashboard snapshots are retrievable by Socrates.

`hybridRetrieve()` treats dashboard as its own retrieval source:

- `pageContext = dashboard_general` -> retrieve latest general snapshot
- `pageContext = dashboard_project` -> retrieve latest project snapshot

Dashboard facts are therefore usable in dashboard-context Socrates answers without forcing Socrates to recompute dashboard joins itself.

Dashboard quick links also include Socrates-compatible viewer-state hints:

- `docViewerState` uses `pageContext: "doc_viewer"`
- `brainViewerState` uses `pageContext: "brain_overview"` and `selectedRefType: "dashboard_scope"`

## 18. Interaction with Feature 3
Dashboard quick links are designed to open Feature 3 and Brain surfaces safely:

- `dashboardPath`
- `brainPath`
- `documentsPath`
- `docViewerPath`
- `docViewerState`

`docViewerPath` points at the newest document in the project list order if one exists.

Document readiness counts are computed from real `documents` and `document_versions`, so Feature 3's actual viewable document state and Dashboard's readiness cards stay aligned.

## 19. Jobs and refresh/invalidation rules

### Job name
- `refresh_dashboard_snapshot`

### Enqueue helper
- `src/lib/dashboard/refresh.ts`

### Job payload

```json
{
  "scope": "general | project",
  "orgId": "uuid",
  "projectId": "uuid | null",
  "reason": "string",
  "idempotencyKey": "string"
}
```

### Idempotency
- queue key built from `scope`, target id, reason, and minute bucket
- `job_runs` is upserted on enqueue and on execution
- duplicate refreshes for the same target/reason/window collapse naturally

### Execution
- inline mode: `setup-context.ts`
- worker mode: `worker.ts`

### Status lifecycle
- enqueue: `pending`
- job start: `running`
- success: `completed`
- failure: `failed`

### Refresh triggers currently wired
- project created
- document uploaded
- document processing lifecycle changes
- accepted Product Brain generation
- change proposal create/accept/reject
- accepted change application

There is no separate cron-based fallback job in the current implementation. Staleness-based inline rebuild is the fallback.

## 20. Tech stack used
- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Redis
- BullMQ
- structured JSON snapshots in PostgreSQL

## 21. Libraries/packages/services used
- `@prisma/client`
- Fastify route registration and auth middleware
- Zod for route query/param validation
- internal `AuditService`
- internal `ProjectService`
- internal telemetry service
- internal job dispatcher abstraction

## 22. Validation and security rules
- all routes require auth
- general dashboard requires manager role
- project dashboard requires project membership
- clients are blocked from dashboard routes
- route inputs are validated with Zod:
  - `projectId` must be UUID
  - `forceRefresh` is boolean-coerced
- snapshot refresh job requires `projectId` for project scope
- org/project scoping is always enforced server-side

## 23. Error handling and edge cases

### Snapshot missing
- service rebuilds inline

### Snapshot stale
- service rebuilds inline unless fresh enough

### Snapshot rebuild fails with older snapshot available
- service returns older snapshot instead of failing hard
- fallback is tracked with telemetry

### Snapshot rebuild fails with no older snapshot
- request fails

### No Product Brain and no usable docs
- brain freshness becomes `blocked`

### Pending docs after accepted brain
- brain freshness becomes `processing`

### Failed docs with no ready docs
- document readiness becomes `blocked`

### Null allocations
- workload label becomes `unknown`

### Repeated identical snapshot rebuild
- latest snapshot row `computed_at` is updated instead of creating a duplicate row

## 24. Testing strategy
Current tests cover:

- general dashboard snapshot build
- project dashboard snapshot build
- blocked/processing freshness states
- attention from failed docs, pending changes, open decisions, and overload
- active-project-only aggregation semantics
- stale snapshot fallback behavior
- manager-only general dashboard route
- manager/dev project dashboard route behavior
- manager-only refresh route
- team-summary route
- refresh job lifecycle

Primary files:

- `tests/dashboard-service.test.ts`
- `tests/routes.test.ts`

The tests are mostly service-level and route-contract level. They validate deterministic aggregation logic and role enforcement without needing full infra-backed integration.

## 25. Production-readiness notes
Production-ready at the application layer:

- snapshot-backed dashboard reads
- deterministic freshness and pressure logic
- auditable refresh jobs
- stale-snapshot fallback on rebuild failure
- server-side role enforcement
- Socrates retrieval compatibility

Still not included in this feature:

- live infra-backed staging validation against real Postgres/Redis
- client-safe dashboard route
- periodic scheduled recompute beyond stale-on-read + write-triggered refresh
- advanced observability exporters beyond current audit + telemetry hooks

## 26. How the feature was actually implemented in this repo
Implementation centers on `DashboardService`.

Main methods:

- `getGeneralDashboard()`
- `getProjectDashboard()`
- `getProjectTeamSummary()`
- `refreshProjectDashboard()`
- `refreshSnapshotJob()`

Important helpers:

- `buildGeneralDashboardPayload()`
- `buildProjectDashboardPayload()`
- `buildProjectCard()`
- `buildTeamSummary()`
- `buildDocumentReadiness()`
- `buildBrainFreshness()`
- `buildChangeSummary()`
- `buildDecisionSummary()`
- `buildAttention()`
- `buildOrgAllocationSummary()`
- `buildProjectQuickLinks()`

The service persists snapshots directly into `dashboard_snapshots`, uses `job_runs` for refresh auditability, records dashboard-open audit events, and emits telemetry for cache hits, rebuilds, fallbacks, request durations, and snapshot build durations.

## 27. File/module map of the implementation

### Core feature files
- `src/modules/dashboard/service.ts`
- `src/modules/dashboard/routes.ts`
- `src/modules/dashboard/schemas.ts`
- `src/lib/dashboard/refresh.ts`

### Wiring
- `src/app/build-app.ts`
- `src/setup-context.ts`
- `src/worker.ts`
- `src/lib/jobs/types.ts`
- `src/lib/jobs/keys.ts`

### Data model
- `prisma/schema.prisma`
- `prisma/migrations/0007_dashboard_snapshot_project_index/migration.sql`

### Tests
- `tests/dashboard-service.test.ts`
- `tests/routes.test.ts`

### Upstream integration points
- `src/modules/projects/service.ts`
- `src/modules/documents/service.ts`
- `src/modules/brain/service.ts`
- `src/modules/changes/service.ts`
- `src/lib/retrieval/hybrid.ts`

## 28. Known limitations / intentionally deferred items
- no client-safe dashboard route yet
- no chart-heavy analytics
- no calendar/scheduling engine
- no project financials
- no scheduled background recompute loop beyond mutation-triggered refresh + stale-on-read rebuild
- no infra-backed end-to-end staging validation in this repo
