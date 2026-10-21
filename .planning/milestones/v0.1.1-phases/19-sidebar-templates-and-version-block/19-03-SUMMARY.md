---
phase: 19-sidebar-templates-and-version-block
plan: 03
subsystem: ui
tags: [react, vite, vitest, playwright, sidebar, version]

requires:
  - phase: 19-01
    provides: Sectioned collapsible-icon AppSidebar with SidebarFooter and NavUser
provides:
  - Build-time __APP_VERSION__ define (vite.config.ts and vitest.config.ts) read from client/package.json
  - APP_VERSION and PROJECT_LINKS modules
  - SidebarVersionBlock (expanded row plus collapsed Info dropdown) above NavUser
affects: [21 release bump (version block follows package.json)]

plan_head_before: c9fde043df99a08101f710e4817542799b7e4a78
plan_head_after: a96fdf3d5473b3be40ddbf1d6590f1e4381601e7

actuals:
  tokens: 9000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Build-time constant via Vite define + typeof-guarded reader module + ambient src/globals.d.ts"
    - "Expanded row hidden by group-data-[collapsible=icon]:hidden paired with a collapsed menu shown only by group-data-[collapsible=icon]:flex (never displayed in the mobile sheet)"

key-files:
  created:
    - client/src/globals.d.ts
    - client/src/lib/app-version.ts
    - client/src/lib/project-links.ts
    - client/src/components/sidebar-version-block.tsx
    - client/test/unit/lib/app-version.test.ts
    - client/test/unit/lib/project-links.test.ts
    - client/test/unit/components/sidebar-version-block.test.tsx
  modified:
    - client/vite.config.ts
    - client/vitest.config.ts
    - client/src/components/app-sidebar.tsx
    - client/test/unit/components/app-sidebar.test.tsx
    - client/test/integration/sidebar.spec.ts
    - client/test/integration/mobile.spec.ts

key-decisions:
  - "Version comes from client/package.json via define (CONTEXT D-02): no request, no dev marker, Dockerfile and workflows untouched"
  - "Docs link targets https://getdocktor.dev (CONTEXT D-03); docs-links.ts untouched (D-04)"
  - "Collapsed rail is one Info SidebarMenuButton with tooltip and dropdown; trigger gets no max-md sizing because it can never be displayed in the mobile sheet"

requirements-completed: [UI-01]

coverage:
  - id: D1
    description: "Expanded sidebar shows v{package.json version} and GitHub/docs links (new tab, noopener noreferrer) above the account menu"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#AppSidebar version block (UI-01)"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/app-version.test.ts"
        status: pass
      - kind: e2e
        ref: "client/test/integration/sidebar.spec.ts#the expanded sidebar shows the client/package.json version and both project links above the account menu"
        status: unknown
    human_judgment: false
    rationale: "Playwright specs run in CI only (VPS policy)"
  - id: D2
    description: "Collapsed rail: single Info menu button, tooltip 'Docktor v{version}', menu lists both links by click and Enter"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "client/test/unit/components/sidebar-version-block.test.tsx#SidebarVersionBlock collapsed rail menu (UI-SPEC D-08)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/sidebar.spec.ts#collapsed to icons the version menu button opens the version and both links by click and by Enter"
        status: unknown
    human_judgment: false
  - id: D3
    description: "Mobile sheet: 44px link targets, no overflow at 412px and 360px, rail trigger never displayed, sheet stays open on external link"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "client/test/unit/components/app-sidebar.test.tsx#keeps the sheet open when an external project link is followed"
        status: pass
      - kind: e2e
        ref: "client/test/integration/mobile.spec.ts#sidebar sheet: the version and both project links fit with 44px targets and no overflow at 412px and 360px"
        status: unknown
    human_judgment: false
  - id: D4
    description: "Empty version renders 'Docktor' without a v prefix; long prerelease versions truncate with full label as title"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "client/test/unit/components/sidebar-version-block.test.tsx#SidebarVersionBlock expanded row (UI-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prerelease ellipsis at 16rem and light/dark theme readability of version text, hover, tooltip and dropdown"
    requirement: UI-01
    verification: []
    human_judgment: true
    rationale: "Backstop visual checks; all colours are theme variables"

duration: 20min
completed: 2026-10-18
status: complete
---

# Phase 19 Plan 03: Sidebar version block Summary

