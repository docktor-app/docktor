---
phase: 18-import-and-migration-flow
verified: 2026-10-18T13:00:00Z
status: human_needed
score: 28/28 must-haves verified
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
  - ".planning/phases/18-import-and-migration-flow/18-22-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-22-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-23-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-23-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-24-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-24-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-25-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-25-SUMMARY.md"
  - ".planning/phases/18-import-and-migration-flow/18-26-PLAN.md"
  - ".planning/phases/18-import-and-migration-flow/18-26-SUMMARY.md"
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
  - "server/src/application/container-state-catch-up.ts"
  - "server/src/application/managed-stack-guard.ts"
  - "server/src/application/migration-operation-service.ts"
  - "server/src/application/migration-service.ts"
  - "server/src/application/onboarding-service.ts"
  - "server/src/application/own-stack-guard.ts"
  - "server/src/application/ports/brownfield-scanner-port.ts"
  - "server/src/application/ports/compose-rewriter-port.ts"
  - "server/src/application/ports/directory-identity-port.ts"
  - "server/src/application/ports/external-stack-control-port.ts"
  - "server/src/application/ports/own-mounts-port.ts"
  - "server/src/application/ports/self-stack-port.ts"
  - "server/src/application/ports/stack-filesystem-port.ts"
  - "server/src/application/ports/volume-migrator-port.ts"
  - "server/src/application/stack-container-matcher.ts"
  - "server/src/application/subscribers/state-broadcast-subscriber.ts"
  - "server/src/domain/bind-mount-sources.ts"
  - "server/src/domain/compose-labels.ts"
  - "server/src/domain/compose-project-name.ts"
  - "server/src/domain/directory-identity.ts"
  - "server/src/domain/events.ts"
  - "server/src/domain/host-ports.ts"
  - "server/src/domain/managed-stack-paths.ts"
  - "server/src/domain/migration-operation.ts"
  - "server/src/domain/migration-target.ts"
  - "server/src/domain/self-stack-paths.ts"
  - "server/src/infrastructure/brownfield-scanner.ts"
  - "server/src/infrastructure/compose-analyzer.ts"
  - "server/src/infrastructure/compose-rewriter.ts"
  - "server/src/infrastructure/directory-identity-resolver.ts"
  - "server/src/infrastructure/disk-usage-scanner.ts"
  - "server/src/infrastructure/docker-self-stack.ts"
  - "server/src/infrastructure/dockerode-client.ts"
  - "server/src/infrastructure/dotenv-format.ts"
  - "server/src/infrastructure/external-stack-control.ts"
  - "server/src/infrastructure/probe-transport.ts"
  - "server/src/infrastructure/stack-filesystem.ts"
  - "server/src/infrastructure/volume-migrator.ts"
  - "server/src/jobs/state-poller.ts"
  - "server/src/lib/errors.ts"
  - "server/src/lib/json-lines-decoder.ts"
  - "server/src/lib/state-broadcaster.ts"
  - "server/src/repositories/stack-repository.ts"
  - "server/src/routes/imports.ts"
  - "server/src/routes/setup.ts"
  - "shared/src/validation/brownfield.ts"
  - "shared/src/validation/index.ts"
  - "shared/src/validation/migration-operation.ts"
