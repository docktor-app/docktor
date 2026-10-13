# Phase 15: Access Hardening - Research

**Researched:** 2026-10-10
**Domain:** better-auth 1.4.18 hardening (TOTP 2FA plugin, built-in rate limiter, origin/CSRF checks, cookie flags) on a Fastify 5 + Prisma 7 + React 19 stack
**Confidence:** HIGH for better-auth behaviour (read from the installed 1.4.18 source this session); MEDIUM for deployment-topology claims (proxy/IP behaviour)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mandatory 2FA policy (#45)**
- **D-01:** When mandatory 2FA is on, a user without 2FA is **forced to enroll at login**: after a correct password they are routed to the enrollment screen and cannot reach the app until enrollment completes. No grace period.
- **D-02:** Any logged-in user may toggle the instance-wide mandatory-2FA setting (matches the current no-roles model; every user can edit all Settings). **Guard:** the setting can only be turned on once the toggling user has 2FA enabled themselves, to prevent self-lockout. No admin role is introduced. - **Reversibility:** reversible - a role model can be layered on later.
- **D-03:** The mandatory setting is stored via the existing settings mechanism (`SettingsRepository`/`SETTING_KEYS`) and surfaced on the Account/Security page (see D-08).

**Login flow (#45)**
- **D-04:** The TOTP step is a **second screen after the password** (better-auth `twoFactor` plugin's `twoFactorRedirect`): a code input with a "use a recovery code" alternative.
- **D-05:** The second step offers an **opt-in "trust this device for 30 days" checkbox** (better-auth's native trust-device support). Default unchecked; without it the code is always required. - **Reversibility:** reversible - a config flag plus one checkbox.

**Enrollment & recovery UX (#45)**
- **D-06:** Recovery codes use better-auth's default (10 single-use codes). They are **shown once**, with copy and download actions, and enrollment is not complete until the user confirms "I saved these".
- **D-07:** **Password re-entry is required to enable 2FA, disable 2FA, and regenerate recovery codes** (better-auth's twoFactor endpoints already take the password).
- **D-08:** 2FA management lives on a **new dedicated Account page** (new route + nav entry), not a Settings card. It holds only the Security section for now (enable/disable, regenerate codes, mandatory-2FA toggle). Password change, session list, etc. are not added here. The page follows the Phase 11 page-composition rules (thin orchestrator + section components under `routes/app/account/components/`, `UnsavedChangesGuard` not needed, react-hook-form + Zod for forms).
- **D-09:** **Lost-everything fallback is a documented CLI/DB reset** (an on-box command or documented procedure that disables 2FA for a given user). No email-based reset and no other-user override.
- **D-10:** Enabling/disabling 2FA or regenerating recovery codes **revokes the user's other sessions** (keep the current one). Session lifetime stays at better-auth defaults.

**Rate limiting (#46)**
- **D-11:** Use **better-auth's built-in rate limiter** with per-path rules - no `@fastify/rate-limit` layer in this phase. Counters are stored in the **database** (better-auth `rateLimit` storage/model) so a restart cannot reset limits. Requires a new Prisma model/migration in its own `.prisma` file per project convention. - **Reversibility:** costly - adds a DB table that other code won't depend on, but a migration is needed to remove it.
- **D-12:** Thresholds: **5 attempts / 15 minutes** for sign-in and for 2FA verification (per IP + account where the library supports it); other auth endpoints looser (order of 100/minute). Exact numbers are validated in research against better-auth's rule semantics. The UI surfaces a clear "try again in N minutes" message from the 429 `Retry-After`.
- **D-13:** Client IP resolution: honor `X-Forwarded-For` **only when an explicit trusted-proxy env setting is enabled (e.g. `TRUST_PROXY`), default off** - safe against header spoofing when exposed directly, documented for reverse-proxy users. Behind-proxy installs that don't set it share one socket IP; document this.

**CSRF & cookies (#46)**
- **D-14:** CSRF: **verify and lock with tests** - no new CSRF token layer. better-auth's trusted-origin check and SameSite cookies plus production CORS-off are the mechanism. Add integration tests proving cross-origin state-changing requests are rejected for both `/api/auth/*` and the Fastify routes (e.g. stacks), and fix any gap the tests reveal. Correct the stale "Fastify CSRF plugin enabled" claim in `docs/design.md`/`CONCERNS.md`.
- **D-15:** Session cookie flags: `httpOnly` and `SameSite=lax` asserted by tests; **`Secure` is derived from whether the effective base URL is https** (env `BETTER_AUTH_URL` / Base URL setting), not from `NODE_ENV`, so plain-http LAN installs keep working while https installs are always secure.

**Password reset (#46)**
- **D-16:** Password reset is **not built** in this phase. The audit covers what exists (rate limits apply to any reset endpoints better-auth could expose, which are disabled today). Reset is captured as a follow-up issue (see Deferred).

### Claude's Discretion
- Exact numeric rate-limit windows beyond the 5/15min login & 2FA-verify rule; response copy.
- Shape of the CLI/DB 2FA reset (script vs documented SQL) and where it is documented, provided it does not require email.
- Account page nav placement and label details; recovery-code download format (txt).
- Test layout (unit vs integration split) within the project's TDD rules; integration tests run on CI, not on the VPS.

### Deferred Ideas (OUT OF SCOPE)
- **Email-based password reset** - new capability (SMTP delivery, tokens, UI); capture as its own GitHub issue / future phase.
- **Admin/role model** - would allow restricting the mandatory-2FA toggle; not needed for single-admin instances.
- **Account page extras** - password change, active sessions list, session revoke UI.
- **Additional Fastify-level rate limiting** (`@fastify/rate-limit`) for non-auth routes.
- **Shorter session lifetime / idle expiry.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| #45 | TOTP 2FA: enable with recovery codes, optionally mandatory instance-wide | `twoFactor` plugin endpoints/flow (Standard Stack, Pattern 1), `requireAuth` enrollment gate (Pattern 3), session revocation hook (Pattern 4), lost-everything reset (Pattern 7) |
| #46 | Auth hardening audit: rate limiting on auth endpoints, CSRF verified, session cookie flags verified/closed | Rate-limiter semantics and the IP fail-open trap (Pattern 5, Pitfalls 1-3), origin check + Fastify gap (Pattern 6, Pitfalls 4/12), cookie `Secure` derivation (Pattern 8, Pitfall 5) |
</phase_requirements>

## Summary

The existing integration is a stock `betterAuth({...})` with `emailAndPassword` only, mounted via `toNodeHandler` on a hijacked Fastify route. Everything this phase needs exists in better-auth 1.4.18 (the version pinned in `yarn.lock`): the `twoFactor` plugin (TOTP + backup codes + trust-device), a rate limiter with DB storage and per-path custom rules, an origin/CSRF middleware, and cookie-attribute defaults. No new server dependency is needed. The only new package is a client-side QR renderer.

The research found five non-obvious traps, any one of which would make the phase "pass its tests but not be secure". **(1)** The rate limiter reads the client IP *only from request headers* (default `x-forwarded-for`), never the socket, and **silently skips limiting when no valid IP is found** (outside dev/test); it is also **disabled by default unless `NODE_ENV=production`**. Without a Fastify-side shim that stamps a trusted IP header, limits would be off for direct installs and spoofable via `X-Forwarded-For`. **(2)** The 429 retry header is `X-Retry-After`, not `Retry-After`. **(3)** better-auth **disables its origin/CSRF check when `NODE_ENV=test`** unless `advanced.disableOriginCheck: false` is set explicitly, so D-14's CSRF integration tests would pass vacuously on CI. **(4)** The Fastify routes have **no CSRF defence beyond SameSite=Lax and CORS-off**, which does not cover same-site cross-origin callers (a sibling port/subdomain, which is exactly where a managed stack's web app lives); a small `Origin`-check hook for unsafe methods closes it. **(5)** The plugin's `enable` endpoint does not flip `twoFactorEnabled` until the first successful TOTP verification, and neither it nor `disable`/`generate-backup-codes` revokes other sessions, so D-10 and D-01 require explicit hooks and a gate in `requireAuth`.

**Primary recommendation:** Stay on better-auth 1.4.18; add `twoFactor({issuer, trustDeviceMaxAge})` + `rateLimit: {enabled, storage: "database", customRules}` + `advanced: {ipAddress.ipAddressHeaders: [<private header>], useSecureCookies, disableOriginCheck: false}`; stamp the private IP header from Fastify's `request.ip` (with `trustProxy` driven by `TRUST_PROXY`) inside `routes/auth.ts`; add an `after` hook for session revocation; add an `Origin` guard hook to Fastify for unsafe methods; gate `requireAuth` on a pure `domain/two-factor-policy`; build the Account page as a thin orchestrator with section components.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TOTP secret/backup-code generation, verification, trust-device | API / Backend (better-auth `twoFactor` plugin) | Database (twoFactor table, `Verification` rows for trust/pending) | Secrets are encrypted server-side with `BETTER_AUTH_SECRET`; client never sees secret except the one-time `totpURI` |
| QR rendering of `totpURI` | Browser / Client | - | Must render locally; the URI contains the secret (never send it to a third-party QR service) |
| Login second step (TOTP / recovery code / trust-device checkbox) | Browser / Client | API (`/api/auth/two-factor/*`) | UI state machine; server owns verification |
| Mandatory-2FA setting storage and toggle guard | API / Backend (application service) | Database (`Setting` row) | Guard ("only if toggler has 2FA") is business logic, must be server-enforced |
| Enrollment gate ("owes enrollment") | API / Backend (`requireAuth`, pure domain predicate) | Browser (redirect UX in `ProtectedRoute`) | Server is authoritative (client redirect is UX only) |
| Session revocation on 2FA changes | API / Backend (better-auth `after` hook) | Database (`Session`) | Must not be bypassable by calling the endpoint directly |
| Rate limiting | API / Backend (better-auth limiter) | Database (`RateLimit` table) | D-11: DB-backed counters survive restarts |
| Client-IP resolution / `TRUST_PROXY` | API / Backend (Fastify `trustProxy` + auth route shim) | Deployment (reverse proxy) | Header trust is a boundary decision; must be one place |
| CSRF defence | API / Backend (better-auth origin check for `/api/auth/*`; new Fastify `Origin` guard for the rest) | Browser (SameSite=Lax cookie) | Defence in depth: cookie attribute + server origin validation |
| Cookie flags (`httpOnly`, `SameSite`, `Secure`) | API / Backend (better-auth `advanced`) | - | Set once at auth init |
| 2FA lost-everything reset | API / Backend (on-box script using a repository) | Database | D-09: no email; operator with shell access only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | 1.4.18 (locked in `yarn.lock`; installed) | `twoFactor` plugin, rate limiter, origin check, cookies | Already the project's auth; everything needed ships in it [VERIFIED: yarn.lock `"better-auth@npm:^1.4.18"` resolves `version: 1.4.18`; source read at `node_modules/better-auth/dist`] |
| fastify | 5.7.4 (installed; `^5.2.1`) | `trustProxy`, `request.ip`, `onRequest` hooks | Already the HTTP layer [VERIFIED: node_modules/fastify/package.json] |
| Prisma | 7 (existing) | New `TwoFactor` + `RateLimit` models, `User.twoFactorEnabled` | Existing ORM; project rule: new models in their own `.prisma` file |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| qrcode.react | ^4.2.0 (client only; peer `react ^16.8 .. ^19`) | `QRCodeSVG` for the enrollment QR | Enrollment dialog [ASSUMED: package name from training knowledge; seam verdict OK, 9.7M weekly downloads, source repo github.com/zpao/qrcode.react, no postinstall; `npm view qrcode.react peerDependencies` shows `react: '^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0'`] |
| @testing-library/react, vitest, Playwright | existing | Client/server tests | Already in repo |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-auth built-in limiter (D-11, locked) | `@fastify/rate-limit` | Deferred by user; also would not see better-auth's per-path semantics |
| `qrcode.react` | `qrcode` (node-qrcode `toDataURL`) | Needs an async effect + `<img>`; `qrcode.react` is declarative. Do **not** use third-party QR web services (secret leak) [CITED: better-auth.com/docs/plugins/2fa - "render QR codes locally, not via third-party services"] |
| Hand-written TOTP in tests | `@better-auth/utils/otp` (transitive) | Test helper may use ~15 lines of `node:crypto` HMAC-SHA1 (RFC 6238, 30 s, 6 digits) to avoid depending on a transitive package |

**Installation:**
```bash
yarn workspace @docktor/client add qrcode.react@^4.2.0
```
No server dependency changes.

**Version verification:** `npm view qrcode.react version` returned `4.2.0` (modified 2024-12-11). `npm view better-auth version` returns 1.7.7 (latest), but the project is locked to 1.4.18; **do not upgrade in this phase** (see State of the Art). `npm view qrcode.react scripts.postinstall` returned nothing.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| qrcode.react | npm | multi-year (latest 4.2.0, 2024-12-11) | ~9.7M/wk | github.com/zpao/qrcode.react | [OK] (gsd-tools `package-legitimacy check`) | Approved by seam; name originates from training knowledge so tagged `[ASSUMED]` - planner should gate the `yarn add` behind a `checkpoint:human-verify` |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none (`qrcode` was also checked and returned OK but is not recommended)

*No other new packages are introduced. better-auth is already installed and pinned.*

## Architecture Patterns

### System Architecture Diagram

```
Browser
  |  POST /api/auth/sign-in/email  ------------------------------+
  |  POST /api/auth/two-factor/*                                  |
  |  /api/** (stacks, settings, account, SSE)                     |
  v                                                               v
Fastify (trustProxy = parseTrustProxy(TRUST_PROXY))               |
  |                                                               |
  |-- onRequest: first-run redirect (existing)                    |
  |-- onRequest: originGuard (NEW) for POST/PUT/PATCH/DELETE      |
  |       Origin present & not in resolveTrustedOrigins()  -> 403 |
  |                                                               |
  |-- /api/auth/*  (routes/auth.ts, hijacked)  <------------------+
  |       1. overwrite request.raw.headers[CLIENT_IP_HEADER] = request.ip
  |       2. toNodeHandler(auth)
  |            better-auth router:
  |              onRequest: disabledPaths -> onRequestRateLimit (key = ip + path, DB storage)
  |                           429 + X-Retry-After
  |              before hooks: sign-up block (existing), [2FA-disable-while-mandatory guard]
  |              originCheckMiddleware (cookie present => Origin must be trusted)
  |              endpoint (twoFactor plugin: enable/verify-totp/verify-backup-code/disable/...)
  |              after hooks: twoFactor sign-in challenge (twoFactorRedirect),
  |                           revokeOtherSessions on 2FA changes (NEW)
  |
  |-- /api/account/*  (NEW routes) -> requireSession only -> AccountSecurityService
  |-- /api/** (all other)           -> requireAuth = requireSession + enrollment gate
  |       gate: isEnrollmentRequired({mandatory (Setting), user.twoFactorEnabled}) -> 403
  v
Postgres: User(twoFactorEnabled), TwoFactor, RateLimit, Session, Verification, Setting
```

### Recommended Project Structure
```
server/
├── prisma/schema/
│   ├── auth.prisma             # + User.twoFactorEnabled, User.twoFactor relation
│   ├── two-factor.prisma       # NEW model TwoFactor
│   └── rate-limit.prisma       # NEW model RateLimit
├── src/domain/two-factor-policy.ts          # pure: isEnrollmentRequired(), canEnableMandatory()
├── src/lib/auth.ts                          # + twoFactor plugin, rateLimit, advanced, hooks
├── src/lib/auth-config.ts                   # pure helpers: parseTrustProxy, resolveUseSecureCookies, buildRateLimitRules
├── src/lib/auth-middleware.ts               # requireSession + requireAuth (gate)
├── src/lib/origin-guard.ts                  # pure origin decision + Fastify hook factory
├── src/repositories/account-security-repository.ts   # TwoFactor/User/Session/Verification access for reset + status
├── src/application/account-security-service.ts       # status, mandatory toggle (guarded), reset
├── src/routes/account.ts                    # GET /api/account/security, PUT /api/account/security/mandatory-2fa
└── src/scripts/reset-two-factor.ts          # D-09 CLI (built to dist/server/scripts/)
shared/src/validation/account.ts             # Zod: mandatory toggle body, enable/disable/regenerate password form, TOTP code form
client/src/
├── lib/auth-client.ts                       # + twoFactorClient
├── lib/account-api.ts                       # apiFetch wrappers for /api/account/*
├── hooks/use-account-security.ts
├── routes/app/account.tsx                   # thin orchestrator (<= ~80 lines)
├── routes/app/account/components/           # two-factor-section, enroll-dialog, recovery-codes-dialog, mandatory-2fa-toggle, ...
└── routes/auth/components/login-form.tsx    # + two-factor-step.tsx (second step)
```

### Pattern 1: Server plugin configuration
**What:** Add `twoFactor` to the existing `betterAuth` config; keep TOTP only (OTP/email endpoints throw "otp isn't configured" because no `sendOTP`).
**Verified facts (source read this session):**
- Trust-device default is 30 days: `const TRUST_DEVICE_COOKIE_MAX_AGE = 720 * 60 * 60;` (`plugins/two-factor/constant.mjs`) = 720 h. Pending-2FA cookie default 600 s (`options?.twoFactorCookieMaxAge ?? 600`).
- Backup codes: default `options?.amount ?? 10` codes of `options?.length ?? 10` chars, formatted `` `${code.slice(0, 5)}-${code.slice(5)}` `` (e.g. `ab12C-d34Ef`); stored encrypted (`storeBackupCodes: "encrypted"`).
- `POST /two-factor/enable` body `{password, issuer?}` returns `{totpURI, backupCodes}` and **does not** set `twoFactorEnabled` (only `skipVerificationOnEnable` does). The first successful `POST /two-factor/verify-totp` flips it: `if (!user.twoFactorEnabled) { ... updateUser(user.id, { twoFactorEnabled: true }) ... }`.
- `POST /two-factor/disable` body `{password}`; `POST /two-factor/generate-backup-codes` body `{password}` (requires `user.twoFactorEnabled`); `POST /two-factor/get-totp-uri` body `{password}`; `POST /two-factor/verify-totp` body `{code, trustDevice?}`; `POST /two-factor/verify-backup-code` body `{code, disableSession?, trustDevice?}`.
- Sign-in with 2FA: the plugin's `after` hook on `/sign-in/email` deletes the just-created session and returns `ctx.json({ twoFactorRedirect: true })` unless a valid trust-device cookie exists.
- TOTP secret and backup codes are encrypted with `ctx.context.secret` (= `BETTER_AUTH_SECRET`): **rotating that secret invalidates every enrolled TOTP secret and recovery code** (document; the reset script is the remedy).
**Example:**
```typescript
// Source: better-auth 1.4.18 dist/plugins/two-factor/index.mjs (read in this session)
import {twoFactor} from "better-auth/plugins";

plugins: [
    twoFactor({
        issuer: "Docktor",
        trustDeviceMaxAge: 30 * 24 * 60 * 60, // D-05: explicit even though it equals the default
    }),
],
disabledPaths: ["/two-factor/send-otp", "/two-factor/verify-otp"], // OTP not configured; shrink surface
```
Client: `import {twoFactorClient} from "better-auth/client/plugins"` and `createAuthClient({baseURL: "", plugins: [twoFactorClient()]})`; use `authClient.twoFactor.enable/disable/verifyTotp/verifyBackupCode/generateBackupCodes`. `signIn.email` resolves with `data.twoFactorRedirect === true` when a second step is required [VERIFIED: index.mjs `return ctx.json({ twoFactorRedirect: true })`; client.mjs `context.data?.twoFactorRedirect`].

### Pattern 2: Prisma models (hand-authored, mirror better-auth's schema)
**Verified field contract** (`plugins/two-factor/schema.mjs`, `@better-auth/core/dist/db/get-tables.mjs`):
- `user.twoFactorEnabled`: boolean, `required: false`, `defaultValue: false`, `input: false`.
- `twoFactor`: `secret` (string), `backupCodes` (string), `userId` (string, references `user.id`).
- `rateLimit`: `key` (string, **unique**), `count` (number), `lastRequest` (number, **`bigint: true`**).
Better-auth adds an `id` string primary key to every model. Recommended Prisma:
```prisma
// two-factor.prisma
model TwoFactor {
  id          String @id
  secret      String
  backupCodes String
  userId      String
  user        User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

// rate-limit.prisma
model RateLimit {
  id          String @id
  key         String @unique
  count       Int
  lastRequest BigInt
}
```
and in `auth.prisma` `User`: `twoFactorEnabled Boolean? @default(false)` and `twoFactor TwoFactor[]` [ASSUMED: nullable-with-default matches the CLI-generated shape; a plain `Boolean @default(false)` should also work]. Generate the migration with `prisma migrate dev --create-only` against the dev compose Postgres (small; not a heavy build), never hand-edit the SQL. Production startup applies migrations via `migrate deploy` (`schema-sync.ts`), tests via `db push` (`test/integration/setup.ts`), so both paths pick the new models up automatically. `cleanDatabase()` in `test/integration/setup.ts` must also `rateLimit.deleteMany()` (twoFactor cascades with user).

### Pattern 3: Enrollment gate in `requireAuth` (D-01)
**What:** Split `lib/auth-middleware.ts` into `requireSession` (authN only; used by `/api/account/*`) and `requireAuth` (= `requireSession` + enrollment check; used everywhere else, so no route file needs changing). The check is the pure domain predicate `isEnrollmentRequired({mandatory, twoFactorEnabled})`; the mandatory flag is read from the `Setting` row. `lib/auth.ts` already establishes the precedent of a local `SettingsRepository` instance inside `lib/` (see its comment about circular imports), so `auth-middleware.ts` may do the same without importing `application/`.
- Rejection: add `ForbiddenError` (403) to `lib/errors.ts` (CLAUDE.md: status codes live only in `lib/errors.ts` + `app.ts`; the current `reply.status(401)` in `requireAuth` is an existing violation worth fixing in passing) with a machine-readable code so the client can redirect, e.g. body `{error: "Two-factor enrollment required", code: "TWO_FACTOR_ENROLLMENT_REQUIRED"}`. The global handler currently emits only `{error}` - extend `AppError` handling to forward an optional `code`.
- `request.user` is typed `User` from better-auth, which has no `twoFactorEnabled`; use `typeof auth.$Infer.Session.user` in the Fastify module augmentation rather than a cast.
- Client: `ProtectedRoute` additionally consults `useAccountSecurity()`; if `enrollmentRequired`, `<Navigate to="/account" />` (and the account page auto-opens the enroll dialog). Server enforcement remains authoritative.
- Wizard safety: step 1 creates the first user via `auth.api.signUpEmail` (no 2FA); the mandatory toggle's own guard (toggler must have `twoFactorEnabled`) means it cannot be on during setup. `routes/setup.ts` uses its own auth, not `requireAuth` for step1, so it is unaffected.

### Pattern 4: Session revocation on 2FA changes (D-10)
**What:** A global `hooks.after` (same `createAuthMiddleware` API already used for `hooks.before` in `auth.ts`) that, for `ctx.path` in `/two-factor/disable`, `/two-factor/generate-backup-codes`, and `/two-factor/verify-totp` *when it transitioned the user to enabled*, lists the user's sessions and deletes all but the current one. Verified building blocks: `ctx.context.internalAdapter.listSessions(userId)` and `deleteSession(token)` (this is exactly how the built-in `revokeOtherSessions` endpoint is implemented), `ctx.context.returned` is set to the endpoint response (or the `APIError`) before after-hooks run, and `enable`/`disable`/`verify-totp` call `setSessionCookie`, which sets `ctx.context.newSession`.
- Only revoke when the endpoint succeeded (`!(ctx.context.returned instanceof APIError)`).
- "Current" session = `ctx.context.newSession?.session.token` when the plugin re-issued it (verify-totp-enable, disable), else the session resolved from request cookies (generate-backup-codes). **Spike this in the first plan with an integration test** - the exact `ctx.context.session` availability inside a global after-hook was not exercised this session [ASSUMED]. Fallback if awkward: resolve via `getSessionFromCtx(ctx)` exported from `better-auth/api`.
- Note the plugin's own sign-in hook sets `ctx.context.newSession` to `null` for the 2FA-challenge case: any hook code must null-check [CITED: better-auth.com/docs/plugins/2fa].

### Pattern 5: Rate limiting (D-11, D-12, D-13)
**Verified semantics** (`dist/api/rate-limiter/index.mjs`, `context/create-context.mjs`, `utils/get-request-ip.mjs`):
```javascript
// create-context.mjs:145-148
enabled: options.rateLimit?.enabled ?? isProduction,
window: options.rateLimit?.window || 10,
max: options.rateLimit?.max || 100,
storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
```
- **Key = `createRateLimitKey(ip, path)`** - per IP **and path**; there is no per-account dimension. D-12's "per IP + account where the library supports it" resolves to **IP + path only**; per-account lockout is not supported by 1.4.18 (acceptance of residual distributed brute-force against one account is an Open Question; TOTP + password make this low risk).
- Rule precedence (later overrides earlier): global `window/max` -> built-in special rule (`/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` = 10 s / 3) -> first matching plugin rule (`twoFactor`: `path.startsWith("/two-factor/")` = **10 s / 3**) -> `customRules` (exact path or `*` wildcard). So `customRules` must restate the 2FA paths or the plugin's 3-per-10-s rule stays in force.
- Algorithm: `shouldRateLimit = now - lastRequest < window*1000 && count >= max`; each *allowed* request does `count + 1, lastRequest: now`; a blocked request returns before writing. Consequence: 5 allowed attempts, then blocked until **15 min after the 5th attempt**, counting successful sign-ins too. Count resets once `timeSinceLastRequest > window`.
- 429 response: status 429, body `{"message":"Too many requests. Please try again later."}`, header **`X-Retry-After`** (seconds). `rateLimitResponse` source: `headers: { "X-Retry-After": retryAfter.toString() }`.
- DB storage `get`/`set` is read-then-write (not atomic): a parallel burst can exceed `max` by a few requests. Acceptable for this threat model; do not claim exactness.
- Rows are never pruned (bounded by distinct ip x path pairs). Optional: prune stale rows in an existing job; not required.
**Recommended config:**
```typescript
rateLimit: {
    enabled: isAuthRateLimitEnabled(),   // true unless NODE_ENV==="test" and not opted in (see Pitfall 13)
    storage: "database",                 // D-11
    window: 60, max: 100,                // "other auth endpoints ~100/minute"
    customRules: {
        "/sign-in/email":                 {window: 15 * 60, max: 5},
        "/two-factor/verify-totp":        {window: 15 * 60, max: 5},
        "/two-factor/verify-backup-code": {window: 15 * 60, max: 5},
        // password-bearing endpoints reachable with a stolen session:
        "/two-factor/enable":               {window: 15 * 60, max: 5},
        "/two-factor/disable":              {window: 15 * 60, max: 5},
        "/two-factor/generate-backup-codes": {window: 15 * 60, max: 5},
        "/two-factor/get-totp-uri":         {window: 15 * 60, max: 5},
    },
},
```
Use exact paths, not `"/two-factor/*"` (wildcard semantics were only partly read). Paths are relative to `basePath` (`normalizePathname(req.url, basePath)`), i.e. `/sign-in/email`, not `/api/auth/sign-in/email`. `verify-totp` and `verify-backup-code` have separate counters (5 + 5 per IP per 15 min) - acceptable.
**Client-IP shim (critical):**
```typescript
// getIp(): reads only ipAddressHeaders (default ["x-forwarded-for"]); returns null when none valid
// (and only falls back to 127.0.0.1 in test/dev). onRequestRateLimit: `if (!ip) return;` -> NO LIMITING.
advanced: {ipAddress: {ipAddressHeaders: ["x-docktor-client-ip"]}},
// routes/auth.ts, before toNodeHandler:
request.raw.headers["x-docktor-client-ip"] = request.ip;   // always overwrite; never trust the inbound value
```
and `Fastify({trustProxy: parseTrustProxy(process.env.TRUST_PROXY)})`. With `trustProxy` off (default) `request.ip` is the socket address, so a spoofed `X-Forwarded-For` has no effect and direct installs are rate limited; with it on, Fastify's proxy-addr logic derives the client from `X-Forwarded-For`. `parseTrustProxy` (pure, in `lib/auth-config.ts`, unit-tested) should accept `"true"` -> `true`, a positive integer -> hop count, anything else -> comma-separated IP/CIDR list [CITED: Fastify Reference/Server.md `trustProxy`: "`number`: Trust the nth hop from the front-facing proxy server as the client", string/array = trusted IP/CIDR]. **Recommend documenting the hop-count form (e.g. `TRUST_PROXY=1`) as the safe default for a single reverse proxy**: `trustProxy: true` trusts every hop, and a proxy that *appends* to a client-supplied `X-Forwarded-For` (e.g. nginx `$proxy_add_x_forwarded_for`) lets the client choose the leftmost value [ASSUMED: nginx append behaviour from training knowledge].
- 429 UX: the client reads `X-Retry-After` from the failed response (better-fetch `onError` context `response.headers`) and formats "Try again in N minutes". CONTEXT D-12 calls it `Retry-After`; the actual header on 1.4.18 is `X-Retry-After`.
- Behind an unconfigured reverse proxy every user shares one bucket (proxy's socket IP): one attacker can lock everyone out of sign-in for 15 min. D-13 accepts this; document it prominently next to `TRUST_PROXY` in `docs/deployment.md` and `.env.example`.

### Pattern 6: CSRF (D-14)
**`/api/auth/*`:** better-auth's `originCheckMiddleware` runs for every non-GET request; when the request carries a `cookie` header it requires `Origin`/`Referer` to match `trustedOrigins` (our function, already live), else 403 (`MISSING_OR_NULL_ORIGIN` / `"Invalid origin"`). Sign-in additionally has the Fetch-Metadata `formCsrfMiddleware`. Verified code:
```javascript
// create-context.mjs:180-181
skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
skipOriginCheck: options.advanced?.disableOriginCheck !== void 0 ? options.advanced.disableOriginCheck : isTest() ? true : false,
// isTest = () => nodeENV === "test" || toBoolean(env.TEST)
```
So **under `NODE_ENV=test` (CI sets it, and `test/integration/setup.ts` sets it) the origin check is OFF by default.** Set `advanced.disableOriginCheck: false` explicitly in `auth.ts` so the CSRF integration tests are meaningful. Consequence to check: existing integration tests that call `/api/auth/*` *with* a `cookie` header but no `Origin` would start failing; a grep of `server/test` found only `sign-up/email` calls (no cookie), so impact is expected to be nil (re-verify when implementing).
**Fastify routes (gap):** there is no CSRF layer. Protection today = `SameSite=Lax` (better-auth default, below) + CORS `origin: false` in production. Lax blocks cross-**site** POSTs but **not same-site cross-origin** requests (different port or sibling subdomain of the same host). A managed stack's web UI on `host:8080` can issue a credentialed body-less `fetch("http://host:3000/api/stacks/x/deploy", {method:"POST", credentials:"include", mode:"no-cors"})` - a CORS "simple request" with no preflight. Fastify also ships a default `text/plain` body parser (`content-type-parser.js`), so simple text/plain POSTs are parsed. [ASSUMED: that this specific request succeeds end-to-end was reasoned from the browser/Fastify behaviour, not executed; the integration test below proves or disproves it.]
**Recommended fix (small, consistent with "no new token layer"):** an `onRequest` hook `originGuard` for `POST|PUT|PATCH|DELETE` on `/api/**` excluding `/api/auth/` (better-auth owns it) and `/api/setup/` pre-setup if needed:
1. `Origin` header present -> must be in `await resolveTrustedOrigins()` (reuse; same source as auth) or equal the request's own origin; else throw `ForbiddenError`.
2. No `Origin` but `Sec-Fetch-Site` present and not `same-origin`/`none` -> reject.
3. Neither header -> allow (non-browser clients; no ambient credentials; existing `app.inject` tests send no `Origin`).
Decision logic is a pure function (`decideOrigin({method, origin, secFetchSite, trusted, selfOrigin})`) unit-tested exhaustively; the hook is a thin wrapper. D-14 explicitly says "fix any gap the tests reveal", so write the failing integration test first (cross-origin POST with valid cookie + hostile `Origin` to `/api/stacks/...` and `/api/auth/two-factor/disable` -> 403).
**Docs:** correct `docs/design.md:780` (`| CSRF | Fastify CSRF plugin enabled by default. |`) and `.planning/codebase/CONCERNS.md` lines ~71-81 to describe the real mechanism.

### Pattern 7: Lost-everything reset (D-09)
Recommended: a script `server/src/scripts/reset-two-factor.ts` -> built to `dist/server/scripts/reset-two-factor.js` (the Dockerfile copies `server/dist` to `./dist/server` and runs `CMD ["node", "dist/server/index.js"]`), invoked as `docker compose exec docktor node dist/server/scripts/reset-two-factor.js <email>`. It calls `AccountSecurityService.resetTwoFactor(email)` which, in one `prisma.$transaction` inside a repository: deletes the user's `TwoFactor` row, sets `User.twoFactorEnabled=false`, deletes all the user's `Session` rows, and deletes the user's trust-device `Verification` rows (identifier `trust-device-*`, `value = userId`) and pending `2fa-*` rows. Documented SQL fallback in `docs/deployment.md`. Also document that rotating `BETTER_AUTH_SECRET` makes every enrolled TOTP/backup code undecryptable (use the same reset).
(CLAUDE.md: repositories are the only Prisma users; scripts call a service/repository, not Prisma directly. Check the layering architecture test does not treat `scripts/` as an unexpected layer.)

### Pattern 8: Cookie flags (D-15)
**Verified** (`cookies/index.mjs` `createCookieGetter`): attributes are `secure: !!secureCookiePrefix, sameSite: "lax", path: "/", httpOnly: true`, and
```javascript
const secureCookiePrefix = (options.advanced?.useSecureCookies !== void 0 ? options.advanced?.useSecureCookies : options.baseURL ? options.baseURL.startsWith("https://") ? true : false : isProduction) ? SECURE_COOKIE_PREFIX : "";
```
So with `baseURL` set from `BETTER_AUTH_URL`, `Secure` already follows the URL scheme (D-15 is satisfied for that case). **The trap:** when `BETTER_AUTH_URL` is unset in production, `Secure` falls back to `isProduction` -> `true`, and a plain-http LAN install silently loses its session cookie. Fix: `advanced.useSecureCookies: resolveUseSecureCookies(process.env.BETTER_AUTH_URL)` where the pure function returns `url?.startsWith("https://") ?? false`, so the decision never depends on `NODE_ENV`.
- **Limitation:** `createCookieGetter(options)` is evaluated once at auth init with a static `options`, so the DB-backed "Base URL" setting (dynamic, used only for `trustedOrigins` today) cannot drive `Secure` per request. `docs/deployment.md` already marks `BETTER_AUTH_URL` as "**Required** for real use", so env-derived is consistent; flag the DB-only-https corner in Open Questions.
- When `Secure` is on, the cookie names get the `__Secure-` prefix (`__Secure-better-auth.session_token`); tests that look for `better-auth.session_token=` (as `createTestUser` does) are correct only for non-https test config. Switching the base URL scheme invalidates existing sessions (name change) - note in docs.
- Keep `session.cookieCache` **disabled** (default). GHSA-xg6x-h9c9-2m83 (2FA bypass via premature session caching) is fixed in >= 1.4.9 and only applies with cookieCache on [CITED: github.com/advisories/GHSA-xg6x-h9c9-2m83]; add a config-assertion test so nobody enables it later.
- Also keep CVE-2026-45364 (IPv6 rotation bypass of the limiter, fixed in 1.4.17) covered: 1.4.18 normalizes IPv6 via `normalizeIP(ip, {ipv6Subnet})` [CITED: search result for CVE-2026-45364; VERIFIED in `get-request-ip.mjs`: `normalizeIP(ip, { ipv6Subnet: options.advanced?.ipAddress?.ipv6Subnet })`].

### Anti-Patterns to Avoid
- **Trusting `x-forwarded-for` directly in better-auth** (its default `ipAddressHeaders`): spoofable and, with no header, rate limiting is skipped. Always overwrite a private header from `request.ip`.
- **Putting enrollment-gate logic in route handlers** or duplicating it per route: single gate in `requireAuth`.
- **Letting `/api/account/*` use the gated `requireAuth`**: the user who owes enrollment could never reach the enroll endpoints (deadlock). Account routes use `requireSession`.
- **Showing "Enable 2FA" for an already-enabled user**: calling `enable` again replaces the stored secret and backup codes while `twoFactorEnabled` stays true -> the user's authenticator stops matching. UI must only offer enable when `twoFactorEnabled === false`; server wrapper may also reject.
- **Reading `useSession().user.twoFactorEnabled` on the client**: `twoFactorClient` declares `$InferServerPlugin: {}`, so the client session type may not carry the field. Use the `/api/account/security` status endpoint as the client's source of truth.
- **Third-party QR services** and logging `totpURI`/`backupCodes`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP generation/verification, secret storage, backup codes, trust-device cookie | Custom OTP code or crypto | better-auth `twoFactor` plugin | Encrypted-at-rest, single-use backup codes (atomic compare-and-swap update), signed trust cookie with server-side revocable record |
| Rate-limit counters | `Map` / custom middleware / `@fastify/rate-limit` | better-auth `rateLimit` with `storage: "database"` | D-11; keeps per-path semantics and 429 shape in one place |
| Origin/CSRF for `/api/auth/*` | Own CSRF tokens | better-auth `originCheckMiddleware` (just don't disable it) | D-14: no token layer |
| Proxy-aware client IP | Parsing `X-Forwarded-For` manually | Fastify `trustProxy` + `request.ip` | proxy-addr handles hop counts, CIDR lists, IPv6 |
| QR code encoding | Own QR encoder | `qrcode.react` `QRCodeSVG` | Error-correction/mask logic is deceptively hard |
| Session revocation | Raw SQL on `Session` | `ctx.context.internalAdapter.listSessions/deleteSession` in a hook | Same primitives as built-in `revokeOtherSessions` |

**Key insight:** every security primitive already exists in better-auth; the work is configuration, the **trust boundary shim** (IP header, origin on Fastify routes), policy enforcement (`requireAuth` gate), and tests that run with the protections actually *on* (they default off under `NODE_ENV=test` and outside production).

## Common Pitfalls

### Pitfall 1: Rate limiting is silently off
**What goes wrong:** Limits appear configured but never trigger (dev, test, or production behind no `X-Forwarded-For`).
**Why:** `enabled` defaults to `isProduction`; `getIp` returns `null` with no valid header outside dev/test and `onRequestRateLimit` does `if (!ip) return;`.
**How to avoid:** Set `rateLimit.enabled` explicitly; stamp the private IP header from `request.ip` on every `/api/auth/*` request; assert in an integration test that the 6th sign-in within the window returns 429 **with no inbound `X-Forwarded-For`**.
**Warning signs:** `Session.ipAddress` stays null; no `RateLimit` rows appear after sign-in attempts.

### Pitfall 2: Spoofable client IP
**What goes wrong:** Attacker rotates `X-Forwarded-For` to get a fresh bucket per request.
**How to avoid:** Header shim overwrites; `trustProxy` default off; test: 6 sign-ins each with a different inbound `X-Forwarded-For` still hit 429 when `TRUST_PROXY` is unset.

### Pitfall 3: Wrong retry header
**What goes wrong:** UI waits on `Retry-After` that never arrives.
**How to avoid:** Read `X-Retry-After`; fall back to a generic "try again later" if absent. [VERIFIED: `dist/api/rate-limiter/index.mjs:16` `headers: { "X-Retry-After": retryAfter.toString() }`]

### Pitfall 4: CSRF tests that pass vacuously
**What goes wrong:** `skipOriginCheck` is true when `NODE_ENV=test`, so a hostile-`Origin` request to `/api/auth/*` succeeds in CI.
**How to avoid:** `advanced.disableOriginCheck: false` in config; the test must include a cookie header (the check only fires when `headers.has("cookie")`), a hostile `Origin`, and assert 403.

### Pitfall 5: `Secure` cookie breaks plain-http installs
**What goes wrong:** `NODE_ENV=production` + no `BETTER_AUTH_URL` -> Secure cookie over http -> login loops.
**How to avoid:** `useSecureCookies` from the URL scheme only; unit-test `resolveUseSecureCookies(undefined) === false`, `("http://...") === false`, `("https://...") === true`.

### Pitfall 6: Enrollment half-done state
**What goes wrong:** `enable` creates the `TwoFactor` row but `twoFactorEnabled` stays false until `verify-totp`; a user who closes the dialog has a dangling row (harmless, overwritten by the next `enable`).
**How to avoid:** Treat "enrolled" strictly as `twoFactorEnabled === true`; the UI flow is password -> QR + secret + recovery codes -> confirm "I saved these" -> enter first code -> done. Do not call enrollment complete before `verify-totp` succeeds.

### Pitfall 7: Other sessions survive 2FA changes
**What goes wrong:** `enable`/`disable` re-issue only the *current* session (`createSession(..., override)` + `deleteSession(old)`); `generate-backup-codes` touches no session.
**How to avoid:** The Pattern 4 after-hook; integration test with two sessions for one user.

### Pitfall 8: Plugin's built-in 2FA limit (3 per 10 s) overrides intent
**What goes wrong:** Legit users who mistype twice get throttled by a 10-second window while an attacker's 5/15min budget is not what's actually enforced.
**How to avoid:** `customRules` take precedence over plugin rules (verified order); list each `/two-factor/*` path exactly.

### Pitfall 9: TOTP replay inside the tolerance window
**What goes wrong:** `verify(otp, {window: 1})` accepts the previous/current/next 30 s code and there is no used-code tracking, so a shoulder-surfed code is replayable for up to ~90 s. [VERIFIED: `@better-auth/utils/dist/otp.mjs` `verifyTOTP ... window = 1`; no replay store in `totp/index.mjs`]
**How to avoid:** Accept and document (low risk given password + rate limit); do not claim replay protection.

### Pitfall 10: Trust-device records outlive disabling
**What goes wrong:** `disable` clears the trust cookie *of the calling browser* and its Verification row, but other devices' `trust-device-*` Verification rows remain until expiry (they are inert once `twoFactorEnabled` is false, but re-enabling later would honor them).
**How to avoid:** Reset script and (optionally) the after-hook delete all `trust-device-*` rows for the user when 2FA is disabled/regenerated. Re-enable also revokes other sessions (D-10).

### Pitfall 11: Gate deadlock / SSE
**What goes wrong:** Gate applied to account endpoints (cannot enroll) or to SSE endpoints returning 403 JSON that `EventSource` cannot handle gracefully.
**How to avoid:** `requireSession` for `/api/account/*`; client redirect on `TWO_FACTOR_ENROLLMENT_REQUIRED` happens at route level before SSE hooks mount (`ProtectedRoute` renders the account page only).

### Pitfall 12: Same-site cross-origin requests on Fastify routes
See Pattern 6. SameSite=Lax is not an origin check.

### Pitfall 13: Test isolation with rate limiting on
**What goes wrong:** If `enabled: true` always, every integration test suite that signs up/in more than 3-5 times per window trips 429 (sign-up has a default 3/10 s rule; counters live in the DB and in a shared IP bucket `127.0.0.1`).
**How to avoid:** `isAuthRateLimitEnabled()` returns false under `NODE_ENV=test` unless an opt-in env var (e.g. `DOCKTOR_AUTH_RATE_LIMIT=on`) is set; dedicated rate-limit test files set the env **before** importing the app (the limiter config is read at module load; vitest isolates modules per test file) and clean `rateLimit` rows in `beforeEach`. Use a distinct stamped IP per test when `trustProxy` is enabled in the test app.

### Pitfall 14: Shared bucket / lockout DoS behind a proxy
See Pattern 5. Document; hop-count `TRUST_PROXY=1` recommended for a single proxy.

### Pitfall 15: Backup-code entry
Codes are `xxxxx-xxxxx` mixed-case alphanumerics. Trim whitespace in the input; do not lower-case (verification is an exact `codes.includes(code)`).

## Code Examples

### Auth config deltas (server/src/lib/auth.ts)
```typescript
// Source: composed from better-auth 1.4.18 dist (two-factor/index.mjs, api/rate-limiter, cookies, context) read this session
export const auth = betterAuth({
    database: prismaAdapter(prisma, {provider: "postgresql"}),
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: resolveTrustedOrigins,
    emailAndPassword: {enabled: true},
    plugins: [twoFactor({issuer: "Docktor", trustDeviceMaxAge: 30 * 24 * 60 * 60})],
    disabledPaths: ["/two-factor/send-otp", "/two-factor/verify-otp"],
    rateLimit: buildRateLimitConfig(),            // lib/auth-config.ts (pure, unit-tested)
    advanced: {
        ipAddress: {ipAddressHeaders: [CLIENT_IP_HEADER]},
        useSecureCookies: resolveUseSecureCookies(process.env.BETTER_AUTH_URL),
        disableOriginCheck: false,                // explicit: default flips to true under NODE_ENV=test
    },
    hooks: {before: /* existing sign-up block + disable-while-mandatory guard */, after: /* revoke other sessions */},
});
```

### Auth route shim (server/src/routes/auth.ts)
```typescript
app.all("/api/auth/*", async (request, reply) => {
    request.raw.headers[CLIENT_IP_HEADER] = request.ip; // trusted value only; overwrites any client-sent header
    reply.hijack();
    return handler(request.raw, reply.raw);
});
```

### Client login second step (client)
```typescript
// Source: better-auth client.mjs / index.mjs (twoFactorRedirect), docs https://better-auth.com/docs/plugins/2fa
const {data, error} = await signIn.email({email, password});
if (error?.status === 429) { /* read X-Retry-After via fetchOptions.onError */ }
if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) { setStep("totp"); return; }
// step 2:
await authClient.twoFactor.verifyTotp({code, trustDevice});        // or verifyBackupCode({code, trustDevice})
```

### Test helper: TOTP code from an enrollment URI (no dependency)
```typescript
// RFC 6238, SHA-1, 30 s, 6 digits. The URI `secret` param is base32 of the raw secret string
// (@better-auth/utils otp.mjs generateQRCode: base32.encode(secret, {padding:false})).
import {createHmac} from "node:crypto";
export function totpFromUri(totpURI: string, nowMs = Date.now()): string {
    const secretB32 = new URL(totpURI).searchParams.get("secret") ?? "";
    const key = base32Decode(secretB32);
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30_000)));
    const h = createHmac("sha1", key).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % 1_000_000).padStart(6, "0");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| (docs) "Fastify CSRF plugin enabled" | better-auth origin check + SameSite + (new) Fastify `Origin` guard | This phase | Correct the stale claims in `docs/design.md:780` and `CONCERNS.md` |
| better-auth 1.4.18 | latest is 1.7.7; `release-1.4` dist-tag is 1.4.22 | - | Current docs describe newer behaviour (e.g. `ACCOUNT_TEMPORARILY_LOCKED` lockout on repeated 2FA failures) that is **not** in 1.4.18's source; plan against the installed source. A bump to 1.4.22 could be a separate low-risk task but is out of scope and was not evaluated for breaking changes. |

**Deprecated/outdated:** `disableOriginCheck: true` also disabling CSRF is deprecated behaviour (`disableCSRFCheck` is the separate flag); we set neither to true.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `User.twoFactorEnabled Boolean? @default(false)` is the right Prisma shape (CLI-generated form); non-null variant would also work | Pattern 2 | Low: adapter writes would fail typecheck/insert; caught by integration tests |
| A2 | `qrcode.react` is the right QR component (name from training knowledge; seam says OK) | Standard Stack | Low: swap library; gate install behind human-verify |
| A3 | Inside a global `hooks.after`, the current session is obtainable (`ctx.context.newSession` or `getSessionFromCtx`) for `generate-backup-codes` | Pattern 4 | Medium: D-10 implementation detail; spike with integration test first, fallback is a thin Fastify wrapper endpoint |
| A4 | A body-less credentialed `no-cors` POST from a same-site other-port origin reaches Fastify routes with the session cookie attached | Pattern 6 | Medium: if false the Fastify gap is theoretical, but the Origin guard is still cheap defence-in-depth; the CSRF integration test will confirm |
| A5 | nginx-style proxies append to client-supplied `X-Forwarded-For`, making `trustProxy: true` spoofable and hop-count preferable | Pattern 5 | Low: documentation guidance only |
| A6 | Docker published ports on Linux preserve the real client source IP as the container's socket peer | Pitfall 14 / docs | Medium: if the daemon userland proxy masks it, direct installs share a bucket; verify in docs/UAT, not CI |
| A7 | Absent `Origin` + absent `Sec-Fetch-Site` should be allowed by the Fastify guard (non-browser clients) | Pattern 6 | Low/Medium: product call; stricter option breaks curl/API-token-less scripting and existing `app.inject` tests |
| A8 | Blocking "disable 2FA while mandatory is on" is desired | Open Questions | Low: UX policy not specified by CONTEXT |

## Open Questions

1. **Disabling 2FA while mandatory is on.**
   - What we know: D-02 guards turning mandatory on; nothing says what happens when a user disables their own 2FA while it is mandatory.
   - What's unclear: allow (they are immediately gated back to enrollment) or block.
   - Recommendation: block with a clear message ("turn off mandatory 2FA first") via a `hooks.before` guard on `/two-factor/disable`; avoids a confusing loop. Needs user confirmation (A8).

2. **`Secure` cookie when only the DB "Base URL" is https.**
   - What we know: cookie attributes are fixed at auth init from env; DB Base URL cannot influence them without a restart or a Set-Cookie rewrite.
   - Recommendation: derive from `BETTER_AUTH_URL` only (documented as required) and state the limitation; do not add Set-Cookie post-processing.

3. **Per-account lockout.**
   - 1.4.18 limits per IP + path only. Accept (TOTP and password still required) or add a custom per-email counter in a `before` hook (more code, more state). Recommendation: accept; note in docs.

4. **Fastify `Origin` guard scope.** Confirm the A7 policy and whether to exempt `/api/setup/*`, which is pre-auth (it also mutates state and is subject to the same CSRF class).

5. **Stale Verification rows / rate-limit rows.** Neither is pruned; low impact; optional cleanup task.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all | yes | v22.14.0 | - |
| Docker | Testcontainers integration tests | yes (host) | 29.8.1 | Integration tests run on GitHub Actions CI only (user preference: no heavy local runs) |
| yarn | installs | not on PATH in this shell (`yarn --version` printed nothing); `corepack enable` per CI | - | `corepack yarn` |
| psql | manual DB checks | no | - | Use `prisma` CLI / Docker |
| Postgres (dev compose) | `prisma migrate dev --create-only` for the migration | via `docker-compose.dev.yml` | postgres 18 (per STATE 05.1-08) | Hand-author SQL with `prisma migrate diff --from-migrations ... --to-schema ... --script` (still generated, not hand-edited) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** local integration test execution (CI covers it).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 (server unit + integration projects; client jsdom + Testing Library); Playwright ^1.58.2 for client E2E |
| Config file | `server/vitest.config.ts` (projects `unit`, `test/integration`), `client` vitest config, `client/playwright.config.ts` |
| Quick run command | `yarn workspace @docktor/server vitest run --project unit <file>` ; `yarn workspace @docktor/client vitest run <file>` |
| Full suite command | `yarn test` (CI); integration: `yarn workspace @docktor/server test:integration` (CI only, Testcontainers) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| #45 | `isEnrollmentRequired` / `canEnableMandatory` pure policy | unit | `vitest run --project unit test/unit/domain/two-factor-policy.test.ts` | Wave 0 |
| #45 | `requireAuth` returns 403 + code when mandatory && !twoFactorEnabled; `requireSession` does not | unit | `... test/unit/lib/auth-middleware.test.ts` | Wave 0 |
| #45 | Mandatory toggle guarded (toggler must have 2FA); disable-while-mandatory rejected | unit | `... test/unit/application/account-security-service.test.ts` | Wave 0 |
| #45 | Full flow: enable -> QR URI + 10 codes -> verify-totp flips flag -> sign-in returns `twoFactorRedirect` -> verify-totp / verify-backup-code issue session; backup code single-use | integration | `yarn workspace @docktor/server test:integration` (`two-factor.test.ts`) | Wave 0 |
| #45 | Enable/disable/regenerate revoke other sessions, keep current | integration | same (`two-factor-sessions.test.ts`) | Wave 0 |
| #45 | Password required for enable/disable/regenerate (wrong password -> 400) | integration | same | Wave 0 |
| #45 | Reset script/service disables 2FA, clears sessions + trust records | unit (service, mocked repo) + integration | `... test/unit/application/account-security-service.test.ts` | Wave 0 |
| #45 | Login form second step, recovery-code switch, trust checkbox default unchecked, 429 message | client unit | `yarn workspace @docktor/client vitest run test/unit/routes/auth/components/login-form.test.tsx` | extend existing |
| #45 | Account page sections: enroll dialog, recovery codes shown once + "I saved these" gate, regenerate, mandatory toggle disabled until user has 2FA | client unit | `vitest run test/unit/routes/account/` | Wave 0 |
| #45 | `ProtectedRoute` redirects to `/account` on enrollment-required | client unit | `vitest run test/unit/components/domain/auth/protected-route.test.tsx` | Wave 0 |
| #46 | `parseTrustProxy`, `resolveUseSecureCookies`, `buildRateLimitRules` (5/900 for sign-in + 2FA paths; plugin rule overridden), cookieCache disabled, `disableOriginCheck === false` | unit | `... test/unit/lib/auth-config.test.ts` | Wave 0 |
| #46 | 6th sign-in in 15 min -> 429 + `X-Retry-After`, with no inbound XFF; spoofed XFF does not evade; limits survive app rebuild (DB rows) | integration (env opt-in) | CI (`auth-rate-limit.test.ts`) | Wave 0 |
| #46 | Cross-origin (hostile `Origin` + valid cookie) POST rejected for `/api/auth/two-factor/disable` and `/api/stacks/:id/deploy`; same-origin/no-Origin allowed | integration | CI (`auth-csrf.test.ts`) | Wave 0 |
| #46 | `originGuard` decision table (pure) | unit | `... test/unit/lib/origin-guard.test.ts` | Wave 0 |
| #46 | Session cookie has `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` iff https base URL | integration + unit | CI (`auth-cookies.test.ts`) | Wave 0 |
| #46 | Password-reset endpoints disabled/unusable (`/request-password-reset` -> non-2xx) | integration | CI | Wave 0 |
| #45/#46 | E2E: login -> TOTP step -> dashboard; enrollment page (API stubbed per `_apiRouteGuard` convention) | Playwright | `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration -g "two-factor"` (CI) | Wave 0 |

### Sampling Rate
- **Per task commit:** the single relevant unit file (`vitest run --project unit <file>` / client file) - seconds, light enough for the VPS.
- **Per wave merge:** `yarn workspace @docktor/server test:unit` + `yarn workspace @docktor/client test:unit`.
- **Phase gate:** full CI green (unit + Testcontainers integration + Playwright + `yarn typecheck`) before `/gsd-verify-work`. Per user memory, no full `tsc --build`/integration/Playwright locally.

### Wave 0 Gaps
- [ ] `server/test/helpers/totp.ts` - `totpFromUri()` helper (above) and a base32 decode.
- [ ] `server/test/integration/setup.ts` - `cleanDatabase()` must delete `rateLimit`; add helper to sign in / enroll a user and a second-session helper.
- [ ] New test files listed in the map (server unit: `two-factor-policy`, `auth-middleware`, `account-security-service`, `auth-config`, `origin-guard`; integration: `two-factor`, `two-factor-sessions`, `auth-rate-limit`, `auth-csrf`, `auth-cookies`; client: login-form extension, account page sections, protected-route, use-account-security hook; Playwright `two-factor.spec.ts`).
- [ ] Opt-in env hook so a single integration file can run with `rateLimit.enabled` while the rest of the suite does not (Pitfall 13).
- [ ] Extend `test/unit/architecture/layering.test.ts` if a `scripts/` or new lib file warrants a rule (verify it stays green).
- Framework install: none (all present).

## Security Domain

> `security_enforcement` is not set to false in `.planning/config.json` (key absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | better-auth `emailAndPassword` + `twoFactor` (TOTP RFC 6238, single-use backup codes); password re-entry for 2FA changes (D-07); rate-limited credential endpoints |
| V3 Session Management | yes | better-auth sessions; `httpOnly`, `SameSite=Lax`, `Secure` from https URL; revoke other sessions on 2FA change (D-10); cookieCache stays off |
| V4 Access Control | yes | `requireAuth` + enrollment gate; mandatory toggle guard (D-02); no roles introduced |
| V5 Input Validation | yes | Zod schemas in `@docktor/shared` for new bodies (mandatory toggle, password/code forms); better-auth validates its own bodies |
| V6 Cryptography | yes | Never hand-roll: TOTP secrets/backup codes encrypted by better-auth with `BETTER_AUTH_SECRET`; trust-device cookie HMAC-signed; QR rendered client-side |
| V8 Data Protection | yes | Do not log `totpURI`/`backupCodes`/codes; codes shown once |
| V13 API / Web Service | yes | Origin validation on state-changing requests (better-auth + new Fastify guard) |

### Known Threat Patterns for Fastify + better-auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential stuffing / password brute force | Spoofing | 5 attempts / 15 min per IP+path, DB-backed; IP from trusted source only |
| TOTP / recovery-code brute force | Spoofing | Same limiter on `/two-factor/verify-*`; pending-2FA cookie TTL 600 s |
| `X-Forwarded-For` spoofing to evade limits | Spoofing / Tampering | Private IP header overwritten from `request.ip`; `trustProxy` default off |
| Shared-bucket lockout DoS behind an unconfigured proxy | Denial of service | Document `TRUST_PROXY=<hops>`; accepted risk (D-13) |
| CSRF on cookie-authenticated API | Tampering / Elevation | better-auth origin check (explicitly enabled) + Fastify `Origin` guard + SameSite=Lax |
| Session fixation / stale sessions after credential-factor change | Elevation | Revoke other sessions on 2FA enable/disable/regenerate |
| Secret leakage via QR service or logs | Information disclosure | Local QR rendering; no logging of secrets |
| 2FA bypass via cached session (GHSA-xg6x-h9c9-2m83) | Elevation | Stay >= 1.4.9 (have 1.4.18); keep `cookieCache` disabled, asserted by test |
| IPv6 prefix rotation vs. limiter (CVE-2026-45364) | Spoofing | Fixed in 1.4.17; do not downgrade; do not pass raw non-normalized IPs |
| Lockout after `BETTER_AUTH_SECRET` rotation | Denial of service (self) | Document; reset script (D-09) |

## Project Constraints (from CLAUDE.md)

- Layering: routes -> application services only; repositories are the only Prisma users; domain is pure; DI via constructor; singleton repositories exported from `repositories/index.ts`. (`lib/auth.ts` has a documented precedent for a local `SettingsRepository` instance to avoid a circular import.)
- HTTP status codes only in `lib/errors.ts` and `app.ts`; throw typed `AppError` subclasses (add `ForbiddenError`).
- Zod schemas for new inputs live in `@docktor/shared` (`shared/src/validation/`, re-exported from `shared/src/index.ts`); never duplicated.
- New Prisma models in their own `.prisma` file; migrations via `prisma migrate dev`, never hand-edited; use `$transaction` for multi-table operations (the reset).
- Client: pages are thin orchestrators (~80 lines) with section components under `routes/app/account/components/`; hooks own server state (no data fetching in components); forms use `react-hook-form` + Zod resolver (`standardSchemaResolver`, as in `login-form.tsx`/`ProxySettingsCard`); `ToneBadge`/`StatusDot` for pills; `Section` primitives over `Card`; every light-only color utility needs a `dark:` counterpart; API wrappers in `lib/*-api.ts` via `apiFetch`; props named `<Component>Props` with `Readonly<>`; no edits to `components/ui/`.
- TypeScript strict, no `as any`; explicit return types on exported functions; `.js` import extensions on the server.
- TDD: tests before/alongside; server integration tests use a real DB; coverage must not drop (SonarQube).
- Do not run full `tsc --build`, integration tests, or other heavy builds on this VPS (user memory) - CI runs them.
- Commit format `type(scope): description`; PRs reference the issues (`Closes #45`, `Closes #46`); each PLAN.md references its GitHub issues at the top.
- Playwright runs use `PLAYWRIGHT_PORT`; existing E2E specs must stub every `/api/**` request (`_apiRouteGuard` auto-fixture fails otherwise).

## Suggested Plan Decomposition (for the planner)

1. **Schema + auth config foundation (server):** Prisma models/migration, `twoFactor` plugin, `auth-config.ts` pure helpers (+unit tests), `trustProxy`, IP shim, rate-limit config, `useSecureCookies`, `disableOriginCheck:false`, `disabledPaths`. Integration tests: rate limit (incl. spoof/no-XFF), cookie flags, password-reset disabled.
2. **2FA policy + session revocation + gate (server):** `domain/two-factor-policy`, `ForbiddenError` + `code` forwarding, `requireSession`/`requireAuth`, settings key, `AccountSecurityRepository`/`Service`, `/api/account/*` routes, after-hook revocation (spike A3 first), disable-while-mandatory guard, reset script + docs. Integration: full 2FA flow, sessions.
3. **CSRF:** failing integration tests first, then `originGuard`; docs corrections (`docs/design.md`, `CONCERNS.md`).
4. **Client:** `twoFactorClient`, login second step, 429 message, `ProtectedRoute` redirect, Account page + sections, nav entry, `qrcode.react` (human-verify checkpoint), Playwright spec.
5. **Docs/ops:** `TRUST_PROXY`, rate-limit behaviour, reset procedure, `BETTER_AUTH_SECRET` rotation warning in `docs/deployment.md` and `.env.example`; capture the password-reset follow-up issue (D-16).

## Sources

### Primary (HIGH confidence)
- Installed better-auth 1.4.18 source (`/home/raphael/workspace/docktor/node_modules/better-auth/dist/...`): `plugins/two-factor/{index,schema,verify-two-factor,client,constant}.mjs`, `plugins/two-factor/{totp,backup-codes}/index.mjs`, `api/rate-limiter/index.mjs`, `api/middlewares/origin-check.mjs`, `api/to-auth-endpoints.mjs`, `api/routes/{session,password}.mjs`, `cookies/index.mjs`, `context/create-context.mjs`, `utils/get-request-ip.mjs`; `@better-auth/core/dist/db/get-tables.mjs`, `@better-auth/core/dist/env/env-impl.mjs`; `@better-auth/utils/dist/otp.mjs`
- Repository files read this session: `server/src/lib/{auth,auth-middleware,errors}.ts`, `server/src/routes/{auth,settings,setup}.ts`, `server/src/app.ts`, `server/src/repositories/{settings,user}-repository.ts`, `server/src/application/settings-service.ts`, `server/prisma/schema/auth.prisma`, `server/test/integration/setup.ts`, `server/vitest.config.ts`, `client/src/lib/{auth-client,api}.ts`, `client/src/routes/auth/components/login-form.tsx`, `client/src/router.tsx`, `client/src/components/app-sidebar.tsx`, `client/src/routes/app/settings.tsx`, `docs/design.md`, `.planning/codebase/CONCERNS.md`, `Dockerfile`, `.github/workflows/ci.yml`
- Fastify Reference/Server.md `trustProxy` (installed fastify 5.7.4 docs)

### Secondary (MEDIUM confidence)
- https://better-auth.com/docs/plugins/2fa (plugin overview; note it documents newer-than-1.4.18 behaviour such as account lockout)
- https://github.com/advisories/GHSA-xg6x-h9c9-2m83 (2FA bypass with cookieCache, fixed in 1.4.9)
- Web search summary for CVE-2026-45364 (limiter IPv6 bypass, fixed 1.4.17); CVE-2025-71403 (trustedOrigins bypass, fixed < 1.1.21, not applicable)
- https://github.com/zpao/qrcode.react (`QRCodeSVG` usage)

### Tertiary (LOW confidence)
- corgea.com better-auth advisory aggregation (could not confirm patched versions above 1.4.18; treat as "no known blocker", not as a guarantee)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions read from lockfile and installed packages; one new client dependency, seam-checked.
- Architecture: HIGH for better-auth behaviour (source read); MEDIUM for the after-hook session lookup (A3) and Fastify CSRF reachability (A4), both flagged for first-plan spikes/tests.
- Pitfalls: HIGH for 1-5, 8, 9 (directly observed in source); MEDIUM for proxy/Docker topology claims (A5, A6).

**Research date:** 2026-10-10
**Valid until:** 2026-11-09 (30 days; better-auth is fast-moving, but the project is pinned to 1.4.18 so findings hold until the lockfile changes)