**The sidebar now shows `v{client/package.json version}` (injected through a Vite/Vitest `define`, no request) with GitHub and documentation icon links above the account menu, collapsing to one Info dropdown in the icon rail and using 44px targets in the mobile sheet.**

## Accomplishments

- `__APP_VERSION__` is defined in both `vite.config.ts` and `vitest.config.ts` (top level, outside `test`) via `JSON.stringify` of the package.json version; `globals.d.ts` declares it and `app-version.ts` is the only reader (typeof-guarded, empty string fallback).
- `project-links.ts` holds `GITHUB_URL`, `DOCS_HOME_URL` (`https://getdocktor.dev`, CONTEXT D-03) and `PROJECT_LINKS`.
- `SidebarVersionBlock` renders the "About Docktor" group (truncating version span with full-label title, 32px / `max-md:44px` ghost link buttons) plus a collapsed `SidebarMenu` (`hidden group-data-[collapsible=icon]:flex`) with an Info trigger, tooltip and dropdown listing GitHub and Documentation.
- Wired into `AppSidebar` directly above `NavUser`.
- Unit tests for the define parity, URLs, fallback, truncation, collapsed menu (click, Enter, Escape, tooltip) and mobile sheet external-link behaviour; Playwright coverage added to `sidebar.spec.ts` and `mobile.spec.ts`.

## Task Commits

1. **Task 1 (tracer): version and links above the account menu**
   - `ed8c2b8` test(19-03): failing tests for the sidebar version block wiring
   - `871c26f` feat(19-03): show the build version and project links above the account menu
2. **Task 2: edge cases**
   - `f99787b` test(19-03): failing tests for version fallback, truncation and the 44px mobile sheet
   - `7e7a741` feat(19-03): fall back to the bare product name and expose the full version label as title
3. **Task 3: collapsed rail menu**
   - `05a36cd` test(19-03): failing tests for the collapsed version menu
   - `a96fdf3` feat(19-03): add the collapsed rail version menu with GitHub and docs links

Tracer gate: the verify command (app-sidebar, nav-user, docs-links, sidebar-nav tests; 40 passed) was re-run after Task 1 before expanding.

## Deviations from Plan

None - plan executed exactly as written. Assumption A1 (tooltip wrapper swallowing the dropdown trigger props) did not materialise: tooltip, click and Enter all work with `tooltip` on the trigger, so the title-based fallback was not needed.

Process notes (not deviations):
- Tests read package.json with `resolve(__dirname, ...)` rather than `new URL(..., import.meta.url)`: under Vitest's jsdom environment `import.meta.url` is not a `file:` URL. Playwright specs use the same `__dirname` form.
- Task 2's implementation was written before its RED commit; I restored the old component to confirm 2 failing tests, committed the tests, then re-applied the implementation.
- Per project policy no full `tsc --build` and no Playwright were run locally; CI covers `yarn typecheck` and both Playwright projects.
- `.planning/config.json` / `.planning/state.json` churn left unstaged.

## Deferred Issues

A wider local vitest run (`test/unit/components`) under VPS load showed timeouts in unrelated migrate-dialog tests (5s test timeouts). Files untouched by this plan; not investigated further. The targeted runs of every file this plan touches pass (33 tests).

## Verification

- `vitest run --coverage.enabled=false` on app-version, project-links, docs-links, sidebar-version-block, app-sidebar and nav-user tests: 6 files, 33 tests passed.
- Acceptance greps checked: define in both configs and outside `test`, `declare const` with no import/export, literal URLs, >= 4 `rel`/`target` attributes, no `name` in labels, no literal palette colours, `components/ui`, `docs-links.ts`, Dockerfile and `.github` unchanged since 80532b0.

## Known Stubs

None.

## Threat Flags

None. T-19-04 mitigated (`target="_blank"` with `rel="noopener noreferrer"` on all four anchors, asserted in unit and e2e tests); T-19-05 mitigated (hrefs only from `project-links.ts`, pinned by test); T-19-07 mitigated (no request in the version path); T-19-08 mitigated (`JSON.stringify` in the define).

## Self-Check: PASSED

- Files present: globals.d.ts, app-version.ts, project-links.ts, sidebar-version-block.tsx, three new unit test files, plus modified configs, app-sidebar.tsx and specs.
- Commits ed8c2b8, 871c26f, 7e7a741, a96fdf3 are ancestors of HEAD; `git rev-list --count c9fde04..HEAD` = 6 before the docs commit.
