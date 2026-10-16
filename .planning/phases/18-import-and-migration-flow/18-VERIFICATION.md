---
phase: 18-import-and-migration-flow
verified: 2026-10-16T12:00:00Z
status: gaps_found
score: 14/17 must-haves verified
covered_files:
  - ".planning/phases/18-import-and-migration-flow/18-01-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-01-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-02-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-02-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-03-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-03-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-04-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-04-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-05-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-05-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-06-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-06-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-07-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-07-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-08-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-08-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-09-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-09-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-10-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-10-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-11-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-11-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-12-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-12-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-13-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-13-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-14-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-14-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-15-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-15-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-16-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-16-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-17-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-17-SUMMARY.md"
  - "client/src/components/domain/stack/brownfield-import.tsx"
  - "client/src/components/domain/stack/diff-confirm-dialog.tsx"
  - "client/src/components/domain/stack/discovered-stack-actions.tsx"
  - "client/src/components/domain/stack/scan-skipped-directories.tsx"
  - "client/src/hooks/use-container-events.ts"
  - "client/src/hooks/use-migration-operations.ts"
  - "client/src/hooks/use-stack.ts"
  - "client/src/lib/brownfield-types.ts"
  - "client/src/lib/env-mask.ts"
  - "client/src/lib/import-api.ts"
  - "client/src/lib/migration-progress.ts"
  - "client/src/lib/migration-volume-paths.ts"
  - "client/src/lib/setup-api.ts"
  - "client/src/routes/app/stacks/import.tsx"
  - "client/src/routes/setup/components/brownfield-step.tsx"
  - "client/src/routes/setup/components/migration-backup-step.tsx"
  - "client/src/routes/setup/components/migration-old-stack-step.tsx"
  - "client/src/routes/setup/components/migration-review-step.tsx"
  - "client/src/routes/setup/components/migration-select-step.tsx"
  - "client/src/routes/setup/components/migration-step-indicator.tsx"
  - "client/src/routes/setup/components/migration-wizard.tsx"
  - "server/src/application/managed-stack-guard.ts"
  - "server/src/application/migration-operation-service.ts"
  - "server/src/application/migration-service.ts"
  - "server/src/application/onboarding-service.ts"
  - "server/src/application/own-stack-guard.ts"
  - "server/src/application/ports/brownfield-scanner-port.ts"
  - "server/src/application/ports/compose-rewriter-port.ts"
  - "server/src/application/ports/external-stack-control-port.ts"
  - "server/src/application/ports/self-stack-port.ts"
  - "server/src/application/ports/stack-filesystem-port.ts"
  - "server/src/application/ports/volume-migrator-port.ts"
  - "server/src/application/subscribers/state-broadcast-subscriber.ts"
  - "server/src/domain/events.ts"
  - "server/src/domain/managed-stack-paths.ts"
  - "server/src/domain/migration-operation.ts"
  - "server/src/domain/migration-target.ts"
  - "server/src/domain/self-stack-paths.ts"
  - "server/src/infrastructure/brownfield-scanner.ts"
  - "server/src/infrastructure/compose-analyzer.ts"
  - "server/src/infrastructure/compose-rewriter.ts"
  - "server/src/infrastructure/disk-usage-scanner.ts"
  - "server/src/infrastructure/docker-self-stack.ts"
  - "server/src/infrastructure/external-stack-control.ts"
  - "server/src/infrastructure/probe-transport.ts"
  - "server/src/infrastructure/stack-filesystem.ts"
  - "server/src/infrastructure/volume-migrator.ts"
  - "server/src/lib/errors.ts"
  - "server/src/lib/state-broadcaster.ts"
  - "server/src/repositories/stack-repository.ts"
  - "server/src/routes/imports.ts"
  - "server/src/routes/setup.ts"
  - "shared/src/validation/brownfield.ts"
  - "shared/src/validation/index.ts"
  - "shared/src/validation/migration-operation.ts"
