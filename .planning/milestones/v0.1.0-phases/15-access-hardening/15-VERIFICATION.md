---
phase: 15-access-hardening
verified: 2026-10-11T18:10:00Z
status: passed
score: 14/14 must-haves verified
covered_files: [".planning/phases/15-access-hardening/15-01-PLAN.md", ".planning/phases/15-access-hardening/15-01-SUMMARY.md", ".planning/phases/15-access-hardening/15-02-PLAN.md", ".planning/phases/15-access-hardening/15-02-SUMMARY.md", ".planning/phases/15-access-hardening/15-03-PLAN.md", ".planning/phases/15-access-hardening/15-03-SUMMARY.md", ".planning/phases/15-access-hardening/15-04-PLAN.md", ".planning/phases/15-access-hardening/15-04-SUMMARY.md", ".planning/phases/15-access-hardening/15-05-PLAN.md", ".planning/phases/15-access-hardening/15-05-SUMMARY.md", ".planning/phases/15-access-hardening/15-06-PLAN.md", ".planning/phases/15-access-hardening/15-06-SUMMARY.md", ".planning/phases/15-access-hardening/15-07-PLAN.md", ".planning/phases/15-access-hardening/15-07-SUMMARY.md", "client/src/components/domain/auth/protected-route.tsx", "client/src/lib/auth-client.ts", "client/src/routes/app/account.tsx", "client/src/routes/auth/components/login-form.tsx", "client/src/routes/auth/components/two-factor-step.tsx", "client/src/routes/setup.tsx", "server/src/app.ts", "server/src/application/account-security-service.ts", "server/src/domain/two-factor-policy.ts", "server/src/lib/auth-config.ts", "server/src/lib/auth-middleware.ts", "server/src/lib/auth.ts", "server/src/lib/origin-guard.ts", "server/src/lib/two-factor-hooks.ts", "server/src/repositories/account-security-repository.ts", "server/src/routes/account.ts", "server/src/routes/auth.ts", "server/src/scripts/reset-two-factor.ts"]
covered_digest: "v2:sha256:da0f298522d799e7ec93d0ca6eb8a022d1b24b8672ce10fc0c6cf2f394dcfc78"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 11/13
  gaps_closed:
    - "G-15-14 (UAT): a single sign-in lands the user in the app (plan 15-07)"
    - "behavior_unverified: auth endpoints rate limited (SC2), now CI integration test plus manual UAT test 2"
    - "behavior_unverified: other sessions revoked on 2FA change (D-10), now CI integration test plus manual UAT test 10"
  gaps_remaining: []
  regressions: []
coincidental_reliance_items: []
advisory:
  - finding: "15-REVIEW.md: 0 critical, 7 warnings (WR-01..WR-07), 7 info (IN-01..IN-07)"
    category: other
    reason: "Code review findings, not must-have failures. Notable: WR-01 (non-atomic better-auth rate-limit counter, concurrent bursts can exceed 5), WR-02 (LoginForm stuck on 'Signing in...' if signIn.email rejects), WR-03 (setup wizard ignores a failed auto-login result), WR-07 (after-hook failure after a committed 2FA change loses recovery codes)."
    evidence_status: "reviewed, not exercised"
  - finding: "UAT test 9 (forced enrollment of a second user) blocked: sign-up is closed so no second user could be created manually"
    category: other
    reason: "Covered by server/test/integration/account-security.test.ts and two-factor.test.ts and the Playwright journey in client/test/integration/two-factor.spec.ts, all green in CI."
    evidence_status: "automated only"
  - finding: "Behaviour behind a real reverse proxy with TRUST_PROXY=1 (VALIDATION.md manual-only row) not exercised on real infrastructure"
    category: other
    reason: "auth-rate-limit.test.ts 'separates clients behind one proxy when TRUST_PROXY=1' simulates it in CI; only a real Traefik topology is untested. Recommend a one-time operator check at deployment."
    evidence_status: "simulated in CI"
---

# Phase 15: Access Hardening Verification Report

