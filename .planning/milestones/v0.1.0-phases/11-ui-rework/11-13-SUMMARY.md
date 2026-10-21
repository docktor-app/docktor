---
phase: 11-ui-rework
plan: 13
subsystem: client-ui
tags: [playwright, mobile, responsive, dark-mode, accessibility, documentation, todo-closure]
requires:
  - phase: 11-ui-rework
    provides: "Every earlier plan's responsive/D-08/D-03 work (11-01 through 11-12) — this plan proves it phase-wide and fixes what's left."
provides:
  - "client/playwright.config.ts's mobile-chromium project (Pixel 7 device descriptor, matches only mobile.spec.ts)"
  - "client/test/integration/mobile.spec.ts — 12 phone-width regression tests covering every core flow"
  - "Two fix-now responsive bugs closed: EnvEditor's grid-item min-width overflow (Create Stack + Config tab), setup wizard's WizardStepper overflow"
  - "Dark-mode contrast fixes: migration-wizard.tsx, certificates-card.tsx, first-run-gate.tsx"
  - "GitHub issue #71 (Bug, area:client) — icon-only 44px touch-target follow-up"
  - "CLAUDE.md's Known Refactoring Targets, Page Composition example list and Frontend UI guidance updated to match the finished Phase 11 architecture"
  - "Six folded 2026-08-28 todos closed with Resolution sections"
affects: [12, 14, 15]
actuals:
  tokens: 12883
  tasks: 3
  commits: 3
plan_head_before: 046a86741c85a60e6dd4d5fcb89adb34f3dcd293
plan_head_after: 8968229b775a6ecbb3426966a7d03836eb47d24e
tech-stack:
  added: []
  patterns:
    - "mobile-chromium Playwright project (Pixel 7 device descriptor) as a parallel, non-overlapping project to desktop chromium — testMatch/testIgnore keep the two suites mutually exclusive on mobile.spec.ts"
    - "expectNoHorizontalOverflow(page) helper polling document.documentElement.scrollWidth - clientWidth, used as the closing assertion in every mobile test"
    - "min-w-0 on a flex/grid item's own wrapper as the fix for a shadcn grid/flex ancestor's default min-width:auto sizing to min-content — applied to EnvEditor's wrapper and defensively to Page"
tech-stack-hint: none
key-files:
  created:
    - client/test/integration/mobile.spec.ts
  modified:
    - client/playwright.config.ts
    - client/src/components/common/layout/page.tsx
    - client/src/components/domain/auth/first-run-gate.tsx
    - client/src/components/domain/stack/env-editor.tsx
    - client/src/routes/app/settings/components/certificates-card.tsx
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/routes/setup/components/wizard-stepper.tsx
    - client/src/components/common/tone-badge.tsx
    - CLAUDE.md
    - .planning/todos/completed/2026-08-28-frontend-refactor-audit.md
    - .planning/todos/completed/2026-08-28-redesign-ui-ux-service-colors-mobile.md
    - .planning/todos/completed/2026-08-28-redesign-dashboard-statistics.md
    - .planning/todos/completed/2026-08-28-update-available-badge-missing-at-stack-level.md
    - .planning/todos/completed/2026-08-28-update-badge-shown-with-null-latest-tag.md
    - .planning/todos/completed/2026-08-28-add-yaml-env-editor.md
key-decisions:
  - "EnvEditor's horizontal overflow root-caused to shadcn FormItem's `grid gap-2` giving grid items a default min-width:auto (min-content sizing) — fixed with min-w-0 on EnvEditor's own wrapper div rather than touching FormItem (a shadcn-managed file), so the table's pre-existing overflow-x-auto wrapper can actually scroll"
  - "WizardStepper's overflow root-caused to setup.tsx's `flex flex-col items-center` sizing flex items via fit-content when items-center is set — fixed with w-full plus the same -mx-1 overflow-x-auto px-1 scrolling-tab-list pattern already used by the stack detail/Settings tabs, rather than inventing a new pattern"
  - "Icon-only touch targets (StackActions trigger, ThemeToggle, CertificatesCard delete, TablePagination's four nav buttons) triaged as issue-not-fix-now: all remain clickable at phone width, none break a core flow — filed as GitHub issue #71 rather than expanded into a Rule-2 fix, per the plan's own fix-now definition"
  - "tone-badge.tsx's doc comment reworded (paraphrase, no behavior change) so it no longer contains the literal string the D-08 gate greps for — the comment was describing the CSS classes, not declaring them, and was a false positive on the gate"
  - "Settings cards' ad-hoc useState form state (flagged by 11-11-SUMMARY.md) recorded as CLAUDE.md's new residual Known Refactoring Target rather than fixed in this plan — a form-library migration is architectural scope, out of bounds for an audit-and-gate-verification plan"
