# Orchestra Environment and Deployment

## 1. Purpose

This document defines the **runtime, environment, and deployment model** for the current Orchestra backend.

It is written for backend engineers, DevOps, and coding agents.

The current Orchestra backend is expected to support:
- Product Brain
- Socrates
- Live Doc Viewer
- Dashboard
- document ingestion and parsing
- retrieval with pgvector
- communication ingestion
- page-aware AI answers
- living-spec updates with provenance

This file defines:
- required infrastructure
- service topology
- environment variables
- local development rules
- staging/production rules
- security constraints
- observability expectations

---

## 2. Recommended stack

## 2.1 Application runtime
- Node.js
- TypeScript
- Fastify

## 2.2 Primary database
- PostgreSQL
- `pgvector` extension enabled

## 2.3 ORM
- Prisma

## 2.4 Queue and short-lived cache
- Redis
- BullMQ for worker jobs

## 2.5 File/object storage
- S3-compatible storage
- local filesystem storage allowed only in development

## 2.6 AI providers
- **Reasoning:** Anthropic Claude Sonnet 4
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Optional transcription:** Whisper or equivalent

## 2.7 Streaming / realtime
- SSE for Socrates answer streaming
- optional project-scoped SSE/WebSocket for job and snapshot invalidation events

---

## 3. Recommended production topology

Use separate deployable units.

```text
[Frontend]
    ↓
[API service]
    ├─ PostgreSQL + pgvector
    ├─ Redis
    ├─ S3-compatible storage
    └─ external AI providers

[Worker service]
    ├─ same codebase, worker entrypoint
    ├─ Redis / BullMQ
    ├─ PostgreSQL + pgvector
    └─ S3-compatible storage
```

## 3.1 API service responsibilities
- serve HTTP API
- auth
- route handling
- SSE Socrates streaming
- read models
- queueing jobs

## 3.2 Worker service responsibilities
- document parsing
- chunking/embedding
- Product Brain rebuild jobs
- communication sync jobs
- suggestion precompute
- dashboard snapshot refresh

## 3.3 Why split API and worker
- prevents long-running jobs from blocking API throughput
- simplifies autoscaling
- simplifies operational debugging
- makes retries and concurrency safer

---

## 4. Environment matrix

## 4.1 Local development
Intended for:
- solo backend dev
- fast iteration
- local parsing/testing
- mocked or real AI providers

### Local characteristics
- local file storage allowed
- relaxed CORS allowed
- inline test credentials allowed for connectors only in dev
- seeded/dev auth mode optional only if explicitly isolated from production

## 4.2 Staging
Intended for:
- integration testing
- frontend/backend contract testing
- connector validation
- performance sanity checks

### Staging characteristics
- real Postgres + pgvector
- real Redis
- S3-compatible storage preferred
- real auth flow preferred
- real AI provider keys preferred
- no dev auth shortcuts

## 4.3 Production
Intended for:
- customer-facing usage

### Production characteristics
- HTTPS only
- no dev auth mode
- no local storage
- secrets from managed secret store
- structured logs + tracing + error reporting
- queue monitoring enabled
- signed URLs for file access when raw files are exposed

---

## 5. Required environment variables

## 5.1 App runtime
- `NODE_ENV`
- `PORT`
- `HOST`
- `LOG_LEVEL`
- `APP_BASE_URL`
- `CORS_ALLOWED_ORIGINS`

## 5.2 Database
- `DATABASE_URL`
- `DIRECT_URL` (optional but recommended for migrations)

## 5.3 Redis / queue
- `REDIS_URL`
- `QUEUE_PREFIX` optional
- `JOB_CONCURRENCY_PARSE` optional
- `JOB_CONCURRENCY_BRAIN` optional
- `JOB_CONCURRENCY_COMMUNICATION` optional
- `JOB_CONCURRENCY_DASHBOARD` optional

