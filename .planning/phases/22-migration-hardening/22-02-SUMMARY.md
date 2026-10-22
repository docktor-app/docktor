---
phase: 22-migration-hardening
plan: 02
subsystem: migration
tags: [secrets, masking, shared, diff-review, vitest, issue-103]

requires:
  - phase: 22-migration-hardening
    provides: 22-01 hardened request paths and typed analyzer (no direct dependency; same phase)
provides:
  - "@docktor/shared maskSecrets module: SECRET_MASK, isSecretKey, maskSecretLine, maskSecrets, lineHasSecret, textHasSecret"
  - "client/src/lib/secret-mask.ts reveal-aware helpers (displaySecretLine, displaySecretText, maskDiffHunks, hunksHaveSecret)"
  - "Migration review step with one Show secrets toggle over compose diff and .env preview"
  - "Server-side masked migration error text (stored, listed and SSE-broadcast)"
affects: [22-03, phase-24, phase-25]

actuals:
  tokens: 14500
  tasks: 2
  commits: 4
plan_head_before: a628884b30fd37f81dd3e7213d104aa63e0d4fd1
plan_head_after: b8358b8a7dface4b0d97ad724a8083ec17f4e1bf

tech-stack:
  added: []
  patterns:
    - "Single pure masker in @docktor/shared consumed by client display helpers and server error text"
    - "Structural hunk typing (lines with text) so masking helpers are independent of the diff renderer"

key-files:
  created:
    - shared/src/secrets/mask-secrets.ts
    - shared/test/unit/secrets/mask-secrets.test.ts
    - client/src/lib/secret-mask.ts
    - client/test/unit/lib/secret-mask.test.ts
    - client/test/unit/routes/setup/migration-review-step.test.tsx
  modified:
    - shared/src/index.ts
    - client/src/routes/setup/components/migration-review-step.tsx
    - client/src/lib/env-file.ts
    - client/src/components/domain/stack/diff-confirm-dialog.tsx
    - server/src/application/migration-operation-service.ts
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx
    - server/test/unit/application/migration-operation-service.test.ts
  deleted:
    - client/src/lib/env-mask.ts
    - client/test/unit/lib/env-mask.test.ts

key-decisions:
  - "Masked values keep wrapping quotes (KEY: 'x' becomes KEY: '••••••••'), and quotes opened before the key (- \"API_KEY=y\") are kept, so the masked text still reads as the original shape"
  - "isSecretKey is extended with passwd and credential; the client env-file module re-exports it so env-editor and tests keep their import path"
  - "The stack-edit review dialog now masks compose diffs too (previously only .env diffs); its toggle copy (Show secret values) is unchanged, while the migration review uses Show secrets / Hide secrets per D-09"
  - "Server masks result.error only (REST list/get and SSE share the stored operation); no other field is touched"

patterns-established:
  - "Secret masking lives only in @docktor/shared; Phases 24-25 (masked compose for viewers, audit metadata) reuse it"

requirements-completed: [MIG-10]

coverage:
  - id: D1
    description: "Compose diff (removed and added lines, map/list form, URL credentials) and .env preview masked behind one toggle, masked on every open"
    requirement: MIG-10
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-review-step.test.tsx; shared/test/unit/secrets/mask-secrets.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stack-edit review dialog masks compose diffs with the same shared rules"
    requirement: MIG-10
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration operation error text never carries URL credentials or secret KEY=value pairs"
    requirement: MIG-10
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-operation-service.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 02: Shared secret masker for migration diff, review dialog and error text Summary

