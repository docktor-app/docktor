---
phase: 19-sidebar-templates-and-version-block
plan: 01
subsystem: ui
tags: [react, react-router, shadcn-sidebar, vitest, playwright, a11y]

requires:
  - phase: 18
    provides: NavUser / Account entry and the BrandLogo mark variant used by the sidebar
provides:
  - Pure nav model (NAV_SECTIONS, NavItem, NavSection) in client/src/lib/sidebar-nav.ts
  - Segment-aware isNavItemActive(pathname, to) active matcher
  - AppSidebar with labelled Platform / System sections, aria-current, icon rail with tooltips, logo-to-mark swap, mobile sheet closing on internal nav
affects: [19-02 templates page (the /templates nav target already exists), 19-03 version block (sidebar footer)]

plan_head_before: 58ada71af5cd7a8b07422e8d2d4bf66e0332e412
plan_head_after: 28d3c3a2e5c1a0f7ac4c8ce51dcfc4ca43b11c5c

actuals:
  tokens: 4400
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Pure nav model module consumed by the component (model order and active rules tested without React)"
    - "Segment-aware route matching instead of String.startsWith prefix checks"

key-files:
  created:
    - client/src/lib/sidebar-nav.ts
    - client/test/unit/lib/sidebar-nav.test.ts
    - client/test/unit/components/app-sidebar.test.tsx
    - client/test/integration/sidebar.spec.ts
  modified:
    - client/src/components/app-sidebar.tsx
    - client/test/integration/mobile.spec.ts

key-decisions:
  - "Section labels, order and items live only in sidebar-nav.ts; AppSidebar renders NAV_SECTIONS.map"
  - "Active state is segment-aware (equals or starts with `to` + '/'), so /stacks-foo never lights Stacks and /templates never lights Stacks"
  - "Mobile sheet closes via useSidebar().setOpenMobile(false) on every nav Link click (harmless on desktop)"
  - "Sidebar state cookie is neither read nor written by AppSidebar (always-expanded first load accepted, RESEARCH Pitfall 8)"

patterns-established:
  - "Tooltip text on collapsed rail comes from SidebarMenuButton tooltip={item.label}; the primitive hides it unless collapsed"

requirements-completed: [UI-06]

coverage:
  - id: D1
    description: "Sidebar shows labelled Platform (Dashboard, Stacks, Templates) and System (Storage, Settings) sections from NAV_SECTIONS"
    requirement: UI-06
    verification:
      - kind: unit
        ref: "client/test/unit/lib/sidebar-nav.test.ts#NAV_SECTIONS (UI-06, D-01)"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#renders labelled Platform and System sections with the nav entries in order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Parent entry keeps its highlight on nested routes, exactly one link carries aria-current=page"
    requirement: UI-06
    verification:
      - kind: unit
        ref: "client/test/unit/lib/sidebar-nav.test.ts#isNavItemActive (D-03)"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#keeps only Stacks highlighted on a nested stack route"
        status: pass
    human_judgment: false
  - id: D3
    description: "Collapsed icon rail: data-collapsible=icon, hover tooltips, mark instead of full logo"
    requirement: UI-06
    verification:
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#AppSidebar icon rail (UI-SPEC D-02)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/sidebar.spec.ts#collapsed to icons the nav stays usable with tooltips"
        status: unknown
    human_judgment: false
    rationale: "Playwright specs are verified by CI only (VPS policy); real visibility and rail width are not asserted by jsdom"
  - id: D4
    description: "Mobile sheet closes after following an internal nav link"
    requirement: UI-06
    verification:
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#closes the sheet after following an internal nav link"
        status: pass
      - kind: e2e
        ref: "client/test/integration/mobile.spec.ts#sidebar: the trigger opens the labelled mobile navigation and following Stacks closes it"
        status: unknown
    human_judgment: false
    rationale: "Playwright specs run in CI only"

duration: 4min
completed: 2026-10-18
status: complete
---

# Phase 19 Plan 01: Sidebar sections, icon rail and mobile close Summary

