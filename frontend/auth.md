# Orchestra — Auth Source of Truth

**Version**: Extracted from implemented code.
**Covers**: Backend (`orchestrav2`) + Frontend (`orchestra-frontend`)
**Last updated**: 2026-04-23

This file is the canonical reference for every auth layer in Orchestra. If conversation context is lost, rebuild the auth system from this document.

---

## Table of Contents

1. [Auth Philosophy](#1-auth-philosophy)
2. [Identity Layer (Database)](#2-identity-layer-database)
3. [Role Model](#3-role-model)
4. [Backend Auth Routes](#4-backend-auth-routes)
5. [JWT Access Token](#5-jwt-access-token)
6. [Refresh Token Model](#6-refresh-token-model)
7. [Password Hashing](#7-password-hashing)
8. [Backend Auth Service](#8-backend-auth-service)
9. [Backend Auth Middleware](#9-backend-auth-middleware)
10. [/me Contract](#10-me-contract)
11. [Frontend Token Storage](#11-frontend-token-storage)
12. [Frontend HTTP Layer](#12-frontend-http-layer)
13. [Frontend Auth API](#13-frontend-auth-api)
14. [Frontend Auth Context](#14-frontend-auth-context)
15. [Frontend Bootstrap Flow](#15-frontend-bootstrap-flow)
16. [Login / Signup Flow](#16-login--signup-flow)
17. [Refresh-on-401 Behavior](#17-refresh-on-401-behavior)
18. [Logout Flow](#18-logout-flow)
19. [Protected Route Behavior](#19-protected-route-behavior)
20. [Role Derivation in Frontend](#20-role-derivation-in-frontend)
21. [SSE / Socrates Stream Auth](#21-sse--socrates-stream-auth)
22. [Connector OAuth (Separate Layer)](#22-connector-oauth-separate-layer)
23. [Webhook Verification (Separate Layer)](#23-webhook-verification-separate-layer)
24. [Client Share Token Auth (Feature 6)](#24-client-share-token-auth-feature-6)
25. [CORS and Origin Security](#25-cors-and-origin-security)
26. [Environment Variables](#26-environment-variables)
27. [Security Rules](#27-security-rules)
28. [Error Cases and Failure Handling](#28-error-cases-and-failure-handling)
29. [Backend Auth Tests](#29-backend-auth-tests)
30. [Production Hardening](#30-production-hardening)
31. [Known Limitations and Future Work](#31-known-limitations-and-future-work)
32. [File / Module Map](#32-file--module-map)

---

## 1. Auth Philosophy

Orchestra is a **server-first auth system**. All access control decisions are enforced on the backend. The frontend only:

- stores and transmits tokens
- gates UI navigation for UX (not security)
- reflects the server's role/user data in the shell

The backend never trusts the frontend's representation of who the user is or what role they have. Every authenticated route independently verifies the JWT and enforces role restrictions.

**Core principle**: the frontend is a presentation layer for server-authoritative state.

---

## 2. Identity Layer (Database)

### Organization

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Every user belongs to exactly one organization. Signup creates the org and the first user atomically.

### User

```prisma
model User {
  id                   String              @id @default(uuid()) @db.Uuid
  orgId                String              @db.Uuid
  email                String
  passwordHash         String?
  displayName          String
  globalRole           String              // "owner" | "admin" | "member"
  workspaceRoleDefault String              // "manager" | "dev" | "client"
  isActive             Boolean             @default(true)
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  @@unique([orgId, email])
}
```

- `passwordHash` is **never returned** to any client — stripped in `getMe()` and signup/login projections.
- `isActive: false` prevents login (the `login()` service filters `isActive: true` users only).
- `workspaceRoleDefault` determines the base role for project access.

### RefreshToken

```prisma
model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  orgId     String    @db.Uuid
  tokenHash String    @unique
  expiresAt DateTime  @db.Timestamptz(6)
  revokedAt DateTime? @db.Timestamptz(6)
  createdAt DateTime  @default(now())
}
```

- Only the **hash** of the refresh token is stored.
- `revokedAt` being set means the token is revoked.
- Lookup: hash incoming token → find by `tokenHash` → check `revokedAt` + `expiresAt`.

---

## 3. Role Model

### Global Roles (`globalRole`)

| Value | Meaning |
|-------|---------|
| `owner` | First user in an org; full admin |
| `admin` | Elevated access (future use) |
| `member` | Standard user |

### Workspace Roles (`workspaceRoleDefault`)

| Value | Capabilities |
|-------|-------------|
| `manager` | Full project access; can accept/reject proposals; manage client shares; view all comms |
| `dev` | Read brain; upload/process docs; view comms; cannot accept proposals |
| `client` | Read-only; limited to shared project surfaces; no internal data |

### Project Role vs Workspace Default

`ProjectMember.projectRole` is the per-project override. If not set, `workspaceRoleDefault` from the JWT applies. The backend always checks the most restrictive applicable role.

### Backend enforcement

Every route that needs role enforcement calls one of:

```typescript
requireManager(request)                            // manager only
requireWorkspaceRole(request, ["manager", "dev"])  // manager or dev
```

These throw `403 Forbidden` if the role in the JWT does not match.

---

## 4. Backend Auth Routes

All routes at prefix `/v1/auth`. Registered in `src/modules/auth/routes.ts`.

| Method | Path | Auth required | Body | Response |
|--------|------|--------------|------|----------|
| `POST` | `/v1/auth/signup` | No | `{ orgName, email, password, displayName }` | tokens + safe user |
| `POST` | `/v1/auth/login` | No | `{ email, password }` | tokens + safe user |
| `POST` | `/v1/auth/refresh` | No (uses refresh token in body) | `{ refreshToken }` | new tokens |
| `POST` | `/v1/auth/logout` | Yes (Bearer) | `{ refreshToken }` | `{ ok: true }` |
| `GET` | `/v1/auth/me` | Yes (Bearer) | — | safe user object |

All responses use the standard envelope:
```json
{ "data": ..., "meta": null, "error": null }
```

Errors:
```json
{ "data": null, "meta": null, "error": { "code": "...", "message": "..." } }
```

---

## 5. JWT Access Token

**Algorithm**: HS256 (via `jsonwebtoken` library)
**Secret**: `JWT_ACCESS_SECRET` (min 16 chars; `change_me` rejected in production)
**TTL**: `JWT_ACCESS_TTL` (default `"15m"`)

### Payload shape (`JwtUser`)

```typescript
interface JwtUser {
  userId: string;
  orgId: string;
  workspaceRoleDefault: "manager" | "dev" | "client";
  globalRole: "owner" | "admin" | "member";
}
```

Plus standard JWT claims: `iat`, `exp`.

- Minimal payload: no email, no display name — only identity + role needed for auth checks.
- Decoded via `request.jwtVerify()` (Fastify JWT plugin).
- Available on `request.authUser` after `requireAuth()`.

### Access token transport

All authenticated routes expect:
```
Authorization: Bearer <accessToken>
```

---

## 6. Refresh Token Model

**Algorithm**: HS256
**Secret**: `JWT_REFRESH_SECRET` (separate from access secret)
**TTL**: `JWT_REFRESH_TTL` (default `"30d"`)
**Storage**: only `SHA-256(rawToken)` stored in `RefreshToken` table.

### Lifecycle

1. **Issue**: `issueTokens()` generates access + refresh JWT, creates `RefreshToken` DB record with hash.
2. **Use**: Client sends raw refresh token in `POST /v1/auth/refresh` body.
3. **Validate**: Server hashes incoming token, looks up by hash, checks `revokedAt === null` and `expiresAt > now()`.
4. **Rotate**: Old refresh token is revoked (`revokedAt = now()`), new tokens are issued.
5. **Revoke on logout**: `logout()` sets `revokedAt` on the matching hash record.

### Security properties

- Refresh tokens are never stored in plaintext.
- A stolen-then-submitted revoked refresh token fails immediately.
- Rotation on every refresh limits the window of a stolen refresh token.
- Logout revokes server-side — no need to wait for expiry.

---

## 7. Password Hashing

**Library**: `bcryptjs`
**Cost factor**: `PASSWORD_HASH_COST` env var (default `12`, range 8–15)

```typescript
// Hash at signup
const passwordHash = await bcrypt.hash(password, rounds);

// Verify at login
const valid = await bcrypt.compare(password, storedHash);
```

- bcrypt includes the salt in the stored hash — no separate salt column needed.
- Cost factor 12 is approximately 250ms per hash on typical hardware.
- `passwordHash` field is nullable to support future OAuth-only accounts.

---

## 8. Backend Auth Service

File: `src/modules/auth/service.ts`

### `signup({ orgName, email, password, displayName })`

1. Check if email already exists across all orgs → `409 user_exists` if found.
2. Create `Organization` + `User` atomically.
3. First user always gets `globalRole: "owner"`, `workspaceRoleDefault: "manager"`.
4. Record audit event `user_signed_up`.
5. Issue access + refresh tokens.
6. Return: `{ organization, user (raw), accessToken, refreshToken }`.

Note: routes project `user` to safe fields — raw user is not sent to client.

### `login({ email, password })`

1. `findMany` where `email` + `isActive: true` — returns array, fails if count ≠ 1.
2. Check `passwordHash` exists.
3. `bcrypt.compare` → `401 invalid_credentials` on failure.
4. Issue tokens.
5. Return: `{ user (raw), accessToken, refreshToken }`.

### `refresh(refreshToken)`

1. `jwt.verify` against `JWT_REFRESH_SECRET` → throws if expired/invalid signature.
2. Hash token → find `RefreshToken` where `tokenHash` + `revokedAt: null`.
3. Check `expiresAt > now()`.
4. Revoke old record → issue new tokens.
5. Return: `{ accessToken, refreshToken }`.

### `logout(refreshToken)`

1. Hash token → `updateMany` where `tokenHash`, set `revokedAt: now()`.
2. Best-effort: if token not found, no error.

### `getMe(userId)`

1. `findUnique` by `userId`.
2. Return **safe projection only** — strips `passwordHash`, `isActive` and other internal fields.

Safe return shape:
```typescript
{
  id, orgId, email, displayName,
  globalRole, workspaceRoleDefault, createdAt
}
```

---

## 9. Backend Auth Middleware

File: `src/app/auth.ts`

```typescript
// Verify JWT + attach authUser to request
async function requireAuth(request: FastifyRequest)

// Check workspaceRoleDefault is in allowed list
function requireWorkspaceRole(request, roles: Array<"manager" | "dev" | "client">)

// Shorthand: manager only
function requireManager(request)

// Higher-order: wrap handler with requireAuth
function authGuard(handler): RouteHandler
```

`request.authUser` shape (TypeScript declaration in `src/types/fastify.d.ts`):
```typescript
interface FastifyRequest {
  authUser?: JwtUser;
  rawBody?: string;
}
```

---

## 10. /me Contract

`GET /v1/auth/me` — requires `Authorization: Bearer <accessToken>`.

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "orgId": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Smith",
    "globalRole": "owner",
    "workspaceRoleDefault": "manager",
    "createdAt": "2026-04-23T10:00:00.000Z"
  },
  "meta": null,
  "error": null
}
```

**Never returns**: `passwordHash`, `isActive`, internal DB IDs, or any internal field.

The frontend calls `/me` during bootstrap to hydrate the `AuthContext` with the real user object. This is the only source of truth for user identity in the frontend.

---

## 11. Frontend Token Storage

File: `src/lib/auth-storage.ts`

### Access token — in memory

```typescript
let _accessToken: string | null = null;
export function setAccessToken(token: string | null) { _accessToken = token; }
export function getAccessToken(): string | null { return _accessToken; }
```

- Lost on page refresh → recovered by running the refresh flow on bootstrap.
- Never written to localStorage or sessionStorage.
- Not accessible from other browser tabs (intentional — each tab re-bootstraps).

### Refresh token — localStorage

```typescript
const REFRESH_KEY = "orchestra_rt";
export function setRefreshToken(token: string | null) { ... }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY); }
```

- Key: `orchestra_rt` — different from legacy mock key `orchestra_role`.
- Survives page refresh and browser restart.
- Cleared on logout and on refresh failure.

### `clearTokens()`

Clears both in-memory access token and `orchestra_rt` from localStorage. Also removes any legacy `orchestra_role` key from the old mock system.

### Tradeoff note

Storing refresh tokens in localStorage is vulnerable to XSS attacks. The alternative is `HttpOnly` cookies (immune to XSS). This implementation uses localStorage because:

1. The current backend `POST /v1/auth/refresh` accepts the token in the request body, which requires the frontend to read it.
2. Migrating to HttpOnly cookies requires coordinated backend changes (set-cookie on login/refresh, clear-cookie on logout, CSRF protection for mutating requests).

**Future improvement**: migrate to HttpOnly cookie-based refresh tokens with `SameSite=Strict` and CSRF double-submit pattern. See Section 31.

---

## 12. Frontend HTTP Layer

File: `src/lib/http.ts`

### `apiFetch<T>(path, init)`

Central fetch wrapper used for all authenticated API calls.

1. Injects `Content-Type: application/json`.
2. Injects `Authorization: Bearer <accessToken>` if token is present.
3. On `401`: calls `refreshAccessToken()`, then retries the original request exactly once.
4. On retry failure: clears tokens, dispatches `orchestra:auth-expired` custom event, throws `ApiError`.
5. On non-401 error: throws `ApiError(status, code, message)`.

### Single-flight refresh

```typescript
let _refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!_refreshPromise) {
    _refreshPromise = runRefresh().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}
```

Multiple concurrent 401s share one refresh call — no refresh storm.

### `ApiError`

```typescript
class ApiError extends Error {
  status: number;
  code: string;
}
```

Used across the frontend to distinguish API errors from network errors.

### `BASE_URL`

```typescript
export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
```

Set `VITE_API_URL` in `.env` for non-local environments.

---

## 13. Frontend Auth API

File: `src/lib/api/auth.ts`

All functions in this module call the backend auth routes directly (not through `apiFetch`) because they need to run without an existing access token.

| Function | Backend route | Side effect |
|----------|--------------|-------------|
| `apiLogin(email, password)` | `POST /v1/auth/login` | Stores access + refresh tokens |
| `apiSignup(orgName, email, password, displayName)` | `POST /v1/auth/signup` | Stores access + refresh tokens |
| `apiLogout()` | `POST /v1/auth/logout` | Clears all tokens |
| `apiGetMe()` | `GET /v1/auth/me` | — (read-only) |

All functions throw `ApiError` on failure.

`apiLogout()` is best-effort on the network call — tokens are always cleared locally even if the server call fails.

---

## 14. Frontend Auth Context

File: `src/context/AuthContext.tsx`

### State machine

```
bootstrapping → authenticated   (bootstrap succeeded)
bootstrapping → unauthenticated (no refresh token, or refresh failed)
authenticated → unauthenticated (logout or session expired)
unauthenticated → authenticated (login or signup)
```

### `AuthStatus`

```typescript
type AuthStatus = "bootstrapping" | "authenticated" | "unauthenticated" | "error";
```

### Context shape

```typescript
interface AuthContextType {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (orgName: string, email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

### AuthUser shape

```typescript
interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  globalRole: "owner" | "admin" | "member";
  workspaceRoleDefault: "manager" | "dev" | "client";
  createdAt: string;
}
```

### `AuthProvider`

Wraps the entire app (mounted in `main.tsx` inside `BrowserRouter`). On mount, runs `tryBootstrap()` which:

1. Checks for stored refresh token.
2. If found: calls `POST /v1/auth/refresh` to get new access token.
3. If refresh succeeds: calls `GET /v1/auth/me` to hydrate user.
4. Sets state to `authenticated` or `unauthenticated`.

Also listens for `orchestra:auth-expired` custom event (dispatched by `http.ts` on refresh failure) to force-transition to `unauthenticated`.

---

## 15. Frontend Bootstrap Flow

```
App mounts
  → AuthProvider useEffect fires (runs once)
    → getRefreshToken() from localStorage
    → if null: setState("unauthenticated") → show login
    → if present:
        POST /v1/auth/refresh
          → success: setAccessToken(newAt), setRefreshToken(newRt)
          → failure: clearTokens(), setState("unauthenticated") → show login
        GET /v1/auth/me
          → success: setState("authenticated", user)
          → failure: clearTokens(), setState("unauthenticated") → show login
  → ProtectedRoute renders:
      "bootstrapping" → loading screen (prevents flash of login)
      "authenticated" → Outlet (shell mounts)
      "unauthenticated" → Navigate to "/"
```

The shell **never mounts** based on token presence alone. It requires a successful `/me` call.

### 15.1 Shell bootstrap after auth

Once auth is `authenticated`, the app shell runs a second bootstrap in `AppShellProvider`:

1. `GET /v1/projects`
2. restore remembered preferred project id only if it is still accessible
3. resolve `activeProjectId`
   - route project id wins when present and accessible
   - otherwise preferred project id
   - otherwise first accessible project
4. lazily load:
   - `GET /v1/projects/:projectId`
   - `GET /v1/projects/:projectId/members`

Shell bootstrap states:

- `bootstrapping_auth`
- `bootstrapping_projects`
- `ready`
- `no_projects`
- `unauthenticated`
- `fatal_error`

This means the internal shell is mounted only after both auth and accessible-project bootstrap complete.

---

## 16. Login / Signup Flow

### Login

```
LoginPage form submit
  → AuthContext.login(email, password)
    → apiLogin(email, password)
      → POST /v1/auth/login
      → on success: setAccessToken, setRefreshToken, return AuthUser
    → setState("authenticated", user)
  → navigate("/dashboard")
```

### Signup

```
LoginPage (signup mode) form submit
  → AuthContext.signup(orgName, email, password, displayName)
    → apiSignup(...)
      → POST /v1/auth/signup
      → on success: setAccessToken, setRefreshToken, return AuthUser
    → setState("authenticated", user)
  → navigate("/dashboard")
```

### Error handling

| Backend error code | User-facing message |
|-------------------|---------------------|
| `invalid_credentials` | "Incorrect email or password." |
| `user_exists` | "An account with this email already exists." |
| other | Error message from backend |

Errors are shown inline in the form. The form does not leak which field is wrong.

---

## 17. Refresh-on-401 Behavior

```
apiFetch("/v1/some/route")
  → server returns 401
  → refreshAccessToken() called
      → if _refreshPromise already running: reuse it (single-flight)
      → if not: POST /v1/auth/refresh with stored refresh token
          → success: setAccessToken(new), setRefreshToken(new), return new AT
          → failure: clearTokens(), dispatch "orchestra:auth-expired", throw ApiError
  → retry original request with new access token
  → if retry also fails: throw ApiError
```

Key properties:
- Exactly **one retry** per original request.
- Exactly **one refresh call** regardless of how many concurrent requests hit 401.
- On refresh failure: global `orchestra:auth-expired` event → `AuthProvider` transitions to `unauthenticated` → all protected routes redirect to login.

---

## 18. Logout Flow

```
NavBar "Sign out" button
  → AuthContext.logout()
    → apiLogout()
      → getRefreshToken() from localStorage
      → POST /v1/auth/logout with { refreshToken }  (best-effort)
      → clearTokens() (always runs, even on network failure)
    → setState("unauthenticated", null)
  → ProtectedRoute detects unauthenticated → Navigate to "/"
```

After logout:
- In-memory access token is `null`.
- `orchestra_rt` removed from localStorage.
- React state reset — no stale project/user data leaks.
- Server-side refresh token is revoked — cannot be reused.

---

## 19. Protected Route Behavior

File: `src/App.tsx`

### `ProtectedRoute`

```tsx
function ProtectedRoute() {
  const { status } = useAuth();
  if (status === "bootstrapping") return <LoadingScreen />;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
```

### `PublicOnlyRoute`

```tsx
function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === "bootstrapping") return <LoadingScreen />;
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
```

- Login page is wrapped in `PublicOnlyRoute` — authenticated users are bounced to dashboard.
- All app routes are wrapped in `ProtectedRoute` — unauthenticated users are bounced to login.
- During bootstrap both routes show a loading screen — no flash of wrong content.

---

## 20. Role Derivation in Frontend

Role is derived **only** from `AuthContext.user.workspaceRoleDefault`, which comes from the backend `/me` response.

**No** localStorage reads, **no** mock roles, **no** hardcoded role names.

| Component | What it uses |
|-----------|-------------|
| `NavBar` | `user.displayName`, `user.workspaceRoleDefault` for avatar label |
| `DashboardPage` | `user.displayName` for greeting |
| `SettingsPage` | `user.displayName`, `user.email`, `user.workspaceRoleDefault` |

Frontend role gating is for UX only. Backend enforces all real restrictions.

---

## 21. SSE / Socrates Stream Auth

**Current state**: Socrates panel uses a local mock (no real SSE calls).

**When real SSE is wired**, the correct approach is:

```typescript
// Use fetch() + ReadableStream — supports Authorization header
const res = await fetch(`${BASE_URL}/v1/projects/${projectId}/socrates/sessions/${sessionId}/messages/stream`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ content: userMessage })
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // parse SSE lines: "data: {...}\n\n"
}
```

**Do NOT use native `EventSource`** — it cannot send custom headers, so it cannot send `Authorization: Bearer`.

The backend Socrates SSE route (`POST .../messages/stream`) uses `authGuard` and expects the standard Bearer token.

---

## 22. Connector OAuth (Separate Layer)

Communication connectors (Slack, Gmail, Outlook, etc.) use a separate OAuth flow that is completely independent from user auth.

- **User auth**: email/password → JWT → session
- **Connector auth**: OAuth 2.0 → provider access token → stored encrypted in credential vault

The connector OAuth state is protected by `CONNECTOR_OAUTH_STATE_SECRET` (HMAC-signed state parameter). Connector credentials are stored in encrypted form controlled by `CONNECTOR_CREDENTIAL_VAULT_MODE`.

This layer does not interact with the user JWT system except that connector management routes require `requireManager`.

---

## 23. Webhook Verification (Separate Layer)

Incoming provider webhooks (Slack events, WhatsApp, etc.) are verified using provider-specific signing mechanisms:

- **Slack**: HMAC-SHA256 over request body using `SLACK_SIGNING_SECRET`
- **WhatsApp**: HMAC-SHA256 using `WHATSAPP_APP_SECRET`
- **Google**: PubSub push with Google's signed JWT

These routes do **not** use the user JWT system. They are public endpoints with their own independent signature verification.

---

## 24. Client Share Token Auth (Feature 6)

Client portal access uses a separate, non-JWT tokenized system. This is orthogonal to user auth.

### Token format

```
cs_<32 random bytes as base64url>
```

Example: `cs_xKzW4pBq8sJdHnLmR2vCfYeAoGtWkP9u`

### Security model

- Token generated with `randomBytes(32)` — cryptographically random.
- Only `HMAC-SHA256(token, CLIENT_SHARE_TOKEN_SECRET)` stored in DB.
- Raw token returned only at create/rotate time.
- Verification: hash incoming → `timingSafeEqual` compare — prevents timing oracle.
- Revocation: server-side status change (`active` → `revoked`).
- Lazy expiry: `expiresAt < now()` transitions to `expired` on first access.

### How it works with the app

Client share routes (`/v1/client/:token/*`) do **not** use `authGuard` or JWT. Token is in the URL path, not an Authorization header. Public, no CORS origin restriction needed for client portal links.

---

## 25. CORS and Origin Security

`CORS_ALLOWED_ORIGINS` env var (comma-separated list) controls which origins the backend allows.

Default: `"http://localhost:3001"` (dev frontend).

Production must explicitly set origins:
```
CORS_ALLOWED_ORIGINS=https://app.example.com,https://client.example.com
```

Preflight requests handled by `@fastify/cors`. All non-auth routes include auth middleware that validates the Bearer token regardless of origin.

---

## 26. Environment Variables

### Auth-relevant backend vars

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `JWT_ACCESS_SECRET` | Yes | — | Min 16 chars; used for access token signing |
| `JWT_REFRESH_SECRET` | Yes | — | Min 16 chars; must differ from access secret |
| `JWT_ACCESS_TTL` | No | `"15m"` | ms-style string or number (seconds) |
| `JWT_REFRESH_TTL` | No | `"30d"` | ms-style string or number (seconds) |
| `PASSWORD_HASH_COST` | No | `12` | bcrypt rounds (8–15) |
| `CLIENT_SHARE_TOKEN_SECRET` | No | `"change_me_client_share_secret"` | HMAC key for client share tokens |
| `CONNECTOR_OAUTH_STATE_SECRET` | No | `"change_me_connector_state_secret"` | HMAC key for OAuth state params |
| `CORS_ALLOWED_ORIGINS` | No | `"http://localhost:3001"` | Comma-separated allowed origins |

### Frontend vars (Vite)

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_API_URL` | `"http://localhost:3000"` | Backend base URL |

---

## 27. Security Rules

1. **`passwordHash` never leaves the server.** Stripped in `getMe()`, and routes project only safe fields for login/signup.
2. **Access tokens are short-lived (15m default).** Limits window of a stolen token.
3. **Refresh tokens are hashed in DB.** A DB leak does not expose raw refresh tokens.
4. **Refresh rotation on every use.** Limits window of a stolen refresh token.
5. **Logout revokes server-side.** Stolen refresh token can't be used after logout.
6. **No role/auth state in localStorage** beyond the refresh token. Removed all `orchestra_role` flags.
7. **Single-flight refresh.** Prevents refresh storms that could exhaust token rotation.
8. **Identical errors for invalid credentials.** `"Invalid credentials"` regardless of whether email or password is wrong — prevents user enumeration.
9. **`timingSafeEqual` for client share token verification.** Prevents timing attacks on token comparison.
10. **Production rejects default secrets.** `change_me` defaults fail startup validation in `NODE_ENV=production`.
11. **SSE uses fetch + Authorization header**, not native EventSource (which can't send auth headers).
12. **CORS origins must be explicitly configured** in production.

---

## 28. Error Cases and Failure Handling

| Scenario | Backend behavior | Frontend behavior |
|----------|-----------------|-------------------|
| Wrong email/password | `401 invalid_credentials` | "Incorrect email or password." |
| Email already exists | `409 user_exists` | "An account with this email already exists." |
| Access token expired | `401` | Refresh → retry once → or logout |
| Refresh token expired | `401 refresh_expired` | Clear tokens → unauthenticated |
| Refresh token revoked | `401 refresh_expired` | Clear tokens → unauthenticated |
| No refresh token | — | Bootstrap → unauthenticated immediately |
| `/me` fails after refresh | — | Clear tokens → unauthenticated |
| Logout network fail | Best-effort server revoke | Always clears local tokens |
| Inactive user | `401 invalid_credentials` | Same as wrong password |

---

## 29. Backend Auth Tests

File: `tests/routes.test.ts`

Current coverage via mock context:

- `POST /v1/auth/signup` → returns safe user shape (id, orgId, email, displayName, globalRole, workspaceRoleDefault)
- `POST /v1/auth/login` → returns safe user shape + tokens
- `GET /v1/auth/me` → returns safe user (mock returns `{ id, orgId }`)
- `POST /v1/auth/refresh` → returns new tokens
- `POST /v1/auth/logout` → requires auth guard; returns `{ ok: true }`
- Protected route without token → `401`
- Protected route with valid manager token → success
- Protected route with dev token → `403` on manager-only routes

**Auth security test checklist** (to add in future test pass):

- [ ] `getMe()` does not include `passwordHash` in response
- [ ] Revoked refresh token fails refresh
- [ ] Expired refresh token fails refresh
- [ ] Concurrent refresh calls result in one DB write (single-flight)
- [ ] Inactive user cannot login
- [ ] Signup with existing email returns `409`

---

## 30. Production Hardening

Before deploying to production:

1. **Set strong secrets**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (min 32 chars recommended, fully random).
2. **Set `CLIENT_SHARE_TOKEN_SECRET`** and `CONNECTOR_OAUTH_STATE_SECRET` to non-default values.
3. **Set `CORS_ALLOWED_ORIGINS`** to the exact frontend origin(s).
4. **Set `NODE_ENV=production`** — this enables production validation that rejects `change_me` defaults.
5. **Set `PASSWORD_HASH_COST=12`** or higher (default is already 12).
6. **Rotate refresh tokens periodically** — consider shortening `JWT_REFRESH_TTL` based on risk tolerance.
7. **Monitor `RefreshToken` table** — implement periodic cleanup of expired tokens to prevent unbounded growth.
8. **TLS everywhere** — tokens in transit must be over HTTPS only.
9. **Consider HttpOnly cookies** for refresh token storage — see Section 31.
10. **Set `METRICS_TOKEN`** to prevent unauthenticated access to `/metrics` endpoint.

---

## 31. Known Limitations and Future Work

| Limitation | Impact | Fix |
|------------|--------|-----|
| Refresh token in localStorage | Vulnerable to XSS | Migrate to HttpOnly cookie + backend set-cookie |
| No CSRF protection | Needed if HttpOnly cookies used | Add double-submit CSRF token or SameSite=Strict |
| No device/session management | Can't see/revoke individual sessions | Add `RefreshToken.deviceName`, `/me/sessions` endpoint |
| No rate limiting on login | Brute force possible | Add IP-based rate limiting (e.g. `@fastify/rate-limit`) |
| Single workspace role per user | Limited multi-role support | Expand `ProjectMember.projectRole` as override |
| Socrates SSE not yet real | Mock only | Wire `fetch`-based streaming when backend SSE is confirmed |
| No 2FA | Weaker account security | Add TOTP support |
| `RefreshToken` table grows unbounded | DB bloat | Add cron job to delete expired/revoked tokens older than N days |

---

## 32. File / Module Map

### Backend

| File | Purpose |
|------|---------|
| `src/modules/auth/routes.ts` | Auth route handlers (signup, login, refresh, logout, me) |
| `src/modules/auth/service.ts` | Auth business logic; `getMe()` returns safe DTO |
| `src/app/auth.ts` | `requireAuth`, `requireManager`, `requireWorkspaceRole`, `authGuard` |
| `src/lib/auth/jwt.ts` | `JwtUser` type, `hashToken()` (SHA-256) |
| `src/lib/auth/password.ts` | `hashPassword()`, `verifyPassword()` (bcrypt) |
| `src/config/env.ts` | Validates all auth-related env vars at startup |
| `prisma/schema.prisma` | `User`, `RefreshToken`, `Organization` models |
| `tests/routes.test.ts` | Auth route integration tests |

### Frontend

| File | Purpose |
|------|---------|
| `src/lib/auth-storage.ts` | Centralized token read/write; access in memory, refresh in localStorage |
| `src/lib/http.ts` | `apiFetch` — auth injection, 401 handling, single-flight refresh, `ApiError` |
| `src/lib/api/auth.ts` | `apiLogin`, `apiSignup`, `apiLogout`, `apiGetMe` — typed auth API calls |
| `src/context/AuthContext.tsx` | `AuthProvider`, `useAuth` — auth state machine, bootstrap, session events |
| `src/hooks/useAuth.ts` | Re-export of `useAuth` for ergonomic imports |
| `src/main.tsx` | Mounts `AuthProvider` wrapping the whole app |
| `src/App.tsx` | `ProtectedRoute`, `PublicOnlyRoute` — real auth-gated routing |
| `src/pages/LoginPage.tsx` | Real email/password + signup form; no localStorage role mock |
| `src/pages/DashboardPage.tsx` | Greeting from `user.displayName`; no localStorage reads |
| `src/pages/SettingsPage.tsx` | Shows real user email, name, role from auth context |
| `src/components/shell/NavBar.tsx` | User badge from auth context; logout button wired |
