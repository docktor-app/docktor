---
phase: 18-import-and-migration-flow
plan: 20
subsystem: infra
tags: [migration, compose-rewrite, dotenv, env-extraction, gap-closure]
requires:
  - phase: 18-import-and-migration-flow
    provides: ComposeRewriter source-splice rewrite, MigrationService preview/execute, 18-19 preflight
provides:
  - dotenv-format module (isInterpolationName, isDotenvSafeValue, formatDotenvLine)
  - EnvNameAllocator in the rewriter (per-value names, reserved/COMPOSE_/DOCKER_/referenced/old-.env aware)
  - ComposeRewriterPort.rewrite(..., existingEnv?) and ComposeRewriter(reservedNames) constructor
  - MigrationService.readOldEnv (ENOENT-only) and writeNewEnv (append or byte copy)
affects: [18-verification gap 3, MIG-02]
actuals:
  tokens: 21000
  tasks: 3
  commits: 6
plan_head_before: 9d546913dd0bd7d94db1b0453f9718ee03648a71
plan_head_after: 2f7e6b95a6b06a03751d2bc4691991928b9c05b9
commits: 6
tech-stack:
  added: []
  patterns:
    - "Name allocator that never reuses a name for a different meaning"
    - "Injected reserved-name provider so tests do not depend on the process environment"
key-files:
  created:
    - server/src/infrastructure/dotenv-format.ts
    - server/test/unit/infrastructure/dotenv-format.test.ts
  modified:
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/application/ports/compose-rewriter-port.ts
    - server/src/application/migration-service.ts
    - server/test/unit/infrastructure/compose-rewriter.test.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/architecture/layering.test.ts
key-decisions:
  - "Candidate order for a literal: KEY, <SERVICE>_KEY, <SERVICE>_KEY_2 .. _99; first usable wins, none usable keeps the value inline"
  - "Every name in Docktor's process environment is reserved by default, as are COMPOSE_*/DOCKER_* names, names the compose file references, and old .env keys with a different value"
  - "An old .env key with the same value is reused without emitting a second line"
  - "Unsafe values ($, quotes, backslash, line breaks, NUL), non-interpolation keys and non-canonical numbers/booleans stay inline"
  - "Old .env is read ENOENT-only; other errors fail the migration and roll back instead of dropping the content"
requirements-completed: []
status: complete
---

# Phase 18 Plan 20: Environment extraction preserves each service's effective environment Summary

The `.env` extraction now gives every differing literal its own name and never picks a name that would change another resolution, closing 18-VERIFICATION gap 3 (review CR-02) with WR-09 folded in.

## What was done

- **Task 1 (tracer):** the shared `Map<key, value>` is replaced by an `EnvNameAllocator`. The first occurrence keeps `KEY`; a later conflicting value gets `<SERVICE>_KEY`, then `_2`, `_3` ...; equal values share one entry. Service names are sanitised (`my-app` to `MY_APP`, `1st` to `_1ST`). `ComposeRewriter` takes a `reservedNames` provider, defaulting to `Object.keys(process.env)` read per rewrite, because `docker compose` runs with Docktor's own environment and shell variables override `.env` (T-18-58). RED test commit preceded the fix, and an end-to-end MigrationService test with the real rewriter confirms web keeps `${PORT}` and worker gets `${WORKER_PORT}` with matching `.env` values.
- **Task 2 (WR-09):** new pure `dotenv-format.ts`. Only interpolation-name keys, dotenv-safe string values and canonical booleans/decimal integers are moved; everything else stays inline byte-identical. Lines are written plain or single-quoted and round-trip through `parseEnvAssignments`.
- **Task 3:** `rewrite(..., existingEnv?)`. Allocator rules in order: reserved or `COMPOSE_`/`DOCKER_` names are refused; a name emitted earlier is shared only for the same value; an old `.env` key is reused only for the same value (no second line); otherwise a name the original compose file references (`$NAME`/`${NAME...}`) is skipped. `MigrationService` reads the old `.env` (ENOENT-only) in preview and execute and passes it in; `writeNewEnv` appends the extracted block, byte-copies the old file when nothing is extracted, and writes nothing when neither exists. The two bare catches are gone, so an unreadable old `.env` rolls the migration back.

## Verification

- `vitest run --project unit` over dotenv-format, compose-rewriter, migration-service, brownfield-routes and layering tests: 420 passed.
- `tsc --noEmit -p server/tsconfig.json`: clean (scoped; no full `tsc --build`, integration or Playwright run, per project memory).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Layering test requires an exported class in every infrastructure file**
- **Found during:** Task 3 verification
- **Issue:** `test/unit/architecture/layering.test.ts` demands an `export class ... implements <Name>Port` in every `infrastructure/*.ts`; the plan places the pure function module `dotenv-format.ts` there.
- **Fix:** added an explicit `PURE_FUNCTION_MODULES` exemption (only `dotenv-format.ts`) with a comment, instead of wrapping pure functions in a class or moving the file away from the path the plan's acceptance criteria name.
- **Files modified:** server/test/unit/architecture/layering.test.ts
- **Commit:** 2f7e6b9

**2. [Own test error, fixed before the fix commit] Collision-suffix test fixture**
- The first draft of the `_2` test put the conflicting `WORKER_PORT` service after `worker`; the plan's order (a third service defining `WORKER_PORT` first, pushing the later `worker` entry to `WORKER_PORT_2`) was corrected in commit 0e863bf together with the implementation.

## Notes

- Out of scope and unchanged: WR-02, WR-06, and Docktor's general behaviour of running compose with its own environment for stacks that already contain `${VAR}` references (follow-up).
- Requirements were not marked complete; the phase has not been re-verified.

## Known Stubs

None.

## Threat Flags

None. T-18-58 to T-18-61 are mitigated as planned (reserved process names, safe value serialisation, COMPOSE_/DOCKER_ prefixes, per-value names).

## Self-Check: PASSED

Files verified present: dotenv-format.ts, dotenv-format.test.ts, compose-rewriter.ts, compose-rewriter-port.ts, migration-service.ts. Commits 2c7c245, 0e863bf, (task 2 test, task 2 fix dfc5cd3), b0fc15f, 2f7e6b9 are ancestors of HEAD.
