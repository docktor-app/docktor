# Phase 12: Code Review Fix Report

**Fixed at:** 2026-10-03T00:00:00Z
**Source review:** 12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Compose-review "introduced" detection uses the post-edit env-file context for the pre-edit evaluation, which can silently skip confirmation when a stack's first `.env` file is added

**Files modified:** `server/src/application/compose-review-service.ts`, `server/test/unit/application/compose-review-service.test.ts`
**Commit:** 0a27488
**Applied fix:** Split the single shared `context` object into separate `beforeContext`/`afterContext`, each computed from its own `beforeEnv`/`afterEnv`, so `MissingEnvFileRule` (and any future context-branching rule) evaluates the correct `hasEnvFile` value on each side. Added a regression test covering the exact scenario (stack with no `.env`, service with no `env_file`, `skipReview: true`, add a first `.env` file) asserting `confirmationRequired: true` and `introduced: true`.

### WR-01: Template-repo "Retry" (browse page) swallows a network failure with no user feedback and an unhandled promise rejection

**Files modified:** `client/src/routes/app/stacks/templates.tsx`
**Commit:** 0a27488
**Applied fix:** Added a `.catch()` before the existing `.finally()` in `handleRetry` that surfaces a `toast.error` with the error message, matching the project's existing toast-on-failure convention.

### WR-02: Template-repo "Sync now" (Settings → Stacks) has the identical missing-error-handling gap

**Files modified:** `client/src/routes/app/settings/components/template-repos-card.tsx`
**Commit:** 0a27488
**Applied fix:** Added a `.catch()` at the `onSyncNow` call site that surfaces a `toast.error`, symmetric with the card's existing `addRepo` error handling (`toast` was already imported).

### WR-03: `InlineEnvRule`'s list-form line lookup can misattribute the finding's line when a service's env list has duplicate keys

**Files modified:** `server/src/infrastructure/compose-rules/inline-env-rule.ts`
**Commit:** 0a27488
**Applied fix:** Replaced the `findIndex` lookup (which matches the *first* occurrence of a duplicate key) with a `lastIndexMatching` helper that matches the *last* occurrence, aligning the line-anchor with `extractInlineEnvVars`'s "last value wins" semantics. Implemented as a manual reverse scan rather than `Array.prototype.findLastIndex` because the server workspace targets ES2022 (`findLastIndex` is ES2023 and would fail typecheck under the project's `tsconfig.json` `lib` resolution).

### IN-01: Non-null assertions on `StackChangePreview.compose`/`.env` lack the project's required justification comment

**Files modified:** `client/src/routes/app/stacks/components/config-tab.tsx`
**Commit:** 0a27488
**Applied fix:** Added a comment above the ternary explaining the invariant that makes both non-null assertions safe (traced through `ComposeReviewService.previewStackChange` and `saveCompose()`/`saveEnv()`'s single-field submission), per CLAUDE.md's requirement that unchecked assertions carry an explaining comment.

---

_Fixed: 2026-10-03T00:00:00Z_
_Fixer: Claude (orchestrator — applied directly rather than via gsd-code-fixer, since all 5 findings were small, well-localized, and verified individually with targeted unit tests + typecheck before committing)_
_Iteration: 1_
