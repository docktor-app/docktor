---
phase: quick-261007-e5k
plan: 01
subsystem: client/stacks
tags: [upgrade-dialog, update-images, moving-tag, tdd]
requires: ["13-01 D-04/D-05 moving-tag dialog state"]
provides: ["Update Images shortcut in every ready view of the per-service Upgrade dialog"]
affects: [client/src/routes/app/stacks/components/service-upgrade-dialog.tsx]
tech-stack:
  added: []
  patterns: ["shared runUpdateImages action"]
key-files:
  created: []
  modified:
    - client/src/routes/app/stacks/components/service-upgrade-dialog.tsx
    - client/src/routes/app/stacks/components/update-images-action.ts
    - client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx
decisions:
  - "Update Images button rendered once for all ready views; moving-tag Alert stays gated on moving-tag view only"
  - "Button disabled while an Upgrade submission is in flight (T-261007-01)"
metrics:
  duration: ~10m
  completed: 2026-10-07
status: complete
commits: 4
plan_head_before: a21da1e5debd85832bb1a0fb0acef1abf6681210
plan_head_after: a428ab084fd23d691407bb5fb0a18a2df7b60ba3
actuals:
  tokens: 6000
  tasks: 2
  commits: 4
---

# Quick 261007-e5k: Update Images button in Upgrade dialog for pinned tags

The per-service Upgrade dialog now shows an enabled "Update Images" button in every ready view (select, up-to-date, unchecked, moving-tag). A pinned tag such as `memos:0.31` can be republished with a new digest, and previously the dialog offered nothing actionable for that case. The moving-tag Alert is still shown only for moving tags, and moving-tag behaviour is unchanged.

## What changed

- `service-upgrade-dialog.tsx`: the button moved out of the moving-tag block and renders once whenever `state.status === "ready"`. It is `disabled={submitting}`, so a stack-wide update cannot start while a per-service upgrade is pending. The handler comment now describes the new scope.
- `update-images-action.ts`: docstring only. It no longer calls the dialog usage a "moving-tag shortcut".
- Tests: the old "renders no Update Images button in the %s state" case was reversed into a new "non-moving tag (pinned / semver)" describe block. It covers visibility and the absence of the Alert in all three non-moving views, the click flow for a pinned semver tag, the picker plus Upgrade staying intact, no button while loading or on error, and the in-flight disable. The moving-tag state also gets a "button rendered exactly once" check.

## Commits

- 721bdc3 test(stacks): cover Update Images for pinned tags in upgrade dialog (RED)
- 722e947 feat(stacks): offer Update Images in upgrade dialog for pinned tags (GREEN)
- a4afa45 test(stacks): guard upgrade-dialog Update Images during submit (RED)
- a428ab0 fix(stacks): disable upgrade-dialog Update Images while upgrading (GREEN + docstring)

## Verification

- `service-upgrade-dialog`, `update-images-action`, `services-section` and `stack-actions` suites: 4 files, 49 tests pass.
- Acceptance greps: one `Update Images` JSX text node, zero raw light-only color utilities, zero "moving-tag shortcut" matches.
- `git diff --name-only a21da1e..HEAD -- client/` lists exactly the three planned files.
- `yarn typecheck`: no errors under `client/`. It reports errors only in `server/` (see Deferred Issues).

## Deviations from Plan

None. The plan was executed as written.

## Deferred Issues

`yarn typecheck` fails in `server/` (for example `template-repository.ts`: `templateRepo`, `template` and `templateVariant` are missing on `PrismaClient`, and `PinnedStackRow` is missing properties). This looks like a stale generated Prisma client. It is unrelated to this client-only change and was not touched.

## Known Stubs

None.

## Self-Check: PASSED

- Three modified files exist and match the plan's `files_modified`.
- Commits 721bdc3, 722e947, a4afa45 and a428ab0 are on the branch.
