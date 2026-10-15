---
phase: 18-import-and-migration-flow
verified: 2026-10-15T10:00:00Z
status: gaps_found
score: 14/16 must-haves verified
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
  - "client/src/components/domain/stack/brownfield-import.tsx"
  - "client/src/lib/env-mask.ts"
  - "client/src/routes/setup/components/migration-backup-step.tsx"
  - "client/src/routes/setup/components/migration-old-stack-step.tsx"
  - "client/src/routes/setup/components/migration-review-step.tsx"
  - "client/src/routes/setup/components/migration-select-step.tsx"
  - "client/src/routes/setup/components/migration-step-indicator.tsx"
  - "client/src/routes/setup/components/migration-wizard.tsx"
  - "server/src/application/migration-service.ts"
  - "server/src/application/onboarding-service.ts"
  - "server/src/domain/self-stack-paths.ts"
  - "server/src/infrastructure/brownfield-scanner.ts"
  - "server/src/infrastructure/docker-self-stack.ts"
  - "server/src/infrastructure/external-stack-control.ts"
  - "server/src/routes/imports.ts"
  - "server/src/routes/setup.ts"
  - "shared/src/validation/brownfield.ts"
covered_digest: "v3:sha256:7e2c2ff0fad7ba2ade73240d3625de6df45d1b12c5ff6f8e17af4e9e5ba72015"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "On any failure, rollback removes only the new stack directory Docktor created and its record, restarts the old stack with `docker compose start` only if Docktor stopped it, and never deletes or rewrites the original directory (18-03, D-09, D-11)"
    status: partial
    reason: "CR-01 (confirmed in code): a bind-mount copy failure (EACCES, ENOSPC, mid-copy I/O error, fs.cp self-subdirectory error) is swallowed by a bare catch that falls through to mkdir(destPath). The migration then reports success: true with an empty or half-copied data directory. Because stopOldStack defaults to on, the old stack is already stopped, so the user is told data moved when it did not, and the rollback/restart path that this phase built never fires for this failure class. The swallow predates phase 18 (commit ffecf69), but phase 18 made it hazardous by adding stop-before-copy and by stating an 'on any failure' rollback guarantee."
    artifacts:
      - path: "server/src/application/migration-service.ts"
        issue: "Lines 170-176: try { fs.access(srcPath); copyDirectory(...) } catch { mkdir(destPath) } treats every error as 'source does not exist'"
    missing:
      - "Treat only ENOENT from fs.access as 'empty source' (mkdir); let copyDirectory and non-ENOENT access errors propagate to the rollback catch"
      - "Unit test: copyDirectory rejecting for a bind-mount selection yields success:false, removes the new directory and calls oldStack.start"
  - truth: "Rollback removes only the new stack directory Docktor created in this run (D-09 invariant: 'rollback can never delete pre-existing data')"
    status: partial
    reason: "CR-02 (confirmed in code): the exists/checkTargetDirectory checks are check-then-act, and createDirectory uses mkdir recursive, which succeeds on an existing directory, after which createdStackDir is set unconditionally. stackRepo.delete(stackId) in the catch is unconditional (no recordCreated flag). With stopOldStack the window between check and create can be up to the 120 s compose stop timeout, and the UI keeps the row's Migrate button enabled until a migration succeeds (brownfield-import.tsx marks a row Imported only on success), so a second same-name migration can be started while the first is in flight. A failure in either run can then delete the directory and DB record of the other. The original (old) directory is never touched, so no source data is at risk; the damage is to the new stack being created. Sequential flows are guarded correctly."
    artifacts:
      - path: "server/src/application/migration-service.ts"
        issue: "Lines 108-119 (TOCTOU checks), 134-135 (createdStackDir set unconditionally), 236-246 (unconditional directory and record delete)"
      - path: "server/src/infrastructure/stack-filesystem.ts"
        issue: "createDirectory uses recursive mkdir, so EEXIST never aborts"
    missing:
      - "Exclusive leaf mkdir (no recursive) so EEXIST aborts before createdStackDir is set"
      - "recordCreated flag; call stackRepo.delete only when this run created the record"
      - "Per-slug in-flight guard in MigrationService (and ideally disable Migrate/Adopt for in-flight rows on the client)"
