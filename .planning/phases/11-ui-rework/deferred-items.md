# Deferred Items — Phase 11 (UI Rework)

Out-of-scope discoveries made during plan execution, logged per the executor's
scope-boundary rule rather than fixed inline (not caused by the discovering
plan's own file changes).

## 11-09: Duplicate "Running" text breaks strict-mode locator in stacks.spec.ts

- **Found during:** 11-09 Task 3 full E2E suite run (`stacks.spec.ts`)
- **Test:** `stack detail page shows stack info and services`
- **Symptom:** `page.getByText("Running", {exact: true})` resolves to 2
  elements — the header's `StackStatusBadge` (`stack-detail-header.tsx`) and
  a second "Running" label inside the Overview tab's activity/status pill
  (`overview-tab.tsx`'s `stackStatus` prop, added by 11-06's unified
  timeline). Both pre-date 11-09; neither file is in 11-09's `files_modified`
  list, and 11-09 makes no change to header/status/overview rendering — its
  scope is the Compose File editor only.
- **Impact:** This one pre-existing assertion in `stacks.spec.ts` fails on a
  strict-mode duplicate-match; every other test in the file (13/14, including
  all of 11-09's new/updated compose-editor coverage) passes cleanly.
- **Suggested resolution:** Either scope the assertion to a specific
  container (e.g. `page.locator('header').getByText("Running", {exact:
  true})`) or make the Overview pill's text distinguishable from the header
  badge — whichever plan next touches `overview-tab.tsx` or
  `stack-detail-header.tsx` (11-06's owning plan already shipped; file as a
  new GitHub issue per CLAUDE.md's issue-tracking process if no phase-11 plan
  claims it before phase close).
- **Status:** resolved
- **Resolution:** Applied the suggested fix — scoped the assertion to `page.locator("header").getByText("Running", {exact: true})` — in commit `a34d4c0`. This was reachable in real CI (failed deterministically, 3/3 attempts, on `feature/phase-11-ui-rework`'s pull request), not just a theoretical risk from local sandbox runs; fixed as part of closing out the phase's CI run rather than left for a future plan to claim.
