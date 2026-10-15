---
status: diagnosed
phase: 18-import-and-migration-flow
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md]
started: 2026-10-15T12:00:00Z
updated: 2026-10-15T15:48:21.865Z
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
result: pass
note: "Initially reported 'stack not found' (scan root not visible in container, see G-18-3-scan) and 'dialog is rather small'; user then confirmed: test 3 passed."

### 4. Review step shows a real line diff and masked .env
expected: Click "Preview Changes". Step 2 shows a unified line diff of the compose file with added lines marked green and removed lines red, plus "+N" / "−N" counters. If nothing changes it reads "No changes to your compose file." If the stack has a .env, it is shown in a read-only editor with secret values masked until you click "Show secret values".
result: issue
reported: "Test 4 also passed. however, the change is:\n  -     - ./data:/var/opt/memos\n+      - ./data:/var/opt/memos\ninstead of + /volume/data:/var/opt/memos"
severity: major

### 5. Backup step is explicit
expected: Step 3 is a dedicated backup step with a switch that is on by default. Turning it off shows a warning that no pre-migration backup will be made.
result: pass

### 6. Old-stack step and summary
expected: Step 4 has a "Stop the old stack" switch, on by default; turning it off warns about possible port conflicts. A "Migration summary" lists the stack name, volumes to copy, Backup Yes/No and Stop old stack Yes/No matching your choices. Back keeps all earlier choices.
result: pass
note: "User: pass, however Volumes to copy: 0. But this is probably related to the previous issue. (evidence attached to G-18-4)"

### 7. Migrate with backup on and old stack stopped
expected: With both switches on, click "Confirm & Migrate". A "Migrating {name}…" toast appears, then a success toast mentioning the kept backup and that the old stack was stopped. The new stack directory contains a pre-migration-backup folder, the old stack's containers are stopped, the new stack runs, and the original directory is unchanged.
result: blocked
blocked_by: prior-phase
reason: "Depends on G-18-4 (volume rewrite/copy). User: Doesnt it make sense to test this, when also the volume is copied correctly?"

### 8. Migrate with backup off and old stack left running
expected: Migrate another stack with both switches off. No pre-migration-backup folder is created in the new stack directory, and the old stack's containers keep running.
result: blocked
blocked_by: prior-phase
reason: "Depends on G-18-4 (volume rewrite/copy). User: Doesnt it make sense to test this, when also the volume is copied correctly?"

### 9. Phone-width layout
expected: At a phone width (~360px), the migration dialog fits horizontally without clipping, the diff on step 2 is visible and scrollable, footer buttons are full width, and "Confirm & Migrate" is reachable on step 4.
result: pass

## Summary

total: 9
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 2

## Gaps

- gap_id: G-18-2
  truth: "Import scan hides Docktor's own stack and offers every other stack for import"
  status: failed
  reason: "User reported: the docktor stack was ignored, but the stacks that were already added to docktor are not ignored. I think it is ok to list them, but disable the buttons."
  severity: major
  test: 2
  root_cause: "Neither the scan (OnboardingService.scan / BrownfieldScanner) nor the client compares scanned compose files against stacks Docktor already manages, so managed stacks are returned as ordinary importable rows with live Adopt/Migrate buttons. brownfield-import.tsx only flips a row to 'Imported' after an adopt/migrate in the current session (adoptedIds)."
  artifacts:
    - path: "server/src/application/onboarding-service.ts"
      issue: "scan() returns rows without a managed/already-imported flag"
    - path: "shared/src/validation/brownfield.ts"
      issue: "scan result row shape has no field for an existing managed stack"
    - path: "client/src/components/domain/stack/brownfield-import.tsx"
      issue: "Adopt/Migrate buttons enabled for every row; no 'Already managed' state"
  missing:
    - "Mark scan rows whose compose file (or stack directory) matches an existing managed stack, e.g. managedStackId/managedStackName"
    - "Keep such rows listed but disable Adopt/Migrate with an 'Already managed' indicator (link to the stack)"
    - "Server-side guard: adopt/migrate of an already-managed compose path is rejected with ConflictError"
  debug_session: ".planning/debug/scan-missing-unmanaged-stack.md"