human_verification:
  - test: "Run `yarn tsc --build` and the full workspace unit suites in CI on release/v0.1.1"
    expected: "Zero type errors; all unit tests green"
    why_human: "Deferred to CI per the VPS rule (no full tsc --build). Targeted unit runs below passed."
  - test: "Run the Playwright flow in client/test/integration/setup-wizard.spec.ts (desktop chromium and mobile-chromium, with PLAYWRIGHT_PORT) in CI"
    expected: "Four-step dialog walks through; sent backup/stopOldStack flags match the switches; at 360px the dialog fits horizontally, the diff region is visible on step 2 and Confirm & Migrate is reachable on step 4"
    why_human: "Playwright is deferred to CI per the VPS rule. This is the only automated evidence for ROADMAP SC2 (dialog size and readability at desktop and phone widths); visual quality also needs a human look."
  - test: "Run server integration tests (server/test/integration/imports.test.ts) in CI"
    expected: "Migrate endpoints reject a body missing backup or stopOldStack with 400; setup and import route families behave identically"
    why_human: "Integration tests need a real DB and are deferred to CI per the VPS rule."
  - test: "On a real host with Docktor running in a container and a second compose stack on the same host, open Import existing stack and scan the directory that holds Docktor's own compose file and the other stack"
    expected: "Docktor's own compose file is not listed; the other stack is. Also confirm the exclusion works through the real /host bind-mount layout."
    why_human: "Real inspect/label/mount behaviour of the Docker daemon cannot be exercised by the unit tests (the adapter is tested with fakes)."
  - test: "Migrate a real stack whose project name differs from its directory name (started with -p or COMPOSE_PROJECT_NAME) with 'Stop the old stack' on"
    expected: "Old stack containers actually stop and the new stack deploys without port conflicts; the success toast ('The old stack was stopped.') is accurate"
    why_human: "WR-07: `docker compose -f <file> stop` may exit 0 while stopping nothing when the project name is inferred wrongly. Cannot be checked without a real Docker daemon."
---

# Phase 18: Import and Migration Flow Verification Report

**Phase Goal:** Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Verified:** 2026-10-15
**Status:** gaps_found
**Re-verification:** No, initial verification

## Summary

