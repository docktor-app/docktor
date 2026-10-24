---
phase: 18-import-and-migration-flow
verified: 2026-10-18T14:00:00Z
status: passed
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
  - "server/test/unit/routes/brownfield-routes.test.ts"
  - "shared/src/validation/brownfield.ts"
  - "shared/src/validation/index.ts"
  - "shared/src/validation/migration-operation.ts"
covered_digest: "v3:sha256:3c95fb0c49fd57b85e9188061251cfbf88184aac4cb2db4122352f6bc8c15b54"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 28/28
  gaps_closed:
    - "WR-02 (2cbacb5): every setup brownfield route (scan, adopt, migrate, migrate/preview, migrations list, migrations get) now runs requireAdminAccount (400 before the admin exists) and then requireAuth (401 without the step-1 session)"
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 18: Import and Migration Flow Verification Report

**Phase Goal:** Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Verified:** 2026-10-18
**Status:** passed
**Re-verification:** Yes, after commit 2cbacb5 (review finding WR-02); prior status human_needed, 28/28

## Summary

All five ROADMAP success criteria and all 28 truths hold. The only source change since the previous verification is 2cbacb5, which closes review finding WR-02 (the human decision item of the last report). It was re-checked in source and by its unit file. Nothing else changed in `server/`, `client/` or `shared/` since b50ad0a (`git diff --stat b50ad0a HEAD` lists exactly `server/src/routes/setup.ts` and `server/test/unit/routes/brownfield-routes.test.ts`), so the earlier evidence for every other truth still holds and was not repeated.

The human items of the previous report are resolved: 18-UAT.md is 11/11 passed (0 issues), the user manually passed the absolute-bind-source check on the `/host` setup, and the remaining items are explicitly accepted by the user as deferred, not gaps (see Acknowledged Gaps).

## WR-02 Re-check (delta 2cbacb5)

| Check | Evidence | Status |
|---|---|---|
| All brownfield setup routes carry the guard | `server/src/routes/setup.ts` lines 128-210: `POST /api/setup/scan`, `POST /api/setup/adopt`, `POST /api/setup/migrate/preview`, `POST /api/setup/migrate`, `GET /api/setup/migrations`, `GET /api/setup/migrations/:operationId` each use `preHandler: requireWizardSession`; grep of `preHandler` shows no brownfield route without it | VERIFIED |
| Order and semantics | `requireWizardSession = [requireAdminAccount, requireAuth]`: the account guard throws `BadRequestError` (400) while `hasAnyUser()` is false, then `requireAuth` (from `lib/auth-middleware.ts`) resolves the better-auth session and throws `UnauthorizedError` (401) without one; Fastify runs a preHandler array in order | VERIFIED |
| Wizard still works | `client/src/routes/setup.tsx` signs in (`signIn.email`) right after step 1; `apiFetch` sends `credentials: "include"`, so the scan/migrate calls from `setup-api.ts` carry the session cookie | VERIFIED |
| Wizard-complete gate unaffected | The plugin-level `preHandler` hook (410 once `isWizardComplete()`) still runs before the route-level handlers; the integration regression guard in `imports.test.ts` (scan/adopt 410 after complete) is unchanged and still applies. `/api/stacks/import/*` is untouched | VERIFIED |
| Tested | `brownfield-routes.test.ts` adds a `describe` "setup brownfield routes without a session (WR-02)": 6 routes via `it.each` answer 401 with `requireAuth` rejecting and `scan`/`adoptInPlace` not called; plus "answers 400 before an admin exists without consulting the session". Run: 1 file, 48 passed | PASS |

