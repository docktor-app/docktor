---
phase: 13-update-checker-reliability
verified: 2026-10-07T07:27:04Z
status: human_needed
score: 3/5 must-haves verified
covered_files:
  - ".planning/phases/13-update-checker-reliability/13-01-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-01-SUMMARY.md"
  - ".planning/phases/13-update-checker-reliability/13-02-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-02-SUMMARY.md"
  - ".planning/phases/13-update-checker-reliability/13-03-PLAN.md"
  - ".planning/phases/13-update-checker-reliability/13-03-SUMMARY.md"
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
covered_digest: "v3:sha256:c02bac2fff8669758ad2424e21caa1f20c4bed5cc26fac5d7ca59407ab3be8cb"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "5. ImageUpdateCheck rows for retired image+tag combinations are pruned (#29) - the single deleteMany against a real Postgres removes orphans, keeps rows for refs a Service still produces (including docker.io/library/-prefixed services), and a second run deletes zero rows"
    test: "Where Docker is available, run: yarn workspace @docktor/server test:integration test/integration/image-update-check-pruning.test.ts"
    expected: "Orphan rows are deleted, live and prefix-normalised rows survive, a second prune deletes 0 rows"
    why_human: "The pruner and repository are present and wired, and unit tests pass against a mocked store, but the only test that exercises the real Prisma deleteMany/notIn semantics is a testcontainers integration test that could not run (Docker unavailable)."
human_verification:
  - test: "Live multi-tab post-deploy status (SC4, backstop truth in 13-02)"
    expected: "On a host with a real Docker daemon, open the stack list in tab A, click Redeploy / Update Images / upgrade a service in tab B. Within ~5s tab A shows every service with its real container state (not 'unknown') with no reload. Repeat with a compose edit that makes `up` fail: tab A shows real states promptly while tab B shows the failure toast."
    why_human: "End-to-end latency across Docker, the StatePoller event gap and two live SSE tabs cannot be proven by unit tests; 13-VALIDATION.md lists it as manual-only."
  - test: "Run the integration tests that could not execute without Docker"
    expected: "yarn workspace @docktor/server test:integration test/integration/stacks.test.ts test/integration/image-update-check-pruning.test.ts passes (stacks.test.ts now parses; the tags endpoint returns isMovingTag true for nginx:latest and false for postgres:16)."
    why_human: "Docker is unavailable in this environment."
  - test: "Moving-tag Upgrade dialog visual/copy check, light and dark mode (SC3, D-04/D-05)"
    expected: "For a flagged image: nginx:latest service, the Upgrade arrow opens a dialog with the 'moving tag' description, a neutral Alert stating Update Images is stack-wide, a disabled Upgrade button, and an outline Update Images button that closes the dialog and shows the 'Updating images...' toast. Contrast is acceptable in dark mode."
    why_human: "Copy and visual hierarchy are UX judgments (13-VALIDATION.md manual-only)."
  - test: "Decide on code-review WR-01 (failed deploy ends as RUNNING/STOPPED instead of ERROR)"
    expected: "Maintainer accepts the catch-up replacing ERROR with the Docker-derived status (consistent with what the 60s reconcile already did for stacks with containers) or asks for a follow-up fix that preserves ERROR on the failure branch."
    why_human: "Plan 13-02 documents this as an intentional choice (Pitfall 2), but it changes failure UX and notification behavior; it is a product decision, not a verifiable fact."
---

# Phase 13: Update Checker Reliability Verification Report

**Phase Goal:** Update detection and container status reporting are accurate everywhere they're shown - no misleading badges, no stale database rows, no unnecessary "unknown" status windows.
**Verified:** 2026-10-07T07:27:04Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

