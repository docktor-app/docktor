---
phase: 11-ui-rework
fixed_at: 2026-09-30T11:41:07Z
review_path: .planning/phases/11-ui-rework/11-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-09-30T11:41:07Z
**Source review:** `.planning/phases/11-ui-rework/11-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 5
- Skipped: 0

**Verification environment:** all fixes were made and verified inside this worktree checkout
(`/home/raphael/workspace/docktor/.claude/worktrees/bridge-cse_01YbyGF87qdkPuki7LNaWn6o`, branch
`feature/phase-11-ui-rework`) — the same checkout the orchestrator will fast-forward. Each fix was
verified with the relevant Vitest suite plus `tsc --noEmit` for the workspace(s) touched; a full
`client` workspace `tsc --noEmit` and a full `client` Vitest run (528 tests) were also run at the end
as a final sanity pass, both green.

## Fixed Issues

### WR-01: Grouped proxy domains table shows only the first domain's internal port

**Files modified:** `client/src/routes/app/stacks/components/proxy-domains-table.tsx`, `client/test/unit/routes/stacks/proxy-domains-table.test.tsx` (new)
**Commit:** `840791f`
**Applied fix:** Rendered the Internal Port cell the same way as the other per-domain columns — a `flex flex-col gap-1` list mapped over each group's `rows`, one `internalPort` per domain — instead of `rows[0].internalPort` repeated for every row. Added a new unit test (`proxy-domains-table.test.tsx`, previously untested in isolation) asserting that two domains on the same service with different ports (8080/80) each show their own port.

### WR-02: Disk-threshold number inputs can display a value that was never saved

**Files modified:** `client/src/routes/app/settings/components/notification-triggers-card.tsx`, `client/test/unit/routes/settings/notification-triggers-card.test.tsx` (new)
**Commit:** `e9138cd`
**Applied fix:** Both the percent and bytes threshold `onChange` handlers now always call their setter with a clamped value (`Math.min(99, Math.max(1, val))` for percent; `Math.max(1, bytes)` for bytes) instead of skipping the setter when the parsed value was out of range — the controlled input can no longer drift from React state. Added a new regression test file exercising both inputs; verified the test actually fails against the pre-fix code (confirmed via a temporary `git stash` of just the source fix, per the rollback protocol's non-destructive tooling) before restoring the fix.

### WR-03: `EnvEditor` table mode allows silent duplicate variable keys

**Files modified:** `shared/src/validation/stacks.ts`, `client/src/components/domain/stack/env-editor.tsx`, `shared/test/unit/validation/stacks.test.ts`, `client/test/unit/components/domain/stack/env-editor.test.tsx`
**Commit:** `c8cd4a1`
**Applied fix:** Added an exported `checkDuplicateEnvKeys` `superRefine` function in `shared/src/validation/stacks.ts`, applied to the shared `envTableFormSchema` and reused by `EnvEditor`'s client-local `clientEnvTableFormSchema` (the schema the component's form actually validates against — `envTableFormSchema` itself wasn't imported anywhere for live validation, so fixing only the shared schema would not have changed on-screen behavior). While implementing, discovered and fixed a second, related bug surfaced by the new UI regression test: react-hook-form's `onChange`-mode schema validation only patches the errors subtree for the field that changed, so a cross-row duplicate-key issue reported against a *sibling* row's key never applied to that sibling until something else touched it. Added an effect that revalidates the whole `variables` array whenever any row's key changes, so every duplicate row is flagged, not just the last-edited one. Verified with a targeted debug test (removed) that confirmed the pre-fix DOM only showed one of two duplicate rows as invalid.

### WR-04: `LogViewer` props not wrapped in `Readonly<...>`

**Files modified:** `client/src/components/domain/stack/log-viewer.tsx`
**Commit:** `fe21693`
**Applied fix:** Wrapped the destructured props parameter in `Readonly<LogViewerProps>` per CLAUDE.md's stated convention. Pure type-signature change with no behavioral effect; existing `log-viewer.test.tsx` suite (9 tests) and `tsc --noEmit` both pass — no new test needed.

### WR-05: `catch (err: any)` in `create.tsx` violates the project's explicit "no `any`" rule

**Files modified:** `client/src/routes/app/stacks/create.tsx`, `client/test/unit/routes/stacks/create-stack-page.test.tsx` (new)
**Commits:** `36f7d5c`, `f0a51be`
**Applied fix:** Changed `catch (err: any)` to `catch (err: unknown)` with `err instanceof Error ? err.message : "Failed to create stack"`. Added a new `CreateStackPage` test file (no prior test existed) covering both an `Error` rejection (message surfaced) and a non-`Error` rejection (fallback message surfaced, matching the review's concern about a non-`Error` throw crashing the old `.message` access). A follow-up commit (`f0a51be`) bumped the new test file's timeout to 15s after the full-suite run exposed a timing flake consistent with the codebase's documented CPU-contention flake class (same pattern already applied in `proxy-tab.test.tsx`/`stack-detail-page.test.tsx`).

## Skipped Issues

None — all 5 in-scope findings were fixed.

---

_Fixed: 2026-09-30T11:41:07Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
