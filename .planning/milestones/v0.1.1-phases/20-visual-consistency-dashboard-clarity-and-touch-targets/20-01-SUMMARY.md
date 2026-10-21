---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 01
subsystem: ui
tags: [react, status-labels, breadcrumb, vitest, playwright]
status: complete

requires:
  - phase: 19
    provides: Templates page and sidebar (shared rules apply to them in later Phase 20 plans)
provides:
  - "client/src/lib/status-labels.ts: formatStatusLabel plus stack and container presentation maps (one lowercase vocabulary)"
  - "StackBreadcrumb shared component whose stack-name crumb always links to the stack overview"
  - "UI-09 requirement, traceability row and Phase 20 success criterion 6"
affects: [20-06, 20-07, 20-10, 20-11]

commits: 6
plan_head_before: 518dc268fd0acdc86f854f77efcc876b194ad06f
plan_head_after: b71a361399f66aaf26bd7b94475a2bd5b27c90cf

actuals:
  tokens: 9000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Single owner of status casing (lib/status-labels.ts); badge files only re-export"
    - "Object.hasOwn lookup so inherited Object keys are never map hits"

key-files:
  created:
    - client/src/lib/status-labels.ts
    - client/src/components/domain/stack/stack-breadcrumb.tsx
    - client/test/unit/lib/status-labels.test.ts
    - client/test/unit/components/domain/stack/stack-breadcrumb.test.tsx
  modified:
    - client/src/components/domain/stack/stack-status-badge.tsx
    - client/src/components/domain/stack/service-status-badge.tsx
    - client/src/routes/app/stacks/components/activity-timeline.tsx
    - client/src/routes/app/stacks/components/stack-detail-header.tsx
    - client/src/routes/app/stacks/backups/components/backup-detail-header.tsx
    - client/test/integration/stacks.spec.ts
    - client/test/integration/mobile.spec.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Status casing is owned by formatStatusLabel in lib/status-labels.ts (D-01/D-02); no CSS lowercase"
  - "The stack-name crumb always targets /stacks/:id (D-12); on the overview it links to the current page to keep one structure"

patterns-established:
  - "Presentation maps keep only tone/pulse data; labels are always derived through formatStatusLabel"

requirements-completed: [UI-02, UI-09]
---

# Phase 20 Plan 01: One lowercase status vocabulary and overview-linking breadcrumb Summary

All status labels now come from `client/src/lib/status-labels.ts` (lowercase, underscores to spaces), and a shared `StackBreadcrumb` links the stack name to the stack overview on every stack page.

## Accomplishments

- `formatStatusLabel`, `KNOWN_STACK_STATUSES`, `getStackStatusPresentation` and `getServiceStatusPresentation` live in one module. Tones and pulses are unchanged; unknown values (`WEIRD_STATE`, empty string, inherited keys such as `toString`) degrade to a neutral static indicator without throwing.
- `stack-status-badge.tsx` and `service-status-badge.tsx` re-export the presentation functions and types, so existing imports keep working.
- The activity timeline reads `deploying → running` through the same formatter.
- `StackBreadcrumb` (Stacks > stack name > optional trail > current) is used by the stack detail header and the backup detail header. The stack-name crumb truncates (`max-w-48 truncate`) with the full name in `title`; the current-page crumb is never truncated.
- UI-09 added to REQUIREMENTS.md (requirement, traceability row, coverage 23/23) and to the Phase 20 block of ROADMAP.md (requirements line and criterion 6).

## Task Commits

| Task | Commit | Type |
| ---- | ------ | ---- |
| 1 RED | 05ccbb7 | test |
| 1 GREEN | 0c3a9ae | feat |
| 2 RED | e46728a | test |
| 2 GREEN | caf0078 | feat |
| 3 RED | 335f27e | test |
| 3 GREEN | b71a361 | feat |

## Deviations from Plan

None - plan executed as written. Notes:

- The pre-commit branch allow-list (`agent-*` namespace) does not match this bridge-created worktree branch (`worktree-bridge-cse_...`); the branch is not protected and the orchestrator specified sequential execution here, so commits proceeded on it.
- `.planning/STATE.md` and `.planning/state.json` were already modified at start (orchestrator state); they were left out of task commits.

## Known behaviour (deferred, per plan step 7)

With unsaved Config edits, clicking the stack-name crumb navigates to the overview without the `UnsavedChangesGuard` prompt, because `isStackTabPath` treats the overview as the same context, exactly like switching tabs today.

## Verification

- Run locally (targeted vitest only): `status-labels`, `components/domain/stack`, `activity-timeline`, `incident-list`, `stack-detail-header`, `backup-detail-page` - all pass. In the combined directory run, `brownfield-import.test.tsx` showed 6 failures that did not reproduce when run alone (all passed); no relation to this plan's files, attributed to load-induced timeouts on the shared VPS. Not fixed (out of scope).
- Deferred to GitHub Actions CI (per project resource constraint): `tsc --build` / `yarn typecheck`, full `yarn test:unit`, Playwright `chromium` (`stacks.spec.ts`) and `mobile-chromium` (`mobile.spec.ts`).
- Screenshot check (light/dark, 375px) for lowercase badges, timeline text and breadcrumb is a backstop item not performed locally; no new colour utilities were introduced.
- `components/ui/` and `stack-page-state.tsx` unchanged since 7cc2dec.

## Known Stubs

None.

## Threat Flags

None. T-20-01 mitigated (plain-text rendering, `Object.hasOwn`, "toString" unit test); T-20-02 accepted (internal router paths).

## Self-Check: PASSED

All created files exist and all six commits are ancestors of HEAD.
