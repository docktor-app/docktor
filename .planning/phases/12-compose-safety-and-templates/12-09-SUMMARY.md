---
phase: 12-compose-safety-and-templates
plan: 09
subsystem: ui
tags: [react, react-router, templates, create-stack, d-06, d-07]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-06's useCreateStack({create, onCreated}) hook and CreateStackForm section (create-source-agnostic by design); 12-07's GET /api/templates, GET /api/templates/variants/:variantId, POST /api/templates/variants/:variantId/stacks, POST /api/template-repos/:repoId/sync"
provides:
  - "client/src/lib/templates-api.ts — listTemplates/getTemplateVariant/createStackFromTemplate/syncTemplateRepo + TemplateCatalog/TemplateSummary/TemplateVariantSummary/TemplateVariantDetail/TemplateRepoStatus types"
  - "client/src/hooks/use-templates.ts — useTemplates() -> {catalog, loading, error, refetch, retryRepo}"
  - "client/src/hooks/use-create-stack-source.ts — useCreateStackSource() -> {variantId, variant, loading, error, defaultValues, create}, injected into useCreateStack so 12-10/12-11 never need to fork the create flow"
  - "client/src/components/domain/template/{template-card,template-grid,template-variant-dialog}.tsx"
  - "client/src/routes/app/stacks/components/template-repo-alerts.tsx — TemplateRepoAlerts"
  - "client/src/routes/app/stacks/templates.tsx — TemplateBrowsePage at /stacks/create/templates"
  - "'Start from Template' entry point + variant-aware prefill wired into client/src/routes/app/stacks/create.tsx"
affects: [12-10, 12-11]

actuals:
  tokens: 17852
  tasks: 2
  commits: 2
  plan_head_before: faf388c054bc0a6a68b20a3e57e29edeebbd6d80
  plan_head_after: 9a07598ea98ac48315b4b77f257d80e89c947491

tech-stack:
  added: []
  patterns:
    - "useCreateStackSource() mirrors useCreateStack's injected-create-function design (12-06): it returns a create-source-agnostic `create` that the Create Stack page passes straight into useCreateStack, so the page never has an if/else between a template path and a blank path — one hook composition handles both"
    - "useTemplates() reuses use-stack.ts's initial/background fetch-mode split: the first load drives `loading`, every subsequent refresh (refetch, retryRepo) only ever touches `catalog`/`error` in the background, never flipping the page back into its loading skeleton"
    - "TemplateVariantDialog uses the dismissible shadcn Dialog (not AlertDialog) per UI-SPEC — it's a forward-navigation choice, not a destructive gate, so Escape/outside-click closing without choosing is correct behavior, not a bug"
    - "TemplateGrid's search/category filtering is pure local derived state (useMemo over the already-fetched catalog) — no re-fetch on every keystroke, and the native <select> (not Radix Select) follows the log-viewer.tsx precedent for jsdom-testable role queries"

key-files:
  created:
    - client/src/lib/templates-api.ts
    - client/src/hooks/use-templates.ts
    - client/src/hooks/use-create-stack-source.ts
    - client/src/components/domain/template/template-card.tsx
    - client/src/components/domain/template/template-grid.tsx
    - client/src/components/domain/template/template-variant-dialog.tsx
    - client/src/routes/app/stacks/templates.tsx
    - client/src/routes/app/stacks/components/template-repo-alerts.tsx
    - client/test/unit/lib/templates-api.test.ts
    - client/test/unit/hooks/use-templates.test.ts
    - client/test/unit/hooks/use-create-stack-source.test.ts
    - client/test/unit/components/domain/template/template-grid.test.tsx
    - client/test/unit/components/domain/template/template-variant-dialog.test.tsx
    - client/test/unit/routes/stacks/templates-page.test.tsx
    - client/test/integration/templates.spec.ts
  modified:
    - client/src/router.tsx
    - client/src/routes/app/stacks/create.tsx
    - client/test/unit/routes/stacks/create-stack-page.test.tsx

