---
status: diagnosed
phase: 18-import-and-migration-flow
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md]
started: 2026-10-15T12:00:00Z
updated: 2026-10-17T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running Docktor instance and start it fresh from the release/v0.1.1 build. The server boots without errors, migrations complete, and the dashboard loads with your existing stacks.
result: pass

### 2. Import scan hides Docktor's own stack
expected: Open "Import existing stack" and scan the directory that holds Docktor's own compose file plus at least one other compose stack. Docktor's own compose file is not listed; every other stack (including a sibling compose file in the same directory) is listed. The setup wizard's scan behaves the same way.
result: pass
note: "Re-test after gap closure (G-18-2): user confirmed."

### 3. Migration dialog opens wide with step indicator
expected: Click Migrate on a scanned stack. The dialog opens noticeably wider than before (up to ~5xl on desktop), shows "Step 1 of 4" with a progress list, and step 1 lets you pick volumes/options with "Cancel Migration" and "Preview Changes" buttons. Header and footer stay pinned while the body scrolls.
result: pass
note: "Initially reported 'stack not found' (scan root not visible in container, see G-18-3-scan) and 'dialog is rather small'; user then confirmed: test 3 passed."

### 4. Review step shows a real line diff and masked .env
expected: Click "Preview Changes". Step 2 shows a unified line diff of the compose file with added lines marked green and removed lines red, plus "+N" / "−N" counters. If nothing changes it reads "No changes to your compose file." If the stack has a .env, it is shown in a read-only editor with secret values masked until you click "Show secret values".
result: pass
note: "Re-test after gap closure (G-18-4): user confirmed."

### 5. Backup step is explicit
expected: Step 3 is a dedicated backup step with a switch that is on by default. Turning it off shows a warning that no pre-migration backup will be made.
result: pass

### 6. Old-stack step and summary
expected: Step 4 has a "Stop the old stack" switch, on by default; turning it off warns about possible port conflicts. A "Migration summary" lists the stack name, volumes to copy, Backup Yes/No and Stop old stack Yes/No matching your choices. Back keeps all earlier choices.
result: pass
note: "User: pass, however Volumes to copy: 0. But this is probably related to the previous issue. (evidence attached to G-18-4)"

### 7. Migrate with backup on and old stack stopped
expected: With both switches on, click "Confirm & Migrate". A "Migrating {name}…" toast appears, then a success toast mentioning the kept backup and that the old stack was stopped. The new stack directory contains a pre-migration-backup folder, the old stack's containers are stopped, the new stack runs, and the original directory is unchanged.
result: pass
note: "Re-test: user reported the other tests passed."

### 8. Migrate with backup off and old stack left running
expected: Migrate another stack with both switches off. No pre-migration-backup folder is created in the new stack directory, and the old stack's containers keep running.
result: pass
note: "Passed, but the new stack showed running because the old stack kept running under the same compose project name (G-18-22-status)."

### 9. Phone-width layout
expected: At a phone width (~360px), the migration dialog fits horizontally without clipping, the diff on step 2 is visible and scrollable, footer buttons are full width, and "Confirm & Migrate" is reachable on step 4.
result: pass

### 10. In-place migration of a same-name stack
expected: Migrate on a stack already in the stacks folder under the same name goes the in-place route (aside-name step, forced stop, original renamed to <name>-pre-migration).
result: issue
reported: "Toast: Migration refused: the new stack directory /home/raphael/workspace/docktor/dev-data/docktor/stacks/memos already exists."
severity: major

### 11. Discovered stacks card size
expected: The discovered-stacks table is readable without constant scrolling.
result: issue
reported: "please make the card with the discovered stacks bigger. I always need to scroll."
severity: minor

## Summary

total: 11
passed: 9
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-18-2
  truth: "Import scan hides Docktor's own stack and offers every other stack for import"
  status: resolved
  resolved_by: 18-13-PLAN
  resolved_at: 2026-10-17
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
  status: resolved
  resolved_by: 18-13-PLAN
  resolved_at: 2026-10-17
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
  status: resolved
  resolved_by: 18-10-PLAN
  resolved_at: 2026-10-17
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

