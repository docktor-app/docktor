# Stack Research

**Domain:** Self-hosted Docker Compose management platform — v0.2.0 additions (migration hardening, external proxy mode and WebSocket, password reset, OIDC, RBAC, audit log)
**Researched:** 2026-10-21
**Confidence:** HIGH for the better-auth findings (checked against the npm registry, the 1.7.12 package source and the GitHub security advisories). MEDIUM for the nginx-proxy WebSocket mechanics (read from the template, not exercised). MEDIUM for Traefik and Caddy label syntax (official docs).

**Headline: v0.2.0 needs exactly one dependency change: upgrade `better-auth` from `^1.4.18` to `^1.7.12`.** No new runtime packages are needed. Everything else is already installed (`nodemailer`, `yaml`, `zod`, Prisma 7, `node-cron`, the in-memory event bus) or is Docktor code on top of them.

---

## The Decision That Gates Everything: Upgrade better-auth to 1.7.x First

| Item | Finding |
|------|---------|
| Installed | `better-auth 1.4.18` (root `package.json`: `^1.4.18`) |
| Latest | `1.7.12` (published 2026-10-20). The 1.4 line ended at `1.4.22` (March 2026) and gets no more fixes. |
| Why upgrade | Several advisories that matter for OIDC are fixed only in 1.6.x and 1.7.x, and the 1.4 line never received the fixes. |

Advisories relevant to this milestone (GitHub security advisories for better-auth; HIGH confidence):

| Advisory | Summary | Fixed in |
|----------|---------|----------|
| GHSA-g38m-r43w-p2q7 (high) | OAuth sign-in can link to an account an attacker registered in advance (pre-registration account takeover). This is exactly the multi-user plus OIDC scenario. | 1.6.11 |
| GHSA-wxw3-q3m9-c3jr (medium) | OAuth callback accepts a forged `state` when state is kept in a cookie | 1.6.2 |
| GHSA-965c-763c-88jm (critical) | OAuth state can be used as a Magic Link to sign in as another user | 1.7.7 |
| GHSA-r4xp-prcw-77qf (high) | OAuth Proxy plugin lets an attacker sign in as another user | 1.7.7 |
| GHSA-fmh4-wcc4-5jm3 (high) | Organization invitations can be accepted by an unverified account | 1.6.11 |

**Minimum safe version for OIDC is 1.7.7. Pin `^1.7.12`.** Do not ship OIDC on the 1.4 line, and do not "stay on 1.4.22 to avoid the migration".

**Do the upgrade as its own first phase, before any feature work.** The plan below handles the known regressions.

### What the 1.4.18 to 1.7.12 jump changes for Docktor's existing customisations

| Change | Impact on Docktor | Action |
|--------|-------------------|--------|
| 1.6: `session.freshAge` is now measured from `createdAt`, not `updatedAt` | Routes behind `freshSessionMiddleware` (for example unlinking an account) and `sensitiveSessionMiddleware` (used inside the twoFactor plugin) can start answering "session not fresh" after about 24 hours of being signed in. | Add an integration test for 2FA enable/disable and change-password at session age over 24h. Then decide: set `session.freshAge` explicitly, or `0` if password re-entry is already required (as it is for the 2FA endpoints). |
| 1.7: `enableTwoFactor` returns a discriminated `method` (`"totp"` or `"otp"`) | `totpURI` and `backupCodes` are only present for `"totp"`. This is a TypeScript break in `account-security-service.ts` and the client enrollment UI. | Narrow on `method === "totp"`. Keep OTP closed (the existing `TWO_FACTOR_DISABLED_PATHS` entries for OTP stay). |
| 1.7.0 to 1.7.2 added a required `Account.issuer`; 1.7.3 reverted it | Docktor targets 1.7.12, so the `Account` table is unchanged from 1.4/1.6. **No backfill is needed.** | Before upgrading, run the duplicate check from the upgrade guide: `SELECT "providerId","accountId",count(*) FROM account GROUP BY 1,2 HAVING count(*)>1;`. Do not add an `issuer` column. |
| 1.7: generic OAuth rewritten as a first-class social provider | Not an issue for Docktor because it has no generic OAuth today. It affects how OIDC is wired (see below): `signIn.social({provider})`, callback `/api/auth/callback/:providerId`, and no `genericOAuthClient()`. | Write OIDC against the 1.7 API from the start. Ignore older tutorials that use `signIn.oauth2` and `/oauth2/callback/`. |
| 1.7: `advanced.trustedProxyHeaders` | Only applies when `baseURL` is the dynamic `allowedHosts` form. Docktor uses a plain string or undefined. | No action. Leave `baseURL` as a string. |
| Prisma adapter | `better-auth/adapters/prisma` still exports; `@prisma/client` peer is `^5 \|\| ^6 \|\| ^7` (Docktor is on 7). The `joins` option moved to `advanced.database.joins`. | Leave joins off. Use `npx auth generate --adapter prisma` only to diff the schema, then hand-merge into `server/prisma/schema/auth.prisma`. Do not run `npx auth migrate` (that is for the built-in Kysely adapter). |
| Database rate-limit storage | The `RateLimit` table is Docktor-owned (`rate-limit.prisma`). 1.7 changed the custom-storage interface to `consume()`; the built-in database storage is not documented as changed. | Verify with `npx auth generate --adapter prisma` that the `RateLimit` model shape is unchanged. Keep the existing rate-limit integration tests as the gate. |
| Node | Production image is `node:22-slim`; `engines` is `>=22`. The `auth` CLI needs Node 22.12 or newer (dev-only). | No action. |
| Zod | 1.7 depends on `zod ^4.5.4`; the repo has `^4.3.6`. Compatible within the 4.x range. | Let the lockfile resolve to one 4.x version. Run `tsc --build` in CI. |