covered_digest: "v3:sha256:3fd55372c6ae721470234b0189cbf16102219880d436f94a527a4a9ba24bba65"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 21/21
  gaps_closed:
    - "G-18-22-inplace / WR-10 (18-22): directory identity (fs.realpath plus Docktor's own bind mounts, namespace-tagged host:/container: keys) drives classifyMigrationTarget, findManagingStack and the managed-stack guard; a stacks-folder stack scanned through /host is classified in-place and migrated through the writable stacks-folder spelling"
    - "G-18-23-stop-ui (18-23): Docker events decoded line by line (JsonLinesDecoder), handled and reconciled in order per compose project under withKeyedLock, kill no longer subscribed"
    - "G-18-22-card (18-24): discovered-stacks card and setup wrapper max-w-6xl, directory cell wraps"
    - "G-18-22-status (18-25, 18-26): containers attributed to a stack by compose directory identity in events, reconcile and catch-up; a stop-off migration that would share the old stack's compose project name is refused in preflight (400) and step 4 forces the stop with the reason"
    - "G-18-27-managed-row (inline fix 57fd049): Already managed shown in the Status column, action cell reduced to the View link plus the disabled buttons"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "CI: run `yarn tsc --build`, the full workspace unit suites (all three workspaces, Linux, Windows, macOS) and the server integration tests on release/v0.1.1"
    expected: "Zero type errors (round 3 added DirectoryIdentityPort, StackContainerMatcher, JsonLinesDecoder, SharedProjectName and several changed constructor signatures; none was type-checked locally with the full build); all unit suites green on all three OSes (commit 4294d85 fixed a Windows-only path.resolve defect in the identity resolver); integration tests including health-probe.test.ts (constructs a StatePoller with the real repository) green"
    why_human: "Deferred to CI by project rule (no full tsc --build, no integration suites locally); only targeted unit files were run in this verification"
  - test: "CI: run the Playwright specs client/test/integration/setup-wizard.spec.ts and stacks-import.spec.ts on desktop chromium and mobile-chromium with PLAYWRIGHT_PORT"
    expected: "Four-step dialog walks through; empty-source note shows and wraps at 360px; the forced stop switch with the shared-project-name reason (18-26); the discovered-stacks card fits without horizontal table scroll at 1280px and the 360px phone layout does not overflow (18-24); managed rows disabled with the link; skipped roots listed"
    why_human: "Specs were written in plans 18-21, 18-24 and 18-26 and have never been executed locally; UAT covered the same surfaces by hand but not the automated specs"
  - test: "As root in the production image, migrate a stack whose bind mount holds a database directory owned by a non-root uid (e.g. Postgres) with the backup on; inspect ownership and symlinks in the new stack and in pre-migration-backup/"
    expected: "uid/gid, modes, timestamps and symlink targets equal the source's; the migrated database starts"
    why_human: "The ownership assertion in volume-migrator.test.ts is root-gated (it.skipIf) and skipped here (uid 1000, 1 skipped); CI runners are normally non-root, so the chown path of `cp -a` is not exercised anywhere automatically. UAT used a non-database stack (memos)"
  - test: "Migrate a stack whose compose project name differs from its directory (started with -p or a shell COMPOSE_PROJECT_NAME) with 'Stop the old stack' on"
    expected: "Old containers actually stop; the success toast is accurate"
    why_human: "Review WR-05 (open): `docker compose -f <file> stop` can exit 0 having stopped nothing when the project name is inferred wrongly; the 18-26 predictor sees only .env, name: and the directory, not -p or shell variables. Not part of the 11 UAT tests"
  - test: "Security decision on review WR-02: /api/setup/scan, /adopt and (once any user exists) /migrate, /migrate/preview and operation reads stay reachable without a session until the wizard is completed"
    expected: "Decide whether to require the step-1 session on all brownfield setup routes before release, or accept the exposure"
    why_human: "Product/security risk acceptance; explicitly deferred out of every gap round"
  - test: "Optional residual: on the documented container topology (host / mounted at /host), migrate a stack with an absolute bind source (e.g. /opt/app/data:/var/lib/data) once with the source present, once absent, once outside any mount"
    expected: "Present: data arrives. Absent: review step lists it, new stack starts with an empty folder. Outside any mount: 400 naming the path before anything is stopped"
    why_human: "UAT tests 7, 8 and 10 exercised the /host topology with a relative bind mount; the three absolute-source cases (CR-03) are covered only by unit tests with fakes and a temp-dir stand-in for the host root"
---

# Phase 18: Import and Migration Flow Verification Report

**Phase Goal:** Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Verified:** 2026-10-18
**Status:** human_needed
**Re-verification:** Yes, after gap-closure round 3 (plans 18-22..18-26) and two inline fixes (4294d85, 57fd049); prior status human_needed, 21/21

## Summary

