---
phase: 12-compose-safety-and-templates
reviewed: 2026-10-03T00:00:00Z
depth: standard
files_reviewed: 90
files_reviewed_list:
  - client/src/components/common/unified-diff-view.tsx
  - client/src/components/domain/stack/compose-warning-badge.tsx
  - client/src/components/domain/stack/deploy-warnings-alert.tsx
  - client/src/components/domain/stack/diff-confirm-dialog.tsx
  - client/src/components/domain/stack/template-updated-badge.tsx
  - client/src/components/domain/template/template-card.tsx
  - client/src/components/domain/template/template-grid.tsx
  - client/src/components/domain/template/template-variant-dialog.tsx
  - client/src/hooks/use-create-stack-source.ts
  - client/src/hooks/use-create-stack.ts
  - client/src/hooks/use-stack-config-files.ts
  - client/src/hooks/use-stack.ts
  - client/src/hooks/use-template-repos.ts
  - client/src/hooks/use-templates.ts
  - client/src/lib/compose-rules.ts
  - client/src/lib/deploy-warnings.ts
  - client/src/lib/settings-api.ts
  - client/src/lib/stacks-api.ts
  - client/src/lib/templates-api.ts
  - client/src/router.tsx
  - client/src/routes/app/settings/components/compose-checks-card.tsx
  - client/src/routes/app/settings/components/template-repos-card.tsx
  - client/src/routes/app/settings.tsx
  - client/src/routes/app/stacks/components/config-tab.tsx
  - client/src/routes/app/stacks/components/create-stack-form.tsx
  - client/src/routes/app/stacks/components/stack-alerts.tsx
  - client/src/routes/app/stacks/components/stack-detail-header.tsx
  - client/src/routes/app/stacks/components/template-repo-alerts.tsx
  - client/src/routes/app/stacks/create.tsx
  - client/src/routes/app/stacks/[id].tsx
  - client/src/routes/app/stacks/templates.tsx
  - client/test/integration/stacks.spec.ts
  - client/test/integration/templates.spec.ts
  - client/test/unit/components/domain/stack/compose-warning-badge.test.tsx
  - client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx
  - client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx
  - client/test/unit/components/domain/stack/template-updated-badge.test.tsx
  - client/test/unit/components/domain/template/template-grid.test.tsx
  - client/test/unit/components/domain/template/template-variant-dialog.test.tsx
  - client/test/unit/hooks/use-create-stack-source.test.ts
  - client/test/unit/hooks/use-create-stack.test.ts
  - client/test/unit/hooks/use-stack.test.ts
  - client/test/unit/hooks/use-template-repos.test.ts
  - client/test/unit/hooks/use-templates.test.ts
  - client/test/unit/lib/compose-rules.test.ts
  - client/test/unit/lib/deploy-warnings.test.ts
  - client/test/unit/lib/templates-api.test.ts
  - client/test/unit/routes/settings/compose-checks-card.test.tsx
  - client/test/unit/routes/settings/settings-page.test.tsx
  - client/test/unit/routes/settings/template-repos-card.test.tsx
  - client/test/unit/routes/stacks/create-stack-page.test.tsx
  - client/test/unit/routes/stacks/stack-detail-header.test.tsx
  - client/test/unit/routes/stacks/templates-page.test.tsx
  - docs/deployment.md
  - docs/templates.md
  - server/prisma/schema/stack.prisma
  - server/prisma/schema/template.prisma
  - server/src/application/compose-review-service.ts
  - server/src/application/deploy-preflight-service.ts
  - server/src/application/index.ts
  - server/src/application/port-conflict-service.ts
  - server/src/application/ports/compose-rule-engine-port.ts
  - server/src/application/ports/git-executor-port.ts
  - server/src/application/ports/socket-inspector-port.ts
  - server/src/application/ports/template-source-reader-port.ts
  - server/src/application/settings-service.ts
  - server/src/application/stack-service.ts
  - server/src/application/template-service.ts
  - server/src/application/template-update-service.ts
  - server/src/app.ts
  - server/src/domain/host-ports.ts
  - server/src/domain/port-conflicts.ts
  - server/src/domain/template-pin.ts
  - server/src/infrastructure/compose-analyzer.ts
  - server/src/infrastructure/compose-rule-engine.ts
  - server/src/infrastructure/compose-rules/bind-outside-stack-rule.ts
  - server/src/infrastructure/compose-rules/compose-document.ts
  - server/src/infrastructure/compose-rules/docker-socket-rule.ts
  - server/src/infrastructure/compose-rules/inline-env-rule.ts
  - server/src/infrastructure/compose-rules/missing-env-file-rule.ts
  - server/src/infrastructure/compose-rules/named-volume-rule.ts
  - server/src/infrastructure/compose-rules/privileged-rule.ts
  - server/src/infrastructure/compose-rules/registry.ts
  - server/src/infrastructure/compose-rules/rule.ts
  - server/src/infrastructure/git-executor.ts
  - server/src/infrastructure/socket-inspector.ts
  - server/src/infrastructure/template-source-reader.ts
  - server/src/jobs/index.ts
  - server/src/jobs/template-repo-sync.ts
  - server/src/lib/errors.ts
  - server/src/lib/template-config.ts
  - server/src/lib/unified-diff.ts
  - server/src/repositories/index.ts
  - server/src/repositories/stack-repository.ts
  - server/src/repositories/template-repository.ts
  - server/src/routes/settings.ts
  - server/src/routes/stacks.ts
  - server/src/routes/templates.ts
  - server/test/integration/compose-checks.test.ts
  - server/test/integration/setup.ts
  - server/test/integration/stacks.test.ts
  - server/test/integration/templates.test.ts
  - server/test/unit/application/compose-review-service.test.ts
  - server/test/unit/application/deploy-preflight-service.test.ts
  - server/test/unit/application/port-conflict-service.test.ts
  - server/test/unit/application/settings-service.test.ts
  - server/test/unit/application/stack-service.test.ts
  - server/test/unit/application/template-service.test.ts
  - server/test/unit/application/template-update-service.test.ts
  - server/test/unit/domain/host-ports.test.ts
  - server/test/unit/domain/port-conflicts.test.ts
  - server/test/unit/domain/template-pin.test.ts
  - server/test/unit/infrastructure/git-executor.test.ts
  - server/test/unit/infrastructure/socket-inspector.test.ts
  - server/test/unit/infrastructure/template-source-reader.test.ts
  - server/test/unit/jobs/index.test.ts
  - server/test/unit/jobs/template-repo-sync.test.ts
  - server/test/unit/repositories/index.test.ts
  - server/test/unit/validation/templates-schema.test.ts
  - shared/src/validation/index.ts
  - shared/src/validation/settings.ts
  - shared/src/validation/stacks.ts
  - shared/src/validation/templates.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-10-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 90 (full required-reading set; diff confirmed against `061ce4e..HEAD` for every application/domain/infrastructure/route/client file below)