covered_digest: "v3:sha256:98045028bab67ebffd4792ac21b38b2c89b0dadab84bc1e383a09b4a635b9712"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 14/16
  gaps_closed:
    - "CR-01 (prior): a swallowed bind-mount copy error reported success; now only ENOENT is an empty source, any other error rolls back and restarts the old stack"
    - "CR-02 (prior): rollback could delete a directory or record it did not create; now exclusive mkdir, recordCreated flag, per-slug and per-compose in-flight guard, client rows disabled while running"
    - "WR-09 (prior, recommended): adopt and migrate refuse Docktor's own compose file via one shared fail-open guard"
    - "WR-03 (prior, recommended, partial): setup migrate, preview and operation routes answer 400 while no admin account exists"
    - "UAT G-18-2: scanned stacks Docktor already manages stay listed with Migrate/Adopt disabled, an 'Already managed' badge and a link; adopt/migrate answer 409 server-side"
    - "UAT G-18-3-scan: every skipped scan root is returned and listed with its reason and a /host hint, also when zero stacks were found"
    - "UAT G-18-4: relative bind mounts are scanned, offered (default ./volumes/<name>), counted and copied; the compose rewrite is a targeted splice so the memos diff is exactly one removed and one added line"
    - "UAT G-18-7: same-name in-place migration renames the original aside (editable name), forces the stop, rolls back by renaming back; backup defaults to off for a separate directory"
    - "UAT G-18-job: migration runs as a 202 background operation with list/get endpoints, migration_progress over the existing SSE channel, and a client hook that follows it"
  gaps_remaining:
    - "Absolute bind-mount sources are read from the container's view of the filesystem; a missing source becomes an empty directory and the migration reports success (review CR-03)"
    - "Bind-mount copy and the opt-in backup lose file ownership and rewrite relative symlinks (review CR-01)"
    - "Equal env keys across services collapse into one .env entry (review CR-02)"
  regressions: []
gaps:
  - truth: "A migration never reports success after silently failing to carry over the data of a bind mount the user selected for copying"
    status: failed
    reason: "Review CR-03, confirmed in code. In migration-service.ts copyBindMounts an absolute compose bind source (a HOST path) is used as-is (srcPath = relocateIntoSource(sel.originalPath)). In the documented deployment host / is mounted read-only at /host and users are told to scan /host/... (scan-skipped-directories.tsx, brownfield-import.tsx help text), so a stack found at /host/opt/app/docker-compose.yml with `- /opt/app/data:/var/lib/data` yields srcPath /opt/app/data, which does not exist inside the container. sourceExists() returns false (ENOENT), the 18-06 rule 'ENOENT means empty source' then runs fs.mkdir(destPath), nothing is copied, stopOldStack (default on) has already stopped the old stack, and the operation ends succeeded with the success toast. No path translation exists for sources (containerVisiblePaths from self-stack-paths.ts is not reused). The same hazard class as the prior CR-01 that the earlier verification recorded as a gap. Pre-existing Phase 5 copy semantics, but phase 18 made it more dangerous by stopping the old stack before the copy and by stating a rollback guarantee."
    artifacts:
      - path: "server/src/application/migration-service.ts"
        issue: "copyBindMounts lines ~488-499: absolute originalPath not translated to a container-visible path; ENOENT silently becomes an empty directory for a source the user explicitly selected (convert: true)"
    missing:
      - "Resolve absolute bind sources through the container's own mounts (reuse containerVisiblePaths) before copying"
      - "Fail closed (BadRequestError in preflight, or rollback in execute) for a selected source that cannot be found; reserve 'create empty directory' for a source genuinely absent on the host, and surface that in the preview"
      - "Unit test: absolute source only visible under /host is copied; unresolvable selected source rolls back, restarts the old stack and reports success false"
  - truth: "Bind-mount data copied into the new stack, and the opt-in pre-migration-backup/ copy, are faithful: ownership and symlinks survive so a database directory starts and the backup is restorable"
    status: failed
    reason: "Review CR-01, confirmed. VolumeMigrator.copyDirectory is fs.cp(src, dest, {recursive: true}); Node's fs.cp never chowns and, without verbatimSymlinks, rewrites a relative symlink to an absolute path into the source tree (reproduced locally: a copied `lnk -> f` reads back as an absolute path into the source directory). Docktor's image sets no USER, so copies are root-owned. A Postgres/MySQL/Grafana bind-mount directory therefore arrives root-owned and the migrated stack crash-loops, and the pre-migration-backup/ copy (MIG-03's deliverable) is not a faithful backup. The named-volume path already uses `cp -a`, so the two copy paths disagree. Pre-existing Phase 5 code, now also used for relative mounts (18-10) and the backup (18-03)."
    artifacts:
      - path: "server/src/infrastructure/volume-migrator.ts"
        issue: "copyDirectory lines ~49-51: fs.cp without ownership preservation, timestamps or verbatimSymlinks"
    missing:
      - "Copy via cp -a (or fs.cp with verbatimSymlinks + preserveTimestamps plus an lchown walk) so uid/gid, modes and symlinks survive"
      - "Unit test asserting a relative symlink and the mode survive; ownership asserted where the test environment permits"
  - truth: "The compose rewrite and .env extraction preserve each service's effective environment"
    status: failed
    reason: "Review CR-02, confirmed in compose-rewriter.ts extractServiceEnvironment: all inline literals go into one Map<key, value> (`this.envVars.set(key, literal)`, comment 'a later duplicate key overwrites the value') and every occurrence is replaced by ${KEY}. Two services with PORT: \"80\" and PORT: \"9000\" (or DB_HOST db1/db2) both read the last value after migration; migration-service.ts also appends the extracted block after an existing .env, so a duplicate key can override a value a service already relied on. Neither the diff nor the .env preview makes the collision visible. The map-form extraction is applied automatically to every stack with inline literals, so this is reachable on ordinary compose files. Pre-existing design (Phase 5), carried into the 18-08 rewrite."
    artifacts:
      - path: "server/src/infrastructure/compose-rewriter.ts"
        issue: "extractServiceEnvironment (~lines 195-211) and the envVars Map: same key with different values collapses to one entry"
      - path: "server/src/application/migration-service.ts"
        issue: "Lines ~382-385 append the extracted block after the old .env without checking for duplicate keys"
    missing:
      - "Namespace the variable (SERVICE_KEY) when the key already maps to a different literal, or when the old .env defines it with a different value"
      - "Unit test: two services with the same key and different values keep distinct effective values after rewrite"