Keep these existing protections and re-run their tests after the upgrade: `disabledPaths`, the `ipAddressHeaders` stamping, `useSecureCookies`, and the no-`cookieCache` rule (GHSA-xg6x-h9c9-2m83).

---

## Recommended Stack

### Core Technologies (changes only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-auth` | `^1.7.12` (from `^1.4.18`) | Password reset, OIDC sign-in, admin/RBAC plumbing | Already the auth foundation. 1.7.x carries the OAuth security fixes (see above). Every plugin below ships inside this one package, so there is no new dependency. |
| `better-auth/plugins` `genericOAuth` | in `better-auth` | OIDC sign-in against one operator-configured provider | Core plugin. It supports `discoveryUrl`, PKCE on by default, ID-token signature, issuer, audience and nonce verification, and `disableImplicitSignUp` / `disableSignUp`. It reuses Docktor's existing `Account`, `Session` and `User` tables with no new schema. |
| `better-auth/plugins` `admin` + `better-auth/plugins/access` | in `better-auth` | `role`, ban and user-management endpoints, plus a typed role-to-permission model (`createAccessControl`, `ac.newRole`, `role.authorize()`) | Gives a tested role column, ban with session revocation, and `createUser` / `setRole` / `listUsers` / `removeUser`. Docktor does not hand-roll a role system. `authorize()` and `hasPermission` are pure, synchronous functions, so the same definition can drive server route guards and client UI hiding. |
| PostgreSQL `AuditLog` table (new Prisma model) | Prisma 7 (existing) | Append-only audit log | Docktor already owns its data in Postgres with the repository pattern. An audit log needs no library: it is one table, one repository, one service, and a subscriber on the existing event bus. |

### Database (additions to existing schema)

| Change | Purpose | Notes |
|--------|---------|-------|
| `User`: `role String?`, `banned Boolean? @default(false)`, `banReason String?`, `banExpires DateTime?` | Admin plugin fields | Add to `server/prisma/schema/auth.prisma`. Existing rows get `role = NULL`, so a backfill is mandatory (next section). |
| `Session`: `impersonatedBy String?` | Admin plugin field | Required by the plugin even though impersonation is disabled. |
| New `server/prisma/schema/audit-log.prisma`: `AuditLog { id, createdAt, actorId?, actorEmail?, actorRole?, action, resourceType?, resourceId?, outcome, ip?, userAgent?, metadata Json? }` | Audit log | Make `actorId` and `resourceId` plain strings with no foreign keys, so rows survive user and stack deletion. Snapshot `actorEmail`. Index `(createdAt)`, `(actorId, createdAt)`, `(action, createdAt)`, `(resourceType, resourceId)`. |
| `ProxyConfig`: `websocketEnabled Boolean` | #86 | See the WebSocket section for the default. Existing rows must keep their current behaviour (backfill to whatever matches today's nginx-proxy behaviour). |
| Settings keys: external-proxy mode, entrypoint name, certresolver name, external network name; OIDC provider config (client secret via the existing `encrypt()`) | Config | Reuse the existing `Setting` table (`encrypted` flag). No new table. |

