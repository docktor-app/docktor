# Pitfalls Research

**Domain:** Docktor v0.2.0 (subsequent milestone) — retrofitting multi-user RBAC, OIDC, password reset and an audit log onto a single-user Docker-socket-equals-root app; external proxy mode and nginx-proxy WebSocket support; hardening a data-moving brownfield migration flow
**Researched:** 2026-10-21
**Confidence:** HIGH for codebase-derived findings (read from this repo and from the installed `better-auth@1.4.18` source); MEDIUM for nginx-proxy and Traefik behaviour (official docs and templates, not executed here); LOW items are tagged inline.

> This file replaces the 2026-03-10 MVP pitfalls file (poller races, log-stream leaks, etc.). Those shipped and were validated in Phases 1-9. This file covers only v0.2.0 work.

**Phase labels used below** (the roadmapper may rename them; the dependency logic is what matters):
- **P-MIG** migration hardening (#100-#109)
- **P-PROXY** external proxy mode (#44) and WebSocket (#86)
- **P-AUTHZ** authorization foundation: roles, per-route enforcement, SSE authz, audit log (#64, #87)
- **P-RESET** password reset by email (#79)
- **P-OIDC** OIDC sign-in (#61, #87)

Findings that came from reading the actual code are marked **[code]**. Findings from better-auth source are marked **[ba-1.4.18]**. The installed version is 1.4.18 and npm `latest` is 1.7.12, so the better-auth online docs describe options that 1.4.18 does not have (see Pitfall 11).

---

## Critical Pitfalls

### Pitfall 1: Role column default silently locks out, or silently promotes, existing users on upgrade

**What goes wrong:**
The migration adds `User.role`. Two failure modes, both bad.
(a) Default `viewer` and no backfill: the existing single owner upgrades, signs in, and gets 403 on everything. The #87 acceptance criterion "existing single-user instances keep working with no migration steps; the first account stays the owner" is broken, and the only recovery is SQL.
(b) Default `owner` (to "keep old users working"): every user created afterwards, including OIDC just-in-time users, is an owner unless every creation path sets a role.

**Why it happens:**
Prisma `@default()` is one value for both backfill and future inserts, and the better-auth user-creation paths (sign-up, OAuth callback, admin create) are separate code paths that do not all go through Docktor's code. **[code]** The only guard today is the `before` hook on `/sign-up/email`.

**How to avoid:**
- Use a migration with two statements: add the column with the least-privileged default (or no default plus a NOT NULL set after backfill), then `UPDATE "User" SET role='owner' WHERE id = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1)`. Decide explicitly what happens to any other pre-existing users (realistically zero, since self-signup is blocked once one user exists). Recommended: oldest becomes owner, the rest become admin, and the migration logs it.
- Set the role for new users in one place (a better-auth `databaseHooks.user.create.before`) so no creation path can skip it. Never take the role from request input: declare the field with `input: false` in better-auth `additionalFields`, otherwise `/api/auth/update-user` lets any user write their own role. **[ba-1.4.18]** `parseInputData` only skips fields with `input: false`.
- Add an upgrade test: restore a DB created by the v0.1.1 schema (run the real `prisma migrate deploy` including the Phase 09 auto-baseline path), boot, sign in as the existing user, assert owner and `GET /api/stacks` returns 200.
- Never cache the role in the session cookie or a JWT. `session.cookieCache` is deliberately off for revocation (see `auth.ts` GHSA note); keep it off so demotion takes effect on the next request.

**Warning signs:**
First-run wizard or "is setup complete" logic still derived from `user.count() === 0`; two owners after a fresh OIDC login; a migration file with no `UPDATE`.

**Phase to address:** P-AUTHZ (first plan: schema + backfill + upgrade test, before any route enforcement).

---

### Pitfall 2: Authorization enforced by hand per route, so a route (or SSE stream) is missed

**What goes wrong:**
Docktor has 87 route handlers in 15 files, each file adds `app.addHook("onRequest", requireAuth)` itself. **[code]** `requireAuth` is authentication plus the 2FA gate, not authorization. Adding `requirePermission("stack:deploy")` by hand to 87 handlers, then every future route, guarantees one is missed. A missed route on a Docker-socket app is a viewer-to-root bug. Routes with a file-level hook and no per-route permission would silently default to "any signed-in user".

**Why it happens:**
Retrofits copy the existing pattern (a hook per file). The existing pattern has no concept of "this route declared no permission".

**How to avoid:**
- Make deny-by-default structural: a Fastify `onRoute` hook that reads `routeOptions.config.permission` (or `config.public === true` for health, setup, `/api/auth/*`) and **throws at boot** if neither is declared. A unit test enumerates registered routes and asserts every one is classified.
- Express permissions in route `config`, enforced by one global `onRequest` hook, rather than N hooks.
- Write the permission matrix first as a table in docs and as a typed constant in `@docktor/shared` (client uses it to hide UI, server is authoritative). Tests loop over `role x route` and assert allowed and denied.
- Treat `/api/auth/*` as a separate surface (see Pitfall 6): it is a catch-all that bypasses Fastify hooks entirely.

**Warning signs:**
A PR that adds a route file and touches no permission table; `requireAuth` imported in a new route without a permission; UI hides a button but the API test for the viewer role returns 200.

**Phase to address:** P-AUTHZ (the structural guard lands before any route is converted; conversion is then mechanical and checkable).

---

### Pitfall 3: SSE streams authorized once at connect, never re-checked or filtered

**What goes wrong:**
**[code]** `/api/events` calls `requireAuth` in `onRequest`, then `stateEventBroadcaster.subscribe()` forwards every event for every stack to every subscriber for as long as the socket stays open. `/api/stacks/:id/logs` and the backup log stream do the same. Four concrete failures once RBAC exists:
1. **Revocation does not reach open streams.** #79 requires "resetting a password signs out all existing sessions", and #87 requires demotion to take effect. The sessions are deleted from the DB but the already-open SSE connections keep delivering events until the browser closes. A fired or demoted user keeps a live feed.
2. **No per-subscriber filtering.** If per-stack scoping exists, every subscriber still receives every `stackId`, `config_changed`, `update_available`, `proxy_cert_status` (domains), `notification_created` and migration-operation events (host paths).
3. **Logs are secrets.** Container logs routinely print tokens and connection strings. A role that can "view" status but not read `.env` must not get `/logs` either; that needs its own `logs:read` permission.
4. **Client reconnect storm on 403.** `EventSource` cannot read the status code; on a terminal HTTP error it goes CLOSED, but Docktor's hooks have auto-reconnect logic. A hook that retries on any error will hammer the server after a 401/403.

**Why it happens:**
SSE feels like "just a GET", so it gets the same hook as REST, and the long-lived nature of the connection is forgotten.

**How to avoid:**
- Introduce a `ConnectionRegistry` that records `{userId, sessionToken, response}` per SSE connection. On session revoke, role change, user ban/delete and password reset, close that user's (or all) connections. Hook into better-auth `databaseHooks.session.delete.after` and the role-change service path.
- Backstop: re-validate the session and permission on a timer (for example every 60 s, riding on the heartbeat) and close on failure. Sessions that simply expire mid-stream are not enforced today either.
- Filter at the broadcaster: `subscribe(predicate)` where the predicate is built from the user's permissions at connect time and refreshed when they change. Never filter in the client.
- Add a 15-25 s `: ping` comment heartbeat to every SSE stream. It keeps nginx/NPM (60 s default read timeout) from closing idle streams, and it gives the re-validation timer a place to live. **[code]** `/api/events` currently writes only `: connected` then events.
- Client: treat a closed stream as "probe `/api/auth/get-session`"; on 401/403 stop retrying and route to login or a permission message.
- Test: open an SSE stream as user A, revoke A's session, assert the socket closes within N seconds. This test is the verification for #79's "signs out all sessions" as well.

**Warning signs:**
Authz tests that only call REST routes; no test holding a stream open across a revoke; `subscribe()` still takes only a callback.

**Phase to address:** P-AUTHZ (registry and heartbeat), re-verified in P-RESET (session revocation) and P-OIDC.

---

### Pitfall 4: Roles are treated as a security boundary where the capability is root-equivalent

**What goes wrong:**
Docktor mounts the Docker socket. Anyone who can write a compose file can add `privileged: true`, mount `/var/run/docker.sock` or `/` and own the host; anyone who can run the import wizard can read host files through the `/host` mount; anyone who can add a template repo triggers a `git clone` of an arbitrary URL. A "deployer" role with "per-stack scoping" gives a false sense of isolation: stack A's deployer edits compose to bind-mount stack B's `volumes/`.

**Why it happens:**
RBAC is modelled on app resources (stacks) while the real resource is the daemon. **[code]** `GET /api/stacks/:id/env` returns `.env` plaintext, `PUT /api/stacks/:id` writes compose, `/api/stacks/import/*` reads arbitrary host paths, `/api/settings/smtp/test` connects to an arbitrary host (SSRF-class), certificates hold private keys, backups hold the restic repository password.

**How to avoid:**
- Decide and **document** that compose-write capability equals host-root. Roles are capability tiers, not isolation. Suggested tiers: `owner` (everything, role management), `admin` (everything except owner management), `operator` (deploy/stop/restart/update/logs on stacks; **no** compose/env write, no create/delete, no import, no settings), `viewer` (status only; no env, no logs, no compose content).
- Treat per-stack scoping as out of scope for v0.2.0 unless the compose rule engine (`compose-rule-engine.ts`) also blocks `docker.sock`, `privileged`, `pid: host`, `cap_add`, and bind mounts outside the stack directory for non-admin writers. State this reasoning in the docs (#87 asks that it be "decided and documented").
- Classify each of the 87 routes into the matrix explicitly. High-risk, admin-or-owner only: import/migration, settings (SMTP, backup, proxy), templates repos, certificates, proxy deploy, user management, audit log read.
- Add a "who can become root" paragraph to `docs/deployment.md`.

**Warning signs:**
An `operator` role with `stack:write`; a roadmap item "per-stack permissions" with no mention of compose content; tests that only check "viewer cannot delete".

**Phase to address:** P-AUTHZ (design decision recorded before implementation; flagged `needs-design` in #87).

---

### Pitfall 5: OIDC sign-in silently reopens self-registration

**What goes wrong:**
**[code]** Self-registration is blocked only by a `before` hook scoped to `ctx.path === "/sign-up/email"`. Adding the OIDC (genericOAuth) plugin adds `/sign-in/oauth2` and `/oauth2/callback/:providerId`, which create users through a different path. Unless told otherwise, **any** identity the IdP will authenticate becomes a Docktor user. With a public IdP (Google, GitHub, an Authentik with open signup) that means anyone on the internet gets an account on a Docker-root management plane.

**Why it happens:**
The "no self-registration" rule was implemented as a path check instead of as a user-creation invariant.

**How to avoid:**
- Set the provider to `disableSignUp: true` (or `disableImplicitSignUp: true`) **[ba-1.4.18]**: `handleOAuthUserInfo` returns "signup disabled" for unknown identities. First-time OIDC users must be pre-provisioned by an admin (invite by email, then link on first OIDC login), or provisioned with an explicit, admin-configurable allow rule (verified email domain allow-list, IdP group claim) and the **lowest** role.
- Enforce the invariant at the data layer: `databaseHooks.user.create.before` rejects creation unless it comes from the setup wizard, an admin invite, or an allow-listed OIDC identity. That covers every current and future plugin path.
- JIT-provisioned users get `viewer` (or a "pending" status needing admin approval). Never `owner`/`admin`, never an IdP-claim-to-role mapping in v0.2.0 without a test.
- Add an integration test per entry path: email sign-up, OIDC callback with an unknown identity, OIDC callback with a known identity.

**Warning signs:**
An OIDC test that only exercises "existing user logs in"; `disableSignUp` absent from the provider config; new users appearing in the user list that no admin created.

**Phase to address:** P-OIDC (with the user-creation invariant introduced in P-AUTHZ).

---

### Pitfall 6: Implicit account linking is a 2FA bypass and a takeover vector

**What goes wrong:**
**[ba-1.4.18]** In `handleOAuthUserInfo`, if an OIDC sign-in's email matches an existing user and the IdP reports `email_verified`, better-auth **automatically links** the OIDC account to the existing user and signs them in. It never runs the twoFactor plugin because that plugin only intercepts credential sign-in. So:
1. An attacker who can get a verified email equal to the owner's at the IdP (weak IdP verification, an IdP that lets users set unverified emails, or the known "mutable `email` claim" class of Entra/Azure issues) logs in as the owner **without the owner's password and without TOTP**. This is exactly the failure #79 and #45 forbid ("must not bypass 2FA").
2. `trustedProviders: ["<oidc-id>"]`, which people add to make linking "just work" when the IdP omits `email_verified`, removes even the verified check. The docs say so explicitly.
3. **[code]** Docktor's own setup wizard never verified the owner's email (`emailVerified` false). Local-account email is therefore not proof of ownership on either side.
4. The default userinfo mapping returns `emailVerified: userInfo.data?.email_verified ?? false`, so IdPs that omit the claim (many self-hosted ones) produce `account_not_linked` for existing users and invite the `trustedProviders` workaround.

**Why it happens:**
Auto-linking by email is the library default and is convenient for the demo ("sign in with Google works for my existing account").

**How to avoid:**
- Set `account.accountLinking.disableImplicitLinking: true` **[ba-1.4.18]** and never use `trustedProviders`. Linking happens only from an authenticated Docktor session (account settings "Link OIDC provider"), via the plugin's link endpoint, which also checks `link.email === userInfo.email` unless `allowDifferentEmails`.
- Bind identity to `(providerId, sub)` (the account row), never to email after linking. Do not turn on `overrideUserInfo` for provider-supplied email.
- Decide and document: does an OIDC login satisfy Docktor's 2FA? Recommended: yes only because the user explicitly linked it from an authenticated, 2FA-passed session, and document that the IdP's own MFA is then the control. Alternatively require TOTP for users who have it enabled even after OIDC; that needs a Docktor-side second-step gate, so scope it consciously.
- Pre-provisioned users (Pitfall 5) link on first login by an admin-set `(provider, expected-email)` pairing, not by guessing.
- Tests: OIDC callback with a verified email equal to an existing 2FA-enabled user and no prior link must fail with `account_not_linked`, never produce a session.

**Warning signs:**
`trustedProviders` in the config; a test named "links existing user by email"; no test with a 2FA-enabled victim.

**Phase to address:** P-OIDC. This one blocks the milestone if missed.

---

### Pitfall 7: Mandatory 2FA and OIDC-only users deadlock each other

**What goes wrong:**
**[code]** `requireAuth` returns 403 `TWO_FACTOR_ENROLLMENT_REQUIRED` when the instance flag is on and the user lacks TOTP. **[ba-1.4.18]** `/two-factor/enable` calls `validatePassword`, which requires a credential account. An OIDC-only user has no password, so the instance-wide mandatory flag means they can never enroll and are locked out permanently. If instead they bypass the gate, an OIDC user is exempt from a policy the admin set for "every user".

**Why it happens:**
The 2FA gate was designed when every user had a password.

**How to avoid:**
- Decide the policy explicitly: OIDC-authenticated sessions are exempt from `isEnrollmentRequired` (IdP is the second factor) and the Settings copy says "applies to password users". Implement in `requireAuth`/`isEnrollmentRequired` by checking whether the session came from a credential or an OIDC login (store `loginMethod` on the session or look at the user's linked accounts).
- Test matrix: `{password-only, password+OIDC, OIDC-only} x {mandatory on/off} x {2FA enrolled/not}`.
- Keep password login and the on-box 2FA reset script as the always-available break-glass path for the owner; never offer "disable password login" in v0.2.0.

**Warning signs:**
An OIDC user whose first request returns `TWO_FACTOR_ENROLLMENT_REQUIRED`; enrollment UI asking an OIDC user for a password they do not have.

**Phase to address:** P-OIDC (decision), P-AUTHZ (gate refactor).

---

### Pitfall 8: Password reset creates enumeration, weak-session and stale-credential holes

**What goes wrong:** (all **[ba-1.4.18]** unless marked)
1. **Timing oracle.** Both branches of `/request-password-reset` return the same JSON, but for a known user the handler `await`s `sendResetPassword` (SMTP round trip, hundreds of ms) while an unknown email returns immediately. The neutral confirmation (#79 AC2) is defeated by response time. `runInBackgroundOrAwait` awaits unless `advanced.backgroundTasks.handler` is configured.
2. **Sessions are not revoked by default.** `revokeSessionsOnPasswordReset` is off unless set; #79 requires it. The existing D-10 plumbing (`planSessionRevocation`, `deleteTrustDeviceRecords`) is keyed to a signed-in actor, and a reset has no session, so it will not fire. Trusted-device cookies (30 days, skip the second step) also survive a reset unless purged.
3. **Other reset tokens stay valid.** Only the used token row is deleted; every earlier unexpired `reset-password:*` row for the user keeps working. "Single-use" is per token, not per user.
4. **Link host comes from config.** The emailed link is `ctx.context.baseURL + /reset-password/<token>`. If `BETTER_AUTH_URL` is unset, baseURL is derived from the request, so a forged `Host`/`X-Forwarded-Host` can poison the link in the victim's email. **[code]** `BETTER_AUTH_URL` is optional in Docktor; Settings Base URL is a separate DB value.
5. **No per-address throttle.** The existing limiter is per IP + exact path (5 per 15 min). Rotating IPs can mail-bomb one victim and fill the Verification table. **[code]** `/request-password-reset` and `/reset-password` are not in `AUTH_STRICT_PATHS` yet, and the GET callback `/reset-password/:token` is a different path than the disabled `/reset-password`, so it is currently reachable.
6. **SMTP is runtime state, better-auth is init-time state.** **[code]** SMTP lives in the DB and can be changed or absent at any moment; `sendResetPassword` is fixed at startup. Without a guard, the endpoint answers a generic 400 "Reset password isn't enabled" or silently drops mail.
7. **Token exposure.** The token lands in the URL (proxy access logs, `Referer`); with SMTP `encryption: none` it travels in cleartext.
8. **Credential account creation.** `/reset-password` creates a credential account when none exists, so for an OIDC-only user a reset mail grants a password, which also reaches Pitfall 7.

**How to avoid:**
- Configure `advanced.backgroundTasks.handler` (fire-and-forget with error logging), or send mail from `sendResetPassword` without awaiting. Add a timing test (response time of known vs unknown email within noise).
- Set `revokeSessionsOnPasswordReset: true`, and in `onPasswordReset({user})` also purge trust-device records, delete the user's other reset tokens, and close SSE connections (Pitfall 3). Do not auto-sign-in after reset; the user signs in through the normal path, which runs 2FA.
- Gate with a `before` hook: when SMTP is not configured or no base URL is configured, return one clear error for **all** inputs (it reveals nothing about accounts). Build links only from the configured base URL, never from request headers.
- Add `/request-password-reset` and `/reset-password` to `AUTH_STRICT_PATHS` and add a second limiter keyed on the email (hash) for requests per hour.
- SPA reset page: read the token, then `history.replaceState` it away; set `Referrer-Policy: no-referrer` on that page; do not log URLs in `smtp-client.ts` (it already logs only recipient and subject, keep it that way).
- Required tests: reset for a 2FA user then sign-in returns the TOTP challenge, not a session; reset revokes a second session and closes its SSE stream; two reset requests, use the first, the second link is dead; unknown vs known email timing; SMTP absent returns the "unavailable" message for known and unknown emails.

**Warning signs:**
Reset latency differs by account existence; a still-working second browser session after reset; the reset page URL visible in the address bar after load.

**Phase to address:** P-RESET (depends on the SSE registry from P-AUTHZ for the "signs out all sessions" guarantee to be true).

---

### Pitfall 9: Behind a reverse proxy, every user shares one rate-limit bucket (and the audit log records the proxy's IP)

**What goes wrong:**
**[code]** The limiter and (soon) the audit log use Fastify `request.ip`, which is the TCP peer unless `TRUST_PROXY` is set. External proxy mode (#44) and nginx-proxy in front of Docktor itself both put a proxy in front of Docktor. With `TRUST_PROXY` unset, all clients share the proxy's IP, so 5 sign-in or reset attempts per 15 minutes are shared by **all users**; one user mistyping a password (or one attacker) locks everybody out. Multi-user makes this far worse than the single-user case. Setting `TRUST_PROXY=true` instead trusts every hop and allows `X-Forwarded-For` spoofing to choose a bucket and forge audit IPs.

**How to avoid:**
- Document and surface `TRUST_PROXY=1` (hop count) next to the external-proxy-mode setting; show a warning in the UI when requests arrive with `X-Forwarded-For` while `TRUST_PROXY` is off (a detectable misconfiguration).
- Key the audit IP and rate limit on the same trusted value; test both with and without proxy.
- Add a per-account lockout signal in addition to per-IP so one shared IP cannot lock the whole instance.

**Warning signs:**
All audit rows show one IP (often `172.x`); "Too many requests" for users on different networks.

**Phase to address:** P-PROXY (setting and docs), P-AUTHZ (audit IP), P-RESET.

---

### Pitfall 10: OIDC redirect URI and base URL drift between env, Settings and the proxy

**What goes wrong:**
**[ba-1.4.18]** The callback is `${baseURL}/api/auth/oauth2/callback/:providerId`, with `baseURL` from `BETTER_AUTH_URL`. **[code]** Docktor has two base URLs: the env var (static, requires restart) and the Settings page value (live, only feeds `trustedOrigins`). Users configure OIDC against the Settings URL; better-auth builds `redirect_uri` from the env. Behind a TLS-terminating proxy the derived scheme is `http`, the IdP rejects `redirect_uri_mismatch`, and the error page is opaque. The same issue produces wrong reset-mail hosts (Pitfall 8).

**How to avoid:**
- Show the exact redirect URI in the OIDC settings UI, computed from the same value better-auth uses, with a "test connection" (discovery fetch) button.
- Require `BETTER_AUTH_URL` (or make better-auth read the Settings value) before enabling OIDC and reset; fail with a specific message otherwise.
- Do not make boot depend on IdP availability. In 1.4.18 discovery runs per request, so keep it that way and surface discovery errors in the settings UI.

**Phase to address:** P-OIDC.

---

### Pitfall 11: better-auth version gap and the static plugin config versus UI-configured OIDC

**What goes wrong:**
(a) Installed `better-auth` is **1.4.18**; `latest` is **1.7.12**. Online docs describe features absent from 1.4.18: ID-token signature, issuer and nonce verification for discovery providers, `requireIdTokenVerification`, `accountSubject`, `validateUserInfo`. **[ba-1.4.18]** generic-oauth source has no `nonce`/`jwks` handling. Building OIDC on 1.4.18 means accepting claims from the userinfo endpoint only, with weaker replay protection than the docs imply.
(b) #61 wants the OIDC provider "configured" (UI). The `genericOAuth({config:[...]})` array is read when `betterAuth()` is constructed, and the `auth` singleton is imported by many modules (`auth-middleware.ts`, routes, hooks). Saving a provider in the UI does not take effect until restart, or requires rebuilding the singleton.

**How to avoid:**
- Make "bump better-auth to a current 1.x and re-run the whole auth suite (2FA hooks, rate limit, `disabledPaths`, cookie behaviour)" the first task of P-OIDC; check the `disabledPaths` semantics and the `hooks.before/after` ctx shape the existing `two-factor-hooks.ts` relies on.
- Decide up front: env-var-configured OIDC (simple, restart to change, secret not in DB) versus DB-configured (needs an auth-instance factory or a dynamic provider mechanism; client secret must be encrypted with `lib/crypto.ts`). Flag as a research item for P-OIDC. Do not discover this mid-implementation.

**Phase to address:** P-OIDC (research flag).

---

### Pitfall 12: Migration rollback calls the wrong "down" and destroys volumes

**What goes wrong:**
#100 asks for a best-effort `down` after a failed `up`. **[code]** The only existing `down` is `DockerExecutor.down()`, implemented as `docker compose down -v`, which **deletes named volumes**. In an in-place migration where named volumes were kept (the user's database lives in them), a rollback that reuses it deletes the data the rollback was supposed to protect.

**How to avoid:**
- Add a dedicated narrow method (for example `ExternalStackControl.downKeepVolumes`) that runs `docker compose -p <project> down` without `-v/--volumes`, and make the rollback only able to call that. Unit-test the exact argv (assert no `-v`, no `--volumes`, no `--rmi`).
- Never route migration rollback through `StackService.deleteStack` (also uses `down -v` via the executor).
- Review `up -d --remove-orphans` (**[code]** the migration deploy uses it): for an in-place migration with the same project name it deletes containers of services the rewritten compose no longer has. Drop `--remove-orphans` for the migration deploy.

**Warning signs:**
Rollback code importing `dockerExecutor`; a test that mocks `down` without asserting arguments.

**Phase to address:** P-MIG (first plan; #100).

---

### Pitfall 13: In-place rollback restarts the wrong containers and orphans anonymous volumes

**What goes wrong:**
**[code]** After a failed in-place `up`, compose has recreated the old project's containers with the **new** config (same project name, same directory name). Rollback then does `docker compose start` from the restored files, which starts the recreated, new-config containers (#100). Separately, if a `down` removes those containers and the original is later brought up, any data that lived in **anonymous volumes** (images with a `VOLUME` declaration and no compose mount, for example some MongoDB/Postgres/Redis images) is detached: the new container gets a fresh anonymous volume and the old one is left dangling. Anonymous volumes are also never copied by the migration at all (it copies bind mounts and named volumes), so a migrated stack silently starts empty.

**How to avoid:**
- Before stopping, snapshot the running service set (`docker compose ps --format json`) and the old containers' `Mounts` via `docker inspect`. Rollback: restore original files, `up -d <only the services that were running>` from the restored directory (not `start`), and verify with `ps` before claiming "restarted" (#100 AC3, AC5).
- At preflight, list each old container's mounts of type `volume` with a 64-hex (anonymous) name, and either refuse that service with an explicit message or copy it. At minimum warn "service X stores data in an anonymous volume and will start empty".
- Keep wording honest: "restart requested" until verified.

**Phase to address:** P-MIG (#100; extend scope to anonymous volumes).

---

### Pitfall 14: A restart, crash or deploy during migration leaves the old stack stopped with no rollback

**What goes wrong:**
**[code]** `MigrationOperationService` keeps operations in a process-local `Map` ("a restart ends running migrations together with the process"). The old stack is stopped at step 1, so if Docktor restarts (OOM, `docker compose up -d` of Docktor itself, host reboot) mid-copy, nothing records that the user's production stack is down, the original may sit renamed to `<id>-pre-migration`, and a half-built new directory with no Stack row exists. The user sees "no migrations running".

**How to avoid:**
- Write a small migration journal (a file next to the new directory or a DB row): old compose path and resolved project name, services running before the stop, aside directory, new directory, last completed step. Delete on success or completed rollback.
- On startup, recover: for any unfinished journal run the same rollback code and surface the result as a StackEvent/notification ("migration of X was interrupted; old stack restored" or "needs manual action: ...").
- Related: **[code]** deploy uses `execFile` with a flat 120 s timeout. A large image pull exceeds it, the child is killed, the migration is treated as failed and rolled back even though the pull was progressing. Scale the `up` timeout (or run `pull` first with no timeout, then `up`). Same for `stop` (#102).

**Phase to address:** P-MIG.

---

### Pitfall 15: "Stopped" is reported for a project that was never stopped (project-name mismatch)

**What goes wrong:**
**[code]** `ExternalStackControl.stop` runs `docker compose -f <path> stop`, which resolves the project from the directory name or `name:`/`COMPOSE_PROJECT_NAME`. For stacks started with `docker compose -p other`, a shell-exported `COMPOSE_PROJECT_NAME`, or from a different directory, the command matches zero containers and **exits 0**. The migration then copies live data (corrupt copy for databases) and the new stack runs beside the old (#102). Note too that Docktor's own environment is inherited by the child (`execFile` without a sanitised `env`), so `COMPOSE_PROJECT_NAME`, `COMPOSE_FILE` or a `${VAR}` of the same name in Docktor's process can change the project or interpolation (#109 AC2).

**How to avoid:**
- Resolve the real project from running containers' labels (`com.docker.compose.project`, `.working_dir`, `.config_files`) and pass `-p <resolved>` consistently for stop, ps, start and down.
- After `stop`, verify with `ps -q` (running only) and `docker ps --filter label=com.docker.compose.project=<name>` that nothing is running; if the project cannot be resolved, say "stop requested", and refuse to copy a data directory when containers still run.
- Run all compose children with an explicit minimal `env` (PATH, HOME, DOCKER_HOST, DOCKER_CONFIG) plus `--env-file` for the stack's own `.env`, and add the #109 test for `${VAR}` references.
- Do not `start` after a timeout on a half-stopped project; `ps` first.

**Phase to address:** P-MIG (#102, #109).

---

### Pitfall 16: Named-volume copy "succeeds" with an empty copy

**What goes wrong:**
**[code]** `docker run -v <name>:/source:ro ...` **auto-creates** the volume if it does not exist, then copies an empty directory, reports success, and the new stack starts with no data (#101). The real name is `<project>_<key>` unless `name:` is set, and an `external: true` volume has the literal name; getting the name wrong is the usual cause.

**How to avoid:**
- Resolve the name from the old project (labels or `docker compose config`), `docker volume inspect` it, fail if absent; use `--mount type=volume,source=<name>,target=/source,readonly` which errors instead of creating.
- Check `Driver`: refuse or warn when it is not `local`, or `local` with `driver_opts` (NFS, cifs, bind-through-volume) since converting to a plain bind loses the mount semantics.
- Check no **other** running container uses the volume (`docker ps --filter volume=<name>`), otherwise a live shared volume is copied inconsistently.
- After the copy, compare a file count and byte size source vs destination and fail on mismatch. Never overwrite a non-empty destination.
- Pin the copy image (digest or the Docktor image itself) instead of unpinned `alpine`, so an air-gapped host does not fail or pull a surprise at migration time. `cp -a` in busybox does not preserve xattrs or SELinux labels and expands sparse files; note it in the docs and include sparse-expansion in the size estimate.

**Phase to address:** P-MIG (#101).

---

### Pitfall 17: Free-space check measures the wrong filesystem and the wrong sizes

**What goes wrong:**
#107 adds an estimate-versus-free-space check. Common errors: measuring `/` instead of the stacks-directory mount; ignoring that named-volume data (under `/var/lib/docker`) and bind sources outside the old directory also get copied; counting the backup once when the flow writes backup plus copy; forgetting `cp -a` expands sparse files (VM images, some DB files); and, for in-place, assuming rename is free (it fails with EXDEV/EBUSY when the original directory is itself a mount point).

**How to avoid:**
- `statfs` the **destination** (stacks dir) filesystem; sum sizes of: old directory, every selected bind source, every selected named volume (measure with a throwaway helper container `du -s`, not guessed); multiply by (1 copy + 1 backup if opted in) plus a safety margin; use apparent size and allocated size, take the larger.
- Pre-check that rename of the original is possible (`fs.stat(dev)` equality of parent and child) before stopping anything.
- Document that the pre-migration backup covers only the stack directory, not named volumes or outside bind sources.
- Moving the backup before the stop (#107) makes the copy crash-consistent at best for a live database. In the non-in-place flow the original is never modified, so the "backup" is a convenience copy and the stopped original is the real safety net; keep wording honest.

**Phase to address:** P-MIG (#107).

---

### Pitfall 18: Compose-file edits assume a shape the user's file may not have (proxy env and Traefik labels)

**What goes wrong:**
**[code]** `compose-proxy-editor.ts` uses `doc.setIn(["services", svc, "environment", KEY], value)`. `environment` and `labels` may be a **map or a list** (`- KEY=value`). On a list-form block, `setIn` with a string key throws (a yaml error, not a `ComposeProxyEditError`), producing a 500 on "assign domain". The same applies to `networks` (list or map with per-network options such as `ipv4_address`); the editor assumes a list: `isSeq(networksNode) ? ... : []`, so a map-form `networks:` is **overwritten with a one-element list**, silently dropping the user's network options. This already bites managed mode; Traefik labels (always `labels`) will hit it harder.

**How to avoid:**
- Write one `ComposeCollectionEditor` that handles map and sequence forms for `environment`, `labels` and `networks`, preserving form, comments and quoting. Add table-driven tests with both forms for all three.
- Treat only Docktor-owned keys as owned. Mark them (a `docktor.managed=true`-style label, or a known key prefix) so remove/mode-switch deletes exactly what Docktor wrote and never a user's own Traefik label.
- Surface a typed error for unsupported shapes (YAML anchors, `extends`, `<<` merges: edit may land on an alias target and change other services).

**Phase to address:** P-PROXY (shared editor first), P-MIG (rewriter has the same list-form env gap: it only moves map-form literals to `.env`, so list-form secrets stay inline).

---

### Pitfall 19: Traefik label generation (external proxy mode)

**What goes wrong:** (docs-verified; MEDIUM confidence, not run here)
1. **Router and service names are global.** Traefik routers/services share one namespace across every compose project. A router named after the service (`web`, `app`) collides across stacks; the later config wins or both break. Names also cannot contain `@`, and dots in names corrupt the label path. Generate `docktor-<stackId>-<service>-<index>` limited to `[a-z0-9-]`.
2. **Multiple domains with different TLS needs.** `ProxyConfig` is unique per domain with per-row `tlsEnabled`/certificate source. Use one router per domain, or the TLS settings of the weakest row apply to all.
3. **Environment-specific names are not constants.** Entrypoint names (`web`/`websecure`), `certresolver` name, shared network name and `exposedByDefault` are properties of the user's Traefik. Hard-coding `websecure`/`letsencrypt` yields 404s. Make them settings with sane defaults and show a copy-ready snippet as well (#44 AC2).
4. **`traefik.enable=true` is needed** when the user set `exposedByDefault=false`, a common hardening step; omit it and the domain silently 404s.
5. **Network.** Traefik picks a network randomly when the container has several unless `traefik.docker.network` is set, and the service must share a network with Traefik. **[code]** managed mode adds the external network `docktor_proxy`; in external mode nobody creates it and `docker compose up` fails with "network declared as external, but could not be found". Make the network name a setting, validate with `docker network inspect` before writing, and write `traefik.docker.network` explicitly.
6. **Port.** Without `loadbalancer.server.port` Traefik uses the first exposed port; always emit it from `internalPort`.
7. **Interpolation.** `$` in label values must be `$$` in compose; do not accept free-text label values (basic-auth hashes etc.) in v0.2.0, and always emit through the yaml Document API.
8. **HTTP/HTTPS pair.** `tlsEnabled` means a router on the TLS entrypoint with `tls=true` + certresolver, and (if wanted) an http-to-https redirect; `tlsEnabled=false` means only the web entrypoint.
9. **Labels may contain secrets** (Traefik docs advise against) so never put credentials in them.

**How to avoid:** A pure function `renderTraefikLabels(rows, settings)` in `domain/` with golden-file tests for: two stacks with the same service name, multi-domain mixed TLS, `exposedByDefault=false`, custom network, label list-form and map-form compose input.

**Phase to address:** P-PROXY.

---

### Pitfall 20: Switching proxy mode leaves stale config, orphan stacks and "pending forever" certificates

**What goes wrong:**
**[code]** Many managed-mode subsystems assume the managed proxy exists:
- `deployProxyStack` asserts host ports 80/443 are free, which fails (correctly) when the user's own proxy owns them, yet the setup wizard offers "optional proxy config".
- `ProxyCertPoller` reads `volumes/certs` of the managed proxy and writes `certStatus`. In external mode every domain stays `pending` forever or flips to errors, and the custom-certificate upload UI (Phase 09) does nothing useful.
- Existing `VIRTUAL_HOST`/`LETSENCRYPT_HOST` env entries and the `docktor_proxy` network stay in the compose files after the switch (or `traefik.*` labels stay after switching back).
- Auto-rewriting every affected compose and redeploying produces a wave of unexpected restarts and "config changed" alerts.

**How to avoid:**
- Persist `proxy.mode` (`managed` | `external`, default `managed` for every existing instance) and branch at one choke point (`ProxyService`), not in each caller.
- In external mode: hide/skip managed-proxy deploy, the cert poller, and certificate upload; show the snippet instead of a status; do not display cert state Docktor cannot observe (#44 "no visibility by design").
- Switching mode is an explicit action with a **preview diff per stack** (the existing preview infrastructure) and no automatic redeploy. Only remove keys Docktor owns.
- Add `"expiring"` and similar event types by deriving them from `@docktor/shared` (#105 already found the client mirror lacks `"expiring"`).

**Phase to address:** P-PROXY.

---

### Pitfall 21: nginx-proxy WebSocket "toggle" misreads how nginx-proxy works

**What goes wrong:**
Read from the nginx-proxy `nginx.tmpl` (MEDIUM-HIGH): WebSocket upgrade is **on by default for every vhost**. The template maps `$http_upgrade` to `$proxy_connection` (`default upgrade`) and sets `proxy_http_version 1.1`, `Upgrade` and `Connection` headers whenever `/etc/nginx/proxy.conf` is absent. So #86's note "verify first how nginx-proxy treats Upgrade headers" resolves to: the feature is not "enable upgrades", it is "make long-lived connections work reliably", and a literal OFF switch would have to **disable** default behaviour. Consequences:
1. **"Stays connected" can still fail.** nginx's default `proxy_read_timeout` is 60 s and the template sets no timeout, so an idle WebSocket or SSE connection from an app without application-level pings is cut at 60 s. The meaningful per-domain knob is a long timeout, not Upgrade headers.
2. **The existing env-var channel cannot carry a per-domain flag.** **[code]** Domains for one service are aggregated into one comma-joined `VIRTUAL_HOST` (the D-08 invariant). Per-host nginx tuning exists only through `vhost.d/<exact VIRTUAL_HOST>_location` files, one file per hostname (wildcard/regex hosts use a SHA-1 of the regex).
3. **vhost.d files are an extra stateful artifact.** They must be written under the proxy stack's `volumes/vhost.d` (the proxy compose already mounts it), cleaned up when a domain is removed or renamed (orphans), and written with correct names for each of N domains. Whether a change is picked up without an nginx reload is not documented (LOW); docker-gen regenerates on container events, so a file-only change may not take effect until a reload or container event. Verify in a spike, and trigger `nginx -s reload` explicitly if needed.
4. **Defaults and migration.** AC4 says "existing domains keep their current behaviour" = upgrades **on**. Add the column with a default of `true` (backfills existing rows), keep the Zod field optional-with-default so older rows and clients parse, and keep new domains consistent. Choosing `false` for new rows breaks AC4's "consistent between new and existing".
5. **Other layers can still break WebSockets:** apps that validate `Origin`/`Host` or trusted proxies (Home Assistant needs `trusted_proxies` and answers 400 otherwise); HTTP/2 Connect is not used by browsers against nginx; in external mode (Traefik, Caddy) upgrades work by default and the toggle is moot, so hide it there and note NPM's manual "Websockets Support" switch in the snippet.

**How to avoid:**
- Spike first: bring up `uptime-kuma` behind the managed proxy and prove today's behaviour and the 60 s idle drop, then decide the setting's semantics (recommended: "Long-lived connections / WebSocket: on = generate `proxy_read_timeout`/`proxy_send_timeout` 3600s location file; off = nginx-proxy default"). Record the decision in the plan.
- Generate vhost.d content from a pure function with unit tests; manage files in one `ProxyVhostFiles` adapter that removes orphans; cover with an integration test that saves the option and checks the file.

**Phase to address:** P-PROXY (research flag: spike before plan).

---

### Pitfall 22: SSE and WebSockets of Docktor itself break behind the user's proxy

**What goes wrong:**
**[code]** Docktor's own streams set `X-Accel-Buffering: no`, but only nginx honours that header. Traefik and Caddy do not buffer, but NPM and hand-written nginx configs may add `proxy_buffering on` or a 60 s read timeout. `/api/events` sends nothing when the system is idle, so idle proxies drop it and clients reconnect (and `resync`, see #105's duplicate resync) in cycles; users report "live updates stop after a minute".

**How to avoid:**
Heartbeat comments (Pitfall 3), `Cache-Control: no-transform`, docs section "Putting Docktor behind a reverse proxy" with the required headers, timeouts and `TRUST_PROXY`.

**Phase to address:** P-PROXY docs, P-AUTHZ heartbeat.

---

## Moderate Pitfalls

### Pitfall 23: The audit log is written by a URL-scraping hook, misses better-auth and background actions, or leaks secrets

**What goes wrong / prevention:**
- **Two write paths.** Docktor actions go through Fastify, but sign-in, 2FA changes, password reset and OIDC go through `/api/auth/*` (hijacked raw handler), invisible to Fastify `onResponse`. Record auth events from better-auth `hooks.after` / `databaseHooks`, and Docktor actions from the **service layer** with an explicit `actor` argument (`AuditContext`), not from a route hook that guesses meaning from URLs.
- **Background actors.** FileWatcher, update checker, backup cron and StatePoller mutate state with no user. Use an explicit `system` actor rather than null, and decide which system events are audit-worthy (stack auto-stopped, scheduled backup ran) versus noise.
- **Secrets in metadata.** The migration and compose editors produce diffs containing secrets (#103). Store keys and identifiers, never values: no compose/env content, SMTP password, restic password, OIDC secret, reset tokens. Test with a deliberately secret-bearing change and grep the table.
- **Cascade deletes.** **[code]** `Session` and `Account` use `onDelete: Cascade` to `User`. Copying that pattern for `AuditLog.actorId` deletes history when a user is removed. Use `onDelete: SetNull` plus a snapshot (`actorEmail`, `actorName`) so "who did what" survives.
- **Record denials and failures** (permission denied, failed sign-in, reset requested, role changed, user created/deleted/banned, OIDC linked, setting changed, deploy/stop/delete/restore/import/migrate). Unauthenticated failures can be spammed: rate limit and cap, aggregate per IP per window.
- **Growth and read access.** Index `(createdAt)` and `(actorId, createdAt)`, cursor pagination, a retention setting; reading the log is `audit:read` for admin and owner only because it contains emails and IPs. Be honest in docs: the application can write the table, so it is accountability, not tamper-proof.
- Write the audit row in the same transaction as the change where the repository supports it, so "action happened, no record" is not possible.

**Phase to address:** P-AUTHZ (table, `AuditContext` plumbing, and system actor), with auth-event hooks added in P-RESET and P-OIDC.

---

### Pitfall 24: User and role management can strand the instance

**What goes wrong / prevention:**
Last owner demoted, deleted or banned by themselves or concurrently by two admins; an admin promoting someone to `owner`; owner transfer half-done; a deleted user's open sessions still working (Pitfall 3); an invited user with no SMTP configured and no way to receive the invite.
- Enforce "at least one active owner" inside a DB transaction with a row lock or serializable check, not in the UI. Only owners can create/modify owners.
- Admin-created users when SMTP is absent: admin sets an initial password and the account is flagged "must change password"; do not build invites that silently require mail.
- Reuse the on-box recovery script pattern (the 2FA reset script) for "promote user X to owner" as the break-glass.
- If using better-auth's `admin` plugin: it exposes `/admin/set-role`, `/admin/impersonate-user`, `/admin/create-user`, `/admin/ban-user` through the same catch-all. Impersonation on a Docker-root app is a privilege-escalation tool. Recommended: do **not** adopt the admin plugin; keep the `role` column via `additionalFields` (`input: false`) and own user-management routes behind the permission guard (MEDIUM; opinion, to confirm in plan). If it is adopted, add `/admin/impersonate-user` and anything not used to `disabledPaths` (note `disabledPaths` is an exact-path match **[ba-1.4.18]**, so parameterised paths are not covered).

**Phase to address:** P-AUTHZ.

---

### Pitfall 25: `disabledPaths` is an exact-path list; the reset GET callback is not covered

**What goes wrong:**
**[ba-1.4.18]** `disabledPaths.includes(normalizedPath)` is an exact match. `/reset-password/:token` (the GET link target) is a different path than `/reset-password`, so even today it is reachable. When P-RESET removes the two entries it must also treat the callback correctly; when other plugins arrive (genericOAuth link, admin), any endpoint not enumerated stays open.

**How to avoid:** Prefer an **allowlist test**: enumerate the real better-auth endpoint list at test time (`auth.api` keys / generated paths) and assert it equals an expected set. A newly added plugin endpoint then fails the test until someone decides.

**Phase to address:** P-AUTHZ, P-RESET, P-OIDC.

---

### Pitfall 26: Secret masking in the migration diff is heuristic and incomplete

**What goes wrong:**
#103 masks `KEY: value` lines for key names that look secret. False negatives: list-form env (`- DB_PASSWORD=...`, which **[code]** the rewriter does not extract to `.env`), URL userinfo (`DATABASE_URL=postgres://u:p@host`), `command:` args (`--requirepass x`), label values, and `${VAR}` references that are fine to show. Secrets also leak through error messages: compose stderr (`describeFailure`) can echo interpolated values, and these end up in the toast, the operation result and (soon) the audit log.

**How to avoid:** One shared `maskSecrets(text)` in `@docktor/shared` used by the diff, the `.env` preview, error strings and audit metadata; key-based plus value-pattern (URL userinfo, long high-entropy tokens) rules; tests for removed and added lines in both env forms (#103 AC3); mask by default with the reveal toggle shown if either pane has a secret.

**Phase to address:** P-MIG (#103), reused in P-AUTHZ audit.

---

### Pitfall 27: `~`, relative and exotic bind sources are treated as plain paths

**What goes wrong:**
`~` is expanded by compose relative to the user running compose, not the Docktor container's `HOME`; the analyzer, rewriter and copy resolver disagree (#104), producing a stray empty `volumes/data` and a compose that still points at `~/data`. Neighbouring cases: `${VAR}`-built sources, long syntax with `type: bind`, `create_host_path: false`, bind-backed named volumes (`driver_opts: {type: none, o: bind, device: ...}`), and `:z`/`:Z` suffixes on SELinux hosts (copied files lose labels).

**How to avoid:** One `classifyBindSource()` in `domain/bind-mount-sources.ts` (it already has a `home-relative` refusal) used by analyzer, rewriter and copy; unknown shapes are "stays outside Docktor", never guessed; never `mkdir` for a source that did not exist (#104 AC2); table-driven tests for each shape.

**Phase to address:** P-MIG (#104).

---

### Pitfall 28: Kept originals pollute scanner, watcher, backups and disk usage

**What goes wrong:**
#106 hides `<id>-pre-migration[-n]` from the scanner. The same directory is a sibling of managed stacks and a live compose project candidate: someone running `docker compose up` in it starts a duplicate with the same `container_name`s/ports; `pre-migration-backup/` inside new stacks doubles restic repository size and contains a second copy of every `.env` secret.

**How to avoid:** A shared predicate `isKeptOriginal(name)` (in `domain/migration-target.ts` next to `asideNameCandidates`) used by scanner, watcher, disk-usage scanner and backup selection; exclude `pre-migration-backup/` from restic by default (or let the user choose); show "kept original of X" with a "delete after verification" action later.

**Phase to address:** P-MIG (#106).

---

### Pitfall 29: Migration progress UI bound to a component and an event stream that can throw

**What goes wrong:**
#105: loading toast tied to a mounted hook; `JSON.parse(e.data)` unguarded in `onmessage`; duplicate `resync`; client event types hand-mirrored (`"expiring"` missing). With RBAC added, a **403 on the events stream** must also end the toast with an error, not leave it spinning.

**How to avoid:** Operation lifecycle in a module-level store (or TanStack Query mutation cache) independent of mounts; every path ends in success or error including stream failure and a poll-for-final-state fallback via `GET .../migrations/:id`; derive event types from `@docktor/shared`; add a test that unmounts the component mid-operation.

**Phase to address:** P-MIG (#105).

---

### Pitfall 30: Ownership and permissions after copy (Linux-only verification)

**What goes wrong:**
**[code]** `cp -a` preserves uid/gid, modes, timestamps and symlinks only when the process is privileged; the ownership test is `it.skipIf(!root)`, so it never runs in non-root CI (#109). If the production container ever runs unprivileged (rootless Docker, user namespaces, a future hardening), `cp -a` quietly loses ownership and PostgreSQL then refuses to start ("data directory has wrong ownership" or mode wider than 0700). NFS root-squash and SELinux labels behave similarly.

**How to avoid:** Run the root-gated test in a dedicated GitHub Actions Linux job (`sudo` or a root container) and mark it required; add a startup/preflight check "can this process chown" that fails the migration before the stop when ownership preservation is impossible but data dirs are non-root-owned; compare `stat` uid/gid/mode of a sample after copy. Per project memory, heavy runs happen in GitHub Actions CI, not on the VPS.

**Phase to address:** P-MIG (#109).

---

## Minor Pitfalls

### Pitfall 31: Convention drift while touching these files (#108)

`any` casts in `compose-analyzer.ts`, hand-assigned `cause` in `AppError` subclasses, `console.error` in rollback paths, and a `composePath` that is not `realpath`-resolved (symlink to an arbitrary file, TOCTOU between check and use). **Prevention:** Zod/type-guard parse for the YAML document; `ErrorOptions` through the constructor; app logger everywhere in rollback; `realpath` then re-check basename immediately before use and reject `..` in the schema. Mind that the import routes are arbitrary-host-file readers, so they are admin/owner only after P-AUTHZ.

### Pitfall 32: 403 versus 404, and UI role hints

Mixed `NotFoundError` (to hide existence) and `ForbiddenError` across routes becomes an inconsistent enumeration oracle. **Prevention:** one rule: 403 for authenticated-but-not-permitted, 404 only for truly absent; global client handler maps 403 to a "you do not have permission" state instead of a generic error toast.

### Pitfall 33: Email-address hygiene

Setup-wizard email is unverified; a typo or a fake domain means reset mail goes to a stranger or nowhere. **Prevention:** confirm email on the account page, show "reset unavailable: no deliverable address" hint to admins, never auto-mark `emailVerified` from reset.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `trustedProviders` for the OIDC provider | "Sign in with SSO works for my existing account" immediately | Account takeover and 2FA bypass (Pitfall 6) | Never |
| Role default `owner` to avoid a backfill | No `UPDATE` statement | Every future user is owner | Never |
| Hide buttons by role in UI only | Fast demo | Viewer-to-root through API | Never (UI hints are additive, server enforces) |
| Per-file `requireAuth` hooks plus hand-added permission checks | Matches current code | One missed route = root escalation | Never; use `onRoute` boot-time guard |
| Reuse `dockerExecutor.down` for migration rollback | Less code | `down -v` deletes volumes | Never |
| Process-local migration registry | Simple (already shipped) | Interrupted migration leaves stack stopped | Only until a journal exists (fix in v0.2.0) |
| Hard-code `websecure`/`letsencrypt`/`docktor_proxy` in Traefik labels | Works on the author's setup | 404s or compose failure for everyone else | Only as editable defaults |
| Audit via `onResponse` URL hook | One place to write | Misses auth routes and system actors, logs wrong semantics | Never as the only mechanism |
| Env-var-only OIDC config (no UI) | Avoids rebuilding the auth singleton | Weaker #61 UX, restart to change | Acceptable for v0.2.0 if documented and UI added later |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| better-auth `/api/auth/*` | Assuming Fastify hooks apply | It is a hijacked raw handler; authz and audit for it live in better-auth `hooks`/`databaseHooks` |
| better-auth `additionalFields` | Leaving `input` default so `/update-user` can set `role` | `input: false`; set role in `databaseHooks.user.create.before` |
| better-auth account linking | Relying on default email auto-link | `disableImplicitLinking: true`; link from an authenticated session only |
| better-auth password reset | Awaiting the mail send; leaving `revokeSessionsOnPasswordReset` off | Background handler; revoke on; purge trust-device rows and other tokens |
| better-auth `disabledPaths` | Expecting prefix or parameterised matching | Exact match only; add an endpoint-allowlist test |
| better-auth version | Following latest docs against 1.4.18 | Upgrade first, re-run the whole auth suite, then build |
| OIDC provider | Public IdP plus open signup | `disableSignUp`; admin-provisioned or allow-listed identities, lowest role |
| OIDC redirect | Registering the Settings URL while better-auth uses the env URL | Display and validate the exact redirect URI; require `BETTER_AUTH_URL` |
| SMTP for reset mail | Assuming config present; logging the link | Runtime gate for all inputs; log recipient and subject only; TLS-required warning for `encryption: none` |
| nginx-proxy | Thinking upgrades are off by default; env var for per-domain flags | They are on; per-host tuning needs `vhost.d/<host>_location` files; spike for reload behaviour |
| nginx-proxy | Writing vhost.d for the aggregated host string | One file per hostname, remove orphans |
| Traefik | Router name = service name; omit `traefik.enable`, port and network labels | Unique `docktor-<stack>-<service>-<n>`; explicit enable, `loadbalancer.server.port`, `traefik.docker.network`; settings for entrypoints and resolver |
| Docker Compose child processes | Inheriting Docktor's environment | Minimal explicit env plus `--env-file`; resolve project name from labels and pass `-p` |
| `docker run -v name:/src` | Assuming an error when the volume is missing | It creates an empty volume; inspect first and use `--mount ...,readonly` |
| `docker compose down` | Using Docktor's existing `down` | It is `down -v`; add a keep-volumes variant for rollback |
| Reverse proxy in front of Docktor | `TRUST_PROXY` unset | All users share one rate-limit bucket; set hop count (`1`) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-subscriber permission recomputation on every SSE event | CPU spikes on busy hosts | Compute the predicate at connect, refresh on role-change events | Dozens of concurrent streams with many stacks |
| Permission lookup hitting the DB on every request | Latency on 87 routes | Read role with the session query (single join); no cookie cache (revocation) | Hundreds of req/s, unlikely for this tool |
| Unbounded audit table | Slow audit page, DB growth from failed-login spam | Indexes, cursor pagination, retention setting, aggregate auth failures | Months of use on exposed instances |
| Unthrottled reset requests creating Verification rows | Table growth, mail bombing | Per-email limiter, delete expired rows on a schedule | Any attacker, immediately |
| Migration copy with `du` on huge volumes | Preflight takes minutes | Run in the background operation with progress, cache result | Multi-100 GB volumes |
| Idle SSE with no heartbeat through proxies | Reconnect and `resync` loops | 15-25 s ping | Any proxy with a 60 s timeout |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Self-registration reopened by OIDC | Anyone becomes a user of a Docker-root UI | `disableSignUp`; creation invariant in `databaseHooks.user.create.before` |
| Implicit link by email | Takeover plus 2FA bypass | `disableImplicitLinking`; never `trustedProviders` |
| Role accepted from client input | Self-promotion | `input: false`; server-only assignment |
| Last owner removable | Lockout | Transactional "at least one active owner" |
| `operator` role can edit compose | Root on the host | Capability tiers; compose/env write is admin; rule engine blocks socket/privileged for non-admin if ever scoped |
| Env/log/compose readable by viewer | Secret disclosure | Separate `env:read`, `logs:read`; viewer excluded |
| SSE streams outlive the session or role | Continued access after revoke | ConnectionRegistry, timer re-validation |
| Reset link built from request Host | Token theft via Host poisoning | Link from configured base URL only |
| Reset timing oracle | Account enumeration | Background mail send; timing test |
| Admin-plugin impersonation enabled | Escalation | Do not adopt plugin, or disable the endpoints |
| Import/migration routes open to non-admins | Arbitrary host file read via `/host` | Owner/admin only; `realpath` plus basename check |
| `TRUST_PROXY=true` for convenience | Spoofed IPs defeat limiter and poison audit | Hop count or CIDR list |
| Secrets in audit or toast text | Credential leak to wider audience | Shared `maskSecrets`, keys not values |
| OIDC `client_secret` stored plaintext | DB leak exposes IdP client | Encrypt with `lib/crypto.ts` or keep in env |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Success message says "old stack restarted" unverified | User believes production is up when it is not (#100) | Verify with `ps`; otherwise "restart requested, check X" |
| "Stopped" claimed without verification | Duplicate stacks running | "Stop requested" wording unless verified (#102) |
| Silent 403s | "The button does nothing" | Global permission-denied state naming the missing permission |
| OIDC `account_not_linked` shown as a raw error code | User cannot self-resolve | Plain explanation: "sign in with your password, then link in Account settings" |
| Mode switch (managed/external) applies immediately | Mass restarts | Preview diff per stack, explicit apply |
| WebSocket toggle label implies Upgrade support is otherwise missing | Users believe other apps are broken | Name it for what it does (long-lived connections); explain default |
| Reset page shows the token in the URL | Shoulder-surf/log exposure | Strip token after load |
| Forced TOTP enrollment for OIDC users | Dead-end screen | Exempt per policy or explain |

## "Looks Done But Isn't" Checklist

- [ ] **RBAC:** Every route classified; boot fails on an unclassified route. Verify with the route-enumeration test.
- [ ] **RBAC:** SSE closes on revoke and demotion. Verify with a test holding a stream open across a revoke.
- [ ] **RBAC:** Viewer cannot read `/env`, `/logs`, `/compose`, import, settings, certificates, backups. Verify with a role-by-route matrix test.
- [ ] **Upgrade:** Existing DB (v0.1.1 schema, including an auto-baselined one) boots, owner signs in, no manual steps. Verify with a restore-and-boot test.
- [ ] **Upgrade:** The existing user is `owner` and the second created user is not. Verify both in one test.
- [ ] **OIDC:** Unknown identity cannot create an account; known-email-no-link fails; 2FA-enabled victim cannot be taken over; OIDC-only user not stuck in enrollment gate.
- [ ] **OIDC:** The redirect URI shown in the UI equals what better-auth sends; discovery failure does not block boot.
- [ ] **Reset:** Timing of known vs unknown identical; second session and its SSE stream die; trust-device cookies purged; earlier tokens dead; 2FA user still gets TOTP challenge; unavailable message when SMTP or base URL absent; both reset paths in the strict limiter.
- [ ] **Audit:** Entries for auth events (via better-auth hooks), service actions, system actor, denials; no secret values; survives user deletion; admin-only read.
- [ ] **Proxy external:** Snippet and labels golden-tested; network existence validated; no managed-proxy deploy, no cert poller, no "pending" certs; mode switch previews diffs.
- [ ] **WebSocket:** Spike proved current behaviour; idle 60 s case tested with Uptime Kuma; default `true` for existing rows; vhost.d orphans cleaned; reload behaviour verified.
- [ ] **Migration:** Rollback argv contains no `-v`; rollback restarts only previously running services; verified-restart wording; interrupted-migration recovery on boot; large pull does not hit the 120 s limit.
- [ ] **Migration:** Named-volume copy errors on missing volume, never auto-creates; non-`local` drivers and shared volumes handled; anonymous volumes detected.
- [ ] **Migration:** Free-space check uses the destination filesystem and includes volumes and backup; `~` sources never produce empty directories; masking covers list-form env and URL userinfo.
- [ ] **Migration:** Root-gated ownership test runs in a required Linux CI job.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Upgrade locks out the owner (role default) | LOW | On-box script or SQL: `UPDATE "User" SET role='owner' WHERE id=...`; ship the script in `docs/deployment.md` before shipping the feature |
| Wrong user became owner/admin | MEDIUM | Audit log to identify; demote via on-box script; rotate credentials and sessions for affected accounts |
| Account takeover via implicit linking | HIGH | Disable OIDC, revoke all sessions, delete the linked `account` row, rotate secrets in stacks the intruder could read |
| Rollback ran `down -v` | HIGH (data) | Restore from the kept original `<id>-pre-migration` plus the pre-migration backup; named-volume data is gone unless backed up; the reason Pitfall 12 is first |
| Migration interrupted, old stack stopped | LOW-MEDIUM | With a journal: startup auto-rollback. Without: `docker compose start` in the original dir (documented in the error note), rename the aside directory back |
| Stale proxy config after mode switch | LOW | Mode-switch tool removes Docktor-owned keys per stack; re-apply |
| Reset-mail host poisoned | MEDIUM | Rotate `BETTER_AUTH_SECRET`-bound tokens by deleting `reset-password:*` Verification rows; set `BETTER_AUTH_URL` |
| SSE stream stayed alive after revoke | LOW | Restart Docktor closes all; fix registry |

## Pitfall-to-Phase Mapping

Suggested ordering from dependencies: **P-MIG** and **P-PROXY** are independent of auth and can run first or in parallel. **P-AUTHZ** must land before **P-OIDC** (OIDC provisions into roles) and before **P-RESET** is declared done (its "signs out all sessions" guarantee depends on the SSE connection registry). Audit tables should exist before OIDC and user management so those events are captured from day one.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Role default and backfill | P-AUTHZ | Restore v0.1.1 DB, boot, owner signs in; second user is not owner |
| 2 Per-route authz missed | P-AUTHZ | Boot-time `onRoute` guard; route enumeration test; role x route matrix |
| 3 SSE authz and revocation | P-AUTHZ (+P-RESET) | Stream closes within N s of revoke; filtered events; heartbeat present |
| 4 Root-equivalent roles | P-AUTHZ | Written decision; matrix review; docs paragraph |
| 5 OIDC reopens signup | P-OIDC | Unknown-identity callback creates no user |
| 6 Implicit linking and 2FA bypass | P-OIDC | 2FA victim test fails to sign in; no `trustedProviders` |
| 7 2FA gate vs OIDC-only | P-OIDC | Matrix test over login method, mandatory flag, enrollment |
| 8 Password reset holes | P-RESET | Timing, revocation, tokens, 2FA, SMTP-absent, limiter tests |
| 9 Shared rate-limit bucket behind proxy | P-PROXY, P-AUTHZ | Test with and without `TRUST_PROXY`; UI warning |
| 10 Redirect URI/base URL drift | P-OIDC | UI shows exact URI; test connection |
| 11 better-auth version and static config | P-OIDC (first task, research flag) | Upgrade PR with green auth suite; documented config decision |
| 12 Rollback `down -v` | P-MIG | Argv assertion test |
| 13 In-place rollback and anonymous volumes | P-MIG | Rollback integration test on a real compose project with anonymous volume |
| 14 Interrupted migration | P-MIG | Kill-the-process test; startup recovery |
| 15 Stop not verified | P-MIG | Test with `-p` project and `COMPOSE_PROJECT_NAME` |
| 16 Empty named-volume copy | P-MIG | Missing-volume test; size/count compare |
| 17 Free-space check | P-MIG | Unit tests on estimator; fail-early test |
| 18 Compose editing shapes | P-PROXY | Table tests map/list for env, labels, networks |
| 19 Traefik labels | P-PROXY | Golden-file tests |
| 20 Mode switch leftovers | P-PROXY | Switch test: preview diff, no auto redeploy, cert poller idle in external mode |
| 21 nginx-proxy WebSocket semantics | P-PROXY (spike) | Uptime Kuma idle test; vhost.d file test; default true migration |
| 22 Docktor behind proxy SSE | P-PROXY docs, P-AUTHZ | Heartbeat test; docs section |
| 23 Audit log design | P-AUTHZ | No-secrets grep test; survives user deletion; auth events recorded |
| 24 Stranding the instance | P-AUTHZ | Concurrent demotion test; last-owner guard |
| 25 `disabledPaths` exactness | P-AUTHZ/P-RESET/P-OIDC | Endpoint-allowlist test |
| 26 Secret masking | P-MIG | #103 tests plus list-form and URL cases |
| 27 `~` and exotic binds | P-MIG | Table-driven classifier tests |
| 28 Kept originals | P-MIG | Scanner, watcher and backup exclusion tests |
| 29 Progress toast | P-MIG | Unmount-mid-operation test |
| 30 Ownership preservation | P-MIG | Required root Linux CI job |
| 31-33 Minor | respective phases | Covered by each phase's review |

## Research Flags for Phases

- **P-OIDC: needs deeper research.** better-auth upgrade path (1.4.18 to current 1.x), dynamic vs static provider config, behaviour of the twoFactor plugin with OAuth sign-in on the target version, whether `validateUserInfo`/`accountSubject` exist and behave as documented.
- **P-PROXY (WebSocket): needs a spike.** Idle-timeout behaviour, vhost.d pickup without reload, file naming for multi-domain and wildcard rows.
- **P-AUTHZ: needs a design decision** (permission matrix, scoping, `admin` plugin or not) before plans; #87 is already `needs-design`.
- **P-RESET: standard patterns** once P-AUTHZ's connection registry exists.
- **P-MIG: standard patterns**, but needs real-Docker integration tests (anonymous volumes, `-p` projects, rollback), which the project memory says must run in GitHub Actions rather than locally.

## Sources

- Repository (primary, HIGH): `server/src/lib/auth.ts`, `auth-config.ts`, `auth-middleware.ts`, `two-factor-hooks.ts`, `routes/events.ts`, `routes/stacks.ts`, `routes/auth.ts`, `routes/account.ts`, `application/migration-service.ts`, `application/migration-operation-service.ts`, `application/proxy-service.ts`, `lib/compose-proxy-editor.ts`, `lib/proxy-stack-compose.ts`, `infrastructure/docker-executor.ts`, `external-stack-control.ts`, `volume-migrator.ts`, `smtp-client.ts`, `server/prisma/schema/auth.prisma`, `proxy.prisma`
- Installed `better-auth@1.4.18` source (primary, HIGH for that version): `dist/api/routes/password.mjs`, `dist/oauth2/link-account.mjs`, `dist/plugins/generic-oauth/{index,routes}.mjs`, `dist/plugins/two-factor/index.mjs`, `dist/api/index.mjs` (disabledPaths), `dist/context/create-context.mjs` (runInBackgroundOrAwait), `dist/db/schema.mjs` (additionalFields `input`)
- better-auth docs, current (MEDIUM; describe newer versions than installed): https://www.better-auth.com/docs/concepts/users-accounts , https://www.better-auth.com/docs/plugins/generic-oauth , https://www.better-auth.com/docs/authentication/email-password
- nginx-proxy `nginx.tmpl` (MEDIUM-HIGH): https://raw.githubusercontent.com/nginx-proxy/nginx-proxy/main/nginx.tmpl ; docs: https://raw.githubusercontent.com/nginx-proxy/nginx-proxy/main/docs/README.md (vhost.d naming; reload timing not documented, LOW)
- Traefik Docker provider reference (MEDIUM): https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/ , https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/ ; BasicAuth `$` escaping note: https://doc.traefik.io/traefik/v2.9/middlewares/http/basicauth/
- GitHub issues docktor-app/docktor #44, #61, #64, #79, #86, #87, #100-#109 (acceptance criteria and Phase 18 review findings WR-03/04/05/06/07/08/11, IN-01..05)
- `.planning/PROJECT.md` (constraints and key decisions)
- Not verified by execution in this research: Traefik runtime behaviour, nginx-proxy reload-on-vhost.d-change, `cp -a` ownership behaviour as non-root (that is #109's own open question).

---
*Pitfalls research for: Docktor v0.2.0 (migration hardening, external proxy and WebSocket, multi-user RBAC, OIDC, password reset, audit log)*
*Researched: 2026-10-21*
