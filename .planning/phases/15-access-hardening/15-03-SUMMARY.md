---
phase: 15-access-hardening
plan: 03
subsystem: auth
tags: [better-auth, totp, two-factor, rate-limit, react-hook-form, login]

requires:
  - phase: 15-access-hardening
    provides: 15-01 twoFactor server plugin, X-Retry-After 429s, totpChallengeSchema / recoveryChallengeSchema
provides:
  - better-auth twoFactorClient registered on the client, `twoFactor` exported from auth-client
  - readRetryAfterSeconds / formatRetryAfter / RETRY_AFTER_HEADER (client/src/lib/rate-limit.ts)
  - classifyAuthError / AuthErrorKind / AuthErrorLike (client/src/lib/auth-errors.ts)
  - TwoFactorStep (TOTP, recovery code, trust device) and LoginForm second-step flow
affects: [15-05, 15-06]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "better-fetch onError(context) fetch option captures response headers (X-Retry-After) for the current attempt; result error classified by classifyAuthError"
    - "Two react-hook-form instances (one per challenge mode) sharing the {code, trustDevice} shape; trust value carried across the mode switch"

key-files:
  created:
    - client/src/lib/rate-limit.ts
    - client/src/lib/auth-errors.ts
    - client/src/routes/auth/components/two-factor-step.tsx
    - client/test/unit/lib/rate-limit.test.ts
    - client/test/unit/lib/auth-errors.test.ts
    - client/test/unit/routes/auth/components/two-factor-step.test.tsx
  modified:
    - client/src/lib/auth-client.ts
    - client/src/routes/auth/components/login-form.tsx
    - client/test/unit/routes/auth/components/login-form.test.tsx

key-decisions:
  - "Error classification matches on code OR message (better-auth 1.4.18 always sets message); strings taken from the plugin error-code table"
  - "The login banner now has role=alert (accessibility, UI-SPEC)"
  - "Typed email/password are dropped (form.reset) as soon as the second screen shows"

patterns-established:
  - "Radix Checkbox in jsdom needs a local guarded ResizeObserver stub in the test file (same pattern as proxy-tab.test.tsx)"

requirements-completed: ["#45", "#46"]

duration: 25min
completed: 2026-10-11
status: complete
plan_head_before: 83d06a4dedbed9441172b6a2eff46c9a0224f119
plan_head_after: 90a101b707e57080f3423716c87e79b3e7dd57c2
commits: 2
---

# Phase 15 Plan 03: Login second step and rate-limit messaging Summary

**Login card now swaps to a two-factor screen (authenticator code or single-use recovery code, opt-in 30-day trusted device) on `twoFactorRedirect`, with precise wrong-code, expired-sign-in and "try again in N minutes" copy driven by `X-Retry-After`.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2 of 2
- **Commits:** `f6df263` (tracer), `90a101b`

## Accomplishments

- Task 1 (tracer): `twoFactorClient()` plugin and `twoFactor` export; `LoginForm` reads `{data, error}` from `signIn.email`, narrows `twoFactorRedirect` with an `in` check (no cast), resets the form and renders `TwoFactorStep`; TOTP form with digits-only input (`inputMode=numeric`, `autoComplete=one-time-code`, `maxLength=6`, autofocus), unchecked-by-default "Trust this device for 30 days" checkbox with helper text, "Back to sign in".
- Task 2: pure `rate-limit.ts` and `auth-errors.ts`; recovery mode (`Use a recovery code` / `Use authenticator app instead`, placeholder `xxxxx-xxxxx`, `autoComplete=off`, `spellCheck=false`, trimmed but never case-changed, lost-everything hint naming `docs/deployment.md`); classified outcomes: 429 -> `formatRetryAfter` (code kept, no retry), invalid code -> mode-specific copy and cleared input, expired -> `onExpired` -> password step with "Your sign-in timed out. Sign in again.", otherwise "Something went wrong. Try again."; password step shows the 429 wait time and keeps Sign in enabled.
- 53 unit tests across the four files (rate-limit 14, auth-errors 10, login-form 11, two-factor-step 18); every behavior bullet of both tasks is covered, including the 429, wrong/used code and pending-expired UI-SPEC rows.

## Verification

Run locally (targeted only, per the no-heavy-local-actions rule):

- `vitest run` for `rate-limit.test.ts`, `auth-errors.test.ts`, `login-form.test.tsx`, `two-factor-step.test.tsx`: 4 files, 53 tests passed. Task 1 files were run RED first (2 files failed) before implementation.
- `tsc --noEmit -p client/tsconfig.json`: no errors in files touched by this plan. Remaining errors are pre-existing and environmental (`@uiw/react-codemirror`, `@codemirror/*` not installed in the shared `node_modules` used here), unrelated to this plan.
- Acceptance greps all return the expected counts (twoFactorClient 2, twoFactorRedirect 1, one-time-code 1, X-Retry-After 1, toLowerCase/toUpperCase 0, console.log/info/debug 0, no `useState(...code...)`).

Skipped locally, left to GitHub Actions CI: full `yarn typecheck` / `tsc --build`, type-checking of the test files (client tsconfig only includes `src`), the Playwright `auth.spec.ts` suite, and coverage reporting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started on a stale base and had no node_modules**
- **Issue:** worktree HEAD predated the Phase 15 commits; no `node_modules`, `shared/dist` missing.
- **Fix:** fast-forwarded to `83d06a4`; created an untracked, gitignored `node_modules` of symlinks to the main checkout's packages (with `@docktor/*` pointing at the worktree workspaces) and built `shared/dist` locally. Nothing from this setup is committed.

**2. [Rule 3 - Blocking] Radix Checkbox needs ResizeObserver in jsdom**
- **Found during:** Task 1 first GREEN run (`ReferenceError: ResizeObserver is not defined`).
- **Fix:** added the same guarded `ResizeObserver` stub other client tests use to `login-form.test.tsx` and `two-factor-step.test.tsx` instead of editing the shared `test/setup.ts`.

**3. [Rule 1 - Bug] Inverted mode-switch label**
- **Found during:** Task 2 test run. The switch button first rendered the other mode's label; fixed to show the label that leaves the current mode. Folded into the Task 2 commit.

### Notes (not deviations)

- All second-step markup is in `two-factor-step.tsx` as planned; it holds two small non-exported helper components (`CodeInput`, `ChallengeFields`) rather than extra files, keeping to the plan's file list.
- Error strings used by `classifyAuthError` come from better-auth's error-code table. 15-01's integration tests were never executed locally, so the first CI run is the real confirmation that the server emits exactly these messages.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-15-19 (inputs use `one-time-code`/`off`, `spellCheck` false, no console output, codes live only in react-hook-form), T-15-20 (no auto-retry), T-15-21 (trim only, exact value asserted in a unit test) are mitigated as specified; T-15-22 transferred to the server.

## Self-Check: PASSED

- Files confirmed present: the six created and three modified files listed above.
- Commits `f6df263` and `90a101b` exist on the branch (`git rev-list --count 83d06a4..HEAD` = 2).
