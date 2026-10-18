---
phase: 19-sidebar-templates-and-version-block
verified: 2026-10-18T17:20:00Z
status: human_needed
score: 15/18 must-haves verified
covered_files:
  - ".planning/phases/19-sidebar-templates-and-version-block/19-01-PLAN.md"
  - ".planning/phases/19-sidebar-templates-and-version-block/19-01-SUMMARY.md"
  - ".planning/phases/19-sidebar-templates-and-version-block/19-02-PLAN.md"
  - ".planning/phases/19-sidebar-templates-and-version-block/19-02-SUMMARY.md"
  - ".planning/phases/19-sidebar-templates-and-version-block/19-03-PLAN.md"
  - ".planning/phases/19-sidebar-templates-and-version-block/19-03-SUMMARY.md"
  - "client/src/components/app-sidebar.tsx"
  - "client/src/components/sidebar-version-block.tsx"
  - "client/src/globals.d.ts"
  - "client/src/lib/app-version.ts"
  - "client/src/lib/project-links.ts"
  - "client/src/lib/sidebar-nav.ts"
  - "client/src/router.tsx"
  - "client/src/routes/app/stacks/components/templates-catalog.tsx"
  - "client/src/routes/app/stacks/components/templates-page-header.tsx"
  - "client/src/routes/app/stacks/templates.tsx"
  - "client/vite.config.ts"
  - "client/vitest.config.ts"
covered_digest: "v3:sha256:e2f6721a914aef7015eba39de2416db1032ba98c8c4009c8123732dd2ec04287"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open /templates at 768px and 1280px in light and dark themes with a catalog of many templates (360px no-overflow is already automated in templates.spec.ts)"
    expected: "The catalog scrolls vertically inside SidebarInset with no horizontal overflow, cards and empty state readable in both themes"
    why_human: "Plan 19-02 declares this a backstop (visual) truth; jsdom applies no Tailwind CSS and only the 360px case has an automated Playwright assertion"
  - test: "In a build with a prerelease version (for example 0.1.1-rc.1), view the expanded 16rem sidebar"
    expected: "The version text ends in an ellipsis and the GitHub and documentation icon buttons stay inside the row"
    why_human: "Plan 19-03 backstop truth; truncation is CSS (min-w-0 truncate / shrink-0 are present in code) and needs a real layout engine"
  - test: "Check version text, link-button hover and focus, the collapsed-rail tooltip and the dropdown in light and dark themes"
    expected: "All read correctly (contrast, hover/focus states) using the sidebar theme variables"
    why_human: "Plan 19-03 backstop truth; theme rendering is a screenshot check"
---

# Phase 19: Sidebar, Templates and Version Block Verification Report

**Phase Goal:** Navigation is organised into labelled sections, Templates is a first-class destination, and the running version and project links sit above the account menu, all designed together as one sidebar
**Verified:** 2026-10-18
**Status:** human_needed
**Re-verification:** No, initial verification