patterns-established:
  - "CLAUDE.md's Known Refactoring Targets table now tracks component-level (not page-level) debt — the three page-file monoliths it used to track are closed; the table points at the five ad-hoc-useState Settings cards instead"
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-17 (full component-by-component responsive audit with fix-now vs follow-up-issue triage), verifies D-03/D-08 phase-wide, updates CLAUDE.md's Known Refactoring Targets and UI guidance for the reworked patterns, and closes the six folded todos."
coverage:
  - id: D1
    description: "A Playwright mobile-chromium project (Pixel 7) runs 12 tests covering every core flow (dashboard, sidebar nav, stacks list, setup wizard, stack detail all 5 tabs, Config edit+save, Logs, Backups dialog, Proxy dialog, backup detail, settings 4 tabs, create stack) with no page-level horizontal overflow"
    requirement: "D-17; GH-15"
    verification:
      - kind: automated_ui
        ref: "client/test/integration/mobile.spec.ts (12/12 pass, mobile-chromium project)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every page and shared component audited at 390-412px in light and dark mode; core-flow breaks fixed inline, cosmetic findings filed as a GitHub issue"
    requirement: "D-17; UI-SPEC Discretion Decision 5"
    verification:
      - kind: automated_ui
        ref: "client/test/integration/mobile.spec.ts — assertions added for both fix-now findings (EnvEditor overflow, WizardStepper overflow)"
        status: pass
      - kind: manual
        ref: "GitHub issue docktor-app/docktor#71 filed for the one cosmetic finding (icon-only touch targets)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full 390px light/dark-mode component audit walkthrough across dashboard, stack detail (all 5 tabs, both dialogs), backup detail, settings"
    requirement: "D-17 human-check"
    verification: []
    human_judgment: true
    rationale: "Visual/UX adequacy judgment across the full app at phone width in both themes needs human eyes to confirm nothing reads as cut off or illegible beyond what automated overflow/visibility assertions can check — deferred to end-of-phase UAT per this project's human_verify_mode=end-of-phase convention, per the plan's own <human-check> verification step."
  - id: D4
    description: "D-08 (no hand-rolled pill markup outside components/ui) and D-03 (no Card usage on stack-management surfaces) hold phase-wide, not just per-plan"
    requirement: "D-08; D-03; GH-15"
    verification:
      - kind: automated
        ref: "grep -rn 'rounded-full px-2 py-0.5' client/src --include=*.tsx | grep -v components/ui (0 hits); grep -rln '<Card' on stack-management surfaces (0 hits)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Page-size gate: [id].tsx, [backupId].tsx, dashboard.tsx, settings.tsx all within their line budgets"
    requirement: "GH-15"
    verification:
      - kind: automated
        ref: "wc -l: [id].tsx=90 (<=90), [backupId].tsx=88 (<=90), dashboard.tsx=68 (<=80), settings.tsx=72 (<=80)"
        status: pass
    human_judgment: false
  - id: D6
    description: "CLAUDE.md's Known Refactoring Targets table no longer lists the three closed page monoliths, records residual targets, and Frontend UI guidance names the new shared patterns"
    requirement: "GH-15"
    verification:
      - kind: automated
        ref: "grep -c 'routes/app/stacks/\\[id\\].tsx.*587' CLAUDE.md = 0; grep -c ToneBadge/UnsavedChangesGuard/PLAYWRIGHT_PORT CLAUDE.md >= 1 each"
        status: pass
    human_judgment: false
  - id: D7
    description: "The six folded todos are moved to .planning/todos/completed/ with a Resolution section naming the closing plans/decisions"
    requirement: "GH-15"
    verification:
      - kind: automated
        ref: "for-loop check: file exists in completed/, absent from pending/, contains '## Resolution' — all 6 pass"
        status: pass
    human_judgment: false
  - id: D8
    description: "Full client unit suite and typecheck pass; full Playwright integration suite (both projects) passes except pre-existing/environmental failures"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/client test: 60 files, 522 tests, 0 failed"
        status: pass
      - kind: unit
        ref: "yarn typecheck: 0 errors"
        status: pass
      - kind: automated_ui
        ref: "PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration: 111/113 passed (99 chromium + 12 mobile-chromium); 2 pre-existing/environmental failures documented below, not caused by this plan"
        status: pass
    human_judgment: false