human_verification:
  - test: "CI: run `yarn tsc --build`, the full workspace unit suites, and server integration tests (server/test/integration/imports.test.ts) on release/v0.1.1"
    expected: "Zero type errors; all unit suites green (the 3 brownfield-import.test.tsx failures seen in the full client run did not reproduce when the file ran alone or with three sibling files, 28/28 and 92/92, so they look load-sensitive; confirm in CI); migrate endpoints answer 202 for a valid body and 400/409 for refusals; setup and import route families behave identically"
    why_human: "Deferred to CI per the no-heavy-local-actions rule; none of these were run locally"
  - test: "CI: run the Playwright flow (client/test/integration/setup-wizard.spec.ts and stacks-import.spec.ts) on desktop chromium and mobile-chromium with PLAYWRIGHT_PORT"
    expected: "Four-step dialog walks through; sent backup/stopOldStack flags match the switches; at 360px the dialog fits horizontally, the diff is visible on step 2 and Confirm & Migrate is reachable on step 4; managed rows are disabled with the link; skipped roots are listed"
    why_human: "Only automated evidence for ROADMAP SC2 (readability at desktop and phone widths); visual quality needs a human look. Specs were rewritten by 18-10..18-17 and have never been executed"
  - test: "UAT tests 7 and 8 were BLOCKED in round 1 and never re-run. On a real host, migrate (a) a stack with a relative bind mount into a new directory with backup on and stop on, and (b) another with backup off and stop off; then (c) migrate a same-name stack already in the stacks folder (in place)"
    expected: "(a) pre-migration-backup/ exists, old containers stopped, new stack runs with its ./volumes data, original directory unchanged; (b) no backup folder, old containers keep running; (c) original renamed to <name>-pre-migration, new stack runs in the original path, failure path renames it back. Progress toast follows steps and ends in one success/failure toast; the row shows Migrating... then Imported"
    why_human: "These two UAT tests are the only end-to-end proof of ROADMAP SC4 and SC5 against a real Docker daemon; unit tests use fakes for Docker and the filesystem port"
  - test: "On a real host with Docktor in a container, open Import existing stack, scan the directory holding Docktor's own compose file, a second stack, and one stack already managed by Docktor"
    expected: "Docktor's own compose file is not listed; the other stack is; the managed one is listed disabled with 'Already managed' and a working View link. Repeat via /host/... paths and note whether the managed row is still flagged (review WR-10 predicts it is not)"
    why_human: "Real inspect/label/mount behaviour of the Docker daemon is not exercised by unit tests (adapter tested with fakes)"
  - test: "Migrate a stack whose project name differs from its directory (started with -p or COMPOSE_PROJECT_NAME) with 'Stop the old stack' on"
    expected: "Old containers actually stop; the success toast ('The old stack was stopped.') is accurate"
    why_human: "Review WR-05: `docker compose -f <file> stop` can exit 0 having stopped nothing; cannot be checked without a real Docker daemon"
  - test: "Security decision on review WR-02: /api/setup/scan, /adopt and (once any user exists) /migrate, /migrate/preview and operation reads stay reachable without a session until the wizard is completed"
    expected: "Decide whether to require the step-1 session on all brownfield setup routes (and refuse scan/adopt/migrate before the admin exists) before release, or accept the exposure"
    why_human: "Product/security risk acceptance; the 18-07 plan truth (400 while no admin exists) is met, but the residual exposure includes `docker compose stop` on any scanned compose path"