**One key- and URL-aware `maskSecrets` in @docktor/shared now masks removed and added compose diff lines plus the .env preview behind a single "Show secrets" toggle (#103), the stack-edit review dialog, and the server's stored/broadcast migration error text; the client env-mask module is gone.**

## Performance

- **Duration:** about 25 min (start time not captured at launch; estimated)
- **Completed:** 2026-10-22T14:01Z
- **Tasks:** 2 (both TDD: RED then GREEN commit each)
- **Files:** 8 modified, 5 created, 2 deleted

## Accomplishments

- `shared/src/secrets/mask-secrets.ts` masks, in order: URL userinfo passwords (`scheme://user:pass@host`, any key, kept when the password is a whole `${VAR}`), `.env`/list-form `KEY=value` (indentation, `- ` marker, quotes and `export` kept), and compose map-form `KEY: value`. Block scalars, flow collections, anchors, empty values, variable references and CRLF endings are left alone; masking is idempotent.
- `MigrationReviewStep` computes `hasSecret` over diff hunks and the .env text, renders one ghost button ("Show secrets" / "Hide secrets", `aria-pressed`), and passes masked hunks and masked env text to the renderers. State is local, so every open starts masked.
- `DiffConfirmDialog` lost its three local masking helpers and uses `maskDiffHunks`/`hunksHaveSecret`; compose edits are masked now too.
- `MigrationOperationService` masks `result.error` in `toOperationResult` and the unexpected-rejection message, so list, get and the `migration.progressed` SSE payload never carry a secret from stderr (T-22-06).
- `env-file.ts` no longer holds its own secret-key regex (re-export from shared); `client/src/lib/env-mask.ts` and its test are deleted, and `grep -rn "env-mask" client/src client/test` prints nothing.

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 shared masker drives review diff and .env preview (tracer) | 9aa9e0c | dad6eb2 |
| 2 one masking source: env-file, dialog, server error text | 0552fe7 | b8358b8 |

## TDD Gate Compliance

RED commits precede each GREEN commit, and each RED run failed on assertions (not on missing modules): Task 1 RED used a pass-through stub of the shared and client modules (23 of 45 shared cases, 5 client helper cases and 3 review-step cases failed on expected masked text). Task 2 RED: the map-form compose dialog case and both server error cases failed on the unmasked text. The formal `gsd_run check tdd-red-evidence` classifier was not run for this plan; the failures were inspected directly and are plain assertion mismatches. No REFACTOR commits were needed.

Tracer gate: Task 1's `<verify>` (shared build, shared masker suite, client helper, review-step and migration-wizard suites) passed end to end before Task 2 expansion began.

## Decisions Made

- See key-decisions above. User-visible: the stack-edit review dialog now masks secrets in compose diffs (map form, list form, URL credentials), which it did not before.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing tests asserted the old toggle copy and the old no-compose-masking rule**
- **Found during:** Tasks 1 and 2
- **Issue:** `migration-wizard.test.tsx` looked up "Show secret values"/"Hide secret values" on the review step (the plan specifies "Show secrets"/"Hide secrets"), and `diff-confirm-dialog.test.tsx` had a case "never masks a compose diff" that contradicts D-09.
- **Fix:** Wizard test label queries updated to the new copy; the dialog case replaced by a map-form compose masking test (plus a variable-reference case that shows no toggle).
- **Files modified:** `client/test/unit/routes/setup/migration-wizard.test.tsx`, `client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx`
- **Commits:** dad6eb2, 0552fe7

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on scope.

### Process notes (not code deviations)

- **Verification scope (MEMORY rule).** No full `tsc --build`, no integration or Playwright suites, no full suites. Ran only the targeted vitest files named in the two `<verify>` blocks, plus one scoped `tsc --noEmit -p tsconfig.json` each for client (42 s) and server (30 s), both zero errors, and the shared build. The Playwright spec `client/test/integration/stacks.spec.ts` (env dialog, "Show secret values") is unchanged in behaviour and left to CI. Full typecheck and the full suites remain for GitHub Actions.
- **Worktree branch guard.** As in 22-01, this is the sequential executor on `feature/phase-22-migration-hardening`, so the `agent-*` allow-list of the parallel-worktree commit assertion was not applied; the protected-branch check and the root pin guard ran before every commit.

## Issues Encountered

None.

## Known Stubs

None. (The RED-commit stubs of the shared and client modules were replaced in the GREEN commits.)

## Threat Flags

None beyond the plan's threat model. T-22-05 and T-22-06 are mitigated; T-22-07 (key-name heuristic false negatives) stays accepted and documented in the module header.

## User Setup Required

None.

## Next Phase Readiness

Ready for 22-03. `@docktor/shared` exports `maskSecrets`/`maskSecretLine`/`textHasSecret`, ready for the masked compose in Phase 24 and audit metadata in Phase 25. The changelog entry (plan 22-08) should note that the stack-edit review dialog now masks compose diffs too.

## Self-Check: PASSED

- Created files exist: `shared/src/secrets/mask-secrets.ts`, `shared/test/unit/secrets/mask-secrets.test.ts`, `client/src/lib/secret-mask.ts`, `client/test/unit/lib/secret-mask.test.ts`, `client/test/unit/routes/setup/migration-review-step.test.tsx`.
- Deleted files are gone: `client/src/lib/env-mask.ts`, `client/test/unit/lib/env-mask.test.ts`.
- Commits found on the branch: 9aa9e0c, dad6eb2, 0552fe7, b8358b8.
- Acceptance greps: `secrets/mask-secrets.js` in shared index once; `maskDiffHunks(` once and `env-mask` zero times in the review step; `maskSecrets(` twice in the operation service; no secret-key regex left in `env-file.ts`; `grep -rn "env-mask" client/src client/test` empty.
