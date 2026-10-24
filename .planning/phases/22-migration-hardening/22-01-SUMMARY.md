---
phase: 22-migration-hardening
plan: 01
subsystem: migration
tags: [docker-compose, env-allowlist, apperror-cause, zod, path-hardening, ci, vitest]

requires:
  - phase: 18-brownfield-migration
    provides: MigrationService, ExternalStackControl, ComposeRewriter, brownfield shared schemas
provides:
  - "lib/compose-env.ts allowlisted environment for every docker/compose child (#109)"
  - "linux-root-migration CI job that fails unless the ownership test ran as root"
  - "AppError hierarchy taking ErrorOptions (cause) through the constructor (#108)"
  - "Hardened shared request schemas (COMPOSE_FILE_NAMES, COMPOSE_VOLUME_NAME_PATTERN, composeVolumeNameSchema)"
  - "Realpath compose-file check in MigrationService.assessTarget"
  - "Typed ComposeAnalyzer (no any) and MigrationServiceDependencies constructor object"
affects: [22-02, 22-03, 22-04, 22-05, 22-06, 22-07, 22-08, phase-24]

actuals:
  tokens: 21500
  tasks: 3
  commits: 6
plan_head_before: 4b65b1036cbf0c78e22e53b4cdbb4785edf1e1b1
plan_head_after: fa1b239de1e3c52c6a9e85c15a7abb25971d1f11

tech-stack:
  added: []
  patterns:
    - "Injectable command runner plus per-call environment factory on infrastructure adapters"
    - "Dependencies-object constructor with production-singleton fallbacks for application services"
    - "Error cause passed via ErrorOptions, never assigned after construction"

key-files:
  created:
    - server/src/lib/compose-env.ts
    - server/test/unit/lib/compose-env.test.ts
    - server/test/unit/infrastructure/docker-executor.test.ts
    - server/test/unit/infrastructure/compose-env-interpolation.test.ts
  modified:
    - server/src/infrastructure/external-stack-control.ts
    - server/src/infrastructure/docker-executor.ts
    - server/src/infrastructure/compose-rewriter.ts
    - .github/workflows/ci.yml
    - server/src/lib/errors.ts
    - server/src/infrastructure/stack-filesystem.ts
    - server/src/infrastructure/git-executor.ts
    - server/src/infrastructure/registry-client.ts
    - shared/src/validation/brownfield.ts
    - server/src/domain/migration-target.ts
    - server/src/application/migration-service.ts
    - server/src/infrastructure/compose-analyzer.ts
    - server/src/application/ports/compose-analyzer-port.ts
    - server/test/unit/application/migration-service.test.ts

key-decisions:
  - "Docker and compose children receive only an allowlist (PATH, HOME, locale, DOCKER_*, SSH_AUTH_SOCK, proxy variables); Docktor secrets, DOCKTOR_* and every COMPOSE_* variable are never inherited, so ${VAR} resolves from the stack's own .env or the compose default"
  - "ComposeRewriter reserves only the allowlisted names, because only they can override a value in a stack's .env"
  - "compose-env.ts lives in lib/ because the layering test requires every infrastructure file to implement a port"
  - "A converted mount's newPath must be relative without .. segments; a kept mount (convert: false) may keep an absolute newPath as the client sends it"

patterns-established:
  - "Real-docker tests are gated by DOCKTOR_REAL_DOCKER_TESTS and use docktor-test-<uuid8> project names"
  - "Root-only tests are paired with a DOCKTOR_REQUIRE_ROOT_TESTS assertion so the CI job cannot skip them silently"

requirements-completed: [MIG-12, MIG-13]

coverage:
  - id: D1
    description: "Every docker/compose child receives only allowlisted environment variables"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/lib/compose-env.test.ts; server/test/unit/infrastructure/docker-executor.test.ts; server/test/unit/infrastructure/external-stack-control.test.ts"
        status: pass
      - kind: integration
        ref: "DOCKTOR_REAL_DOCKER_TESTS=1 vitest run test/unit/infrastructure/compose-env-interpolation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Linux root CI job proves the copy preserves ownership and modes"
    requirement: MIG-13
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/volume-migrator.test.ts (root assertion and ownership test run in the linux-root-migration job)"
        status: unknown
    human_judgment: true
    rationale: "The job can only run on a GitHub-hosted Linux runner as root; the first green CI run must confirm both tests executed instead of skipping"
  - id: D3
    description: "AppError and all subclasses take the cause through the constructor"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/lib/errors.test.ts#error cause"
        status: pass
    human_judgment: false
  - id: D4
    description: "Escaping request paths, bad volume keys and symlinked non-compose files are refused with 400"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "shared/test/unit/validation/brownfield.test.ts; server/test/unit/application/migration-service.test.ts#compose file check"
        status: pass
    human_judgment: false
  - id: D5
    description: "Compose analyzer is fully typed, tolerates non-mapping documents and types invalid YAML"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-analyzer.test.ts#unusual documents"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 01: Environment allowlist, AppError cause and request-path hardening Summary

**Every docker/compose child Docktor spawns now gets only an allowlisted environment (no secrets, no COMPOSE_*), AppError carries its cause through the constructor, migration request paths and symlinked compose files are refused with 400s, and the analyzer is typed.**

## Performance

- **Duration:** about 15 min (start time not captured at launch; estimated from the first and last test runs)
- **Completed:** 2026-10-22T13:51Z
- **Tasks:** 3 (all TDD: RED then GREEN commit each)
- **Files modified:** 27 (code and tests), plus this summary

## Accomplishments

- `server/src/lib/compose-env.ts` exports `DOCKER_CLI_ENV_ALLOWLIST` and `dockerCliEnvironment`; `ExternalStackControl` and `DockerExecutor` gained an injectable runner and a per-call environment, and `ComposeRewriter` reserves only the names that reach compose.
- Real `docker compose config` test proves `${DOCKTOR_PROBE_VALUE}` resolves from the stack `.env` and `${BETTER_AUTH_SECRET:-not-leaked}` stays `not-leaked`. It ran green locally (config creates no containers) and runs in CI.
- `linux-root-migration` CI job runs `volume-migrator.test.ts` and the interpolation test under `sudo` with `DOCKTOR_REQUIRE_ROOT_TESTS=1`, so the ownership test cannot be skipped silently. The ownership test now also covers nested directories, a symlink lchown, modes and mtimes.
- `AppError(message, statusCode, code, options)` and every subclass accept `ErrorOptions`; no `.cause =` assignment or `Object.assign(new ...Error` remains in `server/src`.
- Shared schemas: `..` segments in `composePath`, NUL characters, absolute/`~`/`..`/empty converted destinations and non-Docker volume keys are rejected; `COMPOSE_FILE_NAMES`, `COMPOSE_VOLUME_NAME_PATTERN` and `composeVolumeNameSchema` are exported, and the domain's `VOLUME_NAME_PATTERN` is now that shared constant.
- `MigrationService.assessTarget` realpaths the compose file first (ENOENT becomes a 400 with the errno as cause; a real name outside `COMPOSE_FILE_NAMES` or a non-regular file is refused before any read). `MigrationService` takes `Partial<MigrationServiceDependencies>`.
- `ComposeAnalyzer` and its port use `unknown`; empty, scalar, list and non-mapping `services` documents analyse as zero services; invalid YAML is a `BadRequestError` with the YAML error as cause.

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 allowlisted environment | e4ae948 | ea8ce32 |
| 2 AppError cause | 4cbb850 | e94b5ea |
| 3 request paths, analyzer, dependencies | 77a77ec | fa1b239 |

## TDD Gate Compliance

RED commits precede every GREEN commit. RED evidence for each task was validated with `gsd_run check tdd-red-evidence` and returned `RED_EVIDENCE_OK` (`target_test_failed`):

- Task 1: `compose-env.test.ts > keeps only the variables the docker CLI needs...` failed on `expected '' to be 'DOCKER_HOST,HOME,HTTP_PROXY,PATH'` against an empty-object stub of `compose-env.ts` (the stub was part of the RED commit so tests fail on assertions, not on a missing module). The `docker-executor` tests were run only for the compose-command cases in RED, because the image-command cases would have executed a real `docker pull` against the unmodified executor.
- Task 2: `errors.test.ts > error cause > AppError carries the cause through the constructor` failed with `cause` undefined.
- Task 3: `brownfield.test.ts > migrationPreviewSchema > rejects a composePath with a .. segment` failed (schema accepted the path). Semantic assessment: each target test executed and failed on the planned assertion; no import, fixture or syntax fault. The multi-line failure diff of the first Task 1 attempt was INVALID_RED for the classifier (TAP adapter), so the target assertion was rewritten to a single-line key comparison.

No REFACTOR commits were needed.

## Decisions Made

- Allowlist-only child environment (#109). User-visible behaviour change for the changelog (plan 22-08 writes the entry): a managed or imported stack that silently relied on a variable set on Docktor's own container (or on `COMPOSE_*` variables of Docktor's process) no longer sees it. `${VAR}` now resolves from the stack's `.env` or the compose default; variables such as `DOCKER_HOST`, `DOCKER_CONFIG`, proxy settings, `PATH` and `HOME` still pass through.
- Converted-mount destinations must be relative; kept absolute mounts stay valid.
- `compose-env.ts` is in `lib/` (layering test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing rewriter test asserted the old reserved-name behaviour**
- **Found during:** Task 1
- **Issue:** `compose-rewriter.test.ts` "reserves the variables of Docktor's own process environment by default" stubbed `DOCKTOR_TEST_SHADOW`, which is no longer reserved once only allowlisted names reach compose.
- **Fix:** Rewrote it to stub an allowlisted name (`HTTP_PROXY`) and added a case proving `DATABASE_URL` is no longer reserved.
- **Files modified:** `server/test/unit/infrastructure/compose-rewriter.test.ts`
- **Commit:** e4ae948

**2. [Rule 3 - Blocking] `shared/test/unit/validation/brownfield.test.ts` already existed**
- **Found during:** Task 3
- **Issue:** The plan lists it as a new file; it already held the base schema tests.
- **Fix:** Extended the existing file instead of creating one.
- **Commit:** 77a77ec

### Process notes (not code deviations)

- **Verification scope (MEMORY rule).** No full `tsc --build`, no integration suite, no full server suite. Ran the targeted vitest files named in each task's `<verify>`, a wider targeted set (architecture/layering, brownfield routes, compose rules, restic/backup/template/onboarding services, all of `test/unit/domain`, whole `shared` suite: 1140 and 280 tests green), `tsc -p shared` (build) and one scoped `tsc -p server --noEmit` (27 s, zero errors). Full typecheck, the full server suite and the `linux-root-migration` job remain for GitHub Actions.
- **Real-docker test run locally.** `compose-env-interpolation.test.ts` was run once locally with `DOCKTOR_REAL_DOCKER_TESTS=1` (`docker compose config` is read-only and creates nothing) to validate the test before it goes to CI.
- **Worktree branch guard.** The executor ran in a linked worktree on `feature/phase-22-migration-hardening` as the orchestrator-designated sequential executor; the `agent-*` branch allow-list of the parallel-worktree commit assertion was therefore not applied. The protected-branch assertion and the root pin guard were run before every commit.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3). **Impact:** none on scope.

## Issues Encountered

- During the Task 3 RED run the five `MigrationService` builders (already converted to the object form) hit the old positional constructor and fell back to production singletons for the other ports; the run only produced failed tests with no lasting side effect.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. The new `linux-root-migration` job uses `sudo` on an ephemeral GitHub-hosted runner (T-22-04, accepted).

## User Setup Required

None.

## Next Phase Readiness

Ready for 22-02 and 22-03. `MigrationServiceDependencies` lets plans 22-04..22-08 add ports without touching every test builder again, and the AppError constructor shape is stable before Phase 24 adds subclasses. First green CI run must show the root assertion and the interpolation suite as passed, not skipped.

## Self-Check: PASSED

- Created files exist: `server/src/lib/compose-env.ts`, `server/test/unit/lib/compose-env.test.ts`, `server/test/unit/infrastructure/docker-executor.test.ts`, `server/test/unit/infrastructure/compose-env-interpolation.test.ts`.
- Commits found on the branch: e4ae948, ea8ce32, 4cbb850, e94b5ea, 77a77ec, fa1b239.
- Acceptance greps (dockerCliEnvironment in all three adapters, `linux-root-migration:` once, `DOCKTOR_REQUIRE_ROOT_TESTS` in CI and test, no `catch (err: any)`, `options?: ErrorOptions` 7 times, no `.cause =`, `constructor(deps: Partial<MigrationServiceDependencies>`, `realpath`, no `any` in analyzer and port, `COMPOSE_VOLUME_NAME_PATTERN` in the domain file) all pass.
