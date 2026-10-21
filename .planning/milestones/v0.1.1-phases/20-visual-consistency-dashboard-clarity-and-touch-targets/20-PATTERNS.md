# Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 22 (new + modified, grouped)
**Analogs found:** 22 / 22
**Note:** All paths below are git-tracked source (checked via ls-files for the key ones). Line numbers are relative to the files as read this session. Full call-site lists, collision matrix and test-rewrite list live in 20-RESEARCH.md (Patterns 1-7, collision matrix, mono checklist) and are not repeated here.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `client/src/lib/status-labels.ts` (NEW) | utility | transform | `client/src/components/domain/stack/stack-status-badge.tsx` + `lib/health-format.ts` (imports `Tone` type) | exact |
| `client/src/components/domain/stack/stack-status-badge.tsx` (MOD) | component | transform | itself (re-export maps) | exact |
| `client/src/components/domain/stack/service-status-badge.tsx` (MOD) | component | transform | itself | exact |
| `client/src/lib/touch-target.ts` (NEW) | utility | transform | `client/src/components/sidebar-version-block.tsx` (`max-md:size-11`), `lib/service-color.ts` | role-match |
| `client/src/components/common/form-layout.tsx` (NEW) | component | request-response | `client/src/components/common/stat-card.tsx` (generic common-component style) | role-match |
| `client/src/components/common/data/table/data-table.tsx` (MOD) | component | CRUD (read) | itself | exact |
| `.../table/table-content.tsx` (MOD) | component | transform | itself | exact |
| `.../table/table-frame.tsx` (NEW) | component | transform | `table-content.tsx` desktop branch | role-match |
| `.../table/sortable-head.tsx` (NEW) | component | event-driven | `routes/app/storage/components/storage-stacks-table.tsx` `SortableHead` | exact (lift) |
| `.../table/table-pagination.tsx` (MOD) | component | event-driven | itself | exact |
| `client/src/components/common/stat-card.tsx` (MOD, `hint`, mono) | component | transform | itself | exact |
| `client/src/lib/dashboard-stats.ts` (MOD) | utility | transform | itself | exact |
| `client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx` (MOD) | component | transform | itself | exact |
| `client/src/lib/stacks-api.ts` (MOD, `hasBackup?`) | service (API client) | request-response | itself | exact |
| `client/src/hooks/use-stacks.ts` (MOD) | hook | event-driven (SSE) | itself (`stack_status` branch) | exact |
| `server/src/repositories/backup-repository.ts` (MOD) | repository | CRUD (read) | `repositories/service-health-event-repository.ts` `groupBy` | exact |
| `server/src/application/stack-service.ts` (MOD) + `application/index.ts` | service | request-response | `StackEventReadRepo` / `ImageUpdateCheckReadRepo` ports | exact |
| `client/src/components/domain/stack/stack-breadcrumb.tsx` (NEW) | component | request-response | `routes/app/stacks/backups/components/backup-detail-header.tsx` | exact |
| `stack-detail-header.tsx`, `backup-detail-header.tsx` (MOD) | component | request-response | each other | exact |
| `client/src/routes/app/stacks/components/stack-tab-bar.tsx` (NEW) + `[id].tsx` (MOD) | component | event-driven | `routes/app/stacks/[id].tsx` lines 52-60 | exact (extract) |
| `client/src/index.css` (MOD) | config | n/a | itself (`@theme inline`) | exact |
| Touch-target sites: `stack-actions.tsx`, `theme-toggle.tsx`, `certificates-card.tsx`, `table-pagination.tsx` | component | event-driven | `theme-toggle.tsx` (already compliant) / `sidebar-version-block.tsx` | exact |
| Form adopters (`login-form.tsx`, signup, setup steps, dialogs) | component | request-response | `routes/auth/components/login-form.tsx` | exact |

## Pattern Assignments

### `client/src/lib/status-labels.ts` (utility, transform)

**Analog:** `components/domain/stack/stack-status-badge.tsx` (maps) and `service-status-badge.tsx` (service rules).

**Type import precedent** (`lib/health-format.ts` line 1): `import type {Tone} from "@/components/common/tone-badge";`

**Map to move and derive labels from** (stack-status-badge.tsx 12-36):
```typescript
const STACK_STATUS_PRESENTATION: Record<string, StackStatusPresentation> = {
    DRAFT: {label: "Draft", tone: "neutral", dotPulse: false, badgePulse: false},
    BACKING_UP: {label: "Backing Up", tone: "blue", dotPulse: false, badgePulse: true},
    // ...
};
export function getStackStatusPresentation(status: string): StackStatusPresentation {
    return STACK_STATUS_PRESENTATION[status] ?? {label: status, tone: "neutral", dotPulse: false, badgePulse: false};
}
```
Change: store only `{tone, dotPulse, badgePulse}`; `label = formatStatusLabel(status)` for every path including the unknown fallback.

