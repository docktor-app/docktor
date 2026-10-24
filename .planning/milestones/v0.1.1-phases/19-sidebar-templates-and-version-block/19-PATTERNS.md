# Phase 19: Sidebar, Templates and Version Block - Pattern Map

**Mapped:** 2026-10-18
**Files analyzed:** 22 (client workspace only)
**Analogs found:** 21 / 22 (all analog paths are git-tracked)

Overrides: CONTEXT D-03 (`DOCS_HOME_URL = "https://getdocktor.dev"`) supersedes UI-SPEC D-07. `size="icon-sm"` (32px) not `size="icon"` (36px). All paths below are relative to `client/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/lib/sidebar-nav.ts` (new) | utility (pure model + helper) | transform | `src/lib/docs-links.ts` | role-match |
| `src/lib/project-links.ts` (new) | config/constants | n/a | `src/lib/docs-links.ts` (`DOCS_BASE_URL`) | role-match |
| `src/lib/app-version.ts` (new) | config/constant | n/a | `src/lib/docs-links.ts` | partial |
| `src/globals.d.ts` (new) | config (ambient types) | n/a | `src/assets.d.ts` | exact |
| `vite.config.ts` (edit) | config | build | itself | n/a |
| `vitest.config.ts` (edit) | config | build | `vite.config.ts` | exact |
| `src/components/sidebar-version-block.tsx` (new) | component (app-shell) | request-response (props-driven) | `src/components/nav-user.tsx` | exact |
| `src/components/app-sidebar.tsx` (edit) | component | request-response | itself + `nav-user.tsx` | exact |
| `src/routes/app/stacks/components/templates-page-header.tsx` (new) | component (section) | request-response | `BREADCRUMB`/header in `src/routes/app/stacks/templates.tsx` | exact |
| `src/routes/app/stacks/templates.tsx` (edit) | route/page | CRUD read | itself | exact |
| `src/router.tsx` (edit) | route | n/a | line 59 `/stacks/create/templates` | exact |
| `test/unit/lib/sidebar-nav.test.ts` (new) | test | transform | `test/unit/lib/docs-links.test.ts` | exact |
| `test/unit/lib/app-version.test.ts` (new) | test | n/a | `test/unit/lib/docs-links.test.ts` | role-match |
| `test/unit/lib/project-links.test.ts` (new) | test | n/a | `test/unit/lib/docs-links.test.ts` | role-match |
| `test/unit/components/app-sidebar.test.tsx` (new) | test | component | `test/unit/components/nav-user.test.tsx` | exact |
| `test/unit/components/sidebar-version-block.test.tsx` (new) | test | component | `test/unit/components/nav-user.test.tsx` | exact |
| `test/unit/routes/stacks/templates-page.test.tsx` (extend) | test | component | itself | exact |
| `test/unit/router.test.tsx` (optional) | test | n/a | none (see below) | none |
| `test/integration/sidebar.spec.ts` (new) | test (e2e) | e2e | `test/integration/mobile.spec.ts`, `templates.spec.ts` | role-match |
| `test/integration/mobile.spec.ts` (extend) | test (e2e) | e2e | sidebar test at line 271 | exact |
| `test/integration/templates.spec.ts` (extend) | test (e2e) | e2e | itself | exact |

## Pattern Assignments

### `src/components/app-sidebar.tsx` (edit)

Current structure (lines 1-70): imports, hard-coded `navItems`, `startsWith` active check (line 45, replace), `<Sidebar>` with default offcanvas.

Keep: `export function AppSidebar` name (`app-layout.test.tsx` mocks it). Keep import style (`@/components/ui/sidebar`, `@/components/common/brand-logo`).

Change to:
```tsx
const {setOpenMobile} = useSidebar();
<Sidebar collapsible="icon">
  <SidebarHeader>
    <div className="px-2 py-2">
      <h1>
        <span className="group-data-[collapsible=icon]:hidden"><BrandLogo className="h-7 w-auto"/></span>
        <span className="hidden group-data-[collapsible=icon]:block"><BrandLogo variant="mark" className="size-8"/></span>
      </h1>
    </div>
  </SidebarHeader>
  <SidebarContent>
    {NAV_SECTIONS.map((section) => (
      <SidebarGroup key={section.label}>
        <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>
          {section.items.map((item) => {
            const active = isNavItemActive(location.pathname, item.to);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link to={item.to} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                    <item.icon/><span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>);
          })}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
    ))}
  </SidebarContent>
  <Separator />
  <SidebarFooter>
    <SidebarVersionBlock version={APP_VERSION} links={{github: GITHUB_URL, docs: DOCS_HOME_URL}}/>
    <NavUser/>
  </SidebarFooter>
</Sidebar>
```
Verify `BrandLogo` has a `variant` prop (`src/components/common/brand-logo.tsx`; renders two imgs, light+dark). Any new test rendering this needs `SidebarProvider` (useSidebar throws outside).

### `src/components/sidebar-version-block.tsx` (new; component, props-driven)

