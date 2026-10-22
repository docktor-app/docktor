# Roadmap: Docktor

## Overview

Docktor v0.1.0 (Phases 1-16) and v0.1.1 (Phases 17-21) are shipped. This roadmap covers **v0.2.0 (Migration Hardening, Proxy & Access)**: make the brownfield migration flow trustworthy, widen the reverse-proxy options, and replace the single-user model with real access control. Phase numbering continues from the previous milestone, so v0.2.0 starts at Phase 22.

The 31 v0.2.0 requirements (MIG, PRX, RBAC, USR, AUD, RST, OIDC) form three largely independent streams. Migration hardening (Phase 22) fixes data-loss paths in already-shipped code, so it goes first. The proxy work (Phase 23) is independent of both migration and auth and runs before the access phases so the new route inventory covers every route it adds. The access retrofit then runs in a strict order because the Docker socket makes any mutation host-root: the better-auth upgrade and permission foundation first, dark-launched while every user is still an owner (Phase 24); the audit log and per-role stream authorization next (Phase 25), which must land before any non-owner user exists; password reset and user administration after that (Phase 26), because session revocation and non-owner roles both depend on the hardened streams; OIDC last (Phase 27), because it provisions into roles, invited users and the audit log. Granularity is coarse: research proposed nine phases, merged here into six without crossing any of those ordering constraints. Product scope lives in GitHub Issues (`docktor-app/docktor`); each requirement in REQUIREMENTS.md cites its source issue.

## Milestones

- ✅ **v0.1.0 First Release** - Phases 1-16 (shipped; archived)
- ✅ **v0.1.1 Release Follow-ups** - Phases 17-21 (shipped 2026-10-21; archived)
- 🚧 **v0.2.0 Migration Hardening, Proxy & Access** - Phases 22-27 (in progress)

## Phases

<details>
<summary>✅ v0.1.0 First Release (Phases 1-16) - SHIPPED</summary>

Full roadmap archived at `.planning/milestones/v0.1.0-ROADMAP.md`; phase directories (plans, summaries, verification, UAT) at `.planning/milestones/v0.1.0-phases/`; the v0.1.0 project memory (decisions, blockers, metrics) at `.planning/milestones/v0.1.0-STATE.md`.

What shipped, by phase (Phase 05.1 was an inserted stabilization phase):

- Phases 1-4: MVP completion (settings, container state poller, live log streaming), observability (file watcher, update checker), SMTP notifications, encrypted restic backup and restore
- Phases 5, 05.1, 6: first-run wizard and brownfield import with migration, stabilization of blockers found in testing, nginx-proxy + acme-companion proxy configuration
- Phases 7-9: data-safety hardening, live SSE state consistency, deployment docs, real Prisma migrations, cross-platform CI, custom TLS certificates
- Phases 10-11: backend architecture refactor (ports, job registry, domain-event bus) and UI rework (shadcn patterns, ToneBadge/StatusDot, dark mode, CodeMirror editors)
- Phases 12-15: compose safety and git-based templates, update-checker reliability, health/uptime/disk visibility, TOTP 2FA and auth hardening
- Phase 16: release readiness (startup environment check, MIT license, community health files, published images, documentation)

