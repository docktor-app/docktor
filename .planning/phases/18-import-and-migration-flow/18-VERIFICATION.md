---
phase: 18-import-and-migration-flow
verified: 2026-10-17T00:30:00Z
status: human_needed
score: 21/21 must-haves verified
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
  - ".planning/phases/18-import-and-migration-flow/18-18-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-18-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-19-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-19-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-20-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-20-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-21-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-21-SUMMARY.md"
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
  - "server/src/application/ports/own-mounts-port.ts"
  - "server/src/application/ports/self-stack-port.ts"
  - "server/src/application/ports/stack-filesystem-port.ts"
  - "server/src/application/ports/volume-migrator-port.ts"
  - "server/src/application/subscribers/state-broadcast-subscriber.ts"
  - "server/src/domain/bind-mount-sources.ts"
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
  - "server/src/infrastructure/dotenv-format.ts"
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
covered_digest: "v3:sha256:f53f5cdf81de682ac533bd1d1f8883e81338cb1ad7c3eceefb8049073edae356"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 14/17
  gaps_closed:
    - "CR-03 / gap 1 (18-19, 18-21): absolute bind sources are resolved through Docktor's own mounts (containerVisiblePaths); an invisible, unreadable or ~ source is refused with a 400 in preview and preflight before any side effect; a source that vanishes between preflight and copy rolls back; only a visible-but-absent source becomes an empty directory and it is listed in emptySources, which the review step shows"
    - "CR-01 / gap 2 (18-18): copyDirectory is archive-mode cp (-a, merge via src/. into an existing destination, fs.cp with verbatimSymlinks and preserveTimestamps only on win32); a missing source or failing copy rejects with its cause and never creates an empty destination"
    - "CR-02 / gap 3 (18-20): EnvNameAllocator gives each differing literal its own name (KEY, then SERVICE_KEY, then _2.._99), never reuses a Docktor process-env, COMPOSE_*/DOCKER_*, compose-referenced or differing old-.env name; only valid names and dotenv-safe values are moved; the old .env flows into preview and execute, read ENOENT-only"
    - "WR-01 (18-19): converted sources must be declared by the compose file; destinations, volume names, collisions and reserved names are validated in preflight (copyDestinationViolations), so a bad request is a 400 with no stop, rename or rollback"
    - "WR-09 (18-20): invalid interpolation names and non-dotenv-safe values stay inline"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "CI: run `yarn tsc --build`, the full workspace unit suites, and server integration tests (server/test/integration/imports.test.ts) on release/v0.1.1"
    expected: "Zero type errors (MigrationService gained two constructor parameters, ComposeRewriterPort.rewrite gained existingEnv, MigrationPreview gained emptySources; none was type-checked locally); all unit suites green; preview endpoints return emptySources; migrate endpoints answer 202/400/409 as specified"
    why_human: "Deferred to CI per the no-heavy-local-actions rule; only targeted unit files were run here"
  - test: "CI: run the Playwright flow (client/test/integration/setup-wizard.spec.ts and stacks-import.spec.ts) on desktop chromium and mobile-chromium with PLAYWRIGHT_PORT"
    expected: "Four-step dialog walks through; the empty-source note (fixture emptySources: ['./missing']) shows on step 2 and wraps at 360px; sent backup/stopOldStack flags match the switches; managed rows are disabled with the link; skipped roots are listed"
    why_human: "Only automated evidence for ROADMAP SC2 (readability at desktop and phone widths); visual quality needs a human look; specs have never been executed locally"
  - test: "On a real host with Docktor in the documented container topology (host / mounted at /host), scan /host/<dir>, then migrate a stack whose compose file has an absolute bind source (e.g. /opt/app/data:/var/lib/data) with 'Stop the old stack' on, once with the source present and once with it absent, and once with a source outside any mount"
    expected: "Present: data arrives in the new stack. Absent: review step lists it and the new stack starts with an empty folder. Outside any mount: the migration is refused with a 400 naming the path before anything is stopped"
    why_human: "Real inspect/mount behaviour of the Docker daemon is exercised only through fakes in unit tests (the /host translation is tested with a temp-dir stand-in for the host root)"
  - test: "As root in the production image, migrate a stack whose bind mount holds a database directory owned by a non-root uid (e.g. Postgres) and enable the backup; then inspect ownership and symlinks in the new stack and in pre-migration-backup/"
    expected: "uid/gid, modes, timestamps and symlink targets equal the source's; the migrated database starts"
    why_human: "The ownership assertion in volume-migrator.test.ts is gated on uid 0 (it.skipIf) and was skipped here (uid 1000); CI runners are normally non-root too, so the chown path of `cp -a` is not automatically exercised anywhere. Symlink, mode, timestamp and merge behaviour are exercised and pass"
  - test: "UAT tests 7 and 8 (BLOCKED in round 1, never re-run). On a real host, migrate (a) a stack with a relative bind mount into a new directory with backup on and stop on, (b) another with backup off and stop off, and (c) a same-name stack already in the stacks folder (in place)"
    expected: "(a) pre-migration-backup/ exists, old containers stopped, new stack runs with its ./volumes data, original unchanged; (b) no backup folder, old containers keep running; (c) original renamed to <name>-pre-migration, new stack runs in the original path, failure path renames it back. Progress toast follows the steps and ends in one success/failure toast"
    why_human: "The only end-to-end proof of ROADMAP SC4 and SC5 against a real Docker daemon"
  - test: "On a real host with Docktor in a container, open Import existing stack and scan the directory holding Docktor's own compose file, a second stack, and one stack already managed by Docktor"
    expected: "Docktor's own compose file is not listed; the other stack is; the managed one is listed disabled with 'Already managed' and a working View link. Repeat via /host/... and note whether the managed row is still flagged (review WR-10 predicts it is not)"
    why_human: "Real Docker inspect/label/mount behaviour"
  - test: "Migrate a stack whose project name differs from its directory (started with -p or COMPOSE_PROJECT_NAME) with 'Stop the old stack' on"
    expected: "Old containers actually stop; the success toast is accurate"
    why_human: "Review WR-05: `docker compose -f <file> stop` can exit 0 having stopped nothing"
  - test: "Security decision on review WR-02: /api/setup/scan, /adopt and (once any user exists) /migrate, /migrate/preview and operation reads stay reachable without a session until the wizard is completed"
    expected: "Decide whether to require the step-1 session on all brownfield setup routes before release, or accept the exposure"
    why_human: "Product/security risk acceptance; explicitly deferred out of gap round 2"
