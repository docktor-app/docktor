---
phase: 13-update-checker-reliability
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - client/src/lib/stacks-api.ts
  - client/src/routes/app/stacks/components/service-upgrade-dialog.tsx
  - client/src/routes/app/stacks/components/stack-actions.tsx
  - client/src/routes/app/stacks/components/update-images-action.ts
  - client/test/unit/components/domain/stack/stack-update-badge.test.tsx
  - client/test/unit/routes/stacks/services-section.test.tsx
  - client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx
  - client/test/unit/routes/stacks/update-images-action.test.ts
  - server/src/application/container-state-catch-up.ts
  - server/src/application/index.ts
  - server/src/application/stack-service.ts
  - server/src/domain/image-update-detection.ts
  - server/src/domain/stack-state-derivation.ts
  - server/src/jobs/image-update-check-pruner.ts
  - server/src/jobs/index.ts
  - server/src/jobs/state-poller.ts
  - server/src/jobs/update-checker.ts
  - server/src/repositories/image-update-check-repository.ts
  - server/src/repositories/stack-repository.ts
  - server/test/integration/image-update-check-pruning.test.ts
  - server/test/integration/stacks.test.ts
  - server/test/unit/application/container-state-catch-up.test.ts
  - server/test/unit/application/stack-service.test.ts
  - server/test/unit/domain/image-update-detection.test.ts
  - server/test/unit/domain/stack-state-derivation.test.ts
  - server/test/unit/jobs/image-update-check-pruner.test.ts
  - server/test/unit/jobs/index.test.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-07
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The phase adds a moving-tag state to the upgrade dialog, a shared `runUpdateImages` action, a post-deploy container-state catch-up (`ContainerStateCatchUp` / `finishOperation`), and a daily `ImageUpdateCheckPruner`. The layering is clean and the new pure domain helpers are sound.

One committed test file does not parse: `server/test/integration/stacks.test.ts` has an unterminated string literal, which breaks the whole file. Beyond that, the catch-up's "intentional" ERROR overwrite changes failure semantics in ways that go beyond what the 60s reconcile does. Its write is also unconditional (a TOCTOU window), and a moved repository query still cannot match untagged images, which is the moving-tag case this phase targets.

No type-check result is claimed: `tsc --build` in this checkout fails on unrelated, ungenerated Prisma and missing codemirror modules. Every other changed file was run through the TypeScript parser and has no syntax diagnostics.

## Critical Issues

### CR-01: Syntax error in `stacks.test.ts` (unterminated string literal) breaks the entire integration suite file

**File:** `server/test/integration/stacks.test.ts:127-132`
**Issue:** The new test (commit `0abf74d`) builds `composeContent` with a double-quoted string that contains raw line breaks instead of `\n` escapes:

```ts
const composeContent = "services:
  web:
    image: nginx:latest
  db:
    image: postgres:16
";
```

The TypeScript parser reports `Unterminated string literal` at offsets 4712 and 4780. Vitest/esbuild will fail to transform the file, so every test in `stacks.test.ts` (not just the new one) fails to load. The D-06 `isMovingTag` API assertion this test exists to provide never runs.
**Fix:**
```ts
const composeContent =
    "services:\n  web:\n    image: nginx:latest\n  db:\n    image: postgres:16\n";
```
Then run `yarn workspace @docktor/server test:integration` to confirm the file loads. The other file in this phase (`image-update-check-pruning.test.ts`) already uses the escaped form correctly.

## Warnings

### WR-01: Catch-up erases the ERROR status that a failed deploy/update/upgrade has just set, and is more aggressive than the reconcile it claims to mirror

**File:** `server/src/application/container-state-catch-up.ts:328-332` (called from `server/src/application/stack-service.ts:880-892`)
**Issue:** `finishOperation(..., "ERROR", msg)` writes ERROR and emits `stack.status_changed`. `catchUp` then runs immediately, reads the status as non-transitional (ERROR is not in `TRANSITIONAL_STATES`), derives a status from the containers and overwrites it. Consequences:
- A failed update where the old containers keep running ends as RUNNING. A failed first deploy with no containers ends as STOPPED, because `observe()` fabricates `exited` for every missing container. The stack list never shows ERROR for a failed operation.
- The comment says this is "exactly as the 60s reconcile would", but that is not true for the no-container case. `StatePoller.reconcile` iterates only projects that have containers (`byProject`), so a stack with none is left at ERROR. Only the catch-up flips it to STOPPED.
- `NotificationWatcher` subscribes to both `stack.status_changed` and `stack.container_state_changed`. A failed deploy therefore raises a `stack_error` notification and then immediately a "recovery" event (RUNNING/STOPPED) that clears the active incident, so the incident dedup state flaps.
- D-08 only requires showing real container states on the failure branch. It does not require overwriting the aggregate status.

