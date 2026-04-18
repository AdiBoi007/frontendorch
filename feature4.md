# Feature 4: Dashboard

## 1. Purpose
Feature 4 implements Orchestra’s minimal awareness and operating surface. It is a snapshot-backed read model over existing Product Brain, document, change, and membership state. It answers:

- what projects exist
- how people are allocated
- which projects need attention
- whether source material and Product Brain truth are fresh
- where to go next in Brain and Docs

Dashboard is not a source of truth. It reflects truth movement from Feature 1, notifies about pressure, and gives quick navigation into Feature 3 and Product Brain.

## 2. Product role in Orchestra
Dashboard is the top-level operating surface for managers and project-scoped awareness surface for assigned devs.

- `general` scope: org-wide awareness, manager-only
- `project` scope: one-project operating snapshot, manager + assigned devs

It stays intentionally light. There are no BI-heavy charts, no task board behavior, no finance engine, and no HR scheduling engine.

## 3. Exact scope
Implemented:

- org-wide dashboard snapshot
- project dashboard snapshot
- team summary read model
- deterministic workload labels
- deterministic attention labels
- deterministic Product Brain freshness labels
- document readiness summary
- quick links into Brain and Docs
- snapshot refresh job
- refresh hooks from project/doc/truth/change transitions
- Socrates-compatible dashboard snapshot retrieval source

Not implemented:

- charts/graphs beyond basic frontend card/list payloads
- timesheets or calendar scheduling
- client-facing dashboard routes
- separate analytics warehouse

## 4. Core internal objects

- `dashboard_snapshots`: persisted snapshot rows keyed by `org_id`, `scope`, and optional `project_id`
- `job_runs`: auditable refresh jobs for dashboard snapshots
- `project_members`: allocation/workload source
- `document_versions`: source readiness / processing state source
- `artifact_versions` (`product_brain` accepted version): current-truth freshness source
- `spec_change_proposals`: pending and recent accepted change pressure source
- `decision_records`: open/accepted decision pressure source

## 5. Data model actually used

### `dashboard_snapshots`
- `id`
- `org_id`
- `project_id` nullable
- `scope` = `general | project`
- `payload_json`
- `computed_at`

Indexes:
- `(org_id, scope, computed_at desc)`
- `(project_id, scope, computed_at desc)`

### Source fields reused

- `project_members.project_role`
- `project_members.role_in_project`
- `project_members.allocation_percent`
- `project_members.weekly_capacity_hours`
- `document.current_version_id`
- `document_versions.status`
- `document_versions.processed_at`
- `artifact_versions.artifact_type=product_brain`, `status=accepted`, `accepted_at`
- `spec_change_proposals.status`, `accepted_at`
- `decision_records.status`, `accepted_at`

## 6. Public API

### `GET /v1/dashboard/general`
Manager-only. Returns the latest fresh general snapshot or rebuilds inline when missing/stale or when `forceRefresh=true`.

### `GET /v1/projects/:projectId/dashboard`
Manager + assigned devs only. Returns the latest fresh project snapshot or rebuilds inline when missing/stale or when `forceRefresh=true`.

### `GET /v1/projects/:projectId/team-summary`
Manager + assigned devs only. Returns the team-only projection derived from the project dashboard snapshot.

### `POST /v1/projects/:projectId/dashboard/refresh`
Manager-only. Forces a project snapshot rebuild immediately and returns `snapshotId` + `computedAt`.

## 7. Snapshot model

Dashboard is snapshot-backed rather than route-time heavy join backed.

Read path:
1. Route validates access.
2. Service loads the latest snapshot for `general` or `project`.
3. If the snapshot is newer than 5 minutes and no force-refresh was requested, return it.
4. Otherwise rebuild inline, persist, and return the new payload.

Persist behavior:
- if the latest snapshot payload is byte-for-byte identical to the newly built payload, the service updates `computed_at` on the existing row instead of creating a duplicate row
- if the payload changed, a new snapshot row is created

This keeps repeated refreshes idempotent without turning snapshots into immutable truth artifacts.

## 8. General dashboard payload

Top-level shape:

```json
{
  "scope": "general",
  "organization": { "id": "...", "name": "...", "slug": "..." },
  "computedAt": "ISO timestamp",
  "summary": {
    "activeProjectCount": 3,
    "orgHeadcount": 7,
    "orgRoleBreakdown": { "manager": 2, "dev": 5 },
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
      "stale": 0,
      "blocked": 1
    }
  },
  "projects": [],
  "quickLinks": { "projects": [] }
}
```

Each project card includes:
- headcount and role breakdown
- workload summary
- doc readiness summary
- Product Brain freshness summary
- change + decision pressure
- deterministic attention bucket
- movement label `fast | steady | slow`
- quick links

## 9. Project dashboard payload

Top-level shape:

