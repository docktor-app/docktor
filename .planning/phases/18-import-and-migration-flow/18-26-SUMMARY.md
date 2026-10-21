---
phase: 18-import-and-migration-flow
plan: 26
subsystem: server
tags: [migration, compose-project-name, gap-closure, migration-wizard, preflight]
requires:
  - phase: 18-import-and-migration-flow
    provides: TargetAssessment.composePath and DirectoryIdentityPort (18-22); container-to-stack attribution (18-25)
provides:
  - Pure compose project name predictor (env-file, compose-file, directory) with Compose-style normalisation
  - Preflight refusal (400) of a stop-off migration whose old and new stack share the project name
  - target.sharedProjectName in the migration preview and the shared schema
  - Step 4 forces the stop switch on, with the source-specific reason (StopRequirement)
affects: [G-18-22-status, MIG-04, MIG-01]
actuals:
  tokens: 6900
  tasks: 3
  commits: 6
plan_head_before: 57ea95b4d3de9f8fa66c8f09378e4face3e99919
plan_head_after: 98d5a3fdf0e5875cea17fd2c0ce0e47384dfc4d0
commits: 6
tech-stack:
  added: []
  patterns:
    - "Pure domain predictor over the files Docktor already reads; application service decides the refusal"
    - "Discriminated StopRequirement drives a forced, disabled switch and its help text"
key-files:
  created:
    - server/src/domain/compose-project-name.ts
    - server/test/unit/domain/compose-project-name.test.ts
  modified:
    - server/src/application/migration-service.ts
    - server/src/domain/host-ports.ts
    - server/test/unit/application/migration-service.test.ts
    - shared/src/validation/brownfield.ts
    - shared/test/unit/validation/brownfield.test.ts
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/routes/setup/components/migration-old-stack-step.tsx
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/integration/setup-wizard.spec.ts
key-decisions:
  - "Refuse (user decision), never auto-rename, when stopOldStack is false and the predicted old and new project names are equal and non-empty"
  - "Precedence mirrors Compose for what the files show: COMPOSE_PROJECT_NAME in .env, then top-level name: (interpolated from that .env), then the directory name; each normalised"
  - "The new stack's name is predicted over the same compose file and old .env with the stack id as directory name, because the new stack keeps both and Docktor runs compose without -p"
  - "In-place targets report null: they already force the stop (18-15/G-18-7)"
  - "A preview response without sharedProjectName counts as no collision on the client"
requirements-completed: [MIG-04, MIG-01]
status: complete
---

# Phase 18 Plan 26: Refuse a shared compose project name Summary

A migration that would leave the old stack running under the same Docker Compose project name as the new stack is now refused with a 400 before any side effect, and step 4 of the dialog forces the stop with the reason (G-18-22-status, refusal half).

## What was done

- **Task 1 (tracer, TDD):** Tests first (`e4f8b9e`). Then `domain/compose-project-name.ts` (`normalizeComposeProjectName`, `composeProjectName`, directory source), `composeProjectNameSourceSchema`/`sharedProjectNameSchema` and `migrationTargetSchema.sharedProjectName` in shared, `MigrationService.sharedProjectName` (null unless the target is separate; old name from the original directory, new name from the stack id), the preflight refusal and `target.sharedProjectName` in the preview, and the client `StopRequirement` (in-place | shared-project-name) in `migration-old-stack-step.tsx`/`migration-wizard.tsx`. Shared brownfield schema tests were updated in the same commit because the new field is required.
- **Task 2 (TDD):** Tests first (`8dd6331`). `composeProjectName` now follows Compose's precedence (`.env` COMPOSE_PROJECT_NAME, top-level `name:` interpolated via the now exported `interpolateEnv`, directory). YAML parse errors and unresolvable or non-string names fall back. The refusal message is built per source and names the way out (stop, choose another name, or remove `name:` / `COMPOSE_PROJECT_NAME`).
- **Task 3 (TDD):** Tests first (`11953cb`): source-specific wizard tests, fixtures with `sharedProjectName: null`, and a Playwright forced-stop test (CI). Then the step-4 help text gains one source-specific sentence (`SOURCE_EXPLANATION`).

## Verification

- `tsc --project shared/tsconfig.json` succeeds; shared `brownfield.test.ts` 58 passed.
- Server unit: compose-project-name, host-ports, migration-service, brownfield-routes, layering: 5 files, 378 tests passed.
- Client unit: migration-wizard and brownfield-import: 2 files, 76 tests passed.
- Acceptance greps hold (`export function composeProjectName` 1, `remove COMPOSE_PROJECT_NAME` 1, `sharedProjectName ?? null` 1, `choose a different stack name` 1); the `test(18-26)` commit precedes the first `feat(18-26)` commit.
- Not run, per project memory: full `tsc --build`, server integration tests and Playwright (`setup-wizard.spec.ts` on chromium and mobile-chromium) - CI. The client fixtures and the Playwright spec carry the new required field so the CI type check holds.
- Human re-test still required: 18-UAT.md test 8 (backup off, stop off) for a stack whose directory name equals the new stack name shows the forced stop with the reason; with a different stack name the old stack keeps running (with 18-25).

## Deviations from Plan

None - plan executed exactly as written. Notes: the shared schema tests (planned for Task 3) were updated in the Task 1 feat commit because the required field would otherwise break the existing `migrationTargetSchema` tests; the unknown-source and missing-field tests came along with it. The worktree branch is `worktree-bridge-...`, outside the `agent-*` namespace of the commit guard; it was not protected, and the orchestrator pinned this worktree for sequential execution, so commits proceeded there.

## Known Stubs

None.

## Threat Flags

None. T-18-78 is mitigated server-side (preflight refuses for direct API calls too) and in the dialog. T-18-79 (project started with -p or a shell variable) stays accepted. T-18-80 is mitigated: YAML parse errors fall back to the directory name.

## Self-Check: PASSED

- FOUND: server/src/domain/compose-project-name.ts, server/test/unit/domain/compose-project-name.test.ts
- FOUND commits: e4f8b9e, 5513dfd, 8dd6331, ac101b7, 11953cb, 98d5a3f