All five roadmap success criteria are present in the code, wired, and covered by passing unit tests. No FAILED truth and no blocker was found. Status is `human_needed` because the live-latency truth (SC4) is a declared backstop truth, the real-database behavior of the pruner (SC5) has only mocked evidence in this environment, and the integration suites could not run without Docker.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Update available" aggregated at stack level (list, dashboard, detail header) (#31) | VERIFIED | `hasStackUpdate(services)` / `StackUpdateBadge` (`client/src/components/domain/stack/stack-update-badge.tsx`) derives from the current services payload each render (no accumulation). Rendered in `stack-list.tsx:35` and `stack-detail-header.tsx:75`; `routes/app/dashboard.tsx:63` renders the same `StackList`. `use-stacks.ts:67` / `use-stack.ts:97` refetch on `update_available`. Pinned by `stack-update-badge.test.tsx` (one badge however many services flagged). Pre-existing from Phase 11, verified-and-closed. |
| 2 | Badge distinguishes a concrete newer tag from a moving-tag digest change (#32) | VERIFIED | `describeServiceUpdate` (`service-update-badge.tsx:9-15`) returns `Update available -> {tag}` when `latestTag` set, else `Content updated`. `git diff` on badge components is empty (prohibition on copy change held). Tests pass. |
| 3 | Upgrade dialog shows a distinct, correct message for moving-tag services instead of "not checked yet" (#33) | VERIFIED (code + unit); visual copy human | `MOVING_TAGS`/`isMovingTag` single definition in `server/src/domain/image-update-detection.ts:22-26`; `update-checker.ts` imports it (3 uses, no local copy); `getUpgradeCandidates` returns `isMovingTag` (`stack-service.ts:279-292`); client `ServiceTagsResponse.isMovingTag` (`stacks-api.ts:266`); `selectReadyView` checks `isMovingTag` first, so a moving tag can never reach the "unchecked" copy; Upgrade confirm disabled (`isConfirmDisabled` includes `readyView === "moving-tag"`); `runUpdateImages` shared by `stack-actions.tsx:118` and the dialog. 55 client tests pass. |
| 4 | Service status reflects reality within a few seconds after a deploy/update, not up to 60s (#34) | UNCERTAIN (insufficient_spec - backstop) -> human | Code path verified: `finishOperation` (`stack-service.ts:880-892`) is the exit for every DEPLOYING/UPDATING transition in `deployStack`, `updateImages`, `upgradeServiceImage` (success and each failure branch); stop/restart, the no-op upgrade and guard-rejected requests do not call it (tests `1460-1496`). `ContainerStateCatchUp` runs after `replaceServices` and the RUNNING transition, reads Docker via `listContainers`/`inspectContainer`, writes per-service state, derives via the shared `deriveStackStatus`, emits one `stack.container_state_changed` per service with the status-log entry on exactly one; skips transitional/vanished/empty stacks; never rejects. Wired in `application/index.ts` as the 10th `StackService` dependency. `StatePoller` imports the shared derivation (`state-poller.ts:6`). 373 server unit tests pass (incl. unmodified `state-poller.test.ts`). The "few seconds across live tabs" claim itself needs a live Docker daemon: manual UAT. |
| 5 | `ImageUpdateCheck` rows for retired image+tag combinations are pruned (#29) | PRESENT_BEHAVIOR_UNVERIFIED | `ImageUpdateCheckPruner` (`jobs/image-update-check-pruner.ts`): daily cron + `runImmediatelyOnStart`, `findTrackedImageRefs()` -> `deleteAllExcept()`; a read failure rejects and deletes nothing; registered in `jobs/index.ts:24`. `UpdateChecker`'s production repo delegates to the same `findTrackedImageRefs()` (D-11) and has no Prisma query of its own. Unit tests (mocked store) pass. Real-Postgres delete/idempotency/prefix-survival is only covered by `image-update-check-pruning.test.ts`, which could not run (no Docker). |

**Score:** 3/5 truths verified (1 present, behavior-unverified; 1 routed to human as a backstop truth)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/domain/image-update-detection.ts` | `MOVING_TAGS`, `isMovingTag` | VERIFIED | Exists, pure, imported by update-checker and stack-service |
| `server/src/application/stack-service.ts` | `isMovingTag` on candidates; `finishOperation` + `StackStateCatchUp` port | VERIFIED | 10 `finishOperation` call sites, `stateCatchUp` ctor param |
| `server/src/application/container-state-catch-up.ts` | `ContainerStateCatchUp` | VERIFIED | Substantive (observe/derive/emit), wired in `application/index.ts` |
| `server/src/domain/stack-state-derivation.ts` | `deriveStackStatus`, `TRANSITIONAL_STATES`, `isTransitionalStatus` | VERIFIED | Imported by catch-up and `state-poller.ts` |
| `server/src/jobs/image-update-check-pruner.ts` | Daily pruner job | VERIFIED | Registered in `jobs/index.ts` |
| `server/src/repositories/image-update-check-repository.ts` | `findTrackedImageRefs`, `deleteAllExcept`, `findStackIdsUsingImage` | VERIFIED | All three present and called |
| `client/.../service-upgrade-dialog.tsx` | Moving-tag state | VERIFIED | Four mutually exclusive ready views |
| `client/.../update-images-action.ts` | `runUpdateImages` | VERIFIED | Used by both consumers; toast copy only here |

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
| jobs/index.ts | image-update-check-pruner.ts | `register(imageUpdateCheckPruner)` | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server unit tests for phase (domain, catch-up, stack-service, state-poller, update-checker, pruner, jobs index, layering) | `yarn workspace @docktor/server test:unit` on 9 files | 9 files, 373 tests passed | PASS |
| Client unit tests (dialog, stack-actions, services-section, update-images-action, both badges) | `yarn workspace @docktor/client test` on 6 files | 6 files, 55 tests passed | PASS |
| CR-01 fix: `stacks.test.ts` and `image-update-check-pruning.test.ts` parse | esbuild `transformSync` | both parse OK | PASS |
| Integration suites | (needs Docker) | not run | SKIP -> human |

### Requirements Coverage

The five issues are not REQ-IDs in REQUIREMENTS.md (grep finds none); they are tracked as GitHub issues, as stated in ROADMAP.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| #29 | 13-03 | Prune stale ImageUpdateCheck rows | SATISFIED in code; real-DB behavior human | Truth 5 |
| #31 | 13-01 | Stack-level update badge | SATISFIED (verify-and-close) | Truth 1 |
| #32 | 13-01 | Badge distinguishes tag vs digest change | SATISFIED (verify-and-close) | Truth 2 |
| #33 | 13-01 | Moving-tag upgrade dialog message | SATISFIED | Truth 3 |
| #34 | 13-02 | Fast post-deploy status | SATISFIED in code; live latency human | Truth 4 |

No orphaned requirements: every issue is claimed by exactly one plan.

### Anti-Patterns Found

No `TBD/FIXME/XXX/TODO/HACK` markers in the phase's modified source files. No stubs or hollow props found in the new files.

### Code Review Assessment (13-REVIEW.md)

| Finding | Assessment | Undermines goal? |
|---------|------------|------------------|
| CR-01 syntax error in `stacks.test.ts` | Fixed in `0133f8a`; confirmed the file now parses. Test still needs a Docker run. | No |
| WR-01 catch-up overwrites ERROR after a failed deploy | Confirmed in code: `finishOperation(..., "ERROR")` runs `catchUp`, which writes the derived status (`container-state-catch-up.ts` derive + `updateStackStatus`) and emits `container_state_changed`. A failed update with surviving containers ends RUNNING; a failed first deploy with no containers ends STOPPED (unlike reconcile, which skips container-less projects). `NotificationWatcher` still fires `stack_error` from the first event, then the second event clears the active incident. The action's failure result, Deployment record and ERROR log row are preserved, and plan 13-02 documents the choice (Pitfall 2). It does not break the "status reflects reality" goal (it shows real container state) but is arguably at odds with "accurate" failure signalling. | WARNING - product decision requested (see human item) |
| WR-02 unconditional status write after awaited Docker calls | Real TOCTOU window: guard evaluated once at the top of `run()`, write is `update where id` with no status precondition. Needs a second operation to start within a window of a few Docker round trips. | WARNING - narrow race; does not defeat the goal in normal use; recommend a follow-up |
| WR-03 `findStackIdsUsingImage` ignores tag normalisation | Confirmed: ref `nginx:latest` splits to `image="nginx", tag="latest"` but untagged services are stored with `imageTag = NULL` (`compose-parser.parseImage`), so no `stack.update_available` event is emitted for implicit-latest or `docker.io/`-prefixed services. Logic was moved verbatim (pre-existing), and the badge itself is computed from the services payload via `buildImageRefFromService`, so it still appears on the next refetch/reload; explicit `image: x:latest` services are unaffected. This weakens the live-refresh half of 13-01's "#31 concurrency" truth for untagged images only, not any ROADMAP success criterion. | WARNING - not a blocker; recommend a follow-up fix |
| IN-01..IN-03 | Cosmetic / redundant handling / duplicate catch-up if `clearConfigChanged` throws. | No |

## Gaps Summary

No gaps blocking the phase goal. All five roadmap success criteria are implemented, substantive and wired, and 428 targeted unit tests pass. Remaining items are verification the environment could not provide (Docker-backed integration tests, the live two-tab latency check, visual dialog check) plus a maintainer decision on WR-01. WR-02 and WR-03 are real defects recommended for a follow-up phase or fix commit but do not negate any success criterion. The PR for this phase should carry `Closes #29`, `#31`, `#32`, `#33`, `#34`.

---

_Verified: 2026-10-07T07:27:04Z_
_Verifier: Claude (gsd-verifier)_
