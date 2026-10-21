---
phase: 15-access-hardening
plan: 06
subsystem: client-account
tags: [two-factor, mandatory-2fa, forced-enrollment, protected-route, playwright, react-hook-form]

requires:
  - phase: 15-access-hardening
    provides: 15-02 requireAuth enrollment gate, account security API and 403 codes; 15-03 twoFactor client, rate-limit and auth-errors helpers; 15-05 useAccountSecurity store, EnrollDialog, RecoveryCodesPanel
provides:
  - MandatoryTwoFactorRow (pessimistic Switch + AlertDialog confirmation) and EnrollmentRequiredAlert on the Account page
  - ProtectedRoute forced-enrollment redirect to /account, per-user status reset, enrollment-required event listener
  - ApiError.code and ENROLLMENT_REQUIRED_EVENT dispatched by apiFetch on 403 TWO_FACTOR_ENROLLMENT_REQUIRED
  - RegenerateCodesDialog and DisableTwoFactorDialog (password re-entry), Disable guarded while the requirement is on
  - createRetryAfterProbe (lib/rate-limit.ts) and ErrorBanner / PasswordField / FOOTER_BUTTON_CLASS (dialog-form-parts.tsx) shared by the three password dialogs
  - default /api/account/security Playwright stub and client/test/integration/two-factor.spec.ts (desktop journeys + phone-width backstop)
affects: []

actuals:
  tokens: 22900
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Observer signal from the HTTP helper (CustomEvent on globalThis) so apiFetch stays free of routing; ProtectedRoute decides the redirect"
    - "Pessimistic Switch: checked always mirrors the server-confirmed status, no rollback logic"
    - "Disabled-with-reason control: Tooltip on a focusable wrapper span plus an sr-only description wired through aria-describedby"

key-files:
  created:
    - client/src/routes/app/account/components/mandatory-two-factor-row.tsx
    - client/src/routes/app/account/components/enrollment-required-alert.tsx
    - client/src/routes/app/account/components/regenerate-codes-dialog.tsx
    - client/src/routes/app/account/components/disable-two-factor-dialog.tsx
    - client/src/routes/app/account/components/dialog-form-parts.tsx
    - client/test/unit/routes/account/mandatory-two-factor-row.test.tsx
    - client/test/unit/routes/account/regenerate-codes-dialog.test.tsx
    - client/test/unit/routes/account/disable-two-factor-dialog.test.tsx
    - client/test/unit/components/domain/auth/protected-route.test.tsx
    - client/test/integration/two-factor.spec.ts
  modified:
    - client/src/routes/app/account.tsx
    - client/src/routes/app/account/components/two-factor-section.tsx
    - client/src/routes/app/account/components/enroll-dialog.tsx
    - client/src/components/domain/auth/protected-route.tsx
    - client/src/lib/api.ts
    - client/src/lib/rate-limit.ts
    - client/test/unit/lib/api.test.ts
    - client/test/unit/lib/rate-limit.test.ts
    - client/test/unit/routes/account/account-page.test.tsx
    - client/test/integration/fixtures.ts
    - client/playwright.config.ts

key-decisions:
  - "ProtectedRoute drops the shared status on sign-out and on a user change (ref of the last user id), instead of relying on a remount, because the layout route stays mounted across in-place sign-out/sign-in"
  - "ProtectedRoute fails open when the status fetch errors: the server (requireAuth 403) is the enforcement, the redirect is UX only (T-15-37)"
  - "two-factor.spec.ts is routed to both Playwright projects (mobile-chromium testMatch widened); each describe skips the other device with test.skip(({isMobile}) => ...)"
  - "createRetryAfterProbe moved from enroll-dialog.tsx into lib/rate-limit.ts and ErrorBanner/PasswordField extracted, rather than copying them into two more dialogs"

patterns-established:
  - "Password-confirmed Account dialog: body mounted only while open, react-hook-form + passwordConfirmSchema, classifyAuthError -> rate-limited banner / field error / generic banner"