---

# Phase 18: Import and Migration Flow Verification Report

**Phase Goal:** Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Verified:** 2026-10-16
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plans 18-06..18-17 (prior status gaps_found, 14/16)

## Summary

All five ROADMAP success criteria are implemented, wired and covered by passing unit tests, and every gap from the prior VERIFICATION.md (CR-01, CR-02) and from UAT round 1 (G-18-2, G-18-3-scan, G-18-4, G-18-7, G-18-job) is closed in the code. No regression was found against the previously verified truths.

The fresh code review (18-REVIEW.md, 3 critical / 11 warning / 5 info, all still `open`) was weighed finding by finding. None of the three critical findings falsifies one of the five success criteria as worded. All three, however, are confirmed in the code and are the same hazard class the previous verification recorded as a gap: the migration reports success while the migrated stack is not equivalent to the old one, after the old stack has already been stopped by default. For consistency with that precedent they are recorded as gaps rather than warnings:

- **CR-03 (absolute bind mounts under `/host`)**: confirmed. Silent data loss with a success toast in the documented `/host` topology.
- **CR-01 (`fs.cp` ownership and symlinks)**: confirmed, including a local reproduction of the symlink rewrite. It also degrades the opt-in backup that MIG-03 delivers.
- **CR-02 (env key collapse)**: confirmed. Silent change of a service's configuration.

All three sit in pre-existing Phase 5 code (commits `ffecf69`, `756ad81`) that phase 18 reused or rewrote, and none touches the original directory, so the user's source data is never destroyed. They are small, localised fixes (`migration-service.ts`, `volume-migrator.ts`, `compose-rewriter.ts`). If the maintainers decide these are out of phase scope, the alternative is to file them as release-blocking follow-up issues and accept `human_needed`; that is a human decision, not one this verifier can make.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Scan never includes Docktor's own stack, every other stack still offered | VERIFIED | `OnboardingService.scan()` runs scanner, `lookupOwnComposeFiles` and `stackRepo.listLocations()` in parallel, filters via `excludeOwnComposeFiles` (exact file equality; a sibling compose file stays) and annotates `managedStack`. `domain/self-stack-paths.ts` maps compose-label host paths through bind mounts (`containerVisiblePaths`, no hard-coded `/host`); fail-open on unknown. `assertNotOwnStack` is also run in `adoptInPlace` and `assessTarget` (WR-09 closed). Both scan routes call the one service. Unit tests pass. |
| 2 | Dialog opens larger; diff and steps readable at desktop and phone widths | VERIFIED in code, visual fit needs CI | `migration-wizard.tsx:192` `DialogContent className="flex flex-col gap-4 p-4 sm:p-6 max-h-[90dvh] sm:max-w-5xl"`; header/footer outside the `min-h-0 flex-1 overflow-y-auto` body; footer buttons `w-full sm:w-auto`. UAT tests 3 and 9 (dialog width, 360px) passed for the user. Playwright not run locally. |
| 3 | Real line diff, added/removed lines individually marked, shared component | VERIFIED | `previewMigration` returns `computeUnifiedDiff(original, rewritten)`; `migration-review-step.tsx` renders `UnifiedDiffView` with +N / -N `ToneBadge` counters and the extracted `.env` in read-only `CodeEditor` with `maskEnvText`. `generateDiff` and `diff-viewer.tsx` are gone (grep: no references). The UAT G-18-4 symptom (indentation-only noise) is closed by the splice-based rewriter; test asserts the memos diff is exactly one removed and one added line, also CRLF and flush sequences. Note: roadmap says "shared code editor"; CONTEXT.md records the decision to use `UnifiedDiffView` for the diff and `CodeEditor` for `.env` only. Open caveat: the compose diff itself is unmasked (WR-06). |
| 4 | Backup is its own explicit step; opt-out creates none, opt-in creates one whether or not renamed | VERIFIED (default changed by user decision) | `MigrationBackupStep` is step 3; `backup` is a required boolean in `migrationExecuteSchema`; `execute()` copies `originalDir` to `<new>/pre-migration-backup` iff `backup && !inPlace`, independent of rename or compose change. Tests: creates none when false, still backs up when not renamed. Deviation recorded: per UAT G-18-7 user decision the switch now defaults to OFF for a separate directory (original stays untouched), and an in-place migration offers no switch because the renamed original is the backup (no extra copy). Fidelity of the copy is gap 2 (CR-01). |
| 5 | User can stop the old stack; if declined it is left running | VERIFIED in code; real-Docker end-to-end pending (UAT 7/8 blocked) | `MigrationOldStackStep` is step 4 (default on, warning when off, disabled and forced on for in-place); `stopOldStack` required boolean; `execute()` calls `oldStack.stop(composePath)` first and only when true; rollback calls `oldStack.start` iff stopped, after renaming an in-place original back. Tests: never stops/starts when false; fail-closed on stop failure. Stop-by-inferred-project-name limitation open as WR-05. |