---

# Phase 18: Import and Migration Flow Verification Report

**Phase Goal:** Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Verified:** 2026-10-17
**Status:** human_needed
**Re-verification:** Yes, after gap-closure round 2 (plans 18-18..18-21; prior status gaps_found, 14/17)

## Summary

All three gaps recorded in the previous 18-VERIFICATION.md (review CR-03, CR-01, CR-02) are closed in the code, and the folded-in WR-01 and WR-09 are closed with them. They were re-checked against the source, not the SUMMARYs, and each is backed by tests that ran and passed in this verification. No regression was found against the 18 previously verified truths. No gap remains, so the status is no longer `gaps_found`; it is `human_needed` solely because real-Docker, CI and visual checks (and the WR-02 security decision) cannot be done programmatically here.

## Goal Achievement

### Re-check of each previous gap

| Prior gap | Verdict | Evidence in the code |
|---|---|---|
| 1. Silent success after not carrying a selected bind mount's data (CR-03) | CLOSED | `MigrationService.planBindCopies` runs in both `previewMigration` and `preflight`. It calls `locateBindSource(originalPath, originalDir, view)` (`domain/bind-mount-sources.ts`), which translates an absolute host source through `containerVisiblePaths` over Docktor's own bind mounts (`OwnMountsPort`, implemented by `DockerSelfStack.ownMounts()`, which never rejects). Refusals (`not-visible`, `mounts-unknown`, `home-relative`) throw `BadRequestError` naming the path before anything is stopped. Of the candidates `firstExisting` picks the first that exists; none existing yields `sourcePath: null`, which only then becomes an empty directory and is returned as `emptySources`. In `execute`, `copyBindMounts` re-checks a planned source with `sourceExists` (ENOENT only) and throws if it vanished, so the rollback path restarts the old stack. Tests: "copies a bind source seen only through Docktor's own mounts", "sources Docktor cannot read fail closed (CR-03)" incl. "planned source vanished" and "access error raised only at execute time" pass (migration-service.test.ts, 94 tests). |
| 2. Copy and backup lose ownership and rewrite symlinks (CR-01) | CLOSED (ownership: see human item 4) | `VolumeMigrator.copyDirectory` is `cp -a -- src dest`, or `cp -a -- src/. dest` when merging into an existing directory; the source is `lstat`ed first so a missing source rejects with ENOENT and nothing is created; a non-directory collision is refused. `fs.cp` remains only on win32 with `verbatimSymlinks` and `preserveTimestamps`. The production image has no `USER`, so Docktor runs as root and `cp -a` preserves uid/gid. Tests for verbatim relative, absolute and dangling symlinks, file/dir modes and executable bit, timestamps, merge without nesting, single-file and symlink sources, ENOENT, and non-directory destination pass (volume-migrator.test.ts). The uid/gid test is root-gated and skipped (uid 1000 here). |
| 3. Equal env keys across services collapse (CR-02) | CLOSED | `EnvNameAllocator.allocate` tries `KEY`, then `<SERVICE>_KEY`, then `_2`..`_99`; a name is usable only if it is not a Docktor process-env variable, not `COMPOSE_*`/`DOCKER_*`, either already emitted with the same value, or an old-`.env` key with the same value, or otherwise not referenced by the compose file. `literalEnvValue` only extracts valid interpolation names and dotenv-safe values (`dotenv-format.ts`); unsafe entries stay inline. `rewrite(..., existingEnv)` is fed from `readOldEnv` (ENOENT-only) in both preview and execute; `writeNewEnv` appends only new names, or copies the old `.env` byte for byte when nothing was extracted. Tests "keeps each service's own value when the same key has different values", "shares one .env entry when the same key has the same value", reserved/COMPOSE_/DOCKER_/old-.env cases, and "fails the migration with rollback when the old .env cannot be read" pass. |

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Scan never includes Docktor's own stack, every other stack still offered | VERIFIED | Unchanged by round 2 apart from `DockerSelfStack` gaining `ownMounts()` from the same self inspect; `composeFilePaths` fail-open behaviour retained (docker-self-stack.test.ts, onboarding-service.test.ts pass) |
| 2 | Dialog opens larger; diff and steps readable at desktop and phone widths | VERIFIED in code; visual fit pending CI | `sm:max-w-5xl`, pinned header/footer, scrolling body; the new empty-source `Alert` uses `text-yellow-600 dark:text-yellow-400` and `break-all` on the path. Playwright not run (human item 2) |
| 3 | Real line diff, shared components | VERIFIED | `computeUnifiedDiff` in preview; `UnifiedDiffView`/`CodeEditor` in `migration-review-step.tsx`; extraction changes alter only the `${NAME}` text, still a splice-based minimal diff |
| 4 | Backup is its own explicit step; opt-out creates none, opt-in creates one whether renamed or not | VERIFIED | `execute` copies `originalDir` to `<new>/pre-migration-backup` iff `backup && !inPlace`; the copy is now faithful (gap 2). Ownership on real hosts: human item 4 |
| 5 | User can stop the old stack; if declined it is left running | VERIFIED in code; real Docker pending | `stopOldStack` gate, rollback `start` iff stopped; preflight refusals now happen before the stop (WR-01), so a bad request no longer stops the old stack at all |