- gap_id: G-18-3-scan
  truth: "A scan of a directory that does not exist inside the container tells the user so, instead of silently dropping it"
  status: failed
  reason: "User reported: the stack I tried to migrate was not found ... no error, only not showing the stack in the table. it is running with docker desktop and /run/desktop/mnt/host/c/... as stack directory volume mount. Resolved by user after moving the stack into the stacks folder: 'got it, moved it into the stack folder.'"
  severity: minor
  test: 3
  root_cause: "Confirmed by the user's workaround: the scan root was not reachable inside the container (host only visible via the stacks mount or /host/...). BrownfieldScanner counts ENOENT roots as skippedDirectories with only a server console.warn, and the client labels the count 'skipped (permission denied)' and shows it only when at least one stack was found. Predates phase 18."
  artifacts:
    - path: "server/src/infrastructure/brownfield-scanner.ts"
      issue: "ENOENT scan root silently counted as skipped; reason not returned"
    - path: "client/src/components/domain/stack/brownfield-import.tsx"
      issue: "Skipped note mislabelled 'permission denied', hidden when zero stacks; no /host path guidance"
  missing:
    - "Return per-directory skip reasons (not found / permission denied) from the scan"
    - "Always show them in the UI, with a hint about container-visible paths (/host/...)"
  debug_session: ".planning/debug/scan-missing-unmanaged-stack.md"
  clarification: "User clarified: no error, only not showing the stack in the table. It is running with docker desktop and /run/desktop/mnt/host/c/... as stack directory volume mount."
  artifacts: []
  missing: []

- gap_id: G-18-4
  truth: "The migration preview diff shows the compose rewrite the user selected (bind mount ./data rewritten to the new stack's data path, e.g. /volume/data:/var/opt/memos), without spurious whitespace-only changes"
  status: failed
  reason: "User reported: the diff renders, but the change is '-     - ./data:/var/opt/memos' / '+      - ./data:/var/opt/memos' (indentation-only change, path unchanged) instead of '+ /volume/data:/var/opt/memos'"
  severity: major
  test: 4
  related_evidence: "Test 6: migration summary shows 'Volumes to copy: 0' for the same stack, so the ./data bind mount was likely not selected/recognised for conversion at all"
  root_cause: "Two pre-phase-18 defects (Phase 5). (A) Relative bind mounts are never offered for conversion: ComposeAnalyzer detects ./data as type 'relative', but BrownfieldScanner.scan() keeps only absolute mounts in absolutePaths and DiscoveredStack has no relative field; MigrationWizard builds bindMountSelections and 'Volumes to copy' from absolutePaths + namedVolumes only, so volumeSelections is [] and nothing is rewritten or copied (new stack would start with empty ./data). Already flagged as 18-REVIEW WR-01. (B) ComposeRewriter.rewrite() always does yaml.parse + yaml.stringify, so the preview diff shows re-serialisation noise (sequence re-indent, dropped comments, requoting, CRLF->LF) instead of only the real change."
  artifacts:
    - path: "server/src/infrastructure/brownfield-scanner.ts"
      issue: "Lines 144-146 filter bindMounts to type 'absolute'; relative mounts discarded"
    - path: "shared/src/validation/brownfield.ts"
      issue: "DiscoveredStack DTO has no relative bind mount field (also client/src/lib/brownfield-types.ts)"
    - path: "client/src/routes/setup/components/migration-wizard.tsx"
      issue: "Lines 81-88, 114-116: selections and volumesToCopy built from absolutePaths only"
    - path: "client/src/routes/setup/components/migration-select-step.tsx"
      issue: "Only renders 'Absolute Bind Mounts'; no relative-mount rows or copy"
    - path: "server/src/infrastructure/compose-rewriter.ts"
      issue: "Lines 28, 131-133: lossy parse/stringify round-trip"
  missing:
    - "Return relative bind mounts from the scan and list them in step 1 (default on), counted in Volumes to copy, copied from <oldDir>/<rel> to the new stack"
    - "Rewrite compose via yaml parseDocument targeted edits so untouched lines stay byte-identical (comments, indentation, quoting, line endings); diff shows only real changes"
    - "Regression tests: relative-mount scan row, wizard selection/count, rewriter preserving formatting, preview diff containing only the real change"
  debug_session: ".planning/debug/migration-bind-mount-not-rewritten.md"