**Phase Goal:** Authentication is treated as a real security boundary, matching the risk of Docktor's Docker-socket access.
**Verified:** 2026-10-11T18:10:00Z
**Status:** passed
**Re-verification:** Yes. The previous report was stale because plan 15-07 (gap closure G-15-14) changed covered client files. The 13 earlier truths were regression-checked; the two behavior-unverified truths were upgraded with the CI and UAT evidence supplied by the orchestrator; truth 14 (G-15-14) was verified from scratch.

## Goal Achievement

### Observable Truths

Sources: ROADMAP success criteria SC1-SC3 (the contract), PLAN `must_haves` from 15-01..15-07.

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1 (#45): user can enable mandatory-capable TOTP 2FA, recovery codes issued on enrollment | VERIFIED | `lib/auth.ts` `twoFactor({issuer:"Docktor", trustDeviceMaxAge})`; enroll dialog -> `twoFactor.enable` -> `verifyTotp`; `RecoveryCodesPanel` gates Continue; mandatory switch -> `PUT /api/account/security/mandatory-2fa`. UAT tests 3, 6, 7, 8 pass, including a real authenticator (test 3, light and dark QR). |
| 2  | SC2 (#46): auth endpoints have rate limiting | VERIFIED | `buildRateLimitConfig()` in `auth-config.ts` (8 strict paths, 5 per 15 min, `storage: "database"`); client IP stamped from `request.ip` in `routes/auth.ts`. Behavior now evidenced by `server/test/integration/auth-rate-limit.test.ts` (5 tests: 6th attempt 429 with X-Retry-After and persisted counter, forged header does not choose the bucket, TRUST_PROXY=1 separates clients, wrong-TOTP limit) green in CI, plus manual UAT test 2 pass. Password reset and OTP endpoints are closed (404) per D-16, email reset tracked in #79. |
| 3  | SC3a (#46): CSRF protection verified or closed | VERIFIED | `advanced.disableOriginCheck: false`, `createOriginGuard` registered as an `onRequest` hook in `app.ts` for unsafe `/api/*` requests; no CSRF-token plugin dependency. UAT test 11 pass (cross-origin write 403). |
| 4  | SC3b (#46): httpOnly/sameSite/secure defaults verified or closed | VERIFIED | better-auth defaults (lax, httpOnly); `resolveUseSecureCookies(BETTER_AUTH_URL)` derives Secure from an https URL, never NODE_ENV; cookie cache deliberately off. CI green incl. `auth-cookies` and `auth-cookies-https` integration tests. |
| 5  | D-04/D-05/D-12: login second step (TOTP / recovery code, trust-device, 429 copy) | VERIFIED | `login-form.tsx` `requiresTwoFactor(data)` swaps to `TwoFactorStep`; `two-factor-step.tsx` uses `twoFactor.verifyTotp/verifyBackupCode`; UAT tests 4, 5 pass. |
| 6  | D-01: mandatory 2FA enforced server-side on every gated route | VERIFIED | `requireAuth` in `auth-middleware.ts` applies `isEnrollmentRequired` (fail closed); used in the protected route files. Integration coverage in `account-security.test.ts` green in CI. |
| 7  | D-02: account endpoints reachable by a user who owes enrollment; only a 2FA user may flip the setting | VERIFIED | `routes/account.ts` uses `requireSession` only; `AccountSecurityService.setMandatory` guarded by `canChangeMandatory`. |
| 8  | D-10: other sessions and trusted devices revoked on 2FA enable/disable/regenerate; failed calls revoke nothing | VERIFIED | `two-factor-hooks.ts` wired in `auth.ts`; real request path now proven by `server/test/integration/two-factor-sessions.test.ts` (6 tests incl. enable, regenerate, disable, no-op on plain re-verification, refuse disable while required) green in CI; manual UAT test 10 pass. The earlier WeakMap-on-better-auth-ctx assumption is thereby empirically confirmed. |
| 9  | D-09: on-box 2FA reset script, no HTTP route | VERIFIED | `scripts/reset-two-factor.ts` -> `AccountSecurityService.resetTwoFactor`; no route references it. UAT test 12 pass. |
| 10 | D-16: reset/OTP/TOTP-URI endpoints closed | VERIFIED | `disabledPaths` in `auth.ts`; no `viewBackupCodes` in source. |
| 11 | D-01 client: forced-enrollment redirect, 403 handling, dialogs with password re-entry | VERIFIED | `protected-route.tsx` present and unmodified by 15-07 (git diff confirms); `ENROLLMENT_REQUIRED_EVENT` listener. UAT test 9 blocked (no second user) but server and Playwright coverage green in CI. |
| 12 | Recovery codes and TOTP secret never leave the browser; QR rendered locally | VERIFIED | `QRCodeSVG` from `qrcode.react`, no remote QR service, no storage/console use for secrets. |
| 13 | Operator docs, `.env.example` (TRUST_PROXY), follow-up issue #79 | VERIFIED | Present as in the previous report; not touched by 15-07. |
| 14 | G-15-14 (plan 15-07): one sign-in lands the user on the Dashboard after a signed-out visit to `/`; 2FA path holds "Verifying..." until the session is refreshed; `navigate("/")` never precedes `refreshSession()`; setup wizard auto-login refreshes before step 2; ProtectedRoute unchanged | VERIFIED | See below. UAT test 14 pass (manual re-test after the fix) and CI Playwright/unit green. |

**Score:** 14/14 truths verified (0 present, behavior unverified)

#### Truth 14 detail (codebase evidence, read directly)

- `client/src/lib/auth-client.ts`: `refreshSession()` narrows `authClient.$store.atoms.session.get()` with a module-private type guard (no casts, no `any`) and awaits its `refetch()`; it has no throw path (better-auth's refetch always resolves). Exported alongside `useSession, signIn, signUp, signOut, twoFactor`.
- `login-form.tsx`: one `completeSignIn()` (`await refreshSession(); navigate("/")`) is the only `navigate("/")`; used for the password-only path (`await completeSignIn()` after the 2FA check) and passed as `onSuccess={completeSignIn}` to `TwoFactorStep`. Failed sign-in (error branch) and `twoFactorRedirect` branch return before it.
- `two-factor-step.tsx`: `onSuccess(): void | Promise<void>`, and `onSubmit` does `await onSuccess()`, so react-hook-form's `isSubmitting` ("Verifying...", disabled) lasts through the refresh.
- `setup.tsx`: `await refreshSession()` between auto-login `signIn.email` and `setCurrentStep(2)`.
- `protected-route.tsx`: not in the 15-07 diff range (commits f19f698, 449c904, 1177c23, plus test-only 7f7284b).
- Tests: `client/test/unit/lib/auth-client.test.ts` (contract test against the real better-auth client, 3 tests), order tests in `login-form.test.tsx` and `two-factor-step.test.tsx`, and Playwright journey "signs in once from a signed-out visit to / and stays on the dashboard (G-15-14)" in `auth.spec.ts` (plus the TOTP variant in `two-factor.spec.ts`, setup-wizard get-session stub). CI reported all green after commit 7f7284b fixed the stacks stub.

The behavior-dependent invariant here (order: refresh resolves before navigation) is exercised by unit order tests and the Playwright journey, and confirmed by the user in UAT test 14, so it is VERIFIED rather than presence-only.

### Prohibitions (ADR-550, judgment-tier)

All re-checked in the earlier verification and unaffected by 15-07 (which touches client sign-in flow only): no client-IP header trust without TRUST_PROXY (now also integration-tested and UAT-confirmed), no Fastify rate-limit or CSRF plugin, no endpoint returning stored recovery codes, no enrollment-gated `requireAuth` on `/api/account/*`, no admin role, Secure not derived from NODE_ENV, no CSRF token layer, no HTTP/email 2FA reset, no remote QR or client persistence of codes, client redirect is not treated as enforcement. 15-07 adds no new endpoint or trust boundary. No flagged prohibitions.

### Required Artifacts and Key Links

All artifacts from plans 15-01..15-07 exist, are substantive and wired (checked in the previous verification; the six files changed by 15-07 re-read now: `auth-client.ts`, `login-form.tsx`, `two-factor-step.tsx`, `setup.tsx`, plus the new `auth-client.test.ts`). 15-07 key links verified by grep: `login-form.tsx` -> `auth-client.ts` (`await refreshSession()` in `completeSignIn`), `two-factor-step.tsx` `await onSuccess()` <- `onSuccess={completeSignIn}`, `auth-client.ts` -> `$store.atoms.session`, `setup.tsx` -> `refreshSession`. All earlier key links unchanged.

### Data-Flow Trace (Level 4)

`refreshSession()` -> session atom `refetch()` -> `GET /api/auth/get-session` -> store -> `ProtectedRoute` `useSession()`: FLOWING (real endpoint, contract-tested). Earlier flows (account-security status, `requireAuth` setting read) unchanged and FLOWING.

### Behavioral Spot-Checks

Not rerun locally (instruction: no heavy builds or suites). Evidence used instead: CI on `feature/phase-15-access-hardening` fully green (build, typecheck, client and shared unit, server unit and integration incl. `auth-rate-limit` and `two-factor-sessions`, Playwright e2e). Existence of the named tests confirmed by reading the files.

### Probe Execution

SKIPPED: no probes declared.

### Requirements Coverage

Plan frontmatter `requirements` across 15-01..15-07 are `#45` and `#46` only. These are GitHub issue references, not REQUIREMENTS.md IDs; REQUIREMENTS.md contains no entries for them (grep for #45/#46 returns nothing), consistent with the ROADMAP, which cites the issues directly. Every declared ID is accounted for via the ROADMAP; no orphaned requirements.

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| #45 TOTP 2FA, recovery codes, mandatory option | 15-01, 02, 03, 05, 06, 07 (and 04) | SATISFIED | Truths 1, 5-9, 11, 12, 14; UAT 13/14 pass |
| #46 Auth security audit (rate limit, CSRF, cookies) | 15-01, 03, 04 | SATISFIED | Truths 2-4, 10, 13; integration tests green |

### Anti-Patterns Found

Grep for `TBD|FIXME|XXX|TODO|HACK` over all 18 covered source files: no matches. No `as any` introduced; `refreshSession` uses a type guard. No debt-marker blockers.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `client/src/routes/auth/components/login-form.tsx` | 43-77 | `loading` toggled by hand without try/finally (review WR-02) | Warning (advisory) | If `signIn.email` rejects (network failure) the button stays on "Signing in..." until reload. Failure path only, not a goal blocker. |
| `client/src/routes/setup.tsx` | 62-64 | auto-login result `{error}` discarded before `refreshSession()` (review WR-03) | Warning (advisory) | Failed auto-login proceeds to step 2 and bounces to /login at the end. |
| `server/src/lib/auth-config.ts` | ~107-119 | better-auth rate-limit counter is a non-atomic read-modify-write (review WR-01) | Warning (advisory) | Concurrent bursts may exceed 5 attempts per window. Sequential limit proven by the integration test and UAT; consider an account-scoped atomic counter as follow-up hardening. |

### Human Verification Required

None outstanding. The previously listed items are resolved: real-authenticator enrollment (UAT test 3 pass), CI integration and Playwright runs (CI green), rate limiting and session revocation (UAT tests 2, 10 pass). The remaining residual items (real reverse-proxy topology, UAT test 9) are carried as advisory because the behavior is covered by CI tests.

### Advisory: Code Review (15-REVIEW.md)

0 critical, 7 warnings, 7 info. WR-01 (non-atomic rate-limit counter), WR-02 (stuck "Signing in..." on a rejected sign-in call), WR-03 (setup wizard ignores a failed auto-login), WR-04/05 (account-security store handling), WR-06 (object URL revoked synchronously on recovery-code download), WR-07 (after-hook failure after a committed 2FA change would lose recovery codes). None contradicts a must-have truth; recommend triaging WR-01, WR-02, WR-03 and WR-07 as follow-up (WR-02 and WR-03 touch the very sign-in files 15-07 edited).

### Deferred Items

None.

### Gaps Summary

No gaps. All three ROADMAP success criteria and the plan-level truths, including the G-15-14 gap closure, are delivered in code and evidenced by green CI integration/e2e runs and completed human UAT (13 of 14 pass, 1 blocked and covered by automated tests, 0 issues). Review warnings are advisory.

---

_Verified: 2026-10-11T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