**Service rules to move** (service-status-badge.tsx 77-112): the `containerState`/`healthStatus` if-chain; final fallback `label: containerState` becomes `formatStatusLabel(containerState)`. Keep `"unknown"` for null.

**Core:** `export function formatStatusLabel(raw: string): string { return raw.replaceAll("_", " ").toLowerCase(); }`

**Badge files:** keep `StackStatusBadge`/`ServiceStatusBadge` components; `export {getStackStatusPresentation} from "@/lib/status-labels"` so existing test imports keep working. Also call `formatStatusLabel` directly in `activity-timeline.tsx:130` and `services-section.tsx:158,169`. Test: new `client/test/unit/lib/status-labels.test.ts` (casing rule, underscore, unknown, empty string).

---

### `client/src/lib/touch-target.ts` (utility)

**Analog:** `components/sidebar-version-block.tsx` lines 34/47/63: `max-md:h-11`, `className="max-md:size-11 hover:bg-..."`; asserted by `test/unit/components/sidebar-version-block.test.tsx:51-52` (`toHaveClass("size-8", "max-md:size-11")`).

**Existing duplicated literal to replace:** `"min-h-11 min-w-11 md:min-h-9 md:min-w-9"` in `theme-toggle.tsx:274`, `services-section.tsx`, `proxy-domains-table.tsx`, `storage-stacks-table.tsx` (`const TOUCH_TARGET`, line 20), `env-editor.tsx`.

```typescript
// Applied via cn(): tailwind-merge drops Button's own size-9 / size-8.
export const TOUCH_TARGET_ICON = "size-11 md:size-9";
export const TOUCH_TARGET_ICON_SM = "size-11 md:size-8";
```
Apply: `stack-actions.tsx` trigger (`<Button variant="outline" size="icon" aria-label="Stack actions">`), `certificates-card.tsx` delete (`size="icon"` ghost), pagination four buttons (replace `className="h-8 w-8"` with `TOUCH_TARGET_ICON_SM`, add `aria-label`s) and rows-per-page `SelectTrigger`. Tests assert class tokens only; real 44px proof is Playwright bounding box on the phone project.

---

### `client/src/components/common/form-layout.tsx` (component, layout)

**Analog:** `components/common/stat-card.tsx` (generic, no domain props, `Readonly<Props>`, `cn()`):
```typescript
export interface StatCardProps { label: string; ... valueClassName?: string; }
export function StatCard({...}: Readonly<StatCardProps>) { ... cn("text-2xl ...", valueClassName) ... }
```
**Adopter baseline** (`routes/auth/components/login-form.tsx` 112-143): `<Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4"><FormField ... render={({field}) => (<FormItem><FormLabel>..</FormLabel><FormControl><Input/></FormControl><FormMessage/></FormItem>)}/>` with the submit Button inside the same `space-y-4`.
Design (RESEARCH Pattern 6): `FormStack` = `flex flex-col gap-4` (optionally `[&_[data-slot=form-item]]:gap-2.5` to widen label-to-input without touching `ui/form.tsx`, whose `FormItem` is `grid gap-2`); `FormActions` = `flex items-center gap-2 pt-2` with `align?: "start"|"end"`. Replace `className="space-y-4"` on the `<form>`. Wizard steps: `CardContent` wraps `FormStack`, `CardFooter` holds actions. `certificates-card.tsx` upload uses `space-y-1` around bare `Label`+`Input` and must move to the stack. Tests: class-token unit test per primitive. No Settings-card react-hook-form migration.

---

### `components/common/data/table/*` (UI-08)

**Analog:** the files themselves.

