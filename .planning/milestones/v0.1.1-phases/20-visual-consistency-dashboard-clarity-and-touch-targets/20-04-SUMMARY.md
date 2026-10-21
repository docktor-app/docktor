---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 04
subsystem: ui
tags: [react, forms, tailwind, react-hook-form, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "CONTEXT D-09 and UI-SPEC R-04 (form rhythm decisions)"
provides:
  - "FormStack and FormActions in client/src/components/common/form-layout.tsx: the single owner of the 8/16/24 form rhythm"
  - "Login, signup, two-factor challenge, create stack, health-probe form and all five setup-wizard steps on the shared primitives"
  - "FormActions dialog variant ready for the dialog and certificates adoption in plan 20-09"
affects: [20-09]

commits: 6
plan_head_before: 1d61f3503a5fcee70343a80a8499e6fa154bc6ab
plan_head_after: f3add431521ee349db6700da6a4e4e8a92394122

actuals:
  tokens: 18500
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Form layout: <form> carries no spacing class; FormStack is its single layout child; FormActions is FormStack's last child"
    - "Label-to-control 8px enforced from FormStack via the descendant rule [&_[data-slot=form-item]]:gap-2, leaving components/ui/form.tsx untouched"

key-files:
  created:
    - client/src/components/common/form-layout.tsx
    - client/test/unit/components/common/form-layout.test.tsx
    - client/test/unit/routes/auth/components/signup-form.test.tsx
    - client/test/unit/routes/setup/setup-step-layout.test.tsx
  modified:
    - client/src/routes/auth/components/login-form.tsx
    - client/src/routes/auth/components/signup-form.tsx
    - client/src/routes/auth/components/two-factor-step.tsx
    - client/src/routes/app/stacks/components/create-stack-form.tsx
    - client/src/routes/app/stacks/components/health-probe-form.tsx
    - client/src/routes/setup/components/account-step.tsx
    - client/src/routes/setup/components/backup-step.tsx
    - client/src/routes/setup/components/notifications-step.tsx
    - client/src/routes/setup/components/proxy-step.tsx
    - client/src/routes/setup/components/settings-step.tsx
    - client/test/unit/routes/auth/components/login-form.test.tsx
    - client/test/unit/routes/auth/components/two-factor-step.test.tsx

key-decisions:
  - "Label-to-input gap stays 8px (planner decision for RESEARCH Open Question 2); FormStack is the single place to change it"
  - "Setup steps keep one CardContent per form and put FormStack inside it; CardFooter is dropped so the field-to-button gap is the shared 24px instead of card padding"
  - "FormActions default align is start; the dialog variant ignores align and mirrors the shadcn DialogFooter layout"

patterns-established:
  - "New forms use FormStack + FormActions rather than space-y-* on the form element"

requirements-completed: [UI-05]
---

# Phase 20 Plan 04: One form spacing rule Summary

**`FormStack` (16px field to field, 8px label to control) and `FormActions` (24px last field to actions) in `components/common/form-layout.tsx` now own form spacing for login, signup, the two-factor challenge, create stack, the health-probe form and all five setup-wizard steps.**

## Performance

- **Tasks:** 3 (1 tracer, 2 auto), all TDD with separate `test(20-04)` RED commits before each `feat(20-04)` commit
- **Files:** 16 changed (4 new, 12 modified)

## Accomplishments

- Two generic primitives with a tested class-token contract (`align` start/end/between, `variant` inline/dialog).
- Login is the tracer slice; signup, two-factor (`ChallengeFields`), create stack and the health-probe form followed.
- The five wizard steps no longer split fields and buttons across `CardContent`/`CardFooter`; Back and Skip plus submit sit in `FormActions align="between"` with the same buttons and order as before (Account keeps its single full-width Next).
- `components/ui/` is unchanged since the pre-phase base; Settings cards were not migrated.

## Task Commits

1. Task 1 RED: `fd82210` test(20-04) primitives contract and login layout
2. Task 1 GREEN: `e1f76de` feat(20-04) FormStack/FormActions and login adoption
3. Task 2 RED: `b96976d` test(20-04) signup and two-factor layout
4. Task 2 GREEN: `6c87d5f` feat(20-04) signup, two-factor, create-stack, health-probe
5. Task 3 RED: `7f2f3c2` test(20-04) setup step layout
6. Task 3 GREEN: `f3add43` feat(20-04) setup wizard steps

## Verification

- Targeted vitest runs per task passed: form-layout, login-form, signup-form, two-factor-step, create-stack-page, health-probe-form, setup-step-layout, proxy-step, migration-wizard (existing login, two-factor, proxy-step, create-stack and health-probe tests unchanged and green).
- Acceptance greps: one `<FormStack` and one `<FormActions` per setup step; no `CardFooter` in setup steps; `align="between"` in backup-step; `git diff --quiet 7cc2dec -- client/src/components/ui` exits 0.

## Deferred Verification (per project resource constraint)

- `yarn typecheck` / `tsc --build`, the full unit suite and Playwright (`auth.spec.ts`, `setup-wizard.spec.ts`, `stacks.spec.ts`, `mobile.spec.ts`) were not run locally; they are left to GitHub Actions CI. The Playwright specs query by role and label, so the added wrapper divs should not affect them.
- Visual check (backstop, issue #92 acceptance): login, signup and one wizard step in light and dark on mobile and desktop reading with the same rhythm.

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None. Layout-only change; T-20-07 mitigated: resolvers, `FormMessage` elements and submit handlers are unchanged, and the new signup test asserts an invalid empty submit shows validation and does not call `signUp`.

## Notes

- `.planning/state.json` showed as modified before this plan started; it is not part of any task commit.
- The worktree branch name does not match the agent-branch allow-list in the executor's commit assertion; commits were made on the branch the orchestrator provisioned for this run.

## Self-Check: PASSED
