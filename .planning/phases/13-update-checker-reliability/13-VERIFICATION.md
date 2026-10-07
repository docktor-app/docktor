---
phase: 13-update-checker-reliability
verified: 2026-10-07T08:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/13-update-checker-reliability/13-01-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-01-SUMMARY.md"
  - ".planning/phases/13-update-checker-reliability/13-02-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-02-SUMMARY.md"
  - ".planning/phases/13-update-checker-reliability/13-03-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-03-SUMMARY.md"
  - "client/src/components/domain/stack/service-update-badge.tsx"
  - "client/src/components/domain/stack/stack-update-badge.tsx"
  - "client/src/lib/stacks-api.ts"
  - "client/src/routes/app/stacks/components/service-upgrade-dialog.tsx"
  - "client/src/routes/app/stacks/components/stack-actions.tsx"
  - "client/src/routes/app/stacks/components/update-images-action.ts"
  - "server/src/application/container-state-catch-up.ts"
  - "server/src/application/index.ts"
  - "server/src/application/stack-service.ts"
  - "server/src/domain/image-update-detection.ts"
  - "server/src/domain/stack-state-derivation.ts"
  - "server/src/jobs/image-update-check-pruner.ts"
  - "server/src/jobs/index.ts"
  - "server/src/jobs/state-poller.ts"
  - "server/src/jobs/update-checker.ts"
  - "server/src/repositories/image-update-check-repository.ts"
  - "server/src/repositories/stack-repository.ts"
covered_digest: "v3:sha256:fbabe0024310d719bdf0695a2b666e7affe3e9bcf5bc59288bbefbcde4bd2d21"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed (recorded as passed after UAT)
  previous_score: 3/5
  gaps_closed:
    - "SC4 live multi-tab latency (13-UAT test 1: pass)"
    - "SC5 real-Postgres prune behavior and stacks.test.ts integration (13-UAT test 2: pass via CI)"
    - "SC3 moving-tag dialog visual/copy (13-UAT test 3: pass)"
    - "WR-01 product decision (13-UAT test 4: accepted)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "Quick task 261007-e5k renders the stack-wide Update Images button in every ready view of the per-service Upgrade dialog, but the explanatory Alert ('pulls the newest image for every service in this stack and redeploys it') stays gated to the moving-tag view. 13-01 prohibition 2 ('MUST NOT trigger the stack-wide Update Images action from the per-service dialog without the dialog stating that it pulls and redeploys every service') is therefore no longer literally true for pinned-tag views."
    category: other
    reason: "A deliberate, maintainer-directed post-phase extension (quick task 261007-e5k), not a regression in the phase work. No ROADMAP success criterion is affected. Optionally add the same scope note to the non-moving views, or accept the deviation via an overrides entry."
    evidence_status: "code read: service-upgrade-dialog.tsx lines 173-182 (Alert, moving-tag only) vs 216-228 (button, all ready views); test 'non-moving tag' asserts no Alert in those views"
---

# Phase 13: Update Checker Reliability Verification Report