- gap_id: G-18-7
  truth: "A stack that already lives in Docktor's stacks folder under the same name can be migrated in place"
  status: resolved
  resolved_by: 18-15-PLAN
  resolved_at: 2026-10-17
  reason: "User reported: Migration refused: the new stack directory /run/desktop/mnt/host/c/.../memos-migration and the old stack directory /run/desktop/mnt/host/c/.../memos-migration overlap. If the name doesnt change, it needs to be copied to something like memos-migration-backup (or let the user choose). If it changes, no backup needed, since the old directory still exists."
  severity: major
  test: 7
  root_cause: "MigrationService.checkTargetDirectory refuses whenever the slug's stack directory equals or overlaps the original directory; there is no in-place path. Correct as a safety guard, but the in-place case (stack already in the stacks folder, unchanged name) is a legitimate migration."
  artifacts:
    - path: "server/src/application/migration-service.ts"
      issue: "checkTargetDirectory overlap refusal; no move-aside flow"
    - path: "client/src/routes/setup/components/migration-backup-step.tsx"
      issue: "Backup step does not distinguish in-place vs renamed migrations"
  missing:
    - "In-place (target == original): rename original aside to <name>-pre-migration (user-editable, validated not to exist), build the new stack in the original directory, copy data from the renamed directory; renamed original is the backup (no extra copy); stopping the old stack is forced (same compose project name)"
    - "Rollback for in-place: remove the new directory and rename the original back, restart if stopped"
    - "Different name: original stays untouched, so the backup switch defaults to off with a note naming the original path; backup remains an explicit choice"
    - "Nested overlap (one inside the other, not equal) stays refused"
  user_decision: "Approved: rename-aside for same name (user can choose the name); backup default off with note when the name changes."

- gap_id: G-18-job
  truth: "A long migration (large volume copies, slow Docker Desktop mounts, image pulls) completes reliably and the user sees its progress"
  status: resolved
  resolved_by: 18-17-PLAN
  resolved_at: 2026-10-17
  reason: "User asked: Is the migration running in a job? It could take a lot of time."
  severity: major
  test: 7
  root_cause: "MigrationService.migrate runs synchronously inside POST /api/stacks/import/migrate and /api/setup/migrate (stop up to 120 s, unbounded copies, compose up with pulls). Proxy/browser timeouts make the client report failure while the server continues; no progress is shown; no per-slug in-flight guard."
  artifacts:
    - path: "server/src/routes/imports.ts"
      issue: "migrate handler awaits the whole migration"
    - path: "server/src/routes/setup.ts"
      issue: "migrate handler awaits the whole migration"
    - path: "server/src/application/migration-service.ts"
      issue: "No operation model, progress reporting or in-flight guard"
    - path: "client/src/components/domain/stack/brownfield-import.tsx"
      issue: "Single 'Migrating…' toast waiting on one long request"
  missing:
    - "Start migration as a one-off background operation: endpoint returns an operation id immediately (202)"
    - "Progress steps (stopping, copying <volume>, rewriting, deploying, done/failed with rollback message) streamed via the existing SSE/StateBroadcaster channel, consumed by a hook; dialog/toast shows them"
    - "Per-slug in-flight guard (ConflictError on a second migration of the same name); client disables Migrate/Adopt for in-flight rows"
    - "Operation status queryable after reconnect/reload"
  user_decision: "Approved for v0.1.1."