### Plan must-have truths (original plans 18-01..18-05, carried forward)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 6 | Own-stack match through bind mounts and identical path; `skippedDirectories` unchanged (18-01) | VERIFIED | `self-stack-paths.ts`; `skippedDirectories` still equals `skipped.length` |
| 7 | Request bodies on shared Zod schemas; compose path rule (18-02) | VERIFIED | `shared/src/validation/brownfield.ts`; both route files import schemas; shared tests 62/62 incl. operation schema |
| 8 | Both migrate endpoints require explicit `backup` and `stopOldStack` (18-03) | VERIFIED | `migrationExecuteSchema`; routes forward `...rest` |
| 9 | Rollback is non-destructive and restarts the old stack iff stopped (18-03) | VERIFIED | `execute()` catch block; tests for copy failure, non-ENOENT access error, stop failure, restart failure |
| 10 | Review step counters, masked `.env`, reset on Back (18-04); four steps, indicator, focus, stale preview guard (18-05) | VERIFIED | `migration-review-step.tsx`, `migration-wizard.tsx` (`previewRequestId`, `stepBodyRef.focus()`); client tests pass |

### Gap-closure truths (18-06..18-17 and prior/UAT gaps)

| # | Gap / Truth | Status | Evidence |
|---|---|---|---|
| 11 | Prior CR-01: copy failure fails the migration and rolls back; only ENOENT is an empty source (18-06) | VERIFIED (closed) | `sourceExists()` rethrows non-ENOENT; tests "fails the migration, removes its directory and restarts the old stack when a bind-mount copy fails" and "fails on a non-ENOENT access error" pass. The remaining hole (ENOENT false negative) is gap 1 |
| 12 | Prior CR-02: rollback removes only what this run created (18-06, 18-14) | VERIFIED (closed) | `stackFs.createDirectoryExclusive` before `createdStackDir = true`; `recordCreated` gate on `stackRepo.delete`; `MigrationOperationService.holdInFlight` refuses same slug or same compose file with 409, slot released in `finally`; client disables the row. Tests: "leaves a directory that appeared during the stop window untouched", "never deletes a stack record this run did not create" |
| 13 | G-18-2: managed stacks listed, buttons disabled, server refuses (18-11, 18-13) | VERIFIED (closed) | `annotateManagedStacks` adds `managedStack`; `assertNotManaged` (409) in `adoptInPlace` and `assessTarget`; `DiscoveredStackActions` renders `Already managed` badge, `View <name>` link to `/stacks/:id` (route exists), both buttons disabled. Caveat WR-10: detection is exact string equality, so a managed directory reached through a `/host/...` scan path is not flagged |
| 14 | G-18-3-scan: skipped roots always visible with reason and `/host` hint (18-09, 18-13) | VERIFIED (closed) | Scanner returns `skipped: [{directory, reason}]` (`not_found` / `permission_denied` / `system_directory`); `ScanSkippedDirectories` rendered whenever a scan ran, also with zero stacks; hint text and directories-input help mention `/host` |
| 15 | G-18-4: relative bind mounts offered, copied; non-lossy diff (18-08, 18-09, 18-10) | VERIFIED (closed) | Scanner exposes `relativePaths`; `buildBindMountChoices`/`toVolumeSelections`/`countVolumesToCopy` feed step 1 and the summary; `copyBindMounts` joins relative sources onto `sourceDir`; `ComposeRewriter` edits scalar ranges only. 263 server and 92 client targeted tests pass |
| 16 | G-18-7: in-place migration with editable aside name, forced stop, full rollback (18-12, 18-15) | VERIFIED (closed) | `classifyMigrationTarget` -> `in-place`; `planInPlace` refuses stop=false and taken/invalid names before any side effect; `migrator.moveDirectory` (lstat-guarded rename) aside and back; `moveOriginalBack` never replaces an occupied path and tells the user how to restore; preview returns `target` with free suggested name; wizard/backup/old-stack steps adapt. Test group "in-place migration (G-18-7)" passes. Caveat WR-03: failed `docker.up` leaves recreated containers that rollback `start`s |
| 17 | G-18-job: background operation, progress over SSE, client follows (18-14, 18-16, 18-17) | VERIFIED (closed) | Routes answer 202 with the operation after `preflight`; `GET .../migrations[/:id]` in both families; `MigrationOperationService.save` emits `migration.progressed` which `state-broadcast-subscriber` maps to `migration_progress` (registered in `subscribers/register.ts`); `useMigrationOperations` resyncs on open and mount, ignores stale snapshots, closes via `useContainerEvents`; `showMigrationToast` reuses the operation id. Caveat WR-08: following lives in the mounted component, so a navigated-away toast can stick |
| 18 | WR-09 / WR-03 hardening (18-07) | VERIFIED as planned | Own-stack guard in adopt and migrate; `requireAdminAccount` preHandler on setup migrate/preview/operations. Residual exposure open as WR-02 (human item) |
| 19 | Derived: no success report after silently not carrying a selected bind mount's data | FAILED | Gap 1 (CR-03) |
| 20 | Derived: copied bind-mount data and the backup copy are faithful | FAILED | Gap 2 (CR-01) |
| 21 | Derived: rewrite preserves each service's effective environment | FAILED | Gap 3 (CR-02) |

