# Phase 15: Access Hardening - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Authentication becomes a real security boundary, matching the risk of Docktor's Docker-socket access. Two deliverables:

1. **TOTP two-factor authentication (#45):** users can enable TOTP with recovery codes; 2FA can be made mandatory instance-wide.
2. **Auth hardening audit (#46):** rate limiting on auth endpoints, CSRF verified/locked with tests, session-cookie security defaults verified and closed.

Scope is a hardening of the existing `better-auth` integration — no custom auth system, no SMS/email 2FA, no OAuth. Password reset is **not** built here (see Deferred).

</domain>

<decisions>
## Implementation Decisions

### Mandatory 2FA policy (#45)
- **D-01:** When mandatory 2FA is on, a user without 2FA is **forced to enroll at login**: after a correct password they are routed to the enrollment screen and cannot reach the app until enrollment completes. No grace period.
- **D-02:** Any logged-in user may toggle the instance-wide mandatory-2FA setting (matches the current no-roles model; every user can edit all Settings). **Guard:** the setting can only be turned on once the toggling user has 2FA enabled themselves, to prevent self-lockout. No admin role is introduced. — **Reversibility:** reversible — a role model can be layered on later.
- **D-03:** The mandatory setting is stored via the existing settings mechanism (`SettingsRepository`/`SETTING_KEYS`) and surfaced on the Account/Security page (see D-08).

### Login flow (#45)
- **D-04:** The TOTP step is a **second screen after the password** (better-auth `twoFactor` plugin's `twoFactorRedirect`): a code input with a "use a recovery code" alternative.
- **D-05:** The second step offers an **opt-in "trust this device for 30 days" checkbox** (better-auth's native trust-device support). Default unchecked; without it the code is always required. — **Reversibility:** reversible — a config flag plus one checkbox.

### Enrollment & recovery UX (#45)
- **D-06:** Recovery codes use better-auth's default (10 single-use codes). They are **shown once**, with copy and download actions, and enrollment is not complete until the user confirms "I saved these".
- **D-07:** **Password re-entry is required to enable 2FA, disable 2FA, and regenerate recovery codes** (better-auth's twoFactor endpoints already take the password).
- **D-08:** 2FA management lives on a **new dedicated Account page** (new route + nav entry), not a Settings card. It holds only the Security section for now (enable/disable, regenerate codes, mandatory-2FA toggle). Password change, session list, etc. are not added here. The page follows the Phase 11 page-composition rules (thin orchestrator + section components under `routes/app/account/components/`, `UnsavedChangesGuard` not needed, react-hook-form + Zod for forms).
- **D-09:** **Lost-everything fallback is a documented CLI/DB reset** (an on-box command or documented procedure that disables 2FA for a given user). No email-based reset and no other-user override.
- **D-10:** Enabling/disabling 2FA or regenerating recovery codes **revokes the user's other sessions** (keep the current one). Session lifetime stays at better-auth defaults.

### Rate limiting (#46)
- **D-11:** Use **better-auth's built-in rate limiter** with per-path rules — no `@fastify/rate-limit` layer in this phase. Counters are stored in the **database** (better-auth `rateLimit` storage/model) so a restart cannot reset limits. Requires a new Prisma model/migration in its own `.prisma` file per project convention. — **Reversibility:** costly — adds a DB table that other code won't depend on, but a migration is needed to remove it.
- **D-12:** Thresholds: **5 attempts / 15 minutes** for sign-in and for 2FA verification (per IP + account where the library supports it); other auth endpoints looser (order of 100/minute). Exact numbers are validated in research against better-auth's rule semantics. The UI surfaces a clear "try again in N minutes" message from the 429 `Retry-After`.
- **D-13:** Client IP resolution: honor `X-Forwarded-For` **only when an explicit trusted-proxy env setting is enabled (e.g. `TRUST_PROXY`), default off** — safe against header spoofing when exposed directly, documented for reverse-proxy users. Behind-proxy installs that don't set it share one socket IP; document this.

### CSRF & cookies (#46)
- **D-14:** CSRF: **verify and lock with tests** — no new CSRF token layer. better-auth's trusted-origin check and SameSite cookies plus production CORS-off are the mechanism. Add integration tests proving cross-origin state-changing requests are rejected for both `/api/auth/*` and the Fastify routes (e.g. stacks), and fix any gap the tests reveal. Correct the stale "Fastify CSRF plugin enabled" claim in `docs/design.md`/`CONCERNS.md`.
- **D-15:** Session cookie flags: `httpOnly` and `SameSite=lax` asserted by tests; **`Secure` is derived from whether the effective base URL is https** (env `BETTER_AUTH_URL` / Base URL setting), not from `NODE_ENV`, so plain-http LAN installs keep working while https installs are always secure.

### Password reset (#46)
- **D-16:** Password reset is **not built** in this phase. The audit covers what exists (rate limits apply to any reset endpoints better-auth could expose, which are disabled today). Reset is captured as a follow-up issue (see Deferred).

### Claude's Discretion
- Exact numeric rate-limit windows beyond the 5/15min login & 2FA-verify rule; response copy.
- Shape of the CLI/DB 2FA reset (script vs documented SQL) and where it is documented, provided it does not require email.
- Account page nav placement and label details; recovery-code download format (txt).
- Test layout (unit vs integration split) within the project's TDD rules; integration tests run on CI, not on the VPS.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & issues
- `.planning/ROADMAP.md` §"Phase 15: Access Hardening" — goal and success criteria
- GitHub issues `docktor-app/docktor#45` (TOTP 2FA) and `#46` (auth hardening) — acceptance criteria and out-of-scope notes
- `.planning/REQUIREMENTS.md` — v1 requirements context (OAuth/LDAP out of scope)

### Existing auth code
- `server/src/lib/auth.ts` — better-auth config, dynamic `trustedOrigins`, sign-up block hook
- `server/src/lib/auth-middleware.ts` — `requireAuth` preHandler
- `server/src/routes/auth.ts` — `/api/auth/*` handler (hijacked reply, raw body)
- `server/src/app.ts` — CORS/cookie registration, first-run redirect hook, no `trustProxy`
- `server/prisma/schema/auth.prisma` — User/Session/Account models (new twoFactor + rateLimit models go in their own schema files)
- `client/src/lib/auth-client.ts` — better-auth client (add twoFactor client plugin)
- `client/src/routes/auth/login.tsx`, `client/src/routes/auth/components/` — login form to extend with the second step

### Known concerns
- `.planning/codebase/CONCERNS.md` — notes on missing rate limiting (line ~71) and the CSRF claim mismatch (line ~78)
- `docs/design.md` — security summary containing the stale CSRF claim

### Prior-phase patterns
- `.planning/phases/11-*` UI Rework — page composition, `Section`, `ToneBadge`, react-hook-form patterns
- `.planning/phases/12-compose-safety-and-templates/12-CONTEXT.md` — settings-toggle precedent (D-04)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettingsRepository` / `SETTING_KEYS`: store the mandatory-2FA flag.
- `ProxySettingsCard` / `CertificatesCard`: react-hook-form + Zod pattern for the new Account forms.
- `ToneBadge` / `StatusDot`, `Section`, `Page` shell: Account page UI.
- `login-form.tsx` and its existing unit test: extend for the TOTP step.

### Established Patterns
- Routes call application services only; settings and auth logic live in `application/`, never in routes.
- Zod schemas for new inputs go in `@docktor/shared`.
- Fastify global error handler in `app.ts` owns HTTP status mapping.
- `trustedOrigins` is resolved per request from env + DB Base URL; the `Secure` cookie decision (D-15) should reuse the same base-URL source.

### Integration Points
- better-auth `twoFactor` plugin (server) + `twoFactorClient` (client); needs Prisma `TwoFactor` model and `twoFactorEnabled` on `User` (migration).
- `before` auth hook in `auth.ts` is the place for mandatory-2FA enforcement hooks; the `requireAuth` middleware must also reject sessions of users who still owe enrollment when the setting is on.
- First-run setup wizard (`routes/setup.ts`) creates the first admin before 2FA exists — the mandatory flag must not be settable during setup, and the wizard flow must not be broken.
- Session revocation (D-10) uses better-auth's session API.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user chose the recommended option on all questions except two: a **dedicated Account page** (rather than a Settings card) and an **opt-in trust-device checkbox**.

</specifics>

<deferred>
## Deferred Ideas

- **Email-based password reset** — new capability (SMTP delivery, tokens, UI); capture as its own GitHub issue / future phase.
- **Admin/role model** — would allow restricting the mandatory-2FA toggle; not needed for single-admin instances.
- **Account page extras** — password change, active sessions list, session revoke UI.
- **Additional Fastify-level rate limiting** (`@fastify/rate-limit`) for non-auth routes.
- **Shorter session lifetime / idle expiry.**

</deferred>

---

*Phase: 15-Access Hardening*
*Context gathered: 2026-10-10*