**Analog:** `src/components/nav-user.tsx`. Copy the dropdown composition (lines 94-131 of that file):
```tsx
<SidebarMenu><SidebarMenuItem>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">...
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
      <DropdownMenuItem asChild><Link to="/account">...</Link></DropdownMenuItem>
```
Adapt: trigger is `SidebarMenuButton tooltip={\`Docktor v${version}\`} aria-label=... ` with `Info` icon; content uses `side="right"`, `DropdownMenuLabel`, `DropdownMenuSeparator`, and `DropdownMenuItem asChild` > `<a href target="_blank" rel="noopener noreferrer">` with `Github` / `BookOpen` icons. Imports follow nav-user.tsx lines 1-6 (group lucide, then `@/components/ui/*`).

Visibility polarity (RESEARCH Pattern 4): expanded row wrapper `group-data-[collapsible=icon]:hidden`; collapsed `SidebarMenu` wrapper `hidden group-data-[collapsible=icon]:flex`. Do not invert (mobile has no `data-collapsible` ancestor).

Expanded link buttons: `<Button asChild variant="ghost" size="icon-sm" className="max-md:size-11"><a .../></Button>` (`icon-sm` = `size-8` in `ui/button.tsx`). Labels: `Docktor on GitHub (opens in a new tab)`, `Docktor documentation (opens in a new tab)`; must not contain "name" (templates.spec uses `getByLabel(/name/i)`). Props: `SidebarVersionBlockProps` with `Readonly<>`. Empty `version` renders `Docktor` without `v`. Version text: `truncate text-xs tabular-nums text-sidebar-foreground/70`.

### `src/lib/sidebar-nav.ts` (new)

Use the RESEARCH Pattern 2 code verbatim (`NAV_SECTIONS`, `isNavItemActive`, optional trailing-slash normalise). Analog for style (pure module with exported type + pure builder, JSDoc above function): `src/lib/docs-links.ts` lines 326-334:
```ts
export function buildDocsUrl(style: DocsLinkStyle, base: string, page: DocsPage, anchor?: string): string {
```
Explicit return types on exports.

### `src/lib/project-links.ts` / `src/lib/app-version.ts` (new)

**Analog:** `src/lib/docs-links.ts` line 320 `export const DOCS_BASE_URL = "https://github.com/docktor-app/docks/blob/main";` and its header comment style. Constants: `GITHUB_URL = "https://github.com/docktor-app/docktor"`, `DOCS_HOME_URL = "https://getdocktor.dev"`. `app-version.ts`: `export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";` with comment pointing to the config `define`. Do NOT touch `docs-links.ts` (D-04).

### `src/globals.d.ts` (new)

**Analog:** `src/assets.d.ts` (ambient script file, no import/export):
```ts
declare module "*.svg" {
    const src: string;
    export default src;
}
```
New: `declare const __APP_VERSION__: string;`. `tsconfig` includes `src` only, so it must live under `src/`.

### `vite.config.ts` and `vitest.config.ts` (edit; identical change)

Both configs are separate (vitest.config.ts does not merge vite.config.ts). Add to each, at top level of `defineConfig` (not inside `test:`):
```ts
import {readFileSync} from "node:fs";
const {version} = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {version: string}; // package.json always has version
export default defineConfig({
    define: {__APP_VERSION__: JSON.stringify(version)},
    plugins: [...
```
Existing import style: `import * as path from "node:path";` (both files line 4/3).

### `src/routes/app/stacks/templates-page-header.tsx` -> `src/routes/app/stacks/components/templates-page-header.tsx` (new)

**Analog:** header block in `src/routes/app/stacks/templates.tsx` lines 151-161 (BREADCRUMB) and 191-193:
```tsx
<PageHeader breadcrumbs={BREADCRUMB}>
    <PageTitle>Start from a Template</PageTitle>
</PageHeader>
```
Move into the component with prop `variant: "catalog" | "create-flow"`. Create-flow keeps existing breadcrumb and title with no description. Catalog: breadcrumb `<BreadcrumbItem><BreadcrumbPage>Templates</BreadcrumbPage></BreadcrumbItem>` only, title `Templates`, `PageDescription` "Browse the catalog and start a stack from a ready-made template." (wrap title+description in one `<div>`). Import `PageDescription` from `@/components/common/layout/page`. Sibling location/import for section components: `@/routes/app/stacks/components/template-repo-alerts` (templates.tsx line 142).

### `src/routes/app/stacks/templates.tsx` (edit; target <= ~80 lines)

Keep `handleUse`, `handleRetry`, loading and variant dialog unchanged (lines 174-187, 206-229). Add:
```tsx
const {pathname} = useLocation();
const variant = pathname.startsWith("/stacks/create") ? "create-flow" : "catalog";
...
<TemplatesPageHeader variant={variant}/>
```
Replace TemplateGrid render (line 216) with: if `catalog.templates.length === 0 && !catalog.repos.some(r => r.lastSyncError)` render `<EmptyState heading="No templates available">Add a template repository in <Link to="/settings/stacks">Settings</Link> to populate the catalog, or <Link to="/stacks/create">start from a blank compose file</Link>.</EmptyState>` else `<TemplateGrid .../>`. `TemplateRepoAlerts` still renders above. `EmptyState` analog: `src/components/common/empty-state.tsx` (children wrapped in `<p>`, so inline Links are valid). Remove now-unused breadcrumb imports.