**Score:** 14/17 truths verified (truths 19-21 failed; the 5 ROADMAP SCs and all plan/gap-closure truths are implemented). 0 behavior-unverified truths: every state-transition/rollback/cancellation truth above has a passing named test.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `server/src/application/migration-service.ts` (584 lines) | VERIFIED, defects noted | preflight/execute split, in-place, progress, rollback; gap 1 here |
| `server/src/application/migration-operation-service.ts`, `domain/migration-operation.ts` | VERIFIED | Wired from both route families; sorted, pruned registry |
| `server/src/application/own-stack-guard.ts`, `managed-stack-guard.ts`, `domain/managed-stack-paths.ts`, `domain/migration-target.ts` | VERIFIED | Imported by scan/adopt/migrate; substantive pure rules |
| `server/src/infrastructure/compose-rewriter.ts` | VERIFIED, defect noted | Splice-based rewrite; gap 3 here |
| `server/src/infrastructure/volume-migrator.ts` | VERIFIED, defect noted | `moveDirectory` added; `copyDirectory` is gap 2 |
| `server/src/infrastructure/brownfield-scanner.ts`, `docker-self-stack.ts`, `external-stack-control.ts` | VERIFIED | Skip reasons, `relativePaths`, `pre-migration-backup` ignore; (IN-03: `<id>-pre-migration` is not ignored) |
| `server/src/routes/imports.ts`, `routes/setup.ts` | VERIFIED | 202 start, list/get, admin guard on setup family |
| `shared/src/validation/brownfield.ts`, `migration-operation.ts` | VERIFIED | Single schema source for server and client |
| `client/src/components/domain/stack/{brownfield-import,discovered-stack-actions,scan-skipped-directories}.tsx` | VERIFIED | Composed; no inline helper components |
| `client/src/hooks/use-migration-operations.ts`, `lib/migration-progress.ts`, `lib/migration-volume-paths.ts` | VERIFIED | Exhaustive step labels (type-checked record) |
| `client/src/routes/setup/components/migration-*.tsx` | VERIFIED | All rendered from the wizard |
| `diff-viewer.tsx`, `ComposeRewriter.generateDiff` | Correctly deleted | No references remain |

### Key Link Verification