**Current desktop render to wrap** (table-content.tsx 146-175): `<Table><TableHeader><TableRow>{columns.map(col => <TableHead key={col.name}>{col.name}</TableHead>)}</TableRow></TableHeader><TableBody>{data.map(... <TableRow className={itemRoute ? "cursor-pointer" : ""} onClick={itemRoute ? () => navigate(itemRoute(item)) : undefined}> ...`
Change: wrap in new `TableFrame` (`rounded-md border`, overflow-hidden as needed); header tint on `TableHeader`/`th` via `[&_th]:bg-muted/50` NOT on the `<tr>` (storage test filters rows by `bg-muted/50`, see RESEARCH Pattern 3); row `hover:bg-muted/30`.
**Mobile card branch** (table-content.tsx 112-144) stays; action columns need unique `name` even with `hideHeader`.
**DataTable props to extend** (data-table.tsx 7-22): add column `className/headerClassName/hideHeader/sortValue`, controlled `sort?: {direction, onToggle}`, `renderExpanded`/`isExpanded`/`onToggleExpand`, `footer`; make `emptyMessage` required + `emptyDescription`. `pagination` defaults `true` (line 35): migrated unpaginated tables must pass `pagination={false}`. DataTable uses `useSearchParams` (line 38) and TableContent uses `useNavigate`, so migrated consumers' tests need `MemoryRouter`.
**SortableHead lift** (storage-stacks-table.tsx 22-50): `TableHead aria-sort={ariaSortFor(sort, sortKey)}` + ghost `Button size="sm"` with `-ml-2` and `ArrowUp/ArrowDown/ArrowUpDown` icon; preserve storage's two-state natural-direction, null-last, name-tiebreak semantics via controlled mode (`lib/storage-view.ts` keeps `nextStorageSort`/`sortStorageStacks`).
**Pagination** (table-pagination.tsx 244-279): four `Button variant="outline" size="icon" className="h-8 w-8"`; replace with `TOUCH_TARGET_ICON_SM`, add `aria-label` ("First page", "Previous page", "Next page", "Last page"); `SelectTrigger className="h-8 w-[70px]"` gets a 44px mobile height.
Proxy-domains aggregation stays in the consumer (pass groups as `data`). Keep scroll wrappers (`incident-list` `max-h-96 overflow-y-auto`, `backup-history` `ScrollArea`) outside `TableFrame`. Re-export `TableRow`/`TableCell` from the table module so consumers never import `@/components/ui/table`.

---

### `stat-card.tsx`, `dashboard-stats.ts`, `dashboard-stat-cards.tsx` (DASH-01/02, UI-03)

**Analog:** themselves.
**StatCard to edit** (stat-card.tsx 20, 28): label span `text-sm font-normal text-muted-foreground` -> `font-mono text-xs` (allow wrap, icon `shrink-0`); value div `cn("text-2xl font-semibold tabular-nums truncate", valueClassName)` -> add `font-mono` (existing test asserts `truncate`, `font-semibold`, no `font-bold`). Add generic `hint?: string` prop (no domain vocabulary).
**Stats** (dashboard-stats.ts 56-62, 79): keep `hasEffectiveBackupSchedule`; rename `backupsConfigured` -> `backupCoverage` and:
```typescript
const covered = hasEffectiveBackupSchedule(stack.backupSchedule, globalDefaultSchedule) || stack.hasBackup === true;
if (covered) backupCoverage += 1;
```
Card value `` `${stats.backupCoverage}/${stats.total}` ``, label "Backup Coverage"; preserve the em-dash error behaviour. `computeDashboardStats` stays pure. Update existing "Backups Configured" tests.

---

### `server/src/repositories/backup-repository.ts` (repository, CRUD read)

**Analog:** `repositories/service-health-event-repository.ts` 75-78 (`prisma.serviceHealthEvent.groupBy({by: ["serviceName"], where: {stackId}})`) and the file's own style (JSDoc per method, imports `prisma` from `../lib/db.js`).
```typescript
/** Stack ids with at least one completed backup or scheduled run -- a restore is not a snapshot. */
async findStackIdsWithSnapshot(): Promise<Set<string>> {
    const rows = await prisma.backup.groupBy({
        by: ["stackId"],
        where: {status: "COMPLETED", trigger: {in: ["MANUAL", "SCHEDULED"]}},
    });
    return new Set(rows.map((row) => row.stackId));
}
```

### `server/src/application/stack-service.ts` + `application/index.ts` (service)

**Analog:** ports `StackEventReadRepo` (stack-service.ts line 31) and `ImageUpdateCheckReadRepo` (line 50); application layer must not import `lib/db.js` (enforced by `server/test/unit/architecture/layering.test.ts`).
**Constructor** (lines 131-141): currently 10 args ending `stateCatchUp: StackStateCatchUp`; append an 11th `private readonly backups: StackBackupReadRepo`.
**Current listStacks** (209-214):
```typescript
const all = await this.repo.findAll();
const {showInDashboard} = await this.settings.getProxySettings();
const filtered = showInDashboard ? all : all.filter((s) => !s.isProtected);
return this.withServiceUpdateInfo(filtered.map((stack) => toStackSizeDto(stack)));
```
Change: fetch ids in parallel, map result to `{...stack, hasBackup: ids.has(stack.id)}` (only list, not detail).
**Wiring** (index.ts line 95): `new StackService(repo, fs, docker, stackEventRepository, domainEventBus, settingsService, imageUpdateCheckRepository, composeReviewService, deployPreflightService, containerStateCatchUp)` -> append `backupRepository` (already imported). Other construction site: `server/test/unit/application/stack-service.test.ts:148`. Tests: unit (mock port, true/false/none), repo unit, and CI-only integration for `GET /api/stacks`.

