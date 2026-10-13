---
phase: 10-backend-architecture-refactor
plan: 08
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript, routes, application-services]

# Dependency graph
requires:
  - phase: 10-06
    provides: "The StackEventReadRepo narrow-read-port precedent this plan's ImageUpdateCheckReadRepo and LogServiceStackReadPort follow, and the domain-module extraction pattern this plan's image-ref consolidation follows"
  - phase: 10-07
    provides: "No direct code dependency (disjoint files — jobs/*.ts vs routes/application), but this plan's domain-module move touches jobs/update-checker.ts, which 10-07 had just migrated onto the Job contract; merged cleanly with no conflict"
provides:
  - "server/src/routes/stacks.ts imports no repository, infrastructure module, job module or database client — CLAUDE.md's 'routes only call application services' rule holds for the largest route file in this phase's scope"
  - "domain/image-update-detection.ts's buildImageRefFromService — the single image-reference builder, moved out of jobs/update-checker.ts; toImageRef now delegates to it"
  - "StackService.getStackWithUpdateInfo()/getUpgradeCandidates() — the stack-detail update-check join and the upgrade-candidate tags lookup, moved out of the route, behind a narrow ImageUpdateCheckReadRepo port"
  - "server/src/application/log-service.ts (LogService) — log-target resolution and Docker log-stream opening, moved out of the route, behind DockerodeClientPort and a narrow LogServiceStackReadPort"
