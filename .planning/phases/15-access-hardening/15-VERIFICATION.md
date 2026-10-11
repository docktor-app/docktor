---
phase: 15-access-hardening
verified: 2026-10-11T13:40:00Z
status: human_needed
score: 11/13 must-haves verified
covered_files: ["client/src/components/domain/auth/protected-route.tsx", "client/src/routes/app/account.tsx", "client/src/routes/auth/components/two-factor-step.tsx", "server/src/app.ts", "server/src/application/account-security-service.ts", "server/src/domain/two-factor-policy.ts", "server/src/lib/auth-config.ts", "server/src/lib/auth-middleware.ts", "server/src/lib/auth.ts", "server/src/lib/origin-guard.ts", "server/src/lib/two-factor-hooks.ts", "server/src/repositories/account-security-repository.ts", "server/src/routes/account.ts", "server/src/routes/auth.ts", "server/src/scripts/reset-two-factor.ts"]
covered_digest: "v2:sha256:a08ed5460c1cb61c9e95acb7e1d9c74264c8f572b21f2caaebfeadfe7d3428ca"
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:
  - truth: "Auth endpoints are rate limited: the 6th sign-in from one client IP inside 15 minutes answers 429 with X-Retry-After, the counter persists in the RateLimit table, and a forged X-Forwarded-For or x-docktor-client-ip header does not choose the bucket"
    test: "Run server/test/integration/auth-rate-limit.test.ts in CI (DOCKTOR_AUTH_RATE_LIMIT=on). Optionally curl /api/auth/sign-in/email six times with a wrong password, varying X-Forwarded-For each time."
    expected: "Attempts 1-5 answer 401; attempt 6 answers 429 with X-Retry-After; a RateLimit row exists for the key; varying the header does not reset the counter."
    why_human: "Every link is present and traced against better-auth 1.4.18 source (routes/auth.ts stamps x-docktor-client-ip from request.ip -> advanced.ipAddress.ipAddressHeaders -> getIp -> customRules exact-path match -> database storage). The end-to-end counter behaviour has never been executed: the integration suite was never run locally, and unit tests only cover the pure config helpers."
  - truth: "A successful enabling verify-totp, disable or generate-backup-codes signs out the user's other sessions (keeping the caller's, re-issued one) and purges trust-device records; a failed call revokes nothing"
    test: "Run server/test/integration/two-factor-sessions.test.ts in CI. Optionally sign in on two browsers, enrol 2FA in one, reload the other."
    expected: "The second browser is signed out, the enrolling browser stays signed in, a wrong-password disable leaves both signed in."
    why_human: "The revocation decision table (planSessionRevocation) and the hook bodies with a fake context are unit-tested, but the hook correlates before/after through a WeakMap keyed by better-auth's per-call ctx.context object. That is an assumption about better-auth internals (documented in 15-02-SUMMARY as verified empirically against the source) that only a real request proves."
coincidental_reliance_items: []
human_verification:
  - test: "Real-authenticator enrollment check (VALIDATION.md manual-only row, 15-05 Task 3)"
    expected: "Open /account, Set up two-factor authentication, scan the QR with a real authenticator (Aegis, 1Password or Google Authenticator) in light and dark theme. An entry named Docktor with the account email appears, the 6-digit code verifies, status becomes Enabled, the next sign-in asks for the code, the QR scans as easily in dark theme."
    why_human: "Needs a physical authenticator; the QR is rendered locally by qrcode.react (QRCodeSVG, 8 px white padding) and unit tests only assert the otpauth URI passed to it."
  - test: "CI run of the never-executed server integration suites"
    expected: "auth-rate-limit, two-factor, two-factor-sessions, account-security, auth-csrf, auth-cookies, auth-cookies-https and two-factor-reset all pass, together with the existing integration suites (proves the NODE_ENV=test limiter default and the now-active origin check break nothing). The cookie names better-auth.session_token / better-auth.two_factor / better-auth.trust_device, derived from source, are confirmed."
    why_human: "Left to GitHub Actions by the no-heavy-local-actions rule. The tests were written against better-auth source and have never run."
  - test: "CI run of the Playwright two-factor journey"
    expected: "client/test/integration/two-factor.spec.ts passes on chromium (4 journeys) and mobile-chromium (overflow backstop); existing Playwright specs still pass with the default /api/account/security stub."
    why_human: "Never executed. 15-06-SUMMARY names the likely fixes if it fails: the user-menu button locator, toBeInViewport at 412 px, and whether better-auth refetches the session after /two-factor/verify-totp. playwright.config.ts testMatch was widened to route the spec to both projects."
  - test: "Behaviour behind a real reverse proxy (VALIDATION.md manual-only row, 15-04 Task 3)"
    expected: "Behind Traefik with TRUST_PROXY=1: fail sign-in 6 times from machine A, then sign in successfully from machine B (separate bucket). With TRUST_PROXY unset behind the proxy, machine B is locked out too (documented shared-bucket behaviour)."
    why_human: "Topology dependent. Unit tests cover parseTrustProxy and the integration suite simulates two clients with distinct X-Forwarded-For, but not a real proxy."