- gap_id: G-18-22-inplace
  truth: "A stack that lives in the stacks folder under its own name is recognised as in-place even when the scan reaches it through Docktor's /host mount"
  status: failed
  reason: "User reported: Migration refused: the new stack directory .../dev-data/docktor/stacks/memos already exists. (Docktor's compose maps /:/host:ro.)"
  severity: major
  test: 10
  root_cause: "classifyMigrationTarget compares path.resolve strings only. The scanned compose path is container-side (/host/home/.../stacks/memos) while getStackDirectory returns the stacks directory as Docktor sees it, so the same folder compares as 'separate' and the exists-check refuses. The same textual comparison in managed-stack-paths.ts predicts the same miss for managed rows scanned through /host (review WR-10)."
  artifacts:
    - path: "server/src/domain/migration-target.ts"
      issue: "classifyMigrationTarget is string-only"
    - path: "server/src/application/migration-service.ts"
      issue: "assessTarget passes un-normalised paths"
    - path: "server/src/domain/managed-stack-paths.ts"
      issue: "findManagingStack is string-only"
  missing:
    - "Canonical directory identity: fs.realpath plus translation through Docktor's own bind mounts (container path <-> host path), compared as a set"
    - "Use it in classifyMigrationTarget and findManagingStack; tests with a /host:/ mount and a symlink"

- gap_id: G-18-22-status
  truth: "A migrated stack's status reflects only its own containers, not those of the old stack that is left running"
  status: failed
  reason: "User reported (test 8): the new stack had status running; the old stack was running with the same name."
  severity: major
  test: 8
  root_cause: "StatePoller and the event handler map containers to stacks by compose project name only (findByComposeProject). The old and new directories share the project name, so old containers count for the new stack. Worse, docker compose up for the new stack with the same project and service names can recreate the old containers."
  artifacts:
    - path: "server/src/jobs/state-poller.ts"
      issue: "byProject grouping ignores com.docker.compose.project.working_dir"
    - path: "server/src/application/migration-service.ts"
      issue: "no distinct project name or same-project refusal when the old stack stays running"
  missing:
    - "Match containers to a stack by project AND working_dir/config_files, via the same canonical path identity"
    - "When stopOldStack is off and the old and new compose project names collide, refuse the migration with a clear message (user decision: refuse, not auto-rename)"
  user_decision: "Refuse when the project names collide and the old stack is not stopped."

- gap_id: G-18-22-card
  truth: "Discovered stacks table fits without constant scrolling"
  status: failed
  reason: "User reported: make the card with the discovered stacks bigger."
  severity: minor
  test: 11
  root_cause: "BrownfieldImport's Card and the wizard wrapper are capped at max-w-3xl (768px), so long paths wrap and rows grow tall."
  artifacts:
    - path: "client/src/components/domain/stack/brownfield-import.tsx"
      issue: "Card className w-full max-w-3xl"
    - path: "client/src/routes/setup/components/brownfield-step.tsx"
      issue: "wrapper max-w-3xl"
  missing:
    - "Widen both (e.g. max-w-6xl on the page, wider in the wizard), keep phone layout"


- gap_id: G-18-23-stop-ui
  truth: "Stopping a stack's containers is reflected in the UI without a reload"
  status: failed
  reason: "User reported: stopping the container is not reflected in the UI; a reload is needed."
  severity: major
  test: 8
  root_cause: "Not reproduced; leading hypothesis (unverified): shares the cause of G-18-22-status. The stop button path is sound: StackService.stopStack sets STOPPED, the detail page refetches (onAction=refetch) and applies container_state SSE events. But StatePoller (event handler and 60s reconcile) attributes containers to a stack by compose project name only, so another running stack with the same project name (the old stack left running in test 8) re-writes the service rows to running and the derived status flips back. A second, weaker candidate: stopStack persists STOPPED before docker stops, and the first container event derives status from stale sibling service rows."
  artifacts:
    - path: "server/src/jobs/state-poller.ts"
      issue: "byProject grouping and handleEvent lookup ignore working_dir"
    - path: "server/src/application/stack-service.ts"
      issue: "stopStack persists STOPPED before the docker stop completes"
  missing:
    - "Confirm with the user whether the stack was one migrated with the old stack still running; if a plain stack reproduces it, trace the SSE delivery instead"
    - "Regression test: stopping a stack while a same-project container of another directory runs keeps the status STOPPED"
  note: "Undiagnosed. The server side emits stack.container_state_changed for stop events (state-poller.ts handleEvent), so the cause is either the event not matching the stack (project/working_dir, see G-18-22-status), or the client SSE hook not applying it. Needs the repro: which stop (stack page button, docker CLI, or the migration's old-stack stop) and which page."