---

### `client/src/hooks/use-stacks.ts` (hook, event-driven)

**Analog:** itself, lines 61-69. Current `stack_status` branch patches only `status`:
```typescript
} else if (event.type === "stack_status") {
    setStacks(prev => prev.map(stack => stack.id === event.stackId ? {...stack, status: event.stackStatus} : stack));
} else if (event.type === "config_changed" || ...) {
    void fetchStacks("background");
}
```
Add: when the previous status was `BACKING_UP` and the new one is not, also `void fetchStacks("background")` so `hasBackup` flips without reload.

---

### `stack-breadcrumb.tsx` (domain component) and the two headers

**Analog:** `backup-detail-header.tsx` 210-234 (correct `/stacks/${stackId}` link, `Link asChild` inside `BreadcrumbLink`, `BreadcrumbSeparator`, `BreadcrumbPage` last). Imports from `@/components/ui/breadcrumb` and `react-router`.
**Bug to fix** (`stack-detail-header.tsx` 135): `` to={`/stacks/${stack.id}${activeTab !== "overview" ? `/${activeTab}` : ""}`} `` -> `/stacks/${stack.id}`.
Props: `stackId`, `stackName`, `trail?: {label, to}[]`, `current`. Detail header: `current={STACK_TAB_LABELS[activeTab]}`; backup header: `trail=[{label:"Backups", to:`/stacks/${stackId}/backups`}]`, `current={crumb}`. `stack-page-state.tsx` keeps its static crumb. Rewrite Playwright "WR-01 regression" in `client/test/integration/stacks.spec.ts` (now expects `href="/stacks/my-app"`). Note `UnsavedChangesGuard isSameContext` treats tab->overview as same context (no prompt); record this.

---

### `stack-tab-bar.tsx` (NEW) and `[id].tsx` (section component, event-driven)

**Analog:** `[id].tsx` 52-60:
```tsx
<Tabs value={activeTab} onValueChange={(v) => navigate(`/stacks/${id}/${v}`)}>
    <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="w-max">
            {STACK_TABS.map((t) => (<TabsTrigger key={t} value={t}>{STACK_TAB_LABELS[t]}</TabsTrigger>))}
```
Wrapper -> `-mx-1 -my-1 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. Add `useEffect([activeTab])` calling `wrapperRef.current?.querySelector('[role="tab"][data-state="active"]')?.scrollIntoView?.({inline:"nearest", block:"nearest"})` (optional call, jsdom lacks it). The page is already ~100 lines; move the tab bar out. Existing `mobile.spec.ts:388-392` must keep passing. Playwright: `scrollHeight <= clientHeight` at desktop/tablet/phone.

---

### `client/src/index.css` (config)

**Analog:** itself. Line 1 starts `@import "tailwindcss";`; `@theme inline {` block begins line 6 with `--radius-*`/`--color-*` tokens. Add `@import "@fontsource-variable/geist-mono";` as the first line and `--font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;` in that block. Add dependency with `yarn workspace @docktor/client add @fontsource-variable/geist-mono`. Mono call sites: see RESEARCH "Explicit monospace call-site checklist" (items 1-10; items 8 and 11 have nothing to change).

## Shared Patterns

### Pure presentation maps with unit tests
**Source:** `stack-status-badge.tsx` / `service-status-badge.tsx` (never throw on unknown). **Apply to:** `status-labels.ts`.

### Dark-mode pairing and pills
**Source:** CLAUDE.md. Every light-only colour utility needs `dark:`; pills via `ToneBadge` + `StatusDot` only (swap `Badge` pills in `notification-log-card.tsx` and the "Expiring soon" badge in `certificates-card.tsx` when touched).

### Generic `components/common/` contract
**Source:** `stat-card.tsx` (`Readonly<Props>`, `cn()`, no domain vocabulary, no hooks). **Apply to:** `FormStack`, `FormActions`, `TableFrame`, `SortableHead`, `StatCard.hint`.

### Layering (server)
**Source:** `StackEventReadRepo` ports in `stack-service.ts`; Prisma only in repositories; relative `.js` imports.

### Never edit `components/ui/*`
Restyle via `className` at call sites or in `components/common/`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | | | Every new file has an in-repo analog; font hosting has no precedent (no `@fontsource*` installed) so follow RESEARCH "Code Examples" for the CSS import. |

## Metadata

**Analog search scope:** `client/src/{components,lib,hooks,routes}`, `server/src/{repositories,application}`; 20-RESEARCH.md was read to line 431 of 639 (remaining sections: validation/security/open questions) and 20-UI-SPEC.md was not re-read since RESEARCH quotes its rules R-01..R-09 in full.
**Pattern extraction date:** 2026-10-20
