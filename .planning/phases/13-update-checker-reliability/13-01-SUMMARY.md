---
phase: 13-update-checker-reliability
plan: 01
subsystem: ui
tags: [react, fastify, vitest, moving-tag, upgrade-dialog, update-checker]

requires:
  - phase: 11-ui-rework
    provides: StackUpdateBadge / ServiceUpdateBadge, services-section Upgrade arrow, update_available SSE refetch
provides:
  - Single server-side moving-tag definition (MOVING_TAGS / isMovingTag) in the domain layer
  - isMovingTag on GET /api/stacks/:id/services/:serviceName/tags
  - Moving-tag state in ServiceUpgradeDialog (explanation, Alert, disabled Upgrade, Update Images shortcut)
  - Shared runUpdateImages helper used by the header menu and the dialog
  - Regression tests pinning #31 (one stack badge) and #32 / D-03 (arrow for moving tags)
affects: [13-update-checker-reliability, upgrade-dialog, update-checker]

actuals:
  tokens: 21000
  tasks: 2
  commits: 4
plan_head_before: e4b50e7dad77eb362ddafe923706d985f4395daf
plan_head_after: 1d52f0512f509643075d0f6feced48fa1ff6603d

tech-stack:
  added: []
  patterns:
    - "Server owns the moving-tag set; client branches only on the server-provided isMovingTag flag"
    - "Mutually exclusive ready views chosen by one pure selector (selectReadyView)"
    - "Stack-level Update Images action has one home (runUpdateImages) next to its two consumers"

key-files:
  created:
    - client/src/routes/app/stacks/components/update-images-action.ts
    - client/test/unit/routes/stacks/update-images-action.test.ts
  modified:
    - server/src/domain/image-update-detection.ts
    - server/src/jobs/update-checker.ts
    - server/src/application/stack-service.ts
    - client/src/lib/stacks-api.ts
    - client/src/routes/app/stacks/components/service-upgrade-dialog.tsx
    - client/src/routes/app/stacks/components/stack-actions.tsx
    - server/test/unit/domain/image-update-detection.test.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/integration/stacks.test.ts
    - client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx
    - client/test/unit/routes/stacks/services-section.test.tsx
    - client/test/unit/components/domain/stack/stack-update-badge.test.tsx

key-decisions:
  - "D-06: the moving-tag set lives only in server/src/domain/image-update-detection.ts; no client-side list (grep gate: 0 hits)"
  - "selectReadyView checks isMovingTag before latestTag, so a moving tag can never show a version claim (no observable difference with real data, since moving-tag rows always have latestTag null)"
  - "D-05: Update Images shortcut calls runUpdateImages directly from the dialog; no callback threaded through OverviewTab/ServicesSection"

patterns-established:
  - "Shared page-scoped action helper next to its consumers rather than promoted to components/"

requirements-completed: ["#33", "#31", "#32"]

coverage:
  - id: D1
    description: "Tags endpoint returns isMovingTag from the single shared server definition"
    requirement: "#33"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/image-update-detection.test.ts#isMovingTag"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#getUpgradeCandidates"
        status: pass
      - kind: integration
        ref: "server/test/integration/stacks.test.ts#GET /api/stacks/:id/services/:serviceName/tags flags a moving-tag service"
        status: unknown
    human_judgment: false
  - id: D2
    description: "Upgrade dialog moving-tag state: explanation, Alert, no picker, Upgrade disabled, no 'not checked yet' copy"
    requirement: "#33"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx#moving-tag state"
        status: pass
    human_judgment: true
    rationale: "Copy and visual hierarchy (outline button vs primary Upgrade) of the new dialog state are UX judgments"
  - id: D3
    description: "Update Images shortcut in the dialog runs the same stack-level action as the header menu"
    requirement: "#33"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/update-images-action.test.ts"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx#offers an Update Images button"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/stack-actions.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "#31 / #32 / D-03 verified and pinned: one stack badge, badge copy unchanged, Upgrade arrow enabled for moving tag"
    requirement: "#31"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-update-badge.test.tsx#renders exactly one badge however many services are flagged"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx#keeps the upgrade button visible and enabled for a moving-tag service"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-07