**Status:** issues_found

## Summary

Phase 12 (compose safety checks + template repositories) is, on the whole, carefully engineered: the git/template-source-reader security contract (symlink rejection via `lstat`, size caps, protocol allowlist re-checked immediately before every `execFile`, argv-only invocation, serialized/atomic checkout writes) is thorough and consistently applied, and the review-before-apply (Issue #18/#20) and deploy-preflight (#21) flows are mostly correct, well-tested, and advisory-only as designed.

However, one genuine logic bug was found in the core safety-review gate (`ComposeReviewService.previewStackChange`) that can silently skip the confirmation dialog for a newly-relevant `missingEnvFile` finding when a stack's first `.env` file is added — defeating the exact "skip never hides an introduced finding" guarantee the D-04 reconciliation logic is supposed to provide, and doing so specifically in the configuration where it matters most (skip-review enabled). This is classified as a blocker because it is a correctness defect in the feature this phase exists to deliver, not a hypothetical edge case: it is reachable through the ordinary Config tab UI (save a first `.env` file to an existing stack) and is not covered by the existing test suite, which only exercises `hasEnvFile` with `composeContent` held constant.

Three warnings and one info item round out the rest: two missing-error-handling sites in the new template-repo UI that produce unhandled promise rejections and silent failures on a genuine network error, a logic-bug-adjacent gap in the EnvEditor-independent `index` identity for `inlineEnv` findings on duplicate keys, and an undocumented non-null assertion pair.

## Critical Issues

### CR-01: Compose-review "introduced" detection uses the post-edit env-file context for the pre-edit evaluation, which can silently skip confirmation when a stack's first `.env` file is added

**File:** `server/src/application/compose-review-service.ts:100-106`

**Issue:**

```ts
const settings = await this.settings.getComposeCheckSettings();
const enabled = this.enabledRuleIds(settings);
const context = {stackDirectory: stack.hostPath, hasEnvFile: afterEnv.trim() !== ""};

const beforeEvaluation = this.engine.evaluate(beforeCompose, context, enabled);
const afterEvaluation = this.engine.evaluate(afterCompose, context, enabled);
const findings = this.markIntroduced(afterEvaluation.findings, beforeEvaluation.findings);
```

`context.hasEnvFile` is computed once, from `afterEnv` (the *post-edit* env content), and that single `context` object is then reused for **both** the before-edit and after-edit rule evaluations. `MissingEnvFileRule.check()` is the one built-in rule that branches on `context.hasEnvFile` (`server/src/infrastructure/compose-rules/missing-env-file-rule.ts:17`: `if (!context.hasEnvFile) return [];`).

Walk through the realistic case: a stack was created with no `.env` file, and some service has no `env_file:` entry. The user later adds an `.env` file for the first time via the Config tab's Environment Variables editor (`saveEnv()` in `use-stack-config-files.ts`, which calls `previewStackChange(stackId, {envContent})` with `composeContent` omitted):

- `beforeEnv = ""`, `afterEnv = "<new content>"` → `context.hasEnvFile = true`.
- `change.composeContent === undefined`, so `afterCompose === beforeCompose` (the compose file itself is untouched).
- `beforeEvaluation = engine.evaluate(beforeCompose, {hasEnvFile: true}, enabled)` — this is **wrong**: at the point in time this evaluation is supposed to represent, there was no `.env` file yet, so `hasEnvFile` should have been `false`. Because it is `true`, `MissingEnvFileRule` now (incorrectly) fires in the "before" evaluation too.
- Since `afterCompose === beforeCompose` and the context is identical, `beforeEvaluation.findings` and `afterEvaluation.findings` are **identical sets**, so `markIntroduced()` marks the `missingEnvFile` finding as `introduced: false` — "this already existed," which is false; it is a direct consequence of the very edit being reviewed.

Consequence: `confirmationRequired = hasChanges && (!settings.skipReview || findings.some(f => f.introduced))`. With the default `skipReview: false` the dialog still opens (just with a misleading missing "new" badge). But with `skipReview: true` — the setting this phase's own code comment describes as "the skip toggle only ever suppresses confirmation for an edit that introduces NO finding" — `confirmationRequired` becomes `false` and the `.env` file is written with **zero review step**, even though this specific edit is precisely what made the `missingEnvFile` finding newly applicable. This directly contradicts the documented D-04×#20 reconciliation guarantee at lines 108-118 of the same file ("a finding newly introduced by this specific edit still requires confirmation even with skip on").

This is not exercised by the existing test suite: `server/test/unit/application/compose-review-service.test.ts`'s only `hasEnvFile`-related test (`"passes stackDirectory = the stack's hostPath and hasEnvFile = the post-edit .env content is non-blank to the engine"`, lines 206-218) asserts the context value that was passed, with no test for the before/after asymmetry this bug depends on, and no test anywhere constructs a "first `.env` file added" + `missingEnvFile` + `skipReview: true` scenario.

**Fix:**

```ts
const beforeContext = {stackDirectory: stack.hostPath, hasEnvFile: beforeEnv.trim() !== ""};
const afterContext = {stackDirectory: stack.hostPath, hasEnvFile: afterEnv.trim() !== ""};

const beforeEvaluation = this.engine.evaluate(beforeCompose, beforeContext, enabled);
const afterEvaluation = this.engine.evaluate(afterCompose, afterContext, enabled);
```

Add a regression test: stack with no `.env`, a service with no `env_file:`, `skipReview: true`, preview an `envContent`-only change that adds a non-empty `.env` — assert `confirmationRequired: true` and the `missingEnvFile` finding has `introduced: true`.

## Warnings

### WR-01: Template-repo "Retry" (browse page) swallows a network failure with no user feedback and an unhandled promise rejection

**File:** `client/src/routes/app/stacks/templates.tsx:44-47`

**Issue:**

```ts
function handleRetry(repoId: string) {
    setRetryingRepoId(repoId);
    void retryRepo(repoId).finally(() => setRetryingRepoId(null));
}
```

`retryRepo` (from `use-templates.ts`) is `async (repoId) => { await syncTemplateRepo(repoId); await fetchCatalog("background"); }` — if either call rejects (e.g. a genuine network/5xx failure, not just a recorded sync error, which the server already absorbs server-side), the rejection propagates through `retryRepo(repoId)`. `.finally()` does not swallow a rejection — it returns a new promise with the same rejection — and `void` only suppresses the "floating promise" lint warning, not the actual unhandled-rejection at runtime. The result: an uncaught promise rejection in the console, the Retry button's spinner silently stops, and the user gets no indication the retry failed.

**Fix:**

```ts
function handleRetry(repoId: string) {
    setRetryingRepoId(repoId);
    retryRepo(repoId)
        .catch((err: unknown) => {
            toast.error(`Couldn't retry sync — ${err instanceof Error ? err.message : "unknown error"}.`);
        })
        .finally(() => setRetryingRepoId(null));
}
```

### WR-02: Template-repo "Sync now" (Settings → Stacks) has the identical missing-error-handling gap

**File:** `client/src/routes/app/settings/components/template-repos-card.tsx:82`

**Issue:**

```tsx
<Button ... onClick={onSyncNow}>
```
where `onSyncNow={() => void syncRepo(repoRow.id)}` (passed from `template-repos-card.tsx:82`, calling `useTemplateRepos().syncRepo`). `syncRepo` in `use-template-repos.ts:68-83` only wraps its body in `try { ... } finally { ... }` — no `catch` — so a rejection from `syncTemplateRepo`/`fetchRepos` re-throws after the `finally` runs, producing the same unhandled-rejection-with-no-user-feedback pattern as WR-01. Confirmed by `client/test/unit/hooks/use-template-repos.test.ts`: every `syncRepo` test exercises only the success path; there is no test for `mockSyncTemplateRepo.mockRejectedValue(...)`.

**Fix:** Either give `syncRepo` its own `catch` that surfaces a toast (symmetric with `addRepo`'s caller-side handling in the same card), or add a `.catch()` at the `onSyncNow` call site, e.g.:
```tsx
onSyncNow={() => { syncRepo(repoRow.id).catch((err: unknown) => toast.error(`Sync failed — ${err instanceof Error ? err.message : "unknown error"}`)); }}
```

### WR-03: `InlineEnvRule`'s list-form line lookup can misattribute the finding's line when a service's env list has duplicate keys

**File:** `server/src/infrastructure/compose-rules/inline-env-rule.ts:26-36`, compounded by `server/src/infrastructure/compose-analyzer.ts`'s `extractInlineEnvVars` (list-form branch).

**Issue:** `ComposeAnalyzer.extractInlineEnvVars()` builds a `vars` object keyed by variable name for the list form (`for (const entry of env) { ...; vars[key] = value; }`), so a malformed compose file with two `KEY=...` entries for the same key collapses to one entry (last write wins). `InlineEnvRule.check()` then locates that key's line via:
```ts
(environment as unknown[]).findIndex((entry) => typeof entry === "string" && entry.startsWith(`${key}=`))
```
`findIndex` always returns the position of the **first** matching entry, which is not necessarily the entry whose value ended up in `vars[key]` (the **last** one, per the analyzer's overwrite semantics). The resulting finding can point the review dialog's inline annotation at the wrong line for a service with duplicate inline-env keys.

**Fix:** This is a narrow edge case (malformed compose with duplicate env keys in the same service), so a minimal fix is sufficient: have `extractInlineEnvVars()` track the index alongside the value (or have `InlineEnvRule` use `findLastIndex` to match the "last value wins" semantics used for the recorded value), so the located line is always consistent with which entry's value is actually reported.

## Info

### IN-01: Non-null assertions on `StackChangePreview.compose`/`.env` lack the project's required justification comment

**File:** `client/src/routes/app/stacks/components/config-tab.tsx:31`

**Issue:**
```ts
diff: files.review.file === "compose" ? files.review.preview.compose! : files.review.preview.env!,
```
Both `compose` and `env` are typed `UnifiedDiff | null` on `StackChangePreview`. The assertions are in fact safe — `review` is only ever set from a `previewStackChange` response, and the corresponding field is always populated when its own file section is the one that triggered the preview (confirmed by tracing `ComposeReviewService.previewStackChange`, which returns `compose`/`env` non-null exactly when `change.composeContent`/`change.envContent` was submitted, and `saveCompose()`/`saveEnv()` each submit only their own field). CLAUDE.md requires "No unchecked casts — `as SomeType` is only acceptable with a comment explaining why it is safe"; the same diligence should apply to non-null assertions (`!`), which carry the identical risk of a silent runtime crash if the invariant is ever broken by a future refactor (e.g. a future caller that previews both files in one call).

**Fix:** Add a one-line comment above the ternary explaining the invariant (mirrors the existing pattern used elsewhere in this same file, e.g. the `confirmReview`/`onCancel` double-fire comments), so a future change to `saveCompose`/`saveEnv` that breaks the invariant has a comment to contradict instead of a silent `undefined` passed to `UnifiedDiffView`.

---

_Reviewed: 2026-10-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