requirements-completed: ["#45"]

duration: n/a
completed: 2026-10-11
status: complete
plan_head_before: ed6001a3f7f6f63198202e62050d0fb819bee546
plan_head_after: 0c034978dfee2159ba71ad5a64018787dae6127c
commits: 3
---

# Phase 15 Plan 06: Mandatory 2FA, forced enrollment and 2FA management Summary

**A user with 2FA can require it instance-wide from the Account page; anyone without it is steered to /account and into enrollment, and an enrolled user can regenerate recovery codes or disable 2FA after re-entering the password (never while the requirement is on).**

## Performance

- **Tasks:** 3 of 3, no checkpoints.
- **Commits:** `16de4e0` (Task 1, tracer), `9f70f9d` (Task 2), `0c03497` (Task 3). `commits:` counts the work up to `plan_head_after`; the SUMMARY docs commit comes after.
- Tracer gate (Task 1): the four Task 1 test files were re-run end to end after the commit and passed before Task 2 started (`Tracer verified end-to-end - expanding`).

## Accomplishments

- Task 1 (tracer): `MandatoryTwoFactorRow` (disabled Switch plus visible lockout helper for a caller without 2FA; AlertDialog "Require two-factor authentication?" before turning on; turning off applies at once; toasts per UI-SPEC; 4xx server message appended to the failure toast); `EnrollmentRequiredAlert` with the orange "Setup required" pill; `TwoFactorSection` `autoOpenEnroll` (ref-guarded, once per mount); `account.tsx` (74 lines) composes alert, section, Separator and the new row; `ApiError.code` and `ENROLLMENT_REQUIRED_EVENT`; `ProtectedRoute` redirect to `/account`, loading view while the status loads, store reset/refetch on a user change, event listener removed on cleanup; default `**/api/account/security` Playwright stub.
- Task 2: `RegenerateCodesDialog` (password, then 10 codes with the saved gate, Escape/outside click blocked on step 2, toast "Recovery codes regenerated."), `DisableTwoFactorDialog` (destructive confirm, field error on a wrong password, 429 message, server 403 shown in the banner, generic fallback), enabled-state buttons in `TwoFactorSection` with the Disable guard (disabled + `aria-disabled` + Tooltip on a focusable wrapper + `sr-only` reason via `aria-describedby`).
- Task 3: `two-factor.spec.ts` with TOTP sign-in (asserts `trustDevice: false` in the request body), the 429 message from `X-Retry-After`, enrollment from the Account page (user menu, 10 codes, QR role img, setup key, "Enabled" pill), forced enrollment (redirect, alert, auto-opened dialog, sidebar bounce) and the mobile overflow backstop for enrollment steps 2 and 3.

## Verification

Run locally (targeted only, per the no-heavy-local-actions rule):

- `vitest run` on `test/unit/routes/account`, `routes/auth`, `components/domain/auth`, `nav-user`, `lib`, `hooks/use-account-security`: 35 of 36 files, 390 tests passed. The one failing file (`test/unit/lib/yaml-syntax-linter.test.ts`) cannot resolve `@codemirror/lint`: the shared node_modules of the main checkout does not contain it. Pre-existing and unrelated to this plan.
- Plan test files individually: mandatory-two-factor-row 10, protected-route 10, api 15, account-page 14 (including the new cases), regenerate-codes-dialog 10, disable-two-factor-dialog 8, rate-limit (with the new probe cases), enroll-dialog 21 (still green after the refactor onto the shared parts).
- `tsc --noEmit -p client/tsconfig.json` (src only): no errors other than the same missing `@codemirror/*` modules. A throwaway tsconfig that also included the new test files reported only the jest-dom matcher typings (the setup file is not part of that ad hoc program); it was deleted.
- `playwright test --list test/integration/two-factor.spec.ts` with `PLAYWRIGHT_PORT=5187`: 10 entries (5 per project: the four desktop journeys are skipped on a mobile device and the backstop on desktop).
- Acceptance greps: `/api/account/security` in fixtures.ts 1; `ENROLLMENT_REQUIRED_EVENT` 2 in api.ts and 3 in protected-route.tsx; `to="/account"` 1; `useNavigate|window.location` in api.ts 0; account.tsx 74 lines; `generateBackupCodes` and `twoFactor.disable` present; `passwordConfirmSchema` in both dialogs; `sr-only` in two-factor-section.tsx; spec has 5 `test(`, `X-Retry-After`, `enrollmentRequired: true` and `scrollWidth`.

