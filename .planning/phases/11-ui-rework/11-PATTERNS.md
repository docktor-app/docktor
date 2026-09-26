# Phase 11: UI Rework - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 24 (new + modified)
**Analogs found:** 24 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `client/src/hooks/use-stack-timeline.ts` | hook | transform | `client/src/hooks/use-stack.ts` (not read in full — cited via RESEARCH.md L241-269) | role-match |
| `client/src/components/domain/stack/stack-timeline.tsx` | component | CRUD (list render) | `client/src/routes/app/stacks/[id].tsx` Recent Deployments table (L259-308) + `event-log-card.tsx`/`status-log-card.tsx` | role-match |
| `client/src/components/domain/stack/status-pill.tsx` | component | transform | `client/src/components/domain/stack/stack-status-badge.tsx` (full file) | exact |
| `client/src/components/domain/stack/service-update-badge.tsx` | component | transform | `client/src/components/domain/stack/stack-list.tsx` config-changed pill (L36-40) | exact |
| `client/src/lib/service-color.ts` | utility | transform | `client/src/components/domain/stack/log-viewer.tsx` `getServiceColor()` (L13-32) | exact (verbatim extraction) |
| `client/src/components/domain/stack/log-terminal.tsx` | component | streaming | `client/src/components/domain/stack/log-viewer.tsx` terminal block (L143-164) | role-match |
| `client/src/components/common/theme-provider.tsx` | provider | event-driven | none in-repo — `next-themes` README pattern; wiring precedent: `client/src/main.tsx` provider nesting (Toaster/BrowserRouter) | no analog |
| `client/src/components/common/theme-toggle.tsx` | component | event-driven | `client/src/components/common/layout/page.tsx` `SidebarTrigger` usage in `PageHeader` (L28-29) | role-match |
| `client/src/components/common/stat-card.tsx` | component | transform | `client/src/routes/app/dashboard.tsx` inline stat `Card` block (L51-65, one of four) | exact |
| `client/src/routes/app/dashboard.tsx` (modified) | component (page) | request-response | itself (current L1-134) | exact (self) |
| `client/src/routes/app/stacks/[id].tsx` (modified) | component (page) | request-response | itself (current L1-390) | exact (self) |
| `client/src/routes/app/stacks/components/config-tab.tsx` | component | CRUD | `client/src/routes/app/stacks/[id].tsx` compose/environment `TabsContent` blocks (L315-365) | role-match |
| `client/src/routes/app/stacks/components/compose-editor.tsx` | component | CRUD | `client/src/routes/app/stacks/[id].tsx` compose `Textarea` block (L316-338) | role-match |
| `client/src/routes/app/stacks/components/env-editor.tsx` | component | CRUD | `client/src/routes/app/stacks/[id].tsx` env `Textarea` block (L342-364); form-array precedent: `proxy-tab.tsx` (`Form`+`standardSchemaResolver`, not fully read this session, cited via RESEARCH.md L327) | role-match |
| `client/src/routes/app/stacks/components/proxy-assign-dialog.tsx` | component | request-response | `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (full file) | exact |
| `client/src/routes/app/stacks/components/backup-schedule-dialog.tsx` | component | request-response | `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (full file) | exact |
| `client/src/routes/app/stacks/backups/[backupId].tsx` (modified) | component (page) | streaming | itself + `log-viewer.tsx` terminal block (L143-164) | role-match |
| `client/src/routes/app/settings/components/smtp-card.tsx` | component | CRUD | `client/src/routes/app/settings.tsx` (not read this session — cited via RESEARCH.md L221, extract L113-332) | role-match |
| `client/src/routes/app/settings/components/notification-triggers-card.tsx` | component | CRUD | `client/src/routes/app/settings.tsx` (RESEARCH.md L332-522) | role-match |
| `client/src/routes/app/settings/components/notification-log-card.tsx` | component | CRUD | `client/src/routes/app/settings.tsx` (RESEARCH.md L522-606) | role-match |
| `client/src/routes/app/settings/components/backup-repository-card.tsx` | component | CRUD | `client/src/routes/app/settings.tsx` (RESEARCH.md L606-834) | role-match |
| `client/src/routes/app/settings/components/backup-defaults-card.tsx` | component | CRUD | `client/src/routes/app/settings.tsx` (RESEARCH.md L834-1091) | role-match |
| `server/src/application/stack-service.ts` (modified: shared `ImageUpdateCheck` join) | service | CRUD | itself, `listStacks()`/`getStack()` (not read this session — cited via RESEARCH.md L94-95, 366) | role-match |
| `client/src/main.tsx` (modified: wrap `ThemeProvider`) | provider wiring | event-driven | itself (current L42-95, `BrowserRouter`/`Toaster` nesting) | exact (self) |