**Phase Goal:** Update detection and container status reporting are accurate everywhere they're shown - no misleading badges, no stale database rows, no unnecessary "unknown" status windows.
**Verified:** 2026-10-07T08:30:00Z
**Status:** passed
**Re-verification:** Yes - the previous report went stale after quick task 261007-e5k (721bdc3..a428ab0) changed `service-upgrade-dialog.tsx` and `update-images-action.ts`. All truths were re-checked against the current code, and the two human-gated items were closed by `13-UAT.md` (4/4 passed).

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Update available" aggregated at stack level (list, dashboard, detail header) (#31) | VERIFIED | `StackUpdateBadge` / `hasStackUpdate` (`stack-update-badge.tsx`) derives from the current services payload each render (`services.some(updateAvailable)`), no accumulation. Rendered in `stack-list.tsx:35` and `stack-detail-header.tsx:75`; `dashboard.tsx:63` renders the same `StackList`. Covered by the stack-badge client tests. |
| 2 | Badge distinguishes a concrete newer tag from a moving-tag digest change (#32) | VERIFIED | `describeServiceUpdate` (`service-update-badge.tsx:11-15`) returns `Update available → {tag}` when `latestTag` is set, otherwise `Content updated`. Unchanged by this phase's commits. |
| 3 | Upgrade dialog shows a distinct, correct message for moving-tag services instead of "not checked yet" (#33) | VERIFIED | Single `MOVING_TAGS`/`isMovingTag` in `server/src/domain/image-update-detection.ts:22-26`, imported by `update-checker.ts` (lines 8, 136, 143, 352) and `stack-service.ts:7`. `getUpgradeCandidates` returns `isMovingTag: isMovingTag(currentTag)` (`stack-service.ts:292`). Client type `ServiceTagsResponse.isMovingTag` (`stacks-api.ts:266`). `selectReadyView` checks `isMovingTag` first, so a moving tag can never reach the "unchecked" or "newest known version" copy; Upgrade confirm is disabled for `moving-tag`. The dialog and `stack-actions.tsx:118` share `runUpdateImages`. Dialog tests cover moving-tag copy, no picker, disabled Upgrade, single fetch, rejected-update behavior. UAT test 3 passed (light/dark visual). |
| 4 | Service status reflects reality within a few seconds after a deploy/update (#34) | VERIFIED | `finishOperation` (`stack-service.ts:880-892`) is the exit for the DEPLOYING/UPDATING transitions in `deployStack`, `updateImages` and `upgradeServiceImage` (10 call sites, success and failure branches). It calls `stateCatchUp.catchUp`, which (`container-state-catch-up.ts`) reads Docker, writes per-service state, derives via the shared `deriveStackStatus` (also used by `state-poller.ts`), and emits `stack.container_state_changed` per service. It skips transitional, vanished and empty stacks, never rejects, and is wired in `application/index.ts:75-77` as the 10th `StackService` argument. Live latency across tabs confirmed by UAT test 1 (pass). |
| 5 | `ImageUpdateCheck` rows for retired image+tag combinations are pruned (#29) | VERIFIED | `ImageUpdateCheckPruner` (`jobs/image-update-check-pruner.ts`): daily cron plus `runImmediatelyOnStart`; `findTrackedImageRefs()` feeds `deleteAllExcept()` (`prisma.imageUpdateCheck.deleteMany notIn`); a failed read rejects and deletes nothing. Registered in `jobs/index.ts:24`. `UpdateChecker` reads the same `findTrackedImageRefs()` (`update-checker.ts:232`), so the rules cannot drift. Real-Postgres behavior (`image-update-check-pruning.test.ts`, `stacks.test.ts`) confirmed by UAT test 2 (CI pass). |

**Score:** 5/5 truths verified. 0 present-but-behavior-unverified.

### Plan Must-Haves (13-01 prohibitions)

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No pickable version / enabled Upgrade / "not checked yet" in the moving-tag state | HELD | `selectReadyView` precedence; `isConfirmDisabled` includes `readyView === "moving-tag"`; tests at `service-upgrade-dialog.test.tsx:138-157` |
| Stack-wide Update Images only with the dialog stating its scope | HELD for moving tags; relaxed for pinned tags by quick task 261007-e5k | See Advisory below |
| No copy/tone change to `ServiceUpdateBadge` / `StackUpdateBadge` | HELD | Neither file touched by any phase or quick-task commit |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/domain/image-update-detection.ts` | `MOVING_TAGS`, `isMovingTag` | VERIFIED | Pure, imported by update-checker and stack-service |
| `server/src/application/stack-service.ts` | `isMovingTag` on candidates; `finishOperation` + `StackStateCatchUp` port | VERIFIED | Lines 117, 279-292, 505-809, 880-892 |
| `server/src/application/container-state-catch-up.ts` | `ContainerStateCatchUp` | VERIFIED | Substantive (observe/derive/emit), wired in `application/index.ts` |
| `server/src/domain/stack-state-derivation.ts` | `deriveStackStatus`, `isTransitionalStatus` | VERIFIED | Imported by catch-up and `state-poller.ts` |
| `server/src/jobs/image-update-check-pruner.ts` | Daily pruner | VERIFIED | Registered in `jobs/index.ts` |
| `server/src/repositories/image-update-check-repository.ts` | `findTrackedImageRefs`, `deleteAllExcept`, `findStackIdsUsingImage` | VERIFIED | All present (lines 73, 87, 101) and called |
| `client/.../service-upgrade-dialog.tsx` | Moving-tag state, Update Images shortcut | VERIFIED | Four mutually exclusive ready views; button now in every ready view |
| `client/.../update-images-action.ts` | `runUpdateImages` | VERIFIED | Used by dialog and `stack-actions.tsx`; toast copy only here |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| update-checker.ts | image-update-detection.ts | `isMovingTag` import | WIRED |
| stack-service.ts | image-update-detection.ts | `isMovingTag(currentTag)` | WIRED |
| service-upgrade-dialog.tsx / stack-actions.tsx | update-images-action.ts | `runUpdateImages` | WIRED |
| stack-service.ts | container-state-catch-up.ts | `finishOperation` -> `stateCatchUp.catchUp` | WIRED |
| container-state-catch-up.ts / state-poller.ts | stack-state-derivation.ts | `deriveStackStatus` | WIRED |
| image-update-check-pruner.ts | image-update-check-repository.ts | `findTrackedImageRefs` -> `deleteAllExcept` | WIRED |
| update-checker.ts | image-update-check-repository.ts | `findTrackedImageRefs`, `findStackIdsUsingImage` | WIRED |
| jobs/index.ts | image-update-check-pruner.ts | `jobRegistry.register(imageUpdateCheckPruner)` | WIRED |
| application/index.ts | container-state-catch-up.ts | `new ContainerStateCatchUp(...)` passed to `StackService` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| service-upgrade-dialog.tsx | `state.data` (`isMovingTag`, `latestTag`, `candidates`) | `getServiceTags` -> `GET .../tags` -> `getUpgradeCandidates` -> `findByImageRef` + `isMovingTag(currentTag)` | Yes | FLOWING |
| stack-update-badge.tsx | `services[].updateAvailable` | stacks API payload (UpdateChecker-written rows) | Yes | FLOWING |
| container-state-catch-up.ts | container state/health | `docker.listContainers` / `inspectContainer` | Yes | FLOWING |
| image-update-check-pruner.ts | tracked refs | `prisma.service.findMany` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server unit tests (domain, stack-service, catch-up, jobs incl. pruner/update-checker/state-poller) | `yarn workspace @docktor/server vitest run test/unit/domain test/unit/application/stack-service.test.ts test/unit/application/container-state-catch-up.test.ts test/unit/jobs` | 25 files, 483 tests passed | PASS |
| Client unit tests (stacks routes + stack domain components) | `yarn workspace @docktor/client vitest run test/unit/routes/stacks test/unit/components/domain/stack` | 28 files, 275 tests passed | PASS |
| Full client unit suite (reported by orchestrator, not re-run here) | `yarn workspace @docktor/client test` | 81 files / 698 tests passed | PASS (reported) |
| Integration suites needing Docker | CI | green per 13-UAT test 2 | PASS (UAT) |

### Probe Execution

No probes declared by the phase plans. Step skipped.

### Requirements Coverage

The five issues are GitHub issues, not REQ-IDs. REQUIREMENTS.md contains no `#29/#31-#34` entries (only the older UPD-01..04, mapped to Phase 2), so there is nothing to orphan. ROADMAP lists them as the phase's requirements, and each is claimed by exactly one plan.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| #29 | 13-03 | Prune stale ImageUpdateCheck rows | SATISFIED | Truth 5 |
| #31 | 13-01 | Stack-level update badge | SATISFIED | Truth 1 |
| #32 | 13-01 | Badge distinguishes tag vs digest change | SATISFIED | Truth 2 |
| #33 | 13-01 | Moving-tag upgrade dialog message | SATISFIED | Truth 3 |
| #34 | 13-02 | Fast post-deploy status | SATISFIED | Truth 4 |

### Anti-Patterns Found

None. No `TBD/FIXME/XXX/TODO/HACK` markers in any covered source file; no stubs or hollow props. The quick task's `yarn typecheck` errors under `server/` (Prisma client missing `templateRepo`, etc.) are a stale generated client in a file this phase did not touch (noted in the quick-task SUMMARY, not verified here).

### Code Review Assessment (13-REVIEW.md)

| Finding | Assessment |
|---------|------------|
| CR-01 syntax error in `stacks.test.ts` | Fixed in `0133f8a`; integration suite passes in CI. |
| WR-01 catch-up replaces ERROR with Docker-derived status | Accepted by the maintainer (13-UAT test 4). |
| WR-02 unconditional status write after awaited Docker calls | Narrow TOCTOU window; not goal-defeating. Follow-up recommended. |
| WR-03 `findStackIdsUsingImage` ignores tag normalisation (implicit-latest / `docker.io/` services get no live `update_available` event, though the badge still appears on refetch) | Not goal-defeating; follow-up recommended. |

### Human Verification Required

None outstanding. All four items from the earlier report were resolved in `13-UAT.md`.

### Gaps Summary

No gaps. All five roadmap success criteria are implemented, substantive, wired, and covered by passing tests, with the live and Docker-backed checks resolved by UAT. One advisory remains: after quick task 261007-e5k, the pinned-tag views of the Upgrade dialog offer the stack-wide Update Images button without the scope Alert that 13-01 prohibition 2 required (the Alert still shows for moving tags). It does not affect any ROADMAP criterion. Either add the scope note to those views or accept it with an `overrides:` entry. WR-02 and WR-03 remain recommended follow-ups. The PR should carry `Closes #29`, `#31`, `#32`, `#33`, `#34`.

---

_Verified: 2026-10-07T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