## 5.4 Storage
- `STORAGE_DRIVER` = `local | s3`
- `STORAGE_LOCAL_ROOT` (dev only)
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` if non-AWS
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` optional
- `SIGNED_URL_TTL_SECONDS`

## 5.5 Auth
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_REFRESH_TTL`
- `PASSWORD_HASH_COST`

## 5.6 AI
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL_REASONING` default `claude-3-7-sonnet` or current chosen Sonnet 4 identifier
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL` default `text-embedding-3-small`
- `OPENAI_TRANSCRIPTION_MODEL` optional

## 5.7 Retrieval
- `RETRIEVAL_TOP_K`
- `RETRIEVAL_MIN_SCORE`
- `RETRIEVAL_USE_HYBRID`
- `RETRIEVAL_DOC_WEIGHT`
- `RETRIEVAL_COMM_WEIGHT`
- `RETRIEVAL_ACCEPTED_TRUTH_BOOST`

## 5.8 Connector credentials / OAuth
- Slack client id/secret + signing secret
- Google OAuth client id/secret
- WhatsApp Business app credentials as needed
- provider webhook verification tokens if relevant

## 5.9 Rate limiting and security
- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_REDIS_PREFIX`
- `MAX_FILE_SIZE_BYTES`
- `URL_FETCH_MAX_BYTES`
- `URL_FETCH_MAX_REDIRECTS`

## 5.10 Observability
- `SENTRY_DSN`
- `OTEL_EXPORTER_OTLP_ENDPOINT` optional
- `METRICS_ENABLED`

---

## 6. Example local .env

```bash
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=debug
APP_BASE_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3001

DATABASE_URL=postgresql://orchestra:orchestra@localhost:5432/orchestra
DIRECT_URL=postgresql://orchestra:orchestra@localhost:5432/orchestra

REDIS_URL=redis://localhost:6379
QUEUE_PREFIX=orchestra

STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=./storage
SIGNED_URL_TTL_SECONDS=3600

JWT_ACCESS_SECRET=dev_access_secret
JWT_REFRESH_SECRET=dev_refresh_secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
PASSWORD_HASH_COST=12

ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL_REASONING=claude-sonnet-4
OPENAI_API_KEY=...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

RETRIEVAL_TOP_K=8
RETRIEVAL_MIN_SCORE=0.2
RETRIEVAL_USE_HYBRID=true
RETRIEVAL_DOC_WEIGHT=1.0
RETRIEVAL_COMM_WEIGHT=0.8
RETRIEVAL_ACCEPTED_TRUTH_BOOST=1.2

MAX_FILE_SIZE_BYTES=104857600
URL_FETCH_MAX_BYTES=5242880
URL_FETCH_MAX_REDIRECTS=5
```

---

## 7. Local development bootstrap

## 7.1 Required services locally
- Postgres with pgvector
- Redis
- API service
- Worker service

## 7.2 Suggested local startup order
1. start Postgres
2. enable pgvector extension
3. start Redis
4. run Prisma migrations
5. start API server
6. start worker server
7. optionally seed dev org/user/project

## 7.3 Local storage rules
- allowed only in dev
- must write under configured safe root
- never assume local storage path behavior in production code

---

## 8. Production safety rules

## 8.1 No dev auth in production
If a dev-header auth mode exists for local iteration, production boot must fail if it is enabled.

## 8.2 No local file storage in production
Production must fail fast if `STORAGE_DRIVER=local`.

## 8.3 No wildcard CORS in production
CORS must be explicit.

## 8.4 No plaintext connector credentials in DB
Use a secret manager or encrypted credential references.

## 8.5 Signed file access
If raw files need direct access:
- use signed URLs
- short TTL
- per-resource validation

## 8.6 Client-safe projections only
Client routes must be filtered server-side, never by frontend convention only.

---

## 9. Queue design and worker deployment