### Observable truths (round-2 plan must-haves and carried-forward truths)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1-5 | The five ROADMAP SCs above | VERIFIED | see above |
| 6-10 | Original plan 18-01..18-05 truths (own-stack match, shared schemas, required flags, non-destructive rollback, review step/wizard) | VERIFIED (regression check) | files present and wired; server targeted suites and client wizard/import suites pass |
| 11-18 | Prior-round gap-closure truths (18-06..18-17: ENOENT-only empty source, exclusive mkdir/recordCreated, managed rows, skipped roots, relative mounts, in-place, background operation, hardening) | VERIFIED (regression check) | `migration-operation-service` (17), `onboarding-service`, `brownfield-scanner`, `brownfield-routes` suites pass; operation start/SSE wiring unchanged |
| 19 | No success report after silently not carrying a selected bind mount's data (18-19) | VERIFIED | see gap 1; behavior-dependent (rollback/ordering), backed by named passing tests, so not PRESENT_BEHAVIOR_UNVERIFIED |
| 20 | Copied bind-mount data and backup are faithful (18-18) | VERIFIED (ownership caveat) | see gap 2 |
| 21 | Rewrite preserves each service's effective environment (18-20) | VERIFIED | see gap 3 |
| 22 | An absolute source seen only through Docktor's own mounts is copied from that path (18-19) | VERIFIED | `locateAbsolute` + `mountDerivedPaths`; test with a temp-dir stand-in for `/host` |
| 23 | Every converted originalPath is declared by the compose file; newPath/volume names validated in preflight (WR-01) | VERIFIED | `assertDeclaredSources`, `copyDestinationViolations` (escape, stack-root only for the stack-directory mount, reserved names, equal/nested destinations, `VOLUME_NAME_PATTERN`) |
| 24 | Review step lists every emptySources entry, nothing when empty, dark-mode safe, one `MigrationPreview` type (18-21) | VERIFIED | `MigrationPreview.emptySources` in `brownfield-types.ts`; `emptySources={preview.emptySources}` in the wizard; conditional `Alert` in `migration-review-step.tsx`; wizard test with `["./missing","/srv/app/cache"]` passes (client migration-wizard + brownfield-import suites, 68 tests) |