```json
{
  "scope": "project",
  "computedAt": "ISO timestamp",
  "project": {},
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

It intentionally stays card-friendly:
- no raw joins dumped to the frontend
- no per-chunk evidence details
- enough data to route the user into Brain or Docs quickly

## 10. Workload model

Per-member workload label derives only from `allocation_percent`:

- `overloaded`: `> 100`
- `watch`: `>= 80`
- `normal`: `< 80`
- `unknown`: `null`

Project team workload summary:
- `attention` if any member is overloaded
- `watch` if no overload but at least one member is in watch
- `unknown` if every member has unknown allocation
- `healthy` otherwise

Org-level overloaded members are computed by summing active project allocations per user across projects.

## 11. Document readiness model

Per-project document readiness is computed from the effective current version for each document:
- use `document.current_version_id` when available
- otherwise use the latest document version

Counts tracked:
- `pending`
- `processing`
- `ready`
- `partial`
- `failed`

Readiness state:
- `empty`: no documents
- `blocked`: failed docs and no ready/partial docs
- `processing`: any pending/processing docs
- `watch`: some failed docs but there is still ready/partial coverage
- `ready`: no blocking or in-flight doc work

## 12. Product Brain freshness model

Dashboard does not invent freshness. It derives it from:
- latest accepted `product_brain`
- latest processed document version time
- latest accepted change time
- latest accepted decision time

Freshness states:
- `blocked`: no accepted brain and no usable source readiness
- `processing`: document processing is in flight
- `stale`: accepted truth exists but newer docs/accepted changes/accepted decisions exist, or brain age exceeds 14 days
- `current`: none of the stale/blocked/processing conditions apply

## 13. Attention model

Attention is deterministic, additive, and explainable.

Inputs:
- failed documents
- processing documents
- pending changes
- open decisions
- overloaded/watch members
- no ready source docs
- Product Brain freshness state

Output:
- numeric `score`
- bucket `healthy | watch | attention`
- human-readable `reasons[]`

This is intentionally not an ML model.

## 14. Refresh / invalidation

Job name:
- `refresh_dashboard_snapshot`

Refresh helper:
- `src/lib/dashboard/refresh.ts`

Triggered from:
- project creation
- document upload
- document reprocess
- successful parse/chunk/embed completion to ready state
- parse failure / partial state changes
- product brain accepted version generation
- change proposal create / accept / reject
- accepted change application

Behavior:
- enqueue both project + general refresh for project-scoped state changes
- use `job_runs` for auditable pending/running/completed tracking
- real worker mode and inline mode both supported

## 15. Feature interaction

### Feature 1
Dashboard reads:
- project membership and allocations
- document version readiness
- accepted Product Brain artifact version
- change proposals and decisions

It does not mutate Product Brain or documents.

### Feature 2
Dashboard snapshots are retrieval candidates for Socrates via `dashboard_snapshot`.

`hybrid.ts` now chooses:
- general dashboard snapshot for `dashboard_general`
- project dashboard snapshot for `dashboard_project`

### Feature 3
Dashboard quick links return Brain and Doc paths plus viewer-state hints so the frontend can launch directly into:
- `/projects/:projectId/brain/current`
- `/projects/:projectId/documents`
- `/projects/:projectId/documents/:documentId/view`

## 16. Role and security rules

- general dashboard: manager only
- project dashboard: manager + assigned devs
- clients are explicitly rejected from dashboard routes
- all filtering is server-side
- no client-safe dashboard projection exists yet

## 17. Jobs and workers

Added:
- `refresh_dashboard_snapshot`

Inline mode:
- handled in `src/setup-context.ts`

BullMQ worker mode:
- handled in `src/worker.ts`

## 18. Implementation map

- `src/modules/dashboard/service.ts`
- `src/modules/dashboard/routes.ts`
- `src/modules/dashboard/schemas.ts`
- `src/lib/dashboard/refresh.ts`
- `src/app/build-app.ts`
- `src/setup-context.ts`
- `src/worker.ts`
- `src/lib/jobs/types.ts`
- `src/lib/jobs/keys.ts`
- `prisma/schema.prisma`
- `prisma/migrations/0007_dashboard_snapshot_project_index/migration.sql`

## 19. Tests

Added/updated:
- `tests/dashboard-service.test.ts`
- `tests/routes.test.ts`

Coverage now includes:
- general snapshot build
- project snapshot build
- attention / freshness derivation
- route-level role enforcement
- team summary route
- manager-only refresh route

## 20. Production notes

What is production-ready at the application layer:
- snapshot-backed reads
- deterministic scoring/freshness
- auditable refresh jobs
- integration with Product Brain and Socrates
- stable frontend-friendly payloads

Still intentionally deferred:
- client-facing dashboard summary routes
- chart-heavy analytics
- calendar/scheduling
- financial reporting
- infra-backed staging validation against live Postgres/Redis