### `src/router.tsx` (edit)

Line 59 pattern: `<Route path="/stacks/create/templates" element={<TemplateBrowsePage />} />`. Add beside it/after stacks routes inside the same AppLayout group: `<Route path="/templates" element={<TemplateBrowsePage />} />`.

### Tests (unit)

**`test/unit/lib/sidebar-nav.test.ts`, `app-version.test.ts`, `project-links.test.ts`:** style from `test/unit/lib/docs-links.test.ts`:
```ts
import {describe, expect, it} from "vitest";
import {buildDocsUrl, DOCS_BASE_URL, docsUrl} from "@/lib/docs-links";
describe("...", () => { it("...", () => { expect(...).toBe(...); }); });
```
Cover every row of the UI-SPEC active table plus `/stacks-foo`, `/templates` not Stacks, `/stacks/create/templates` not Templates, trailing slash. `app-version.test.ts`: `APP_VERSION` equals `JSON.parse(readFileSync("package.json")).version`.

**`app-sidebar.test.tsx`, `sidebar-version-block.test.tsx`:** copy `nav-user.test.tsx` lines 1-26 exactly:
```tsx
const {signOut} = vi.hoisted(() => ({signOut: vi.fn()}));
vi.mock("@/lib/auth-client", () => ({
    signOut,
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
}));
render(<MemoryRouter initialEntries={[...]}><SidebarProvider><AppSidebar/></SidebarProvider></MemoryRouter>);
await user.click(screen.getByRole("button", {name: /.../}));
const item = await screen.findByRole("menuitem", {name: "..."});
expect(item).toHaveAttribute("href", "...");
```
(version block test does not need the auth mock.) Add the guarded ResizeObserver stub from `templates-page.test.tsx` lines 20-26 when hovering tooltips. jsdom has no CSS: assert class tokens (`toHaveClass("group-data-[collapsible=icon]:hidden")`), not visibility. Do not use singleton `getByRole("img")` (four logo imgs). Mobile: `Object.defineProperty(window, "innerWidth", {configurable: true, value: 500})` before render, open with `user.keyboard("{Control>}b{/Control}")`, restore in `afterEach`.

**`templates-page.test.tsx` (extend):** existing harness (lines 1-26: mocked `useTemplates`, mocked `useNavigate`, `SidebarProvider` + `MemoryRouter`). Give `renderPage` an `initialEntries` argument; add tests at `/templates` and `/stacks/create/templates` for title, breadcrumb, description, empty state, and that empty state is absent when a repo has `lastSyncError`.

### Tests (e2e, CI only)

`mobile.spec.ts` line 271 test ("sidebar: the trigger opens the mobile navigation and Stacks navigates", uses `getByRole("button", {name: "Toggle Sidebar"})` then dialog) is the analog; new mobile checks (labels, version, both links, 44px via `boundingBox`, internal nav closes dialog, `expectNoHorizontalOverflow`) go in this file because `mobile-chromium` matches only `(mobile|two-factor)` specs. Desktop collapsed-rail and Templates journey go in a new `sidebar.spec.ts` and `templates.spec.ts`, following their existing fixtures (`fixtures.ts` `_apiRouteGuard` aborts unstubbed `/api/**`; no new API calls added).

## Shared Patterns

### SidebarProvider context
Anything calling `useSidebar()` (AppSidebar, SidebarVersionBlock, NavUser) must be under `SidebarProvider` in tests (`nav-user.test.tsx` lines 17-23).

### External links
`target="_blank" rel="noopener noreferrer"` on every outbound anchor; hrefs from `project-links.ts` only; assert in unit tests.

### Theme and typography
Theme variables only (`text-sidebar-foreground/70`, `hover:bg-sidebar-accent`); no literal color utilities (so no `dark:` needed); sizes 12/14 and weights 400/600 only.

### Imports
Client uses `@/` alias, grouped external -> workspace -> local; `Readonly<Props>` with `<Component>Props` names; explicit return types on exported functions.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `test/unit/router.test.tsx` (optional) | test | No existing unit test imports `@/router`; RESEARCH Code Examples gives a `matchRoutes(router.routes, path)` sketch (assumption A3). Cover via Playwright if heavy. |

## Metadata

**Analog search scope:** `client/src/components`, `client/src/lib`, `client/src/routes/app/stacks`, `client/test/unit`, `client/test/integration`, client configs
**Tracked-source check:** `git ls-files` confirmed `app-sidebar.tsx`, `nav-user.tsx`, `empty-state.tsx`, `docs-links.test.ts` are tracked; no mirror paths used.
**Pattern extraction date:** 2026-10-18