Deferred past v0.1.0 and still tracked in GitHub Issues: public demo instance (#53). Backlog item 999.1 below is unchanged.

</details>

<details>
<summary>✅ v0.1.1 Release Follow-ups (Phases 17-21) - SHIPPED 2026-10-21</summary>

Full roadmap archived at `.planning/milestones/v0.1.1-ROADMAP.md`; requirements at `.planning/milestones/v0.1.1-REQUIREMENTS.md`; phase directories (plans, summaries, verification, UAT) at `.planning/milestones/v0.1.1-phases/`; the v0.1.1 project memory (decisions, blockers, metrics) at `.planning/milestones/v0.1.1-STATE.md`.

What shipped, by phase:

- Phase 17: backups use the configured SFTP/S3 repository; deploy-time port warnings stop flagging a stack's own ports
- Phase 18: import and migration flow (Docktor's own stack hidden from import, real line diff, explicit backup and stop-old-stack choices, in-place migration, background migration operations with live progress)
- Phase 19: labelled sidebar sections, standalone Templates page, running version and project links above the account menu
- Phase 20: one status casing, monospace KPIs, shared form and table look, honest backup-coverage card, 44px mobile touch targets
- Phase 21: release gate (versions at 0.1.1, changelog, CI green on `release/v0.1.1`)

</details>

### 🚧 v0.2.0 Migration Hardening, Proxy & Access (In Progress)

**Milestone Goal:** Make the brownfield migration flow trustworthy, widen reverse-proxy options, and replace the single-user model with real access control.

**Phase Numbering:**

- Integer phases (22, 23, 24): Planned milestone work
- Decimal phases (22.1, 22.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 22: Migration Hardening** - The old stack is verifiably stopped, every volume is copied faithfully, secrets stay masked, a backup exists before downtime, and a failed migration puts the original stack back without losing data
- [ ] **Phase 23: Proxy Modes and WebSocket Support** - Users can run their own reverse proxy (Traefik labels and Caddy/NPM/nginx snippets) and mark individual proxied domains as long-lived-connection (WebSocket) domains
- [ ] **Phase 24: better-auth Upgrade and Access Control Foundation** - Every API route enforces a documented four-role permission matrix through one guard, existing instances upgrade with their oldest user as owner, and the UI only offers actions the role may perform (dark launch)
- [ ] **Phase 25: Audit Log and Live-Stream Authorization** - Mutations, auth events and access denials land in an append-only log owners and admins can filter, and live streams are authorized per role and cut off on session revoke or role change
- [ ] **Phase 26: Password Reset and User Administration** - Users recover their own accounts by email, and owners and admins create, edit, disable and assign roles to users without ever locking out the last owner
- [ ] **Phase 27: OIDC Sign-in** - An owner connects an OpenID Connect provider for sign-in alongside email and password, with no implicit account creation or linking

## Phase Details

### Phase 22: Migration Hardening

**Goal**: Users can migrate an existing stack knowing the old stack is truly stopped, every volume is copied faithfully, secrets stay masked, a backup exists before downtime, and a failure puts the original stack back without losing data
**Depends on**: Nothing (first phase of v0.2.0)
**Requirements**: MIG-05, MIG-06, MIG-07, MIG-08, MIG-09, MIG-10, MIG-11, MIG-12, MIG-13
**Success Criteria** (what must be TRUE):

  1. Migrating a stack that was started under a different compose project (`docker compose -p`, `COMPOSE_PROJECT_NAME`, another directory name) stops the real old containers and confirms they are stopped before any data is copied; if the stop cannot be verified, the migration refuses and says why instead of copying live data
  2. A stack with named volumes has the volume its compose file actually refers to copied (never an empty one auto-created in its place), anonymous volumes are flagged to the user instead of silently starting empty, and `~` bind sources are analysed, rewritten and copied to the right location
  3. When a migration step fails, or Docktor restarts in the middle of a migration, the original stack is restored and running again, no volume is deleted by the rollback, and the result shown to the user states only outcomes that were verified (for example "restart requested" until the containers are seen running)
  4. With backup chosen, the pre-migration backup is taken before the old stack is stopped; free disk space is checked on the filesystem that will receive the data, and a shortfall blocks the migration before any downtime; the review diff shows secret values (map and list env forms, URL credentials) masked behind one reveal toggle
  5. The migration progress toast always ends in a terminal state (done, failed or rolled back), including after a reload, reconnect or leaving the page; compose commands run by Docktor never see Docktor's own secrets or `COMPOSE_*` variables; migration request paths that escape the permitted directories are refused with a validation error; and a Linux CI job proves the data copy preserves ownership and modes

**Plans**: TBD
- [x] 22-01-PLAN.md
- [x] 22-02-PLAN.md
- [x] 22-03-PLAN.md
- [x] 22-04-PLAN.md
- [ ] 22-05-PLAN.md
- [ ] 22-06-PLAN.md
- [ ] 22-07-PLAN.md
- [ ] 22-08-PLAN.md

Notes: source issues [#100](https://github.com/docktor-app/docktor/issues/100), [#101](https://github.com/docktor-app/docktor/issues/101), [#102](https://github.com/docktor-app/docktor/issues/102), [#103](https://github.com/docktor-app/docktor/issues/103), [#104](https://github.com/docktor-app/docktor/issues/104), [#105](https://github.com/docktor-app/docktor/issues/105), [#107](https://github.com/docktor-app/docktor/issues/107), [#108](https://github.com/docktor-app/docktor/issues/108), [#109](https://github.com/docktor-app/docktor/issues/109). Largest phase of the milestone (9 requirements); natural plan seam for plan-phase: correctness first (error `cause` hygiene, shared compose-project resolver, verified stop, named-volume and `~` handling), then rollback and UX (rollback ledger with journal and startup recovery, backup-before-stop with disk check, shared `maskSecrets`, operation store with shared event schemas, compose env allowlist and Linux root CI job). The shared event schemas and `maskSecrets` are reused by Phases 24-25, and the `AppError` cause change must land before the auth work adds error subclasses. Rollback must never run `down -v` (the only existing `down` deletes volumes). Decide in discuss-phase for #107: warm pre-stop copy versus honest "crash-consistent at best" wording. Real-Docker and ownership tests run in GitHub Actions, not on the VPS; any live `docker compose` test must use a collision-proof random project name.

### Phase 23: Proxy Modes and WebSocket Support

**Goal**: Users can run their own reverse proxy instead of the managed one, and can mark individual proxied domains as needing long-lived (WebSocket) connections
**Depends on**: Nothing (independent of the migration work; runs before the access phases so their route inventory covers every route added here)
**Requirements**: PRX-01, PRX-02, PRX-03, PRX-04, PRX-05
**Success Criteria** (what must be TRUE):

  1. On a proxied domain the user can switch "WebSocket support" on or off; it defaults to off, survives a reload and a redeploy, and is shown on the stack's Proxy tab
  2. A long-lived connection through a domain with WebSocket support on stays open past the proxy's default idle timeout and takes effect without hand-editing a compose file, while a domain with it off keeps the default behaviour
  3. In Settings the user can choose the proxy mode (managed or external); switching is blocked, with an explanation, while any proxy domains exist
  4. In external mode, configuring a domain on a service writes Traefik labels (a unique router name per stack and service) into that service's compose file, and the Proxy tab shows copyable Caddy, Nginx Proxy Manager and plain nginx snippets for the same domain
  5. In external mode Docktor deploys no proxy stack and does no certificate management, and the certificates view shows those domains as "managed externally"

**Plans**: TBD
**UI hint**: yes

Notes: source issues [#44](https://github.com/docktor-app/docktor/issues/44) and [#86](https://github.com/docktor-app/docktor/issues/86); the ProxyProvider abstraction ([#43](https://github.com/docktor-app/docktor/issues/43)) is deferred. Research flag, spike before building: nginx-proxy already forwards `Upgrade` headers for every vhost, so the WebSocket field means "long-lived connections" (timeouts only, never `proxy_set_header`), default off; verify the `vhost.d` reload behaviour, acme-companion collisions and the 60 s idle drop. Suggested order: #86 first, extracting the pure applier seam from `ProxyService` so nginx env and Traefik labels share it, then #44. External mode needs a shared compose collection editor (map and list forms), `certSource=external`, a poller skip, and golden-file tests for the Traefik label output. Real-Docker tests run in GitHub Actions, not on the VPS.

### Phase 24: better-auth Upgrade and Access Control Foundation

**Goal**: Every API route enforces a documented four-role permission matrix through one server guard, existing instances upgrade with their oldest user as owner and nothing changes for them, and the UI only offers actions the signed-in role may perform, all dark-launched while every existing user is still an owner
**Depends on**: Phase 22, Phase 23 (every route they add must be covered by the guard)
**Requirements**: OIDC-05, RBAC-01, RBAC-02, RBAC-03, RBAC-05
**Success Criteria** (what must be TRUE):

  1. Docktor runs on better-auth 1.7.x and the existing auth test suite (sign-up, login, session persistence, 2FA, the mandatory-2FA gate) passes
  2. An existing v0.1.1 instance upgrades with no manual steps: on first boot the oldest user becomes owner, every existing user signs in as before, and a boot-time check guarantees an owner exists
  3. The four roles (owner, admin, operator, viewer) and their permission matrix are documented once in `@docktor/shared` and used by both server and client, and a role-by-route test shows each role gets exactly the allowed responses and a 403 elsewhere for every API route
  4. Registering an API route without a declared required permission makes the server refuse to boot
  5. Signed in as each role (test fixtures; the Users page arrives in Phase 26), the UI hides the actions that role cannot perform, for example a viewer sees no deploy, edit or delete controls

**Plans**: TBD
**UI hint**: yes

Notes: OIDC-05 lives here, not in Phase 27, because the upgrade is a prerequisite for the whole access stream and must be its own first step (watch `freshAge` now counting from `createdAt`, the `enableTwoFactor` return-type change and the rewritten generic OAuth API). Source issues [#87](https://github.com/docktor-app/docktor/issues/87) and [#64](https://github.com/docktor-app/docktor/issues/64). Structure: one root `onRequest` access guard with a boot-time `onRoute` check replacing the per-plugin `requireAuth` hooks; role migration with oldest-user backfill plus a boot `ensureOwnerInvariant` (the column default must not be owner; check against the migration rule in `server/CLAUDE.md`); a `can(user, action, {stackId?})` seam for later per-stack scoping, with roles global for now. Ratify the open product decisions before planning (viewer: no logs, masked compose, no env; operator: may trigger backups, not restore; roles are global, no per-stack table). Research spike: better-auth `admin` plugin used for storage only, with its HTTP surface disabled via `disabledPaths` while Docktor's own `/api/users*` routes wrap `auth.api.*`.

### Phase 25: Audit Log and Live-Stream Authorization

**Goal**: Every mutation, auth event and access denial is recorded in an append-only audit log that owners and admins can read, and live event streams are authorized per role and cut off when a session or role changes
**Depends on**: Phase 24 (the guard, the matrix and a resolved actor identity)
**Requirements**: AUD-01, AUD-02, RBAC-04
**Success Criteria** (what must be TRUE):

  1. Deploying, editing or deleting a stack, changing settings, signing in and out, a failed sign-in and a denied (403) request each add an audit entry with actor, target and outcome, and no entry contains secrets such as compose or env content, passwords or tokens
  2. Audit entries cannot be edited or deleted through the application
  3. An owner or admin can open the audit log and filter it; operators and viewers cannot reach it
  4. The live event and log streams deliver only what the signed-in role may see, and a stream is closed with a visible signed-out or role-changed state (not a silently dead page) when its session is revoked or its role changes

**Plans**: TBD
**UI hint**: yes

Notes: must land before any non-owner user exists (Phase 26). Audit: append-only `AuditLog` table without foreign keys, fed by a route-config audit hook, denial recording and better-auth `hooks.after` for auth events, with a retention pruner; metadata stores keys and identifiers, never values, reusing `maskSecrets` from Phase 22. Streams: a shared `sse-stream.ts` helper with heartbeat, periodic revalidation, a terminal `revoked` frame and per-event filtering through an `EVENT_PERMISSIONS` map built on the shared event schemas from Phase 22; hooks keep closing the `EventSource` on cleanup, and a 403 on the stream must end the migration toast with an error. Standard patterns.

### Phase 26: Password Reset and User Administration

**Goal**: Users can recover their own accounts by email, and an owner or admin can create, edit, disable and assign roles to other users without ever being able to lock the instance out of its last owner
**Depends on**: Phase 25 (session revocation and non-owner roles rely on the authorized, closable streams, and user-admin changes must be audited from the first day)
**Requirements**: RST-01, RST-02, RST-03, USR-01, USR-02
**Success Criteria** (what must be TRUE):

  1. From the login page a user can request a password reset by email, and a known and an unknown address get the same neutral response
  2. A reset link works exactly once and expires; completing a reset signs the user out of every session (open tabs lose their live streams), and a user with 2FA still has to pass 2FA to sign in afterwards
  3. When SMTP is not configured the reset flow is unavailable and the login page says so, instead of offering a link whose email never arrives
  4. An owner or admin can create or invite a user, edit them, disable them (a disabled user is signed out and cannot sign in) and assign their role from a Users page
  5. The last owner cannot be demoted, disabled or deleted, from the UI or through concurrent API requests

**Plans**: TBD
**UI hint**: yes

Notes: source issues [#79](https://github.com/docktor-app/docktor/issues/79) and [#64](https://github.com/docktor-app/docktor/issues/64). Password reset comes first inside the phase because the invite flow reuses the same mail and link mechanism. Reset hardening: mail sent in the background (no timing oracle), session revocation on reset, a strict rate limit that also covers `GET /reset-password/*`, links built from the configured base URL only, and a `/api/auth-options` endpoint so the login page can tell whether reset is available. User administration: a `UserAdminService` wrapping `auth.api.*`, a transactional last-owner invariant, notification recipients chosen by role, and the full role matrix exercised in CI.

### Phase 27: OIDC Sign-in

**Goal**: An owner can connect an OpenID Connect provider so people can sign in with it alongside email and password, with no path that silently creates or takes over an account
**Depends on**: Phase 26 (invited users, roles, user administration and audit), Phase 24 (better-auth 1.7)
**Requirements**: OIDC-01, OIDC-02, OIDC-03, OIDC-04
**Success Criteria** (what must be TRUE):

  1. The owner can set up an OIDC provider and see its status in Settings, including the redirect URI to register at the provider; other roles cannot view or change it
  2. The login page offers sign-in with the configured provider next to email and password, and both methods work
  3. An OIDC sign-in from an unknown identity creates no account and links to none by email match; an identity links only from an already authenticated account or to an invited user with a verified email, and otherwise the user sees a clear refusal
  4. A user with no password credential who signs in through OIDC is not blocked by the mandatory-2FA gate, while users with a password credential are still held to it

**Plans**: TBD
**UI hint**: yes

Notes: source issues [#61](https://github.com/docktor-app/docktor/issues/61) and [#87](https://github.com/docktor-app/docktor/issues/87). Use core `genericOAuth` (not the SSO plugin or SAML) with `disableImplicitLinking` and `disableImplicitSignUp`, never `trustedProviders`; `databaseHooks.user.create.before` blocks first-user creation and assigns the lowest role. Just-in-time user creation stays deferred (Future Requirements). Open decision to confirm in discuss-phase: research recommends env-driven provider config with a read-only status page for v0.2.0 and DB-backed config later, while OIDC-01 says "configure in Settings". Research spike: better-auth 1.7 `signIn.social` flow, `email_verified` behaviour per provider, and 2FA for OIDC sessions. A fake-IdP test runs in CI.

## Progress

**Execution Order:**
Phases execute in numeric order: 22 → 23 → 24 → 25 → 26 → 27

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22. Migration Hardening | 4/8 | In Progress | - |
| 23. Proxy Modes and WebSocket Support | 0/TBD | Not started | - |
| 24. better-auth Upgrade and Access Control Foundation | 0/TBD | Not started | - |
| 25. Audit Log and Live-Stream Authorization | 0/TBD | Not started | - |
| 26. Password Reset and User Administration | 0/TBD | Not started | - |
| 27. OIDC Sign-in | 0/TBD | Not started | - |

Phases 1-16 (v0.1.0) and Phases 17-21 (v0.1.1) are complete and archived; see `.planning/milestones/v0.1.0-ROADMAP.md` and `.planning/milestones/v0.1.1-ROADMAP.md`.

## Backlog

### Phase 999.1: Follow-up — Phase 12 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 12 verification
**Source phase:** 12
**Deferred at:** 2026-10-04 during /gsd-verify-work 12 session completion
**Follow-ups:**
- [ ] Test 2: pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc. (deferred 2026-10-04)
