---
phase: 12-compose-safety-and-templates
plan: 01
subsystem: api
tags: [zod, fastify, react, diff, jsdiff, review-gate, compose, env-editor]

requires:
  - phase: 11-ui-rework
    provides: StackConfigFiles/ConfigTab/useStackConfigFiles contracts, structured EnvEditor (D-20/D-21/D-22), CodeMirror compose editor
provides:
  - "server/src/lib/unified-diff.ts — computeUnifiedDiff() wrapping jsdiff's structuredPatch"
  - "server/src/application/compose-review-service.ts — ComposeReviewService, the single preview entry point"
  - "ConfirmationRequiredError (428) + StackService.updateStack's pre-write confirmation gate"
  - "POST /api/stacks/:id/preview route; confirmed/stackChangePreviewSchema/createStackPreviewSchema in @docktor/shared"
  - "client/src/components/common/unified-diff-view.tsx — UnifiedDiffView generic hunk renderer with annotations slot"
  - "client/src/components/domain/stack/diff-confirm-dialog.tsx — DiffConfirmDialog (edit review + env secret masking)"
  - "useStackConfigFiles' review/reviewPending/confirmReview/cancelReview contract"
affects: [12-05, 12-06, 12-08]

actuals:
  tokens: 28541
  tasks: 3
  commits: 4
  plan_head_before: bb44c3d11ec2648430b1dffe981deb831945e6d6
  plan_head_after: ddfda08b0c4379520404417a2af173918ed3fbb1

tech-stack:
  added: ["diff (jsdiff) ^9.0.0 — server workspace only, no @types/diff (ships its own declarations)"]
  patterns:
    - "Review-before-apply gate: a narrow StackChangeReviewer port injected into StackService (8th constructor param), enforced server-side before any fs.write* call — a direct API call cannot skip review"
    - "Manual toast.loading/success/error/dismiss (not toast.promise) when a flow has a branch that must resolve with neither a success nor an error toast"
    - "ReviewSubject discriminated union (kind: 'edit' today) on DiffConfirmDialog, designed for a future 'create' variant (12-05) without reshaping existing call sites"

key-files:
  created:
    - server/src/lib/unified-diff.ts
    - server/src/application/compose-review-service.ts
    - client/src/components/common/unified-diff-view.tsx
    - client/src/components/domain/stack/diff-confirm-dialog.tsx
  modified:
    - server/src/lib/errors.ts
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/src/routes/stacks.ts
    - shared/src/validation/stacks.ts
    - client/src/lib/stacks-api.ts
    - client/src/hooks/use-stack-config-files.ts
    - client/src/routes/app/stacks/components/config-tab.tsx
    - "client/src/routes/app/stacks/[id].tsx"

key-decisions:
  - "diff@^9.0.0 (jsdiff) approved by raphael@muesseler.de, 2026-10-02, via blocking-human package-legitimacy checkpoint (see Task 1 Approval Record below) — installed with no @types/diff"
  - "Confirmation check runs in StackService.updateStack immediately after findByIdOrThrow and strictly before fs.writeCompose/writeEnv — the only place in updateStack where this ordering is load-bearing (Pitfall 2)"
  - "confirmationRequired is simply hasChanges in this plan; 12-05 refines it with the D-04 skip setting and rule findings — ComposeReviewService's shape is already built to carry that extension"
  - "applyChange in useStackConfigFiles uses toast.loading/success/error/dismiss directly instead of toast.promise, because the 428-retry branch must resolve with neither a success nor an error toast — toast.promise always renders a toast once its `success` option is present, even with an empty message"
  - "DiffConfirmDialog's AlertDialogAction intercepts its click with preventDefault() before calling onConfirm — Radix's Action primitive fires its own onOpenChange(false) on click (composeEventHandlers checks event.defaultPrevented first), which would otherwise double-fire onCancel via handleOpenChange"

requirements-completed: ["#18"]