All five ROADMAP success criteria hold in the code, all 26 plans have summaries, and the round-3 gaps from the UAT re-test (G-18-22-inplace with WR-10, G-18-23-stop-ui, G-18-22-card, G-18-22-status, G-18-27-managed-row) are closed in the source, not only in the SUMMARYs. 18-UAT.md records 11/11 passed with every gap resolved, so the real-host checks of the previous report (own-stack hiding and managed rows, in-place migration, backup on/stop on, backup off/stop off, phone width, card size) are verified by that UAT. No regression against the earlier truths was found. The status stays `human_needed` only because CI-only evidence (full type-check, all three OS unit jobs, integration tests, Playwright), a root-owned-data check, the WR-05 differing-project-name stop, and the WR-02 security decision cannot be settled programmatically here.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Scan never includes Docktor's own stack, every other stack still offered | VERIFIED | `OnboardingService.scan` applies `excludeOwnComposeFiles` over the self-stack lookup (fail-open) and annotates the rest through identity-based `managingStackOf`; UAT test 2 passed on a real host (own stack hidden, sibling listed). onboarding-service (41 tests) pass |
| 2 | Dialog opens larger; diff and steps readable at desktop and phone widths | VERIFIED (UAT tests 3, 9); Playwright pending CI | `sm:max-w-5xl` on the wizard `DialogContent`, pinned header/footer; discovered-stacks card widened to `max-w-6xl` with wrapping directory cell (18-24); UAT 3, 9 and 11 passed |
| 3 | Real line diff, shared components | VERIFIED | `migration-review-step.tsx` renders `UnifiedDiffView` and `CodeEditor`; server preview returns `computeUnifiedDiff` over a splice-based rewrite; UAT 4 passed after the re-test |
| 4 | Backup is its own explicit step; opt-out creates none, opt-in creates one whether renamed or not | VERIFIED | `execute` copies to `pre-migration-backup` iff `backup && !inPlace` (an in-place rename is itself the backup); `cp -a` fidelity (18-18); UAT 5, 7, 8 passed. Root-owner fidelity: human item 3 |
| 5 | User can stop the old stack; if declined it is left running | VERIFIED | `stopOldStack` gate in `execute`, restart on rollback; a stop-off request that would share the compose project name is refused in preflight (18-26); UAT 6, 7, 8 passed |

### Observable truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1-5 | The five ROADMAP SCs | VERIFIED | above |
| 6-23 | Plan 18-01..18-21 truths (own-stack match, shared schemas, required flags, non-destructive rollback, wizard, relative mounts, in-place, background operation and SSE progress, faithful copy, source resolution, per-service env, empty-source note) | VERIFIED (regression check) | Files present and wired; server suites volume-migrator, bind-mount-sources, compose-rewriter, dotenv-format, migration-operation-service, brownfield-scanner, brownfield-routes, state-poller pass; client migration-wizard and brownfield-import pass |
| 24 | A stack in the stacks folder reached through /host is classified in-place and migrated through the writable spelling (18-22) | VERIFIED | `MigrationService.assessTarget` identifies target and original via `DirectoryIdentityPort` and `classifyMigrationTarget(identity, identity)`; for `in-place` it re-addresses `composePath` and `originalDir` to the stacks-folder path. directory-identity (domain) and directory-identity-resolver (12) and migration-target tests pass; UAT 10 passed after the re-test |
| 25 | Managed rows and adopt/migrate refusals recognise /host and symlink spellings (18-22, WR-10) | VERIFIED | `identifyManagedStacks`/`managingStackOf`/`assertNotManaged(stacks, directories, path)` used by `OnboardingService.scan`, adopt and migrate; managed-stack-paths tests pass. Residual: unknown mounts degrade to identical-spelling matching (documented fail-safe) |
| 26 | A stop of a stack ends exited/STOPPED without a reload (18-23) | VERIFIED | Behavior-dependent (ordering). `JsonLinesDecoder` feeds `dispatch`, which runs `handleEvent` and `reconcileProject` under `withKeyedLock("state-poller:<project>")`; `dockerode-client` filter is `start, stop, die, health_status`. Named test in state-poller-event-stream.test.ts (kill, die, stop in one chunk, kill inspect slowest, ends exited/STOPPED) passes; the UAT gap is recorded resolved |
| 27 | A migrated stack's status reflects only its own containers (18-25) | VERIFIED | Behavior-dependent (filtering). `StackContainerMatcher.belongsTo` compares the container's compose directory with the stack's `hostPath` by canonical identity (fail-open for unlabelled containers and unknown mounts); wired in `StatePoller.handleEvent`, `reconcileProject` (`ownContainersOf`) and `ContainerStateCatchUp`. state-poller-stack-ownership, stack-container-matcher (7) and container-state-catch-up tests pass |
| 28 | A stop-off migration sharing the old stack's compose project name is refused before any side effect, and step 4 says why (18-26) | VERIFIED | Behavior-dependent (refusal before side effect). `MigrationService.preflight` throws `BadRequestError(sharedProjectNameRefusal)` when `!stopOldStack` and `sharedProjectName()` is non-null (separate targets only); `composeProjectName` follows .env, `name:`, directory; `target.sharedProjectName` flows through the shared schema to `stopRequirementOf` in `migration-wizard.tsx`. compose-project-name (domain), migration-service (111) and client wizard tests pass |