**Owner backfill.** Add a startup reconciliation in the application layer: if no user has `role = "owner"`, promote the earliest-created user. This is idempotent, unit-testable, and covers "existing single-user instances keep working with no migration steps; the first account stays the owner" (#87). Prefer it over hand-editing migration SQL (`server/CLAUDE.md` says never edit migrations manually). The first-run setup wizard must also create the first user with `role = "owner"`; that goes through the existing `signUpEmail` path in `onboarding-service.ts`.

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| None new | | | v0.2.0 does not add containers or services. The managed proxy stays `nginxproxy/nginx-proxy` plus `acme-companion`. External-proxy mode explicitly deploys nothing. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nodemailer` | `^8.0.2` (already installed; keep) | Password-reset email | Reuse `SmtpClient` and `NotificationService`'s SMTP config (decrypted per send). Extend the `sendMail` message with optional `html` only if wanted; plain text is sufficient. The registry shows `nodemailer 10.x`; a major bump is not needed for this milestone and is out of scope. |
| `yaml` | `^2.7.0` (already installed; keep) | Traefik label emission into the compose file | Use the Document API as `compose-proxy-editor.ts` does today (surgical edits that preserve comments). |
| `zod` | `^4.3.6` (already installed) | Schemas for OIDC settings, external-proxy settings, role assignment, audit-log queries | Put all in `@docktor/shared/src/validation/`, per project rules. |
| `node-cron` | `^3.0.3` (already installed) | Audit-log retention prune job | Optional; a daily `deleteMany` older than a configurable window. |
| Domain event bus (`InMemoryEventBus`, existing) | n/a | Audit capture | Add an `audit-subscriber.ts` under `application/subscribers/` beside the existing incident, notification and stack-event subscribers. Its per-subscriber failure isolation means an audit write failure can never break the action. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npx auth@latest generate --adapter prisma` | Diff the schema better-auth expects against `auth.prisma` | Dev-only, Node 22.12 or newer. Hand-merge the result. Never `auth migrate`. |
| Existing Vitest, Testcontainers Postgres | RBAC allow/deny matrix per role, OIDC path, reset flow | Integration tests need a real DB (project rule). OIDC tests need a fake IdP; see Pitfalls for the options. |

---

## Integration Notes by Feature

### 1. Password reset (#79): better-auth core, no plugin

Config on the existing `betterAuth({...})`:

```ts
emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60,   // 1 hour
    revokeSessionsOnPasswordReset: true,    // acceptance criterion: signs out all sessions
    sendResetPassword: async ({user, url}) => { /* build mail, hand to NotificationService/SmtpClient */ },
},
advanced: {
    backgroundTasks: {handler: (promise) => { void promise; }},  // REQUIRED, see below
},
```

- **Re-enable the two endpoints.** Remove `/request-password-reset` and `/reset-password` from `TWO_FACTOR_DISABLED_PATHS` in `auth-config.ts`. Rename the constant, since it will no longer be only two-factor paths.
- **Rate limits.** Add `/request-password-reset` and `/reset-password` to `AUTH_STRICT_PATHS`. The emailed link first hits a GET `/reset-password/<token>`. The rate limiter supports `*` wildcards in `customRules` keys (checked in the 1.7.12 source: `wildcardMatch` when the key contains `*`), so add `/reset-password/*` explicitly. The existing comment "exact paths only, never a wildcard" must be revisited for this one path.
- **Neutral response is built in.** In 1.7.12 `requestPasswordReset` returns `{status: true, message: "If this email exists in our system, check your email for the reset link"}` for known and unknown addresses alike (verified in `dist/api/routes/password.mjs`).
- **Timing oracle (verified in source).** better-auth calls `ctx.context.runInBackgroundOrAwait(sendResetPassword(...))`. Unless `advanced.backgroundTasks.handler` is set it **awaits** the send. A known address then takes as long as an SMTP round trip and an unknown one returns at once, so an attacker can enumerate accounts by response time. Setting the handler (as above) makes the send fire-and-forget. This is a hard requirement for the "account existence is not revealed" acceptance criterion.
- **2FA is not bypassed.** The reset endpoint only changes the password and creates no session, so sign-in still goes through the twoFactor hooks. Keep the `before` hook behaviour unchanged.
- **SMTP not configured.** `sendResetPassword` cannot report failure to the caller without breaking neutrality. Gate on the server side: a small Docktor route (`GET /api/auth-capabilities`, public) returns `{passwordReset: boolean}` from "is SMTP configured", and the sign-in page only shows "Forgot password?" when true. In the `before` hook, return a clear 4xx for the two paths when SMTP is unconfigured (this does not leak account existence).
- **`redirectTo`.** The link redirects to a client route (`/reset-password?token=`). The target must be in `trustedOrigins`; Docktor's dynamic `resolveTrustedOrigins` already covers the configured base URL.

### 2. OIDC sign-in (#61 / #87): `genericOAuth`, not `@better-auth/sso`

```ts
import {genericOAuth} from "better-auth/plugins";

genericOAuth({
    config: [{
        providerId: "oidc",
        discoveryUrl: `${issuer}/.well-known/openid-configuration`,
        clientId, clientSecret,                 // clientSecret decrypted from Setting
        scopes: ["openid", "email", "profile"],
        pkce: true,                             // default in 1.7, keep explicit
        requireIdTokenVerification: true,       // fail closed if discovery lacks JWKS
        disableImplicitSignUp: true,            // first-sign-in rule: see below
    }],
})
```

Client: `authClient.signIn.social({provider: "oidc", callbackURL})`. No `genericOAuthClient()` in 1.7. The IdP redirect URI to document for operators is `${baseURL}/api/auth/callback/oidc`.

Settings that matter (all verified as 1.7.12 types or docs):
- `account.accountLinking: {enabled, trustedProviders, disableImplicitLinking, allowDifferentEmails}`. **Recommended: `disableImplicitLinking: true`, and never list the OIDC provider in `trustedProviders` unless the operator opts in.** An OIDC email must not silently attach to an existing local account unless the IdP asserts `email_verified`. This is the mitigation for the same class as GHSA-g38m. Linking should be an explicit signed-in action (`linkSocial`) or an admin action.
- `account.encryptOAuthTokens: true`. OIDC rows in `Account` otherwise store access, refresh and ID tokens in plaintext. Docktor never needs them after sign-in, so also consider not requesting `offline_access`.
- `disableImplicitSignUp: true` plus `requestSignUp` semantic: a new OIDC identity does not create a user unless Docktor decides to allow it. Docktor decides per instance via a setting ("auto-create users on first OIDC sign-in as role X", default off with an admin pre-creating or inviting the user). Enforce with `databaseHooks.user.create.before` (Docktor code, in `lib/`), which also assigns the default role. Default new-user role must be the lowest privilege.
- `mapProfileToUser` cannot set `id` in 1.7 and the account subject defaults to the verified `sub`. Do not key identity on email.

**Config is static in better-auth.** `genericOAuth` reads `options.config` once at init. Provider endpoints are discovered at startup, with later retries only for a provider that failed discovery. There is no runtime-registration API in core. Two ways to give operators a Settings-page OIDC form:

| Option | Cost | Recommendation |
|--------|------|----------------|
| A. Env-var config (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`), restart to change | Zero plumbing | Acceptable minimum |
| B. DB-backed config (Setting rows, encrypted secret) plus an `AuthRuntime` holder that rebuilds the `betterAuth()` instance when the OIDC settings change | The `auth` singleton is imported in only two places (`routes/auth.ts`, `onboarding-service.ts`) plus `auth-middleware.ts`. Rebuilding is cheap because sessions and rate limits are DB-backed, but `routes/auth.ts` must call the current instance per request instead of capturing `toNodeHandler(auth)` once. | **Recommended**, because Docktor already keeps Base URL, SMTP and ACME settings in the DB and "configure in the UI" is the product's pattern. Treat the rebuild holder as a Docktor design (not a better-auth feature) and put it in its own plan. |

Config precedence rule if both exist: env wins and the UI shows it as read-only.

### 3. Roles and access control (#64 / #87): `admin` plugin with custom `ac`

Define the statement and roles once in `@docktor/shared` (new `shared/src/access/`), importing from `better-auth/plugins/access` (the docs recommend this subpath for small bundles) and `better-auth/plugins/admin/access` for `defaultStatements` and `adminAc`:

```ts
const statement = {
    ...defaultStatements,                       // user + session admin permissions
    stack: ["view", "create", "deploy", "operate", "edit", "delete"],
    backup: ["view", "run", "restore", "configure"],
    proxy: ["view", "configure"],
    settings: ["view", "update"],
    audit: ["view"],
    import: ["scan", "migrate"],
} as const;
export const ac = createAccessControl(statement);
// owner, admin, operator, viewer = ac.newRole({...}); spread adminAc.statements into owner/admin
```

(The statement shape above is a sketch; the actual permission matrix is a roadmap/architecture decision.)

- Plugin config: `admin({ac, roles, defaultRole: "viewer", adminRoles: ["owner", "admin"]})`. **If a role is not in `roles`, `setRole` and permission checks treat it as having no permissions.** Include every role.
- Server: a `requirePermission(resource, action)` preHandler factory next to `requireAuth` in `auth-middleware.ts`. It calls `roles[user.role].authorize({...})` (pure, no DB call; `userHasPermission` is the async API variant). `requireSession` already loads the user on every request, so the role comes for free once the admin plugin adds `role` to the session user type. Users can hold comma-separated multiple roles; `hasPermission` handles that.
- **Enforce on SSE, not only REST.** `routes/events.ts` currently runs `requireAuth` in `onRequest` once per connection. Add a permission check for each stream, filter events by what the role may see, and close open `EventSource` connections when a user's role changes, they are banned, or their session is revoked. A long-lived SSE connection otherwise keeps its authorisation from the moment it opened. This needs a hook into `StateBroadcaster` and is the easiest place to leave a gap.
- **Route the admin plugin's HTTP surface through Docktor, do not expose it.** Add all `/admin/*` paths to `disabledPaths`. `disabledPaths` is applied to HTTP requests only (the router `onRequest`, verified in 1.7.12 `dist/api/index.mjs`), so server-side `auth.api.createUser(...)`, `setRole`, `banUser`, `listUsers`, `removeUser`, `revokeUserSessions` calls still work. Docktor adds its own `/api/users/*` routes that call them from an application service, which gives one choke point for the 2FA-enrollment gate, the "last owner" invariant, the audit write, and Zod validation from `@docktor/shared`. This is also why impersonation (`/admin/impersonate-user`, `/admin/stop-impersonating`) must never be reachable: with Docker-socket authority it would be a privilege-escalation path.
- Keep the existing `before` hook that blocks `/sign-up/email` once a user exists. It is unaffected, because admin `createUser` uses a different path and goes through the Docktor route.
- Domain invariants better-auth does not give you (put in `domain/`): at least one `owner` must always exist (block demote, ban and delete of the last owner); a non-owner cannot grant `owner`.
- **Per-stack scoping is not supported by better-auth's access control** (it is global role to resource to action). #87 asks that per-stack scoping be "decided and documented". Recommendation: v0.2.0 ships global per-role scope and documents per-stack scoping as deferred. If it is pulled in later, add a Docktor-owned `StackAccess(userId, stackId, role)` table and a check in the same `requirePermission` guard. Do not adopt the organization plugin for this (see "What NOT to Use").
- Client: `adminClient({ac, roles})` is only needed if the UI calls the plugin client directly. With the Docktor-route design the client does not need it; use the shared `ac` and roles for `can(resource, action)` UI hiding. The server remains the enforcement point.
- 2FA interplay: `twoFactor` hooks apply to credential sign-in only. OIDC sign-in does not prompt for TOTP (the IdP owns that). The mandatory-2FA gate in `requireAuth` (`isEnrollmentRequired`) would lock out OIDC-only users who cannot enroll TOTP; decide the policy (exempt OIDC-only users) in the roadmap.

### 4. Audit log (#64): Postgres table plus event-bus subscriber

- **Storage:** the `AuditLog` model above, `AuditLogRepository`, `AuditService` (`record()`, `list(filters, cursor)`). No library.
- **Capture points (both are needed):**
  1. Docktor domain actions (deploy, stop, delete, settings change, user and role changes, backup restore, proxy changes, migration): emit domain events on the existing `InMemoryEventBus`; an `audit-subscriber.ts` writes rows. Subscriber isolation means an audit failure cannot fail the user action, but also means a failed write is silent, so log failures through the app logger and alert on them.
  2. Auth events from better-auth (sign-in success and failure, sign-out, password change and reset, 2FA enable and disable, OIDC sign-in and linking): record from the existing `hooks.after` middleware (`ctx.path`, `ctx.context.newSession`, `ctx.context.returned`), next to the current 2FA after-hook.
- Actor context: take `request.user` (id, email, role) and `request.ip` (honours `TRUST_PROXY`) at the route boundary and pass it into services as an explicit `actor` parameter. Do not read it from ambient state.
- Never store secrets: scrub `metadata`, and never write env values, compose contents, tokens or SMTP passwords. Store identifiers and key names only.
- Immutability: no update or delete endpoint. Retention via an optional `node-cron` prune job with a configurable window (default long, for example 365 days).
- API: `GET /api/audit-log` guarded by the `audit:view` permission, cursor-paginated on `(createdAt, id)`.

### 5. External proxy mode (#44): no library, extend the existing compose editor

Traefik label output is a handful of strings, emitted with the `yaml` Document API through the same editing path as `compose-proxy-editor.ts`:

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=<external proxy network>
  - traefik.http.routers.docktor-<stack>-<service>.rule=Host(`app.example.com`)
  - traefik.http.routers.docktor-<stack>-<service>.entrypoints=websecure
  - traefik.http.routers.docktor-<stack>-<service>.tls=true
  - traefik.http.routers.docktor-<stack>-<service>.tls.certresolver=<resolver>
  - traefik.http.services.docktor-<stack>-<service>.loadbalancer.server.port=<port>
```

(Syntax confirmed in the Traefik v3 Docker provider reference. The same labels are valid in v2.)

- Make `entrypoints`, `certresolver` and the shared network name **instance settings**, not constants. They are different on every user's Traefik, and Docktor cannot see their proxy.
- Router and service names must be unique across the user's whole Traefik, so prefix with `docktor-<stackId>-<serviceName>`. A bare service name collides.
- The service also needs to join the user's external proxy network (`networks: {<name>: {external: true}}`) or Traefik cannot reach it. Reuse the network-adding code path that already adds `docktor_proxy` in `compose-proxy-editor.ts`.
- The user's compose may use list-form or map-form `labels`; the editor must handle both and must never drop the user's own labels.
- Copyable snippets for other proxies are pure string builders in `domain/` (testable, no I/O), each a `{title, language, text}`:
  - **Caddy (caddy-docker-proxy labels):** `caddy: app.example.com` and `caddy.reverse_proxy: "{{upstreams <port>}}"` (the quotes only in YAML), plus the shared-network requirement (confirmed in the project README). Also offer a plain Caddyfile block (`app.example.com { reverse_proxy <container>:<port> }`) for users not running caddy-docker-proxy.
  - **Nginx Proxy Manager:** a field list to enter in the UI (domain, scheme, forward host as container name, forward port, "Websockets Support", SSL). Do not integrate with its API (undocumented, already ruled out in PROJECT.md Key Decisions).
  - **Plain nginx** (optional): a `server {}` block with `Upgrade` and `Connection` headers.
- Clipboard: `navigator.clipboard` exists only in secure contexts, and Docktor explicitly supports plain-http LAN installs. Use `navigator.clipboard.writeText` with a fallback (selectable text plus `document.execCommand("copy")`). No clipboard library is needed.

### 6. WebSocket per proxied domain on nginx-proxy (#86): verified behaviour changes what this feature is

Read from `nginx.tmpl` (main branch): nginx-proxy already forwards WebSocket upgrades for every vhost.
- `map $http_upgrade $proxy_connection { default upgrade; '' $proxy_connection_noupgrade; }`
- `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $proxy_connection;` at the http level.

So there is no missing "enable WebSocket" switch. A WebSocket client that sends `Upgrade` already works. What breaks WebSocket apps in practice is nginx's default `proxy_read_timeout` (60 seconds, nginx's own default, not set in the template) closing idle connections. The issue asked to "verify first how nginx-proxy treats Upgrade headers", and this is the result: **default behaviour is already on**, so the per-domain setting has to be defined as something other than on/off for the upgrade headers.

Recommended definition: `websocketEnabled` means "extend `proxy_read_timeout` / `proxy_send_timeout` for this domain". Implement by writing `volumes/vhost.d/<domain>_location` containing only timeout directives. This file is included inside the generated `location` block (template lines ~342-347) and `./volumes/vhost.d` is already mounted into nginx-proxy by `proxy-stack-compose.ts`.

- **Do not put `proxy_set_header` in that file.** In nginx, a `proxy_set_header` at location level replaces every inherited `proxy_set_header` from the http level, which would drop `Host`, `X-Forwarded-*` and the Upgrade headers. Timeouts only.
- A true "off" (stripping Upgrade) would therefore require re-declaring the whole header set. Recommend not offering "off" beyond "don't write the timeout file". Document that Upgrade is always forwarded.
- The template renders `exists "<file>"` at generation time, so creating a new `_location` file needs nginx-proxy to regenerate its config, not only reload. The current assign-domain flow recreates the service container, which fires a Docker event that triggers regeneration, so write the file before `compose up`. Toggling the setting alone, without a container event, needs a spike. **This is MEDIUM confidence; flag it for phase research.**
- Use a stable file name derived from the exact `VIRTUAL_HOST` value and clean it up in the "remove domain" path (the same idempotent apply/remove discipline as the certificate files). Wildcard hosts need the `\*` escaping seen in the template.
- Traefik and Caddy handle WebSocket upgrades natively, so external mode needs no WebSocket setting. The NPM snippet should tell the user to switch on "Websockets Support".
- Versions in the repo: `nginxproxy/nginx-proxy:1.11-alpine` is current (latest release `1.11.6`, 2026-07-16). `acme-companion` is pinned at `2.6.3` while `v2.8.2` is out (2026-07-17); a bump is optional and unrelated to these features.

### 7. Migration hardening (#100 to #109): no new packages

All of this is changes to `migration-service.ts`, `volume-migrator.ts`, `compose-rewriter.ts`, `compose-analyzer.ts`, `external-stack-control.ts`, and the client migration wizard. The existing tools suffice: `docker compose ps -q` and `docker volume inspect` through the existing `DockerExecutor`, `yaml` for `external: {name}` rewrites, `fs.realpath` for #108. For #103 (mask secrets in the compose diff), reuse the key-aware masking already used for the `.env` preview and the existing `diff` package (`^9.0.0`). Do not add a secret-scanning library. The mask works by key name, as the issue specifies.

---

## Installation

```bash
# The only dependency change (root package.json)
yarn add better-auth@^1.7.12

# Dev-only schema diff, never `auth migrate` (Prisma app); needs Node >= 22.12
npx auth@latest generate --adapter prisma
```

No other `yarn add` for v0.2.0.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `genericOAuth` (core plugin) | `@better-auth/sso` (`1.7.12`, runtime `registerSSOProvider`, `ssoProvider` table) | Only for a multi-tenant product where many customers each bring their own IdP, by domain. For Docktor (one instance, one IdP) it adds SAML (`samlify`, XML parsing), domain verification and organization linking that Docktor never uses, and it requires pinning to the same `better-auth` version exactly. Its advisory history is also the worst in the ecosystem: GHSA-5rr4-8452-hf4v (critical, SSRF), GHSA-prpr-5gj3-qqhg, GHSA-mx9r-x6ww-qjw9 and others. The better-auth self-service SSO dashboard also moved to their paid Infrastructure product in 1.5, which conflicts with Docktor's "never paywalled" stance for OIDC. |
| `admin` plugin plus custom `ac` | Hand-rolled `role` column and permission matrix | Only if you want zero better-auth schema additions. You would then reimplement ban-with-session-revoke, user CRUD, and role validation. Not worth it. |
| `admin` plugin plus custom `ac` | CASL or another ability library | Only if per-stack or attribute-based conditions are pulled into scope. The role-to-resource-action model covers per-role scoping. |
| Postgres `AuditLog` table | better-auth Infrastructure audit logs | Paid hosted product; does not cover Docktor's non-auth actions (deploy, delete, and so on). |
| Postgres `AuditLog` table | Ship audit events to a log file or external SIEM only | Add as an optional later sink. The in-app audit view (#64 "records who did what") needs queryable storage. |
| DB-backed OIDC settings with a rebuildable auth holder | Env-var-only OIDC config | If the roadmap wants to cap scope. Restart-to-change is a documented, acceptable first cut. |
| Docktor-side `/api/users/*` over `auth.api.*` | Expose `/api/auth/admin/*` directly to the browser | Only if you skip the audit, the last-owner invariant and the 2FA gate. Not recommended. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Staying on `better-auth` 1.4.x while adding OIDC | The OAuth account-linking and state-handling advisories (GHSA-g38m-r43w-p2q7, GHSA-wxw3-q3m9-c3jr, GHSA-965c-763c-88jm) are fixed only in 1.6.x and 1.7.x. The 1.4 line stopped at 1.4.22. | `^1.7.12` |
| `@better-auth/sso` | See Alternatives. SAML and organisation machinery, large advisory history, version-locked, and paid-dashboard coupling. | `genericOAuth` |
| `organization` plugin | Multi-tenant teams and invitations. It does not provide per-stack ACLs, and it carries its own advisory history (GHSA-fmh4-wcc4-5jm3). | Admin plugin roles now; a Docktor-owned `StackAccess` table later if per-stack scoping is needed |
| `oidcProvider` or `@better-auth/oauth-provider` | These turn Docktor into an identity provider. The need is the opposite: Docktor consumes an IdP. `oidcProvider` was removed in 1.7. | `genericOAuth` |
| Admin plugin impersonation (`/admin/impersonate-user`) | With Docker-socket authority it is an escalation path. | Add the `/admin/*` paths to `disabledPaths` and call `auth.api.*` server-side only |
| `@better-auth/api-key`, `bearer`, `jwt` | Token REST API is #60, explicitly out of scope for #87. | Defer to #60 |
| `signIn.oauth2`, `genericOAuthClient()`, `/api/auth/oauth2/callback/` | Pre-1.7 API; removed in the 1.7 rewrite. Most blog posts show these. | `signIn.social({provider})`, callback `/api/auth/callback/:providerId` |
| Awaiting the email send inside `sendResetPassword` (default, no `backgroundTasks` handler) | Creates an account-enumeration timing oracle (verified in source). | `advanced.backgroundTasks.handler` |
| Hand-parsing or regex-editing compose for label injection | Loses comments and mishandles list vs map `labels`. | The `yaml` Document API, as in `compose-proxy-editor.ts` |
| A Traefik or Caddy client library, or any NPM API client | Docktor has no visibility into the user's proxy by design (#44 out-of-scope). | Emit labels and snippets only |
| `proxy_set_header` in nginx-proxy `vhost.d/*_location` | Drops all inherited proxy headers for that location. | Timeout directives only |
| A second audit store (`pino` file transport as the system of record, an audit npm package) | Not queryable by role, permission, or the UI. | Postgres `AuditLog` plus the logger as a secondary sink |

## Stack Patterns by Variant

**If the instance has no SMTP configured:**
- Hide "Forgot password?", return a clear message on the two reset paths, and document the on-box recovery.
- Because the issue requires the flow to be unavailable with a clear message.

**If OIDC is configured but a user's email matches an existing local account:**
- Do not auto-link. Require sign-in with the existing method and an explicit `linkSocial`, or an admin-initiated link.
- Because of the pre-registration account-takeover class (GHSA-g38m).

**If the instance is an upgrade of a single-user install:**
- Startup reconciliation promotes the earliest user to `owner`; nothing else is required of the operator.
- Because #87 requires zero migration steps.

**If an operator runs Traefik with a different certresolver or entrypoint:**
- Those are instance settings with defaults `websecure` and a resolver name entered by the user. Docktor does not verify them.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `better-auth@1.7.12` | `@prisma/client@7`, `prisma@7` | Peer range `^5 \|\| ^6 \|\| ^7`. Adapter is bundled (`@better-auth/prisma-adapter`). |
| `better-auth@1.7.12` | `zod@^4.5.4` (its own dependency) | Repo declares `^4.3.6`; resolve to a single 4.x in the lockfile. |
| `better-auth@1.7.12` | Node 22 | Production image `node:22-slim`. The `auth` CLI needs 22.12 or newer (dev only). |
| `@better-auth/sso@1.7.12` | `better-auth@^1.7.12` (peer) | Listed only to document why it is not used. Older `sso@1.4.22` pins `better-auth` to exactly `1.4.22`. |
| `nginxproxy/nginx-proxy:1.11-alpine` | `vhost.d/<host>_location` includes | Verified in the current `nginx.tmpl`. Re-verify if the pin changes major or minor. |
| Traefik v3 (and v2) | Docker-provider labels above | Same label names; entrypoint and resolver names are user-defined. |

## Sources

- npm registry (`npm view`): `better-auth@1.7.12` (published 2026-10-20), `@better-auth/sso@1.7.12`, `nodemailer`, `yaml`; dist-tags and publish times for 1.4.18, 1.4.22, 1.5.0, 1.6.0, 1.7.0. HIGH.
- `better-auth@1.7.12`, `@better-auth/core@1.7.12`, and the installed `better-auth@1.4.18` package source and types: reset-password route, `runInBackgroundOrAwait`, rate-limiter wildcard matching, `disabledPaths` handling, admin `hasPermission`, access `authorize`, `accountLinking` and `encryptOAuthTokens` options, package export paths. HIGH.
- GitHub security advisories for `better-auth/better-auth` (`gh api repos/better-auth/better-auth/security-advisories`), fetched 2026-10-21. HIGH.
- GitHub releases v1.5.0, v1.6.0 and v1.7.0 for `better-auth/better-auth` (breaking-change notes). HIGH.
- https://better-auth.com/docs/guides/1-7-upgrade-guide.md (account issuer reversal in 1.7.3, generic OAuth rewrite, 2FA changes, Prisma notes). HIGH.
- https://www.better-auth.com/docs/plugins/admin, /plugins/generic-oauth, /plugins/sso, /authentication/email-password (plugin options and examples). MEDIUM to HIGH. The pages carry no version numbers, so each claim was checked against the 1.7.12 types where it mattered.
- https://raw.githubusercontent.com/nginx-proxy/nginx-proxy/main/nginx.tmpl (WebSocket headers, `vhost.d` include points). HIGH for what the template says; MEDIUM for the regeneration-versus-reload behaviour, which was not exercised.
- GitHub releases for `nginx-proxy/nginx-proxy` (1.11.6) and `nginx-proxy/acme-companion` (v2.8.2). HIGH.
- https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/ (Traefik v3 Docker labels). MEDIUM to HIGH.
- https://github.com/lucaslorentz/caddy-docker-proxy (label syntax and network requirements). MEDIUM.
- NPM "Websockets Support" API field name (`allow_websocket_upgrade`): found in a third-party client only; LOW. Not needed, because Docktor shows UI field instructions rather than calling the API.
- Docktor repo: `server/src/lib/auth.ts`, `auth-config.ts`, `auth-middleware.ts`, `routes/auth.ts`, `routes/events.ts`, `lib/proxy-stack-compose.ts`, `lib/compose-proxy-editor.ts`, `infrastructure/smtp-client.ts`, `infrastructure/event-bus.ts`, `prisma/schema/auth.prisma`, `proxy.prisma`. HIGH.
- Context7 was not available in this session, so library claims rest on the registry, package source and official docs above.

---
*Stack research for: Docktor v0.2.0 (migration hardening, proxy modes, auth and access)*
*Researched: 2026-10-21*
