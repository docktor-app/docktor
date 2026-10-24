# Project Research Summary

**Project:** Docktor — milestone v0.2.0 (Migration Hardening, Proxy & Access)
**Domain:** Self-hosted Docker Compose management platform (subsequent milestone)
**Researched:** 2026-10-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

v0.2.0 has three independent streams: **migration hardening** (#100-#109, fixes data-loss paths in the shipped wizard), **proxy** (#44 external proxy mode, #86 WebSocket setting) and an **access retrofit** (#61/#87 OIDC, #64 multi-user RBAC + audit log, #79 password reset) on a single-user app whose Docker socket makes any mutation host-root. The ProxyProvider abstraction (#43) is deferred.

The only dependency change is `better-auth` `^1.4.18` → `^1.7.12`. The 1.4 line is end-of-life, and the OAuth advisories that matter for OIDC are fixed only in 1.6.11 / 1.7.7. Everything else is Docktor code on existing pieces.

Recommended approach: one root Fastify `onRequest` access guard (routes declare `config.access`; an `onRoute` hook fails boot on undeclared `/api` routes); a pure permission matrix in `@docktor/shared` with four fixed global roles (owner, admin, operator, viewer) and no per-stack scoping; better-auth `admin` plugin for storage only, with its `/admin/*` HTTP surface disabled and Docktor's own `/api/users*` routes wrapping `auth.api.*`; dark-launch the retrofit while every user is owner; append-only `AuditLog` table without foreign keys; a pure applier seam in `ProxyService` for nginx env vs Traefik labels; a rollback ledger and shared compose-project resolver for migration.

Top risks: (1) OIDC implicit account linking → account takeover / 2FA bypass; (2) a missed route or stale SSE stream after RBAC; (3) rollback running `down -v` (the only existing `down` deletes volumes); (4) owner lockout on upgrade; (5) misunderstanding the nginx-proxy WebSocket default.

## Key Findings

### Recommended Stack

No new packages. Upgrade `better-auth` to `^1.7.12` as its own first step (watch `freshAge` now counting from `createdAt`, `enableTwoFactor` return type change, rewritten generic OAuth API). Use core `genericOAuth` (not `@better-auth/sso`), the `admin` plugin with `createAccessControl` roles defined in `@docktor/shared`, `sendResetPassword` with `revokeSessionsOnPasswordReset: true`, and the existing `yaml` Document API for Traefik labels.

**Core technologies:**
- better-auth 1.7.12 — auth, OIDC, roles, reset — security fixes only in ≥1.6.11/1.7.7
- `genericOAuth` with `disableImplicitLinking`/`disableImplicitSignUp` — OIDC without SSO plugin's SAML/SSRF surface
- Postgres `AuditLog` table — audit trail, no library needed

### Expected Features

**Must have (table stakes):**
- Roles enforced server-side on every route and SSE stream; first account stays owner
- Password reset with neutral response, single-use expiring link, session revocation, SMTP gating
- Migration: verified stop, correct volume copy, reliable rollback, masked secrets, backup before downtime
- Audit log of mutations, auth events and denials

**Should have (competitive):**
- OIDC sign-in with explicit linking rules; WebSocket long-lived-connection setting; external proxy mode with Traefik labels and Caddy/NPM/nginx snippets

**Defer:**
- Per-stack scoping (seam `can(user, action, {stackId?})` only); DB/UI-managed OIDC providers; ProxyProvider (#43)

### Architecture Approach

Root `accessGuard` replaces 12 per-plugin `requireAuth` hooks; shared `sse-stream.ts` adds revalidation and a terminal `revoked` frame plus per-event filtering; `AuditService` fed by a `config.audit` onResponse hook and better-auth `hooks.after`; `ProxyService` applier seam; `ComposeProjectResolver`, `classifyBindSource()` and a rollback ledger for migration.

**Major components:**
1. accessGuard + permission matrix — authn, 2FA gate, authz
2. UserAdminService — owner invariants, user lifecycle, audit
3. AuditLog — append-only record
4. Proxy applier + snippet renderer — managed vs external modes
5. Migration ledger/journal — verified rollback, crash recovery

### Critical Pitfalls

1. **OIDC implicit linking / signup** — `disableImplicitLinking: true`, never `trustedProviders`, link only from an authenticated session, `databaseHooks.user.create.before` blocks first-user and sets lowest role.
2. **Route/SSE coverage** — `onRoute` boot check, role-by-route matrix test, SSE registry closing streams on revoke.
3. **Rollback deletes volumes** — new keep-volumes `down`, argv-assertion test, migration journal for crash recovery.
4. **Owner lockout on upgrade** — migration backfill of oldest user to owner + boot `ensureOwnerInvariant`; column default must not be owner.
5. **Password reset holes** — background mail send (timing oracle), revoke sessions, strict rate limit incl. `GET /reset-password/*`, configured base URL only.

## Implications for Roadmap

### Phase 1: Migration Correctness
**Rationale:** Independent; fixes data-loss risks in shipped code.
**Delivers:** #108 AppError cause, compose-project resolver, #102 verified stop, #101 named volumes, #104 `~` classifier, #106 scanner predicate.
**Avoids:** wrong-project stop, empty auto-created volumes.

### Phase 2: Migration Rollback and UX
**Delivers:** #100 rollback ledger (verified wording, keep-volumes down, no `--remove-orphans`, journal + startup recovery), #107 backup-before-stop + disk check, #103 shared `maskSecrets`, #105 operation store + shared event schemas, #109 compose env allowlist + Linux root CI job.

### Phase 3: Proxy (#86 then #44)
**Delivers:** applier extraction, shared compose collection editor (map + list forms), vhost.d spike, WebSocket setting, external mode (unique `docktor-<stackId>-<svc>-<n>` router names, snippets, settings, `certSource=external`, poller skip, mode switch blocked while rows exist).

### Phase 4: better-auth Upgrade + Access Foundation (dark launch)
**Delivers:** upgrade with auth suite green, shared matrix, role migration + backfill, `ensureOwnerInvariant`, `accessGuard` + `onRoute` check, inventory/matrix tests, `useCan`, mandatory-2FA route owner-only.

### Phase 5: Audit Log
**Delivers:** model, repository, service, audit hook, denial recording, auth recorder, pruner, API + UI.

### Phase 6: SSE Hardening
**Delivers:** `sse-stream.ts`, heartbeat/revalidation, `revoked` frame, `EVENT_PERMISSIONS`. Must land before any non-owner exists.

### Phase 7: Password Reset
**Delivers:** background mail, session revocation, `/api/auth-options`, strict limiter, configured base URL. Finishes after Phase 6.

### Phase 8: Multi-User Administration
**Delivers:** `UserAdminService`, `/api/users*`, transactional last-owner invariant, create/invite, Users page, notification recipients by role. Full role matrix in CI.

### Phase 9: OIDC
**Delivers:** `genericOAuth` env-configured with read-only status UI, explicit linking, no first-user creation, 2FA-gate exemption for passwordless OIDC users, redirect URI display, fake-IdP test.

### Phase Ordering Rationale
Migration and proxy are independent of auth and go first so the auth retrofit covers every route they add. Within auth: enforcement → audit → SSE → non-owner users → OIDC.

### Research Flags
- **Spike:** Phase 3 WebSocket (vhost.d `_location` timeouts, reload without compose diff, acme-companion collisions, 60 s idle drop); Phase 4/8 admin plugin (`disabledPaths` vs `auth.api.*`); Phase 9 OIDC (1.7 `signIn.social`, `email_verified` per IdP, 2FA for OIDC sessions).
- **Decision only:** #107 warm copy vs honest "crash-consistent at best".
- **Standard patterns:** Phases 1, 2, 5, 6, 7; external mode (golden-file tests). Real-Docker tests run in GitHub Actions, not on the VPS.

### Conflicts Resolved
- better-auth version: target `^1.7.12`; 1.4.18-specific details superseded.
- WebSocket: field means "long-lived connections" (timeouts only, never `proxy_set_header`); default OFF; Upgrade always forwarded. Confirm default.
- OIDC config: env-driven for v0.2.0, DB-backed later (confirm with user).
- Admin plugin: adopt behind `disabledPaths` via `UserAdminService`, subject to spike.
- Owner backfill: migration `UPDATE` plus boot `ensureOwnerInvariant`; check against `server/CLAUDE.md` migration rule.

### Open Product Decisions (ratify before Phase 4)
Viewer: no logs, masked compose, no env. Operator: may trigger backups, not restore. OIDC JIT user creation off by default (Viewer if on). OIDC sessions exempt from mandatory 2FA only for users without a password credential. External-mode switch blocked while `ProxyConfig` rows exist. Notification recipients by role. Roles global; no per-stack table.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry, package source, advisories |
| Features | MEDIUM-HIGH | Dockge/CapRover evidence weak |
| Architecture | MEDIUM-HIGH | Parts written against 1.4.18; vhost override unverified |
| Pitfalls | HIGH | Mostly derived from this repo |

**Overall confidence:** MEDIUM-HIGH. Not verified by execution: nginx-proxy reload behaviour, Traefik runtime, `cp -a` ownership as non-root.

## Sources
See STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md in this directory.

---
*Research completed: 2026-10-21*