---

# Phase 15: Access Hardening Verification Report

**Phase Goal:** Authentication is treated as a real security boundary, matching the risk of Docktor's Docker-socket access.
**Verified:** 2026-10-11T13:40:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

No gaps found: every must-have exists, is substantive and is wired. Status is `human_needed` because two behavior-dependent truths have no executed behavioral test (the integration and Playwright suites were never run locally) and two manual-only checks from 15-VALIDATION.md are outstanding.

## Goal Achievement

### Observable Truths

Sources: ROADMAP success criteria (SC1-SC3, the contract) plus the load-bearing truths from the six PLAN `must_haves`.

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1 (#45): a user can enable mandatory-capable TOTP 2FA, with recovery codes issued on enrollment | VERIFIED | `lib/auth.ts` registers `twoFactor({issuer: "Docktor", trustDeviceMaxAge: 30d})`. better-auth 1.4.18 `backup-codes/index.mjs` defaults to 10 codes in `xxxxx-xxxxx` shape. Client: `enroll-dialog.tsx` calls `twoFactor.enable({password})` then `twoFactor.verifyTotp({code})`, `RecoveryCodesPanel` gates Continue on "I have saved". Mandatory switch: `mandatory-two-factor-row.tsx` -> `setMandatoryTwoFactor` -> `PUT /api/account/security/mandatory-2fa`. Client account tests: 62 passed (5 files). Real-authenticator check is listed under human verification. |
| 2  | SC2 (#46): auth endpoints (login, password reset, etc.) have rate limiting | PRESENT_BEHAVIOR_UNVERIFIED | `buildRateLimitConfig()` gives 8 exact strict paths 5 per 15 min, `storage: "database"`, others 100 per minute. I traced the chain in better-auth source: `onRequestRateLimit` applies `customRules` after the twoFactor plugin's own 3-per-10-s rule, so the override works; `getIp` only reads `x-docktor-client-ip` (`routes/auth.ts` overwrites it from `request.ip` on every request); Fastify `trustProxy` comes only from `parseTrustProxy(TRUST_PROXY)` (default false). `RateLimit` model plus migration present. Unit: `auth-config.test.ts` 28 passed. Password reset and OTP endpoints are closed with 404 (`disabledPaths`) rather than rate limited, per D-16 (email reset tracked in #79). End-to-end 429 never executed, see behavior_unverified_items. |
| 3  | SC3a (#46): CSRF protection verified or closed | VERIFIED | `advanced.disableOriginCheck: false` forces better-auth's origin check on in every environment (also under NODE_ENV=test). `createOriginGuard` is an `onRequest` hook in `app.ts` covering every unsafe `/api/*` request outside `/api/auth/`. `origin-guard.test.ts`: 48 passed. No CSRF token plugin dependency in `server/package.json`. `docs/design.md` and CONCERNS.md no longer claim a Fastify CSRF plugin. |
| 4  | SC3b (#46): session-cookie defaults (httpOnly / sameSite / secure) verified or closed | VERIFIED | better-auth `cookies/index.mjs` defaults `sameSite: "lax"`, `httpOnly: true`. `advanced.useSecureCookies: resolveUseSecureCookies(BETTER_AUTH_URL)` is true only for an `https://` URL and never reads NODE_ENV (checked in `auth-config.ts`; unit-tested). `session.cookieCache` deliberately unconfigured with a comment citing GHSA-xg6x-h9c9-2m83. Unit tests `auth-cookie-config.test.ts` and `auth.test.ts` import `lib/auth.ts` and need a generated Prisma client, so I did not rerun them; 15-04-SUMMARY reports them green. |
| 5  | D-04/D-05/D-12 login second step: `{twoFactorRedirect: true}` swaps the card to TOTP / recovery code with a trust-device checkbox; 429 shows X-Retry-After copy | VERIFIED | `login-form.tsx` detects `twoFactorRedirect === true`; `two-factor-step.tsx` calls `twoFactor.verifyTotp` / `verifyBackupCode`; `twoFactorClient()` registered in `auth-client.ts`; `rate-limit.ts` / `auth-errors.ts` present. Client auth + lib tests passed (12 of 14 files in my first run; the 2 failures were an unresolved `qrcode.react` in my scratch setup, and the same files passed after linking the package). |
| 6  | D-01 mandatory 2FA is enforced by the server on every gated route | VERIFIED | `requireAuth` (authN plus `isEnrollmentRequired` gate, throws 403 `TWO_FACTOR_ENROLLMENT_REQUIRED`) is the `onRequest` hook in all 11 protected route files (imports, notifications, storage, settings, backups, proxy, stacks, templates, certificates, events, health). The setting read fails closed (errors not swallowed). `two-factor-policy.test.ts` 22 passed. |
| 7  | D-02 account endpoints reachable by a user who owes enrollment; only a 2FA user may flip the setting | VERIFIED | `routes/account.ts` registers `requireSession` only (no `requireAuth`); `AccountSecurityService.setMandatory` guards both directions through `canChangeMandatory`, throwing 403 `TWO_FACTOR_NOT_ENABLED`. `account-security-service.test.ts` 9 passed. No admin role introduced. |
| 8  | D-10 other sessions and trusted devices are revoked on enabling/disabling 2FA and on regenerating codes; failed calls revoke nothing | PRESENT_BEHAVIOR_UNVERIFIED | `two-factor-hooks.ts` (before/after hooks wired in `auth.ts`), `planSessionRevocation` pure table, `deleteTrustDeviceRecords` uses the `trust-device-` prefix I confirmed in plugin source. Unit tests cover the decision table and the hooks with a fake context; the real request path was never executed, see behavior_unverified_items. Enable-twice (400) and disable-while-mandatory (403) guards are in the same before hook. |
| 9  | D-09 on-box 2FA reset script, no HTTP route | VERIFIED | `scripts/reset-two-factor.ts` -> `AccountSecurityService.resetTwoFactor` -> repository `$transaction` (deletes TwoFactor row, sets `twoFactorEnabled` false, deletes sessions, deletes `trust-device-` and `2fa-` Verification rows; prefixes match the plugin). `grep resetTwoFactor server/src/routes` = 0. `server/src` compiles into `dist/server/...` (rootDir `src`, Dockerfile copies `server/dist` to `dist/server`), matching the documented command. `reset-two-factor.test.ts` 5 passed. Docs section "Resetting two-factor authentication" present. |
| 10 | D-16 reset/OTP/TOTP-URI endpoints closed | VERIFIED | `TWO_FACTOR_DISABLED_PATHS` (5 paths) passed as `disabledPaths` in `auth.ts`; `viewBackupCodes` / `view-backup-codes` absent from `server/src` and `client/src`. Integration assertion exists in `two-factor.test.ts` (unexecuted); the config itself is verified. |
| 11 | D-01 client: forced-enrollment redirect, alert, server-authoritative 403 handling, regenerate/disable dialogs with password re-entry | VERIFIED | `protected-route.tsx` redirects to `/account` on `status.enrollmentRequired`, fails open on a status error (server is the enforcement), listens to `ENROLLMENT_REQUIRED_EVENT` dispatched by `api.ts` on 403 `TWO_FACTOR_ENROLLMENT_REQUIRED`. `/account` route in `router.tsx`, "Account" entry in `nav-user.tsx`. Regenerate and Disable dialogs call `twoFactor.generateBackupCodes` / `twoFactor.disable`. Client tests passed. |
| 12 | Recovery codes and TOTP secret never leave the browser or persist; QR rendered locally | VERIFIED | `QRCodeSVG` from `qrcode.react` (dependency in `client/package.json`, pinned in `yarn.lock`); no `qrserver` / remote QR URL in `client/src`; no `localStorage` / `sessionStorage` / `console.log|info|debug` in the account, auth route and auth-domain component directories. |
| 13 | Operator docs, `.env.example`, and password-reset follow-up issue | VERIFIED | `docs/deployment.md` documents `TRUST_PROXY` (env table, Sign-in protection, troubleshooting row 12), the reset section; `.env.example` has `TRUST_PROXY`; `docs/design.md` references #79; `gh issue view 79`: open "Let users reset a forgotten password by email", label `area:auth`. |

**Score:** 11/13 truths verified (2 present and wired, behavior unverified)

### Prohibitions (ADR-550, all judgment-tier)

All were resolved in the plans; I re-checked each against the code. None are green on a plan's say-so.

| Prohibition | Result |
| ----------- | ------ |
| MUST NOT trust client-supplied IP headers unless TRUST_PROXY (#46) | Confirmed in code: header overwritten from `request.ip`; `trustProxy` only from env, default false. Human review recommended for the end-to-end behavior (same as truth 2). |
| MUST NOT add a Fastify-level rate-limit plugin | Confirmed: no `rate-limit` / `csrf` entries in `server/package.json`. |
| MUST NOT expose an endpoint returning stored recovery codes | Confirmed: no `viewBackupCodes` in `server/src`; `get-totp-uri` closed. |
| MUST NOT put the enrollment-gated `requireAuth` on `/api/account/*` | Confirmed: `routes/account.ts` uses `requireSession` only. |
| MUST NOT introduce an admin role | Confirmed: no role model; guard is `canChangeMandatory`. |
| MUST NOT derive Secure from NODE_ENV | Confirmed in `resolveUseSecureCookies`. |
| MUST NOT add a CSRF token layer | Confirmed: Origin guard plus better-auth origin check only. |
| MUST NOT expose the 2FA reset over HTTP or email | Confirmed: no route references `resetTwoFactor`. |
| MUST NOT render the QR via a remote service / log or persist codes on the client | Confirmed by greps above. |
| MUST NOT treat the client redirect as enforcement | Confirmed: `requireAuth` is the enforcement on all gated routes. |

### Required Artifacts

All PLAN-declared artifacts exist and are substantive (non-stub line counts, real logic read): the two Prisma models plus the migration `20261011102429_add_two_factor_and_rate_limit` (matches the models: `TwoFactor`, `RateLimit` with unique `key` and BIGINT `lastRequest`, `User.twoFactorEnabled`, cascading FK), `auth-config.ts`, `account.ts` (shared), `totp.ts` helper, `two-factor-policy.ts`, `auth-middleware.ts`, `account-security-service.ts`, `account-security-repository.ts`, `routes/account.ts`, `two-factor-hooks.ts`, `origin-guard.ts`, `reset-two-factor.ts`, client `rate-limit.ts`, `auth-errors.ts`, `two-factor-step.tsx`, `use-account-security.ts`, `account-api.ts`, `account.tsx` (74 lines, under the ~80 line orchestrator budget), `recovery-codes-panel.tsx`, `enroll-dialog.tsx`, `mandatory-two-factor-row.tsx`, `regenerate-codes-dialog.tsx`, `disable-two-factor-dialog.tsx`, `protected-route.tsx`, and `two-factor.spec.ts` (209 lines, 5 tests).

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `routes/auth.ts` | `auth-config.ts` | `CLIENT_IP_HEADER` stamped from `request.ip` | WIRED |
| `app.ts` | `auth-config.ts` | `trustProxy: parseTrustProxy(TRUST_PROXY)` | WIRED |
| `auth.ts` | `auth-config.ts` | `buildRateLimitConfig`, `ipAddressHeaders`, `disabledPaths`, `resolveUseSecureCookies` | WIRED |
| `auth.ts` | `two-factor-hooks.ts` | `hooks.before` / `hooks.after` | WIRED |
| `auth-middleware.ts` | `two-factor-policy.ts` | `isEnrollmentRequired` in `requireAuth` | WIRED |
| `routes/account.ts` | `account-security-service.ts` | `accountSecurityService.getStatus/setMandatory` | WIRED |
| `app.ts` | `errors.ts` | error handler forwards `AppError.code` | WIRED |
| `app.ts` | `origin-guard.ts` | `addHook("onRequest", createOriginGuard(...))` | WIRED |
| `reset-two-factor.ts` | `account-security-service.ts` | `resetTwoFactor(email)` | WIRED |
| `login-form.tsx` | `two-factor-step.tsx` | `twoFactorRedirect` step state | WIRED |
| `two-factor-step.tsx` / dialogs | `auth-client.ts` | `twoFactor.verifyTotp/verifyBackupCode/enable/disable/generateBackupCodes` | WIRED |
| `router.tsx` / `nav-user.tsx` | `account.tsx` | `/account` route and menu link | WIRED |
| `api.ts` | `protected-route.tsx` | `ENROLLMENT_REQUIRED_EVENT` dispatch and listener | WIRED |
| `mandatory-two-factor-row.tsx` | `account-api.ts` | `setMandatoryTwoFactor` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| -------- | ---- | ------ | --------- | ------ |
| `account.tsx` / `TwoFactorSection` | `status` | `useAccountSecurity` -> `getAccountSecurity` -> `GET /api/account/security` -> `AccountSecurityService.getStatus` -> `prisma.user` + `Setting` row | Yes | FLOWING |
| `protected-route.tsx` | `status.enrollmentRequired` | same shared store | Yes | FLOWING |
| `requireAuth` | `mandatory` | `settingsRepository.get("auth.requireTwoFactor")` | Yes (DB read per gated request, no cache) | FLOWING |
| `enroll-dialog.tsx` | `totpURI`, `backupCodes` | `twoFactor.enable` response | Yes | FLOWING |

### Behavioral Spot-Checks (targeted, run by me)

Setup: temporary untracked `node_modules` symlinks to the main checkout and a `shared/dist` build, both removed afterwards; `git status` clean.

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server auth config, policy, Origin guard, account service, reset script | `vitest run --project unit` on `auth-config`, `domain/`, `origin-guard`, `account-security-service`, `scripts/` | 21 files, 359 tests passed | PASS |
| Client account page, enroll/regenerate/disable dialogs, mandatory row | `vitest run test/unit/routes/account` | 5 files, 62 tests passed | PASS |
| Client login, protected route, auth components, hook, auth-errors, rate-limit, api | `vitest run` on those paths | 12 of 14 files passed (137 tests); remaining 2 failed only on an unresolved `qrcode.react` in my scratch setup and passed on rerun | PASS |
| Integration and Playwright suites | not run (rule: CI only) | n/a | SKIP |

I traced better-auth 1.4.18 source for: rate-limit rule precedence (customRules after plugin rules), `getIp` reading only the configured header, backup-code count and shape, trust-device and pending-2FA identifier prefixes, default cookie attributes.

### Probe Execution

SKIPPED: no probes declared by the phase plans.

### Requirements Coverage

Phase requirements are GitHub issues (not REQUIREMENTS.md IDs; the file has no entries for them).

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| #45 TOTP 2FA, recovery codes, mandatory option | 15-01, 15-02, 15-03, 15-04, 15-05, 15-06 | SATISFIED in code; real-authenticator check and CI integration suites outstanding | Truths 1, 5-9, 11, 12 |
| #46 Auth security audit (rate limit, CSRF, cookies) | 15-01, 15-03, 15-04 | SATISFIED in code; end-to-end rate-limit and cookie behavior awaits CI | Truths 2-4, 10, 13 |

No orphaned requirements.

### Anti-Patterns Found

Scanned the 41 non-test source and doc files changed since the Phase 15 planning commit.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| none | | no `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/placeholder markers; no `as any` introduced | none | `any` hits in `application/index.ts` are pre-existing and untouched by this phase |

### Notes and Residual Risks (non-blocking)

- Rate limiting "for password reset" is met by closing those endpoints (404) rather than limiting them. Email-based reset is out of scope and tracked in #79.
- If CI shows a login-copy mismatch, check `classifyAuthError`: it matches better-auth error strings taken from the plugin's error-code table, never confirmed against a live server (15-03-SUMMARY flags this).
- Threat register items marked "mitigated (integration proof awaits CI)" in the plan summaries are the same two behavior-unverified truths plus cookie names.

### Deferred Items

None. No gap maps to a later phase.

### Gaps Summary

No gaps. The phase goal is delivered in code: TOTP 2FA with recovery codes and an instance-wide enforcement gate, database-backed rate limiting keyed to an unforgeable client IP, a two-layer Origin-based CSRF defence, and https-derived Secure cookies. What keeps this from `passed` is evidence, not implementation: the server integration suites and the Playwright journey have never been executed, and the real-authenticator and reverse-proxy checks need a human. Run CI first; if the integration suites go green, only the authenticator and proxy manual checks remain.

---

_Verified: 2026-10-11T13:40:00Z_
_Verifier: Claude (gsd-verifier)_