## 9.1 Core job types for current product
- `parse_document`
- `chunk_document`
- `embed_document_chunks`
- `generate_source_package`
- `generate_clarified_brief`
- `generate_brain_graph`
- `generate_product_brain`
- `sync_communication_connector`
- `classify_message_insights`
- `precompute_socrates_suggestions`
- `refresh_dashboard_snapshot`

## 9.2 Worker rules
- jobs must be idempotent where possible
- use stable idempotency keys
- retries must not duplicate source docs/messages
- long-running jobs must be auditable
- failures must be visible to the API/UI through state rows or job history

## 9.3 Concurrency guidance
Recommended separate concurrency groups:
- document parse jobs
- embedding jobs
- AI generation jobs
- connector sync jobs
- snapshot refresh jobs

---

## 10. Realtime guidance

## 10.1 Socrates streaming
Use SSE for streamed assistant responses.

## 10.2 Operational invalidation events
Optional project-scoped event feed can be used for:
- document processing completion
- connector sync completion
- dashboard snapshot refresh
- accepted change applied
- suggestion invalidation

## 10.3 Do not require realtime for correctness
The product should still work if realtime is unavailable.

---

## 11. Recommended hosting options

## 11.1 Good simple stack
- API + worker on Railway / Render / Fly
- Postgres + pgvector on Supabase / Neon / self-hosted Postgres
- Redis via Upstash / self-hosted
- S3-compatible storage via AWS S3 / Cloudflare R2 / Supabase Storage

## 11.2 Why this works
- small team friendly
- fast to ship
- good enough for early production
- avoids premature infra complexity

---

## 12. Observability requirements

## 12.1 Logging
- structured JSON logs
- request id on every request
- job id on every job log
- project id/session ids where relevant
- do not log raw secrets or full tokens

## 12.2 Error tracking
Use Sentry or equivalent.

Capture:
- unhandled API exceptions
- worker failures
- connector failures
- invalid state transitions

## 12.3 Metrics
At minimum measure:
- request latency by route
- job duration by job type
- Socrates first-token latency
- Socrates total answer latency
- document parse duration
- chunk/embedding duration
- connector sync duration
- dashboard refresh duration
- queue depth

## 12.4 Audit trail
Ensure important actions land in `audit_events`, such as:
- document uploads
- brain rebuilds
- connector changes
- accepted/rejected spec changes
- accepted/rejected decisions
- membership changes
- client-share/token events

---

## 13. Backups and retention

## 13.1 Database backups
- daily full backup minimum
- PITR preferred for production

## 13.2 Object storage retention
- keep original source files
- versioning recommended if storage provider supports it

## 13.3 Message retention
Unless product policy changes, retain normalized messages because provenance depends on them.

## 13.4 Job retention
Keep completed job metadata for operational debugging for a reasonable rolling window.

---

## 14. Deployment pipeline guidance

## 14.1 CI should run
- typecheck
- lint
- unit tests
- integration tests where available
- schema validation tests
- API contract tests

## 14.2 CD rules
- migrations run before app promotion
- worker and API must be compatible with current schema before rollout
- blue/green or rolling deploy preferred if feasible

---

## 15. Production checklist

Before first production use, confirm:
- Postgres has pgvector enabled
- Redis available and durable enough for current needs
- S3/R2 bucket configured
- JWT secrets set
- Anthropic/OpenAI keys set
- CORS explicit
- no dev auth mode
- no local storage mode
- migrations applied
- worker running
- Sentry/logging wired
- dashboard refresh jobs working
- connector secrets stored safely

---

## 16. What not to build into deployment right now

Do not overcomplicate infra with:
- microservices for every module
- separate vector DB if Postgres + pgvector is enough
- mandatory WebSocket infrastructure for everything
- overengineered event buses
- multi-region active/active before the product needs it

The current product is strong with:
- one API service
- one worker service
- one Postgres
- one Redis
- one S3-compatible storage layer

---

## 17. Final deployment rule

If a deployment setup makes it harder to preserve provenance, auditability, and correctness, it is the wrong setup for Orchestra.