Residual (not a gap): a signed-in caller who lacks mandatory two-factor enrolment gets 403 from `requireAuth` on these routes. That is the project-wide gate and also applies to the wizard admin after step 1 only when the instance mandates two-factor; it is existing behaviour, not introduced here.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Scan never includes Docktor's own stack, every other stack still offered | VERIFIED | `OnboardingService.scan` applies `excludeOwnComposeFiles` over the self-stack lookup (fail-open) and annotates the rest through identity-based `managingStackOf`; UAT test 2 passed on a real host. The setup scan route is now additionally session-gated (WR-02) without changing what it returns |
| 2 | Dialog opens larger; diff and steps readable at desktop and phone widths | VERIFIED (UAT tests 3, 9, 11) | `sm:max-w-5xl` on the wizard `DialogContent`, pinned header/footer; discovered-stacks card `max-w-6xl` with wrapping directory cell; Playwright specs run in CI |
| 3 | Real line diff, shared components | VERIFIED | `migration-review-step.tsx` renders `UnifiedDiffView` and `CodeEditor`; server preview returns `computeUnifiedDiff` over a splice-based rewrite; UAT 4 passed |
| 4 | Backup is its own explicit step; opt-out creates none, opt-in creates one whether renamed or not | VERIFIED | `execute` copies to `pre-migration-backup` iff `backup && !inPlace`; `cp -a` fidelity (18-18); UAT 5, 7, 8 passed. Root-owner fidelity is an acknowledged deferral |
| 5 | User can stop the old stack; if declined it is left running | VERIFIED | `stopOldStack` gate in `execute`, restart on rollback; a stop-off request that would share the compose project name is refused in preflight (18-26); UAT 6, 7, 8 passed. Differing-project-name stop is an acknowledged known issue (WR-05) |

### Observable truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1-5 | The five ROADMAP SCs | VERIFIED | above |
| 6-23 | Plan 18-01..18-21 truths (own-stack match, shared schemas, required flags, non-destructive rollback, wizard, relative mounts, in-place, background operation and SSE progress, faithful copy, source resolution, per-service env, empty-source note) | VERIFIED (regression check) | No source change in these areas since the previous verification (only `setup.ts` route guards and their test changed); earlier targeted suites stand |
| 24 | A stack in the stacks folder reached through /host is classified in-place and migrated through the writable spelling (18-22) | VERIFIED | `MigrationService.assessTarget` + `DirectoryIdentityPort` + `classifyMigrationTarget`; UAT 10 passed |
| 25 | Managed rows and adopt/migrate refusals recognise /host and symlink spellings (18-22, WR-10) | VERIFIED | `identifyManagedStacks`/`managingStackOf`/`assertNotManaged`; unchanged |
| 26 | A stop of a stack ends exited/STOPPED without a reload (18-23) | VERIFIED | Behavior-dependent (ordering): `JsonLinesDecoder` + per-project keyed lock; named test in state-poller-event-stream.test.ts passed in the previous run; code unchanged |
| 27 | A migrated stack's status reflects only its own containers (18-25) | VERIFIED | Behavior-dependent (filtering): `StackContainerMatcher.belongsTo` wired in poller, reconcile and catch-up; tests passed previously; code unchanged |
| 28 | A stop-off migration sharing the old stack's compose project name is refused before any side effect, and step 4 says why (18-26) | VERIFIED | Behavior-dependent (refusal before side effect): `MigrationService.preflight` + `sharedProjectName`; unchanged |

**Score:** 28/28 truths verified, 0 behavior-unverified.

### Key Link Verification

| From | To | Status |
|---|---|---|
| Setup brownfield routes -> `requireWizardSession` -> `requireAdminAccount`, `requireAuth` | WIRED (new) |
| Wizard client (`signIn.email` after step 1, `credentials: "include"`) -> guarded setup routes | WIRED (new) |
| `MigrationService.assessTarget` -> `DirectoryIdentityPort` -> `classifyMigrationTarget` | WIRED |
| `OnboardingService.scan/adopt` and `MigrationService` -> `managed-stack-guard` | WIRED |
| `StatePoller` / `ContainerStateCatchUp` -> `StackContainerMatcher.belongsTo` | WIRED |
| `startEventStream` -> `JsonLinesDecoder` -> `withKeyedLock` -> `handleEvent` | WIRED |
| `MigrationService.preflight` -> `sharedProjectName` -> preview -> wizard `StopRequirement` | WIRED |

### Behavioral Spot-Checks (targeted unit files only)

| Scope | Result | Status |
|---|---|---|
| Server unit: `test/unit/routes/brownfield-routes.test.ts` (this run, after 2cbacb5) | 1 file, 48 passed | PASS |
| Server unit rounds 1-3 (migration-service, onboarding-service, directory identity, state poller, volume-migrator, and others) | Passed in the previous verification; no source change to those modules since | PASS (carried) |
| Not run (project rule) | `tsc --build`, Playwright, server integration, full suites | Deferred to CI (Acknowledged Gaps) |

### Probe Execution

SKIPPED: no probes declared by the phase plans.

### Requirements Coverage