**Score:** 21/21 must-haves verified (18 prior truths plus the three formerly failed truths 19-21; rows 22-24 are round-2 plan truths evidenced by the same code and tests and not counted separately). 0 behavior-unverified truths.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `server/src/infrastructure/volume-migrator.ts` | VERIFIED | `cp -a`, merge, lstat-first, win32 fallback; used by `migrator.copyDirectory` for backup and every bind copy |
| `server/src/domain/bind-mount-sources.ts`, `application/ports/own-mounts-port.ts` | VERIFIED | Pure resolver reusing `containerVisiblePaths`; port implemented by `DockerSelfStack`, injected as default `ownMounts` |
| `server/src/domain/migration-target.ts` | VERIFIED | `copyDestinationViolations`, `VOLUME_NAME_PATTERN`, `BACKUP_DIR_NAME` consumed by `MigrationService.planCopies` |
| `server/src/application/migration-service.ts` (736 lines) | VERIFIED | preflight/preview share `planCopies`; `bindCopies` in the plan; fail-closed copy |
| `server/src/infrastructure/compose-rewriter.ts`, `dotenv-format.ts`, `ports/compose-rewriter-port.ts` | VERIFIED | Allocator, reserved names, `existingEnv` parameter |
| `client/src/lib/brownfield-types.ts`, `migration-review-step.tsx`, `migration-wizard.tsx` | VERIFIED | Substantive and wired end to end |

### Key Link Verification

| From | To | Status |
|---|---|---|
| `MigrationService` -> `locateBindSource` -> `containerVisiblePaths` | WIRED (`planBindCopies`) |
| `MigrationService` -> `dockerSelfStack.ownMounts()` (constructor default) | WIRED |
| `MigrationService.execute` -> `migrator.copyDirectory(plan source, dest)` and backup copy | WIRED |
| `MigrationService` -> `rewriter.rewrite(compose, sels, named, existingEnv)` in preview and execute | WIRED |
| `routes/imports.ts` and `routes/setup.ts` preview -> `previewMigration` result (incl. `emptySources`) returned as is | WIRED |
| `MigrationWizard` -> `MigrationReviewStep emptySources` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Copied bind-mount data | `sourcePath` | compose-declared path, translated via Docktor's mounts, checked with `fs.access` | Yes | FLOWING (previously DISCONNECTED) |
| Review step empty-source note | `preview.emptySources` | `previewMigration` -> `planBindCopies` | Yes | FLOWING |
| `.env` extraction | `extractedEnv` | allocator over the real compose and old `.env` | Yes | FLOWING |

### Behavioral Spot-Checks (targeted unit files only)

| Scope | Result | Status |
|---|---|---|
| Server unit: volume-migrator, bind-mount-sources, docker-self-stack, migration-target, migration-service, compose-rewriter, dotenv-format | 7 files, 269 passed, 1 skipped (root-only chown test, uid 1000) | PASS |
| Server unit: migration-operation-service, onboarding-service, brownfield-scanner, brownfield-routes | 4 files, 126 passed | PASS |
| Client: migration-wizard, brownfield-import | 2 files, 68 passed | PASS |
| Not run (project rule) | `tsc --build`, Playwright, server integration tests, full suites | Deferred to CI (human items 1, 2) |