(Round-3 truths 24-28 plus the discovered-stacks width and Already-managed status cell: the card width is asserted in brownfield-import.test.tsx, "Already managed in place of the compatibility badge" at line 550; both pass and both passed UAT test 11.)

**Score:** 28/28 truths verified, 0 behavior-unverified.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `server/src/domain/directory-identity.ts`, `application/ports/directory-identity-port.ts`, `infrastructure/directory-identity-resolver.ts` | VERIFIED | Pure identity value object, port, and adapter with cached known mount view and POSIX-safe `absolutePath` (4294d85); consumed by migration-service, onboarding-service, managed-stack-guard, stack-container-matcher |
| `server/src/application/stack-container-matcher.ts`, `domain/compose-labels.ts` | VERIFIED | Singleton default injected into `StatePoller` and `ContainerStateCatchUp` |
| `server/src/lib/json-lines-decoder.ts`, `jobs/state-poller.ts` | VERIFIED | Decoder per stream, per-project keyed lock for events and reconcile |
| `server/src/domain/compose-project-name.ts`, `application/migration-service.ts` | VERIFIED | Predictor and preflight refusal; `shared/src/validation/brownfield.ts` carries `sharedProjectNameSchema` |
| `client/.../migration-old-stack-step.tsx`, `migration-wizard.tsx`, `brownfield-import.tsx`, `discovered-stack-actions.tsx`, `brownfield-step.tsx` | VERIFIED | Forced stop with source-specific reason, Already managed in the Status column, `max-w-6xl` |

### Key Link Verification

| From | To | Status |
|---|---|---|
| `MigrationService.assessTarget` -> `DirectoryIdentityPort.identifyLocal` -> `classifyMigrationTarget` | WIRED |
| `OnboardingService.scan/adopt` and `MigrationService` -> `managed-stack-guard` (identity) | WIRED |
| `StatePoller.handleEvent` / `reconcileProject` / `ContainerStateCatchUp.catchUp` -> `StackContainerMatcher.belongsTo` | WIRED |
| `startEventStream` -> `JsonLinesDecoder.push` -> `dispatch` -> `withKeyedLock` -> `handleEvent` | WIRED |
| `MigrationService.preflight` -> `sharedProjectName` -> preview `target.sharedProjectName` -> wizard `StopRequirement` | WIRED |
| `BrownfieldImport` Status cell -> `ToneBadge` "Already managed" when `stack.managedStack` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Directory identity keys | `view.mounts` | `DockerSelfStack.ownMounts()` (container inspect) plus `fs.realpath` | Yes | FLOWING |
| Container ownership | compose directory label | live Docker container labels vs `stack.hostPath` (prisma column via `findByComposeProject`) | Yes | FLOWING |
| Shared-project-name notice | `preview.target.sharedProjectName` | old compose file and `.env` read in `previewMigration` | Yes | FLOWING |

### Behavioral Spot-Checks (targeted unit files only)

| Scope | Result | Status |
|---|---|---|
| Server unit, round 3: directory-identity, directory-identity-resolver, migration-target, managed-stack-paths, compose-project-name, compose-labels, migration-service, onboarding-service, stack-container-matcher, container-state-catch-up, state-poller-stack-ownership, state-poller-event-stream, json-lines-decoder, dockerode-client | 14 files, 320 passed | PASS |
| Server unit, regression: volume-migrator, bind-mount-sources, compose-rewriter, dotenv-format, migration-operation-service, brownfield-scanner, state-poller | 8 files (incl. directory-identity), 242 passed, 1 skipped (root-only chown, uid 1000) | PASS |
| Server unit: brownfield-routes | 41 passed | PASS |
| Shared: brownfield validation | 58 passed | PASS |
| Client: brownfield-import, migration-wizard | 2 files, 77 passed | PASS |
| Not run (project rule) | `tsc --build`, Playwright, server integration, full suites | Deferred to CI (human items 1, 2) |