duration: "~4h50m wall-clock across the plan (08:14-13:04, spanning a Claude usage-limit interruption between Task 2 and Task 3); this session's Task 3 work was ~50min"
completed: 2026-09-30
status: complete
---

# Phase 11 Plan 13: Phase Close-Out — Mobile Audit, Phase-Wide Gates, CLAUDE.md Update Summary

**Added a Playwright mobile-chromium regression project, ran the full D-17 component-by-component mobile/dark-mode audit (fixing two real overflow bugs and three dark-mode contrast issues, filing one touch-target follow-up issue), then verified the phase-wide D-03/D-08/page-size gates and brought CLAUDE.md and six folded todos up to date with the finished Phase 11 architecture.**

## Performance
- **Duration:** ~4h50m wall-clock (08:14-13:04), spanning a Claude usage-limit interruption between Task 2 and Task 3 — Task 3 itself was executed in one continuous session of roughly 50 minutes
- **Tasks:** 3
- **Files modified:** 16 (1 created, 15 modified/moved)
- **Commits:** 3

## Accomplishments
- **Task 1:** Added a `mobile-chromium` Playwright project (Pixel 7 device descriptor) that runs only `mobile.spec.ts`, mutually exclusive with the desktop `chromium` project via `testMatch`/`testIgnore`. Wrote 11 initial phone-width regression tests covering every core flow named in the plan, closing with an `expectNoHorizontalOverflow(page)` assertion. The first run surfaced one real finding (Create Stack page overflowing ~50px) — left unweakened, as the plan instructed, to feed Task 2's audit.
- **Task 2:** Audited every component in the plan's checklist at 390-412px in both light and dark mode. Found and fixed two core-flow-breaking overflow bugs (EnvEditor, WizardStepper) and three dark-mode contrast issues, each backed by a new or existing `mobile.spec.ts` assertion. Ran the dark-mode sweep grep and justified its two remaining hit families (log terminal, status dots). Filed GitHub issue #71 for the one cosmetic finding (icon-only touch targets under 44px).
- **Task 3:** Ran all four phase-wide gate commands (D-08/D-03 markup gate, page-size gate, folded-todo closure gate, full unit+typecheck+E2E suite) — all green except two pre-existing/environmental E2E failures, both investigated and confirmed out of scope. Updated CLAUDE.md's Known Refactoring Targets, Page Composition example list, and Frontend UI guidance. Closed the six folded 2026-08-28 todos with Resolution sections. Corrected GitHub issue #71's title to drop the deprecated `[BUG]` prefix.

## Mobile/Dark-Mode Audit Table (Task 2)

Checklist from the plan, audited at 390-412px in light and dark mode. Verdict key: **pass** = no finding; **fix-now** = core-flow break fixed inline this plan; **issue** = cosmetic finding filed as a GitHub issue.