All four ROADMAP success criteria and every automatable plan truth are verified against the code. The three remaining items are visual backstop truths that the plans themselves classify as visual checks. No gaps, no blockers.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1: Sidebar entries appear under labelled section headings; on nested routes the parent keeps its highlight | VERIFIED | `app-sidebar.tsx` maps `NAV_SECTIONS` to one `SidebarGroup` + `SidebarGroupLabel` per section. `isNavItemActive` in `lib/sidebar-nav.ts` is segment-aware (equals `to` or starts with `to/`, trailing slashes stripped, `/` exact only). Table-tested in `sidebar-nav.test.ts` (passes) |
| 2  | SC2: A Templates entry opens a standalone catalog page; "Use template" starts the existing create flow | VERIFIED | `{to: "/templates"}` in `NAV_SECTIONS`; `router.tsx:60` registers `/templates` -> `TemplateBrowsePage` in the protected group; `handleUse` navigates to `/stacks/create?variant=<id>` (single variant) or opens `TemplateVariantDialog` (multi). `templates-page.test.tsx` journey test passes (sidebar link -> catalog -> create) |
| 3  | SC3: Above the account menu the sidebar shows the build-time version with working GitHub and docs links | VERIFIED | `define: {__APP_VERSION__: JSON.stringify(version)}` in both `vite.config.ts` and `vitest.config.ts`, read from `client/package.json`; `app-version.ts` is the only reader; `SidebarVersionBlock` rendered in `SidebarFooter` immediately before `<NavUser/>`. `app-version.test.ts` asserts `APP_VERSION === package.json version` (passes). Links: `https://github.com/docktor-app/docktor` and `https://getdocktor.dev` (CONTEXT D-03), `target="_blank"`, `rel="noopener noreferrer"`. Both URLs return HTTP 200 |
| 4  | SC4: Version block and links stay usable collapsed and in the mobile sheet | VERIFIED | Collapsed: expanded row `group-data-[collapsible=icon]:hidden`, `SidebarMenu hidden group-data-[collapsible=icon]:flex` holds an Info `SidebarMenuButton` with tooltip and a DropdownMenu listing GitHub and Documentation. Mobile: `max-md:h-11` row and `max-md:size-11` buttons (44px); nav links call `setOpenMobile(false)`, external links do not. Component tests for the rail, the 44px classes and sheet close/stay-open pass; Playwright `sidebar.spec.ts` and `mobile.spec.ts` cover them in CI |
| 5  | Two sections in order Platform (Dashboard, Stacks, Templates) then System (Storage, Settings) from one pure model (19-01) | VERIFIED | `NAV_SECTIONS` in `lib/sidebar-nav.ts` (no React import) matches exactly; component test asserts order |
| 6  | Exactly the highlighted entry carries `aria-current="page"` (19-01) | VERIFIED | `app-sidebar.tsx` sets `aria-current={active ? "page" : undefined}` on the `Link`; component test passes |
| 7  | Icon rail: `collapsible="icon"`, tooltips on entries, logo-to-mark swap (19-01) | VERIFIED | `<Sidebar collapsible="icon">`, `tooltip={item.label}`, header swaps `BrandLogo` for `variant="mark"` via `group-data-[collapsible=icon]` classes; hover-tooltip and swap tests pass |
| 8  | Mobile sheet closes on internal nav (19-01) | VERIFIED | `onClick={() => setOpenMobile(false)}` on every nav `Link`; "closes the sheet after following an internal nav link" passes |
| 9  | `/templates` standalone page: title Templates, single breadcrumb, description, inside ProtectedRoute > AppLayout (19-02) | VERIFIED | `templates-page-header.tsx` catalog variant renders exactly that copy; route at `router.tsx:60`; `router.test.tsx` passes |
| 10 | `/stacks/create/templates` unchanged: "Start from a Template", breadcrumb Stacks / Create / Templates, Create Stack link still targets it (19-02, CONTEXT D-05) | VERIFIED | create-flow variant in header; `routes/app/stacks/create.tsx:41` still links `/stacks/create/templates`; page tests pass |
| 11 | Zero-templates empty state, filter-no-match copy, loading skeletons, error alert, per-repo alerts, failed repo with zero templates suppresses the empty state (19-02) | VERIFIED | `templates-catalog.tsx` implements each branch (`isEmpty` excludes catalogs with a `lastSyncError`); `templates-page.test.tsx` has a test per branch, all pass |
| 12 | Templates page is composition-only, at most 80 lines, no inline helper components (19-02) | VERIFIED | `templates.tsx` is 79 lines; header and catalog extracted to co-located section components |
| 13 | Version block copy and a11y: `Docktor v{version}` title, aria-labels ending "(opens in a new tab)", empty version falls back to bare "Docktor" (19-03) | VERIFIED | `versionText`/`productLabel` helpers, aria-labels and `title` present in `sidebar-version-block.tsx`; fallback and title tests pass |
| 14 | `components/ui/`, `docs-links.ts`, Dockerfile and `.github` unchanged (19-03, CONTEXT D-02/D-04) | VERIFIED | `git diff` over the phase range for those paths is empty |
| 15 | Debt markers / stubs absent in phase files | VERIFIED | grep for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER across all 12 source files: no matches |
| 16 | Catalog scrolls vertically with no horizontal overflow at 360/768/1280px in light and dark (19-02 backstop) | ? UNCERTAIN (insufficient_spec) | Only 360px is automated (`templates.spec.ts`, runs in CI). 768/1280 and theme check require a browser; see Human Verification |
| 17 | Prerelease version ellipsizes in the 16rem row without pushing link buttons out (19-03 backstop) | ? UNCERTAIN (insufficient_spec) | `min-w-0 truncate` on the text and `shrink-0` on the button group are present; the layout result needs a browser |
| 18 | Version text, hover/focus, tooltip and dropdown read correctly in light and dark (19-03 backstop) | ? UNCERTAIN (insufficient_spec) | All colours are sidebar theme variables (no literal palette utilities); the visual result needs a screenshot check |