## Pattern Assignments

### `client/src/components/domain/stack/status-pill.tsx` (component, transform)

**Analog:** `client/src/components/domain/stack/stack-status-badge.tsx` (read verbatim, 47 lines)

**Imports pattern:**
```typescript
import {Badge} from "@/components/ui/badge";
```

**Core pattern — status-to-style map** (lines 3-32):
```typescript
const statusColors: Record<string, string> = {
    RUNNING: "bg-green-500/15 text-green-700 border-green-500/25",
    HEALTHY: "bg-green-500/15 text-green-700 border-green-500/25",
    ERROR: "bg-red-500/15 text-red-700 border-red-500/25",
    UNHEALTHY: "bg-red-500/15 text-red-700 border-red-500/25",
    DEPLOYING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    UPDATING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    STOPPED: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    DRAFT: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    BACKING_UP: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
};
```

**Fallback for unknown status** (lines 34-39, error-state pattern per UI-SPEC "unmapped status renders static gray"):
```typescript
export function StackStatusBadge({status}: Readonly<{status: string}>) {
    const config = statusConfig[status] ?? {label: status, variant: "outline" as const};
    const colorClass = statusColors[status] ?? "";
    return <Badge variant={config.variant} className={colorClass}>{config.label}</Badge>;
}
```

**What to change for `status-pill.tsx` (per UI-SPEC Discretion Decision #1):** Add a compact 8px-dot variant (`w-2 h-2 rounded-full`) alongside the existing full-`Badge` variant; only `RUNNING` gets `animate-ping` ripple + solid dot core — reuse this exact `statusColors` green (`bg-green-500` core color) for the pulsing dot, keep `DEPLOYING`/`UPDATING`/`BACKING_UP` on the existing `animate-pulse` blue treatment unchanged for the dot's non-running transitional states.

---

### `client/src/components/domain/stack/service-update-badge.tsx` (component, transform)

**Analog:** `client/src/components/domain/stack/stack-list.tsx` (read verbatim, config-changed pill)

**Exact markup to mirror (D-09 requires pixel-identical placement/styling), lines 36-40:**
```typescript
{stack.configChanged && (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
        config changed
    </span>
)}
```

**Container pattern** (lines 28-42, `flex flex-wrap items-center gap-1` — already handles multiple simultaneous badges, reuse unchanged per UI-SPEC "overflow" row):
```typescript
<div className="flex flex-wrap items-center gap-1">
    <StackStatusBadge status={stack.status} />
    {stack.configError && (<span className="...bg-red-100 text-red-800...">config error</span>)}
    {stack.configChanged && (<span className="...bg-yellow-100 text-yellow-800...">config changed</span>)}
</div>
```

**New badge:** same `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium` shell, **different hue** (per UI-SPEC Color section — not yellow, to stay distinct from config-changed; e.g. blue) and copy branches on D-10: `"Update available → {latestTag}"` vs `"Content updated"` when `latestTag` is null. Place both at `stack-list.tsx`'s Status column (next to config-changed) and at `[id].tsx`'s `PageActions` (next to `StackStatusBadge`, `[id].tsx` L206).

---

### `client/src/lib/service-color.ts` (utility, transform)

**Analog:** `client/src/components/domain/stack/log-viewer.tsx` lines 12-32 (verbatim source to move, read this session)

```typescript
function getServiceColor(serviceName: string): string {
    const colors = [
        "text-cyan-400", "text-yellow-400", "text-pink-400", "text-purple-400",
        "text-orange-400", "text-lime-400", "text-sky-400", "text-rose-400",
        "text-indigo-400", "text-emerald-400",
    ]
    let hash = 0
    for (let i = 0; i < serviceName.length; i++) {
        hash = serviceName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}
```
**Action:** move verbatim to `lib/service-color.ts`, `export function getServiceColor`, update `log-viewer.tsx`'s import to consume it instead of the local definition. Do not alter the palette or hash — D-11 asks for reuse, not a new algorithm.

---

### `client/src/components/domain/stack/log-terminal.tsx` (component, streaming)

**Analog:** `client/src/components/domain/stack/log-viewer.tsx` (read verbatim, 165 lines) — terminal-rendering block only, lines 143-164

```typescript
<div
    data-testid="log-viewer-terminal"
    ref={scrollRef}
    className="bg-black rounded font-mono text-sm text-white h-96 overflow-auto p-2 w-full"
>
    {lines.length === 0 ? (
        <span className="text-gray-500">No log output yet...</span>
    ) : (
        lines.map((line, i) => (
            <div key={i} className={lineWrap ? "break-all" : "whitespace-pre-wrap"}>
                <span className={getServiceColor(line.service)}>[{line.service}]</span>{" "}
                <Ansi>{line.line}</Ansi>
            </div>
        ))
    )}
</div>
```

**Auto-scroll effect to preserve** (lines 67-77):
```typescript
useEffect(() => {
    if (autoScroll && scrollRef.current) {
        const el = scrollRef.current
        if (typeof el.scrollTo === "function") { el.scrollTo(0, el.scrollHeight) }
        else { el.scrollTop = el.scrollHeight }
    }
}, [lines, autoScroll])
```

**Extraction shape (per RESEARCH.md Pattern 2):** props become `{lines: {line: string; service?: string; timestamp?: string}[]; autoScroll: boolean; lineWrap?: boolean; showTimestamps?: boolean; emptyMessage?: string}`; the `[service]` prefix span renders only when `line.service` is defined (backup page has no service). `LogViewer` keeps its toolbar (service `<select>`, connected/disconnected span, lines 84-141) and owns `useLogStream`; it maps `LogLineEvent[]` into `LogTerminal`. `backups/[backupId].tsx` maps its `useBackupStream()` `string[]` into `{line}` objects and renders `<LogTerminal lines={...} autoScroll={isStillStreaming} emptyMessage="Waiting for output…" />` in place of its current `<LogOutput/>` usage (L295-299, not read this session but cited in RESEARCH.md).

---

### `client/src/routes/app/stacks/components/proxy-assign-dialog.tsx` and `backup-schedule-dialog.tsx` (component, request-response)

**Analog:** `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (read verbatim, full 183-line file) — this is the established Dialog-with-form shell in the codebase; copy this shape exactly.

**Imports pattern** (lines 1-23):
```typescript
import {useEffect, useState} from "react";
import {toast} from "sonner";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {ApiError} from "@/lib/api";
```

**Controlled open/onOpenChange props pattern** (lines 25-32):
```typescript
export interface ServiceUpgradeDialogProps {
    readonly stackId: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onUpgraded: () => void;
}
```

**Fetch-state discriminated union + one-fetch-per-open effect** (lines 34-37, 71-76):
```typescript
type FetchState =
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "ready"; data: ServiceTagsResponse};