All five ROADMAP success criteria are implemented and wired in the code, and all targeted unit tests pass. Two critical code-review findings (CR-01, CR-02) do break explicit must-have claims of plan 18-03 (the "on any failure" rollback guarantee and the "only what Docktor created" deletion invariant), so the status is `gaps_found`. Neither gap blocks a ROADMAP success criterion on the happy path, and neither can touch the original directory. Both are small, localised fixes in `migration-service.ts` (plus an exclusive mkdir in `stack-filesystem.ts`).

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Scan never includes Docktor's own stack; every other stack still offered | VERIFIED | `OnboardingService.scan()` runs scanner and `selfStack.composeFilePaths()` in parallel and filters through `excludeOwnComposeFiles` (exact file equality, so a sibling compose file in the same directory stays). `DockerSelfStack` inspects own container via compose labels plus bind mounts, fail-open (returns `[]` on not-containerized, rejected inspect, or 5 s timeout); the service also catches a throwing port. Both `/api/setup/scan` and `/api/stacks/import/scan` call the single `onboardingService.scan`. `**/pre-migration-backup/**` added to scanner ignores. 19 + 8 + 33 + 17 tests pass (self-stack-paths, docker-self-stack, onboarding-service, brownfield-scanner). |
| 2 | Dialog opens larger; diff and steps readable at desktop and phone widths without clipping | VERIFIED in code; visual/phone fit PRESENT, needs CI | `DialogContent` gets `sm:max-w-5xl max-h-[90dvh] p-4 sm:p-6`; header and footer are outside the `min-h-0 flex-1 overflow-y-auto` step body, so they stay pinned; footer buttons are `w-full sm:w-auto`; diff sits in `ScrollArea max-h-[50vh]`. A 360px Playwright test exists (`setup-wizard.spec.ts:639`) but was not run (deferred to CI, see human verification). |
| 3 | Real line diff, added and removed lines individually marked, rendered with the shared component | VERIFIED (with note) | `previewMigration` returns `computeUnifiedDiff(original, rewritten)`; `generateDiff` and `diff-viewer.tsx` are gone (grep confirms no references). `MigrationReviewStep` renders `UnifiedDiffView` (the same renderer as the stack-edit review) with +N / -N `ToneBadge` counters, plus the extracted `.env` in a read-only `CodeEditor` with masking. Route test "returns a real UnifiedDiff computed from the compose file" passes. Note: the roadmap says "shared code editor component"; CONTEXT.md (line 86) records the deliberate decision that the diff uses `UnifiedDiffView` and only the `.env` preview uses `CodeEditor`. Accepted as the documented interpretation. |
| 4 | Backup is its own explicit step, opt-out creates none, opt-in creates one regardless of rename | VERIFIED | `MigrationBackupStep` (switch, default on, off-state warning) is step 3; `backup` is a required boolean in `migrationExecuteSchema` (no default) and is forwarded by both routes. `migrate()` calls `migrator.copyDirectory(originalDir, <newStack>/pre-migration-backup)` iff `backup`, unconditionally of rename or compose changes; nothing writes to the OS temp dir. Tests assert both branches (migration-service.test.ts, 15 pass). |
| 5 | User can stop old stack; if declined it is left running | VERIFIED | `MigrationOldStackStep` (switch, default on, ports-conflict warning, summary) is step 4; `stopOldStack` required boolean. `migrate()` calls `oldStack.stop(composePath)` before `createDirectory` and only when `stopOldStack` is true; never calls `stop`/`start` otherwise (test "never stops or starts the old stack when stopOldStack is false"). `ExternalStackControl` is argv-only `docker compose -f <file> stop`/`start` with a 120 s timeout; stop failure aborts fail-closed. Limitations tracked as WR-07 below. |

### Plan must-have truths (non-duplicates of the SCs)

| # | Truth (plan) | Status | Evidence |
|---|---|---|---|
| 1 | Host label path matched through own bind mounts and as identical path, no hard-coded `/host` (18-01) | VERIFIED | `containerVisiblePaths` in `self-stack-paths.ts` |
| 2 | `skippedDirectories` unchanged, no hidden-row note (18-01) | VERIFIED | `scan()` spreads result and replaces only `stacks`; no UI note in `brownfield-import.tsx` |
| 3 | All five request bodies on shared Zod schemas; compose path rule rejects non-compose names and NUL (18-02) | VERIFIED | `shared/src/validation/brownfield.ts`; both route files import the schemas, no inline body schemas; 25 shared tests pass |
| 4 | Both migrate endpoints require explicit `backup` and `stopOldStack` (18-03) | VERIFIED | `z.boolean()` without default; client `executeMigration` posts the typed `MigrationExecuteInput` |
| 5 | Target directory existing or overlapping the old stack is refused before anything is stopped or created (18-03) | VERIFIED for sequential requests | `checkTargetDirectory` runs before stop; race case tracked as gap CR-02 |
| 6 | New stack still deployed with `docker.up` after the copy (18-03) | VERIFIED | `migration-service.ts` line 227 |
| 7 | On any failure, rollback is non-destructive and restarts old stack iff stopped (18-03) | FAILED (partial) | Works for failures that propagate (up, stop, path-confinement, backup copy, named-volume copy). Does not cover swallowed bind-mount copy errors: gap CR-01 |
| 8 | Rollback removes only what Docktor created in this run (18-03) | FAILED (partial) | Gap CR-02 (concurrent same-slug requests) |
| 9 | Review step: +N/-N counters, empty-diff text, `.env` omitted when empty, masked `.env`, reset on Back/close (18-04) | VERIFIED | `migration-review-step.tsx` (local `useState`, step unmounts on Back); `env-mask.ts` shared with `diff-confirm-dialog.tsx`; client tests pass |
| 10 | Four steps, "Step n of 4" indicator with `aria-current`, focus moves to step body, Back keeps state, stale preview ignored, 44px rows (18-05) | VERIFIED | `migration-wizard.tsx` (`previewRequestId` guard, `stepBodyRef.focus()`), `migration-step-indicator.tsx`, `min-h-11 md:min-h-0` rows |
| 11 | Confirm & Migrate hands off once and closes; toasts name kept backup / stopped old stack; failure shows server message or fallback (18-05) | VERIFIED | `brownfield-import.tsx` `successDescription`, `handleConfirmMigrate`; 12 brownfield-import tests pass |