**Sidebar rebuilt from a pure `NAV_SECTIONS` model with segment-aware active matching, a tooltip-backed icon rail with logo-to-mark swap, and a mobile sheet that closes on internal navigation.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-18T14:52:40Z
- **Completed:** 2026-10-18T14:57:00Z
- **Tasks:** 2 (1 tracer, 1 auto, both TDD)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `client/src/lib/sidebar-nav.ts` is now the single source of section labels, order, items and icons (Platform: Dashboard, Stacks, Templates; System: Storage, Settings) plus `isNavItemActive`, which strips trailing slashes and matches on whole path segments. The old `startsWith` check, which would have highlighted Stacks for `/stacks-foo`, is gone.
- `AppSidebar` renders one `SidebarGroup` per section; the active link carries `aria-current="page"` so the active state is not colour-only.
- `Sidebar collapsible="icon"`: nav buttons show their label as a tooltip in the rail, the header shows the Docktor mark (`size-8`) instead of the full logo, and group labels fade via the primitive.
- Every nav `Link` calls `setOpenMobile(false)`, so the mobile sheet closes once the new page is shown.
- Tests: 20 table/model tests in `sidebar-nav.test.ts`, 9 component tests in `app-sidebar.test.tsx` (sections, aria-current, rail, tooltip, header swap, mobile close), a new desktop `sidebar.spec.ts` (labelled sections, nested highlight, rail width, hover and focus tooltips) and an extended mobile sidebar test.

## Task Commits

1. **Task 1 (tracer): sections from nav model, parent stays highlighted**
   - `b91b651` test(19-01): failing tests for sections and nested active state
   - `6c1310e` feat(19-01): render sidebar sections from a pure nav model
2. **Task 2: icon rail and mobile sheet**
   - `152d9da` test(19-01): failing tests for icon rail and mobile sheet close
   - `abb2f2a` feat(19-01): collapse sidebar to an icon rail and close mobile sheet on nav
   - `28d3c3a` test(19-01): Playwright coverage for sidebar sections, rail and mobile close

## Decisions Made

See `key-decisions` in the frontmatter. No new dependencies; `components/ui/` untouched (`git diff 80532b0 -- client/src/components/ui` is empty).

## Deviations from Plan

None - plan executed exactly as written.

Process notes (not plan deviations):
- The `agent-*` branch-namespace assertion from the executor commit protocol was not applied: this run is the sequential executor on the orchestrator-designated bridge worktree branch `worktree-bridge-cse_01GoBQizyDtQbVBYvsPj9rQt`, and the orchestrator instructed normal commits. The protected-branch check (not main) held for every commit.
- Per project policy (VPS contention) the full `tsc --build` and the Playwright specs were not run locally; `yarn typecheck`, the unit suite and the `chromium` / `mobile-chromium` projects are left to CI.

## Verification

- `vitest run --coverage.enabled=false` on `sidebar-nav.test.ts`, `app-sidebar.test.tsx`, `nav-user.test.tsx`, `app-layout.test.tsx`: 4 files, 34 tests, all passed.
- Every grep acceptance criterion of both tasks was run and passed (NAV_SECTIONS/isNavItemActive exports, no `react` import in the model, no `startsWith` in the component, `collapsible="icon"`, `setOpenMobile(false)`, `tooltip={item.label}`, mark swap, no `sidebar_state`, no "name" in aria-label/tooltip strings, no literal palette colours, `components/ui` diff empty, spec greps).

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-19-01 mitigated: all nav hrefs are module constants in `sidebar-nav.ts`; the pathname is only compared, never rendered or used as a link target; the component test pins the five hrefs.

## Next Phase Readiness

Ready for 19-02 (the `/templates` route and page; the Templates sidebar entry and its highlight rule already exist) and 19-03 (version block).

## Self-Check: PASSED

- Files present: sidebar-nav.ts, app-sidebar.tsx, both unit tests, sidebar.spec.ts, mobile.spec.ts.
- Commits b91b651, 6c1310e, 152d9da, abb2f2a, 28d3c3a are ancestors of HEAD; `git rev-list --count 58ada71..HEAD` = 5.