coverage:
  - id: D1
    description: "Saving a changed compose file on an existing stack opens a unified-diff review dialog; only Confirm & Apply writes"
    requirement: "#18"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#Issue #18/D-01/D-03: review-before-apply confirmation gate"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts#stack detail config tab: edit and save the compose file shows a review dialog, Confirm & Apply writes (Issue #18/D-01/D-02/D-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A direct PUT carrying unconfirmed changed compose/env content is rejected 428 server-side, before any write — the review cannot be bypassed by a direct API call"
    requirement: "#18"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#rejects an unconfirmed changed compose edit with ConfirmationRequiredError and never writes"
        status: pass
      - kind: integration
        ref: "server/test/integration/stacks.test.ts#PUT /api/stacks/:id with changed compose and no confirmed flag → 428, file on disk untouched (Issue #18/D-01/D-03)"
        status: unknown
    human_judgment: true
    rationale: "The integration test exists and asserts the exact must_haves backstop statement (file on disk byte-identical after a rejected unconfirmed PUT), but could not run in this sandbox — testcontainers starts the Postgres container but the environment blocks the TCP payload to its published port (Branch B, same class as 05.1-01/08-01). A human/unrestricted-environment re-run is required to confirm this live."
  - id: D3
    description: "Keep Editing closes the dialog without writing; the edit stays dirty"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-config-files.test.ts#cancelReview() clears review, keeps composeDirty true, never calls updateStack"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts#stack detail config tab: Keep Editing on the review dialog sends no PUT and the Save button stays enabled"
        status: pass
    human_judgment: false
  - id: D4
    description: "Byte-identical content never opens the dialog and saves directly"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-config-files.test.ts#saveCompose applies directly with no review when the preview reports confirmationRequired: false"
        status: pass
    human_judgment: false
  - id: D5
    description: "The same review dialog works for .env edits, titled \"Review changes to {stackName}'s environment\""
    requirement: "#18"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx#shows the env title (with 's environment) when subject.file is env"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts#stack detail config tab: editing and saving a secret env var shows the masked review dialog with the env title, reveal works, Confirm & Apply sends envContent + confirmed: true (Issue #18/Task 3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-02: creating a new stack never shows a diff step"
    verification:
      - kind: other
        ref: "code inspection: StackService.createStack is byte-for-byte unchanged by this plan; the confirmation check is added only inside updateStack"
        status: pass
    human_judgment: false
  - id: D7
    description: "Env review lines whose key matches isSecretKey are masked until 'Show secret values' is clicked; compose diffs are never masked"
    requirement: "#18"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx#T-12-02: env secret masking"
        status: pass
    human_judgment: false
  - id: D8
    description: "A 428 from a confirmed apply (file changed server-side between preview and confirm) re-runs the preview and reopens the review instead of an error toast"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-config-files.test.ts#confirmReview() re-runs the preview and reopens the review on a 428, without toasting an error"
        status: pass
    human_judgment: false

duration: 54min
completed: 2026-10-02
status: complete
---

# Phase 12 Plan 1: End-to-end compose/env edit review before apply Summary

**GitHub-style unified-diff review dialog gating every compose/.env edit on an existing stack, server-enforced via a new 428 ConfirmationRequiredError, with secret masking for env diffs — using jsdiff for diff computation.**

## Performance