### Probe Execution

SKIPPED: no probes declared by the phase plans; no `scripts/*/tests/probe-*.sh` applies.

### Requirements Coverage

Requirement IDs declared across the 26 plans' frontmatter: STK-03, MIG-01, MIG-02, MIG-03, MIG-04 (18-22 carries STK-03, MIG-02, MIG-03, MIG-04; 18-23 MIG-04; 18-24 STK-03; 18-25 MIG-04; 18-26 MIG-04, MIG-01). All five are defined in REQUIREMENTS.md (lines 18-21, 27) and mapped to Phase 18 in its traceability table and in the ROADMAP phase section. No ID is missing and none is orphaned.

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| STK-03 | 18-01, 07, 09, 11, 13, 19, 22, 24 | SATISFIED | Own stack hidden, others listed, managed rows flagged by identity and refused with 409; UAT 2 and 11 |
| MIG-01 | 18-04, 05, 10, 17, 21, 26 | SATISFIED | Wide dialog, readable steps; UAT 3, 9; Playwright in CI |
| MIG-02 | 18-02, 04, 08, 09, 10, 20, 22 | SATISFIED | Real line diff via `UnifiedDiffView`/`CodeEditor` over a non-lossy rewrite; UAT 4. Caveat WR-06 (compose diff secrets unmasked) open |
| MIG-03 | 18-03, 05, 06, 12, 14, 15, 18, 22 | SATISFIED | Explicit backup step, opt-out creates none, faithful opt-in copy; UAT 5, 7, 8. Root-owner proof: human item 3 |
| MIG-04 | 18-03, 05, 06, 07, 12, 14..17, 19, 22, 23, 25, 26 | SATISFIED | Stop gate, rollback restart, ordered state, project-name refusal; UAT 6, 7, 8 |

Housekeeping for the orchestrator (not verification failures): REQUIREMENTS.md still shows MIG-02 and MIG-03 unchecked and "Gaps Found" in the traceability table although no gap remains; ROADMAP.md still reads "26/26 plans executed (5 gap-closure plans pending, round 3)" with the Phase 18 checkbox open; 18-REVIEW-DISPOSITION.md lists all 19 findings as `open` (CR-01..03, WR-01, WR-09 and WR-10 are closed in code).

### Anti-Patterns Found

TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER scan over the round-3 source files (directory identity, resolver, matcher, labels, project-name, decoder, migration-service, managed-stack-guard, state-poller, catch-up, wizard, old-stack step, import card and actions): no matches. The `as` narrowings in `state-poller.ts` carry explanatory comments; no `as any` introduced.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none blocking) | | | | |

### Non-blocking items still open (tracked in 18-REVIEW-DISPOSITION.md)

WR-02 (unauthenticated setup brownfield routes; human item 5), WR-03 (failed `docker.up` leaves containers), WR-04 (named-volume key prefix), WR-05 (stop by inferred project name; human item 4), WR-06 (compose diff secrets unmasked), WR-07 (rollback cleanup errors swallowed), WR-08 (toast lifecycle), WR-11 (`~` sources refused, never rewritten), IN-01..IN-05. None falsifies a success criterion.

### Deferred items (Step 9b)

None. Phases 19-21 (sidebar/templates/version, visual consistency and touch targets, release) do not cover any open item.

## Human Verification Required

Six items in the frontmatter: CI type-check/unit (3 OS)/integration; CI Playwright; root-owned database fidelity; stop with a differing project name (WR-05); the WR-02 security decision; and an optional absolute-bind-source run on the /host topology. Everything the previous report listed for own-stack hiding, managed rows, in-place and not-in-place migrations, backup on/off, stop on/off and phone width is verified by the completed UAT (11/11).

## Gaps Summary

No gaps. Round 3 closed the five UAT re-test gaps in code with passing targeted tests, and the UAT confirms them on a real host. The phase is `human_needed` rather than `passed` only because of CI-only evidence, the root-ownership and WR-05 real-host checks, and the open WR-02 security decision.

---

_Verified: 2026-10-18_
_Verifier: Claude (gsd-verifier)_