**Skipped locally, left to GitHub Actions CI:** full `yarn typecheck` / `tsc --build`, type-checking of test files, running Playwright (neither project, so the new spec and the default stub's effect on existing specs are unconfirmed until CI), coverage reporting.

## Outstanding

- The Playwright spec has never been executed. Points most likely to need adjustment if CI fails: the user-menu button locator (`/E2E Tester/`), `toBeInViewport` on the dialog buttons at 412 px, and whether better-auth refetches the session after `/two-factor/verify-totp` (relied on for the TOTP sign-in journey, as the existing sign-in spec relies on it for `/sign-in/email`).
- The real-authenticator manual check from 15-05 is still open.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] mobile-chromium project did not match two-factor.spec.ts**
- **Found during:** Task 3
- **Issue:** `playwright.config.ts` matched only `mobile.spec.ts` in `mobile-chromium` (and `chromium` ignored it), so the required phone-width backstop could not run anywhere. The plan's `files_modified` did not list the config, and `mobile.spec.ts` has no "project check" to reuse.
- **Fix:** widened `testMatch` to `/(mobile|two-factor)\.spec\.ts/` and made each describe skip the other device (`test.skip(({isMobile}) => ...)`).
- **Files modified:** `client/playwright.config.ts`, `client/test/integration/two-factor.spec.ts`
- **Commit:** `0c03497`

**2. [Rule 3 - Blocking] Worktree started on a stale base and had no node_modules**
- **Issue:** HEAD was at `f7e4805`, before the Phase 15 commits; no `node_modules`, no `shared/dist`.
- **Fix:** fast-forwarded to `ed6001a`; created an untracked, gitignored `node_modules` of symlinks to the main checkout's packages (`@docktor/*` pointing at this worktree), copied the already vetted `qrcode.react` from the sibling 15-05 worktree (no install, no network) and built `shared/dist`. Nothing from this setup is committed.

### Refactoring (CLAUDE.md "refactor when touching a module")

- Moved `createRetryAfterProbe` out of `enroll-dialog.tsx` into `lib/rate-limit.ts` (with unit tests) and extracted `ErrorBanner`, `PasswordField` and `FOOTER_BUTTON_CLASS` into `account/components/dialog-form-parts.tsx`, so the enroll, regenerate and disable dialogs share them. `enroll-dialog.test.tsx` stayed green. These files are beyond the plan's file list.

### Notes (not deviations)

- ProtectedRoute also resets the shared status on sign-out (no refetch), not only on a user switch; without it a same-user re-login would briefly show the previous session's status.
- Regenerate step 2 has a short `DialogDescription` ("Your old codes no longer work.") for Radix accessibility; the UI-SPEC does not define description copy for that step.
- The Disable guard wraps the disabled button in a focusable `span` for the Tooltip because disabled buttons swallow pointer and focus events.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-15-37 (redirect is UX only; fails open on a status error, covered by `protected-route.test.tsx`), T-15-38 (AlertDialog confirmation, pessimistic Switch), T-15-39 (both dialogs require the password; wrong password keeps the dialog open) and T-15-40 (new codes live in dialog state, dropped on close; Done gated on the saved checkbox; unit test for reopen) are mitigated as specified. T-15-SC: no package installs.

## Self-Check: PASSED

- Created files present (listing in frontmatter): verified with a file-existence check.
- Commits `16de4e0`, `9f70f9d`, `0c03497` exist on the branch; `git rev-list --count ed6001a..HEAD` = 3 before this docs commit.