**Fix:** On the failure branch, persist the per-service container states and emit events, but leave the stack status at ERROR. For example, pass the target status into `catchUp`:
```ts
await this.stateCatchUp.catchUp(id, {preserveStatus: to === "ERROR"});
```
Alternatively, skip `updateStackStatus` when the current status is ERROR and set `stackStatus` in the emitted events from `stack.status`. Also skip the fabricated `exited` fallback (or the status write) when zero containers were found, to match reconcile.

### WR-02: Catch-up status write is unconditional after several awaited Docker calls (check-then-act race)

**File:** `server/src/application/container-state-catch-up.ts:311-332`, `server/src/repositories/stack-repository.ts:286-320`
**Issue:** The transitional-status guard is evaluated once at the top of `run()`. It is followed by `listContainers`, one `inspectContainer` per service and N `updateServiceState` writes before `updateStackStatus` runs. `updateStackStatus` does `stack.update({where: {id}})` with no status precondition. If another operation (a backup, or a second deploy/update right after the first) moves the stack into BACKING_UP/DEPLOYING/UPDATING inside that window, the catch-up overwrites the transitional status with RUNNING/STOPPED. The owning operation's own guard then no longer matches, and the exact "race the operation that is about to finish" described at `stack-state-derivation.ts:3-8` occurs.
**Fix:** Make the write conditional on the status that was read, for example a repository method using `updateMany({where: {id, status: observedStatus}, data: ...})` that returns null when the count is 0. Re-read the stack status immediately before writing as a cheaper alternative. Skip the status write and the events if the stack is now transitional.

### WR-03: `findStackIdsUsingImage` never matches services with an implicit `latest` tag, so `stack.update_available` is not emitted for them

**File:** `server/src/jobs/update-checker.ts:246-253` with `server/src/repositories/image-update-check-repository.ts:986-994`
**Issue:** `findTrackedImageRefs()` maps a service with `image: nginx, imageTag: null` to `nginx:latest`. When that ref has an update, `findStacksByImageRef("nginx:latest")` splits it into `image="nginx", tag="latest"` and calls `findStackIdsUsingImage("nginx", "latest")`, which queries `imageTag = 'latest'`. The stored row has `imageTag = NULL` (`compose-parser.parseImage`), so nothing matches and no `stack.update_available` event is sent. The same gap exists for `docker.io/library/...`-prefixed `Service.image` values. The tracked set deliberately normalises these away (and the pruning integration test asserts it), but the lookup compares against the raw columns. Untagged and `latest` images are the main moving-tag population this phase targets. The logic was moved verbatim, but this phase made it a public repository method and wrote tests for it (they only cover `nginx:1.27`).
**Fix:** In `findStackIdsUsingImage`, match the same normalisation as `findTrackedImageRefs`. For example, load `(stackId, image, imageTag)` rows and filter with `buildImageRefFromService(image, imageTag) === imageRef`, or add an OR clause for `imageTag: null` when the tag is `latest` plus the docker.io prefix variants. Add a test with an untagged image and a `docker.io/library/` prefixed image.

## Info

### IN-01: Dead confirm button in the moving-tag view of the upgrade dialog

**File:** `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx:65-71, 156+`
**Issue:** In the `moving-tag` state `isConfirmDisabled` is forced to true, but the footer's upgrade button is still rendered, permanently disabled next to the real "Update Images" action. This is confusing UX.
**Fix:** Hide the confirm button (or change the footer to Close only) when `readyView === "moving-tag"`.

### IN-02: Redundant try/catch around a method documented never to reject

**File:** `server/src/application/stack-service.ts:886-891` and `server/src/application/container-state-catch-up.ts:298-304`
**Issue:** `catchUp()` already swallows and logs every error, so the second try/catch in `finishOperation` can never fire and logs under a second prefix if the contract is ever broken. It is harmless defence-in-depth, but it is duplicated error handling for a `StackStateCatchUp` port whose contract could simply state "never rejects".
**Fix:** Document the never-rejects contract on `StackStateCatchUp` and drop one of the two layers, or keep the outer layer with a comment saying why.

### IN-03: `catch-up` can run twice for one operation when `clearConfigChanged` fails after a successful transition

**File:** `server/src/application/stack-service.ts:502-529, 627-650, 798-815`
**Issue:** In each deploy-family method the success `finishOperation(... RUNNING)` (which runs the catch-up) is followed by `clearConfigChanged` inside the same `try`. If `clearConfigChanged` throws, the catch block calls `finishOperation(..., "ERROR")` with a stale `from`, a second status-log row and a second catch-up pass and event burst. The ordering predates this phase, but `finishOperation` now makes the duplicate side effect visible.
**Fix:** Call `clearConfigChanged` before the final `finishOperation`, or move it outside the try/catch that maps failures to ERROR.

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
