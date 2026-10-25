# Feature Research

**Domain:** Self-hosted Docker Compose management (single host) -- v0.2.0 additions: migration hardening, external proxy mode + WebSocket toggle, password reset, OIDC sign-in, multi-user RBAC + audit log
**Researched:** 2026-10-21
**Confidence:** MEDIUM-HIGH (Coolify and Portainer role docs, nginx-proxy source/README, better-auth docs and advisories were read first-hand; Dockge and CapRover behaviour is MEDIUM/LOW because searches did not reach their primary docs)

This file replaces the 2026-03-10 greenfield feature research. It covers only the v0.2.0 scope (issues #44, #61, #64, #79, #86, #87, #100-#109). Everything already shipped (stack lifecycle, backups, managed nginx-proxy, 2FA, custom certs, migration wizard v1) is treated as an existing dependency, not re-researched.

## How Comparable Tools Actually Behave (Evidence Base)

| Topic | Portainer | Coolify | Dockge | CapRover | Takeaway for Docktor |
|-------|-----------|---------|--------|----------|----------------------|
| Users / roles | Global Administrator; per-environment roles (Environment Administrator, Operator, Helpdesk, Standard User, Read-Only User). Granular RBAC is Business Edition (the CE/BE split per role is not stated on the official page) | Per-team roles Owner / Admin / Member. Member is read-only. Only Owners manage Owners. Nobody can change their own role or remove themselves. Role change revokes that user's API tokens | One admin account (created on first launch); no multi-user found (LOW confidence) | Single instance password (MEDIUM-LOW) | Four fixed roles is the sweet spot. Portainer's model is too wide (per-environment x 5 roles x teams); Coolify's is the right size but lacks a middle "operate but not edit" tier |
| Operator semantics | Operator = see everything, act on existing resources, console/logs, but not create/edit/delete (Docker: not even start/stop per official page) | No operator tier: Admin does everything operational, Member nothing | n/a | n/a | Docktor's Operator = start/stop/restart/redeploy/update/trigger backup/view logs; no compose/env edit, no create/delete, no settings |
| Sensitive content hiding | Helpdesk cannot open consoles | Members cannot see container logs, compose/file-mount content, proxy config, basic-auth passwords | n/a | n/a | Read-only roles must not read `.env` values, logs or compose secrets by default |
| Per-resource scoping | Resource Control (ownership by user/team), plus per-environment role assignment | Team -> project -> environment; no per-resource ACL inside a team | n/a | n/a | No per-stack scoping in v0.2.0 (single host = one "environment"); build the permission check with a `stackId` parameter so scoping is additive later |
| Audit log | Authentication log + Activity log (BE): timestamp, user, context/endpoint, action, inspectable payload, origin IP, result; filter and export | Audit log visible to Owners and Admins only | none | none | Dedicated append-only table, Owner/Admin view only, filterable |
| OIDC / SSO | OAuth/OIDC supported, team/role mapping from claims is BE; "hide internal authentication prompt" toggle; default team "No team" | Social/OAuth providers (Authentik, Azure, ...). Sign-in matches an existing account by email (case-insensitive), no stored provider-to-account link; unknown email rejected when registration off. **CVE-2026-86117 (through 4.3.17): email-only matching with unverified IdP emails = account takeover** | none | none | Match on stable `(issuer, sub)`; link by email only under verified-on-both-sides rules; never silently trust IdP email |
| Proxy | Not managed | Managed Traefik or Caddy; "no proxy" option so the user runs their own | none | Managed nginx; per-app "Websocket Support" checkbox (MEDIUM, from a Chatwoot deployment guide) | External mode = do not deploy proxy, emit labels/snippets; WebSocket toggle is an established per-app convention (CapRover, Nginx Proxy Manager "Websockets Support") |
| Brownfield migration of an existing compose stack with data | none | none | Adopts stacks in place, no data moves | none | Docktor's migration wizard is itself a differentiator; no comparable tool sets safety expectations, so the bar comes from backup/restore best practice (see Migration section) |

## Feature Landscape

### Table Stakes (Users Expect These)

#### A. Multi-user, roles and enforcement (#64, #87)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Four fixed roles: Owner, Admin, Operator, Viewer, one role per user | Coolify/Portainer baseline; #87 requires "roles with documented permissions" | MEDIUM | See permission matrix below. Store a single role string (better-auth admin plugin stores comma-separated multi-role; do not expose multi-role) |
| Server-side enforcement on every route and every SSE stream (default-deny) | #87 acceptance criterion; hiding buttons is not security, and the Docker socket makes any mutating route host-root | HIGH | ~35 `requireAuth` bindings across 17 route files plus `routes/events.ts` SSE. Replace/extend with `requirePermission(action)` decorator; add a route-inventory test that fails if any registered `/api` route lacks a declared permission |
| Existing instance upgrade with zero steps: first (oldest) account becomes Owner | #87 acceptance criterion | LOW-MEDIUM | Prisma migration adds `role` and backfills the oldest user as `owner`; onboarding wizard's first account is created as Owner. Guard: if somehow no owner exists, oldest user wins on boot |
| Admin creates users (email, name, role, initial password) | Without self-registration (existing hook blocks `/sign-up/email` once a user exists) this is the only way to add users; works without SMTP | MEDIUM | Existing `before` hook blocks sign-up when `userCount > 0`; user creation must go through a server-internal path (e.g. admin plugin `createUser` or an internal API call), not the public sign-up route. Force/offer password change on first login |
| Change role, deactivate (ban) and delete user | Lifecycle completeness | MEDIUM | Deactivation must revoke all sessions immediately (better-auth `banUser` does). Permission is read from the DB per request (cookieCache is deliberately off in this codebase, so revocation and role change are instant) |
| Last-Owner protection and no self-role-change | Coolify rule; prevents lockout and self-escalation (CVE-2025-22611 in Coolify was exactly an Owner-escalation bug) | LOW | Cannot demote, deactivate or delete the last active Owner; nobody edits their own role or deletes themselves in the admin UI; only Owners create/promote/demote/remove Owners |
| Users manage their own account (password, 2FA, sessions) regardless of role | Already exists for the single user | LOW | Account routes stay open to every authenticated role; they must not become Admin-gated by accident |
| Audit log of security-relevant actions with who/what/when/outcome | #64 acceptance criterion ("who did what") | MEDIUM | See "Audit log contents" below |
| Audit log view (filter + pagination), Owner/Admin only | Coolify/Portainer baseline | MEDIUM | New page; filters: actor, action prefix, target, outcome, date range |
| Docs: permission matrix, per-stack scoping decision, upgrade note in `docs/deployment.md` and `docs/design.md` | #87 acceptance criterion | LOW | Decision text: "roles are global; per-stack scoping is not part of v0.2.0" |

**Recommended permission matrix** (opinionated; the compose/env-edit boundary is the key security line because anyone who can write a compose file can mount `/` and gain host root):

| Capability | Owner | Admin | Operator | Viewer |
|------------|:-----:|:-----:|:--------:|:------:|
| View dashboard, stacks, services, status, health, StackEvent log, update availability | yes | yes | yes | yes |
| View container logs (REST and SSE) | yes | yes | yes | no (default) |
| View compose YAML | yes | yes | yes | yes, with secret values masked |
| View/edit `.env` values | yes | yes | view masked only; no edit | no |
| Deploy / stop / restart / redeploy, apply image update | yes | yes | yes | no |
| Trigger manual backup | yes | yes | yes | no |
| Restore snapshot (overwrites data) | yes | yes | no | no |
| Create stack, edit compose/env, delete stack, template deploy | yes | yes | no | no |
| Proxy domains, TLS, custom certificates, WebSocket toggle | yes | yes | no | no |
| Brownfield scan, adopt, migration wizard (touches host filesystem and stops external stacks) | yes | yes | no | no |
| Settings: instance, SMTP, backup repository, ACME/proxy mode | yes | yes | no | no |
| Create/edit/deactivate Operators and Viewers | yes | yes | no | no |
| Manage Admins and Owners; configure OIDC provider; instance 2FA-required policy | yes | no | no | no |
| View audit log | yes | yes | no | no |

Rationale for Owner-only OIDC configuration: whoever controls the identity provider and its claim mapping can mint any identity, so it is the trust root and sits with the Owner (Coolify applies the same logic to Owner management). Open decision for the user: whether Viewers may read logs (Coolify hides them; they routinely leak secrets).

#### B. Per-stack scoping decision (#87)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Documented decision: roles are global in v0.2.0; per-stack scoping deferred | #87 requires scoping "decided and documented" | LOW (decision) | Coolify scopes by team/project, Portainer by environment; Docktor is single-host. Per-stack grants (e.g. Operator on stack A, Viewer on stack B) would need list filtering, per-stack SSE filtering, dashboard counts, and handling of cross-stack features (backups, proxy, certificates, templates). Cost HIGH, demand unproven |
| Permission seam takes an optional resource: `can(user, action, {stackId?})` | Makes later scoping additive instead of a rewrite | LOW | Implement now, ignore `stackId` until a scoping phase |

#### C. OIDC sign-in (#61, #87)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Owner configures one OIDC provider in Settings: issuer (discovery URL), client ID, client secret, scopes, button label; shows the redirect URI to register at the IdP | #61 "user can configure an OIDC provider" | MEDIUM-HIGH | Client secret stored AES-256-GCM like the SMTP password (`lib/crypto.ts`). Provider config is runtime data, not env, so use a runtime-registrable mechanism (better-auth `sso` plugin `registerSSOProvider` persists providers in the DB and does discovery; `genericOAuth` is configured once at startup). "Test discovery" button validates issuer, `issuer_mismatch`, missing endpoints |
| PKCE and issuer validation on | Standard OIDC hygiene | LOW | better-auth generic/sso default |
| "Sign in with <label>" button next to the email/password form; password login keeps working | #61 "coexists with email+password" | LOW | Hide button when no provider enabled |
| Identity key is `(issuer, sub)`, not email | Prevents the Coolify CVE-2026-86117 class of takeover | MEDIUM | An Account row (`providerId` + `accountId`=sub) is the link; email is only used for the first-link decision |
| First-sign-in rule A (existing user, explicit link): signed-in user links the IdP identity from their Account page; thereafter sign-in by `sub` | Safest; the only rule that is never implicit | LOW-MEDIUM | Use for the Owner and any pre-existing local account. Run with `disableImplicitLinking: true` |
| First-sign-in rule B (invited user): Admin pre-creates a user (email + role); first OIDC sign-in whose IdP email is `email_verified: true` and matches an invited, never-signed-in record attaches the identity | Standard "invite then SSO" flow, no SMTP needed | MEDIUM | Attacker cannot pre-register because only Admins create users, which closes the pre-account-takeover path. Because the Admin typed the email unverified, document the typo-claims-account edge |
| First-sign-in rule C (unknown email): reject by default; optional "create users on first OIDC sign-in" toggle, off by default, assigning a configurable default role (Viewer by default, never Admin/Owner), optionally restricted to allowed email domains | Portainer auto-provisions, Coolify rejects unknown emails; secure default = reject | MEDIUM | `disableImplicitSignUp`/`disableSignUp` semantics in better-auth. JIT-created users get Viewer unless the Owner picks otherwise |
| Reject IdP responses with no email or `email_verified != true` for any email-based decision | Core of every 2026 OAuth-linking advisory | LOW | Treat missing `email_verified` as false (Entra-style providers) |
| Upgrade better-auth from 1.4.18 to >= 1.6.11 before enabling any OAuth/OIDC provider | **CVE-2026-53516 / GHSA-g38m-r43w-p2q7**: with email+password enabled and an OAuth/SSO provider configured, implicit linking to an unverified pre-registered local email takes the account over; fixed in 1.6.11 (adds `requireLocalEmailVerified`, default true). `requireEmailVerification` alone does not mitigate. Docktor's wizard creates the Owner with `emailVerified=false`, so this is directly relevant | MEDIUM (upgrade risk) | Hard prerequisite for the OIDC phase. The two-factor hooks, rate-limit custom rules and `disabledPaths` in `lib/auth.ts` / `lib/auth-config.ts` must be re-verified against the newer minor |
| OIDC sessions interplay with the existing 2FA policy | The IdP is responsible for MFA; forcing TOTP enrollment on SSO-only users would break them | MEDIUM | Decide and document: OIDC-authenticated sessions are exempt from the instance "require two-factor" gate (`isTwoFactorMandatory` in `requireAuth`), local-password users are not. Needs explicit tests on the 2FA before/after hooks |
| Cannot unlink the only remaining sign-in method; a deactivated user cannot sign in via OIDC | Lockout/bypass prevention | LOW | better-auth `allowUnlinkingAll: false` default; ban check applies to SSO callbacks |
| Break-glass: the Owner can always sign in with a local password; on-box recovery script documented | Portainer's "hide internal auth" lock-out is a known foot-gun; IdP outages happen | LOW | Extend the existing "Resetting two-factor authentication" script docs with promote-to-owner / set-password |
| Audit events for OIDC sign-in, link, unlink, JIT create, failure reason | #87 criterion on security-relevant actions | LOW | Depends on audit log |
| Tests: allowed and denied access per role including the OIDC path | #87 acceptance criterion | MEDIUM | Needs a mock/in-process IdP for integration tests (real DB per project rule) |

#### D. Password reset by email (#79)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| "Forgot password?" on sign-in page, email form, identical neutral confirmation for known and unknown addresses | #79 criteria | LOW | Do not await the mail send (better-auth docs warn about timing leaks); unknown-address path must take the same time |
| Single-use token, 1 hour expiry, set new password page | #79 criteria | LOW-MEDIUM | Re-enable `/request-password-reset` and `/reset-password` (remove from `TWO_FACTOR_DISABLED_PATHS`); provide `sendResetPassword` |
| Reset revokes all existing sessions | #79 criterion | LOW | `revokeSessionsOnPasswordReset` defaults to OFF in better-auth; must be set true |
| Reset never bypasses 2FA | #79 criterion | LOW | Reset does not create a session; the next sign-in still runs the 2FA before/after hooks. Add a test |
| Feature unavailable with clear message when SMTP is not configured | #79 criterion | MEDIUM | `disabledPaths` is static but SMTP is a runtime DB setting, so gate in the auth `before` hook (return a specific "email delivery not configured" error) and have the sign-in page hide/disable the link via a public capability flag |
| Add both reset paths to the strict rate-limit budget (5 per 15 min per IP) | #79 criterion | LOW | Append to `AUTH_STRICT_PATHS`; include the token-consumption path |
| Send through the existing SMTP client regardless of notification trigger toggles | A reset mail must never be suppressed by the "backup failure notification" enable flags | LOW-MEDIUM | Use `infrastructure/smtp-client.ts` directly, not the trigger-gated notification subscribers |
| Reset URL built from the configured base URL, never from the request `Host` header | Host-header poisoning is the classic reset-link attack | LOW | Use `BETTER_AUTH_URL` / Settings base URL |
| Documentation in `docs/deployment.md` | #79 criterion | LOW | |

#### E. Proxy: external mode (#44) and WebSocket toggle (#86)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Instance-level proxy mode: `managed` (today) or `external` | Coolify offers a "no managed proxy" posture; #44 criterion "does not deploy or manage any proxy" | MEDIUM | Setting + wizard step ("I run my own reverse proxy"); in external mode the nginx-proxy/acme stack is never deployed and its settings UI is hidden |
| External mode writes Traefik labels into the service in the compose file when a domain is set | #44 criterion | MEDIUM | Minimum label set: `traefik.enable=true`, `traefik.http.routers.<id>.rule=Host(...)`, `.entrypoints=<user entrypoint>`, `.tls=true` + `.tls.certresolver=<user resolver>`, `traefik.http.services.<id>.loadbalancer.server.port=<internalPort>`. |
| Settings the labels need: Traefik entrypoint name(s), cert resolver name, and the proxy's Docker network name | Labels are inert without them; user's Traefik is the only party that knows its entrypoint/resolver names | LOW-MEDIUM | Attach the service to the user's existing external network (`external: true`) plus `traefik.docker.network` label; do not use `docktor_proxy` in external mode |
| Ready-to-copy snippets for Caddy, Nginx Proxy Manager (host/port/scheme field list) and plain nginx | #44 "alternatively or additionally"; cheap and covers non-label proxies | LOW | Read-only; generated from domain + service name + port; no compose changes |
| Do not write `VIRTUAL_HOST` / `LETSENCRYPT_HOST` in external mode | Those env vars would be inert, or worse, pick up a stray nginx-proxy | LOW | Branch in the compose rewriter on the mode |
| Honest cert/health display in external mode | Docktor has no visibility into the user's proxy by design; showing a perpetual "pending" cert would mislead | LOW-MEDIUM | New state (e.g. "managed externally") for `certStatus`; hide custom-certificate upload for external domains; the cert poller skips them |
| Defined behaviour when switching mode with existing domains | Silent half-converted state is the main hazard | MEDIUM | Warn and require explicit confirmation, or refuse while managed-proxy domains exist; never silently rewrite compose |
| Per-domain "WebSocket support" toggle in the domain assign/edit dialog, persisted on `ProxyConfig`, shown on the Proxy tab, in the Zod schema in `@docktor/shared` | #86 criteria | MEDIUM | See key finding below; default OFF for all existing and new rows so "existing domains keep behaviour" holds and new/existing are consistent |
| Unit tests for validation and generated config, integration test saving the option | #86 criteria | LOW-MEDIUM | |

**Key finding for #86 (verified in nginx-proxy `nginx.tmpl` and README):** nginx-proxy already forwards WebSocket upgrades on every virtual host. The `http` block has `map $http_upgrade $proxy_connection { default upgrade; '' ... }`, and the default header block sets `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection $proxy_connection`. There is no per-VIRTUAL_HOST WebSocket env var or label. So "turn WebSocket off" has no native meaning, and the toggle cannot be implemented as a container env var. What breaks Uptime Kuma, Home Assistant and Grafana Live in practice is the idle timeout on a quiet socket (nginx `proxy_read_timeout` default is 60 s; not confirmed whether nginx-proxy overrides it, so verify in phase research as #86 itself instructs). The honest, implementable design: ON writes a per-domain override file `volumes/vhost.d/<domain>_location` with long `proxy_read_timeout` / `proxy_send_timeout` (for example 3600 s); OFF removes it. Docktor's proxy stack already mounts `./volumes/vhost.d:/etc/nginx/vhost.d` (`lib/proxy-stack-compose.ts`), and nginx-proxy documents `<VIRTUAL_HOST>_location` files for exactly this. Label the control "WebSocket / long-lived connections" so it does not over-promise. Caveats: filename must equal the VIRTUAL_HOST exactly, one file per domain, files must be reconciled on domain rename/removal and survive redeploys, and this is derived state outside the compose file (a small bend of YAML-first that needs a documented reconcile rule).

In external mode the toggle only matters for snippet generation: Traefik and Caddy proxy WebSockets natively with no configuration (Traefik claim is MEDIUM, from a third-party guide), whereas Nginx Proxy Manager has a "Websockets Support" switch and plain nginx needs the Upgrade headers. So external-mode snippets read the same `websocketEnabled` field. Build #86 first (managed path), then #44 consumes the field.

#### F. Migration hardening (#100-#109)

Comparable tools do not migrate brownfield stacks with data, so the expectations below come from backup/restore best practice: never destroy the original, verify before claiming success, back up before downtime, fail early on preconditions, report honestly, never leak secrets.

| Feature | Issue | Why Expected | Complexity | Notes |
|---------|-------|--------------|------------|-------|
| Rollback that restores the original stack: best-effort `down` (no `-v`) after failed `up`; in-place rollback brings the original up from restored original files; restart only services that were running before; verify before saying "restarted"; surface cleanup errors | #100 | A rollback that silently lies is worse than none | MEDIUM-HIGH | Needs a pre-stop snapshot of running services and a post-rollback verification step; message states are `verified` / `requested` / `failed` |
| Resolve the real named volume (`name:` override else `<project>_<key>`), `docker volume inspect` before copying, read-only mount, never auto-create, external volumes rewritten as `{external: true, name: resolved}` | #101 | Silent empty copy = data loss on cutover | MEDIUM | `volume-migrator.ts`, `compose-rewriter.ts`, wizard defaults for already-external volumes |
| Verify the old project is actually stopped (`compose ps -q` or resolve via `com.docker.compose.project.config_files` label); say "requested" when unverifiable; stop timeout scales with service count; timeout never leads to `start` | #102 | `-p <name>` / `COMPOSE_PROJECT_NAME` stacks otherwise run side by side with the new one | MEDIUM | Also fixes a data-safety risk: two DB containers on the same data |
| Back up before stopping; free-space estimate check first; opt-out skips both | #107 | Downtime must not scale with backup size; fail early on full disk | MEDIUM | Reorder in `migration-service.ts`; size estimate via existing disk-usage scanner |
| Mask secrets in the compose diff with the same key-aware masking and one reveal toggle | #103 | Existing mask on `.env` preview gives false assurance | LOW | Client-only |
| `~` bind sources: list as "stays outside Docktor" or handle consistently; no stray empty dir | #104 | Prevents migrated stack still pointing at `~/data` plus an empty copy | LOW-MEDIUM | Pick the "stays outside Docktor" option: simpler and safer (home dir semantics differ inside the container) |
| Progress toast lifecycle independent of mounted component; guard `JSON.parse` in `useContainerEvents`; derive event types from `@docktor/shared` (client mirror lacks `"expiring"`); remove duplicate resync | #105 | Stuck toast erodes trust in the whole flow | LOW-MEDIUM | |
| Scanner skips `*-pre-migration` and `*-pre-migration-<n>` | #106 | Prevents double import | LOW | |
| Type-safe analyzer, `AppError` `ErrorOptions`/`cause`, logger not `console.error`, `composePath` realpath + basename recheck, reject `..` in schema | #108 | Symlinked `compose.yml` reading an arbitrary file is a real path-traversal vector | LOW-MEDIUM | Treat the symlink/path part as security, the rest as convention cleanup |
| Verify ownership/mode/timestamp/symlink preservation as root on Linux; decide and test `${VAR}` handling when running compose with Docktor's own environment | #109 | Postgres data with wrong uid fails to start after migration | LOW-MEDIUM | Root-gated test is skipped on non-root CI: add a Linux root CI job or documented manual check |
| Migration/import routes are permission-gated (Admin+) and audit-logged (start, success, rollback, failure) | RBAC dependency | Migration stops external stacks and writes host paths | LOW | Falls out of RBAC + audit phases; sequence migration before or alongside so new routes are born gated |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| OIDC and RBAC both free, never paywalled | Explicit #61/#64 positioning against Portainer's paywalled SSO/RBAC | LOW (policy) | Say so in docs; no feature flags |
| Aggregated migration preflight report (free space, volumes exist and resolved names, project name, ports, `~` sources, running services snapshot) shown before the user confirms | Turns hardening fixes into visible trust; no comparable tool offers safe brownfield migration | MEDIUM | Mostly assembled from #101/#102/#104/#107 outputs |
| Rollback verification shown to the user ("original stack verified running: 3/3 services") | Trust | MEDIUM | Builds on #100 |
| Role mapping from IdP claims (e.g. `groups` -> role) with a safe default | Portainer reserves claim-based team mapping for Business | MEDIUM | Defer to a v0.2.x follow-up; never map to Owner |
| Invite by email link for new users (when SMTP exists) | Nicer than sharing a temp password | MEDIUM | Needs mailer + token + accept page; builds on reset plumbing |
| Audit log export (CSV/JSON) and configurable retention | Portainer BE has export/retention; useful for shared homelabs | LOW-MEDIUM | Retention default e.g. 365 days, prune job |
| "Sign-in with SSO only" policy for non-Owner users, Owner keeps local login | Closes the password attack surface for teams | LOW-MEDIUM | Only with break-glass Owner login |
| Security-event email to the user ("your password was changed", "new sign-in method linked") | Cheap detection of takeover | LOW | Uses existing mailer |
| External-mode snippet generator for more proxies (Caddyfile, NPM fields, nginx, Traefik file provider) | Covers the "large share of power users" #44 mentions | LOW each | Pure functions, easy to unit test |
| Per-stack scoping | The real Portainer-parity feature | HIGH | Deferred, see anti-features |
| Resumable migration across server restarts | Long migrations survive a Docktor restart | HIGH | Defer |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Link OIDC identity to a local account by email alone | Easiest first-sign-in UX | Account takeover (Coolify CVE-2026-86117; better-auth CVE-2026-53516) | `(issuer, sub)` key; explicit link from Account page or invited-user attach with verified email on the IdP side |
| Create users with elevated roles from IdP claims by default | Zero-touch admin onboarding | One misconfigured IdP group hands out Owner | JIT default role Viewer; claim mapping later, never to Owner |
| Custom role editor / per-permission toggles | Portainer BE-style flexibility | Combinatorial test matrix, easy to create accidental host-root roles | Four fixed documented roles |
| Per-stack ACLs in v0.2.0 | Feature parity with Portainer Resource Control | List/SSE/dashboard filtering and cross-stack features multiply surface; most targets are 1-5 person homelabs | Global roles now; `can(user, action, {stackId})` seam |
| User impersonation | Admin support convenience | Breaks audit attribution; better-auth ships it in the admin plugin | Do not enable; add `/admin/impersonate-user` to `disabledPaths` |
| Admin-triggered password reset of other users / admin sees passwords | Convenience | Explicitly out of scope in #79; reset links delivered to the wrong party | Admin sets an initial password on creation; user self-service reset afterwards |
| Password reset that logs the user in, or skips 2FA | "Fewer clicks" | Turns email access into full account access | Reset then normal sign-in with 2FA |
| Reset link built from the request Host header | Works without config | Host-header poisoning | Configured base URL |
| SSO-only with no local break-glass | "Pure SSO" posture | Lockout when the IdP is down or misconfigured | Owner always keeps password login plus on-box recovery script |
| LDAP, SAML, SCIM, multiple simultaneous IdPs | Enterprise checkboxes | Listed out of scope (LDAP); each adds config and test surface | One OIDC provider covers Authentik, Keycloak, Authelia, Pocket ID, Entra, Google |
| Docktor health-checking or managing the user's external proxy | "Show me the proxy is working" | Explicitly out of scope in #44; no visibility by design | Show generated config only; document how to verify |
| ProxyProvider abstraction (#43) | Cleaner code | Deferred past v0.2.0 | One `proxy.mode` setting plus pure label/snippet generator functions |
| Per-path WebSocket rules, raw nginx config editor | Power users | Out of scope in #86; unbounded config surface | Single per-domain toggle |
| Logging read-only requests / SSE connections in the audit log | "Complete" audit | Floods the table, hides signal | Log mutations, auth events and access-denied only |
| Hash-chained tamper-evident audit log, SIEM streaming | Compliance feel | Overkill for self-hosting; DB owner can rewrite anyway | Append-only table, no UI delete, retention prune, export |
| Auto-delete the kept `<id>-pre-migration` original | Disk hygiene | Removes the only recovery copy | Hide from scanner (#106); optional explicit "delete kept original" action later |
| Live copy of a running database volume during migration | Zero downtime | Corrupt copy risk | Keep stop-verify-copy order (#102, #107) |
| Silently converting `external:` volumes or `~` binds | "It just works" | Wrong volume or empty data (#101, #104) | Treat as "stays outside Docktor" with explicit wording |

### Audit Log Contents (design input for #64)

Separate `AuditEvent` table. Do not reuse `StackEvent` (per-stack config/update events) or `StatusLog` (state-machine transitions); the audit log is instance-wide and actor-centric.

| Field | Content |
|-------|---------|
| `id`, `occurredAt` | cuid, UTC timestamp |
| `actorUserId` (nullable, no cascade FK) + `actorEmail` and `actorRole` snapshots | Rows must survive user deletion and role change |
| `actorType` | `user`, `system` (scheduler, poller), `anonymous` (failed sign-in) |
| `authMethod` | `password`, `oidc`, `session` |
| `action` | Dotted verb, e.g. `auth.sign_in`, `auth.sign_in_failed`, `auth.password_reset_requested/completed`, `auth.2fa_enabled/disabled`, `auth.oidc_linked/unlinked`, `user.created/role_changed/deactivated/deleted`, `settings.updated`, `stack.created/deployed/stopped/restarted/deleted/compose_edited/env_edited/updated`, `backup.run/restored`, `proxy.domain_assigned/removed`, `proxy.mode_changed`, `certificate.uploaded/deleted`, `migration.started/succeeded/rolled_back/failed`, `import.adopted`, `access.denied` |
| `targetType`, `targetId` | `stack`/stackId, `user`/userId, `setting`/key |
| `outcome` | `success`, `failure`, `denied` |
| `ip`, `userAgent` | From Fastify `request.ip` (honours `TRUST_PROXY`), not raw headers |
| `metadata` (JSON, sanitized) | Role from/to, changed setting keys, service name, domain; **never** secrets, env values, passwords, tokens, or compose content (store "changed" plus a content hash at most) |

Rules: append-only (no edit/delete in UI), written by the application services (so action names carry domain meaning) with a thin route-level fallback for generic mutations, failure to write an audit row for a role/user change must fail the operation or log loudly, view restricted to Owner/Admin, retention prune job. Failed sign-in logging should store the attempted email only (never anything resembling a password) and be bounded so a brute-force attempt cannot flood the table (the existing 5-per-15-min limiter helps).

## Feature Dependencies

```
better-auth upgrade (>= 1.6.11)
    └──required before──> OIDC sign-in (#61)
                              ├──requires──> RBAC roles (JIT default role, role of linked user)
                              ├──requires──> encrypted provider config in Settings (lib/crypto.ts)
                              └──conflicts──> instance "require 2FA" gate (needs OIDC exemption decision)

RBAC role column + Owner backfill + permission seam
    ├──requires──> requirePermission on every route + SSE stream (events.ts)
    ├──enables──> Admin user management (create / role / deactivate)
    │                 └──requires──> internal user-creation path (current sign-up hook blocks userCount > 0)
    └──enables──> Audit log view (Owner/Admin only)

Audit log (AuditEvent table + service)
    └──enhanced by──> every other phase's actions (auth, settings, stack, proxy, migration, OIDC)

Password reset (#79)
    ├──requires──> SMTP settings + smtp-client (direct send, not trigger-gated)
    ├──requires──> re-enable reset paths + strict rate limit + revokeSessionsOnPasswordReset
    └──enhanced by──> multi-user (more users, more resets), invite-by-email differentiator

WebSocket toggle (#86, managed path, vhost.d override)
    └──required before──> External proxy snippets (#44) consume websocketEnabled

External proxy mode (#44)
    ├──requires──> proxy.mode setting + onboarding wizard step
    ├──requires──> compose-rewriter branch (labels instead of VIRTUAL_HOST/LETSENCRYPT_HOST)
    ├──conflicts──> managed nginx-proxy stack deploy, custom certificate upload, cert poller
    └──touches──> ProxyConfig reconcile (adopt hand-written Traefik labels like VIRTUAL_HOST adoption)

Migration hardening (#100-#109)
    ├──#102 verified stop ──required before──> #100 trustworthy rollback and #107 reorder
    ├──#101/#104 volume and bind handling ──feeds──> preflight report differentiator
    └──enhanced by──> RBAC gate (Admin+) and audit events once those land
```

### Dependency Notes

- **OIDC requires the better-auth upgrade:** 1.4.18 (installed) is in the vulnerable range for CVE-2026-53516 the moment an OAuth/SSO provider is added next to email+password. Upgrade first, and re-run the 2FA/rate-limit/hook tests.
- **RBAC before OIDC:** OIDC needs a defined role for newly attached and JIT-created users, and Owner-only provider configuration needs the permission layer.
- **Audit log before the feature-heavy phases land (or alongside RBAC):** retrofitting audit calls later means touching every service twice. Define the `AuditService` interface in the RBAC phase, even if the UI ships later.
- **Password reset is independent** of RBAC and OIDC technically, but is worth shipping with multi-user because admin-created accounts otherwise have no recovery path besides an Admin.
- **#86 before #44:** the external-mode snippets reuse the stored WebSocket flag.
- **External proxy conflicts with managed-only features:** custom certificate upload (Phase 9), cert poller status, and the managed proxy stack deployment must all be conditional on `proxy.mode`.
- **Migration #102 before #100/#107:** rollback and reordered backup both rely on knowing the old project's containers are really stopped.
- **Single-user instances keep working:** role backfill plus Owner-by-default; no user action required (#87 criterion).

## MVP Definition

### Launch With (v0.2.0)

- [ ] Migration correctness set: #101, #102, #100, #107, #104, #103, #108 (symlink/path part), #106 -- data-loss and secret-leak fixes block trust in an already-shipped wizard
- [ ] better-auth upgrade to >= 1.6.11 with auth test suite green -- prerequisite and security fix
- [ ] RBAC: four roles, Owner backfill, default-deny enforcement on routes and SSE, route-inventory test, last-owner protection -- #64/#87 core
- [ ] Admin user management (create with initial password, change role, deactivate, delete) -- no multi-user without it
- [ ] Audit log (table, service wired into auth/user/stack/proxy/settings/backup/migration actions, Owner/Admin view with filters) -- #64 criterion
- [ ] Password reset by email with all #79 criteria -- table stakes for any multi-user tool
- [ ] OIDC: single provider, explicit-link and invited-user first-sign-in rules, reject-unknown default, verified-email rule, break-glass Owner login -- #61/#87
- [ ] WebSocket toggle (managed path, vhost.d timeouts) -- #86
- [ ] External proxy mode: Traefik labels plus Caddy/NPM/nginx snippets, cert state "managed externally" -- #44
- [ ] Documentation: permission matrix, scoping decision, OIDC setup per common IdP, external proxy mode, password reset, recovery script

### Add After Validation (v0.2.x)

- [ ] #105 toast/event-stream robustness and #109 Linux root CI verification, if not already folded into the migration phase -- low user-visible risk
- [ ] Claim-to-role mapping -- once real IdP setups reveal demand
- [ ] Invite-by-email, audit export and retention UI, SSO-only policy, security-event emails
- [ ] Migration preflight report and rollback verification display

### Future Consideration (v0.3+)

- [ ] Per-stack scoping -- only if teams with mixed trust levels appear
- [ ] Token-authenticated REST API (#60) with role-bound tokens (Coolify revokes tokens on role change; copy that)
- [ ] Resumable migration; ProxyProvider abstraction (#43); additional proxy providers

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Migration #101 correct volume copy | HIGH | MEDIUM | P1 |
| Migration #102 verified stop | HIGH | MEDIUM | P1 |
| Migration #100 reliable rollback | HIGH | MEDIUM-HIGH | P1 |
| Migration #107 backup before stop + space check | HIGH | MEDIUM | P1 |
| Migration #103 mask secrets in diff | HIGH | LOW | P1 |
| Migration #104 `~` binds | MEDIUM | LOW-MEDIUM | P1 |
| Migration #108 path/symlink hardening | MEDIUM | LOW-MEDIUM | P1 |
| Migration #106 hide kept originals | MEDIUM | LOW | P2 |
| Migration #105 toast and SSE robustness | MEDIUM | LOW-MEDIUM | P2 |
| Migration #109 Linux ownership verification | MEDIUM | LOW-MEDIUM | P2 |
| better-auth >= 1.6.11 upgrade | HIGH | MEDIUM | P1 |
| RBAC roles + enforcement + Owner backfill | HIGH | HIGH | P1 |
| Admin user management | HIGH | MEDIUM | P1 |
| Audit log (write path) | HIGH | MEDIUM | P1 |
| Audit log view/filter | MEDIUM | MEDIUM | P1 |
| Password reset by email | HIGH | LOW-MEDIUM | P1 |
| OIDC sign-in with safe linking | HIGH | MEDIUM-HIGH | P1 |
| WebSocket toggle | MEDIUM | MEDIUM | P1 |
| External proxy mode (Traefik labels) | MEDIUM-HIGH | MEDIUM | P1 |
| External proxy snippets (Caddy/NPM/nginx) | MEDIUM | LOW | P2 |
| Claim-to-role mapping | MEDIUM | MEDIUM | P3 |
| Invite by email | MEDIUM | MEDIUM | P3 |
| Per-stack scoping | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v0.2.0
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Portainer | Coolify | Our Approach |
|---------|-----------|---------|--------------|
| Roles | Global admin + per-environment 5-role set, teams | Owner/Admin/Member per team | Four fixed global roles; Operator tier that cannot edit compose/env |
| Owner safety | Not documented | Owner-only Owner management, no self role change | Same, plus last-owner protection |
| SSO/OIDC | OAuth; claim team mapping is BE | OAuth providers; email-match login (vulnerable class) | Free, `(issuer, sub)` identity, verified-email linking, invite-based first sign-in, unknown emails rejected by default |
| Audit | Authentication and Activity logs with payload, filter, export (BE) | Owner/Admin audit log | One append-only table, sanitized metadata, Owner/Admin view, export later |
| External proxy | not applicable | "No managed proxy" posture | `proxy.mode=external`: labels plus snippets, no visibility claims |
| WebSocket | n/a | Handled by Traefik/Caddy | Per-domain toggle backed by nginx-proxy vhost.d timeout override; honest labelling |
| Brownfield migration | none | none | Verified stop, backup first, verified rollback, masked diff |

## Open Decisions for the Roadmapper / User

1. Viewer visibility of container logs and masked compose (recommended: no logs, masked compose, no env).
2. Whether Operator may trigger backups (recommended yes) and restore (recommended no).
3. OIDC JIT user creation default (recommended off) and default role when on (Viewer).
4. OIDC sessions exempt from the instance "require two-factor" gate (recommended yes, documented).
5. WebSocket toggle default for new domains (recommended OFF, same as existing, to satisfy "consistent between new and existing"); semantics are "long-lived connection timeouts" because upgrades already pass.
6. Whether the Owner account (created with `emailVerified=false`) gets marked verified at upgrade; with the recommended explicit-link rule it does not matter.

## Sources

- Coolify roles and permissions (official docs), HIGH: https://coolify.io/docs/core/team/roles-and-permissions
- Coolify OAuth overview and email-match behaviour (official docs), HIGH: https://coolify.io/docs/core/security/authentication/oauth/overview
- Coolify CVE-2026-86117 (OAuth email-match takeover) via SentinelOne/OpenCVE listing, MEDIUM: https://www.sentinelone.com/vulnerability-database/cve-2026-86117/
- Coolify CVE-2025-22611 (owner escalation, fixed 4.0.0-beta.361), MEDIUM: https://nvd.nist.gov/vulnerability/detail/cve-2025-22611
- Portainer user roles (official docs), HIGH for role list, edition split unverified: https://docs.portainer.io/admin/user/roles
- Portainer activity/authentication log fields and OAuth team mapping (third-party guides), LOW-MEDIUM: https://oneuptime.com/blog/post/2026-03-20-audit-user-activity-portainer-be/markdown ; https://oneuptime.com/blog/post/2026-03-20-automatic-team-membership-oauth-claims/markdown
- nginx-proxy `nginx.tmpl` (Upgrade/Connection map and headers), HIGH: https://raw.githubusercontent.com/nginx-proxy/nginx-proxy/main/nginx.tmpl
- nginx-proxy docs (vhost.d, `_location` files, per-container labels), HIGH: https://github.com/nginx-proxy/nginx-proxy/blob/main/docs/README.md
- better-auth account linking and users/accounts (official docs), HIGH: https://www.better-auth.com/docs/concepts/users-accounts
- better-auth email/password and password reset (official docs), HIGH: https://www.better-auth.com/docs/authentication/email-password
- better-auth admin plugin (roles, ban, impersonation, access control), HIGH: https://www.better-auth.com/docs/plugins/admin
- better-auth SSO plugin (runtime provider registration, domain verification, provisioning), HIGH: https://www.better-auth.com/docs/plugins/sso
- better-auth Generic OAuth plugin, HIGH: https://www.better-auth.com/docs/plugins/generic-oauth
- better-auth CVE-2026-53516 / GHSA-g38m-r43w-p2q7 (fixed 1.6.11), MEDIUM-HIGH: https://corgea.com/advisories/vulnerabilities/CVE-2026-53516
- OAuth auto-link account takeover write-up, MEDIUM: https://workos.com/blog/oauth-auto-link-email-account-takeover
- Nginx Proxy Manager "Websockets Support" toggle and CapRover websocket setting (third-party guides), MEDIUM: https://developers.chatwoot.com/self-hosted/deployment/caprover
- Traefik WebSocket needs no special configuration (third-party guide), MEDIUM: https://documentation-meet.beta.numerique.gouv.fr/self-hosting/compose/traefik/
- GitHub issues docktor-app/docktor #44 #61 #64 #79 #86 #87 #100-#109 (read via `gh api`), HIGH for scope
- Docktor codebase: `server/src/lib/auth.ts`, `server/src/lib/auth-config.ts`, `server/src/lib/proxy-stack-compose.ts`, `server/prisma/schema/{auth,proxy}.prisma`, `docs/design.md`, `.planning/PROJECT.md`, HIGH

---
*Feature research for: Docktor v0.2.0 (migration hardening, proxy, access control)*
*Researched: 2026-10-21*