### Probe Execution

SKIPPED: no probes declared by the phase plans; no `scripts/*/tests/probe-*.sh` applies.

### Requirements Coverage

Requirement IDs declared across the 21 plans: STK-03, MIG-01, MIG-02, MIG-03, MIG-04 (round 2: 18-18 MIG-03, 18-19 MIG-04 + STK-03, 18-20 MIG-02, 18-21 MIG-01). All five are in REQUIREMENTS.md (lines 18-21, 27) and in the phase section of the ROADMAP; no orphaned requirement.

| Requirement | Source Plans (round 2) | Status | Evidence |
|---|---|---|---|
| STK-03 | 18-19 (and 18-01, 18-07, 18-09, 18-11, 18-13) | SATISFIED | Own-stack detection unchanged and still fail-open; `composeFilePaths` candidates unchanged. Caveat WR-10 (managed detection via `/host` alias) stays open |
| MIG-01 | 18-21 (and 18-04, 18-05, 18-10, 18-17) | SATISFIED in code; Playwright/visual in CI | Wide dialog; empty-source note readable in dark mode |
| MIG-02 | 18-20 (and 18-02, 18-04, 18-08, 18-09, 18-10) | SATISFIED | Real line diff over a non-lossy rewrite; env extraction now value-preserving. Caveat WR-06 (compose diff unmasked) open |
| MIG-03 | 18-18 (and 18-03, 18-05, 18-06, 18-12, 18-14, 18-15) | SATISFIED | Explicit step; the opted-in copy is now faithful. Root-owner proof on a real host is human item 4 |
| MIG-04 | 18-19 (and 18-03, 18-05, 18-06, 18-07, 18-12, 18-14..18-17) | SATISFIED in code; real-Docker proof pending | Fail-closed source handling, stop before copy, restart on rollback |

Housekeeping for the orchestrator: REQUIREMENTS.md currently marks all five as "Gaps Found" (commit 8ddd41b); with no gaps remaining they can move to Complete once the human items are accepted or resolved. `18-REVIEW-DISPOSITION.md` still lists CR-01..03, WR-01 and WR-09 as `open`; update them to closed.

### Anti-Patterns Found

TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER scan over the 13 source files changed in round 2: no matches; no `any` casts introduced. Pre-existing infos unchanged: `compose-analyzer.ts` `any` (IN-02), `console.error` in rollback paths.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none blocking) | | | | |

### Non-blocking items still open (unchanged, tracked in 18-REVIEW-DISPOSITION.md)

WR-02 (unauthenticated setup brownfield routes; human item 8), WR-03 (failed `docker.up` leaves containers), WR-04 (named-volume key prefix), WR-05 (stop by inferred project name; human item 7), WR-06 (compose diff secrets unmasked), WR-07 (rollback cleanup errors swallowed), WR-08 (toast lifecycle), WR-10 (`/host` alias in managed/in-place detection), WR-11 (`~` sources are now refused instead of silently emptied, but never rewritten), IN-01..IN-05. None falsifies a success criterion. One edge noted while reading: an absolute source that equals the compose directory but is spelled as a host path under a `/host` scan is not recognised as the stack-directory mount and is refused with an explicit 400 (fail closed; related to WR-10).

### Deferred items (Step 9b)

None. Phases 19-21 (sidebar/templates/version, visual consistency, release) do not cover any open item.

## Human Verification Required

Eight items in the frontmatter: CI type-check/unit/integration; CI Playwright incl. 360px and the empty-source note; a real-host `/host` absolute-source migration (present, absent, outside any mount); a root-owned database directory and backup fidelity check (the chown assertion is skipped without root); the blocked UAT tests 7 and 8 plus in-place; own-stack hiding and managed-row flagging on a real host; stop with a differing project name; and the WR-02 security decision.

## Gaps Summary

No gaps. The three data-fidelity defects from the previous round are closed in code and covered by passing tests, with WR-01 and WR-09 closed alongside. What remains is evidence that only CI, a real Docker host, a root run and a human can supply, plus the open WR-02 security decision, so the phase is `human_needed` rather than `passed`.

---

_Verified: 2026-10-17_
_Verifier: Claude (gsd-verifier)_