status: complete
---

# Phase 13 Plan 01: Moving-Tag Upgrade Dialog Summary

**The Upgrade dialog for moving-tag services (for example `nginx:latest`) now explains there is no fixed version, disables Upgrade, and offers an Update Images shortcut, driven by a server-computed `isMovingTag` flag from one shared domain definition.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-07T07:05Z
- **Tasks:** 2 (tracer + auto, both TDD)
- **Files modified:** 14 (12 modified, 2 created)

## Accomplishments

- `MOVING_TAGS` / `isMovingTag` moved from `jobs/update-checker.ts` into `domain/image-update-detection.ts`; UpdateChecker now imports it (only the import and three membership checks changed), and `getUpgradeCandidates` returns `isMovingTag`, so the tags endpoint carries it with no route change.
- `ServiceUpgradeDialog` selects one of four mutually exclusive ready views through `selectReadyView`; the moving-tag view shows the UI-SPEC description, an informational `Alert`, a disabled Upgrade button, and an outline Update Images button.
- `runUpdateImages(stackId, onSuccess)` is the single home for the Update Images toast copy; `StackActions` and the dialog both call it. The dialog closes first, then runs the action.
- #31, #32 and D-03 are verified (no source change) and pinned by tests.

## Task Commits

1. **Task 1 (tracer): moving-tag state end to end**
   - RED `0abf74d` (test)
   - GREEN `e2918b5` (feat)
2. **Task 2: Update Images shortcut, D-03 pin, #31/#32 verification**
   - RED `9b25a55` (test)
   - GREEN `1d52f05` (feat)

**Plan metadata:** committed separately (docs: complete plan).

## #31/#32 verification

Read-only checks against the shipped Phase 11 code; no source change.