- **Duration:** ~54 min (from Task 1's install at 09:36 to the final fixup commit at 10:29, 2026-10-02)
- **Started:** 2026-10-02T09:36:42+02:00
- **Completed:** 2026-10-02T10:29:31+02:00
- **Tasks:** 3/3
- **Files modified:** 24 (across 4 commits)

## Task 1 Approval Record (package-legitimacy checkpoint)

**Package:** `diff` (jsdiff) `@^9.0.0`, server workspace only
**Approver:** raphael@muesseler.de
**Timestamp:** 2026-10-02 (via blocking-human checkpoint review, relayed to the executor by the orchestrator)
**Verification stated:** repository confirmed at github.com/kpdecker/jsdiff, no `preinstall`/`install`/`postinstall` lifecycle scripts, ships its own TypeScript declarations (no `@types/diff` needed — independently re-confirmed in this session via `node_modules/diff/package.json`'s `types` fields), not deprecated, ~170M weekly downloads
**Outcome:** approved as-is, no replacement package requested. Installed via `yarn workspace @docktor/server add diff@^9.0.0`; `grep -c '"diff"' server/package.json` → 1, `grep -c '@types/diff' server/package.json` → 0.

## Accomplishments

- Saving an edit to an existing stack's compose file now opens a GitHub-style unified-diff review dialog (3 lines of context, hunk headers, +/- lines); only "Confirm & Apply" writes the file.
- The review is enforced server-side: `StackService.updateStack` rejects any changed `composeContent`/`envContent` lacking `confirmed: true` with a new `ConfirmationRequiredError` (HTTP 428), checked immediately before the existing YAML-first write path — a direct API call cannot bypass it.
- The same dialog and server enforcement now cover `.env` edits, with the title "Review changes to {stackName}'s environment" and D-22-consistent secret masking (`DB_PASSWORD=••••••••` until "Show secret values" is clicked).
- A byte-identical save (no actual change) skips the dialog entirely and applies directly — both client (`confirmationRequired: false`) and server agree on this.
- A 428 raised during `confirmReview()` (content changed server-side between preview and confirm) silently re-runs the preview and reopens the dialog rather than showing a generic error toast.
- `createStack` (and the new-stack flow) is untouched — D-02 holds: there is nothing on disk to diff against at creation time.

## Task Commits

Each task was committed atomically:

1. **Task 1: Package-legitimacy gate — approve `diff` (jsdiff)** - `ed8de25` (chore)
2. **Task 2: End-to-end compose-edit review — Save opens a unified-diff dialog, only "Confirm & Apply" writes** - `3234571` (feat)
3. **Task 3: Expand the review to .env edits — env title, byte-identical no-op, 428 recovery, secret masking** - `fb9a4cf` (feat)

**Follow-up fixup (within Task 2/3's scope, pre-existing-at-commit-time acceptance-criteria issue caught during final verification):** `ddfda08` (fix) — the dialog's module docstring quoted "Keep Editing"/"Confirm & Apply" verbatim, which doubled the plan's exact-count acceptance-criteria greps (expected exactly 1 match of each — the rendered button, not an incidental doc mention). Reworded; no rendered text or behavior changed.

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/lib/unified-diff.ts` - `computeUnifiedDiff()` wrapping jsdiff's `structuredPatch` into `DiffLine`/`DiffHunk`/`UnifiedDiff`
- `server/src/application/compose-review-service.ts` - `ComposeReviewService.previewStackChange()`, the single read-only preview entry point
- `server/src/lib/errors.ts` - `ConfirmationRequiredError` (428)
- `server/src/application/stack-service.ts` - `StackChangeReviewer` port, 8th constructor param, pre-write confirmation check in `updateStack`
- `server/src/application/index.ts` - `composeReviewService` singleton wired into `stackService`
- `server/src/routes/stacks.ts` - `POST /api/stacks/:id/preview`
- `shared/src/validation/stacks.ts` - `confirmed` on create/updateStackSchema, `stackChangePreviewSchema`, `createStackPreviewSchema`
- `client/src/lib/stacks-api.ts` - `previewStackChange()`, `DiffLine`/`DiffHunk`/`UnifiedDiff`/`StackChangePreview` client types
- `client/src/components/common/unified-diff-view.tsx` - `UnifiedDiffView`, a generic hunk renderer (no domain imports) with an `annotations` slot for 12-05
- `client/src/components/domain/stack/diff-confirm-dialog.tsx` - `DiffConfirmDialog`, the `AlertDialog` review gate with env secret masking
- `client/src/hooks/use-stack-config-files.ts` - `review`/`reviewPending`/`confirmReview()`/`cancelReview()` added to `StackConfigFiles`; `saveCompose`/`saveEnv` route through a shared preview→review→confirm `applyChange`
- `client/src/routes/app/stacks/components/config-tab.tsx` - `stackName` prop, `DiffConfirmDialog` wiring, both Save buttons disabled while `reviewPending`
- `client/src/routes/app/stacks/[id].tsx` - passes `stackName={stack.displayName}` (stays at 90 lines, the plan's budget)
- Test files: `server/test/unit/lib/unified-diff.test.ts`, `server/test/unit/application/compose-review-service.test.ts` (new); `server/test/unit/application/stack-service.test.ts`, `server/test/integration/stacks.test.ts` (extended); `client/test/unit/components/common/unified-diff-view.test.tsx`, `client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx` (new); `client/test/unit/hooks/use-stack-config-files.test.ts`, `client/test/unit/routes/stacks/config-tab.test.tsx`, `client/test/integration/stacks.spec.ts`, `client/test/integration/config-unsaved-changes.spec.ts` (extended)

## Decisions Made

- **Manual toast control over `toast.promise`:** `applyChange` in `useStackConfigFiles` needed a branch (the 428 retry) that resolves with *neither* a success nor an error toast. Inspecting `node_modules/sonner/dist/index.mjs` confirmed `toast.promise` always calls `data.success`/renders a toast once that option is structurally present, regardless of what the callback returns — there's no shape that expresses "sometimes no toast." Switched to `toast.loading`/`toast.success`/`toast.error`/`toast.dismiss` called directly, giving full control. This only affects `applyChange`'s internals; the loading/success/error copy strings are unchanged from the original `toast.promise` version.
- **`AlertDialogAction`'s `preventDefault()`:** Radix's `AlertDialogAction` (used for "Confirm & Apply") fires its own `onOpenChange(false)` on click via `composeEventHandlers`, which checks `event.defaultPrevented` before running its internal handler. Without `e.preventDefault()` in the `onClick`, confirming would also fire `handleOpenChange`'s `onCancel()` branch — discovered via a failing unit test (`Keep Editing calls onCancel` was being called twice before the fix was generalized to the Action button too), fixed, and now covered by an explicit `onConfirm`-but-never-`onCancel` assertion.
- **Masking logic deferred from Task 2 to Task 3's commit:** the `DiffConfirmDialog` component shape (including the `file: "compose" | "env"` discriminant and env title) was built in Task 2 per the plan's own action item, but the secret-masking implementation itself was deliberately held for Task 3's commit to keep each task's diff matching its own declared scope and acceptance criteria.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DiffConfirmDialog`'s Keep Editing button double-fired `onCancel`**
- **Found during:** Task 2, writing `diff-confirm-dialog.test.tsx`
- **Issue:** `AlertDialogCancel` was given both an explicit `onClick={onCancel}` and relied on Radix's own close-triggered `onOpenChange(false)` → `handleOpenChange` → `onCancel()`, firing twice per click.
- **Fix:** Removed the explicit `onClick` from `AlertDialogCancel`, relying solely on `onOpenChange`; added `e.preventDefault()` to `AlertDialogAction`'s `onClick` to stop its own auto-close from firing `onCancel` via the same path.
- **Files modified:** `client/src/components/domain/stack/diff-confirm-dialog.tsx`
- **Committed in:** `3234571` (Task 2 commit)

**2. [Rule 1 - Bug] Existing D-20/D-21 EnvEditor Playwright save test broke after saveEnv started going through the preview flow**
- **Found during:** Task 2's Playwright verification pass
- **Issue:** `saveEnv()` now calls `previewStackChange` before applying — the pre-existing "EnvEditor table mode add + save" test didn't stub `**/api/stacks/my-app/preview`, tripping the `_apiRouteGuard` unstubbed-request failure.
- **Fix:** Added a preview stub (`confirmationRequired: false`) to that test so it keeps exercising its own D-20/D-21 concern rather than the review gate.
- **Files modified:** `client/test/integration/stacks.spec.ts`
- **Committed in:** `3234571` (Task 2 commit)

**3. [Rule 1 - Bug] Exact-count acceptance-criteria greps violated by docstring wording**
- **Found during:** final verification pass, after Task 3's commit
- **Issue:** `diff-confirm-dialog.tsx`'s module docstring quoted "Keep Editing" and "Confirm & Apply" verbatim (present since Task 2's original version), doubling the plan's `grep -c` counts for both acceptance criteria.
- **Fix:** Reworded the docstring without changing rendered text or behavior.
- **Files modified:** `client/src/components/domain/stack/diff-confirm-dialog.tsx`
- **Committed in:** `ddfda08` (separate fixup commit, since Task 2/3 were already committed when this was caught)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs caught by the plan's own tests, 1 Rule 1 fixup caught by acceptance-criteria verification)
**Impact on plan:** All three are necessary correctness fixes with no scope creep — none changed the plan's intended behavior or design.

## Issues Encountered

- **Server integration tests (Branch B, environmental):** `yarn workspace @docktor/server test:integration test/integration/stacks.test.ts` (both the pre-existing suite and this plan's three new tests — the 428 rejection, the confirmed-write success, and the preview-endpoint test) could not run live. `startContainer()` successfully starts a testcontainers Postgres container, but `prisma db push` then fails with `P1001: Can't reach database server at localhost:<published-port>` — the same TCP-payload-to-published-port block documented in STATE.md for plans 05.1-01 and 08-01, now reconfirmed for this plan. The exact error:
  ```
  Error: P1001: Can't reach database server at `localhost:32769`.
  Please make sure your database server is running at `localhost:32769`.
  ```
  All three new integration tests are written and will exercise the 428/confirmed/preview behavior correctly once run in an unrestricted environment (a human/CI re-run is required — see coverage item D2's `rationale`).
- **Host-contention Playwright/vitest flakes (environmental, not attributed to this plan):** During verification, `theme-toggle.test.tsx` (client unit) and `config-unsaved-changes.spec.ts` (Playwright) each intermittently failed once when run as part of a larger combined suite on this host (13.9GB/15GB RAM used, swap maxed, load average 4.5–6, ~20 unrelated Docker containers running). Neither file was touched by this plan. Both pass reliably in isolation and in a subsequent full combined re-run (18/18 Playwright tests, including `config-unsaved-changes.spec.ts`, passed cleanly). Matches the host-memory-pressure pattern STATE.md documents for Phase 05.1/08.

## Flagged Assumption Carried Forward (from the plan)

The plan's own "Flagged assumptions" section notes an unresolved edge for #18: **preview-to-confirm drift** — the diff is computed against the on-disk file at preview time; if the file changes externally (e.g. an SSH edit picked up by FileWatcher) between preview and "Confirm & Apply", the confirmed write still overwrites that external change without a second review (last-writer-wins, identical to pre-phase behavior). This plan's 428-recovery logic (Task 3) handles the *server-detected* case where `confirmationRequired` flips back to true between preview and confirm, but does not add a base-hash check against the previewed content. No change from the plan's own assessment: a follow-up could send the previewed base hash with the PUT and answer 409 on a mismatch. Surfacing this again for phase verification per the plan's instruction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ComposeReviewService`, the `confirmed` contract, and `DiffConfirmDialog` are the stable foundation 12-05 (findings in the review dialog), 12-06 (create-flow review), and 12-08 (deploy pre-flight) build on, per the plan's own "Planning notes."
- `UnifiedDiffView`'s `annotations` prop and `ReviewSubject`'s `kind` discriminant are already shaped for 12-05's rule-findings extension without needing to reshape existing call sites.
- **Blocker for full confidence (not for proceeding):** the server integration tests need a live/CI run in an environment that isn't blocking testcontainers' published-port TCP traffic, to close out coverage item D2 and the must_haves "Pitfall 2 ordering backstop" statement with a real, on-disk verification.

---
*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-02*

## Self-Check: PASSED

All 9 created/key files verified present on disk; all 4 commits (`ed8de25`, `3234571`, `fb9a4cf`, `ddfda08`) verified present in git history.