| Component | Verdict | Notes / Issue |
|---|---|---|
| Login | pass | No findings |
| Signup | pass | No findings |
| Setup wizard — WizardStepper (6-step nav) | **fix-now** | `setup.tsx`'s `flex flex-col items-center` gave the stepper nav fit-content sizing with no explicit width, forcing ~163-167px of page overflow at phone width. Fixed with `w-full` on the nav plus the existing `-mx-1 overflow-x-auto px-1` scrolling-tab-list pattern (already used by the stack detail/Settings tabs). Covered by a new `mobile.spec.ts` test. |
| Setup wizard — migration-wizard.tsx (`AlertTriangle`) | **fix-now** | Dark-mode contrast: added a `dark:` variant to a light-only color utility. |
| Setup wizard — first-run-gate.tsx | **fix-now** | Dark-mode contrast: converted hardcoded `text-gray-500` to the semantic `text-muted-foreground` token. |
| AppSidebar (mobile sheet) | pass | Covered by the sidebar navigation mobile test |
| PageHeader (breadcrumb/toggle row, title/actions row) | **fix-now (defensive)** | `Page` (`components/common/layout/page.tsx`) is a flex item of shadcn's un-editable `SidebarInset`; given a defensive `min-w-0` since flex items without it can force overflow the same way EnvEditor's grid-item did. Not a live finding, a preventive fix while the root-cause pattern was fresh. |
| Dashboard (StatCard grid, recent stacks table) | pass | 6 stat cards confirmed visible, no overflow |
| Stacks list (DataTable + pagination) | issue | `TablePagination`'s four icon-only nav buttons — see #71 |
| Create stack (compose editor, env editor, buttons) | **fix-now** | See EnvEditor finding below — same root cause, same fix, applies to both Create Stack and Config tab |
| Import page (brownfield import card) | pass | No findings |
| Stack detail header (title, badges, Deploy + actions menu) | issue | `StackActions` trigger icon-only button — see #71 |
| Tab list (stack detail) | pass | Existing scrolling-tab-list pattern already handles phone width |
| Overview (services table, activity timeline + filter) | pass | Timeline filter change confirmed working at phone width |
| Config (compose editor, env table/raw toggle, save buttons) | **fix-now** | EnvEditor's table is a grid item of shadcn's `FormItem` (`grid gap-2`), which gives grid items a default `min-width: auto` resolving to min-content size — the table's `whitespace-nowrap` cells plus `min-w-32`/`min-w-48` inputs never fit 390px, forcing ~50px of page overflow. Fixed with `min-w-0` on EnvEditor's own wrapper div so its existing `overflow-x-auto` table wrapper can actually scroll instead of widening the page. Covered by the Config-tab and Create-Stack `mobile.spec.ts` tests. |
| Logs (toolbar wrap, terminal) | pass | Service select and terminal both visible, no overflow |
| Backups (summary, schedule dialog, history table, snapshots table, restore dialog) | pass | Edit Schedule dialog's bounding box confirmed to fit the viewport |
| Proxy (domains table, assign/edit dialog, remove dialog) | pass | Assign Domain dialog's bounding box confirmed to fit the viewport |
| Service upgrade dialog | pass | No findings |
| Backup detail (metadata row, output) | pass | Both sections visible, no overflow |
| Settings — tab list | pass | Existing scrolling-tab-list pattern |
| Settings — certificates-card.tsx ("Expiring soon" badge) | **fix-now** | Dark-mode contrast: added a `dark:` variant. |
| Settings — certificates-card.tsx (delete button) | issue | Icon-only touch target — see #71 |
| Settings — other cards, timezone combobox | pass | No findings |
| Toasts (sonner) | pass | No findings |

**Dark-mode sweep** (`grep -rnE '(text|bg|border)-(gray|green|red|blue|yellow|orange|amber)-[0-9]{3}' client/src --include=*.tsx | grep -v 'dark:' | grep -v components/ui`) remaining hits, both justified:
- `log-terminal.tsx`'s two `text-gray-*` hits — the always-black terminal surface is an explicit plan exception (its background never switches with the app theme).
- `status-dot.tsx`'s five `bg-*-500` hits — solid filled status dots whose contrast doesn't depend on the surrounding theme the way text-on-background does (a green dot reads as "running" identically in light or dark).

## GitHub Issues Filed
- **#71** — "Several icon-only controls fall short of the 44px mobile touch-target minimum" (`area:client`, Issue Type: Bug). Covers `StackActions` trigger, `ThemeToggle`, `CertificatesCard` delete button, and `TablePagination`'s four nav buttons. All remain clickable at phone width; none break a core flow. Title corrected in this session to remove the deprecated `[BUG]` prefix (filed during Task 2's interrupted session with the legacy prefix still present) — now reads exactly per CLAUDE.md's native-Issue-Type convention.

## Gate Command Outputs (Task 3)

**Gate 1 — D-08 pill / D-03 Card:**
```
grep -rn 'rounded-full px-2 py-0.5' client/src --include=*.tsx | grep -v components/ui   → 0 hits (PASS)
grep -rln '<Card' [id].tsx, stacks/components/, stacks/backups/, dashboard.tsx           → 0 hits (PASS)
```
(tone-badge.tsx's own doc comment previously contained the literal grep string as prose describing the CSS classes — reworded to a paraphrase so the gate measures actual markup, not documentation. Pure comment change, folded into this plan's commit.)

**Gate 2 — page-size budgets:**
```
[id].tsx            90 lines (<=90)  PASS
[backupId].tsx       88 lines (<=90)  PASS
dashboard.tsx        68 lines (<=80)  PASS
settings.tsx         72 lines (<=80)  PASS
```

