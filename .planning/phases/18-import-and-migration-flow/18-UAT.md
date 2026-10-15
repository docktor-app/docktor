---
status: partial
phase: 18-import-and-migration-flow
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md]
started: 2026-10-15T12:00:00Z
updated: 2026-10-15T14:58:41.644Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running Docktor instance and start it fresh from the release/v0.1.1 build. The server boots without errors, migrations complete, and the dashboard loads with your existing stacks.
result: pass

### 2. Import scan hides Docktor's own stack
expected: Open "Import existing stack" and scan the directory that holds Docktor's own compose file plus at least one other compose stack. Docktor's own compose file is not listed; every other stack (including a sibling compose file in the same directory) is listed. The setup wizard's scan behaves the same way.
result: issue
reported: "the docktor stack was ignored, but the stacks that were already added to docktor are not ignored. I think it is ok to list them, but disable the buttons."
severity: major

### 3. Migration dialog opens wide with step indicator
expected: Click Migrate on a scanned stack. The dialog opens noticeably wider than before (up to ~5xl on desktop), shows "Step 1 of 4" with a progress list, and step 1 lets you pick volumes/options with "Cancel Migration" and "Preview Changes" buttons. Header and footer stay pinned while the body scrolls.
result: issue
reported: "i am not able to test this, since the stack I tried to migrate was not found. I am not sure, whether this is a windows issue."
severity: blocker
clarification: "no error, only not showing the stack in the table. it is running with docker desktop and /run/desktop/mnt/host/c/... as stack directory volume mount."

### 4. Review step shows a real line diff and masked .env
expected: Click "Preview Changes". Step 2 shows a unified line diff of the compose file with added lines marked green and removed lines red, plus "+N" / "−N" counters. If nothing changes it reads "No changes to your compose file." If the stack has a .env, it is shown in a read-only editor with secret values masked until you click "Show secret values".
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

### 5. Backup step is explicit
expected: Step 3 is a dedicated backup step with a switch that is on by default. Turning it off shows a warning that no pre-migration backup will be made.
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

### 6. Old-stack step and summary
expected: Step 4 has a "Stop the old stack" switch, on by default; turning it off warns about possible port conflicts. A "Migration summary" lists the stack name, volumes to copy, Backup Yes/No and Stop old stack Yes/No matching your choices. Back keeps all earlier choices.
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

### 7. Migrate with backup on and old stack stopped
expected: With both switches on, click "Confirm & Migrate". A "Migrating {name}…" toast appears, then a success toast mentioning the kept backup and that the old stack was stopped. The new stack directory contains a pre-migration-backup folder, the old stack's containers are stopped, the new stack runs, and the original directory is unchanged.
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

### 8. Migrate with backup off and old stack left running
expected: Migrate another stack with both switches off. No pre-migration-backup folder is created in the new stack directory, and the old stack's containers keep running.
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

### 9. Phone-width layout
expected: At a phone width (~360px), the migration dialog fits horizontally without clipping, the diff on step 2 is visible and scrollable, footer buttons are full width, and "Confirm & Migrate" is reachable on step 4.
result: blocked
blocked_by: other
reason: "Blocked by test 3 (G-18-3): no unmanaged stack appears in the scan table, so the migration dialog cannot be opened. User: no, mark as blocked"

## Summary

total: 9
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 6

## Gaps

- gap_id: G-18-2
  truth: "Import scan hides Docktor's own stack and offers every other stack for import"
  status: failed
  reason: "User reported: the docktor stack was ignored, but the stacks that were already added to docktor are not ignored. I think it is ok to list them, but disable the buttons."
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-18-3
  truth: "Clicking Migrate on a scanned stack opens the wide four-step migration dialog"
  status: failed
  reason: "User reported: i am not able to test this, since the stack I tried to migrate was not found. I am not sure, whether this is a windows issue."
  severity: blocker
  test: 3
  clarification: "User clarified: no error, only not showing the stack in the table. It is running with docker desktop and /run/desktop/mnt/host/c/... as stack directory volume mount."
  artifacts: []
  missing: []
