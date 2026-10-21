---
phase: 19-sidebar-templates-and-version-block
plan: 02
subsystem: ui
tags: [react, react-router, vitest, playwright, templates]

requires:
  - phase: 19-01
    provides: Sidebar Templates entry targeting /templates with aria-current highlight
provides:
  - /templates route mounting TemplateBrowsePage inside ProtectedRoute > AppLayout
  - TemplatesPageHeader (catalog vs create-flow title, breadcrumb, description by path)
  - TemplatesCatalog (loading, repo alerts, "No templates available" empty state, grid)
  - Composition-only templates.tsx page (79 lines) serving both routes
affects: [19-03 version block]

plan_head_before: 7ab7e91f092bb9f5a676031bdf68e21ef42ea150
plan_head_after: 8d3486d884648e7ec841a5a15e3cae63af6ee797

actuals:
  tokens: 6500
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "One page component serving two routes, variant chosen from useLocation().pathname"

key-files:
  created:
    - client/src/routes/app/stacks/components/templates-page-header.tsx
    - client/src/routes/app/stacks/components/templates-catalog.tsx
    - client/test/unit/router.test.tsx
  modified:
    - client/src/router.tsx
    - client/src/routes/app/stacks/templates.tsx
    - client/test/unit/routes/stacks/templates-page.test.tsx
    - client/test/integration/templates.spec.ts

key-decisions:
  - "/templates and /stacks/create/templates both mount TemplateBrowsePage (no redirect); header variant derives from pathname.startsWith('/stacks/create')"
  - "Zero-templates EmptyState is suppressed when any repo has a lastSyncError, since that repo's alert already explains the empty catalog"
  - "Create Stack's Start from Template link and handleUse stay unchanged"

requirements-completed: [UI-07]

coverage:
  - id: D1
    description: "Sidebar Templates entry opens /templates with title, single breadcrumb and description; Use Template starts the create flow"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/templates-page.test.tsx#journey: the sidebar Templates entry opens the catalog and Use Template starts the create flow"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/templates-page.test.tsx#per-path header (UI-07, UI-SPEC D-04)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#the sidebar Templates entry opens the catalog and Use Template prefills the create form"
        status: unknown
    human_judgment: false
    rationale: "Playwright specs run in CI only (VPS policy)"
  - id: D2
    description: "/templates is registered inside ProtectedRoute > AppLayout; /stacks/create/templates still served"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "client/test/unit/router.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty catalog shows No templates available with Settings and blank-compose links; failed repo shows its alert instead"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/templates-page.test.tsx#catalog states (UI-SPEC empty / loading / error)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#an empty catalog at /templates shows No templates available with Settings and blank-compose links"
        status: unknown
    human_judgment: false
  - id: D4
    description: "Catalog scrolls without horizontal overflow at 360/768/1280px in light and dark"
    requirement: UI-07
    verification:
      - kind: e2e
        ref: "client/test/integration/templates.spec.ts#the catalog fits a 360px viewport without horizontal overflow"
        status: unknown
    human_judgment: true
    rationale: "360px no-overflow is automated (CI); 768/1280 and light/dark are a visual check"

duration: 8min
completed: 2026-10-18
status: complete
---

# Phase 19 Plan 02: Templates standalone page Summary

**`/templates` now serves the template catalog as a first-class sidebar destination, sharing one orchestrator page with `/stacks/create/templates`, with a new zero-templates empty state.**

## Accomplishments

- `router.tsx` registers `/templates` beside `/stacks/create/templates` inside the ProtectedRoute > AppLayout group (no redirect); `router.test.tsx` asserts both matches and the layout wrapping.
- `TemplatesPageHeader` renders the catalog header (Templates, single breadcrumb, description) or the create-flow header (Start from a Template, Stacks / Create / Templates) from a `variant` prop.
- `TemplatesCatalog` owns loading skeletons, repo alerts, the "No templates available" EmptyState (links to `/settings/stacks` and `/stacks/create`) and the grid.
- `templates.tsx` shrank from 97 to 79 lines, with no inline helper components; `handleUse` is unchanged on both routes.
- Playwright coverage added for the sidebar journey, empty catalog and 360px layout.

## Task Commits

1. **Task 1 (tracer): /templates route and per-path header**
   - `2e0ae13` test(19-02): failing tests for the /templates route and per-path header
   - `d62035e` feat(19-02): add /templates catalog route with a per-path page header
2. **Task 2: empty state, slim page, Playwright**
   - `95bd5f4` test(19-02): failing tests for the empty catalog state
   - `b618f77` feat(19-02): empty state for an empty catalog and slim page
   - `8cdaf78` test(19-02): Playwright coverage for sidebar journey, empty catalog, 360px
   - `8d3486d` refactor(19-02): tighten empty-state comment (keeps the plan's single-occurrence grep criterion)

Tracer gate: the verify command was re-run after Task 1 (18 tests green) before expanding.

## Deviations from Plan

None - plan executed exactly as written.

Process notes (not deviations):
- Per project policy, no full `tsc --build` and no Playwright were run locally; `yarn typecheck` and the `chromium` project run in CI.
- The agent-* branch-namespace assertion was not applied: the run is on the orchestrator-designated bridge worktree branch; the protected-branch check held for every commit.
- `.planning/config.json` and `.planning/state.json` churn left unstaged except where tooling requires.

## Verification

- `vitest run --coverage.enabled=false` on `router.test.tsx`, `templates-page.test.tsx`, `create-stack-page.test.tsx`, `template-grid.test.tsx`: all passed (21 tests across router/page/grid in the final run; create-stack-page 7 passed after Task 1).
- Plan grep acceptance criteria checked: page 79 lines, no inline components, `<TemplatesCatalog` x1, copy/links in catalog, no literal palette colours, spec greps, `create.tsx` link unchanged.

## Known Stubs

None.

## Threat Flags

None. T-19-02 mitigated (router test asserts ProtectedRoute > AppLayout wraps `/templates`); T-19-03 mitigated (literal hrefs, `encodeURIComponent` in `handleUse` untouched).

## Self-Check: PASSED

- Files present: templates-page-header.tsx, templates-catalog.tsx, router.test.tsx, plus modified router.tsx, templates.tsx, templates-page.test.tsx, templates.spec.ts.
- Commits 2e0ae13, d62035e, 95bd5f4, b618f77, 8cdaf78, 8d3486d are ancestors of HEAD; `git rev-list --count 7ab7e91..HEAD` = 6 before the docs commit.