**Gate 3 — folded-todo closure:** all six todos present in `completed/`, absent from `pending/`, each containing `## Resolution` — PASS (see Todos section below).

**Gate 4 — full suite:**
```
yarn workspace @docktor/client test    → 60 files, 522 tests, 0 failed   PASS
yarn typecheck                          → 0 errors                       PASS
```

**Plus the plan's full E2E verification** (`PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration`, both projects):
```
99 chromium passed, 12 mobile-chromium passed, 2 chromium failed
```
The 2 failures, both investigated and confirmed pre-existing/environmental, not caused by this plan:
1. `config-unsaved-changes.spec.ts` — "tab switches do not prompt, but navigating away does" failed on a URL-mismatch after the full-suite run's host contention; **re-ran in isolation and it passed cleanly** (`PLAYWRIGHT_PORT=5183 yarn workspace @docktor/client test:integration --project=chromium config-unsaved-changes.spec.ts` → 1 passed). Matches this project's documented full-suite-run flakiness pattern (host resource pressure), not a defect this plan introduced.
2. `stacks.spec.ts` — "stack detail page shows stack info and services" failed on the exact pre-existing strict-mode duplicate-`"Running"`-text issue logged by 11-09 in `deferred-items.md` and already present in `.planning/WINDOWS.md` as entry #13 (phase 11, kind `deviation`, status `open`). Not re-logged per the objective's instruction.

## Task Commits
1. **Task 1: Phone-width regression coverage** - `81b81db` — completed by an earlier, interrupted session
2. **Task 2: Component-by-component mobile and dark-mode audit** - `59d3ab0` — completed by an earlier, interrupted session
3. **Task 3: Phase-wide gates, CLAUDE.md update and folded-todo closure** - `8968229` — completed by this session

## Files Created/Modified
- `client/playwright.config.ts` - added `mobile-chromium` project (Pixel 7), desktop `chromium` project ignores `mobile.spec.ts`
- `client/test/integration/mobile.spec.ts` - 12 phone-width regression tests, `expectNoHorizontalOverflow` helper
- `client/src/components/common/layout/page.tsx` - defensive `min-w-0` (flex item of `SidebarInset`)
- `client/src/components/domain/auth/first-run-gate.tsx` - dark-mode fix (`text-gray-500` → `text-muted-foreground`)
- `client/src/components/domain/stack/env-editor.tsx` - `min-w-0` fix for grid-item overflow (fix-now)
- `client/src/routes/app/settings/components/certificates-card.tsx` - dark-mode fix ("Expiring soon" badge)
- `client/src/routes/setup/components/migration-wizard.tsx` - dark-mode fix (`AlertTriangle`)
- `client/src/routes/setup/components/wizard-stepper.tsx` - `w-full` + scrolling-tab-list pattern fix (fix-now)
- `client/src/components/common/tone-badge.tsx` - doc-comment paraphrase (no behavior change, unblocks the D-08 gate's own grep)
- `CLAUDE.md` - Known Refactoring Targets, Page Composition example list, Frontend UI guidance all updated
- `.planning/todos/completed/2026-08-28-{frontend-refactor-audit,redesign-ui-ux-service-colors-mobile,redesign-dashboard-statistics,update-available-badge-missing-at-stack-level,update-badge-shown-with-null-latest-tag,add-yaml-env-editor}.md` - moved from `pending/`, Resolution sections added

## Closed Todos (Task 3)

| Todo | Resolution |
|---|---|
| `frontend-refactor-audit` | LogTerminal sharing → **11-08**; broader component extraction → **11-01/11-02/11-06/11-11** |
| `redesign-ui-ux-service-colors-mobile` | Badge/status colors → D-11 (**11-02, 11-06, 11-08**); tab merge → D-01/D-02 (**11-01**); mobile audit → D-17 (**11-13**) |
| `redesign-dashboard-statistics` | Stat card extraction → D-14 (**11-04**) |
| `update-available-badge-missing-at-stack-level` | Stack-level aggregation → D-09 (**11-02, 11-04, 11-05, 11-06**) |
| `update-badge-shown-with-null-latest-tag` | Digest-only vs discrete-tag distinction → D-10 (**11-02, 11-06**) |
| `add-yaml-env-editor` | Compose editor → D-18/D-19 (**11-09**); structured env editor → D-20/D-21/D-22 (**11-12**) |

## Decisions Made
See `key-decisions` in frontmatter. Highlights: both fix-now overflow bugs traced to the same underlying CSS mechanism (a flex/grid ancestor's default `min-width: auto` sizing a child to its min-content instead of shrinking it), fixed the same way (`min-w-0` on the affected component's own wrapper) rather than touching the shadcn-managed ancestor; the icon-only touch-target findings were triaged as issue-not-fix-now since none break a core flow; the Settings ad-hoc-`useState` form-state migration was left as a CLAUDE.md-tracked residual target rather than expanded into this plan's scope (architectural, out of bounds for an audit-and-gate plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tone-badge.tsx's doc comment false-positived the D-08 gate's own grep**
- **Found during:** the interrupted session, before Task 3 began (already committed as an uncommitted working-tree change when this session resumed)
- **Issue:** The doc comment literally contained the string `rounded-full px-2 py-0.5` as prose describing the shared pill size — Task 3's own gate command (`grep -rn 'rounded-full px-2 py-0.5' client/src --include=*.tsx | grep -v components/ui`) would have false-positived on this comment, not on actual hand-rolled markup.
- **Fix:** Reworded the comment to a paraphrase ("fully rounded, `text-xs`, the Badge component's own compact padding") with no change to the actual component behavior.
- **Files modified:** `client/src/components/common/tone-badge.tsx`
- **Commit:** `8968229` (folded into Task 3's commit, as instructed)

**2. [Rule 3 - Blocking] GitHub issue #71's title carried the deprecated `[BUG]` prefix**
- **Found during:** Task 3, verifying prior-session artifacts before starting gate work
- **Issue:** Issue #71 was filed during Task 2's interrupted session with a `[BUG]` title prefix — CLAUDE.md's Issue Tracking section explicitly says not to propagate the legacy `[BUG]`/`[FEATURE]` prefix pattern to new issues now that native Issue Types exist.
- **Fix:** `gh issue edit 71 --repo docktor-app/docktor --title "Several icon-only controls fall short of the 44px mobile touch-target minimum"` — stripped the prefix, left everything else (labels, body, native Issue Type) untouched.
- **Files modified:** none (GitHub issue metadata only)
- **Commit:** n/a (GitHub API call, not a repo change)

**3. [Interruption] Claude usage-limit error between Task 2 and Task 3**
- **Found during:** session boundary
- **Issue:** The executing session hit a weekly Claude usage limit after finishing Task 2's commit (`59d3ab0`) but before starting any Task 3 work — the interrupted session's last words were "Now let's run Task 3's gate commands to see current state."
- **Recovery:** This session verified both prior commits existed (`git log`), re-ran every gate command fresh rather than trusting any partial prior-session state, and confirmed the one uncommitted working-tree change (tone-badge.tsx) was the documented comment fix before folding it into Task 3's commit.
- **Impact:** None — zero work was lost; both Task 1 and Task 2's commits were already pushed to the branch.

**Total deviations:** 2 auto-fixed (Rule 1, Rule 3), 1 session-boundary interruption with no lost work.

## Issues Encountered

- `config-unsaved-changes.spec.ts` failed during the full E2E suite run but passed cleanly in isolation — confirmed a host-contention flake (this project's documented full-suite-run pattern under resource pressure), not a regression from this plan's changes. See Gate Command Outputs above.
- `stacks.spec.ts`'s duplicate-`"Running"`-text failure is the pre-existing issue already logged in `deferred-items.md` and `.planning/WINDOWS.md` entry #13 — confirmed present, not re-logged.

## User Setup Required
None - no external service configuration required.

## Human Verification Needed
- The full 390px light/dark-mode walkthrough from Task 2's `<human-check>` (dashboard → stack detail all 5 tabs and both dialogs → backup detail → settings, confirming nothing is cut off/illegible and the filed follow-up issues match what's seen) — deferred to end-of-phase UAT per this project's `human_verify_mode=end-of-phase` convention. Automated coverage (Playwright overflow/visibility assertions across all 12 mobile tests) is complete and green; this item is the remaining subjective visual-adequacy judgment call.

## Next Phase Readiness

Phase 11 complete — ready for phase verification.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-30*

## Self-Check: PASSED

All 17 created/modified files verified present on disk; all 3 commits (`81b81db`, `59d3ab0`, `8968229`) verified present in `git log --oneline --all`.