**Score:** 15/18 truths verified (3 backstop visual truths routed to human verification; 0 behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `client/src/lib/sidebar-nav.ts` | NAV_SECTIONS, isNavItemActive, NavItem, NavSection | VERIFIED | Substantive, imported by `app-sidebar.tsx`, used |
| `client/src/components/app-sidebar.tsx` | Sections, rail, swap, mobile close | VERIFIED | Contains `collapsible="icon"`, `setOpenMobile(false)` |
| `client/src/lib/app-version.ts` | APP_VERSION | VERIFIED | Wired to the define; consumed by `app-sidebar.tsx` |
| `client/src/lib/project-links.ts` | GITHUB_URL, DOCS_HOME_URL, PROJECT_LINKS | VERIFIED | Consumed by `app-sidebar.tsx` |
| `client/src/globals.d.ts` | `declare const __APP_VERSION__: string;` | VERIFIED | Present |
| `client/src/components/sidebar-version-block.tsx` | Expanded row + collapsed Info dropdown | VERIFIED | Rendered in `SidebarFooter` above `NavUser` |
| `client/vite.config.ts`, `client/vitest.config.ts` | `__APP_VERSION__` define | VERIFIED | Both contain `__APP_VERSION__: JSON.stringify(version)` |
| `templates-page-header.tsx`, `templates-catalog.tsx`, `templates.tsx` | Header, catalog body, orchestrator | VERIFIED | Exports present, all wired |
| `router.tsx` `/templates` | Route beside create-flow route | VERIFIED | Line 60 |
| Test artifacts (unit and Playwright specs) | Listed in plans | VERIFIED | All present; unit files pass; Playwright specs exist and are CI-only per project policy |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app-sidebar.tsx` | `sidebar-nav.ts` | `NAV_SECTIONS.map`, `isNavItemActive(pathname, item.to)` | WIRED | |
| `app-sidebar.tsx` | `ui/sidebar.tsx` | `useSidebar().setOpenMobile(false)`, `collapsible="icon"`, `tooltip` | WIRED | |
| `router.tsx` | `templates.tsx` | `<Route path="/templates" element={<TemplateBrowsePage />}>` | WIRED | |
| `templates.tsx` | header / catalog | `<TemplatesPageHeader variant>` / `<TemplatesCatalog ...>` | WIRED | Variant chosen from `useLocation().pathname` |
| `vite.config.ts` | `app-version.ts` | define + `typeof __APP_VERSION__` guard | WIRED | |
| `app-sidebar.tsx` | `sidebar-version-block.tsx` | `<SidebarVersionBlock version={APP_VERSION} links={PROJECT_LINKS}/>` in `SidebarFooter` | WIRED | |
| `sidebar-version-block.tsx` | `ui/sidebar.tsx` | `group-data-[collapsible=icon]:hidden` / `:flex` | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `sidebar-version-block.tsx` | `version` | `APP_VERSION` <- Vite `define` <- `client/package.json` `version` (0.1.0) | Yes; unit test equates it to package.json | FLOWING |
| `templates-catalog.tsx` | `catalog` | `useTemplates()` -> templates API (unchanged hook) | Yes | FLOWING |
| `app-sidebar.tsx` nav | `pathname` | `useLocation()` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase unit tests (sidebar-nav, app-version, project-links, app-sidebar, sidebar-version-block, nav-user, router, templates-page, app-layout) | `vitest run --coverage.enabled=false` on those 9 files | 65/67 on a parallel run under load; the 2 failures were 5s timeouts in userEvent-heavy tests | PASS after rerun |
| The two timed-out files in isolation | `vitest run --no-file-parallelism app-sidebar.test.tsx templates-page.test.tsx` | 27/27 passed | PASS |
| Docs and GitHub links resolve | `curl` on both URLs | HTTP 200 / 200 | PASS |

Not run, per instructions: `tsc --build`, Playwright, the full test suite (CI).

### Probe Execution

Step 7c: SKIPPED (no probes declared by the phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UI-06 | 19-01 | Labelled sections; nested routes keep the highlight | SATISFIED | Truths 1, 5-8 |
| UI-07 | 19-02 | Templates sidebar entry opens a standalone catalog; "Use template" starts create flow | SATISFIED | Truths 2, 9-12 |
| UI-01 | 19-03 | Build-time version and GitHub/docs links above the account menu, working collapsed and on mobile | SATISFIED | Truths 3, 4, 13 |

All three IDs appear in the plan frontmatter and are marked Complete in REQUIREMENTS.md (lines 36, 41, 42, 87-89). No orphaned requirements: REQUIREMENTS.md maps no other ID to Phase 19.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | | Debt markers, stubs, empty handlers | | None found |

### Code Review Cross-Check (19-REVIEW.md)

| Finding | Status |
| ------- | ------ |
| CR-01 (bare `JSX.Element` in templates components) | Resolved in 575165e: both files now use `React.JSX.Element`, matching ten other files in `src/` that do the same without an import |
| WR-03 (docs URL `getdocktor.dev` vs `docs-links.ts`) | Not a gap: locked decision CONTEXT D-03 / D-04. The URL returns HTTP 200 |
| WR-01 (shadowed `variant`), WR-02 (path-prefix variant detection), IN-01 (duplicated version read), IN-02 (undocumented guard) | Non-blocking quality notes. Behavior is correct today; the cleanups are left to the maintainer |

### Human Verification Required

Only the three visual backstop truths (16-18) above remain. They are CSS and theme appearance checks that no jsdom or grep check can prove. Everything with an automated counterpart (360px overflow, sidebar journey, collapsed menu by click and Enter, mobile sheet 44px targets at 412 and 360px) is covered by the Playwright specs that CI runs.

### Gaps Summary

No gaps. The sections, active-state matching, rail, mobile sheet close, `/templates` route and page, empty state, build-time version and project links are all present, substantive, wired and backed by passing tests. The status is `human_needed` solely because three plan-declared visual backstop truths cannot be proven without a browser.

---

_Verified: 2026-10-18_
_Verifier: Claude (gsd-verifier)_