affects: [10-09, 10-10, 10-11, 10-12, 10-13, 10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 10518
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A route-level cross-layer reach is fixed by moving the reach's exact logic into a new or existing application-service method with the identical fold/shape, never by changing the response — the route becomes a one-line delegation plus (where the pre-existing route had one) its own dead-but-harmless not-found branch, kept as-is rather than 'cleaned up', since removing it is outside the byte-identical-response boundary"
    - "When a service needs a repository method whose thrown-error message doesn't match the literal text a route-being-replaced always sent (StackRepository.findByIdWithRelations()'s id-interpolated NotFoundError vs. the log route's literal 'Stack not found'), the composition root adapts it: a small wrapper declared in application/index.ts catches the repository's specific error and normalizes it (here, to null) so the new service is free to raise its own NotFoundError with the exact original message — keeps the byte-identical contract without forking the repository method or duplicating message text in two places"
    - "Two structurally-identical pure functions with different call signatures (object-arg toImageRef vs. positional-arg buildImageRefFromService) are consolidated by keeping one canonical implementation and making the other a one-line delegator, not by duplicating the body twice under two names"

key-files:
  created:
    - server/src/application/log-service.ts
    - server/test/unit/application/log-service.test.ts
  modified:
    - server/src/domain/image-update-detection.ts
    - server/src/jobs/update-checker.ts
    - server/src/routes/stacks.ts
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/test/unit/domain/image-update-detection.test.ts
    - server/test/unit/jobs/update-checker.test.ts
    - server/test/unit/application/stack-service.test.ts

key-decisions:
  - "buildImageRefFromService and toImageRef were byte-identical by inspection (same docker.io/library/ and docker.io/ prefix strip, same default-to-:latest rule) — confirmed by diffing both implementations line-for-line before consolidating, not assumed. toImageRef now delegates to buildImageRefFromService (the moved implementation, since it is the one whose output is persisted as the ImageUpdateCheck lookup key) rather than the two bodies staying duplicated under different names."
  - "normalizeImageRef stayed in jobs/update-checker.ts (not moved) — it is still used internally by detectRegistry() and findStacksByImageRef(), which are jobs-layer concerns unrelated to the service-to-ref reconstruction buildImageRefFromService performs; moving it would have been scope creep beyond what Task 1 asked for."
  - "StackService's getStackWithUpdateInfo() and getUpgradeCandidates() preserve the pre-existing route's unreachable '!stack' dead branch (getStack()'s repo call already throws NotFoundError before ever resolving to a falsy value) rather than removing it — the plan's byte-identical-response constraint means a change in what's technically dead code is still out of scope for this plan; a future cleanup pass can remove it deliberately."
  - "LogService's stack read port resolves to null for an unknown stack (rather than throwing StackRepository's own id-interpolated NotFoundError) via a small adapter declared in application/index.ts's composition root — this keeps the route's exact literal 'Stack not found' message (not 'Stack \"xyz\" not found') without needing a second repository method or duplicating the not-found translation inside LogService itself."
  - "LogService.openLogStreams() returns an empty array (not a thrown BadRequestError) when the service filter matches no running container — the route's existing 400 response construction (with its interpolated service-filter text) stays in the HTTP layer, keeping the service's return contract simple (list of targets) and the HTTP-shaped error message out of the application layer."

requirements-completed: ["D-01", "D-03", "D-08", "D-10"]

coverage:
  - id: D1
    description: "The image-reference builder exists once, in the domain layer; routes/stacks.ts no longer imports from the jobs layer"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/image-update-detection.test.ts — buildImageRefFromService/toImageRef describes, 9 cases, all pass"
        status: pass
      - kind: other
        ref: "grep -cE 'export function buildImageRefFromService' server/src/jobs/update-checker.ts -> 0; grep -cE 'export function buildImageRefFromService' server/src/domain/image-update-detection.ts -> 1; grep -cE '^\\s*import .*jobs/' server/src/routes/stacks.ts -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "StackService serves the stack-detail update-check join and the upgrade-candidate tags lookup, with byte-identical response shapes and the per-stack service-name access-control scoping preserved in the same order"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — getStackWithUpdateInfo/getUpgradeCandidates describes, 7 new cases (matching row, no row, unknown service raises before lookup, unknown stack, unparsable availableTags), all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*repositories/' server/src/routes/stacks.ts -> 0; grep -cE 'decodeUpgradeCandidates' server/src/routes/stacks.ts -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "LogService resolves log targets and opens Docker log streams behind a port; routes/stacks.ts's log route imports no repository, infrastructure module, job module or database client, and the disconnect-cleanup handler is intact"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "server/test/unit/application/log-service.test.ts — 6 cases (unknown stack, all-filter, named-service filter, no-container empty result, nonexistent-service-name empty result, one-stream-per-target pairing), all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/db|infrastructure/|repositories/|jobs/)' server/src/routes/stacks.ts -> 0; grep -cE 'prisma\\.' server/src/routes/stacks.ts -> 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every response body, status code and error message from the three touched endpoints (stack detail, upgrade-candidate tags, log stream) is byte-identical to before"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "Full unit suite (yarn workspace @docktor/server test:unit): 54 files, 889 passed + 2 todo (up from 10-07's 851 passed + 2 todo baseline by 38 new tests across the three test files this plan touched/added)"
        status: pass
      - kind: unit
        ref: "yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 08: Route-to-Service Layering for stacks.ts + Image-Ref Consolidation (D-01, D-03, D-08, D-10) Summary

**`server/src/routes/stacks.ts` now imports no repository, infrastructure module, job module or database client — its four cross-layer reaches (jobs, repository x2, infrastructure) are behind `StackService`'s two new methods and a new `LogService`, and the image-reference builder that used to be duplicated across `jobs/` and `domain/` now exists once.**

## Performance

- **Duration:** ~25 min active work (after ~1.5 min fresh-worktree setup: `yarn install` ~66s, `npx prisma generate` ~1.4s — no `node_modules`/generated Prisma client existed yet in this worktree)
- **Started:** 2026-09-23T20:40:00+02:00 (after fast-forwarding the worktree onto `feature/phase-10-backend-refactoring` to pick up plans 10-01 through 10-07)
- **Completed:** 2026-09-23T21:03:00+02:00
- **Tasks:** 3
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- `buildImageRefFromService` moved from `jobs/update-checker.ts` into `domain/image-update-detection.ts`; `toImageRef` now delegates to it instead of duplicating the identical normalisation inline — confirmed byte-identical by inspection before consolidating, not assumed
- `routes/stacks.ts`'s stack-detail update-check join and upgrade-candidate `tags` lookup (including `decodeUpgradeCandidates` and the per-stack service-name access-control scoping) moved into two new `StackService` methods (`getStackWithUpdateInfo`, `getUpgradeCandidates`), behind a new narrow `ImageUpdateCheckReadRepo` port matching `StackEventReadRepo`'s existing precedent
- `server/src/application/log-service.ts` created: `LogService` resolves a stack's services with a running container, applies the "all"-vs-named-service filter, and opens a Docker log stream per match, behind `DockerodeClientPort` and a locally-declared narrow stack read port
- `routes/stacks.ts`'s log SSE route now calls `logService.openLogStreams()`; the SSE headers, chunk parsing, per-line write framing and — critically — the disconnect handler that destroys every opened stream all stay in the route, unchanged
- `server/src/routes/stacks.ts` imports no repository, infrastructure module, job module or database client — `grep -cE '^\s*import .*(lib/db|infrastructure/|repositories/|jobs/)' server/src/routes/stacks.ts` and `grep -cE 'prisma\.' server/src/routes/stacks.ts` both print `0`
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 889 passed + 2 todo — up from 10-07's 851 passed + 2 todo baseline by 38 new tests) both exit zero after every task and at plan completion

## Task Commits

Each task was committed atomically:

1. **Task 1: One image-reference builder, in the domain layer** - `cb50d1c` (feat)
2. **Task 2: StackService owns the update-check join and the upgrade-candidate lookup** - `a87ed08` (feat)
3. **Task 3: LogService owns log-target resolution and stream opening** - `8fe0f12` (feat)

_No TDD-flagged tasks in this plan's frontmatter — each task's tests were authored alongside the extraction/move and committed together with it, matching 10-06/10-07's precedent for this phase's extraction-style work._

## Files Created/Modified
- `server/src/domain/image-update-detection.ts` - Added `buildImageRefFromService` (moved from jobs, now canonical); `toImageRef` delegates to it
- `server/src/jobs/update-checker.ts` - Removed the local `buildImageRefFromService` definition; imports it from `domain/image-update-detection.js`; `normalizeImageRef` stays (still used by `detectRegistry`/`findStacksByImageRef`)
- `server/src/application/stack-service.ts` - Added `ImageUpdateCheckReadRepo` port, `getStackWithUpdateInfo()`, `getUpgradeCandidates()`, private `decodeUpgradeCandidates()`; constructor gained a 7th `updateChecks` parameter
- `server/src/application/log-service.ts` (new) - `LogService` class: `openLogStreams(stackId, serviceFilter)`; `LogServiceStackReadPort` and `LogStreamTarget` types
- `server/src/application/index.ts` - Wires `imageUpdateCheckRepository` into `StackService`'s constructor; wires `logService` (with a `NotFoundError`-to-`null` adapter around `stackRepository.findByIdWithRelations`)
- `server/src/routes/stacks.ts` - Removed `prisma`, `dockerodeClient`, `imageUpdateCheckRepository`, `buildImageRefFromService`, `decodeUpgradeCandidates` imports/definitions; three handlers (`GET /:id`, `GET /:id/services/:serviceName/tags`, `GET /:id/logs`) now call service methods only
- `server/test/unit/domain/image-update-detection.test.ts` - Parity-test block replaced by direct `buildImageRefFromService` tests (all cases the removed parity assertion and the old jobs-layer test covered)
- `server/test/unit/jobs/update-checker.test.ts` - Removed the now-orphaned `buildImageRefFromService()` describe block and its import
- `server/test/unit/application/stack-service.test.ts` - Added `createMockUpdateChecks()`, updated the constructor call, added `getStackWithUpdateInfo`/`getUpgradeCandidates` describe blocks (7 new cases)
- `server/test/unit/application/log-service.test.ts` (new) - 6 cases covering every behaviour bullet in Task 3's plan block

## Decisions Made

**Before/after response shapes (D-01 phase-boundary requirement, recorded per the plan's acceptance criteria):**

- `GET /api/stacks/:id` — before: route built `serviceKeys`/`imageRefs`/`updateMap` inline, called `imageUpdateCheckRepository.findByImageRefs()` directly, and returned `{...stack, services: [...]}` with `updateAvailable`/`latestTag` folded in. After: route calls `stackService.getStackWithUpdateInfo(id)` and returns its result directly. **Identical response shape** — verified by moving the exact fold expression unchanged into the service method.
- `GET /api/stacks/:id/services/:serviceName/tags` — before: route resolved the stack, scoped the service, called `imageUpdateCheckRepository.findByImageRef()`, decoded candidates inline, returned `{currentTag, latestTag, candidates}`. After: route calls `stackService.getUpgradeCandidates(id, serviceName)` and returns its result directly. **Identical response shape**, identical `NotFoundError("Stack not found")` / `NotFoundError("Service not found")` messages, same scoping order (service resolved from the stack's own list before any lookup).
- `GET /api/stacks/:id/logs` — before: route queried `prisma.stack.findUnique(...)` directly, returned `reply.status(404).send({error: "Stack not found"})` on a null result, `reply.status(400).send({error: 'No running containers for service "${service}"'})` on an empty target list. After: route calls `logService.openLogStreams(id, service)`; an unknown stack now throws `NotFoundError("Stack not found")` (caught by the global error handler, producing the identical `{error: "Stack not found"}` / 404 response — not the repository's own id-interpolated message, because `application/index.ts`'s composition-root adapter normalizes that to `null` first); an empty target list still produces the identical 400 response, constructed in the route exactly as before.

**Preserved `preHandler` list (T-10-04, phase threat model):** This plan edited handler bodies only. `app.addHook("onRequest", requireAuth)` (line 17, applying to every route in the file) is unchanged — no route registration, schema, or preHandler was touched in any of the three tasks.

**Disconnect-cleanup handler (T-10-26, phase threat model), before/after body comparison:**
```
// before (inline in the route, `svc` from the prisma query):
request.raw.on("close", () => {
    streams.forEach(s => (s as any).destroy())
})

// after (unchanged apart from the loop variable's source — `target.stream` from LogService's return value instead of a locally-opened `logStream`):
request.raw.on("close", () => {
    streams.forEach(s => (s as any).destroy())
})
```
Still registered on the same `request.raw` `"close"` event, over the same `streams: NodeJS.ReadableStream[]` array, populated by the same per-target loop — the array is now filled from `LogService`'s returned targets instead of a `dockerodeClient.getLogStream()` call made inline in the route, but every stream that was previously pushed is still pushed, in the same order, before the handler is registered.

## Deviations from Plan

None — plan executed exactly as written. The only edits outside the plan's per-task `<files>` lists were:
- `server/test/unit/jobs/update-checker.test.ts` (Task 1): not listed in Task 1's `<files>`, but removing `buildImageRefFromService` from `jobs/update-checker.ts` broke this test file's import (it imported the now-nonexistent export) — a Rule 3 (blocking-issue) fix required by the plan's own `<verify>` block, which runs this exact test file and requires it to pass. No test cases were dropped: the `buildImageRefFromService()` describe block's assertions moved to `test/unit/domain/image-update-detection.test.ts` (which Task 1's `<files>` does list) rather than being deleted.

## Issues Encountered

Fresh-worktree setup: `node_modules` was absent (`yarn install`, ~66s) and the Prisma client had never been generated (`npx prisma generate --schema=prisma/schema`) — same pre-existing per-worktree prerequisite 10-02/10-05/10-06/10-07 documented, not introduced by this plan. The worktree branch was also behind `feature/phase-10-backend-refactoring` by the six merged wave-4 plans (10-01 through 10-07); fast-forwarded per the dispatch instructions before starting work, since the local branch had no divergent commits of its own.

## User Setup Required

None - no external service configuration required. (Same fresh-worktree prerequisites as prior plans in this phase: `yarn install` and `npx prisma generate` must be run once per fresh worktree/checkout before `yarn typecheck` succeeds.)

## Next Phase Readiness
- D-01's route-layering rule now holds for `routes/stacks.ts`, the largest and most cross-layer-violating route file scouting found (alongside `routes/backups.ts` and `routes/setup.ts`, still open for a future plan in this phase per 10-CONTEXT.md's scouting list).
- D-03's dead-code/duplication finding (the two image-ref builders) is closed — one implementation, in `domain/`.
- `StackService`'s constructor now takes 7 parameters (`repo, fs, docker, events, broadcaster, settings, updateChecks`) — any future plan constructing a `StackService` directly (rather than through `application/index.ts`'s `stackService` singleton) needs the 7th argument.
- `LogService` is a new precedent for a small, single-purpose application service with a locally-declared read port and a composition-root error-normalizing adapter — reusable pattern for the next route file this phase's D-01 restructure touches.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 889 passed + 2 todo) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 5 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with 10-06/10-07's precedent for this phase. The one integration test that touches `routes/stacks.ts` (`GET /api/stacks/:id → 404 for missing`) asserts only the status code, not the response body, so it is unaffected by this plan's changes; the plan's own `<verification>` block does not require integration tests to run.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 10 created/modified source and test files confirmed present on disk; all three task commits (`cb50d1c`, `a87ed08`, `8fe0f12`) confirmed present in `git log`; `git rev-list --count a4d629b..HEAD` = 3, matching the 3 task commits with no docs-only or uncommitted changes at self-check time.