key-decisions:
  - "The browse route is /stacks/create/templates, not /stacks/templates — registered as a static route ahead of the dynamic /stacks/:id/:tab? pattern so it can never collide with a stack whose slug happens to be 'templates' (stack ids cannot contain '/', so the two path shapes are structurally distinct regardless of React Router's static-over-dynamic ranking)."
  - "useCreateStackSource's defaultValues always prefill description as empty string even when a variant is loaded — the UI-SPEC only pins displayName/composeContent/envContent from the template; description stays a free-text field the user fills in themselves."
  - "TemplateRepoAlerts and the fetch-error banner on the browse page are independent surfaces: a repo-sync failure (one bad repo) never blocks the rest of the catalog from rendering, while a full catalog-fetch failure (GET /api/templates itself failing) shows its own banner with its own Retry calling refetch() rather than retryRepo()."

requirements-completed: ["#19"]

coverage:
  - id: D1
    description: "Issue #19/D-07: Create Stack page offers 'Start from Template' which opens a card grid at /stacks/create/templates with icon/name/category/description/'Use Template', a search box, and a category filter; the blank compose flow stays the default"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/create-stack-page.test.tsx#without a variant, shows a Start from Template link to the template browser"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/template/template-grid.test.tsx (renders cards, search filters, category select narrows, no-match empty state)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#creates a stack end to end from a single-variant template; #searching with no match shows the No templates found empty state"
        status: unknown
    human_judgment: true
    rationale: "Playwright suite was not run in this session per explicit user instruction (host resource contention) — written and committed, ready for CI/human re-run (WINDOWS.md #19). Unit-level coverage of the identical component/page logic ran clean (31/31 tests)."
  - id: D2
    description: "D-06 zero-one-many: a single-variant template's 'Use Template' goes straight to the prefilled create form; a multi-variant template opens a dialog listing every variant with 'Use this variant'"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/templates-page.test.tsx#a single-variant template's Use Template navigates straight to that variant; #a multi-variant template's Use Template opens the dialog, and choosing navigates to the chosen variant"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/template/template-variant-dialog.test.tsx (first variant preselected, Use this variant calls onChoose, Escape closes without choosing)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#a multi-variant template opens the picker dialog, and the chosen variant prefills the create form"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D1 — written, not run locally. Unit coverage of the identical dialog/navigation logic ran clean."
  - id: D3
    description: "Choosing a variant opens the Create Stack form prefilled with the template name, the variant's compose/.env content (editable), states which template/variant it starts from, and shows the variant's usage notes as plain text"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-create-stack-source.test.ts (prefills defaultValues from the loaded variant); client/test/unit/routes/stacks/create-stack-page.test.tsx#with ?variant=v1, shows the Starting from note and the variant's usage text"
        status: pass
    human_judgment: false
  - id: D4
    description: "Creating from a template submits to POST /api/templates/variants/:variantId/stacks and goes through the same compose-check review dialog as a blank stack (useCreateStack), then lands on the new stack's page"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/create-stack-page.test.tsx#with ?variant=v1, renders the form prefilled only after the variant loads and submits via createStackFromTemplate"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#creates a stack end to end from a single-variant template (full browse -> use -> create -> land flow, asserts the POST body and final /stacks/whoami URL)"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D1 — the e2e assertion of the full flow (including the shared DiffConfirmDialog review step and navigation) needs a CI/human run; the equivalent hook/page-level contract is proven by unit tests."
  - id: D5
    description: "UI-SPEC states: first load shows a Skeleton grid with the loading copy; no-match shows 'No templates found' + body linking to /stacks/create; a repo that failed to sync shows the sync-error copy with a Retry that re-syncs that repo"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/templates-page.test.tsx#shows the first-run loading copy and skeletons while loading; #shows a repo sync-error alert with a working Retry"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#a repo sync failure shows the error alert; Retry posts to the repo sync endpoint"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D1."
  - id: "Prohibition: MUST NOT load any template-supplied remote resource while browsing templates"
    verification:
      - kind: other
        ref: "grep -rc 'dangerouslySetInnerHTML' client/src/components/domain/template client/src/routes/app/stacks/templates.tsx client/src/routes/app/stacks/create.tsx -> 0 matches; template-card.tsx's <img> src is only ever template.iconDataUri (a server-produced data URI, 12-04) or omitted entirely in favor of the lucide Package fallback"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-10-03