useEffect(() => {
    if (open) { load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, stackId, serviceName]);
```

**Submit via `toast.promise`, disable during submit** (lines 78-105):
```typescript
function handleConfirm() {
    if (state.status !== "ready" || !selectedTag) return;
    setSubmitting(true);
    toast.promise(
        (async () => {
            try {
                const result = await upgradeService(stackId, serviceName, selectedTag);
                onOpenChange(false);
                onUpgraded();
                return result;
            } finally { setSubmitting(false); }
        })(),
        {
            loading: `Upgrading ${serviceName}...`,
            success: (result) => `...`,
            error: (err: Error) => err?.message ?? "Upgrade failed",
        },
    );
}
```

**Dialog shell / error / loading skeleton** (lines 106-181):
```typescript
<Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Upgrade {serviceName}</DialogTitle>
            <DialogDescription>...</DialogDescription>
        </DialogHeader>
        {state.status === "loading" && (
            <div className="space-y-2" role="status" aria-label="Loading available versions">
                <Skeleton className="h-4 w-2/3" /><Skeleton className="h-9 w-full" />
            </div>
        )}
        {state.status === "error" && (
            <div className="space-y-3">
                <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert>
                <Button variant="outline" size="sm" onClick={load}>Retry</Button>
            </div>
        )}
        {/* ready state content */}
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={isConfirmDisabled}>Upgrade</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
```

**For `proxy-assign-dialog.tsx`:** lift the `<Form {...form}>`/`FormField` block from `proxy-tab.tsx` (not read this session — RESEARCH.md cites lines 289-441, `assignDomainSchema` + `standardSchemaResolver`) into this `DialogContent`, replacing the always-visible Card. Copy per UI-SPEC: trigger "Assign Domain", submit "Save Domain".

**For `backup-schedule-dialog.tsx`:** lift the schedule/retention form state/handlers from `backup-config-card.tsx` (not read this session — RESEARCH.md cites lines 144-249: `useGlobalSchedule`, `schedule`, `useGlobalRetention`, `keepDaily/Weekly/Monthly`, `preHook`, `postHook`, `handleSave`) into this dialog, leaving the slim read-only card + "Edit Schedule" trigger button behind. Copy per UI-SPEC: trigger "Edit Schedule", submit "Save Schedule".

---

### `client/src/components/common/stat-card.tsx` (component, transform)

**Analog:** `client/src/routes/app/dashboard.tsx` (read verbatim, full 134-line file) — one of the four repeated inline Card blocks, e.g. lines 51-65:
```typescript
<Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Total Stacks</CardTitle>
        <Layers className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
        {loading ? (
            <Skeleton className="h-8 w-12" />
        ) : (
            <div className="text-2xl font-bold">{total}</div>
        )}
    </CardContent>
</Card>
```
**Extraction shape (per UI-SPEC Discretion Decision #3):** `StatCard({label, value, icon, valueClassName?, loading}: Readonly<Props>)` in `components/common/`, pure/no domain types. **Typography fix while extracting (per UI-SPEC Typography Exceptions):** change `text-2xl font-bold` → `text-2xl font-semibold` (contract caps weight at Semibold/600, no `font-bold`/700 in new code). `dashboard.tsx` computes and passes all six values itself (existing four + "Updates Available" + "Backups Configured"), same as it already computes `total`/`running`/`stopped`/`errors` (lines 14-21).

---

### `client/src/routes/app/stacks/[id].tsx` (modified — tabs, timeline, config tab)

**Analog:** itself (read verbatim, full 390-line file).

**`VALID_TABS` to change** (line 42):
```typescript
const VALID_TABS = ["overview", "compose", "environment", "logs", "backups", "proxy"] as const;
```
→ `["overview", "config", "logs", "backups", "proxy"] as const` (D-02), with `tabLabels` (lines 155-162) updated to match and `compose`/`environment` `TabsContent` blocks (lines 315-365) replaced by a single `<TabsContent value="config">` rendering the new `ConfigTab`.

**Dirty-guard `useEffect` to preserve unchanged** (lines 52-61) — required by RESEARCH.md Pitfall 3, do not let the CodeMirror/env-editor integration bypass this:
```typescript
useEffect(() => {
    if (!id) return;
    if (!composeDirty) { getComposeContent(id).then((r) => setComposeContent(r.content)); }
    if (!envDirty) { getEnvContent(id).then((r) => setEnvContent(r.content)); }
}, [id, stack?.lastKnownHash, composeDirty, envDirty]);
```

**Overview tab to replace** (lines 247-313 — `ServicesTab` + Deployments `Card`/`Table` + `StatusLogCard` + `EventLogCard`) with `ServicesTab` (unchanged) + new `<StackTimeline .../>` consuming `useStackTimeline(stack.deployments, stack.statusLogs, events)`.

**Config-changed alert to keep unchanged** (lines 227-235, already dark-mode-aware, reuse as the visual precedent for the new stack-level update badge's hue choice):
```typescript
<Alert className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800">
```

---

### `client/src/components/common/theme-provider.tsx` / `theme-toggle.tsx` (provider / component, event-driven)

**No direct in-repo analog** — first theming wiring in this codebase. Follow RESEARCH.md Pattern 6 exactly:
1. `theme-provider.tsx`: thin wrapper re-exporting `next-themes`' `ThemeProvider` with `attribute="class" defaultTheme="system" enableSystem`.
2. Wire into `client/src/main.tsx` around `<App/>` — analog for provider-nesting style is `main.tsx` itself (read verbatim), lines 43-45:
```typescript
<BrowserRouter>
    <Toaster />
    <Routes>...</Routes>
</BrowserRouter>
```
Wrap one level further out: `<ThemeProvider attribute="class" defaultTheme="system" enableSystem><BrowserRouter>...</BrowserRouter></ThemeProvider>`.
3. `theme-toggle.tsx`: icon-only button using `useTheme()`, `aria-label="Toggle theme"` per UI-SPEC Copywriting; render inside `PageHeader`'s top row (`components/common/layout/page.tsx`, read verbatim) next to `SidebarTrigger`:
```typescript
<div className="flex items-center gap-3 px-6 pt-4">
    <SidebarTrigger/>
    <Separator orientation="vertical" className={"max-h-4"}/>
    <div className={"px-1"}>{breadcrumbs}</div>
</div>
```
Add the toggle as a sibling here (or in the `children`/actions row) so it is always visible per D-16, since every page renders `PageHeader`.

---

## Shared Patterns

### Dialog-with-form shell
**Source:** `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (full file, read this session)
**Apply to:** `proxy-assign-dialog.tsx`, `backup-schedule-dialog.tsx`
Controlled `open`/`onOpenChange`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`, `toast.promise` submit with `loading`/`success`/`error` messages, `Skeleton` loading state, `Alert variant="destructive"` + Retry button error state.

### `ApiError` → toast + form field errors
**Source:** `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` lines 63-67 (`err instanceof ApiError ? err.message : ...`) and CLAUDE.md §Error Handling/Client
**Apply to:** all new dialog/form components (proxy dialog, backup dialog, env editor save, compose editor save)
```typescript
.catch((err: unknown) => {
    const message = err instanceof ApiError ? err.message : "Failed to load ...";
    setState({status: "error", message});
});
```

### Status/config pill shell
**Source:** `client/src/components/domain/stack/stack-list.tsx` lines 28-42
**Apply to:** `status-pill.tsx`, `service-update-badge.tsx`, any new badge in the timeline/detail header
```typescript
<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-900 dark:text-{hue}-200">
```
Container: `flex flex-wrap items-center gap-1` — already handles multi-badge wrapping, reuse unchanged.

### `PageHeader`/`PageContent` composition
**Source:** `client/src/components/common/layout/page.tsx` (full file, read this session) — `Page`, `PageHeader` (breadcrumbs slot + children row), `PageTitle`, `PageDescription`, `PageActions`, `PageContent` (`p-6 space-y-6`)
**Apply to:** all page-level files (`dashboard.tsx`, `[id].tsx` unchanged shell), and the theme-toggle placement inside `PageHeader`'s top row.

### Skeleton loading placeholders
**Source:** `client/src/routes/app/dashboard.tsx` lines 59-61, `.../service-upgrade-dialog.tsx` lines 118-121
**Apply to:** `stat-card.tsx` (new stats reuse `<Skeleton className="h-8 w-12"/>`), any new dialog's loading state.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `client/src/components/common/theme-provider.tsx` | provider | event-driven | First theming wiring in this codebase — no prior `ThemeProvider`/`useTheme` usage exists to copy from. Follow `next-themes` README pattern per RESEARCH.md Pattern 6 and the `main.tsx` provider-nesting style documented above. |
| `client/src/routes/app/stacks/components/compose-editor.tsx` (CodeMirror wiring specifically) | component | CRUD | No CodeMirror usage exists in the codebase yet — this is new technology (D-18). Use RESEARCH.md's "Code Examples" section (YAML linter + dark-mode-wired `<CodeMirror>` snippet) as the reference; preserve the existing `composeDirty`/`onChange` wiring shape from `[id].tsx` lines 329-336 as the controlled-value contract. |
| `client/src/routes/app/stacks/components/env-editor.tsx` (table mode / `useFieldArray` specifically) | component | CRUD | No `useFieldArray` usage exists yet in this codebase's forms (proxy-tab.tsx uses single-object `react-hook-form`, not array fields). Follow RHF's standard `useFieldArray` pattern layered onto the existing `standardSchemaResolver` convention seen in `service-upgrade-dialog.tsx`'s sibling forms. |
| `client/src/hooks/use-stack-timeline.ts` | hook | transform | No prior client-side multi-source merge hook exists; derive per RESEARCH.md Pattern 1's `useMemo` shape, sourcing types from `client/src/lib/stacks-api.ts` (not read this session — verify `StackDetail`/`StackEvent` shapes there before implementing). |

## Metadata

**Analog search scope:** `client/src/routes/app/stacks/`, `client/src/routes/app/stacks/components/`, `client/src/components/domain/stack/`, `client/src/components/common/`, `client/src/routes/app/dashboard.tsx`, `client/src/main.tsx`
**Files scanned/read this session:** `[id].tsx`, `log-viewer.tsx`, `service-upgrade-dialog.tsx`, `dashboard.tsx`, `stack-list.tsx`, `page.tsx`, `main.tsx`, `stack-status-badge.tsx` (8 full-file reads; remaining context sourced from RESEARCH.md's own verified file reads: `settings.tsx`, `proxy-tab.tsx`, `backup-config-card.tsx`, `[backupId].tsx`, `stacks-api.ts`, `stack-service.ts`, `stack-repository.ts`)
**Pattern extraction date:** 2026-09-25
