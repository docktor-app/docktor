---
phase: 13-update-checker-reliability
plan: 03
subsystem: api
tags: [prisma, repository, interval-job, image-update-check, pruning, vitest, tdd]

requires:
  - phase: 13-update-checker-reliability
    provides: plan 01 (wave ordering only; no code dependency)
provides:
  - ImageUpdateCheckRepository.findTrackedImageRefs, the single definition of the refs the update checker tracks
  - ImageUpdateCheckRepository.deleteAllExcept, which deletes every row outside a given ref set in one deleteMany
  - ImageUpdateCheckRepository.findStackIdsUsingImage, moved out of update-checker.ts
  - ImageUpdateCheckPruner IntervalJob (startup run plus daily), registered last in the job registry
affects: [update-checker, jobs-registry, image-update-check-repository]

actuals:
  tokens: 4600
  tasks: 2
  commits: 4
plan_head_before: bd6ae9d116f7bbdc68a7666956db7360cc800e08
plan_head_after: 62cb8103ede926593d33aa5b85044130e181ca9d

tech-stack:
  added: []
  patterns:
    - "One repository query is the single source of 'tracked refs' for both the checker and the pruner, so the prune rule cannot drift from the check rule"
    - "Job with an optional injected store port and a lazy production import inside run() (TemplateRepoSync precedent), keeping the DB client out of unit-test module graphs"
    - "A failed read is never coerced into an empty set: run() does not catch, so IntervalJob.runGuarded records the error"

key-files:
  created:
    - server/src/jobs/image-update-check-pruner.ts
    - server/test/unit/jobs/image-update-check-pruner.test.ts
    - server/test/integration/image-update-check-pruning.test.ts
  modified:
    - server/src/repositories/image-update-check-repository.ts
    - server/src/jobs/update-checker.ts
    - server/src/jobs/index.ts
    - server/test/unit/jobs/index.test.ts

key-decisions:
  - "D-10: a dedicated ImageUpdateCheckPruner IntervalJob (cron 0 0 * * *, runImmediatelyOnStart = true) prunes in one deleteMany, so the existing backlog clears on first boot"
  - "D-11: the tracked-ref rule lives only in ImageUpdateCheckRepository.findTrackedImageRefs; UpdateChecker's production adapter delegates to it"
  - "update-checker.ts now runs no Prisma query of its own: findStackIdsUsingImage also moved into the repository, and the lazy lib/db.js import was dropped"

patterns-established:
  - "Pruning jobs derive the keep-set from the same repository query the producer job scans with"

requirements-completed: ["#29"]

coverage:
  - id: D1
    description: "A daily, startup-run job deletes ImageUpdateCheck rows no current Service image+tag produces, passing the tracked set unchanged to a single deleteAllExcept"
    requirement: "#29"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/image-update-check-pruner.test.ts#passes the tracked refs unchanged to deleteAllExcept"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/index.test.ts#prints a started line naming all nine jobs"
        status: pass
    human_judgment: false
  - id: D2
    description: "A failed read of the tracked set deletes nothing and rejects the run; an empty set (no services) prunes every row; the pruned count is logged only when non-zero"
    requirement: "#29"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/image-update-check-pruner.test.ts#rejects and deletes nothing when reading the tracked set fails"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/image-update-check-pruner.test.ts#calls deleteAllExcept with an empty set"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rows whose ref is still produced by a service survive a prune against a real database, including a docker.io/library-prefixed service; a second prune deletes zero rows; an empty table is fully pruned"
    requirement: "#29"
    verification:
      - kind: integration
        ref: "server/test/integration/image-update-check-pruning.test.ts"
        status: not-run
    human_judgment: true
    rationale: "Written and type-clean but not executed: no Docker daemon was reachable in this environment, so testcontainers could not start Postgres. Run the integration file where Docker is available."
  - id: D4
    description: "UpdateChecker behaviour is unchanged and update-checker.ts has no Prisma access left"
    requirement: "#29"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/update-checker.test.ts (unmodified, 37 tests)"
        status: pass
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-07
status: complete
---

# Phase 13 Plan 03: Stale ImageUpdateCheck Pruning Summary

**A daily, startup-run `ImageUpdateCheckPruner` deletes every `ImageUpdateCheck` row no current Service image+tag produces, using the exact ref rule UpdateChecker scans with via a shared `findTrackedImageRefs` repository query.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-07T07:13:00Z (approximate; not captured at launch)
- **Completed:** 2026-10-07T07:18:00Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Moved the distinct image+tag scan out of `update-checker.ts` into `ImageUpdateCheckRepository.findTrackedImageRefs` (build-only services excluded). UpdateChecker's production adapter now delegates to it, so the checker and the pruner share one rule (D-11).
- Added `deleteAllExcept(imageRefs)`: one `deleteMany` with `notIn`, returning the deleted count. An empty set deletes every row, which is documented on the method.
- Added `ImageUpdateCheckPruner` (cron `0 0 * * *`, `runImmediatelyOnStart = true`) with an injectable `ImageUpdateCheckPrunerStore` and a lazy production import. `run()` deliberately has no try/catch around the read, so a failure rejects into `IntervalJob.runGuarded` and is recorded against job health instead of becoming an empty set.
- Registered the pruner last in `jobs/index.ts`; the jobs index test now lists nine jobs.
- Moved UpdateChecker's second Service query into `findStackIdsUsingImage` and dropped the lazy `lib/db.js` import: `update-checker.ts` now has no Prisma access (CLAUDE.md "repositories are the only place that touches Prisma").