status: complete
---

# Phase 12 Plan 9: Template browse, variant selection, and create-from-template UI Summary

**Users can now start a new stack from a git-based template end to end on the client: Create Stack's "Start from Template" opens a searchable/filterable card grid at `/stacks/create/templates`, a single-variant template goes straight to a prefilled Create form while a multi-variant one opens a picker dialog, and submitting goes through the exact same compose-check review dialog as a blank stack before landing on the new stack's page.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2/2
- **Files touched:** 19 (across 2 commits)
- **Commits:** 2 (`2eca1a4`, `9a07598`)

## Accomplishments

- `templates-api.ts` (new): `listTemplates`, `getTemplateVariant`, `createStackFromTemplate`, `syncTemplateRepo` — four `apiFetch`-backed calls mirroring 12-07's `TemplateCatalog`/`TemplateVariantView` response shapes exactly (repo/template/variant view types copied field-for-field from `template-service.ts`, not re-derived from the plan's earlier interface sketch).
- `useTemplates()` (new): initial/background fetch-mode split (use-stack.ts precedent) — `loading` only ever flips during the first load; `refetch()` and `retryRepo()` (sync one repo, then background-refetch the whole catalog) never re-trigger the loading skeleton.
- `useCreateStackSource()` (new): reads `?variant=<id>`, loads that variant, and returns a `create` function that's `createStackFromTemplate` when a variant is present or plain `createStack` otherwise — injected straight into 12-06's `useCreateStack({create, onCreated})`, so the Create Stack page never branches on "is this a template create."
- `TemplateCard`/`TemplateGrid`/`TemplateVariantDialog` (`components/domain/template/`): card grid with icon (data-URI only, generic `Package` fallback), category badge, line-clamp-2 description with a full-text `title`; grid adds a search `Input` + native category `<select>` (jsdom-testable, log-viewer precedent) with local derived filtering and a "No templates found" empty state linking back to the blank-slate form; the variant dialog is a dismissible `Dialog` (not `AlertDialog` — a forward choice, not a destructive gate) listing every variant as a radio option, first preselected.
- `TemplateRepoAlerts` (new, `routes/app/stacks/components/`): one destructive `Alert` + `Retry` per repo with a `lastSyncError`, independent of the rest of the catalog rendering.
- `TemplateBrowsePage` (`routes/app/stacks/templates.tsx`, 87 lines) at the new `/stacks/create/templates` route: first-run `Skeleton` grid + loading copy, fetch-error banner + Retry, repo alerts, the grid, and the variant dialog for multi-variant templates.
- `create.tsx` (87 lines): "Start from Template" outline button in the page header (hidden once a variant is active), a `Skeleton` block while a variant loads, the "Starting from {template} — {variant}" note and the variant's `usage` text rendered `whitespace-pre-wrap` (plain text, no markdown/HTML), and `CreateStackForm` keyed by `variantId ?? "blank"` so switching sources cleanly remounts the form.
- 50 new/extended unit tests across 7 files (19 in Task 1, 31 total with Task 2) — all passing; `tsc -b` clean throughout. New Playwright `templates.spec.ts` covers the tracer flow plus the multi-variant dialog, no-match search, and repo-sync-error/Retry flows — written per plan, not executed locally per the orchestrator's resource_constraint (see Issues Encountered).

## Task Commits

