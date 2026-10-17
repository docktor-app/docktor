# Phase 12 — UI Review

**Audited:** 2026-10-03
**Baseline:** 12-UI-SPEC.md (approved 2026-10-01)
**Screenshots:** not captured (no dev server running on localhost:3000 — code-only audit)
**Interaction captures:** off (interaction_capture: false)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All spec'd strings (CTAs, empty/error states, rule labels/tooltips) match verbatim where checked |
| 2. Visuals | 3/4 | `compose-checks-card.tsx` renders `ToneBadge` + `FormLabel` side-by-side for every check row — redundant duplicate labeling (matches UI-SPEC's own non-blocking Dimension 2 flag) |
| 3. Color | 3/4 | `template-repos-card.tsx`'s "Add Repository" button uses the default accent `Button` variant though it is not on the spec's accent whitelist |
| 4. Typography | 3/4 | `diff-confirm-dialog.tsx:211` introduces `font-medium` on the "Compose check warnings" heading — UI-SPEC prohibits new `font-medium`/`font-bold` usage (only 400/600 weights allowed) |
| 5. Spacing | 2/4 | `gap-3` (12px) used 7+ times across new components — 12px is not in the declared spacing scale (4/8/16/24/32/48/64) |
| 6. Experience Design | 3/4 | `templates.tsx`'s catalog-load failure renders a hand-rolled `bg-destructive/10` div instead of the spec-mandated `Alert` component, with generic `err.message` instead of spec'd copy |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **`client/src/routes/app/stacks/templates.tsx:55` hand-rolled error banner** — breaks the "never hand-roll new alert coloring" rule; a user hitting a total catalog-load failure sees an inconsistent, non-`Alert`-styled message with generic text instead of the spec'd copy — replace the `<div className="bg-destructive/10...">` with a shadcn `Alert variant="destructive"` carrying the spec'd `Couldn't load templates from {repoUrl} — check the repository URL and try again.` copy (or a suitable generic variant when no single repo URL applies), matching `template-repo-alerts.tsx`'s own pattern one file over.
2. **`client/src/routes/app/settings/components/template-repos-card.tsx:105` "Add Repository" button uses accent color outside the whitelist** — dilutes the 60/30/10 accent discipline the spec enforces elsewhere — change to `variant="outline"`, consistent with "Sync now"/"Retry" in the same component family.
3. **Spacing-scale drift: `gap-3` (12px) used across 6 new files** (`template-card.tsx`, `template-variant-dialog.tsx`, `compose-checks-card.tsx` ×3, `template-repo-alerts.tsx`) — the declared scale is 4/8/16/24/32px; 12px is only excepted for shadcn's own internal `p-3` card/alert padding, not author-chosen flex gaps — normalize each `gap-3` to `gap-2` (8px) or `gap-4` (16px) per surrounding context.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
All spec'd strings (CTAs, empty/error states, rule labels/tooltips) verified verbatim against `12-UI-SPEC.md`, including the `privileged` rule tooltip sentence and the template-browse empty-state copy.

### Pillar 2: Visuals (3/4)
`compose-checks-card.tsx` renders both a `ToneBadge` pill and a separate `FormLabel` with overlapping text content for each configurable check (e.g. "Named volume" badge next to "Flag named volumes" label) — not a violation of the Component Inventory's explicit instruction to use `ToneBadge` here, but visually redundant duplicate labeling; worth a design pass. No other hierarchy issues found across the phase's new components.

### Pillar 3: Color (3/4)
`template-repos-card.tsx:105`'s "Add Repository" button uses the default (primary/accent) `Button` variant. UI-SPEC states nothing else in this phase's new surfaces uses the accent color, and every other new button correctly reserves primary color for the 5 whitelisted actions. `ComposeWarningBadge`/`TemplateUpdatedBadge` correctly use red/yellow/blue `ToneBadge` tones exactly as spec'd.

### Pillar 4: Typography (3/4)
`diff-confirm-dialog.tsx:211` introduces `font-medium` (weight 500) on the "Compose check warnings" heading — UI-SPEC explicitly prohibits introducing `font-medium`/`font-bold` for any new component this phase (only 400/600 allowed). Fix: change to `font-semibold` for consistency with every other heading in the dialog. No other weight/size violations found.

### Pillar 5: Spacing (2/4)
`gap-3` (12px) appears 7+ times across new components (`template-card.tsx`, `template-variant-dialog.tsx`, `compose-checks-card.tsx` ×3, `template-repo-alerts.tsx`, `templates.tsx`) — 12px is not in the declared spacing scale (4/8/16/24/32/48/64px); the spec's only 12px exception is shadcn's own `p-3` card/alert default, not author-chosen `gap-3`.

### Pillar 6: Experience Design (3/4)
Good state coverage overall — loading/empty/error skeletons are present and correctly wired per repo in `TemplateReposCard`/`TemplateRepoAlerts` (correct `Alert`+`Retry` pattern, 409-duplicate-url field error handled distinctly from generic errors). However `templates.tsx`'s top-level catalog-load failure (distinct from a single repo's sync failure) renders a hand-rolled destructive div instead of the spec-mandated `Alert` component — an isolated but real inconsistency against the correct per-repo pattern one file over.

**Minor / additional findings (not separately scored):**
- `create.tsx`'s `(error || sourceError)` hand-rolled destructive div (line 49) pre-dates Phase 12 — flagged for awareness only, not counted against this phase's score.

**Clean / verified-good:**
- `DiffConfirmDialog`/`UnifiedDiffView`: correct copy ("Confirm & Apply"/"Keep Editing"), no-op-diff guard upstream in the hook layer, secret-masking toggle, dark-mode classes present on every diff-line color utility.
- `DeployWarningsAlert`/`stack-alerts.tsx`: reuses the exact yellow banner classes from the existing `configChanged` alert, one `Alert` per deploy listing all port conflicts, correct Docktor-stack-link vs. plain-text-process copy branches.
- `TemplateGrid`/`TemplateCard`/`TemplateVariantDialog`: native `<select>` for category filter (per `log-viewer.tsx` precedent), `line-clamp-2` + `title` truncation, correct zero-one-many handling (single-variant skips dialog), empty-state copy matches spec exactly.
- Registry audit: no third-party registries declared in `12-UI-SPEC.md` (shadcn official only) — not applicable, skipped correctly.
- Test coverage exists for all major new components (`diff-confirm-dialog`, `unified-diff-view`, `template-grid`, `compose-checks-card`, `template-repos-card`, `deploy-warnings-alert`).

---

## Files Audited

All client files created or modified across plans 12-01 through 12-11, per each plan's `files_modified` list and SUMMARY.md, including:
`unified-diff-view.tsx`, `diff-confirm-dialog.tsx`, `compose-warning-badge.tsx`, `compose-checks-card.tsx`, `create-stack-form.tsx`, `deploy-warnings-alert.tsx`, `stack-alerts.tsx`, `template-card.tsx`, `template-grid.tsx`, `template-variant-dialog.tsx`, `templates.tsx` (route), `template-repo-alerts.tsx`, `template-repos-card.tsx`, `template-updated-badge.tsx`, `stack-detail-header.tsx`, `create.tsx`, `settings.tsx`, plus their corresponding hooks (`use-stack-config-files.ts`, `use-create-stack.ts`, `use-templates.ts`, `use-create-stack-source.ts`, `use-template-repos.ts`) and API clients (`stacks-api.ts`, `templates-api.ts`, `settings-api.ts`, `compose-rules.ts`).