## Task Commits

TDD cycle per task:

1. **Task 1 (tracer): shared ref query, deleteAllExcept, pruner job registered**
   - RED `2a2b179` (test): pruner unit tests, nine-job index test and the integration file; failed to load because the pruner module did not exist.
   - GREEN `d0a8155` (feat): repository methods, pruner job, registration and delegation from update-checker.
2. **Task 2: hardening and relocation of the second Service query**
   - RED `9a0abd5` (test): read-failure, empty-set and log-only-when-non-zero unit cases; empty-table, idempotency and `findStackIdsUsingImage` integration cases.
   - GREEN `62cb810` (refactor): `findStackIdsUsingImage`, update-checker delegation, invariant comment on the read.

**Plan metadata:** committed separately as `docs(13-03): complete stale image-check pruning plan`.

## TDD Gate Compliance

RED evidence, assessed by inspecting the vitest output (the plan is `type: execute`, so the plan-level gate classifier was not run):

- **Task 1 RED:** both the pruner test and `index.test.ts` failed with `Cannot find module .../image-update-check-pruner.js`, the expected pre-implementation state for a new module.
- **Task 2 RED:** the new unit cases (read failure, empty set, logging) already passed, because Task 1's `run()` satisfied them by construction; they are characterisation tests that lock the invariant. The new `findStackIdsUsingImage` integration case is the genuinely red one, but it could not be executed here (see Issues Encountered).
- GREEN: all targeted unit suites pass. A separate REFACTOR commit was not needed.

## Files Created/Modified

- `server/src/jobs/image-update-check-pruner.ts` - `ImageUpdateCheckPruner`, its store port and the `imageUpdateCheckPruner` singleton
- `server/src/repositories/image-update-check-repository.ts` - `findTrackedImageRefs`, `deleteAllExcept`, `findStackIdsUsingImage`
- `server/src/jobs/update-checker.ts` - production adapter delegates both Service reads to the repository; no Prisma or `lib/db.js` left
- `server/src/jobs/index.ts` - registers the pruner after `templateRepoSync`
- `server/test/unit/jobs/image-update-check-pruner.test.ts` - six unit cases
- `server/test/unit/jobs/index.test.ts` - nine-job order, start and stop assertions
- `server/test/integration/image-update-check-pruning.test.ts` - five real-database cases

## Decisions Made

- Followed the plan as written (D-10, D-11). The pruner reads through the repository singleton imported lazily from `repositories/index.js`, matching the TemplateRepoSync precedent.
- `findStackIdsUsingImage` takes the already-parsed image and tag, so UpdateChecker keeps its local `normalizeImageRef` parsing untouched (prohibition: no change to detection behaviour).

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0

## Issues Encountered

- **Integration tests not run.** The Docker daemon was not running (`docker info` could not reach `dockerDesktopLinuxEngine`), so testcontainers failed with "Could not find a working container runtime strategy". Same situation as 13-01. I did not start Docker Desktop. `server/test/integration/image-update-check-pruning.test.ts` is written following `stacks.test.ts`'s lifecycle and should be run where Docker is available: `yarn workspace @docktor/server test:integration test/integration/image-update-check-pruning.test.ts`. Until then D3 stays a human-judgment item, and the real-Postgres behaviour of `notIn` with an empty list, the `docker.io/library/` normalisation and `findStackIdsUsingImage` are unverified.
- **Pre-existing typecheck errors**, unrelated to this plan and in files it does not touch: a stale generated Prisma client (`template`, `templateVariant`, `templateRepo`, `templateRepoUrl`, `deployWarnings` missing) and missing client packages (`@uiw/react-codemirror`, `@codemirror/*`). `yarn typecheck` reports no error in any file touched here.
- Passing: pruner, jobs index, update-checker (unmodified) and layering suites, 166 tests.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- Ready for the next plan in Phase 13. The phase PR body should carry `Closes #29` (and `Closes #34` from 13-02).
- Run the pruning integration file once Docker is available, before the phase PR is merged.

## Threat Flags

None. The pruner adds no network or auth surface; it only deletes rows of a cache table keyed by service-derived refs (T-13-10 to T-13-13 as planned).

## Self-Check: PASSED

- Created files exist: `image-update-check-pruner.ts`, the pruner unit test and the pruning integration test.
- Commits `2a2b179`, `d0a8155`, `9a0abd5` and `62cb810` are ancestors of HEAD.
- Acceptance greps: `extends IntervalJob` 1, `register(imageUpdateCheckPruner)` 1, `findTrackedImageRefs` in update-checker 1, `distinct: ["image", "imageTag"]` in update-checker 0, `prisma.` and `db.js` in update-checker 0, `findStackIdsUsingImage` in the repository 1, pruner imports of registry/docker 0, and `update-checker.test.ts` has no diff.

---
*Phase: 13-update-checker-reliability*
*Completed: 2026-10-07*