1. **Task 1: End-to-end create from a single-variant template — tracer** — `2eca1a4` (feat)
2. **Task 2: Variant dialog, search + category filter, loading/empty/sync-error states, usage notes** — `9a07598` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `client/src/lib/templates-api.ts` (new) — API client + types
- `client/src/hooks/use-templates.ts` (new) — `useTemplates`
- `client/src/hooks/use-create-stack-source.ts` (new) — `useCreateStackSource`
- `client/src/components/domain/template/template-card.tsx` (new) — `TemplateCard`
- `client/src/components/domain/template/template-grid.tsx` (new) — `TemplateGrid` (search/filter/empty state)
- `client/src/components/domain/template/template-variant-dialog.tsx` (new) — `TemplateVariantDialog`
- `client/src/routes/app/stacks/components/template-repo-alerts.tsx` (new) — `TemplateRepoAlerts`
- `client/src/routes/app/stacks/templates.tsx` (new) — `TemplateBrowsePage`
- `client/src/router.tsx` — registered `/stacks/create/templates`
- `client/src/routes/app/stacks/create.tsx` — template entry point, variant prefill, usage notes
- `client/test/unit/lib/templates-api.test.ts` (new)
- `client/test/unit/hooks/use-templates.test.ts` (new)
- `client/test/unit/hooks/use-create-stack-source.test.ts` (new)
- `client/test/unit/components/domain/template/template-grid.test.tsx` (new)
- `client/test/unit/components/domain/template/template-variant-dialog.test.tsx` (new)
- `client/test/unit/routes/stacks/templates-page.test.tsx` (new)
- `client/test/unit/routes/stacks/create-stack-page.test.tsx` — template-prefill/usage-note tests added
- `client/test/integration/templates.spec.ts` (new) — tracer + variant dialog + empty state + repo-sync-error flows

## Decisions Made

See `key-decisions` in frontmatter: the `/stacks/create/templates` route placement; `description` staying free-text even from a template; the independence of repo-sync-error alerts from the whole-catalog fetch-error banner.

## Deviations from Plan

None — plan executed exactly as written. One in-flight correction during Task 2: the initial `template-grid.tsx` code comments happened to contain the literal strings `<select` and `No templates found`, which would have doubled the acceptance-criteria grep counts from 1 to 2; reworded the comments (no behavior change) so each grep matches exactly the live markup, not a comment echoing it.

## Issues Encountered

- **`create.tsx`/`templates.tsx` line budgets:** both pages initially landed over the plan's ≤90-line acceptance criteria (96 and 109 lines respectively) once the template-aware logic was added. Compacted JSX (single-line breadcrumb items, hoisting the breadcrumb to a module-level constant in `templates.tsx`, collapsing multi-line conditionals) brought both to 87 lines with no loss of readability or behavior.
- **Playwright suite not run locally:** per the orchestrator's explicit resource-contention instruction for this session, `templates.spec.ts` (new) was written and committed but not executed — recorded as WINDOWS.md entry #19, ready for a CI/human run (`PLAYWRIGHT_PORT=5215 yarn workspace @docktor/client test:integration templates.spec.ts`). All of this plan's unit `<verify>` commands and `tsc -b` ran clean in this session.
- **`yarn` not on PATH:** same sandbox limitation documented in 12-07/12-08 — worked around with `corepack yarn@4.13.0 <command>` throughout; no project files changed by this workaround.

## User Setup Required

A developer/CI with Playwright available must run `PLAYWRIGHT_PORT=5215 yarn workspace @docktor/client test:integration templates.spec.ts` to confirm the four new e2e scenarios pass live (WINDOWS.md entry #19).

## Next Phase Readiness

- `useCreateStackSource`'s `{variantId, variant, loading, error, defaultValues, create}` contract and `TemplateCard`/`TemplateGrid`/`TemplateVariantDialog` are stable for plan 12-10 (adding a template repo) to extend the browse page with an "Add Repo" action, and for plan 12-11 (template update badges) to add a blue `ToneBadge` onto `TemplateCard` without touching its existing props.
- `templates-api.ts`'s `TemplateRepoStatus` type already carries every field 12-10/12-11 need (`headCommitSha`, `lastSyncedAt`, `issues`) — no further client type changes expected for those plans' read paths.
- No blockers for proceeding with the next wave's plans.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED
