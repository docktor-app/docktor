---
phase: 11-ui-rework
plan: 05
subsystem: server-application
tags: [stack-service, image-update-check, batched-lookup, dashboard-data, prisma]
requires:
  - phase: 10-backend-architecture-refactor
    provides: "StackService.getStackWithUpdateInfo() with an injected ImageUpdateCheckReadRepo port, moved off the route-level join in routes/stacks.ts"
provides:
  - "GET /api/stacks now returns updateAvailable/latestTag per service, matching GET /api/stacks/:id's existing semantics"
  - "StackService.withServiceUpdateInfo() — private batched enrichment shared by listStacks() and getStackWithUpdateInfo()"
affects: ["11-02 (StackUpdateBadge)", "11-04 (dashboard Updates Available stat)"]
actuals:
  tokens: 3760
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Batched cross-entity lookup: collect keys across N parent records, de-duplicate, one query, map results back — avoids N+1 without changing per-record output shape"
key-files:
  created: []
  modified:
    - server/src/application/stack-service.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/integration/stacks.test.ts
key-decisions:
  - "withServiceUpdateInfo<T extends {services: ...}>(stacks: T[]) is generic over the stack shape so both listStacks() (array of stacks) and getStackWithUpdateInfo() (single stack wrapped in a one-element array) share one implementation and one matching rule, per plan Action step 1-2"
  - "Protected-stack filtering in listStacks() runs BEFORE enrichment (not after) so a hidden stack's service refs are never included in the batched findByImageRefs call — closes T-11-16 and is covered by a dedicated unit test"
  - "findByImageRefs is skipped entirely (no call) when the de-duplicated ref list is empty, rather than calling it with an empty array — covered by the unbuildable-ref-default unit test asserting the mock is never invoked"
  - "Integration test seeds/cleans its own ImageUpdateCheck row in a try/finally (not relying on cleanDatabase(), which does not touch that table) to avoid leaking state into later runs against the same testcontainers Postgres instance"
patterns-established:
  - "Generic private helper shared across two public service methods for one entity's cross-cutting enrichment, rather than duplicating the batching/matching logic per call site"
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements the server half of D-09: GET /api/stacks returns per-service updateAvailable/latestTag so the stack-level update badge (11-02) and the Updates Available stat (11-04) have data on the list surface."
coverage:
  - id: D1
    description: "listStacks() returns updateAvailable/latestTag per service via one batched ImageUpdateCheck lookup, matching detail-route semantics, with protected-stack filtering preserved"
    requirement: "D-09 (GH-15)"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#listStacks > augments each listed stack's services with updateAvailable/latestTag from a matching stored row, defaulting a row-less service"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#listStacks > defaults updateAvailable: false / latestTag: null for a service whose image ref cannot be built"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#listStacks > calls findByImageRefs exactly once per listStacks() call, with the de-duplicated union of refs across all stacks"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#listStacks > excludes a protected stack's services from the batched lookup when showInDashboard is false"
        status: pass
      - kind: integration
        ref: "server/test/integration/stacks.test.ts#GET /api/stacks carries updateAvailable/latestTag per service from a seeded ImageUpdateCheck row (D-09)"
        status: fail
    human_judgment: false
  - id: D2
    description: "getStackWithUpdateInfo() keeps returning the identical shape and values its existing tests assert, after being re-implemented to share withServiceUpdateInfo()"
    requirement: "D-09 (GH-15) non-regression"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#getStackWithUpdateInfo (pre-existing describe block, unmodified assertions)"
        status: pass
    human_judgment: false
duration: ~20min
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 05: Server Update-Info Enrichment for the Stack List Summary

**Shared, batched `withServiceUpdateInfo()` helper closes the D-09 data gap: `GET /api/stacks` now returns per-service `updateAvailable`/`latestTag` with one query, matching the detail route exactly.**

## Performance
- **Duration:** ~20min (this session; see Deviations for the resumed-work context — a prior session's Task 1 work was already present when this session started)
- **Started:** 2026-09-26 (session start, exact epoch not captured — see Deviations)
- **Completed:** 2026-09-26T21:35:38Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `StackService.withServiceUpdateInfo<T>()` added: a private, generically-typed helper that batches one `findByImageRefs` call across the de-duplicated union of every given stack's service image refs, then maps results back onto each service with `updateAvailable`/`latestTag` defaults.
- `listStacks()` now filters protected stacks first (unchanged behaviour), then runs the enriched services through `withServiceUpdateInfo()` — `GET /api/stacks` gains the same `updateAvailable`/`latestTag` fields `GET /api/stacks/:id` already returns, closing RESEARCH Pitfall 1.
- `getStackWithUpdateInfo()` re-implemented as a one-element-array call into the same shared helper, so both surfaces apply one matching rule with zero duplicated logic.
- Unit tests added for: multi-stack matching + row-less defaulting, unbuildable-ref defaulting (with an explicit assertion that `findByImageRefs` is never called when there's nothing to look up), single-batch de-duplicated call across two stacks sharing a ref, and protected-stack ref exclusion.
- Integration test added seeding a real `ImageUpdateCheck` row and asserting `GET /api/stacks` surfaces it correctly for a matched service while defaulting an unmatched one — implemented and typechecked, but could not be executed against a live database in this sandbox (see Issues Encountered).

## Task Commits
1. **Task 1: Enrich listStacks() with batched update info shared with the detail path** - `2a2b8fe` (feat)
2. **Task 2: Integration test — GET /api/stacks carries update info from the real database** - `dc52791` (test)
**Plan metadata:** commit pending (this SUMMARY + STATE.md/ROADMAP.md/REQUIREMENTS.md)

## Files Created/Modified
- `server/src/application/stack-service.ts` — added `withServiceUpdateInfo<T>()`; `listStacks()` and `getStackWithUpdateInfo()` both delegate to it
- `server/test/unit/application/stack-service.test.ts` — fixed pre-existing `listStacks` fixtures (added required `services: []`) and added 4 new test cases covering the plan's `<behavior>` block
- `server/test/integration/stacks.test.ts` — added a real-database test seeding/cleaning up an `ImageUpdateCheck` row and asserting the enriched list response

## Decisions Made
See `key-decisions` in frontmatter. Summary: the shared helper is generic over the stack shape (not two near-duplicate implementations), protected-stack filtering happens strictly before enrichment, an empty ref list skips the query entirely, and the integration test manages its own seed/cleanup since the shared `cleanDatabase()` helper doesn't touch `ImageUpdateCheck`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing `listStacks` unit test fixtures broke against the new enrichment**
- **Found during:** Task 1
- **Issue:** The existing `listStacks` describe block's `allStacks` fixture objects had no `services` field. Once `listStacks()` was changed to call `withServiceUpdateInfo(filtered)`, which does `stack.services.map(...)`, all three pre-existing `listStacks` tests threw `TypeError: Cannot read properties of undefined (reading 'map')`.
- **Fix:** Added `services: []` to the fixture stacks so the pre-existing assertions (protected-stack filtering) continue to hold unchanged, then added new fixtures with real services for the new behavior-coverage tests.
- **Files modified:** `server/test/unit/application/stack-service.test.ts`
- **Verification:** Full unit suite passes (74/74) after the fix.
- **Commit:** `2a2b8fe`

**2. [Recovery — resumed interrupted work, not a numbered deviation rule, documented per objective] Task 1's implementation predated this session**
- **Found during:** session start
- **Context:** A previous executor session for this exact plan was killed mid-Task-1 by a Claude usage-limit error (an infrastructure interruption, not a defect or bad implementation). That session had already written a complete, uncommitted `withServiceUpdateInfo()` refactor to `server/src/application/stack-service.ts` before being cut off, with no tests and no commit.
- **Action taken:** Per the objective's explicit instruction, `git diff server/src/application/stack-service.ts` was reviewed first and compared line-by-line against Task 1's `<behavior>`/`<action>`/`<acceptance_criteria>`. It matched the plan's action steps exactly (generic `withServiceUpdateInfo<T>()`, `getStackWithUpdateInfo()` delegating to it, `listStacks()` filtering-then-enriching, doc comments citing T-11-15/T-11-16/D-09). It was kept rather than rewritten, then genuinely-exercising tests were written against it (RED-first TDD was not possible retroactively for an implementation that already existed, but each new test was verified to assert real behavior the implementation must satisfy, not a tautology).
- **Verification:** All acceptance criteria greps pass; 74/74 unit tests pass; `tsc --build` clean; the pre-existing `getStackWithUpdateInfo` tests continue passing unmodified, proving no regression on the detail-route shape.
- **Commit:** `2a2b8fe`

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing test fixture breakage from the new required `services` field), plus 1 documented resumed-work recovery (not an auto-fix rule, a continuation of already-correct prior work).
**Impact:** No behavioural risk. The fixture fix only widened test coverage to match the new contract; the resumed implementation was independently verified against every plan criterion before being kept.

## Issues Encountered

**Task 2's integration test could not be executed against a live database in this sandbox.** `yarn workspace @docktor/server test:integration test/integration/stacks.test.ts` failed during `startContainer()`'s `prisma db push` step with:

```
Error: P1001: Can't reach database server at `localhost:<ephemeral-port>`
```

This is the same TCP-payload-to-Docker-published-port block already root-caused as environmental (not a code defect) across at least eight prior plans in this project's STATE.md history (05.1-01, 05.1-05, 09-03, 09-04, 09-05, 06-01, 06-07, 08-01) — Docker itself is present and functional in this sandbox (`docker version` succeeds, other long-running containers accept raw TCP connections), but a testcontainers-launched Postgres's published port cannot complete the Postgres wire-protocol handshake from inside this sandbox. The test was implemented per the plan's `<action>` exactly (seed one tagged service's `ImageUpdateCheck` row, assert it and a row-less sibling service both resolve correctly on `GET /api/stacks`, clean up in `finally`), passes `tsc --build`, and satisfies its `<acceptance_criteria>` grep (`updateAvailable` appears 3 times, ≥ 2 required). It is ready to pass once run in an environment without this sandbox restriction (e.g. CI, or a developer machine).

No other issues encountered.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Server-side D-09 is complete: `GET /api/stacks` now carries `updateAvailable`/`latestTag` per service with the same batching and matching semantics as the detail route. 11-02's `StackUpdateBadge` and 11-04's dashboard "Updates Available" stat can now render real data from the list/dashboard surface with no further server change required — the client's `Service` interface already declares these fields as optional. Task 2's integration test should be re-run in an environment with working testcontainers/Docker connectivity (e.g. CI) to get a green confirmation on the real-database path before considering this plan's server-side guarantee fully proven end-to-end.

Ready for Wave 3 (11-06 through 11-11).

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: server/src/application/stack-service.ts
- FOUND: .planning/phases/11-ui-rework/11-05-SUMMARY.md
- FOUND: commit 2a2b8fe
- FOUND: commit dc52791
