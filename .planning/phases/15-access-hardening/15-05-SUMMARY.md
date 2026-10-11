---
phase: 15-access-hardening
plan: 05
subsystem: client-account
tags: [two-factor, totp, qrcode, react-hook-form, useSyncExternalStore, account-page]

requires:
  - phase: 15-access-hardening
    provides: 15-02 GET /api/account/security + session revocation; 15-03 twoFactor client, rate-limit and auth-errors helpers
provides:
  - /account page (Security section, 2FA row) reached from the user-menu entry "Account"
  - useAccountSecurity shared store (createAccountSecurityStore, accountSecurityStore) for 15-06's ProtectedRoute
  - getAccountSecurity / setMandatoryTwoFactor API client
  - EnrollDialog (3 steps: password, recovery codes, QR + setup key + first code)
  - RecoveryCodesPanel (grid, Copy codes, Download .txt, "I have saved" gate) reusable by regenerate in 15-06
  - copyToClipboard (lib/clipboard.ts) and buildRecoveryCodesFile / downloadTextFile (lib/recovery-codes-file.ts)
affects: [15-06]

actuals:
  tokens: 16500
  tasks: 3
  commits: 3

tech-stack:
  added: ["qrcode.react@4.2.0"]
  patterns:
    - "Module-level external store + useSyncExternalStore so independent consumers share one status and one in-flight request"
    - "Dialog body mounted only while open: closing drops the totpURI, codes and form state without manual cleanup"
    - "createRetryAfterProbe: better-fetch onError captures X-Retry-After for the current attempt"

key-files:
  created:
    - client/src/lib/account-api.ts
    - client/src/lib/clipboard.ts
    - client/src/lib/recovery-codes-file.ts
    - client/src/hooks/use-account-security.ts
    - client/src/routes/app/account.tsx
    - client/src/routes/app/account/components/two-factor-section.tsx
    - client/src/routes/app/account/components/enroll-dialog.tsx
    - client/src/components/domain/auth/recovery-codes-panel.tsx
    - client/test/unit/lib/account-api.test.ts
    - client/test/unit/hooks/use-account-security.test.ts
    - client/test/unit/routes/account/account-page.test.tsx
    - client/test/unit/routes/account/enroll-dialog.test.tsx
    - client/test/unit/components/domain/auth/recovery-codes-panel.test.tsx
    - client/test/unit/components/nav-user.test.tsx
  modified:
    - client/src/router.tsx
    - client/src/components/nav-user.tsx
    - client/package.json
    - yarn.lock

key-decisions:
  - "Store keeps the known status on screen during a refetch (loading only while status is null); reset() bumps a generation counter so a response in flight at reset time is dropped"
  - "Clipboard helper toasts the UI-SPEC failure copy itself and returns a boolean; no execCommand fallback (deprecated); Download plus selectable text cover plain-http installs (resolves the UI-SPEC's open clipboard row)"
  - "Recovery codes file name literal stays in the panel; lib/recovery-codes-file.ts is generic (build text, download any text file)"

patterns-established:
  - "Rate-limited auth calls keep the typed value and show formatRetryAfter in the step's role=alert banner"

requirements-completed: ["#45"]

duration: n/a (two sessions, interrupted by a rate limit and the human checkpoint)
completed: 2026-10-11
status: complete
plan_head_before: 9f337e5df7ba0847d3b116f1bc21d0aceb76bfc2
plan_head_after: 19adacf6155a242c9dcb72c0cc98090522631f81
commits: 3
---

# Phase 15 Plan 05: Enrol in 2FA from the Account page Summary

**A signed-in user can open Account from the user menu, confirm their password, save 10 recovery codes (copy or download), scan a locally rendered QR code (or type the setup key) and verify the first code to turn on TOTP 2FA.**

## Performance

- **Tasks:** 3 of 3 (Task 2 was the blocking human checkpoint)
- **Commits:** `90caa8f` (Task 1, tracer), `6efbdd4` (Task 2 install), `19adacf` (Task 3). `commits:` counts the work up to `plan_head_after`; the SUMMARY docs commit comes after.

## Accomplishments

- Task 1 (tracer): account API client; `useAccountSecurity` shared store; `/account` route inside the protected layout; user-menu "Account" item (UserRound) above "Sign out"; page orchestrator (60 lines) with Skeleton / destructive Alert + Retry / populated states; `TwoFactorSection` with the Enabled / Not enabled pill and copy; 3-step `EnrollDialog` (outside click and Escape blocked on steps 2-3, only "Cancel setup" closes; state dropped on close); `RecoveryCodesPanel`.
- Task 2 (checkpoint): see below. Installed `qrcode.react@4.2.0`.
- Task 3: `QRCodeSVG` (176 px, level M, no margin) in an 8 px white box with role img and the accessible name; "Copy setup key" icon button; Copy codes ("Copied" for 2 s, timer cleared on unmount) and Download .txt (`docktor-recovery-codes.txt`, UI-SPEC content, object URL revoked); guarded clipboard with the failure toast; 429 handling on the password and verify steps (typed value kept, dialog stays open); `max-h-[90vh] overflow-y-auto` dialog and full-width stacked footer buttons below sm.