| From | To | Status |
|---|---|---|
| `OnboardingService.scan` -> `SelfStackPort`, `stackRepo.listLocations`, `annotateManagedStacks` | WIRED |
| `adoptInPlace` / `assessTarget` -> `assertNotOwnStack`, `assertNotManaged` | WIRED |
| `routes/imports.ts`, `routes/setup.ts` -> `migrationOperationService.start` -> `MigrationService.preflight/execute` | WIRED |
| `MigrationOperationService.save` -> `domainEventBus` -> `state-broadcast-subscriber` -> `StateBroadcaster` -> `/api/events` | WIRED |
| `use-container-events` (`migration_progress`) -> `useMigrationOperations` -> `showMigrationToast` / `DiscoveredStackActions` | WIRED |
| `MigrationWizard` -> `previewMigration` (target) -> backup/old-stack steps -> `onConfirmMigrate` -> `api.executeMigration(...).then(track)` | WIRED |
| `MigrationReviewStep` -> `UnifiedDiffView` / `CodeEditor` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Discovered stack rows | `stacks[].managedStack`, `relativePaths`, `skipped` | scanner + `stackRepo.listLocations()` | Yes | FLOWING |
| Review step | `diff`, `extractedEnv`, `target` | `previewMigration` on the real compose file | Yes | FLOWING |
| Row/toast progress | `operation.step` | `MigrationService.report` -> operation registry -> SSE | Yes | FLOWING |
| Copied bind-mount data | `srcPath` | compose-declared host path | Not for absolute sources outside the container's view | DISCONNECTED (gap 1) |

### Behavioral Spot-Checks (targeted unit files only)