**Score:** 14/16 must-haves verified (5/5 ROADMAP SCs implemented; 2 plan-level truths partial because of CR-01 and CR-02). 0 behavior-unverified truths.

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `server/src/domain/self-stack-paths.ts` | VERIFIED | Pure, substantive, imported by adapter and service |
| `server/src/application/ports/self-stack-port.ts`, `external-stack-control-port.ts` | VERIFIED | Wired via constructor-injected defaults |
| `server/src/infrastructure/docker-self-stack.ts` | VERIFIED | Wired as `OnboardingService` default |
| `server/src/infrastructure/external-stack-control.ts` | VERIFIED | Wired as `MigrationService` default |
| `shared/src/validation/brownfield.ts` | VERIFIED | Used by both route families and the client API clients (type import) |
| `client/src/routes/setup/components/migration-{backup,old-stack,review,select,step-indicator}.tsx` and `migration-wizard.tsx` | VERIFIED | All rendered from the wizard |
| `client/src/lib/env-mask.ts` | VERIFIED | Used by review step and `diff-confirm-dialog.tsx` |
| `diff-viewer.tsx`, `ComposeRewriter.generateDiff` | Correctly deleted | No remaining references |

### Key Link Verification

| From | To | Status |
|---|---|---|
| `onboarding-service.ts` -> `SelfStackPort.composeFilePaths()` | WIRED |
| `docker-self-stack.ts` -> `ownComposeFileCandidates()` | WIRED |
| `imports.ts` / `setup.ts` -> shared schemas, `migrationService.migrate({...rest})` | WIRED |
| `migration-service.ts` -> `computeUnifiedDiff`, `oldStack.stop/start`, `migrator.copyDirectory(originalDir, ...)` | WIRED |
| `migration-wizard.tsx` -> `MigrationReviewStep` -> `UnifiedDiffView` | WIRED |
| `brownfield-import.tsx` -> `api.executeMigration({... backup, stopOldStack})` -> `import-api.ts` / `setup-api.ts` | WIRED |

### Behavioral Spot-Checks (targeted unit tests only)

| Scope | Command | Result |
|---|---|---|
| Server: migration-service, self-stack-paths, docker-self-stack, external-stack-control, onboarding-service, brownfield-scanner, brownfield-routes | `vitest run --project unit` (named files) | 7 files, 118 tests passed |
| Client: migration-wizard, brownfield-import, env-mask | `vitest run` (named files) | 3 files, 43 tests passed |
| Shared: brownfield schemas | `vitest run` (named file) | 25 tests passed |
| Not run (VPS rule) | `tsc --build`, Playwright, server integration | Deferred to CI, listed under human_verification |

### Probe Execution

SKIPPED: no probes declared by the phase plans and no `scripts/*/tests/probe-*.sh` applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| STK-03 | 18-01 | Import does not offer Docktor's own stack | SATISFIED | Scan-level exclusion, fail-open; service-level guard on adopt/migrate is absent (WR-09, non-blocking) |
| MIG-01 | 18-04, 18-05 | Migration diff in a larger, readable dialog | SATISFIED in code; Playwright/visual in CI | Dialog `sm:max-w-5xl`, pinned header/footer, scrolling body |
| MIG-02 | 18-02, 18-04 | Real line diff in the shared renderer | SATISFIED | `UnifiedDiffView` over `computeUnifiedDiff`; see SC3 note |
| MIG-03 | 18-03, 18-05 | Opt-out pre-migration backup as its own step | SATISFIED | Step 3, required `backup` flag, `pre-migration-backup/` copy |
| MIG-04 | 18-03, 18-05 | Stop old stack as part of migration | SATISFIED | Step 4, required `stopOldStack` flag, `compose stop` before copy, `compose start` on rollback |