## Checkpoint answer (Task 2, T-15-SC)

Human reply, verbatim: **"Approved"** (qrcode.react legitimacy), received before any install. The install was the first dependency change: `git diff --stat HEAD -- client/package.json yarn.lock` was empty when the checkpoint was raised.

Installed version: **qrcode.react 4.2.0** (`^4.2.0` in `client/package.json`). The lockfile diff adds only that package (peer dependency react ^16.8 through ^19, no runtime dependencies); its package scripts are build-only, no preinstall / install / postinstall.

## Verification

Run locally (targeted only, per the no-heavy-local-actions rule):

- `vitest run` on the six plan test files plus the new tests: 6 files, 58 tests passed (account-api 3, store/hook 15, recovery-codes-panel 10, nav-user 3, account-page 6, enroll-dialog 21).
- `tsc --noEmit -p client/tsconfig.json`: no errors in any file touched by this plan.
- Acceptance greps all as required: `account.tsx` 60 lines; `path="/account"` 1; `to="/account"` 1; `useSyncExternalStore` present; no `apiFetch`/`fetch(` and no `localStorage`/`sessionStorage`/`console.` in the components; no `<Card` in the page; `QRCodeSVG` present; no remote QR URL; `docktor-recovery-codes.txt` 1; `bg-white` present; `execCommand` 0; `"qrcode.react"` in `client/package.json`.

**Skipped locally, left to GitHub Actions CI:** full `yarn typecheck` / `tsc --build`, type-checking of the test files (client tsconfig includes only `src`), `yarn install --immutable` (the lockfile was updated with `yarn install --mode=update-lockfile`, which does not link), Playwright, coverage reporting.

## Outstanding

- **Real-authenticator human-check (Task 3, VALIDATION.md manual-only row) is NOT done.** Run the branch, open Account, start "Set up two-factor authentication", scan the QR with a real authenticator (Aegis, 1Password or Google Authenticator) in both light and dark theme, enter the code. Expected: entry named Docktor with the account email, the code verifies, status becomes Enabled, a later sign-in asks for the code, and the QR scans as easily in dark theme.
- The Playwright mobile-chromium overflow backstop lands in 15-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started on a stale base and had no node_modules**
- **Issue:** worktree HEAD predated the Phase 15 commits; no `node_modules`, no `shared/dist`.
- **Fix:** fast-forwarded to `9f337e5`; created an untracked, gitignored `node_modules` of symlinks to the main checkout's packages (with `@docktor/*` pointing at the worktree) and built `shared/dist`. After the install, the new package was unpacked into that worktree-local `node_modules/qrcode.react` from the registry tarball, so the main checkout's `node_modules` was never modified. Nothing from this setup is committed.

**2. [Rule 3 - Blocking] `yarn` not on PATH**
- **Fix:** used `corepack yarn` (the pinned `yarn@4.13.0` from `packageManager`) with `install --mode=update-lockfile` after adding the dependency line to `client/package.json`, instead of `yarn workspace add`, because a linking install in a worktree whose `node_modules` is symlinked to the main checkout could have rewritten the main checkout's packages. The result is the same `package.json` + `yarn.lock` change `yarn add` produces.

### Notes (not deviations)

- Between the Task 1 and Task 3 commits, step 3 showed the "Scan the QR code" title and copy with only the setup key (no QR yet), as the Task 1 behavior block specified.
- `lib/clipboard.ts` and `lib/recovery-codes-file.ts` are small additions beyond the plan's file list; the clipboard helper is shared by the panel and the setup-key button, and the file builder is pure and unit-tested through the panel.
- The page keeps the loading / error / populated states inline (no helper components) because 15-06 composes `TwoFactorSection` and the new rows directly inside `account.tsx`.
- One test (Copy codes "Copied" revert) uses `fireEvent` instead of `userEvent` because user-event's internal timers deadlock under vitest fake timers.

## Known Stubs

None. Regenerate / Disable buttons are intentionally absent in the enabled state: they are 15-06's scope (the plan only requires no "Set up" button there).

## Threat Flags

None beyond the plan's threat model. T-15-32 (QR rendered locally, no remote QR URL, grep gate), T-15-33 (totpURI and codes only in dialog state, unmounted on close, no storage or console output, unit test asserts the reset), T-15-35 (steps 2-3 ignore outside click / Escape, Continue gated on "I have saved", 2FA only enabled after the first code verifies), T-15-36 ("Set up" only when `twoFactorEnabled` is false) and T-15-SC (blocking-human checkpoint before install, lockfile pinned) are mitigated as specified. T-15-34 accepted as planned.

## Self-Check: PASSED

- Files present: the fourteen created and four modified files listed in the frontmatter (verified by the passing test run, typecheck and greps above).
- Commits `90caa8f`, `6efbdd4`, `19adacf` exist on the branch (`git rev-list --count 9f337e5..HEAD` = 3 before this docs commit).
