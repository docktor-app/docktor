# Phase 19: Sidebar, Templates and Version Block - Research

**Researched:** 2026-10-18
**Domain:** React 19 / shadcn Sidebar / react-router 7 data router / Vite 7 + Vitest 4 build-time constants (client workspace only)
**Confidence:** HIGH (all load-bearing facts were read from the repo or installed `node_modules` this session; the few exceptions are tagged `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by the approved UI-SPEC**
- **D-01:** `19-UI-SPEC.md` (approved 2026-10-18) is the design contract and its decisions D-01..D-11 stand: `collapsible="icon"` sidebar, segment-aware `isNavItemActive` in `client/src/lib/sidebar-nav.ts`, new `/templates` route mounting the same `TemplateBrowsePage`, unchanged "Use Template" behaviour, build-time `__APP_VERSION__` via Vite `define`, collapsed version block as a dropdown menu button, mobile sheet closes on internal nav, no new typography/colour tokens, 44px touch targets on new controls below `md`. Downstream agents must read it.

**Version string (UI-01)**
- **D-02:** The version shown is `client/package.json` `version` only, injected at build time (UI-SPEC D-06). No dev marker, no git tag/build-arg override; Dockerfile and `publish.yml` are not touched. Phase 21 (REL-01) bumps the package version, so the block follows the release. - **Reversibility:** reversible - switching to a tag-derived build arg later only changes the `define` source.

**Docs link (UI-01)**
- **D-03:** The sidebar "Documentation" link points to the hosted docs site `https://getdocktor.dev` (overrides UI-SPEC D-07, which pointed at `github.com/docktor-app/docks`). `DOCS_HOME_URL` in `client/src/lib/project-links.ts` is `https://getdocktor.dev`; `GITHUB_URL` stays `https://github.com/docktor-app/docktor`. Both open in a new tab with `rel="noopener noreferrer"`. The UI-SPEC's D-07 text and any "docs live on GitHub" wording must be treated as superseded by this.
- **D-04:** The in-app contextual docs links in `client/src/lib/docs-links.ts` (`DOCS_LINK_STYLE = "github"`) are NOT changed in this phase; only the sidebar link uses the site. Switching those is a separate decision.

**Create-flow entry point (UI-07)**
- **D-05:** "Start from Template" on Create Stack keeps pointing at `/stacks/create/templates` (UI-SPEC D-04). Both `/templates` and `/stacks/create/templates` render `TemplateBrowsePage`, with title and breadcrumb derived from the path. Existing `create-stack-page.test.tsx` and `templates.spec.ts` stay valid.

**Section structure (UI-06)**
- **D-06:** Two sections in order: **Platform** (Dashboard, Stacks, Templates) and **System** (Storage, Settings), as in UI-SPEC D-01.

### Claude's Discretion
- Extracting the templates-page header into `templates-page-header.tsx`, empty-state wiring and exact file layout, within the UI-SPEC file table and the ~80-line page budget.

### Deferred Ideas (OUT OF SCOPE)
- Pointing in-app contextual docs links (`docs-links.ts`) at the getdocktor.dev site instead of GitHub markdown: separate change, not in this phase.
- In-app "new version available" notice: out of scope per issue #88.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | User sees the running version (injected at build time, not hard-coded) and GitHub and docs links above the sidebar account menu, working collapsed and on mobile (#88) | `define` mechanics for Vite 7 and Vitest 4 (verified, incl. vitest source), TS global declaration, dual expanded/collapsed rendering, mobile-branch behaviour of `Sidebar`, `Button` size gotcha, a11y name for the collapsed trigger |
| UI-06 | Sidebar entries are grouped under labelled sections, with nested routes keeping the active highlight (#93) | Current `app-sidebar.tsx` structure, `isNavItemActive` design + edge cases, `collapsible="icon"` wiring, `useSidebar().setOpenMobile`, existing Playwright selectors that must not break |
| UI-07 | A Templates sidebar entry opens a standalone catalog page whose "Use template" starts the create-stack flow (#94) | Current `templates.tsx` (97 lines) structure, router wiring, header extraction, zero-templates empty-state condition, existing unit/e2e tests to keep green |
</phase_requirements>

## Summary

This is a client-only phase (no server, shared, Prisma, Docker or workflow change). Three source files do almost all of the work: `app-sidebar.tsx` (renders from a new pure `NAV_SECTIONS` model, switches to `collapsible="icon"`, adds tooltips, logo/mark swap, closes the mobile sheet on internal nav, mounts a new `SidebarVersionBlock` above `NavUser`), `templates.tsx` (serves two paths, header extracted, zero-templates state) and `router.tsx` (one new `<Route path="/templates">`). The only build-tooling change is a `define` entry for `__APP_VERSION__` in **both** `client/vite.config.ts` and `client/vitest.config.ts` (Vitest prefers `vitest.config.ts`, so `vite.config.ts` is not merged into test runs) plus an ambient `declare const` in `src/`.

Most of the UI-SPEC maps cleanly onto the installed shadcn `sidebar.tsx`. Four things in the codebase differ from what the UI-SPEC assumes and the planner must account for them: (1) `Button size="icon"` is 36px (`size-9`), not 32px: the 32px variant is `size="icon-sm"` (`size-8`); (2) the SPEC's "cookie-restored collapsed state" does not exist: `SidebarProvider` only *writes* `sidebar_state`, `AppLayout` never reads it, so the sidebar always loads expanded (dual rendering is still the right approach, there is just no flash risk); (3) on mobile the `Sidebar` renders a `Sheet` and no ancestor carries `data-collapsible`, so `group-data-[collapsible=icon]:*` utilities never match there, which fixes the class polarity for the dual-render block; (4) jsdom applies no Tailwind CSS, so both variants are "visible" in unit tests and visibility/overflow/44px claims can only be proven in Playwright (CI-only per project memory).

**Primary recommendation:** Build bottom-up and test-first: `sidebar-nav.ts` + `project-links.ts` + `app-version.ts` (pure, unit-tested) -> `define` in both configs -> `SidebarVersionBlock` (props-driven) -> `AppSidebar` rewrite -> `templates-page-header.tsx` + `templates.tsx` + `router.tsx`. Use `Button size="icon-sm"` for the 32px link buttons, give the collapsed trigger an explicit `aria-label`, and put mobile checks in `mobile.spec.ts` (the only spec the `mobile-chromium` project matches besides `two-factor`).

## Project Constraints (from CLAUDE.md)

- Client rules: absolute `@/*` imports; page file = orchestrator (~80 lines); section components co-located in `routes/app/stacks/components/`; app-shell components live beside `app-sidebar.tsx`; `components/ui/*` is shadcn-managed, never edited; `components/common/` is generic only (no domain types).
- TypeScript: `strict`, no `any`, no unchecked `as` without a comment; props interfaces named `<Component>Props` and typed `Readonly<Props>`; explicit return types on exported functions.
- Naming: hooks/utilities/API clients kebab-case; constants SCREAMING_SNAKE_CASE (`NAV_SECTIONS`, `GITHUB_URL`, `APP_VERSION`).
- Forms/status UI rules: pills via `ToneBadge`/`StatusDot`; every literal `*-{gray,green,red,blue,yellow,orange,amber}-NNN` colour utility needs a `dark:` counterpart (this phase should use theme variables only and add none).
- TDD: tests before/alongside; client component tests with `@testing-library/react`, queries by role/label; hook tests mock `fetch`/API clients.
- No barrel `index.ts` for a single module. Commit format `type(scope): description`.
- Playwright runs take `PLAYWRIGHT_PORT`; **project memory: no full `tsc --build`, no integration tests, no heavy builds locally** - CI runs them. Targeted single-file vitest runs are the only local verification to plan for.
- Source of work is a GitHub issue; PRs close with `Closes #<n>` (#88, #93, #94 / bundle #96).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sidebar nav model, active-route matching | Browser / Client (`lib/sidebar-nav.ts`, pure) | - | Pure function of `pathname`; no server involvement |
| Running version | Build (Vite `define`) -> Browser | - | Baked into the bundle at build; no endpoint, no request (the Playwright `_apiRouteGuard` fails any unstubbed `/api/**` call, so a version endpoint would also break every spec) |
| Project links (GitHub, docs) | Browser / Client (`lib/project-links.ts`) | - | Static constants, external navigation in a new tab |
| Templates catalog page at `/templates` | Browser / Client (React Router route) | API / Backend (existing `GET /api/templates`, unchanged) | Same page component and hook as today; no API change |
| "Use template" -> create flow | Browser / Client (`navigate("/stacks/create?variant=<id>")`) | API / Backend (existing create-from-variant) | Unchanged behaviour (UI-SPEC D-05) |
| Mobile sheet close on nav | Browser / Client (`useSidebar().setOpenMobile`) | - | Provider state in `ui/sidebar.tsx` |
| Static hosting / Docker | CDN / Static (Vite output in image) | - | Nothing changes; `client/package.json` is already `COPY`'d in the `client-build` stage |

## Standard Stack

No new dependencies. Everything below is already installed. `[VERIFIED: node_modules/*/package.json read this session]`

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | ^19.2.4 | UI | existing; React 19 passes `ref` as a prop, relevant to `asChild` composition below |
| react-router | 7.13.0 (installed) | `Link`, `useLocation`, `createBrowserRouter`, `matchRoutes` | existing data router in `router.tsx` |
| radix-ui | 1.4.3 (installed) | Dropdown, Tooltip, Dialog (Sheet), Slot | what `components/ui/*` wraps |
| lucide-react | 0.575.0 (installed) | `Github`, `BookOpen`, `Info`, `LayoutTemplate`, `HardDrive`, `Layers`, `LayoutDashboard`, `Settings` | all eight resolve (`typeof` check on `require('lucide-react')` returned `object` for each this session) |
| vite | 7.3.1 (installed) | `define` for `__APP_VERSION__` | `[CITED: vite.dev/config/shared-options#define]` |
| vitest | 4.0.18 (installed) | unit tests, `define` handled by assigning to `globalThis` | `[VERIFIED: node_modules/vitest/dist/chunks/cli-api.B7PN_QUv.js:9325-9355 and setup-common.Cm-kSBVi.js:32]` |
| jsdom | 28.1.0 (installed) | test DOM | no layout, no Tailwind CSS (see Pitfall 4) |
| @testing-library/react 16.3.2, user-event 14.6.1 | installed | component tests | existing |

### Supporting / Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Own `isNavItemActive` helper (locked, UI-SPEC D-03) | react-router `NavLink` (segment-aware by itself) | Would work for the highlight table, but the helper is locked, is pure/unit-testable, and `SidebarMenuButton.isActive` needs the boolean outside the `Link`. Do not revisit. |
| `readFileSync` of `package.json` in the configs | `import pkg from "./package.json"` in the config | JSON import in a bundled Vite config probably works but is `[ASSUMED]`; `readFileSync` + `JSON.parse` is certain and `__dirname` is already used in `vite.config.ts`. |

**Installation:** none. **Package Legitimacy Audit:** not applicable - this phase installs no external packages (icons come from the already-installed `lucide-react`). `shadcn add` is not needed: `sidebar`, `dropdown-menu`, `tooltip`, `button`, `separator` already exist in `client/src/components/ui/` (ls this session).

## Architecture Patterns

### System Architecture Diagram

```
 build time                                   run time (browser)
 ----------                                   ------------------
 client/package.json ──read──> vite.config.ts  ─define─> bundle: __APP_VERSION__ = "0.1.0"
                       └─────> vitest.config.ts ─define─> globalThis.__APP_VERSION__ (tests)
                                                              │
 src/lib/app-version.ts: APP_VERSION ◄────────────────────────┘
 src/lib/project-links.ts: GITHUB_URL, DOCS_HOME_URL
 src/lib/sidebar-nav.ts: NAV_SECTIONS, isNavItemActive(pathname, to)
        │                          │
        ▼                          ▼
 AppLayout > SidebarProvider > AppSidebar (collapsible="icon")
   ├─ SidebarHeader: BrandLogo logo (expanded) | mark (collapsed)
   ├─ SidebarContent: NAV_SECTIONS.map -> SidebarGroup(label) -> SidebarMenuButton asChild > Link
   │        pathname (useLocation) ─> isNavItemActive ─> isActive + aria-current
   │        click internal link ─> useSidebar().setOpenMobile(false)   (no-op on desktop)
   └─ Separator, SidebarFooter
        ├─ SidebarVersionBlock(version, links)
        │     expanded row  : v{version} + 2 <a target=_blank> icon buttons   (hidden when rail collapsed)
        │     collapsed menu: Info button -> DropdownMenu(label, GitHub, Documentation) (hidden when expanded)
        └─ NavUser (unchanged)

 Router (AppLayout children):  /templates ─┐
                               /stacks/create/templates ─┴─> TemplateBrowsePage
        useLocation().pathname ─> templates-page-header (title / breadcrumb / description)
        useTemplates() ─> loading | error | repo alerts | EmptyState(zero) | TemplateGrid
        Use Template ─> navigate(/stacks/create?variant=<id>) | TemplateVariantDialog
```

### Recommended Project Structure
```
client/
├── vite.config.ts            # + define: __APP_VERSION__
├── vitest.config.ts          # + define: __APP_VERSION__ (separate file, NOT merged with vite.config.ts)
├── src/
│   ├── globals.d.ts          # NEW, script file: declare const __APP_VERSION__: string;
│   ├── lib/sidebar-nav.ts    # NEW pure
│   ├── lib/project-links.ts  # NEW constants
│   ├── lib/app-version.ts    # NEW
│   ├── components/sidebar-version-block.tsx   # NEW (beside app-sidebar.tsx)
│   ├── components/app-sidebar.tsx             # EDIT
│   ├── router.tsx                             # EDIT (+1 route)
│   └── routes/app/stacks/
│       ├── templates.tsx                      # EDIT (<= ~80 lines)
│       └── components/templates-page-header.tsx   # NEW (Claude's discretion, recommended)
└── test/unit/...             # see Validation Architecture
```

### Pattern 1: `define` in both configs (UI-01)
**What:** One constant, defined identically in the two config files, read through one module.
**Verified facts:**
- Vite: "Entries will be defined as globals during dev and statically replaced during build"; the value "must be a string that contains a JSON-serializable value" (so `JSON.stringify(version)`); the docs recommend declaring it in a `vite-env.d.ts` as `declare const __APP_VERSION__: string`. `[CITED: https://vite.dev/config/shared-options#define]`
- Vitest 4 does **not** statically replace simple (dot-free) `define` keys; it removes them from `viteConfig.define` and assigns them to `globalThis` in the test worker: `deleteDefineConfig` does `if (!key.includes(".")) { defines[key] = replacement; delete viteConfig.define[key]; }` and `setupDefines` does `for (const key in config.defines) globalThis[key] = config.defines[key];`. `[VERIFIED: node_modules/vitest/dist/chunks/cli-api.B7PN_QUv.js:9347-9352; node_modules/vitest/dist/chunks/setup-common.Cm-kSBVi.js:31-33]`. Consequence: `typeof __APP_VERSION__` is a valid runtime guard in both environments, and `define` must be at the **top level** of `defineConfig`, not inside `test:` `[CITED: https://vitest.dev/config/ - "these options should be defined on the top level, not within a test property"]`.
- `client/vitest.config.ts` exists and has no `mergeConfig`/import of `vite.config.ts` (`[VERIFIED: client/vitest.config.ts read in full]`), so `vite.config.ts` changes do not reach tests.
- `tsconfig.json` has `"include": ["src"]` so the config files are not type-checked by `tsc --build`; the ambient declaration must live under `src/`. `src/assets.d.ts` already contains `declare module "*.svg" {...}` (ambient, no top-level import/export), so a sibling script file works the same way. Do **not** add `/// <reference types="vite/client" />` as part of this: it re-declares `*.svg` and is unrelated churn.

**Example:**
```ts
// client/vite.config.ts and client/vitest.config.ts (same two lines in each)
import {readFileSync} from "node:fs";
// ...
const {version} = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {version: string}; // package.json shape is fixed; version is a required field

export default defineConfig({
    define: {__APP_VERSION__: JSON.stringify(version)},
    // ...existing plugins/resolve/test
});
```
```ts
// client/src/globals.d.ts   (no imports/exports - must stay an ambient script file)
declare const __APP_VERSION__: string;
```
```ts
// client/src/lib/app-version.ts
// Injected at build time from client/package.json (vite.config.ts / vitest.config.ts `define`).
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
```
`SidebarVersionBlock` takes `version` as a prop (default wiring in `AppSidebar`: `version={APP_VERSION}`), so the block is testable without the define; `version === ""` renders `Docktor` with no `v` (UI-SPEC copy rule).

### Pattern 2: Pure nav model + helper (UI-06)
```ts
// client/src/lib/sidebar-nav.ts
import type {LucideIcon} from "lucide-react";
import {HardDrive, Layers, LayoutDashboard, LayoutTemplate, Settings} from "lucide-react";

export interface NavItem { readonly to: string; readonly label: string; readonly icon: LucideIcon }
export interface NavSection { readonly label: string; readonly items: ReadonlyArray<NavItem> }

export const NAV_SECTIONS: ReadonlyArray<NavSection> = [
    {label: "Platform", items: [
        {to: "/", label: "Dashboard", icon: LayoutDashboard},
        {to: "/stacks", label: "Stacks", icon: Layers},
        {to: "/templates", label: "Templates", icon: LayoutTemplate},
    ]},
    {label: "System", items: [
        {to: "/storage", label: "Storage", icon: HardDrive},
        {to: "/settings", label: "Settings", icon: Settings},
    ]},
];

export function isNavItemActive(pathname: string, to: string): boolean {
    if (to === "/") return pathname === "/";
    return pathname === to || pathname.startsWith(`${to}/`);
}
```
Edge cases for the unit test beyond the UI-SPEC table: `/stacks-foo` must not activate Stacks; `/templates` must not activate Stacks (and `/stacks/create/templates` must not activate Templates); `/settings` itself (the redirect source) activates Settings; `/account` activates nothing; consider tolerating a trailing slash (`/stacks/`) by normalising (`pathname.replace(/\/+$/, "") || "/"`) - harmless and cheap. `useLocation().pathname` never includes the query string, so `/stacks/create?variant=v1` is just `/stacks/create`.

### Pattern 3: Sidebar rendering (UI-06 + collapsed + mobile)
- `<Sidebar collapsible="icon">`. Current default is `collapsible = "offcanvas"` `[VERIFIED: client/src/components/ui/sidebar.tsx:146  collapsible = "offcanvas",]`.
- Nav item: `SidebarMenuButton asChild isActive={active} tooltip={item.label}` around `<Link to={item.to} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>`. The tooltip wrapper is built inside `SidebarMenuButton` and is suppressed when expanded/mobile: `[VERIFIED: sidebar.tsx:530  hidden={state !== "collapsed" || isMobile}]`. `SidebarMenuButton` spreads `{...props}` onto the `Slot`, so `onClick`/`aria-current` on the `Link` child survive Slot merging (child props win, handlers are composed).
- `useSidebar()` exposes `setOpenMobile` `[VERIFIED: sidebar.tsx:29  setOpenMobile: (open: boolean) => void]`; calling it with `false` on desktop is a harmless state set (it only drives the Sheet). `AppSidebar` is always rendered inside `SidebarProvider` (`AppLayout`), but **any new test that renders `AppSidebar`, `SidebarVersionBlock` or `NavUser` must wrap in `SidebarProvider`** (the hook throws outside it).
- Header swap: wrap `BrandLogo variant="logo"` in `group-data-[collapsible=icon]:hidden` and `variant="mark"` in `hidden group-data-[collapsible=icon]:block`. `BrandLogo` renders **two** `<img alt="Docktor">` (light + dark) per call `[VERIFIED: client/src/components/common/brand-logo.tsx]`, so both wrappers add up to four imgs in the DOM; only CSS hides them. Don't assert `getByRole("img", {name: "Docktor"})` as a singleton. (The existing `<h1>` around the logo plus each page's `PageTitle` `<h1>` is a pre-existing double-h1; not in scope.)

### Pattern 4: Dual-rendered version block (UI-01)
Polarity (derived from the code, important): `Sidebar`'s desktop wrapper carries `data-collapsible={state === "collapsed" ? collapsible : ""}` and class `group` `[VERIFIED: sidebar.tsx:199-201]`; the mobile branch returns a `<Sheet>` whose content has **no** `data-collapsible` ancestor `[VERIFIED: sidebar.tsx:172-193]`. Therefore:
- Expanded row: `group-data-[collapsible=icon]:hidden` -> visible on mobile and when expanded, `display:none` when the rail is collapsed.
- Collapsed menu button: `hidden group-data-[collapsible=icon]:flex` (or `:block`) -> **never** shown on mobile (no matching ancestor), shown only in the collapsed rail.
Do not invert this (e.g. `group-data-[collapsible=icon]:hidden` on the collapsed variant would show both on mobile).

Collapsed trigger composition: `DropdownMenuTrigger asChild` > `SidebarMenuButton tooltip="Docktor v{version}"` (+ `aria-label`). `NavUser` already uses `DropdownMenuTrigger asChild` > `SidebarMenuButton` `[VERIFIED: client/src/components/nav-user.tsx]`; adding `tooltip` nests `Tooltip > TooltipTrigger asChild > button` inside. React 19 passes `ref` as a normal prop and `SidebarMenuButton` spreads `...props`, so the dropdown's ref/handlers reach the button. Whether tooltip and dropdown state attributes interact cleanly in a real browser is not covered by jsdom -> verify in the Playwright collapsed-rail test (open the menu by click and by keyboard Enter; assert both links visible). `[ASSUMED]` that the nesting works without extra glue; fallback if it does not: drop `tooltip` from the trigger and use `title`/`aria-label` only.

Expanded link buttons: `Button variant="ghost" size="icon-sm" asChild` > `<a href target="_blank" rel="noopener noreferrer" aria-label=... title=...>` plus `max-md:size-11`. **`size="icon"` is 36px** `[VERIFIED: client/src/components/ui/button.tsx:28-30  icon: "size-9",  ...  "icon-sm": "size-8",]`, so the SPEC's "32px at md and up" requires `icon-sm`. Both `size-8` and `max-md:size-11` are kept by `tailwind-merge` (different variants) and the `max-md:` rule wins below 768px (`useIsMobile` breakpoint is also 768 `[VERIFIED: client/src/hooks/use-mobile.ts  MOBILE_BREAKPOINT = 768]`).

Menu items: `DropdownMenuItem asChild` > `<a ...>` gives `role="menuitem"` with `href` (same pattern the `NavUser` test asserts for Account: `findByRole("menuitem", {name: "Account"})` `toHaveAttribute("href", "/account")`).

### Pattern 5: Templates page on two routes (UI-07)
- `router.tsx` today: `<Route path="/stacks/create/templates" element={<TemplateBrowsePage />} />` `[VERIFIED: client/src/router.tsx]`. Add `<Route path="/templates" element={<TemplateBrowsePage />} />` inside the same `AppLayout` group (e.g. right after the stacks routes). No conflict with `/stacks/:id/:tab?` (different first segment).
- `templates.tsx` currently: module-level `BREADCRUMB` constant (Stacks / Create / Templates), title `Start from a Template`, 97 lines. Plan: extract header into `templates-page-header.tsx` taking a boolean/enum prop (e.g. `variant: "catalog" | "create-flow"`) computed in the page from `useLocation().pathname`. Recommended discriminator: `pathname.startsWith("/stacks/create")` -> create-flow, otherwise catalog. This is robust to a trailing slash, and an unknown path (e.g. `MemoryRouter` default `/` in the existing tests) falls to the standalone header; the existing `templates-page.test.tsx` never asserts the title, so it stays green either way.
- `PageHeader`'s children area is `flex flex-wrap items-center justify-between`; put `PageTitle` + `PageDescription` in one wrapper `<div>` so the description sits under the title on `/templates` only.
- Zero-templates state: show `EmptyState` **instead of** `TemplateGrid` when `catalog.templates.length === 0` and no repo has `lastSyncError` (the failed-repo case is covered by `TemplateRepoAlerts`, which renders `repos.filter((repo) => repo.lastSyncError)` `[VERIFIED: template-repo-alerts.tsx]`). Today a zero-template catalog renders the search box + category select + the "No templates found" copy (TemplateGrid's filter-empty branch), which is wrong for an empty catalog, hence the new branch. `EmptyState` wraps `children` in a `<p>`, so inline `Link`s are valid children. Repo alerts must still render above it when some repo failed and templates is empty (existing e2e test "a repo sync failure shows the error alert" uses `templates: []` and expects the alert; keep that working - with a failing repo present, show the alert and not the "No templates available" empty state, per UI-SPEC condition "no repo error").

### Anti-Patterns to Avoid
- **Editing `components/ui/sidebar.tsx` / `button.tsx`**: forbidden; everything needed is a prop or a className.
- **Hiding the inactive version variant with `opacity-0`/`sr-only`**: it stays keyboard-reachable. Use `hidden` (display:none).
- **Adding any `/api` call for the version**: the Playwright `_apiRouteGuard` aborts unstubbed `**/api/**` requests and fails the test `[VERIFIED: client/test/integration/fixtures.ts]`; build-time injection avoids this.
- **Hard-coding the version string or the URLs in components**: components read `APP_VERSION` / `project-links.ts` only (and the version block takes them as props).
- **Aria-labels containing the substring "name"**: `templates.spec.ts` uses `page.getByLabel(/name/i)` on the Create page (substring, case-insensitive) and the sidebar is on that page; the planned labels (`Docktor on GitHub (opens in a new tab)`, `Docktor documentation (opens in a new tab)`) are fine, keep any new label free of "name".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsed-rail tooltips | custom hover popovers | `SidebarMenuButton tooltip` | Already hides itself when expanded or on mobile (sidebar.tsx:530) |
| Collapsed menu | custom popover/focus management | `DropdownMenu` family (same as `NavUser`) | Focus trap, Esc, arrow keys, portal, `role=menuitem` |
| Mobile drawer | own sheet | existing `Sidebar` mobile branch (`Sheet`) | Already there; only call `setOpenMobile(false)` |
| Empty state | bespoke markup | `EmptyState` (`components/common/empty-state.tsx`) | Generic, props-only |
| Category pill | classed span | `ToneBadge` (already in `TemplateCard`) | CLAUDE.md rule |
| Version in bundle | fetch / env file / `import.meta.env` hack | Vite `define` | Static, no request, matches D-02 |
| Segment-aware matching | ad-hoc regex in the component | `isNavItemActive` in `lib/sidebar-nav.ts` | Pure + unit-tested; UI-SPEC D-03 |

**Key insight:** every behaviour in this phase is composition of shadcn/Radix primitives that already exist; the custom code is two pure modules, two small components and a route.

## Runtime State Inventory

Not a rename/refactor/migration phase - omitted. (One incidental data point: the shadcn `sidebar_state` cookie is written on toggle `[VERIFIED: sidebar.tsx:17  const SIDEBAR_COOKIE_NAME = "sidebar_state"]` but never read, so there is no stored state to migrate.)

## Common Pitfalls

### Pitfall 1: Vitest does not statically replace `define`
**What goes wrong:** `__APP_VERSION__` is `undefined` (ReferenceError in a bare read) in unit tests if only `vite.config.ts` was edited.
**Why:** `vitest.config.ts` takes precedence over `vite.config.ts` and is not merged; Vitest assigns dot-free define keys to `globalThis` instead of replacing them.
**How to avoid:** add `define` to both files; read via `typeof __APP_VERSION__ === "string"` in `app-version.ts`; test `APP_VERSION === JSON.parse(readFileSync("package.json")).version`.
**Warning signs:** `ReferenceError: __APP_VERSION__ is not defined` in `app-sidebar` tests; version block rendering bare `Docktor`.

### Pitfall 2: 36px vs 32px link buttons
**What goes wrong:** `size="icon"` renders 36px, not the contracted 32px (and overflows the 32px row height).
**How to avoid:** `size="icon-sm"` + `max-md:size-11`.

### Pitfall 3: Wrong visibility polarity on mobile
See Pattern 4. On mobile there is no `data-collapsible` ancestor; the collapsed-only variant must default to `hidden`.

### Pitfall 4: jsdom has no CSS and no layout
**What goes wrong:** Tests see both the expanded row and the collapsed trigger (Tailwind classes are strings only), so `getByRole("link", ...)` / `getByRole("button", ...)` can find more than you expect, and "hidden when collapsed", "44px", "truncates, no overflow" are untestable in vitest.
**How to avoid:** assert structure and class tokens in vitest (`toHaveClass("group-data-[collapsible=icon]:hidden")`, `data-collapsible="icon"` on the wrapper when `SidebarProvider defaultOpen={false}`); prove real visibility, overflow at 360/412px and touch size in Playwright (`expect(locator).toBeHidden()`, `boundingBox()`), as `mobile.spec.ts` already does with `expectNoHorizontalOverflow`. The collapsed menu content is portaled and only mounted after opening, so its links do not pollute queries before the click.

### Pitfall 5: Mobile in jsdom
`useIsMobile` reads `window.innerWidth` in an effect `[VERIFIED: client/src/hooks/use-mobile.ts]`; `test/setup.ts` stubs `matchMedia` with `matches:false` `[VERIFIED: client/test/setup.ts]` and jsdom's default `innerWidth` is 1024 (a replaceable property, `Window.js:316/466`), so tests are desktop by default. To test D-09: set `window.innerWidth = 500` (restore in `afterEach`) **before** `render`, open the sheet with the real shortcut (`await user.keyboard("{Control>}b{/Control}")` - `SIDEBAR_KEYBOARD_SHORTCUT = "b"` on `globalThis` keydown `[VERIFIED: sidebar.tsx:22,86-95]`), then click an internal nav link and assert the dialog is gone; assert clicking the GitHub link does not close it. `[ASSUMED]` that assigning `window.innerWidth` is enough in jsdom 28 (the property is replaceable per `makeReplaceablePropertyDescriptor`); `Object.defineProperty(window, "innerWidth", {configurable: true, value: 500})` is the safe form.

### Pitfall 6: Radix Tooltip needs `ResizeObserver` in jsdom
Dropdown menus open fine in jsdom (`nav-user.test.tsx` does it without a stub), but any test that *opens a tooltip* (hover/focus a tooltip-wrapped `SidebarMenuButton`) renders the Popper arrow and needs `ResizeObserver`. Several existing tests carry the same guarded stub (`templates-page.test.tsx`, `create-stack-page.test.tsx`); copy it into the new sidebar tests (or hoist it into `test/setup.ts` as a Wave 0 improvement; both are safe because it is guarded by `typeof === "undefined"`). Tests that never hover a tooltip do not need it.

### Pitfall 7: Existing Playwright selectors vs the new markup
Verified grep of `client/test`: sidebar-dependent selectors are `getByRole("link", {name: "Stacks"})` (mobile.spec within `getByRole("dialog")`; two-factor.spec uses `.first()`), `{name: "Dashboard"}`, `{name: "Storage"}`, `getByRole("button", {name: "Toggle Sidebar"})`, and the theme toggle's `menuitemcheckbox {name: "System"}`. The new `System` section label is a plain `div`, not a menuitem, so it does not collide; a `Templates` link does not collide with `name: "Start from Template"` (substring match goes the other way). No spec asserts the old "Platform"-only structure. Nothing here should break, but keep the section-label elements non-interactive.

### Pitfall 8: Persistence expectation
The UI-SPEC mentions a "cookie-restored collapsed state" and "no layout flash". `AppLayout` renders `<SidebarProvider>` with no `defaultOpen`, and nothing reads `sidebar_state`, so a reload always starts expanded. Not required by the success criteria; do not add cookie reading to this phase (would be new scope). Dual rendering via CSS group utilities remains correct for live toggling.

### Pitfall 9: Header duplicates after the logo swap
`BrandLogo` already emits two `<img>`s; wrapping both logo and mark gives four. They are `display:none` when inactive, so no AT impact, but unit tests must not use singleton `getByRole("img")` queries on the header.

## Code Examples

### Version block contract (props-driven, testable)
```tsx
// client/src/components/sidebar-version-block.tsx  (shape only)
export interface SidebarVersionBlockProps {
    readonly version: string;                 // "" => renders "Docktor" without "v"
    readonly links: {readonly github: string; readonly docs: string};
}
// Expanded:  <div className="group-data-[collapsible=icon]:hidden px-2 flex items-center justify-between gap-1 h-8 max-md:h-11" aria-label=...>
//              <span className="truncate text-xs tabular-nums text-sidebar-foreground/70">{label}</span>
//              <Button asChild variant="ghost" size="icon-sm" className="max-md:size-11"><a .../></Button> x2
// Collapsed: <SidebarMenu className="hidden group-data-[collapsible=icon]:flex"> ... DropdownMenu ... </SidebarMenu>
```

### Router assertion without rendering the whole app
```tsx
import {matchRoutes} from "react-router";
import {router} from "@/router";          // creates a browser router; fine under jsdom
import TemplateBrowsePage from "@/routes/app/stacks/templates";

const leaf = (p: string) => matchRoutes(router.routes, p)?.at(-1)?.route.element;
expect(isValidElement(leaf("/templates")) && leaf("/templates").type).toBe(TemplateBrowsePage);
```
`[ASSUMED]` that importing `@/router` in vitest is cheap enough/side-effect-free (no existing unit test imports it; it pulls in every page). If it proves heavy, `vi.mock` the heavy page modules, or cover the two paths only via Playwright (`templates.spec.ts` already visits `/stacks/create/templates`; add `/templates`).

### Existing nav-user test pattern to copy for the version-block menu
```tsx
render(<MemoryRouter><SidebarProvider><NavUser/></SidebarProvider></MemoryRouter>);
await user.click(screen.getByRole("button", {name: /Ada Lovelace/}));
const account = await screen.findByRole("menuitem", {name: "Account"});
expect(account).toHaveAttribute("href", "/account");
```
`[VERIFIED: client/test/unit/components/nav-user.test.tsx]`. `NavUser` pulls `useSession` from `@/lib/auth-client`; any `AppSidebar` test must `vi.mock("@/lib/auth-client", () => ({signOut, useSession: () => ({data: {user: {...}}})}))` exactly like that file.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| shadcn `Sidebar` default `collapsible="offcanvas"` (fully hidden when collapsed) | `collapsible="icon"` rail with `group-data-[collapsible=icon]` utilities | tooltips + dual variants are now required for collapsed usability |
| Prefix-match active state (`pathname.startsWith(item.to)`, current code) | Segment-aware helper | `/stacks-foo`, and `/templates` vs `/stacks/...` no longer cross-highlight |

**Deprecated/outdated:** the current `navItems` array and inline `active` computation in `app-sidebar.tsx` are replaced by `NAV_SECTIONS`/`isNavItemActive`. lucide's `Github` brand icon exists in 0.575.0 (verified) - `[ASSUMED]` that brand icons are removed in a later lucide major; the caret range `^0.575.0` cannot reach it (0.x caret = patch only), but note it for future upgrades.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nesting `DropdownMenuTrigger asChild` > `SidebarMenuButton tooltip=...` composes cleanly in a real browser (tooltip + dropdown on one control) | Pattern 4 | Collapsed menu may not open/tooltip mis-fires; fallback: drop `tooltip` on the trigger, rely on `aria-label` + `title`. Verify in Playwright collapsed-rail test. |
| A2 | `window.innerWidth = 500` (or `defineProperty`) is sufficient to make `useIsMobile` true in jsdom 28 | Pitfall 5 | Mobile unit test needs a different trigger; Playwright mobile project covers it anyway |
| A3 | Importing `@/router` in vitest is side-effect-free/cheap | Code Examples | Router unit test may need module mocks, or be replaced by Playwright coverage |
| A4 | `import pkg from "./package.json"` would work in the Vite config (not used; `readFileSync` recommended) | Standard Stack | none if `readFileSync` is used |
| A5 | lucide removes brand icons (`Github`) in a later major | State of the Art | none for this phase (range cannot reach it) |
| A6 | Quick local verification command `yarn workspace @docktor/client exec vitest run --coverage.enabled=false <file>` works (not executed here, per project memory) | Validation Architecture | planner may need to adjust the command; CI is the authority |

## Open Questions

1. **Accessible name of the collapsed trigger.** UI-SPEC specifies the tooltip (`Docktor v{version}`) but not an `aria-label`. A tooltip is not an accessible name, and a `SidebarMenuButton` containing only an `Info` icon would be unnamed.
   - Recommendation: add `aria-label="Docktor v{version} - links"` (or similar; **avoid the substring "name"**, see Anti-Patterns) and test it by role/name. Treat as an implementation detail within the UI-SPEC's intent.
2. **Mobile-sheet autofocus.** The sheet opens with Radix focus management; closing on nav click returns focus to the trigger. No action needed; just don't add `autoFocus`.
3. **Router unit test vs Playwright only** (A3) - planner's call; Playwright coverage of both URLs is mandatory regardless.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + installed `client` deps | vitest unit tests | yes | vite 7.3.1, vitest 4.0.18, jsdom 28.1.0 (read from node_modules) | - |
| `@docktor/shared` build | `yarn workspace @docktor/client test` prefixes `yarn workspace @docktor/shared build` | built in CI | - | targeted `vitest run <file>` skips it for pure-lib tests |
| Playwright + Chromium | `test:integration`, `mobile-chromium` | CI only (project memory forbids local runs) | `@playwright/test ^1.58.2` | none: write specs, let CI run them |
| External network | docs/GitHub link targets | not needed at build or test time | - | - |

**Missing with no fallback:** none. **Note:** no `gh`/network lookups were needed; `https://getdocktor.dev` reachability was not checked (it is a constant per D-03).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + jsdom 28 + @testing-library/react 16 + user-event 14 (unit); Playwright ^1.58 (e2e, CI only) |
| Config file | `client/vitest.config.ts` (`include: ["test/unit/**/*.test.{ts,tsx}"]`, `setupFiles: ["./test/setup.ts"]`, v8 coverage `enabled: true`); `client/playwright.config.ts` (projects `chromium` [ignores `mobile.spec.ts`] and `mobile-chromium` [matches only `(mobile\|two-factor)\.spec\.ts`]) |
| Quick run command | `yarn workspace @docktor/client exec vitest run --coverage.enabled=false test/unit/lib/sidebar-nav.test.ts` (single file; light) |
| Full suite command | `yarn test:unit` (CI) / `yarn test:integration` (CI only) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-06 | `isNavItemActive` table (all UI-SPEC rows + `/stacks-foo`, `/templates` vs Stacks, trailing slash); `NAV_SECTIONS` order/labels | unit | `vitest run test/unit/lib/sidebar-nav.test.ts` | Wave 0 (new) |
| UI-06 | `AppSidebar`: labels `Platform`,`System` in order; five links in order; `aria-current="page"` only on active (`/stacks/abc/backups/xyz` -> Stacks; `/templates` -> Templates only); `data-collapsible="icon"` wired when `SidebarProvider defaultOpen={false}` | component | `vitest run test/unit/components/app-sidebar.test.tsx` | Wave 0 (new; needs `auth-client` mock + `SidebarProvider` + `MemoryRouter`) |
| UI-06 | Mobile: internal link closes the sheet, external link does not (innerWidth 500 + Ctrl+B) | component | same file | Wave 0 |
| UI-01 | `APP_VERSION === package.json version` (guards hard-coding AND the vitest `define`) | unit | `vitest run test/unit/lib/app-version.test.ts` | Wave 0 (new) |
| UI-01 | `GITHUB_URL === "https://github.com/docktor-app/docktor"`, `DOCS_HOME_URL === "https://getdocktor.dev"` (D-03) | unit | `vitest run test/unit/lib/project-links.test.ts` | Wave 0 (new) |
| UI-01 | `SidebarVersionBlock`: `v{version}`; empty version -> `Docktor`; two links with `href`/`target="_blank"`/`rel` containing `noopener`; collapsed trigger opens menu listing `Docktor v{version}`, GitHub, Documentation (render inside `SidebarProvider`) | component | `vitest run test/unit/components/sidebar-version-block.test.tsx` | Wave 0 (new) |
| UI-07 | `TemplateBrowsePage` at `/templates` vs `/stacks/create/templates`: title, breadcrumb, description per path; `Use Template` -> `navigate("/stacks/create?variant=v1")` on both; zero-templates `EmptyState` (and NOT shown when a repo has `lastSyncError`) | component | extend `test/unit/routes/stacks/templates-page.test.tsx` (give `renderPage` an `initialEntries` arg) | exists; extend |
| UI-07 | Both URLs resolve to `TemplateBrowsePage` | unit (optional, A3) / e2e | `vitest run test/unit/router.test.tsx` | Wave 0 (optional) |
| UI-01/06/07 | e2e (CI): sidebar Templates entry -> catalog -> Use Template -> prefilled create form; sidebar shows `v` + version read from `client/package.json`; Toggle Sidebar -> rail: expanded links `toBeHidden`, `Info` button opens menu with both links; Stacks highlighted at `/stacks/create/templates` | e2e | extend `templates.spec.ts`; new `sidebar.spec.ts` (desktop `chromium`) | Wave 0 |
| UI-01/06 | e2e mobile (`mobile-chromium`): toggle -> dialog shows labels + version + both links, 44px link buttons (`boundingBox`), internal nav closes the dialog, `expectNoHorizontalOverflow` | e2e | **must go in `mobile.spec.ts`** (the project only matches `mobile`/`two-factor` specs) | exists; extend |

### Existing tests that must stay green
- `client/test/unit/components/nav-user.test.tsx` (NavUser unchanged; it mounts `SidebarProvider`).
- `client/test/unit/components/app-layout.test.tsx` (mocks `@/components/app-sidebar` -> `AppSidebar` is stubbed, so the rewrite cannot break it unless the export name/path changes: keep `export function AppSidebar` in `components/app-sidebar.tsx`).
- `client/test/unit/routes/stacks/create-stack-page.test.tsx` line 209: link `href` `"/stacks/create/templates"` (Create Stack's "Start from Template" target stays).
- `client/test/unit/routes/stacks/templates-page.test.tsx` (4 tests; they render `<SidebarProvider><MemoryRouter><TemplateBrowsePage/>` with default location `/`, mock `useNavigate`, and use a `ResizeObserver` stub).
- `client/test/unit/components/domain/template/template-grid.test.tsx` (TemplateGrid unchanged).
- Playwright: `templates.spec.ts` (4 tests; heading `Start from a Template` at `/stacks/create/templates`; `getByLabel(/name/i)`), `mobile.spec.ts` sidebar test (`Toggle Sidebar` -> dialog -> `Stacks` link), `storage.spec.ts` (sidebar `Storage` link), `config-unsaved-changes.spec.ts` (sidebar `Dashboard` link with the unsaved-changes guard), `two-factor.spec.ts`.

### Sampling Rate
- **Per task commit:** targeted single-file `vitest run --coverage.enabled=false <file>` for the files touched (light enough; no `tsc --build`, no Playwright locally).
- **Per wave merge:** CI (`yarn typecheck`, `yarn test:unit`, `yarn test:integration`).
- **Phase gate:** CI green, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `client/test/unit/lib/sidebar-nav.test.ts` - UI-06
- [ ] `client/test/unit/lib/app-version.test.ts`, `client/test/unit/lib/project-links.test.ts` - UI-01
- [ ] `client/test/unit/components/app-sidebar.test.tsx` - UI-06 (mock `@/lib/auth-client` like `nav-user.test.tsx`; add the guarded `ResizeObserver` stub)
- [ ] `client/test/unit/components/sidebar-version-block.test.tsx` - UI-01
- [ ] `client/test/unit/router.test.tsx` (optional, see A3) - UI-07
- [ ] `client/test/integration/sidebar.spec.ts` (desktop: expanded + collapsed rail + Templates journey + version equals `client/package.json`) and additions to `mobile.spec.ts`
- [ ] `client/src/globals.d.ts` with the `declare const` (needed for `tsc --build` in CI, which is the only type-check)
- [ ] Optional: hoist the guarded `ResizeObserver` stub into `client/test/setup.ts`
- Framework install: none.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` (file read: no such key), so it is treated as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | - (sidebar is behind existing `ProtectedRoute`; `NavUser`/sign-out untouched) |
| V3 Session Management | no | - |
| V4 Access Control | no | `/templates` is registered inside the same `ProtectedRoute > AppLayout` route group as every other app page |
| V5 Input Validation | minimal | Only compile-time constants and the existing `encodeURIComponent(variant.id)` in `navigate`; no user input is added |
| V6 Cryptography | no | - |
| V14 Config / client-side hardening | yes | External links `target="_blank"` **with** `rel="noopener noreferrer"` (reverse-tabnabbing); version injected via `JSON.stringify` (no string-concatenated JS) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reverse tabnabbing from outbound links | Tampering / Spoofing | `rel="noopener noreferrer"` on both links (assert in unit tests) |
| Version/fingerprint disclosure | Information disclosure | Accepted: the semver is a public release number shown only to authenticated users; no build SHA, no host info (D-02 forbids a dev marker/git override) |
| Open redirect via hrefs | Tampering | hrefs are module constants, never derived from API or URL input |

## Sources

### Primary (HIGH confidence) - read this session
- Repo files: `client/src/components/app-sidebar.tsx`, `nav-user.tsx`, `app-layout.tsx`, `ui/sidebar.tsx` (State/Provider 40-141, Sidebar 143-239, GroupLabel 385-404, MenuButton 465-535), `ui/button.tsx` (size variants), `ui/tooltip.tsx`, `common/brand-logo.tsx`, `common/empty-state.tsx`, `common/layout/page.tsx`, `domain/template/template-grid.tsx`, `template-card.tsx`, `routes/app/stacks/templates.tsx`, `components/template-repo-alerts.tsx`, `router.tsx`, `hooks/use-templates.ts`, `hooks/use-mobile.ts`, `lib/templates-api.ts`, `lib/docs-links.ts`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `src/assets.d.ts`, `test/setup.ts`, `test/unit/components/nav-user.test.tsx`, `app-layout.test.tsx`, `test/unit/routes/stacks/templates-page.test.tsx`, `test/integration/templates.spec.ts`, `mobile.spec.ts`, `fixtures.ts`, `playwright.config.ts`; `Dockerfile` (client-build stage), `.github/workflows/ci.yml`.
- Installed packages: `node_modules/vitest/dist/chunks/cli-api.B7PN_QUv.js` (define handling), `setup-common.Cm-kSBVi.js`, `node_modules/jsdom/lib/jsdom/browser/Window.js` (`innerWidth`), `lucide-react` runtime export check.
- Planning: `19-CONTEXT.md`, `19-UI-SPEC.md`, `REQUIREMENTS.md` (UI-01/06/07), `ROADMAP.md` Phase 19.

### Secondary (MEDIUM confidence)
- https://vite.dev/config/shared-options#define - dev globals vs build replace; JSON-serializable; `declare const` recommendation (fetched via WebFetch).
- https://vitest.dev/config/ - top-level (not `test:`) placement of Vite options (fetched via WebFetch).

### Tertiary (LOW confidence)
- None beyond items in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from `node_modules`.
- Architecture: HIGH - every integration point read from source; Vitest `define` behaviour confirmed in the installed source, not only docs.
- Pitfalls: HIGH for 1-3, 5 (partly ASSUMED A2), 7-9; MEDIUM for the tooltip+dropdown nesting (A1) which only a real browser can confirm.

**Research date:** 2026-10-18
**Valid until:** 2026-11-17 (stable stack; re-check only if shadcn `sidebar.tsx` is regenerated or Vite/Vitest major-bumps)