All five phase IDs are claimed by plan frontmatter and marked Complete in REQUIREMENTS.md (lines 18-21, 27, 82-86). No orphaned requirements.

### Anti-Patterns Found

`grep` for TBD/FIXME/XXX/TODO/HACK across all phase source files: none. Other findings are the code-review items below.

## Code Review Triage (18-REVIEW.md: 2 critical, 9 warning, 4 info)

### Break a phase must-have (recorded as gaps)

| ID | Verdict | Reasoning |
|---|---|---|
| CR-01 | GAP (partial) | Confirmed at `migration-service.ts:170-176`. Contradicts the 18-03 truth "On any failure, rollback ...". High-stakes now because the old stack is stopped by default before this copy runs. |
| CR-02 | GAP (partial) | Confirmed at `migration-service.ts:108-119, 134-135, 236-246`. Contradicts "rollback removes only the directory Docktor created". Needs a concurrent same-name request to trigger; original directory is never at risk. Lower severity than CR-01. |

### Non-blocking (do not break a must-have or SC; track as follow-ups)

| ID | Note |
|---|---|
| WR-01 | Relative bind mounts are not copied into the new stack (only the opt-in backup holds them). Pre-existing migration design; outside the five phase requirements, but the dialog copy over-promises. Recommend a follow-up issue or an explicit "not migrated" warning. |
| WR-02 | Bind-mount copy source (`originalPath`) is not confined or tied to the compose file. Pre-existing; behind auth after setup. Security hardening follow-up. |
| WR-03 | `/api/setup/migrate` is unauthenticated while the wizard is incomplete and now can run `docker compose stop` (with `stopOldStack`). Same exposure model as the existing setup routes, restricted to compose-named paths; recommend a `hasAnyUser()`-style guard as a follow-up. Worth a security glance before release. |
| WR-04 | Default `newPath` collision for same-basename bind mounts; duplicate React keys. Edge case. |
| WR-05 | Failed `docker.up` leaves containers/networks behind after rollback (no `down` without `-v`). |
| WR-06 | Compose diff shows secret values unmasked (only the extracted `.env` is masked). D-05 and the plan truth cover only the `.env` preview, so not a must-have breach, but a real UX/security inconsistency with `diff-confirm-dialog`. |
| WR-07 | `compose stop` relies on the inferred project name; success toast can claim the old stack was stopped when it was not. MIG-04 works for the common case; covered by a human verification item. |
| WR-08 | Named-volume copy uses the unprefixed compose key as Docker volume name. Pre-existing. |
| WR-09 | No service-level guard against adopting/migrating Docktor's own stack via a direct API call. STK-03 and SC1 are about what the scan offers, which is satisfied; recommend reusing `excludeOwnComposeFiles` in `migrate`/`adoptInPlace` as hardening (a stop on Docktor itself would be severe). |
| IN-01..IN-04 | Symlink/`..` in compose path, whitespace-only display name, restart starts all services, `any`/`console.error`/`cause` convention nits. |

## Human Verification Required

See `human_verification` in the frontmatter: CI type-check and unit suites, CI Playwright (including the 360px case, the only automated evidence for SC2), CI server integration, a real-Docker check that Docktor's own stack is hidden, and a real-Docker check that stop works for a stack whose project name differs from its directory.

## Gaps Summary

Both gaps sit in `MigrationService.migrate()` and share one root: the rollback guarantee added by plan 18-03 is correct for failures that propagate, but not for the swallowed bind-mount copy error (CR-01) and not for concurrent same-slug requests (CR-02). Suggested closure plan: (1) narrow the catch to ENOENT and add a failing-copy rollback test, (2) make directory creation exclusive, add `recordCreated`, add a per-slug in-flight guard, with tests for each. WR-09 and WR-03 are cheap to fold into the same plan and are recommended, but are not required to close the gaps.

---

_Verified: 2026-10-15_
_Verifier: Claude (gsd-verifier)_