| Scope | Result | Status |
|---|---|---|
| Server unit project: migration-service, migration-operation-service, onboarding-service, compose-rewriter, brownfield-scanner, brownfield-routes, migration-target, managed-stack-paths, state-broadcast-subscriber | 9 files, 263 tests passed | PASS |
| Client: brownfield-import, use-migration-operations, migration-wizard, migration-volume-paths | 4 files, 92 tests passed (brownfield-import is green here, supporting the load-sensitivity reading of the orchestrator's 3 failures) | PASS |
| Shared: brownfield, migration-operation schemas | 2 files, 62 tests passed | PASS |
| Orchestrator regression gate (reduced): shared 243/243, server unit 2502/2502, client full run 3 failures in `brownfield-import.test.tsx` not reproducible in isolation | taken from the orchestrator, not independently re-run in full | NOTED |
| Local reproduction of CR-01 symlink behaviour | `fs.cp` of a relative symlink `lnk -> f` reads back as an absolute path into the source tree | CONFIRMS finding |
| Not run (VPS rule) | `tsc --build`, Playwright, server integration tests | Deferred to CI, in `human_verification` |

### Probe Execution

SKIPPED: no probes declared by the phase plans; no `scripts/*/tests/probe-*.sh` applies.

### Requirements Coverage

Requirement IDs declared across the 17 plans: STK-03 (18-01, 18-07, 18-09, 18-11, 18-13), MIG-01 (18-04, 18-05, 18-10, 18-17), MIG-02 (18-02, 18-04, 18-08, 18-09, 18-10), MIG-03 (18-03, 18-05, 18-06, 18-12, 18-14, 18-15), MIG-04 (18-03, 18-05, 18-06, 18-07, 18-12, 18-14, 18-15, 18-16, 18-17). Every ID is in REQUIREMENTS.md (lines 18-21, 27, 82-86, marked Complete); no orphaned requirement.

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| STK-03 | 18-01, 18-07, 18-09, 18-11, 18-13 | SATISFIED | Scan hides own stack; adopt/migrate refuse it; managed rows disabled. Caveat WR-10 (managed detection via `/host` alias) |
| MIG-01 | 18-04, 18-05, 18-10, 18-17 | SATISFIED in code; Playwright/visual in CI | `sm:max-w-5xl`, pinned header/footer, scrolling body |
| MIG-02 | 18-02, 18-04, 18-08, 18-09, 18-10 | SATISFIED | `UnifiedDiffView` over a non-lossy `computeUnifiedDiff`. Caveat WR-06 (secrets visible in compose diff) |
| MIG-03 | 18-03, 18-05, 18-06, 18-12, 18-14, 18-15 | SATISFIED with caveat | Explicit step, required flag, opt-in copy / in-place rename. Copy fidelity is gap 2 |
| MIG-04 | 18-03, 18-05, 18-06, 18-07, 18-12, 18-14..18-17 | SATISFIED in code | Explicit step, stop before copy, restart on rollback. Real-Docker proof pending (UAT 7/8, WR-05) |

### Anti-Patterns Found

TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER scan over all 56 source files changed in the phase: no matches. `generateDiff`/`diff-viewer` references: none.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `server/src/infrastructure/volume-migrator.ts` | ~50 | `fs.cp` without ownership/symlink preservation | Blocker (gap 2) | Data arrives root-owned; backup unfaithful |
| `server/src/application/migration-service.ts` | ~488-499 | Host path used as container path; ENOENT -> empty dir | Blocker (gap 1) | Silent data loss with success |
| `server/src/infrastructure/compose-rewriter.ts` | ~195-211 | Single `Map<key,value>` for env | Blocker (gap 3) | Silent config change |
| `server/src/infrastructure/compose-analyzer.ts` | 71, 76, 81 | `doc: any`, `service as any` | Info | CLAUDE.md "no any" violation (IN-02), pre-existing |
| `server/src/application/migration-service.ts` | 424, 559, 578 | `console.error` in rollback paths | Info | Not the project logger (IN-02); rollback failures also swallowed silently (WR-07) |

## Code Review Triage (18-REVIEW.md: 3 critical, 11 warning, 5 info; all `open` in 18-REVIEW-DISPOSITION.md)

### Recorded as gaps (confirmed in code, same hazard class as the prior CR-01)

| ID | Verdict | Reasoning |
|---|---|---|
| CR-03 | GAP 1 | Confirmed (see gaps). Highest severity: documented `/host` topology, default-on stop, success toast. |
| CR-01 | GAP 2 | Confirmed incl. local symlink reproduction; Docktor runs as root; also degrades the opt-in backup (MIG-03). |
| CR-02 | GAP 3 | Confirmed; the code comment itself documents the overwrite. |

### Non-blocking (do not falsify a success criterion; track as follow-ups or decide before release)

| ID | Note |
|---|---|
| WR-01 | Server validates `newPath`/volume names only in `execute` (after stop/rename); copy source unconfined. Fold into the CR-03 fix (resolve and confine sources in `preflight`). |
| WR-02 | Setup brownfield routes remain reachable unauthenticated until wizard completion; human decision item above. Worth resolving before release. |
| WR-03 | Failed `docker.up` leaves containers; in-place rollback `start`s the recreated ones and claims "restarted". |
| WR-04 | Named-volume copy uses the unprefixed compose key; external top-level volumes default to convert. |
| WR-05 | Stop relies on inferred project name; toast can overstate. Human item above. |
| WR-06 | Compose diff shows secrets unmasked while `.env` is masked. |
| WR-07 | Rollback cleanup errors swallowed; user told "rolled back". |
| WR-08 | Operation follower bound to mounted component; loading toast can stick after navigation. |
| WR-09 | `.env` extraction emits invalid names (`my-key`) and unescaped values. Related to gap 3; fix together. |
| WR-10 | Managed-stack and in-place detection ignore the `/host` alias. |
| WR-11 | `~/...` sources offered for conversion but never rewritten. |
| IN-01..IN-05 | Symlink/`..` in compose path, convention nits, `<id>-pre-migration` offered by the scanner, `ProxyCertStatusEvent` drift/unguarded `JSON.parse`, restart-all and backup-after-stop. |

### Deferred items (Step 9b)

None. Phases 19-21 (sidebar/templates/version, visual consistency/dashboard, release) do not cover any of the three gaps.

## Human Verification Required

See `human_verification` in the frontmatter (six items): CI type-check, unit and integration suites; CI Playwright incl. the 360px case; the blocked UAT tests 7 and 8 plus an in-place run on a real host; a real-Docker check of own-stack hiding and managed-row flagging; a real-Docker check that stop works when the project name differs from the directory; and the WR-02 security decision.

## Gaps Summary

Phase 18 delivers its goal in structure: own stack hidden, managed stacks disabled, real readable diff in a wider dialog, explicit backup and stop-old-stack steps, in-place migration, and a background operation with live progress. Everything the previous round flagged is closed and no regression was found.

What remains are three data-fidelity defects in the copy and rewrite code that phase 18 reuses: absolute bind sources that the container cannot see are silently treated as empty (CR-03), copies lose ownership and symlinks (CR-01), and equal env keys across services collapse (CR-02). Each can end in a "Migration complete" toast for a stack that does not behave like the old one, after the old stack was stopped by default. Suggested closure plan (one plan, three tasks, all unit-testable without Docker): (1) resolve absolute sources through `containerVisiblePaths` and fail closed for an unresolvable selected source, moving the check into `preflight` (also closes WR-01); (2) switch `copyDirectory` to `cp -a` semantics and add symlink/mode tests; (3) namespace colliding env keys and restrict extraction to valid interpolation names (also closes WR-09). WR-02 (setup-route authentication) should be decided in the same round.

---

_Verified: 2026-10-16_
_Verifier: Claude (gsd-verifier)_
