---
phase: 15-access-hardening
plan: 07
subsystem: client-auth
tags: [better-auth, session-store, sign-in, two-factor, gap-closure, G-15-14, playwright]
status: complete
gap_closure: true
gap_ids: [G-15-14]

requires:
  - phase: 15-access-hardening
    provides: 15-03 LoginForm second step and TwoFactorStep; 15-06 ProtectedRoute forced-enrollment redirect
provides:
  - refreshSession() in lib/auth-client.ts (awaits better-auth's own session-store refetch, never rejects)
  - LoginForm.completeSignIn (refresh, then navigate) shared by the password-only and two-factor success paths
  - TwoFactorStep.onSuccess may return a promise, awaited inside the submit so "Verifying..." lasts until the refresh finishes
  - Setup wizard step 1 auto-login refreshes the session store before step 2
  - Contract test against the real better-auth client plus Playwright journeys that start signed out at /
affects: []

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low
actuals:
  tokens: 6900    # chars/4 over the realized diff (27574 chars)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: d26339b02a1984c7d37c47a11a47d30bf9edc331
plan_head_after: 1177c23f5122f7b3e833fdf794cba4c6f9f2fe12

tech-stack:
  added: []
  patterns:
    - "Await the session store's own refetch (authClient.$store.atoms.session value's refetch()) before navigating into a protected route, instead of relying on better-auth's deferred 10 ms toggle"
    - "Narrow loosely typed third-party store values with a module-private type guard instead of casts"

key-files:
  created:
    - client/test/unit/lib/auth-client.test.ts
  modified:
    - client/src/lib/auth-client.ts
    - client/src/routes/auth/components/login-form.tsx
    - client/src/routes/auth/components/two-factor-step.tsx
    - client/src/routes/setup.tsx
    - client/test/unit/routes/auth/components/login-form.test.tsx
    - client/test/unit/routes/auth/components/two-factor-step.test.tsx
    - client/test/integration/auth.spec.ts
    - client/test/integration/two-factor.spec.ts
    - client/test/integration/setup-wizard.spec.ts

key-decisions:
  - "refreshSession() is a silent no-op when the store shape is not the expected one; the real-client contract test fails in CI after a better-auth upgrade that changes it, so the no-op cannot ship unnoticed"
  - "ProtectedRoute and signup-form are untouched: ProtectedRoute is correct once the store is fresh, and sign-up cannot succeed in production once a user exists"
---

# Phase 15 Plan 07: Single sign-in lands in the app (G-15-14) Summary

A sign-in now refreshes better-auth's session store before navigating, so one sign-in is enough after a signed-out visit to `/`: `refreshSession()` awaits the store's own refetch of `GET /api/auth/get-session`, and every sign-in call site that leads into a protected route awaits it first.

## What was built

- **Task 1 (tracer, `f19f698`)** - `refreshSession()` in `auth-client.ts`; `LoginForm.completeSignIn` awaits it and then calls `navigate("/")` (the only `navigate("/")` in the file). The button stays on "Signing in..." until navigation. A contract test runs the REAL better-auth client against a stubbed `fetch` and pins the root cause (the store is still `{data: null, isPending: false}` when `signIn.email` / `twoFactor.verifyTotp` resolve, and holds the signed-in session right after `await refreshSession()`), plus the failure case (a rejecting fetch leaves `refreshSession()` resolved and the store signed out). LoginForm unit tests assert refresh-before-navigate order and that failed sign-ins (401, 429) and `twoFactorRedirect` never refresh. Playwright journey in `auth.spec.ts` starts at `/` while signed out, signs in once and expects the Dashboard.
- **Task 2 (`449c904`)** - `TwoFactorStepProps.onSuccess` is `void | Promise<void>` and `onSubmit` does `await onSuccess()`, so react-hook-form's `isSubmitting` ("Verifying..." and disabled) lasts until the parent's refresh and navigation finish. LoginForm passes `completeSignIn` as `onSuccess`. Unit tests cover the authenticator-code and recovery-code pending states, the LoginForm two-factor order test, and the expired-challenge path not refreshing. Playwright TOTP journey starting at `/`.
- **Task 3 (`1177c23`)** - `handleStep1` in `setup.tsx` awaits `refreshSession()` between the auto-login `signIn.email` and `setCurrentStep(2)`. `mockStep1` in `setup-wizard.spec.ts` stubs `get-session` (the fixtures guard fails unstubbed `/api/**` requests) and returns a request-count getter; the auto-login test asserts it.

## Verification run

- `yarn workspace @docktor/client test` on `auth-client.test.ts`, `login-form.test.tsx`, `two-factor-step.test.tsx`, `protected-route.test.tsx` (D-01 regression): all pass (43 tests across the last three files, 3 in the contract test). RED runs were observed before each implementation (Task 1: 4 failures; Task 2: 3 failures).
- `playwright test --list`: auth.spec.ts 7 tests, two-factor.spec.ts 12 entries, setup-wizard.spec.ts 24 tests; all load.
- Task 3 line-order awk check and mockStep1 spec check both exit 0. Acceptance greps all match the plan.
- Setup: `yarn install --immutable` (via `corepack yarn`, lockfile-pinned, no packages added) was run once because the worktree had no `node_modules`.

## Skipped heavy verification (per user constraint)

- `yarn workspace @docktor/client exec tsc -b` (plan Tasks 1-3 verify) was NOT run: the user forbids full `tsc --build` on this host. New code uses no casts and no `any`; types are narrowed with a guard. CI `yarn typecheck` is the gate.
- Playwright journeys (auth, two-factor, setup-wizard) were listed but NOT executed; CI runs them. The race itself is proven locally by the contract test and the order tests.
- Full client unit suite was not run, only the targeted files above.

## Deviations from Plan

None - plan executed as written. The tsc and Playwright-run omissions above are the user's standing constraint, not plan deviations.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries; `refreshSession()` only triggers better-auth's own cookie-authenticated `GET /api/auth/get-session` (T-15-41, T-15-42 mitigated as planned).

## Manual re-test

UAT test 14 in `/gsd-verify-work`: open `/` while signed out, sign in once (with and without an authenticator code) and confirm landing in the app.

## Self-Check: PASSED

- Created/modified files exist (client/test/unit/lib/auth-client.test.ts and the nine modified files).
- Commits `f19f698`, `449c904`, `1177c23` present on the branch; `git rev-list --count d26339b..HEAD` was 3 before this SUMMARY commit.