- **Ordering (#31):** `stack-list.tsx` renders `StackStatusBadge` at line 32 and `StackUpdateBadge` at line 35. `stack-detail-header.tsx` renders them at lines 74 and 75. Status precedes update in both.
- **Dashboard (#31):** `dashboard.tsx:63` renders `<StackList .../>`, so Recent Stacks gets the same badge.
- **Idempotency (#31):** `stack-update-badge.tsx` derives the badge from `hasStackUpdate(services)` on every render (lines 4 and 14); nothing is accumulated. Pinned by the new "exactly one badge however many services are flagged" test.
- **Concurrency (#31):** `use-stacks.ts:67` and `use-stack.ts:97` refetch in the background on the `update_available` SSE event.
- **Copy (#32):** `describeServiceUpdate` (`service-update-badge.tsx:9-15`) is a single implementation with two outputs: `Update available → {tag}` when `latestTag` is set, otherwise `Content updated`. Both outputs are covered by existing `service-update-badge.test.tsx` and `services-section.test.tsx`. `git diff` on the badge components and `services-section.tsx` is empty.
- **D-03:** new `services-section.test.tsx` case confirms an enabled `Upgrade web` button for `{imageTag: "latest", updateAvailable: true, latestTag: null}`.

The phase PR body must carry **`Closes #31`**, **`Closes #32`** and **`Closes #33`**.

## TDD record

- **Task 1 RED:** 17 server unit tests and 3 client tests failed on the planned assertions (`isMovingTag is not a function`, `toEqual` missing `isMovingTag`, moving-tag text absent). Semantic assessment: the target tests executed and failed for the intended reason. The pinned-tag and unchecked fallback tests passed immediately, as intended (they guard unchanged behavior).
- **Task 2 RED:** two dialog tests failed on the missing "Update Images" button. The `update-images-action` test file failed to load because the module did not exist yet (an expected module-not-found for the unit under creation, not an assertion failure). The D-03 and badge tests passed immediately by design: they pin behavior already shipped in Phase 11.
- Plan frontmatter is `type: execute`, so the mandatory `tdd-red-evidence` classifier gate was not run; RED/GREEN order is nevertheless in the git log.

## Files Created/Modified

- `server/src/domain/image-update-detection.ts` - `MOVING_TAGS`, `isMovingTag`
- `server/src/jobs/update-checker.ts` - imports the shared helper
- `server/src/application/stack-service.ts` - `getUpgradeCandidates` returns `isMovingTag`
- `client/src/lib/stacks-api.ts` - `ServiceTagsResponse.isMovingTag`
- `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` - moving-tag view
- `client/src/routes/app/stacks/components/update-images-action.ts` - shared `runUpdateImages`
- `client/src/routes/app/stacks/components/stack-actions.tsx` - delegates to the helper

## Decisions Made

See `key-decisions` above; all follow the plan and CONTEXT D-03 to D-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Order-dependent existing dialog test**
- **Found during:** Task 2 (GREEN)
- **Issue:** The existing "no-change message" test read `toast.promise.mock.calls[0]` without clearing the mock between tests. Once my new Update Images tests (which also call `toast.promise`) ran earlier in the file, `calls[0]` belonged to a different test.
- **Fix:** Clear `toast.promise` mock history in `beforeEach`; import `toast` statically instead of dynamically.
- **Files modified:** `client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx`
- **Commit:** `1d52f05`

### Additions beyond the plan's file list

- **New test file** `client/test/unit/routes/stacks/update-images-action.test.ts` covers the `runUpdateImages` behaviors the plan lists (toast copy, `onSuccess`, rejection). The plan's `files_modified` did not list a home for them; CLAUDE.md requires tests for new code.

**Total deviations:** 1 auto-fixed (Rule 1), 1 test file added. **Impact:** none on scope.

## Issues Encountered

- **Integration test not run.** Docker is not available in this environment, so `server/test/integration/stacks.test.ts` (including the new tags-endpoint case) could not execute. The case is written following the file's existing pattern, and the unit tests cover `getUpgradeCandidates`; the route has no response schema, so the new field passes through. Run `yarn workspace @docktor/server test:integration test/integration/stacks.test.ts` where Docker is available.
- **`yarn typecheck` reports 34 pre-existing errors** (stale generated Prisma client types, e.g. `template-repository.ts`; missing `@codemirror/*` / `@uiw/react-codemirror` modules). None are in files this plan touched.

## Deferred Issues

Out of scope, pre-existing, not fixed:

- 4 server unit failures in `test/unit/infrastructure/git-executor.test.ts` and `template-source-reader.test.ts`.
- 5 client test files fail to load due to missing CodeMirror packages (`yaml-syntax-linter`, `code-editor`, `config-tab`, `create-stack-page`, `env-editor`).
- Client has no ESLint config file, so lint could not be run on the touched files.

## Known Stubs

None.

## Threat Flags

None. The only new surface is a server-computed boolean derived from `currentTag`, which the same response already returns (T-13-01, accepted). The shortcut reuses the existing authenticated, guarded `POST /api/stacks/:id/update`.

## Self-Check: PASSED

- `update-images-action.ts` and `update-images-action.test.ts` exist; commits `0abf74d`, `e2918b5`, `9b25a55`, `1d52f05` are on the branch.
- Acceptance criteria re-run: Task 1 (`const MOVING_TAGS` in jobs: 0; `isMovingTag` in jobs: 4; domain exports present; `isMovingTag` in stack-service: 3; client type: 1; dialog copy: 1; client `nightly` list: 0; update-checker diff limited to import plus three checks). Task 2 (`runUpdateImages` export: 1; used in both consumers; toast copy only in the helper; badge and `services-section.tsx` diff empty).
- Targeted suites pass: server (domain, stack-service, update-checker, layering) 279 tests; client (dialog, stack-actions, helper, services-section, both badges) 55 tests.
