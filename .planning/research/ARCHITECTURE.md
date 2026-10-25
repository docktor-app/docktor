# Architecture Research

**Domain:** Self-hosted Docker Compose management platform (Docktor) - subsequent milestone v0.2.0 (Migration Hardening, Proxy & Access)
**Researched:** 2026-10-21
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; better-auth plugin behaviours MEDIUM, marked per item; nginx-proxy per-vhost override mechanics LOW until spiked)

Scope: how the three v0.2.0 feature groups integrate with the existing layered architecture (routes -> application services -> repositories -> infrastructure, Fastify `requireAuth`, SSE, `ProxyConfig`/`proxy-service`, migration services). This is an integration document, not a greenfield design. Every item is marked NEW or MODIFIED.

---

## Headline Decisions

1. **Authorization is one global, declarative, deny-by-default Fastify hook, not 14 per-plugin hooks.** Each route declares `config: {access: ...}`. A single root `onRequest` hook authenticates and authorizes from `request.routeOptions.config`; an `onRoute` hook throws at boot if any `/api/*` route lacks a declaration. It replaces the 12 copies of `app.addHook("onRequest", requireAuth)`.
2. **The permission matrix is a pure shared module** (`@docktor/shared`), used by the server guard, the client UI gating, and the generated test matrix. Roles are stored via the better-auth `admin` plugin (`User.role`), but Docktor owns the policy and the user-administration routes (owner invariants live in Docktor code, not in plugin endpoints).
3. **Dark-launch the retrofit.** Ship role column + guard + all route declarations while every existing user is `owner`. Nothing changes for single-user instances. Only after enforcement and SSE hardening are in place does user creation (the first non-owner) become possible.
4. **Audit log = new append-only `AuditLog` table + `AuditService`**, fed by (a) a declarative route-level hook (`config.audit`), (b) a better-auth `after` hook for auth lifecycle events, (c) explicit calls for system actors. It is deliberately NOT the existing `StackEvent`/`StatusLog` tables or the domain event bus (naming-collision lesson from UAT gap G-02-16).
5. **Proxy: keep `ProxyService` as orchestrator, extract the compose-write step behind a small internal applier seam** (managed nginx-proxy env vs. external Traefik labels), selected by an instance setting `proxy.mode` (absent = `managed`, so zero migration). This is NOT the deferred #43 `ProxyProvider` abstraction; it is the minimum seam #44 needs and #43 can later grow from.
6. **WebSocket: nginx-proxy already forwards `Upgrade` by default** (verified in upstream `nginx.tmpl`). #86 is therefore a toggle of a default-on behaviour: `ProxyConfig.websocketEnabled BOOLEAN NOT NULL DEFAULT true`; only `false` renders anything (a per-host `vhost.d` override). The override mechanism and its reload semantics are the single riskiest proxy unknown and need a spike against a real nginx-proxy container.
7. **Migration hardening is mostly contained in `migration-service.ts` plus four infrastructure files.** The structural changes are a rollback ledger (compensation stack with verified outcomes), a shared compose-project resolver (used by #100/#101/#102), one bind-source classifier (used by #104 analyzer + rewriter + copy planner), and a sanitized compose environment (#109).

---

## Standard Architecture

### System Overview (request lifecycle with the new access seam)

```
Browser (SPA: useCan() gating, login/reset/OIDC UI, users + audit pages)
   |  REST + SSE (cookie session)
   v
+--------------------------------------------------------------------------+
| Fastify root context (app.ts)                                            |
|  onRequest 1: originGuard            (existing, #46)                     |
|  onRequest 2: firstRunGate           (existing, 503 until a user exists) |
|  onRequest 3: accessGuard            (NEW - replaces per-plugin           |
|               requireAuth)           authenticate -> 2FA gate -> authorize|
|  onRoute:     accessDeclarationCheck (NEW - boot fails if undeclared)     |
|  [schema validation: Zod via fastify-type-provider-zod]                  |
|  onResponse:  auditHook              (NEW - declarative, config.audit)    |
+------------------+-------------------------------------------------------+
                   |
   +---------------+-----------------------------------------------+
   | routes/*  (thin; each route carries config: {access, audit})    |
   +---------------+-----------------------------------------------+
                   v
+--------------------------------------------------------------------------+
| application/  stack, backup, proxy, migration, settings, account-security |
|               + NEW: audit-service, user-admin-service, auth-options-    |
|                 service, password-reset-mailer, oidc-config              |
+------------------+---------------------------------------------------------+
                   v
+--------------------------------------------------------------------------+
| domain/  (pure)  stack-status-machine, proxy-idempotency, ...            |
|          + NEW: access-policy (via shared), audit-entry, migration-       |
|            rollback, proxy-snippets, traefik-labels                      |
+------------------+---------------------------------------------------------+
                   v
+--------------------------------------------------------------------------+
| repositories/ (Prisma only)   + NEW: audit-log-repository, user-repo ext |
| infrastructure/ adapters      + NEW: compose-project-resolver,           |
|   disk-space, vhost-filesystem; MODIFIED: external-stack-control,        |
|   volume-migrator, compose-analyzer/rewriter, docker-executor (env)      |
+--------------------------------------------------------------------------+
        better-auth (catch-all /api/auth/*, hijacked reply) sits BESIDE the
        Fastify guard: it enforces its own endpoint auth; Docktor controls it
        via plugins, disabledPaths, and before/after hooks (existing pattern
        in lib/auth.ts + lib/two-factor-hooks.ts).
```

### Component Responsibilities (NEW vs MODIFIED)

| Component | Status | Responsibility | Notes |
|-----------|--------|----------------|-------|
| `shared/src/access/permissions.ts` | NEW | `Permission` union, `Role` enum (`roleSchema`), `ROLE_PERMISSIONS`, pure `can(role, permission)` | Single policy source for server, client, tests. Zod enum for role, `z.infer` types. |
| `server/src/lib/access-guard.ts` | NEW | Global `onRequest` hook: authenticate (`requireSession` logic) -> 2FA enrollment gate (existing `isEnrollmentRequired`) -> `can(user.role, config.permission)` | Replaces `requireAuth` per plugin. `requireSession`/`requireAuth` stay exported for the wizard preHandlers and tests until migrated. |
| `server/src/lib/access-registry.ts` (or inside access-guard) | NEW | `onRoute` hook; throws if an `/api/*` route has no `config.access`; exposes the route inventory for tests | Deny by default at boot, not at request time. |
| `lib/auth-middleware.ts` | MODIFIED | `request.user` now carries `role`; `requireSession` unchanged semantically | `AuthUser` type gains `role` from the admin plugin. |
| `lib/auth.ts` / `auth-config.ts` | MODIFIED | Add `admin()` plugin, `genericOAuth()` (env-driven), `sendResetPassword`, `revokeSessionsOnPasswordReset`, `databaseHooks`, audit after-hook; shrink `TWO_FACTOR_DISABLED_PATHS`; extend `AUTH_STRICT_PATHS` | Rename the constant (it is no longer 2FA-only). Keep `cookieCache` OFF (role changes must be instant). |
| `application/audit-service.ts` | NEW | `record(entry)`, `list(filter)`; redaction whitelist per action | Never throws into a request path for non-security-critical writes; denied/auth events awaited. |
| `repositories/audit-log-repository.ts` | NEW | `append`, `list` (cursor), `deleteOlderThan` | No update/delete-by-id methods: append-only by API shape. |
| `jobs/audit-log-pruner.ts` | NEW | Retention (`audit.retentionDays`) | Mirror `health-history-pruner.ts`. |
| `application/user-admin-service.ts` | NEW | Create/list/set-role/ban/remove users; owner invariants (last owner, admin cannot touch owner) | Calls better-auth admin APIs internally; Docktor routes `/api/users*` are the only HTTP surface. |
| `application/auth-options-service.ts` + `GET /api/auth-options` (public) | NEW | `{passwordReset: boolean (SMTP configured), oidc: {enabled, label} | null}` for the login page | Public route; returns no secrets. |
| `lib/sse-stream.ts` | NEW | Single helper to open an SSE response: headers, `: connected`, heartbeat, close registry, periodic session/permission revalidation | Replaces three hand-rolled copies (events.ts, stacks.ts logs, backups.ts stream). |
| `lib/state-broadcaster.ts` + `domain/events.ts` | MODIFIED | `StateEvent` payloads become shared Zod schemas; `EVENT_PERMISSIONS` map for per-event filtering | Also closes #105's client-mirror drift. |
| `application/proxy-service.ts` | MODIFIED | Orchestration stays; compose-write step delegates to a `ServiceProxyApplier` chosen by `proxy.mode`; `assignDomain` no longer requires the managed stack in external mode | See Proxy section. |
| `lib/compose-proxy-editor.ts` | MODIFIED/KEPT | Managed-mode pure compose edit (unchanged) | Becomes the managed applier's implementation. |
| `lib/compose-traefik-editor.ts` | NEW | Pure yaml-Document edit: Docktor-owned Traefik labels only | Same targeted-mutation pattern as `compose-proxy-editor.ts`. |
| `domain/proxy-snippets.ts` | NEW | Pure render of copy-ready snippets (Traefik labels, Caddyfile, nginx server block, NPM field list) | Takes `{domain, upstream, port, tls, websocket}`. |
| `infrastructure/vhost-filesystem.ts` | NEW | Writes/removes per-host `vhost.d` override files under the proxy stack's `volumes/vhost.d`; triggers nginx reload | Mirrors `certificate-filesystem.ts` (path-confinement guards). |
| `application/migration-service.ts` | MODIFIED | Step reorder, rollback ledger, verified outcomes | See Migration section. |
| `infrastructure/compose-project-resolver.ts` | NEW | Resolve the real compose project name/services of an external compose file (dockerode labels, fallback `domain/compose-project-name.ts`) | Shared by #100/#101/#102. |
| `infrastructure/external-stack-control.ts` | MODIFIED | `stop` returns a verification outcome; add `runningServices`, `up(services)`, `down` | Port in `application/ports/external-stack-control-port.ts` changes. |
| `infrastructure/volume-migrator.ts` | MODIFIED | `inspectVolume`, `--mount type=volume,...,readonly` copy | Port `volume-migrator-port.ts` changes. |
| `infrastructure/compose-env.ts` | NEW | `buildComposeEnv()` allowlisted child env for every `docker compose` spawn | Used by `docker-executor.ts` and `external-stack-control.ts`. |
| Client: `use-can`, users page, audit page, forgot/reset pages, OIDC button, proxy mode + snippet UI, migration-operations store | NEW/MODIFIED | See per-feature sections | UI hiding is cosmetic; the server is authoritative. |

---

## 1. Authorization Layer

### 1.1 Where it sits

Today (`app.ts`, route files): origin guard -> first-run gate (root `onRequest`), then each route plugin does `app.addHook("onRequest", requireAuth)`. `requireAuth` = `requireSession` (resolve better-auth session onto `request.session`/`request.user`) + the D-01 two-factor enrollment gate. `/api/account/*` uses `requireSession` only (users who owe 2FA enrollment must reach it). `/api/auth/*` is the better-auth catch-all (reply hijacked). `/api/setup/*` has its own wizard guards.

Recommended: a single root-level `accessGuard` registered in `app.ts` **before** any route plugin (Fastify only applies a hook to plugins registered after it), running in `onRequest` after the existing two root hooks. Reasons for `onRequest` and not `preHandler`:

- The route is already matched, so `request.routeOptions.config` is readable (HIGH confidence, Fastify 5 docs).
- 401/403 happen before body validation, so an unauthorized caller learns nothing about schemas and cannot trigger Zod work.
- Parent-context hooks run before child-context hooks of the same phase, so a global authorize hook placed in `preHandler` could not have `request.user` populated by a per-plugin `onRequest` auth hook ordering mistake; collapsing authn+authz into one root `onRequest` hook removes that class of bug.

Route declaration (typed via module augmentation, same style as the existing `declare module "fastify"` in `auth-middleware.ts`):

```typescript
// server/src/lib/access-guard.ts
import type {Permission} from "@docktor/shared";

export type RouteAccess =
    | {readonly kind: "public"}                    // /api/auth/*, setup status/step1, auth-options
    | {readonly kind: "session"}                   // authenticated only (own-account endpoints)
    | {readonly kind: "permission"; readonly permission: Permission};

declare module "fastify" {
    interface FastifyContextConfig {
        access?: RouteAccess;
        audit?: AuditAction;        // see section 2
    }
}

// routes/stacks.ts - declaration sits next to the schema, readable in review
app.post("/api/stacks/:id/deploy", {
    schema: {params: stackParamsSchema},
    config: {access: permission("stack:operate"), audit: "stack.deploy"},
}, handler);
```

`onRoute` startup check (fails app construction, so `buildApp()` in every integration test fails too):

```typescript
app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/")) return;               // static SPA, not-found
    if (route.config?.access === undefined) {
        throw new Error(`Route ${String(route.method)} ${route.url} has no config.access declaration`);
    }
});
```

Two routes need care: the better-auth catch-all (`app.all("/api/auth/*")`) is declared `public` (better-auth authenticates inside), and `GET /api/setup/status` / `POST /api/setup/step1` stay `public` with their existing wizard guards (`isWizardComplete`, `hasAnyUser`, lock row). The other `/api/setup/*` routes that use `requireWizardSession` keep that preHandler and additionally declare `permission("migration:run")` / `permission("settings:write")` (only the owner exists during the wizard, so this is a no-op today but keeps the inventory uniform).

### 1.2 Permission model (PROPOSAL - #87 is labelled `needs-design`; ratify before coding)

Coarse resource:action permissions. Key security insight that drives the matrix: **anyone who can edit a compose file or create/import a stack can start a privileged container with host bind mounts, i.e. is host-root-equivalent** (the Docker socket is mounted into Docktor; `docker-socket-rule.ts` and `privileged-rule.ts` exist precisely because of this). Therefore `stack:write`/`migration:run` are admin-class, and `operator` is limited to lifecycle actions on existing stacks.

| Permission | viewer | operator | admin | owner | Routes (examples) |
|------------|:-----:|:--------:|:-----:|:-----:|-------------------|
| `stack:read` | x | x | x | x | `GET /api/stacks`, `/:id`, `/containers`, `/events`, `/uptime/*`, `/health-events`, `/api/storage`, `/api/notifications`, `/api/templates*` (read), SSE `/api/events` |
| `stack:read-sensitive` | | x | x | x | `GET /:id/compose`, `/:id/env`, SSE `/:id/logs` (logs and env routinely contain secrets) |
| `stack:operate` | | x | x | x | `POST /:id/deploy|stop|restart|update`, `/services/:s/upgrade` |
| `stack:write` | | | x | x | `POST /api/stacks`, `PUT /:id`, `DELETE /:id`, `/preview`, template stack creation, template repo add/sync |
| `backup:read` | x | x | x | x | `GET .../backups`, `/snapshots`, `/volume-warnings`, `GET /api/backups/:id`, SSE `/backups/:id/stream`, `backup-config` GET |
| `backup:operate` | | x | x | x | `POST /:id/backup` |
| `backup:restore` | | | x | x | `POST /:id/restore` (overwrites data) |
| `proxy:read` | x | x | x | x | `GET /:id/proxy-configs`, `GET /api/settings/proxy` |
| `proxy:manage` | | | x | x | `POST /:id/services/:s/proxy`, `DELETE /api/proxy-configs/:id` |
| `certificate:manage` | | | x | x | certificates list/upload/delete |
| `migration:run` | | | x | x | `/api/stacks/import/*`, wizard migration routes |
| `settings:read` | | | x | x | `GET /api/settings/*` (SMTP, general, triggers, compose-checks, health, backup, environment) |
| `settings:write` | | | x | x | all `PUT/POST /api/settings/*` incl. proxy settings/deploy, backup config PUT, SMTP test |
| `security:manage` | | | | x | `PUT /api/account/security/mandatory-2fa` (currently ANY user - see 1.5), OIDC visibility, audit retention |
| `user:manage` | | | x* | x | `/api/users*` (*admin cannot create/modify/remove owners) |
| `audit:read` | | | x | x | `GET /api/audit-log` |

Per-stack scoping decision (#87 AC asks for it to be "decided and documented"): **role-only in v0.2.0; no per-stack ACLs.** Rationale: given the root-equivalence above, per-stack scoping of an operator gives weak isolation (shared Docker daemon, shared host paths) and doubles the policy surface. Keep the door open cheaply: the guard calls `can(role, permission)` today, but route declarations for `/:id` routes are the natural place to later pass `{stackId}` to a `canOnStack(user, permission, stackId)` check backed by a future `StackGrant` table. Do not build the table now.

Roles are `String` in Prisma (project precedent: `certStatus`/`certSource` are strings, closed set lives in shared Zod, so jobs/unit tests never import generated enums). Role set `owner | admin | operator | viewer`; `defaultRole` for any newly created user is `viewer` (least privilege).

### 1.3 Role storage: better-auth `admin` plugin, Docktor-owned policy

Use the better-auth `admin()` plugin for storage and mechanics: `User.role`, `banned`/`banReason`/`banExpires`, `Session.impersonatedBy`, `createUser` (with password: exactly what a self-registration-closed instance needs), `setRole`, `banUser` (blocks sign-in and revokes sessions), `removeUser`, `listUsers` (MEDIUM: docs fetched, columns match schema; confirm with `npx auth generate` into a throwaway file).

Do NOT expose the plugin's HTTP endpoints. Its permission check only knows its own `user`/`session` statements, and it cannot enforce Docktor invariants (never demote/ban/remove the last owner; admin cannot modify an owner; no self-demotion lockout). Instead:

- Close `/admin/*` paths with `disabledPaths` (including `/admin/impersonate-user`).
- Docktor's `UserAdminService` + `/api/users*` routes (permission `user:manage`) enforce invariants, call the plugin's server API, and write the audit entry.
- Configure the plugin's `ac`/`adminRoles` minimally (owner, admin map to full `user` statements; operator, viewer to none) generated from the shared matrix, because custom role names in `adminRoles` require an access-control definition (docs).

**Verify in a spike (MEDIUM -> HIGH):** (a) `disabledPaths` closes the HTTP router only and does not block `auth.api.*` direct calls (existing code already calls `auth.api.signUpEmail` through the sign-up `before` hook, so hooks do run on direct calls, but `disabledPaths` behaviour on direct calls is not established); (b) whether server-side `createUser`/`setRole` require forwarded session `headers`. **Fallback if either blocks the design:** do user CRUD via `UserRepository` + better-auth's password hasher (`(await auth.$context).password.hash`), keeping the plugin only for the `role`/ban columns and sign-in ban enforcement.

### 1.4 Retrofit procedure for "every route and every SSE stream"

Mechanical, test-enforced, and safe because enforcement is dark-launched:

1. Add `role` + guard + `config.access` on every route in one PR per route file; `onRoute` check makes a missed route a boot failure, not a silent hole.
2. Delete the per-plugin `app.addHook("onRequest", requireAuth)` lines (accountRoutes' `requireSession` becomes `access: {kind: "session"}`).
3. Tests (written first, TDD): 
   - **Inventory test:** boot `buildApp()`, enumerate routes via the same `onRoute` registry, assert every `/api/*` route is either in an explicit `PUBLIC_ROUTES` allowlist or has a permission. Adding a route without a declaration fails CI.
   - **Role x route matrix integration test:** generated from the registry plus `ROLE_PERMISSIONS` (expected 2xx/4xx-not-403 vs 403 per role). Needs real DB (project rule: no mocked DB in integration tests); create one user per role directly via the admin APIs/repository in test setup.
   - Unit tests for `can()` and for owner invariants.
4. Existing integration suites keep passing unchanged because the test user is `owner` (the setup helper creates the first user through the wizard path).

### 1.5 Non-obvious retrofit hazards in the current code

- `PUT /api/account/security/mandatory-2fa` is reachable by **any signed-in user who has 2FA themselves** (`AccountSecurityService` comment: "there is no role model"). Under multi-user this is an instance-wide security switch: must require `security:manage` (owner). Keep the existing "actor must have 2FA" rule on top.
- `GET /api/stacks/:id/env`, `/compose` and the log SSE leak secrets; they sit under `stack:read-sensitive`, not `stack:read`.
- `POST /api/settings/proxy/deploy` and the managed proxy stack operate on the host's ports 80/443; `settings:write`.
- `routes/stacks.ts` log route does `(s as any).destroy()` (pre-existing CLAUDE.md violation); fix when it moves onto the shared SSE helper.
- `routes/setup.ts` after `isWizardComplete()` returns 410 for everything; `routes/imports.ts` is the post-setup path for the same scan/migrate use cases and must carry `migration:run`.
- `UserRepository.findAllEmails()` feeds notifications (every user gets backup-failure mail). With roles, restrict recipients to roles that can act on them (owner/admin/operator) or add a per-user preference later; default: owner + admin.
- `app.ts` first-run gate counts users on every non-exempt `/api/*` request: keep, but `/api/auth-options` and the OIDC callback paths must be exempted (the latter already are via the `/api/auth/` prefix).

### 1.6 SSE streams

Three raw-SSE endpoints exist: `GET /api/events` (global `StateBroadcaster`, all stacks, all event types), `GET /api/stacks/:id/logs`, `GET /api/backups/:id/stream`. The long-lived nature means a check at connect time is not enough: a user demoted, banned, deleted, or signed out after connecting would keep receiving data.

- **Connect-time:** same `accessGuard` (the declaration is `permission("stack:read")`, `("stack:read-sensitive")`, `("backup:read")` respectively), because it is an `onRequest` hook it runs before the SSE handler hijacks the reply.
- **During the stream:** new `lib/sse-stream.ts` helper wraps header writing, `: connected`, a 25 s heartbeat comment, cleanup on `close`, and a **revalidation timer (every 30-60 s)** that re-resolves the session (cookie-cache is off, so this reflects revocation immediately) and re-checks `can(role, permission)`; on failure it writes a terminal `event: revoked` frame and ends the response. Event-driven fast path (optional optimization): an `access.changed` domain event (from role change/ban/remove/sign-out/reset hooks) closes that user's registered streams immediately. The periodic timer is the baseline because it also covers revocations Docktor does not see (better-auth `revoke-session(s)`, session expiry).
- **Per-event filtering on `/api/events`:** with role-only scoping all stack events are allowed for `stack:read`, but event *types* are not equal: `migration_progress` needs `migration:run`, `notification_created` needs `stack:read` (fine), `proxy_cert_status` needs `proxy:read`. Add `EVENT_PERMISSIONS: Record<StateEvent["type"], Permission>` next to the shared event schemas and filter in the subscribe callback. If per-stack scoping is ever added, the same filter point gets the `stackId`.
- **Client:** `EventSource` cannot read HTTP status; on `error` with `readyState === CLOSED` or on the `revoked` frame, `useContainerEvents`/`useLogStream` must re-check the session (`/api/account/security`) and route to `/login` or show "access removed" instead of reconnect-looping. Keep the existing "close EventSource in cleanup" rule.
- `stateEventBroadcaster.setMaxListeners(100)` is fine for a handful of users x tabs; expose a per-user stream cap (e.g. 10) in `sse-stream.ts` to bound it.

### 1.7 Client side

- `useSession()` already returns the user; with the admin client plugin (or `inferAdditionalFields`) the session user includes `role`. Add `hooks/use-can.ts` calling the shared `can()`.
- Hide/disable actions and nav entries by permission; add `RequirePermission` route wrapper next to `ProtectedRoute`. Server 403 responses still surface through `ApiError` as toasts.
- Own-account page keeps working for users who owe 2FA enrollment (`access: session`).

---

## 2. Audit Log

### 2.1 Placement

```
 HTTP route (config.audit = "stack.deploy")
      |  onResponse hook (auditHook): actor=request.user, resource from params,
      |  outcome from reply.statusCode, ip=request.ip, no body capture
      v
 AuditService.record() --> AuditLogRepository.append() --> Postgres AuditLog
      ^                                   ^
 accessGuard (denied: awaited, 403)       |
 better-auth hooks.after (sign-in ok/fail, sign-out, password reset,            
   2FA enable/disable, session revoke, OIDC link/first sign-in)  --- same service
 UserAdminService (role/ban/remove carry before/after in metadata)
 system actors (jobs, startup owner-promotion): actor.type="system"
```

Why a hook plus explicit calls and not the existing domain event bus: `EventBusPort.emit` is fire-and-forget with per-listener isolation (D-16/D-17) and payloads carry no actor. Security audit needs the actor, must record **denials and failures** (events only describe things that happened), and should be awaited on the denial path. Why not in route handlers: CLAUDE.md forbids business logic in handlers, and a declarative `config.audit` makes the inventory test able to assert "every mutating route declares an audit action or an explicit `audit: "none"` with a reason".

Naming: table `AuditLog`, UI "Audit log" under Settings (admin/owner). Do not reuse "Event Log" (stack `StackEvent` card) or `StatusLog` - UAT gap G-02-16 was precisely a naming collision between two such logs.

### 2.2 Data model

```prisma
// server/prisma/schema/audit-log.prisma  (NEW)
model AuditLog {
  id           String   @id @default(cuid())
  occurredAt   DateTime @default(now())
  // No foreign key on purpose: entries must survive user deletion.
  actorId      String?          // User.id; null for system / anonymous (failed sign-in)
  actorEmail   String?          // snapshot at write time
  actorType    String           // "user" | "system" | "anonymous"
  action       String           // dotted catalog, e.g. "stack.deploy", "auth.sign_in", "access.denied"
  resourceType String?          // "stack" | "user" | "proxy_config" | "setting" ...
  resourceId   String?
  outcome      String           // "success" | "denied" | "failure"
  ip           String?
  userAgent    String?
  metadata     String?          // JSON string, whitelisted + redacted per action (never request bodies)

  @@index([occurredAt])
  @@index([actorId, occurredAt])
  @@index([resourceType, resourceId, occurredAt])
}
```

(`String` for enumerated columns and `String?` JSON follow the project precedent in `StackEvent.payload`, `ProxyConfig.certStatus`.) The repository exposes `append` and cursor `list` only; `deleteOlderThan` is called solely by the pruner (`audit.retentionDays` setting, default 365, 0 = keep). Tamper-evidence (hash chain) is out of scope and should be stated as a non-goal: an operator with DB access can edit rows.

Action catalog (initial): `auth.sign_in` / `auth.sign_in_failed` / `auth.sign_out` / `auth.password_reset_requested` / `auth.password_reset_completed` / `auth.two_factor_enabled|disabled` / `auth.oidc_linked`; `user.created|role_changed|banned|unbanned|removed`; `stack.created|updated|deleted|deploy|stop|restart|update|upgrade`; `stack.logs_opened` (optional, low volume); `backup.trigger|restore|config_changed`; `proxy.domain_assigned|domain_removed|settings_changed|stack_deployed`; `certificate.uploaded|deleted`; `settings.changed` (key names only, never values); `migration.started|finished`; `access.denied`. Secrets never enter `metadata`: record keys and ids, not values.

Read side: `GET /api/audit-log?cursor&limit&actor&action&from&to` (`audit:read`), plain table UI (reuse `DataTable<T>`). No SSE.

---

## 3. Data Model Changes and Backwards Compatibility

All schema changes ship as new Prisma migration directories (`prisma migrate deploy` at boot via `lib/schema-sync.ts`, auto-baselining already shipped in Phase 09). Keep one migration per feature stream so streams can land independently.

| Migration | Contents | Existing-data effect |
|-----------|----------|----------------------|
| `add_proxy_websocket` (proxy phase) | `ProxyConfig.websocketEnabled BOOLEAN NOT NULL DEFAULT true` | Every existing row gets `true` = their current behaviour (nginx-proxy forwards Upgrade by default). |
| (no migration) external proxy mode | New `Setting` keys `proxy.mode`, `proxy.external.*`; `certSource` gains the value `external` (plain String column) | Absent `proxy.mode` is read as `managed`; zero-touch. |
| `add_rbac_and_audit_log` (auth phase) | `User.role TEXT NOT NULL DEFAULT 'viewer'`, `banned`, `banReason`, `banExpires`, `Session.impersonatedBy`; `AuditLog` table + indexes; owner backfill | See below. |
| (no migration) password reset, OIDC (env-driven) | `Verification` and `Account` already carry tokens / `providerId`, `accountId`, `idToken`, token columns | None. |

Owner backfill, inside the same migration SQL so there is no window with a role-less instance:

```sql
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE "User" ADD COLUMN "banned" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "banExpires" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "impersonatedBy" TEXT;
-- #87 AC: "the first account stays the owner"
UPDATE "User" SET "role" = 'owner'
 WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
-- Pre-RBAC every user could do everything; preserve that for any extra row (not creatable via the UI today)
UPDATE "User" SET "role" = 'admin' WHERE "role" = 'viewer';
```

Belt and braces: a boot-time `ensureOwnerInvariant()` in the startup path (system actor, audited) that promotes the earliest user if users exist but no owner does (covers a crash between wizard step 1 `signUpEmail` and role assignment, and manual DB edits). New-install path: `OnboardingService.handleWizardStep1` already runs inside the `createAdminWithLock` lock; after `signUpEmail` it sets the role to `owner` through `UserRepository.setRole` (not through the plugin, which needs an admin session).

Single-user upgrade experience: sessions stay valid (cookie-cache is off, role is read per request); two-factor state and the mandatory-2FA setting are untouched; no env change, no UI step. The only visible additions are Settings > Users/Audit entries.

Prisma conventions to respect: Prisma client only in `repositories/` and `lib/db.ts`; `UserRepository` grows `setRole`, `findById`, `countByRole`, `list`; better-auth's own writes go through its Prisma adapter, so the plugin's columns must be in `auth.prisma` exactly as the plugin generates them.

---

## 4. Authentication Additions

### 4.1 Password reset (#79)

Mostly configuration; small new surface:

- `lib/auth.ts`: `emailAndPassword: {enabled: true, sendResetPassword, revokeSessionsOnPasswordReset: true, onPasswordReset (audit)}`. Remove `/request-password-reset` and `/reset-password` from the disabled-path constant (rename `TWO_FACTOR_DISABLED_PATHS` -> `AUTH_DISABLED_PATHS`; its doc comment already says "Password reset is not built in this phase"). Add both paths to `AUTH_STRICT_PATHS` (5 per 15 min budget; the rate-limit config is exact-path only, never wildcard).
- Mail delivery: reuse `SmtpClientPort` + `SettingsService.getSmtpConfig()` (SMTP password lives encrypted in `Setting`). `NotificationService.notify` is event-oriented and fans out to all users, so add a thin `PasswordResetMailer` application class (port: `SmtpClientPort`, settings) rather than bending `notify`. Do not `await` the send inside `sendResetPassword` (better-auth docs: avoids a timing oracle for account existence); log failures.
- "Unavailable with a clear message when SMTP is not configured": instance-level, so it does not conflict with the neutral-response rule. Implement as (a) a `before` hook on `/request-password-reset` that throws a clear `APIError` when `getSmtpConfig()` is null, and (b) `GET /api/auth-options` (public) so the login page hides/disables the link up front.
- Token storage is the existing `Verification` table. Docs state the same link can be reused when stored in the DB unless the reset succeeds; confirm single-use behaviour with an integration test (AC says single-use).
- 2FA: a reset changes the credential password only; the `TwoFactor` row and `twoFactorEnabled` are untouched, so sign-in still requires the second step (AC). Pin this with an integration test, plus a test that all existing sessions are revoked.
- Reset link host comes from `BETTER_AUTH_URL`; `redirectTo` must be in `trustedOrigins` (the dynamic `resolveTrustedOrigins` already includes the Settings base URL).
- Client: forgot-password page, reset-password page (reads `?token=` / `?error=INVALID_TOKEN`), link on login. Docs: `docs/deployment.md`.
- Also unlocks the **invite flow** for user management: admin creates a user and the system emails a "set your password" link (same machinery). Without SMTP the admin sets a one-time temporary password (`setUserPassword`) shown once.

### 4.2 OIDC (#61) - recommended: `genericOAuth` plugin, configured from environment

Options weighed: (A) `genericOAuth()` with static config; (B) `@better-auth/sso` plugin (providers stored in DB, UI-registrable, domain verification, optional SAML/org features). Recommendation for v0.2.0: **(A) with env-driven config** (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_LABEL`, `OIDC_SCOPES`, `OIDC_AUTO_PROVISION`, `OIDC_DEFAULT_ROLE`), because:

- Docktor already treats deployment-level auth secrets as env (`BETTER_AUTH_*`, `ENCRYPTION_KEY`) and validates them at start-up; the client secret fits there. OIDC users are IdP operators comfortable with env vars.
- No new table (`Account` already stores `providerId`/`accountId`/`idToken`), no `Setting`-encrypted secret handling, no re-instantiation of the module-level `auth` singleton (it is imported everywhere; the docs show only static `config: []`, and a runtime-mutable config would require rebuilding it).
- The SSO plugin brings domain-verification, organization and SAML concepts Docktor does not model. Revisit only if UI-managed providers become a hard requirement (that is a deliberate product decision; flag it, do not drift into it).

Settings UI is read-only status ("OIDC enabled, issuer X, callback URL <BETTER_AUTH_URL>/api/auth/oauth2/callback/<providerId>") plus docs. (Callback path for genericOAuth: the docs state `${baseURL}/api/auth/callback/:providerId`; verify the exact path for 1.4.18 in the spike, since the SSO plugin uses a different one.) The login page renders the OIDC button from `/api/auth-options`.

Account linking and first-sign-in rules (#87 AC "defined"), recommended defaults:

| Case | Rule |
|------|------|
| OIDC identity matches an existing user by email and the IdP asserts `email_verified` | Link automatically (better-auth default). Never add the provider to `trustedProviders` (takeover risk with unverified emails per docs). |
| No matching user | **No implicit sign-up by default** (`disableImplicitSignUp`/`disableSignUp`): an admin pre-creates the user (email + role), the user then signs in with OIDC and links. Opt-in `OIDC_AUTO_PROVISION=true` creates the user with `OIDC_DEFAULT_ROLE` (default `viewer`). |
| Fresh instance (0 users) | OIDC must never create the first user. First owner is always created by the wizard. Enforce in `databaseHooks.user.create.before`: reject creation when `userCount === 0` or when the call did not originate from the wizard/admin path. Otherwise env-configured OIDC on a fresh install lets any IdP user become the first account. |
| Role from IdP claims (groups -> role) | Deferred; document as follow-up. Roles are managed in Docktor. |
| 2FA | The mandatory-2FA gate (`requireAuth`) applies to every session; decide whether IdP-authenticated users are exempt (the IdP is the second factor) - recommend: exempt only when the user has no password credential. Needs an explicit decision, default to NOT exempting until decided. |
| Banned user | Admin-plugin ban blocks sign-in on every path including OIDC (verify in tests). |

The existing `before` hook blocks only `/sign-up/email` when users exist; OIDC callbacks are a different path and bypass it, so the `databaseHooks.user.create.before` rule above is what actually closes self-registration through OIDC.

---

## 5. Proxy Changes

### 5.1 Current structure (relevant facts)

`ProxyService.assignDomain` -> inside `withKeyedLock(stackId)`: require managed stack deployed -> resolve certificate binding -> adopt hand-written domains -> create/reuse `ProxyConfig` row -> `syncServiceComposeProxy` (read all rows for `(stackId, serviceName)`, aggregate comma-joined `VIRTUAL_HOST`/`LETSENCRYPT_HOST`, surgical yaml edit, write compose, `deployStack`). `syncServiceComposeProxy` is already declared the "single call site every compose write goes through". The managed proxy compose mounts `./volumes/vhost.d:/etc/nginx/vhost.d` into both nginx-proxy (ro) and acme-companion (rw). `ProxyCertPoller` classifies rows by `certSource`.

### 5.2 WebSocket toggle (#86)

Finding (HIGH, upstream `nginx.tmpl`): nginx-proxy emits `map $http_upgrade $proxy_connection { default upgrade; '' ... }`, `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection $proxy_connection` for every vhost. So WebSockets work today; the issue's "verify first" resolves to "toggle for a default-on behaviour". Consequences:

- Data: `ProxyConfig.websocketEnabled Boolean @default(true)` (per domain row, matching "per proxied domain" and `vhost.d` file-per-host granularity). Shared Zod: `assignDomainSchema` gains `websocketEnabled: z.boolean().default(true)`; `ProxyConfigDto`/list responses expose it; `proxy-repository` `create`/`updateConfig` accept it; `decideDomainAssignment` "reuse" branch updates it (PRXY-05 idempotency preserved; a pure toggle is an update-in-place of an existing row).
- Rendering: `true` renders nothing (pure default, nothing to drift). `false` renders a per-host override in `volumes/vhost.d` via new `VhostFilesystemPort` (`infrastructure/vhost-filesystem.ts`, path-confined like `certificate-filesystem.ts`): file `<domain>_location` that neutralises the Upgrade headers.
- Three unknowns, all LOW confidence, resolve in a spike with a real nginx-proxy 1.11 container before planning tasks:
  1. **Override semantics.** nginx `proxy_set_header` is inherited only if the current level defines none; duplicate same-name directives at one level may not override as hoped. The disable directive set (`proxy_set_header Upgrade ""; proxy_set_header Connection "";` vs a `_location_override` that replaces the whole location) must be proven by an actual upgrade request failing.
  2. **acme-companion shares `vhost.d` (rw).** It writes its own per-domain files for HTTP-01. Confirm file names do not collide with `<domain>_location` and that it does not clobber/delete Docktor's file. Namespace decision follows from the spike.
  3. **Reload.** A pure WebSocket toggle produces **no compose diff**, so `docker compose up -d` is a no-op, there is no container event, docker-gen does not regenerate, and nginx does not reload. Plan an explicit reload (dockerode exec `nginx -s reload` in `docktor-proxy-nginx`) after any vhost file change, not reliance on the redeploy side effect. Order: write vhost file -> reload (or redeploy if the compose also changed).
- Deliberately out of scope: raising `proxy_read_timeout` (nginx default 60 s idle closes silent WebSocket connections; apps with ping frames are fine). Document the caveat; do not render anything in the `true` state, which also guarantees "existing domains keep current behaviour".
- Client: `Switch` in the assign/edit domain dialog (default on) and a column/badge on the Proxy tab; hook `use-stack-proxy.ts` and `proxy-api.ts` types derived from shared.
- Tests per issue AC: unit (schema, `renderVhostOverride`, decision logic), integration (save + list round trip).

### 5.3 External proxy mode (#44)

Instance setting (keys in the existing `Setting` k/v via `SettingsService`, schema in shared `proxySettingsSchema`, all optional so old clients/`PUT`s keep working):

| Key | Values | Default when absent |
|-----|--------|---------------------|
| `proxy.mode` | `managed` / `external` | `managed` |
| `proxy.external.provider` | `traefik` / `snippet` | `traefik` |
| `proxy.external.entrypoint` | string | `websecure` |
| `proxy.external.certResolver` | string | none (TLS label omitted when empty, with a UI hint) |
| `proxy.external.network` | string | none (if set: the service joins that external network and `traefik.docker.network` is emitted) |

Design:

- **Applier seam (minimal, internal; not #43).** Extract the compose-write step of `syncServiceComposeProxy` into a pure function type `(composeContent, serviceName, rows) => newComposeContent`: `managedApplier` = existing `setServiceProxyEnv`/`removeServiceProxyEnv` (aggregated, D-08 invariant), `traefikApplier` = new `setTraefikLabels`/`removeTraefikLabels`. `ProxyService` reads the mode, picks the applier, keeps locking, row create/rollback, and `deployStack`. Extract first as a behaviour-preserving refactor with the existing proxy tests green, then add the second implementation.
- **Traefik labels.** One router per domain row is natural (unlike nginx's comma-join); router/service names must be unique instance-wide: derive from the row (`docktor-<stackId>-<serviceName>-<n>` or a domain hash). Docktor owns only label keys under the `traefik.http.routers.docktor-*` / `traefik.http.services.docktor-*` prefixes so removal never touches a user's hand-written labels; `traefik.enable=true` is added if absent and left in place on removal (harmless without routers). Handle both compose label forms (map and list). TLS: `entrypoints=<entrypoint>`, `tls=true`, `tls.certresolver=<resolver>` when tlsEnabled. Port: `traefik.http.services.<name>.loadbalancer.server.port=<internalPort>`. WebSocket: no label needed (Traefik proxies it natively), so the per-row toggle only affects the nginx-style snippet.
- **Snippets.** `domain/proxy-snippets.ts` renders copy-ready text for Traefik labels, Caddyfile, nginx server block (honours `websocketEnabled`), and NPM field summary. Upstream is `<serviceName>:<port>` with an explicit note that the user's proxy must share a Docker network with the service. Served inside the list DTO or `GET /api/proxy-configs/:id/snippet` (`proxy:read`); copy via existing `lib/clipboard.ts`.
- **What changes around it.** `assignDomain`: skip the "managed stack deployed" precondition and `adoptUnmanagedDomains` (VIRTUAL_HOST-specific) in external mode; never add the `docktor_proxy` network. `certSource` gains `external` (extends the closed set in shared `certSourceSchema`; consistent with the 09 decision that no row may be ambiguous about its issuer): external-mode rows persist `certSource: "external"`, and `ProxyCertPoller` skips them (Docktor cannot observe an external proxy by design, per #44 out-of-scope). Client hides the cert-status badge for `certSource === "external"` rather than extending `certStatusSchema` (which is mirrored in DB column, event, hook and badge). Setup wizard step 6 gains "I run my own reverse proxy" (sets `proxy.mode=external`, skips managed deploy); Settings > Proxy gains the mode selector and external fields; `GET /api/settings/proxy` returns mode plus fields.
- **Mode switching with existing rows (decision needed, recommend).** For v0.2.0 block the switch with a clear message while any `ProxyConfig` rows exist (or the managed proxy stack is deployed) and tell the user to remove domains first. A "re-apply everything" converter is possible (the editors are surgical and the rendering is aggregate), but it multiplies redeploys across stacks and is the part most likely to leave a half-converted instance. Revisit if feedback demands it.
- Also note an existing quirk to fix while in there: `syncServiceComposeProxy` ignores the `deployStack` result, so a failed redeploy after a proxy edit is silent (assignDomain only rolls back on a thrown error). The managed proxy path `deployAndSurfaceFailure` shows the intended pattern.

---

## 6. Migration Hardening

All items live behind the existing flow: `routes/imports.ts` / `routes/setup.ts` -> `MigrationOperationService` (process-local registry, background run) -> `MigrationService.preflight` / `execute` -> ports (`ExternalStackControlPort`, `VolumeMigratorPort`, `ComposeRewriterPort`, `StackFilesystemPort`, `DockerExecutorPort`). Keep the port/adapter style; the structural additions below are what make several issues collapse into one change each.

| Issue | Where | Structural change |
|-------|-------|-------------------|
| #100 rollback | `migration-service.ts` catch block; `domain/migration-rollback.ts` (NEW); shared `migration-operation.ts` schema; client `lib/migration-progress.ts` | Replace the inline rollback with a **rollback ledger** (compensation stack): each completed step pushes `{name, undo}`; rollback runs in reverse, records `{ok, error}` per step, and returns a `RollbackReport`. Report fields feed `MigrationResult`/`MigrationOperation` (`oldStack: restarted-verified | restart-requested | restart-failed | not-stopped`, `original: untouched | restored | left-aside`, `cleanupErrors[]`). The UI composes "old stack restarted" only from `restarted-verified`. Failed `up` => best-effort `docker.down(stackId)` (no `-v`) before removing the directory (`DockerExecutorPort.down` exists; confirm it never passes `-v`). In-place rollback: after `moveOriginalBack`, bring the original up with `up -d <services that were running>` from the restored files (in-place shares the compose project name, so this recreates correctly), not `docker compose start` against containers created from the new config. Record `runningBefore` (services) immediately before stop. Replace `console.error` with the app logger (#108). |
| #101 named volumes | `compose-project-resolver` (NEW), `volume-migrator.ts`, `compose-rewriter.ts`, `compose-analyzer.ts`, `migration-service.ts` | Resolve real name = top-level `name:` override else `<project>_<key>` using the resolved old project; `VolumeMigratorPort.inspectVolume(name)` (`docker volume inspect`) in preflight so absence is a 4xx before anything stops; copy with `--mount type=volume,src=<name>,dst=/source,readonly` (never `-v name:` which auto-creates); kept-external volumes rewritten as `{external: true, name: <resolved>}`; pre-existing `external:` entries never silently default to "convert". |
| #102 verify stop | `external-stack-control.ts`, port, `migration-service.ts`, client message | `stop` returns `StopOutcome {verified: boolean, remaining: string[]}` after `docker compose ps -q` (or label match on `com.docker.compose.project.config_files` via `compose-project-resolver`, which survives `-p` and `COMPOSE_PROJECT_NAME`). Unverified => success copy says "requested". Timeout scales with service count; a timed-out stop must not trigger `start` on a half-stopped project (ledger marks stop as `unverified`, rollback uses the up-from-files path or reports manual action). |
| #104 `~` binds | `domain/bind-mount-sources.ts` (exists; already has `home-relative` refusal), analyzer, rewriter, copy planner | One `classifyBindSource()` consumed by analyzer, rewriter and `planBindCopies`. Recommended outcome (simpler than resolving `~`): `~` sources are classified "stays outside Docktor", not offered for conversion, never copied, no stray `volumes/<name>` directory. |
| #106 scanner | `brownfield-scanner.ts`, `domain/migration-target.ts` | Shared `isPreMigrationAside(name)` next to `asideNameCandidates` so the scanner and the aside-name generator cannot drift; scanner skips or annotates `<id>-pre-migration[-N]`. |
| #107 backup before stop | `migration-service.execute` | Non-in-place with backup: create new stack dir -> (disk-space check done in preflight via `DiskSpacePort` + existing `disk-usage-scanner`) -> backup copy -> stop -> rest. In-place: the rename-aside after stop already is the backup, so the pre-stop copy applies only to the non in-place path (and a pure in-place never copies twice). Caveat: a `cp -a` of a **running** database directory is crash-consistent at best. Either (a) document it in the UI as such, or (b) warm pre-stop copy plus a post-stop delta pass. Choose explicitly; do not claim consistency. |
| #103 diff masking | client `migration-review-step.tsx`, `lib/env-mask.ts` | Client-only. Run diff lines through the same key-aware mask; one reveal toggle controls both. |
| #105 toast / events | client `use-migration-operations.ts`, `use-container-events.ts`; shared event schemas | Move operation lifecycle (and toast ownership) into a module-level store (`useSyncExternalStore`) so unmount cannot strand it; derive event types from shared Zod (`safeParse` guards `onmessage`, removes the hand-maintained mirror and the missing `"expiring"`). This shared event contract is reused by RBAC's `EVENT_PERMISSIONS`; land it first. |
| #108 hygiene | `lib/errors.ts`, `compose-analyzer.ts`, `stack-filesystem.ts`, shared `brownfield.ts` | `AppError(message, statusCode, code, options?: ErrorOptions)` passing `{cause}`; do this BEFORE the auth stream adds new error subclasses. Type guards/Zod in the analyzer; `realpath` + basename recheck of `composePath`; `..` rejected in the schema. |
| #109 Linux/env | `infrastructure/compose-env.ts` (NEW), `docker-executor.ts`, `external-stack-control.ts`, CI | Finding: `docker-executor.ts` and `external-stack-control.ts` spawn `docker compose` via `execFile` with no `env`, so Docktor's whole process environment is inherited. Compose gives the shell environment precedence over a stack's `.env`, so `${VAR}` in an imported stack resolves from Docktor's own env first (Docktor reads `PORT`/`HOST`, and holds `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`). Recommended behaviour to decide and test: spawn compose with an allowlisted env (`PATH`, `HOME`, `DOCKER_HOST`, `DOCKER_CONFIG`, proxy vars, `LANG`/`TZ`) and let the stack's `.env` supply interpolation. Ownership-preservation test runs on a Linux root runner (CI job) or is documented as a manual check. |

Cross-cutting: migration start/finish are audit events (`migration.started|finished`); `MigrationOperation` should record `startedBy` (user id) once RBAC exists; the operation registry stays process-local (documented design).

---

## Recommended Project Structure (additions)

```
shared/src/
├── access/permissions.ts         # NEW: Role, Permission, ROLE_PERMISSIONS, can()
├── validation/audit.ts           # NEW: audit filter/response schemas
├── validation/users.ts           # NEW: create/update user schemas
├── validation/auth-options.ts    # NEW: public auth options response
├── validation/events.ts          # NEW: StateEvent Zod schemas (replaces client mirror)
└── validation/proxy.ts           # MOD: websocketEnabled, certSource "external", mode/external settings
server/prisma/schema/
├── audit-log.prisma              # NEW
├── auth.prisma                   # MOD: role/banned/..., Session.impersonatedBy
└── proxy.prisma                  # MOD: websocketEnabled
server/src/
├── lib/access-guard.ts           # NEW   (accessGuard + onRoute check + RouteAccess typing)
├── lib/sse-stream.ts             # NEW
├── lib/compose-traefik-editor.ts # NEW
├── lib/auth.ts, auth-config.ts   # MOD
├── domain/migration-rollback.ts  # NEW
├── domain/proxy-snippets.ts      # NEW
├── application/audit-service.ts  # NEW
├── application/user-admin-service.ts        # NEW
├── application/auth-options-service.ts      # NEW
├── application/password-reset-mailer.ts     # NEW
├── application/ports/{disk-space,vhost-filesystem,compose-project-resolver}-port.ts  # NEW
├── infrastructure/{compose-project-resolver,disk-space,vhost-filesystem,compose-env}.ts  # NEW
├── repositories/audit-log-repository.ts     # NEW
├── routes/{users,audit-log,auth-options}.ts # NEW
└── jobs/audit-log-pruner.ts                 # NEW
client/src/
├── hooks/use-can.ts, use-auth-options.ts, use-users.ts, use-audit-log.ts   # NEW
├── lib/migration-operations-store.ts        # NEW (replaces component-bound lifecycle)
└── routes/{auth/forgot-password,auth/reset-password,app/settings/users,app/settings/audit}  # NEW
```

Structure rationale: access policy lives in `shared` because the client needs the same matrix for gating and tests need it for expected results (single source of truth, mirrors the existing "Zod schemas in shared" rule). The guard is in `lib/` (same place as `auth-middleware.ts`/`origin-guard.ts`), not `domain/`, because it touches Fastify; the pure decision (`can`) is the domain-like part and has no framework imports. No barrel files for single modules (project rule).

## Architectural Patterns

### Pattern 1: Declarative route access with boot-time completeness check
**What:** Each route carries `config.access`/`config.audit`; one root hook enforces; `onRoute` refuses undeclared routes.
**When:** Any cross-cutting concern that must cover "every route" (authz, audit).
**Trade-offs:** Slight verbosity per route; in exchange a forgotten route cannot ship. Plugin-encapsulated hooks (today's pattern) fail open the moment someone registers a route outside a plugin that has the hook.

### Pattern 2: Dark-launch enforcement
**What:** Land the enforcement machinery while all existing principals are the top role; add lesser roles last.
**When:** Retrofitting authorization onto a live single-tenant product.
**Trade-offs:** Slightly later feature visibility; removes the "partially enforced" window and lets every existing integration test double as a regression test.

### Pattern 3: Compensation ledger for multi-step side effects
**What:** Each step registers its undo; rollback is reverse iteration producing a typed report.
**When:** Migration `execute` (stop, rename, create dir, copy, record, deploy).
**Trade-offs:** More code than one catch block; makes "what was actually undone" a first-class, testable, displayable value (#100's core ask).

```typescript
// domain/migration-rollback.ts (sketch)
export interface RollbackStepResult {readonly name: string; readonly ok: boolean; readonly error?: string}
export interface RollbackReport {
    readonly steps: readonly RollbackStepResult[];
    readonly oldStack: "restarted-verified" | "restart-requested" | "restart-failed" | "not-stopped";
    readonly original: "untouched" | "restored" | "left-aside";
}
```

### Pattern 4: Pure compose editors, I/O in the service
**What:** `(composeText, serviceName, rows) => composeText` per proxy mode; yaml `Document` API for targeted mutation; `ProxyService` does read/lock/write/deploy once.
**When:** Adding the Traefik label renderer next to the nginx env renderer.
**Trade-offs:** Keeps both renderers unit-testable without a filesystem and preserves comments/quoting (existing property of `compose-proxy-editor.ts`).

---

## Data Flow

### Authorized request

```
Browser --cookie--> originGuard -> firstRunGate -> accessGuard
   accessGuard: resolve session (better-auth, no cache) -> 2FA gate -> can(role, config.permission)
        deny -> AuditService.record(denied) [awaited] -> 403 ForbiddenError (existing handler)
        allow -> Zod validation -> route handler -> application service -> repository
   onResponse: auditHook -> AuditService.record(outcome from status code)
```

### OIDC sign-in

```
Login page (auth-options: oidc enabled) -> /api/auth/sign-in/oauth2 -> IdP -> /api/auth/.../callback/<providerId>
  -> genericOAuth: validate id_token (jwks) -> user lookup by email
       match + email_verified -> link account -> session (role from User.role)
       no match + autoProvision off -> reject (admin must pre-create)
       no match + autoProvision on -> databaseHooks.user.create.before (count>0, role=OIDC_DEFAULT_ROLE)
  -> after hook: audit auth.sign_in / auth.oidc_linked
```

### Proxy domain assignment (both modes)

```
POST /api/stacks/:id/services/:s/proxy  [proxy:manage]
 -> ProxyService.assignDomain (withKeyedLock(stackId))
     mode=managed : require managed stack, adopt hand-written domains
     mode=external: skip both
 -> proxyRepo create/reuse (websocketEnabled, certSource managed|external)
 -> read compose -> applier(mode) -> write compose
 -> managed only: vhostFilesystem write/remove override -> nginx reload (if websocket changed)
 -> stackService.deployStack
 -> on failure: delete newly created row (existing rule)
```

### Migration execute (reordered)

```
preflight (+ inspect volumes, + disk space) -> [create dir -> warm backup]* -> capture runningBefore
 -> stop (verify) -> [rename aside]** -> copy volumes/binds -> rewrite -> record -> up
 on failure: ledger reverse: down new project (no -v) -> remove dir -> delete record
             -> move original back -> up -d <runningBefore> from restored files -> verify -> RollbackReport
 *  non-in-place with backup only    ** in-place only
```

## Scaling Considerations

Single host, single process by design; "scale" here is household/team size.

| Concern | 1 user (today) | 5-20 users | 100+ users |
|---------|----------------|------------|------------|
| SSE connections | 1-3 | tabs x users; add per-user cap, keep `setMaxListeners` in step | Out of scope (single host) |
| Authz cost | n/a | In-memory `can()`; session lookup already per request | Same |
| Audit log growth | negligible | thousands/month; indexes above; pruner | Partition/archive only if needed |
| Revalidation timers | none | one timer per stream, cheap session lookup | Batch by session |

First bottleneck would be the per-request `prisma.user.count()` in the first-run gate (cache "setup complete" once true; monotonic).

## Anti-Patterns

### Anti-Pattern 1: Per-plugin auth hooks as the access model
**What people do:** Keep `addHook("onRequest", requireAuth)` in each route file and bolt `requirePermission(...)` onto each handler.
**Why it's wrong:** Fails open for any route registered outside a hooked plugin and gives no way to prove completeness; 12 copies drift.
**Do this instead:** Root guard + `config.access` + `onRoute` boot check + inventory test.

### Anti-Pattern 2: Using better-auth's admin endpoints as Docktor's user API
**What people do:** Expose `/api/auth/admin/*` and gate with the plugin's `ac`.
**Why it's wrong:** No owner invariants, a second policy source, no Docktor audit, `impersonate-user` on a Docker-root-equivalent product.
**Do this instead:** Close the paths; wrap the plugin API in `UserAdminService` behind `/api/users*`.

### Anti-Pattern 3: Connect-time-only SSE authorization
**What people do:** Check the session once when the stream opens.
**Why it's wrong:** A banned or demoted user keeps receiving container logs (secrets) indefinitely.
**Do this instead:** Shared `sse-stream` helper with periodic revalidation and a terminal `revoked` frame.

### Anti-Pattern 4: Treating the audit log as another StackEvent
**What people do:** Add rows to `StackEvent`/`StatusLog` or hang audit on the domain event bus.
**Why it's wrong:** Per-stack FK cascade deletes history with the stack, no actor, no denied/failed outcomes, best-effort delivery, and the naming collision UAT already hit once.
**Do this instead:** Dedicated append-only `AuditLog`, no FKs.

### Anti-Pattern 5: Claiming outcomes that were not verified (migration)
**What people do:** Print "the old stack was restarted" after a `compose start` that did not throw.
**Do this instead:** Typed verified/requested/failed states derived from `ps` checks; UI copy is a pure function of the state.

### Anti-Pattern 6: Stuffing external mode into the managed code path with `if (mode)` branches
**Why it's wrong:** `adoptUnmanagedDomains`, the managed-stack precondition, the `docktor_proxy` network and the cert poller are all managed-specific; scattering conditionals invites half-applied behaviour.
**Do this instead:** The pure applier seam plus one mode read in `ProxyService`; managed-only side effects live in managed-only functions.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OIDC IdP (Authentik, Keycloak, Authelia, Google...) | better-auth `genericOAuth` via `discoveryUrl`, PKCE on, id_token verified via JWKS | Callback `${BETTER_AUTH_URL}/api/auth/...callback/<providerId>`; test against at least one real IdP before release. |
| SMTP | Existing `SmtpClientPort` + `SettingsService.getSmtpConfig()` | Reset mail must not be awaited in the request path. |
| nginx-proxy / acme-companion | `vhost.d` files + explicit `nginx -s reload` via dockerode exec | Shared rw `vhost.d` with acme-companion. |
| User's own proxy (Traefik/Caddy/NPM) | Compose labels or copy-paste snippet only | Docktor has no visibility by design. |
| Docker CLI | `execFile("docker", ["compose", ...])` with sanitized env | Env allowlist (#109). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| accessGuard <-> better-auth | `auth.api.getSession` (existing `requireSession`) | Cookie cache stays off. |
| better-auth hooks -> AuditService | Direct call from `hooks.after` (existing hook factory pattern in `two-factor-hooks.ts`) | Import cycle caution: `auth.ts` cannot import `application/index.ts` (existing comment); build `AuditService` over `AuditLogRepository` locally like `SettingsRepository` is today. |
| UserAdminService <-> better-auth admin API | In-process `auth.api.*` | Spike item 1.3. |
| ProxyService <-> appliers | Pure function call | Mode read once per operation. |
| MigrationService <-> ComposeProjectResolver | Port | Same resolver for #100/#101/#102. |
| Shared event schemas <-> server broadcaster + client hook | Zod `safeParse` | One definition, plus `EVENT_PERMISSIONS`. |

## Suggested Build Order

Dependency logic: migration hardening and proxy are independent of auth and of each other (separate files, separate Prisma schema files/migrations; only merge friction is route-declaration lines). Within auth, enforcement must precede the first non-owner user; audit precedes user admin; password reset precedes invite UX; OIDC comes last because it needs roles, user pre-provisioning and audit. Recommended order follows the milestone's own ordering, with auth last so the retrofit covers every route added earlier.

1. **Migration correctness (server)** - #108 (`AppError` cause first; typed analyzer; realpath), `compose-project-resolver`, #102 stop verification, #101 named volumes, #104 `~` classification, #106 scanner. No new routes. Prerequisite for 2.
2. **Migration rollback and UX** - #100 ledger + shared report schema, #107 reorder + disk space, #103 diff masking, #105 shared event schemas + store + guarded parse (reused by RBAC), #109 compose-env decision + Linux CI. Depends on 1 (`stop` outcome, resolver).
3. **Proxy** - (a) behaviour-preserving applier extraction, (b) #86 WebSocket (migration, schema, vhost spike FIRST, override + reload, UI), (c) #44 external mode (settings, Traefik editor, snippets, wizard step, poller skip, mode-switch guard, docs).
4. **Access foundation, dark launch** - shared permission matrix, `role` migration + backfill + `ensureOwnerInvariant`, admin plugin wiring, `accessGuard`, declarations on every route (incl. those added in 1-3), inventory + matrix tests, `useCan`, fix mandatory-2FA route. All users are owner. Needs-design permission model ratified before this phase starts.
5. **Audit log** - model, repository, `AuditService`, `config.audit` hook, denied-path recording, better-auth `after` hook, pruner, read API + UI.
6. **SSE hardening** - `sse-stream` helper, port the three streams, revalidation, `EVENT_PERMISSIONS` filtering, client revoked handling. Must land before any non-owner exists.
7. **Password reset (#79)** - auth config, mailer, `auth-options`, pages, docs. Can run in parallel with 5-6 (touches `auth.ts`, login UI); keep before 8.
8. **Multi-user administration** - `UserAdminService`, `/api/users*`, invite flow (reset link or temp password), owner invariants, Users page. First point where lesser roles exist: run the full role matrix in CI.
9. **OIDC (#61)** - `genericOAuth` env config, provisioning/linking rules, `databaseHooks.user.create.before`, login button, status UI, IdP test, docs.

**Research flags for phases**

| Phase | Flag | Reason |
|-------|------|--------|
| 3b WebSocket | Needs deeper research / spike | `vhost.d` override semantics, acme-companion file collisions, reload without compose diff (all LOW). |
| 3c External mode | Moderate | Traefik label edge cases (list vs map labels, `traefik.docker.network`), mode-switch policy. |
| 4 / 8 | Spike | better-auth `admin` plugin: `disabledPaths` vs `auth.api.*`, header requirements, generated columns. Permission model ratification (`needs-design`). |
| 7 | Standard patterns | Docs-backed; verify token single-use and reuse behaviour with tests. |
| 9 | Needs research | genericOAuth exact callback path in 1.4.18, `disableImplicitSignUp` vs `disableSignUp` semantics, email_verified handling per IdP, 2FA-for-OIDC decision. |
| 2 (#107) | Decision | Warm online copy vs crash-consistent claim for running databases. |
| 1, 5, 6 | Standard patterns | Unlikely to need external research. |

## Open Decisions / Gaps

- Ratify the role/permission matrix (section 1.2) and the role-only (no per-stack) scoping.
- OIDC: env-configured (recommended) vs UI-managed providers (SSO plugin); 2FA exemption for IdP users.
- Mode-switch policy for external proxy with existing rows.
- Backup-before-stop consistency stance (#107).
- Notification recipients by role.
- Not verified against live systems: nginx-proxy vhost override and reload behaviour; better-auth admin/genericOAuth runtime behaviour on 1.4.18. Both carry spike tasks above.

## Sources

- `/home/raphael/workspace/docktor/.claude/worktrees/bridge-cse_01GoBQizyDtQbVBYvsPj9rQt/.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md` (HIGH)
- Codebase read directly (HIGH): `server/src/app.ts`, `lib/auth.ts`, `lib/auth-config.ts`, `lib/auth-middleware.ts`, `lib/state-broadcaster.ts`, `routes/*.ts`, `application/proxy-service.ts`, `application/migration-service.ts`, `application/onboarding-service.ts`, `application/account-security-service.ts`, `application/subscribers/*`, `infrastructure/{external-stack-control,volume-migrator,docker-executor}.ts`, `lib/proxy-stack-compose.ts`, `lib/compose-proxy-editor.ts`, `prisma/schema/*.prisma`, `shared/src/validation/proxy.ts`
- GitHub issues docktor-app/docktor #44 #61 #64 #79 #86 #87 #100-#109 (HIGH, requirements)
- nginx-proxy `nginx.tmpl` (upstream main): https://raw.githubusercontent.com/nginx-proxy/nginx-proxy/main/nginx.tmpl (HIGH for default Upgrade forwarding and the vhost.d include order; the header-override behaviour is an inference, LOW)
- better-auth admin plugin: https://www.better-auth.com/docs/plugins/admin (MEDIUM; official docs, runtime behaviour on 1.4.18 not executed)
- better-auth generic OAuth plugin: https://www.better-auth.com/docs/plugins/generic-oauth (MEDIUM)
- better-auth SSO plugin: https://www.better-auth.com/docs/plugins/sso (MEDIUM)
- better-auth email/password (password reset): https://www.better-auth.com/docs/authentication/email-password (MEDIUM)
- better-auth users/accounts (account linking, database hooks): https://www.better-auth.com/docs/concepts/users-accounts (MEDIUM)

Note on method: the `research-plan` seam / MCP providers were not available in this run; findings above come from direct codebase reads plus official-documentation fetches (WebFetch/WebSearch). Confidence tags reflect that.

---
*Architecture research for: Docktor v0.2.0 (Migration Hardening, Proxy & Access)*
*Researched: 2026-10-21*