STK-03, MIG-01, MIG-02, MIG-03, MIG-04 are declared across the 26 plans and defined in REQUIREMENTS.md; none is orphaned.

| Requirement | Status | Evidence |
|---|---|---|
| STK-03 | SATISFIED | Own stack hidden, others listed, managed rows flagged and refused; UAT 2, 11 |
| MIG-01 | SATISFIED | Wide dialog, readable steps; UAT 3, 9; Playwright in CI |
| MIG-02 | SATISFIED | Real line diff; UAT 4. Caveat WR-06 (compose diff secrets unmasked) open, non-blocking |
| MIG-03 | SATISFIED | Explicit backup step, opt-out creates none, faithful opt-in copy; UAT 5, 7, 8 |
| MIG-04 | SATISFIED | Stop gate, rollback restart, ordered state, project-name refusal; UAT 6, 7, 8 |

Housekeeping for the orchestrator (not verification failures): REQUIREMENTS.md still shows MIG-02/MIG-03 unchecked and "Gaps Found" in traceability; ROADMAP.md still reads "26/26 plans executed (5 gap-closure plans pending, round 3)" with the Phase 18 checkbox open; 18-REVIEW-DISPOSITION.md still lists WR-02 as `open` (line 95) although 2cbacb5 fixed it, and lists other closed findings (CR-01..03, WR-01, WR-09, WR-10) as `open` too.

### Anti-Patterns Found

TBD/FIXME/XXX debt-marker scan over `server/src/routes/setup.ts` and the changed test: no matches. No `as any`, no stub.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | | | | |

### Non-blocking items still open (tracked in 18-REVIEW-DISPOSITION.md)

WR-03 (failed `docker.up` leaves containers), WR-04 (named-volume key prefix), WR-05 (stop by inferred project name; acknowledged below), WR-06 (compose diff secrets unmasked), WR-07 (rollback cleanup errors swallowed), WR-08 (toast lifecycle), WR-11 (`~` sources refused, never rewritten), IN-01..IN-05. None falsifies a success criterion. WR-02 is closed by 2cbacb5.

### Deferred items (Step 9b)

None. Phases 19-21 do not cover any open item.

## Human Verification Resolved

All human-verification items of the previous report are resolved or explicitly accepted by the user (2026-10-18):

- Own-stack hiding, managed rows, in-place and not-in-place migration, backup on/off, stop on/off, phone width, card size: 18-UAT.md, 11/11 passed, 0 issues.
- Absolute bind-source check on the `/host` setup: passed manually by the user.
- WR-02 security decision: resolved by fixing it (2cbacb5, re-checked above).
- Remaining items: accepted as deferred (below).

## Gaps Summary

No gaps. The phase goal is achieved in the code, confirmed on a real host by the completed UAT, and the one security finding that was open at the last verification is fixed and tested.

## Acknowledged Gaps

Accepted by the user on 2026-10-18; deferred, not blocking, not counted as gaps:

(a) **Linux-root `cp -a` ownership and symlink check.** Migrating a stack whose bind mount holds root-owned or non-root-uid-owned data (e.g. a Postgres directory) as root in the production image, then comparing uid/gid, modes, timestamps and symlink targets. Not testable on Docker Desktop for Windows; the ownership assertion in `volume-migrator.test.ts` is root-gated (`it.skipIf`) and does not run on non-root CI runners.

(b) **WR-05: old-stack stop not verified when the compose project name differs from the directory name** (started with `-p` or a shell `COMPOSE_PROJECT_NAME`). `docker compose -f <file> stop` can exit 0 having stopped nothing; the 18-26 predictor sees only `.env`, `name:` and the directory. Known issue, tracked in 18-REVIEW-DISPOSITION.md.

(c) **CI-only checks**, run on GitHub Actions after push and not locally (project rule): full `yarn tsc --build` (round 3 added `DirectoryIdentityPort`, `StackContainerMatcher`, `JsonLinesDecoder` and changed constructor signatures; 2cbacb5 adds a typed `preHandler` array), unit suites on Linux, Windows and macOS (4294d85 fixed a Windows-only path defect), server integration tests, and the Playwright specs `setup-wizard.spec.ts` and `stacks-import.spec.ts` on desktop chromium and mobile-chromium.

---

_Verified: 2026-10-18_
_Verifier: Claude (gsd-verifier)_
