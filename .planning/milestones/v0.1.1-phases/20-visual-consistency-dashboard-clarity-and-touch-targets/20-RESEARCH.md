# Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets - Research

**Researched:** 2026-10-20
**Domain:** React 19 + Tailwind 4 + shadcn client polish (shared status mapping, self-hosted mono font, shared table/form primitives, touch targets) plus one small Fastify/Prisma read-path addition (`hasBackup` on the stack list)
**Confidence:** HIGH for in-repo facts (all files were opened this session); MEDIUM for browser/CSS behaviour (not run in a browser this session, per the "no heavy local actions" rule)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Status casing (UI-02)**
- **D-01:** All status labels are **lowercase** (`running`, `healthy`, `backing up`, `exited`) on dashboard, stack list, stack header, services table and activity timeline. Stack badges therefore change from Title Case to lowercase; service/container badges keep their current casing.
- **D-02:** One module (e.g. `client/src/lib/status-labels.ts`) owns the label formatter and **both** presentation maps (stack statuses such as `BACKING_UP`, container states such as `running`). `getStackStatusPresentation` and `getServiceStatusPresentation` consume it. Underscores become spaces. Unknown values pass through the same formatter (lowercased), never throwing. A unit test asserts the casing rule so it cannot drift.

**Backup card (DASH-01, DASH-02)**
- **D-03:** "Backups Configured" is replaced by a single **"Backup Coverage"** card shown as `n/total`. A stack counts when it has an effective schedule (own or global default) **or** at least one snapshot, so manual-snapshot-only stacks are visible. The denominator is the total stack count.
- **D-04:** The snapshot signal comes from a **new field on the server stack-list response** (e.g. `hasBackup` / `lastBackupAt`, derived from Backup records inside the backup repository, exposed through the stack service, typed in `@docktor/shared`/stacks-api). No extra dashboard request and no per-stack restic call. `computeDashboardStats` stays pure. The existing error behaviour (em dash when stacks or backup-defaults fail) is preserved.

**Monospace typography (UI-03)**
- **D-05:** **Geist Mono**, self-hosted through `@fontsource-variable/geist-mono` bundled by Vite (no external font host request). Defined as a `--font-mono` token in the `@theme inline` block of `client/src/index.css`.
- **D-06:** The mono set is: KPI numbers, stat-card labels, **and technical values** (image tags, versions, ports, container names, snapshot IDs and similar identifiers in tables and badges). The planner must produce an explicit list of call sites; tabular figures enabled for KPIs.

**Data tables (UI-08)**
- **D-07:** Restyle the shared primitives (`DataTable`, `TableContent`, `TablePagination` in `components/common/data/table/`) to the shadcn data-table block look, then **migrate the hand-built tables** (services, proxy domains, certificates, storage stacks/backups, backup history, snapshots, incident list, notification log, and any other `<Table>` users) onto `DataTable`. Sorting, status pills (`ToneBadge`/`StatusDot`) and row actions must be preserved.
- **D-08:** The look is a **bordered, rounded container**: rounded-md border wrapper, muted header row, subtle row hover, compact pagination footer. Must be verified in light and dark mode.

**Forms (UI-05)**
- **D-09:** Shared **form layout primitives in `components/common/`** (a field stack and an actions row, e.g. `FormStack` / `FormActions`) own the label-to-input and field-to-button spacing. All forms adopt them (login, signup, setup steps, create/import, dialogs, settings cards touched in passing). `components/ui/form.tsx` is not edited. Settings cards are NOT migrated to react-hook-form here (separate refactoring target).

**Tab bar (UI-04)**
- **D-10:** The scrollbar the user sees is the **vertical** one, not horizontal. Root cause: `overflow-x-auto` forces `overflow-y: auto`, so focus ring/border overflow of the triggers produces a vertical scrollbar. Fix the vertical overflow (e.g. `overflow-y-hidden` plus enough padding for the focus ring) in `routes/app/stacks/[id].tsx`; horizontal swipe scrolling stays for narrow screens, with the horizontal scrollbar hidden. Active tab scrolls into view on narrow screens. Verify with Playwright at desktop, tablet and phone widths.

**Touch targets (A11Y-01)**
- **D-11:** **Per-site classes** via a shared constant or `cn()` helper (e.g. `size-11 md:size-8`) applied at call sites: stack actions trigger, theme toggle, certificate delete button, table pagination buttons. 44px below `md`, compact at `md` and up. `SidebarTrigger` stays out of scope; no wrapper component.

**Stack breadcrumb (UI-09, added scope)**
- **D-12:** On non-overview stack pages (`/stacks/:id/:tab`) the stack-name crumb links to `/stacks/:id` (overview) and the tab name is the current page. Implement as a shared stack breadcrumb used by the stack detail header (and reconcile with `backup-detail-header.tsx`, which already links it).

### Claude's Discretion
- Exact class values for the form spacing rule, table styling details, exact tab-bar padding, hook/field naming for the snapshot signal, and the technical-value call-site list, within the decisions above.

### Deferred Ideas (OUT OF SCOPE)
- Migrating Settings cards to react-hook-form (existing Known Refactoring Target, separate work).
- Auditing other nested stack pages beyond the stack-name crumb (user chose the non-overview-tab case only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-02 | One status casing from one shared mapping across dashboard, stack list, stack header, services table, activity timeline | `lib/status-labels.ts` design; the three call-site classes (badge maps, raw `fromStatus → toStatus` text in `activity-timeline.tsx:130`, raw `${stackStatus}` in `services-section.tsx:158,169`); exact list of existing tests that assert Title Case (see Pitfall 2) |
| UI-03 | KPI numbers + a defined set of labels in a self-hosted monospace font via design tokens | `@fontsource-variable/geist-mono@5.3.0` verified (family name `Geist Mono Variable`, subset files > Vite 4 KiB inline limit so no `data:` URIs); `--font-mono` token in `@theme inline`; explicit call-site checklist below |
| UI-04 | Tab bar shows no scrollbar at desktop/tablet, stays usable narrow | Likely true root cause is the absolutely positioned `::after` underline in `TabsTrigger` (`bottom-[-5px]`), not the focus ring; wrapper fix + `StackTabBar` extraction + jsdom `scrollIntoView` guard |
| UI-05 | One label-to-input and field-to-button spacing rule | `FormStack`/`FormActions` in `components/common/form-layout.tsx`; inventory of all 20 `<form>` sites and the sites that bypass `FormItem` (`space-y-1`) |
| UI-08 | All data tables share one restyled look, keeping sorting, pills, row actions | `TableFrame` + `DataTable` extensions (column class, hidden header, sort, expandable rows, footer, required empty copy); per-table migration notes and the three tables that need API extensions beyond UI-SPEC R-07 |
| UI-09 | Stack breadcrumb links back to the overview (added scope; to be added to REQUIREMENTS.md / ROADMAP.md by the planner) | `StackBreadcrumb` design; the existing Playwright test `stacks.spec.ts` "WR-01 regression" asserts the OPPOSITE href and must be rewritten |
| DASH-01 | "Backups Configured" card states exactly what it counts | `Backup Coverage` `n/total` card + `StatCard.hint`; `DashboardStats.backupsConfigured` -> `backupCoverage` |
| DASH-02 | A manual-snapshot-only stack is not invisible | Server `hasBackup` derived from COMPLETED non-RESTORE `Backup` rows; stale-after-backup pitfall in `useStacks` |
| A11Y-01 | 44px touch targets below `md` for the four named controls | `lib/touch-target.ts`; `max-md:` vs `size-11 md:` equivalence; Playwright projects only match `mobile.spec.ts` on the phone project |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives the plan must satisfy (treated with the same authority as locked decisions):

- **Layering (server):** routes only call application services; services never import Prisma; **only repositories touch Prisma**; DI via constructor parameters; singleton repositories exported from `repositories/index.ts`. The architecture test `server/test/unit/architecture/layering.test.ts` enforces "application layer never imports `lib/db.js`" (read this session), so the `hasBackup` lookup must go through a **port** declared in `stack-service.ts` (existing precedent: `StackEventReadRepo`, `ImageUpdateCheckReadRepo`).
- **Client layering:** pages are orchestrators (~80 lines), one section component per visual section, no inline helper components in page files; domain components do not fetch; hooks own server state. `[id].tsx` is already 100 lines, so the tab-bar addition must go into an extracted `StackTabBar` section component, not into the page.
- **`components/ui/` is never edited** (shadcn-managed). All new styling is applied at call sites or in `components/common/`.
- **`components/common/` checklist:** props generic (no domain vocabulary), no API/hook usage inside. This applies to `FormStack`, `FormActions`, `TableFrame`, `StatCard.hint`. `StackBreadcrumb` and anything knowing about stacks goes in `components/domain/`.
- **Dark mode:** every light-only `text-/bg-/border-{gray,green,red,blue,yellow,orange,amber}-NNN` utility needs a `dark:` counterpart.
- **Pills:** always `ToneBadge` + `StatusDot`; never hand-rolled pill classes outside `components/ui/`.
- **Forms:** `react-hook-form` + Zod resolver; Settings cards are **not** migrated in this phase.
- **TypeScript:** strict, no `any`, no unchecked casts, `Readonly<Props>`, `<ComponentName>Props`, explicit return types on exported functions.
- **TDD:** tests first/alongside; both happy and edge paths; test observable behaviour.
- **Imports:** client uses `@/*`; server uses relative `.js`; group external -> workspace -> local.
- **Memory (user):** no full `tsc --build`, no integration tests, no heavy builds on this VPS; CI (GitHub Actions) runs them. Single-file `vitest run` is the lightest acceptable local check.
- **Playwright** runs take `PLAYWRIGHT_PORT` (e.g. `5182`) to avoid collisions.
- **Commit format** `type(scope): description`; planning docs reference the GitHub issues (#71, #85, #89, #90, #91, #92, #95, bundle #96).

## Summary

Phase 20 is overwhelmingly client-side polish built on seams that already exist. Five findings drive planning:

1. **Two "obvious" designs in the UI-SPEC need extra API surface to be implementable.** `DataTable` has no router-free mode (it calls `useSearchParams` and `useNavigate`), uses URL query params (`?page=`, `?pageSize=`) that two paginated tables on one page would share, and its `pagination` default is `true`. The services table (expandable rows), the storage stacks table (nested sub-rows aligned to parent columns, controlled domain-specific sort with null-last semantics that tests lock in) and the proxy domains table (several domains aggregated into one row) cannot be expressed with the UI-SPEC R-07 surface alone. The plan should extend R-07 slightly (see Architecture Pattern 3) rather than weaken D-07.
2. **The server addition is small and fully precedented.** `Backup` rows (`status` `IN_PROGRESS|COMPLETED|FAILED`, `trigger` `MANUAL|SCHEDULED|RESTORE`) exist per stack; a `groupBy("stackId")` in `BackupRepository`, exposed through a new read port on `StackService` (11th constructor argument), yields `hasBackup`. Only `COMPLETED` + non-`RESTORE` rows are real snapshots. The client `useStacks` hook will show stale coverage after a first backup unless it refetches when a stack leaves `BACKING_UP`.
3. **The tab-bar root cause in D-10 is probably mis-attributed.** A `box-shadow` focus ring does not extend scrollable overflow; the `TabsTrigger` `::after` underline (`absolute`, `bottom-[-5px]`, `h-0.5`, `opacity-0` in the default variant) sits ~2px below the `TabsList` and *does* extend it. The wrapper fix in UI-SPEC R-05 (`overflow-y-hidden` + 4px padding) resolves both causes, so the decision stands, but the Playwright assertion (`scrollHeight <= clientHeight`) is what proves it. `[ASSUMED]` until run in a browser.
4. **Existing tests assert the old behaviour in ~14 places** (Title Case labels, `Backups Configured`, the stack-name breadcrumb `href`, exact-match `"Running"` in Playwright, `Router`-less renders of components that will become `DataTable` consumers). The plan must budget test rewrites per task, not as an afterthought.
5. **Same-file collisions across requirements are heavy** (`certificates-card.tsx`, `services-section.tsx`, `proxy-domains-table.tsx`, `stack-actions.tsx`, `stat-card.tsx`). Plans that run in parallel waves must not touch the same file; see the collision matrix in Architecture Patterns.

**Primary recommendation:** Build bottom-up in this order: (a) server `hasBackup` + `status-labels.ts` + `touch-target.ts` + font token (independent leaf work, parallelisable), (b) extended `DataTable`/`TableFrame`/`TablePagination`, `FormStack`/`FormActions`, `StackBreadcrumb`, `StackTabBar` (shared primitives), (c) per-file adoption (table migrations, form adoption, mono call sites, touch classes) serialised per file, (d) Playwright specs last.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Status label casing/mapping | Browser / Client (`lib/status-labels.ts`) | — | Pure presentation of server enum values; server keeps raw `StackStatus` enum (Prisma enum values must match the state machine) |
| `hasBackup` snapshot signal | Database / Storage (Backup rows) -> API / Backend (`BackupRepository` + `StackService.listStacks`) | Browser (`computeDashboardStats`) | D-04: derived server-side in one batched query, no per-stack restic call |
| Backup Coverage `n/total` | Browser / Client (`lib/dashboard-stats.ts`, pure) | — | Needs schedule (client already has `backupSchedule` + global default) and `hasBackup`; denominator is `stacks.length` |
| Monospace font hosting | CDN / Static (Vite bundles woff2 into `dist/assets`, served by the app origin) | Browser (`--font-mono` token) | Zero third-party host requests |
| Data table look/behaviour | Browser / Client (`components/common/data/table/`) | — | Shadcn `Table` primitives only; no server change |
| Tab bar scroll behaviour | Browser / Client (`StackTabBar`) | — | CSS overflow + `scrollIntoView` |
| Touch-target sizing | Browser / Client (call-site classes via `lib/touch-target.ts`) | — | `components/ui/` cannot be edited |
| Stack breadcrumb | Browser / Client (`components/domain/stack/stack-breadcrumb.tsx`) | — | Router links only |
| Form spacing | Browser / Client (`components/common/form-layout.tsx`) | — | Layout primitives |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fontsource-variable/geist-mono` | 5.3.0 (npm `latest`, modified 2026-07-19) `[VERIFIED: npm registry, gsd package-legitimacy seam verdict OK]` | Self-hosted Geist Mono variable font (CSS + woff2) | Locked by D-05. Package README (read from the tarball) documents `import "@fontsource-variable/geist-mono"` and `font-family: "Geist Mono Variable"` `[VERIFIED: package README.md in tarball]` |
| Tailwind CSS | 4.1.18 (already installed) | `--font-mono` theme token drives the `font-mono` utility | `[CITED: tailwindcss.com/docs/font-family]` "set `--font-mono` in an `@theme` block. The `font-mono` utility then uses your value" |
| shadcn `Table`, `Tabs`, `Button`, `Breadcrumb`, `Form` | installed in `client/src/components/ui/` | Primitives restyled at call sites | `components/ui/` not editable |
| react-router | ^7.13.0 (installed) | `DataTable` uses `useSearchParams`/`useNavigate`; `StackBreadcrumb` uses `Link` | Existing |

No other new dependency. No `@tanstack/react-table` (UI-SPEC R-07). No `npx shadcn add`.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest 4 + `@testing-library/react` 16 + jsdom 28 | installed | Unit tests (client `test/unit/**`) | All pure/logic/class assertions |
| Playwright ^1.58.2 | installed; Chromium `chromium-1208` present in `~/.cache/ms-playwright` | Layout, touch-box, scrollbar, font-request checks | Anything needing real CSS |
| Testcontainers (server) | installed | Server integration test for `GET /api/stacks` `hasBackup` | CI only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-subset `@fontsource-variable/geist-mono/wght.css` import | Default `import` of the package (`index.css`) | Identical `@font-face` set (6 subsets, `unicode-range`-gated so only the `latin` 23 KB file loads for Latin text). Use the bare package import as the UI-SPEC says. |
| Two touch constants (`size-11 md:size-9`, `size-11 md:size-8`) | One constant `max-md:size-11` | `max-md:` is `width < 48rem`, identical to `useIsMobile`'s `max-width: 767px`, and it leaves the Button's own `icon`/`icon-sm` size untouched at `md`+, so one constant serves both. This is the convention already used by `sidebar-version-block.tsx` (`size-8 max-md:size-11`) and asserted by `sidebar-version-block.test.tsx:51-52`. Both work with `tailwind-merge`; UI-SPEC R-03's pair is acceptable, the single constant is simpler. Planner's call (R-03 is Resolved Discretion). |
| `hasBackup: boolean` | `lastBackupAt: string \| null` | CONTEXT allows either; the card needs only a boolean. Prefer `hasBackup` (less data, no date serialisation). |

**Installation:**
```bash
yarn workspace @docktor/client add @fontsource-variable/geist-mono
```

**Version verification (run this session):**
`npm view @fontsource-variable/geist-mono version` -> `5.3.0`; `time.modified` -> `2026-07-19T03:50:13.648Z`; license `OFL-1.1`; repository `git+https://github.com/fontsource/font-files.git`; no `scripts.postinstall`.

Verbatim from `package/index.css` in the downloaded tarball: `font-family: 'Geist Mono Variable';` `font-weight: 100 900;` `src: url(./files/geist-mono-latin-wght-normal.woff2) format('woff2-variations');` with six `@font-face` blocks (cyrillic-ext, cyrillic, latin-ext, latin, symbols2, vietnamese), each with a `unicode-range`. Largest-to-smallest relevant file sizes: latin 23128 B, latin-ext 14696 B, cyrillic 12940 B, vietnamese 7696 B, cyrillic-ext 6176 B, symbols2 5812 B — all above Vite's default `assetsInlineLimit` of 4096 B `[ASSUMED: Vite default 4096; not verified against vite 7.3.1 docs this session]`, so none is inlined as a `data:` URI and each is emitted as a same-origin asset.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@fontsource-variable/geist-mono` | npm | latest published 2026-07-19 (5.3.0); long-lived Fontsource family | ~1.5M/wk (seam `weeklyDownloads: 1500656`) | github.com/fontsource/font-files | OK | Approved. `postinstall: null`, license OFL-1.1, tarball contents inspected (CSS + woff2 + metadata, no JS runtime) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The package name appears in the approved UI-SPEC and CONTEXT D-05 (user-confirmed), the package's own README documents the import, and the seam returned `OK`; so no `checkpoint:human-verify` is required before install.

## Architecture Patterns

### System Architecture Diagram

```
                        GET /api/stacks (requireAuth onRequest hook)
                                      |
        routes/stacks.ts -> stackService.listStacks()
                                      |
              +-----------------------+------------------------+
              |                       |                        |
     repo.findAll()          settings.getProxySettings()   backups.findStackIdsWithSnapshot()   <-- NEW port (BackupRepository.groupBy stackId,
     (Stack + services)      (showInDashboard filter)       status=COMPLETED, trigger IN MANUAL|SCHEDULED)
              |                       |                        |
              +-----------> filter protected -> withServiceUpdateInfo -> merge {hasBackup: ids.has(stack.id)}
                                      |
                              JSON  Stack[] (+hasBackup)
                                      |
   client/lib/stacks-api.ts  Stack.hasBackup?: boolean
                                      |
   hooks/use-stacks.ts  (SSE: refetch when a stack leaves BACKING_UP  <-- NEW)
              |                                   |
   routes/app/dashboard.tsx                 stack-list.tsx (DataTable)
      computeDashboardStats(stacks, globalSchedule) -> backupCoverage {covered,total}
      DashboardStatCards -> StatCard(label="Backup Coverage", value="3/5", hint=...)

   Status text path:
   raw server status (BACKING_UP) | docker state (running) + health
        -> lib/status-labels.ts: formatStatusLabel(raw) = replaceAll("_"," ").toLowerCase()
        -> getStackStatusPresentation / getServiceStatusPresentation (label, tone, pulse)
        -> StackStatusBadge / ServiceStatusBadge  (dashboard, stack list, header, services table,
           incident list, activity timeline badge)
        -> activity-timeline raw "from -> to" text, services-section upgrade-blocked aria text (call formatStatusLabel directly)

   Table path:
   consumer columns -> DataTable<T> (sort? paginate? expand? footer? emptyMessage required)
        -> loading skeleton | empty block | TableContent
              desktop: TableFrame(rounded-md border) > ui/Table (muted header, hover rows, footer)
              mobile (<md): card-per-row (unchanged), hideHeader cols become action row
        -> TablePagination (below frame; 44px buttons <md via TOUCH_TARGET_ICON_SM)

   Font path:
   index.css  @import "@fontsource-variable/geist-mono"  -> Vite emits woff2 into assets (same origin)
              @theme inline { --font-mono: "Geist Mono Variable", ui-monospace, ... }
        -> every `font-mono` utility (21 existing sites + new ones)
```

### Recommended Project Structure
```
client/src/
├── lib/status-labels.ts                          # NEW  formatStatusLabel + both presentation maps (re-exported by the two badge files)
├── lib/touch-target.ts                           # NEW  TOUCH_TARGET_ICON (+ _SM)
├── components/common/form-layout.tsx             # NEW  FormStack, FormActions
├── components/common/data/table/
│   ├── data-table.tsx                            # EXTEND
│   ├── table-content.tsx                         # RESTYLE + extend
│   ├── table-frame.tsx                           # NEW
│   ├── sortable-head.tsx                         # NEW (lifted from storage-stacks-table.tsx)
│   └── table-pagination.tsx                      # RESTYLE + touch targets + aria-labels
├── components/domain/stack/stack-breadcrumb.tsx  # NEW
├── routes/app/stacks/components/stack-tab-bar.tsx# NEW  (page file already 100 lines)
└── index.css                                     # font import + --font-mono token
server/src/
├── repositories/backup-repository.ts             # + findStackIdsWithSnapshot()
└── application/stack-service.ts                  # + StackBackupReadRepo port, ctor arg 11, listStacks merge
```

### Pattern 1: One formatter, two maps, one module (UI-02)
**What:** `lib/status-labels.ts` exports `formatStatusLabel(raw: string): string` = `raw.replaceAll("_", " ").toLowerCase()`, plus the stack and service presentation tables. Labels are derived, never hard-coded.
**Recommendation on D-02 vs UI-SPEC R-01:** D-02 (locked) says the module owns the formatter **and both maps**; UI-SPEC R-01 leaves the maps in the badge files. Satisfy D-02 literally: move `STACK_STATUS_PRESENTATION`/`getStackStatusPresentation` and `getServiceStatusPresentation` into `lib/status-labels.ts` and **re-export** them from `stack-status-badge.tsx` / `service-status-badge.tsx` so existing test imports (`import {StackStatusBadge, getStackStatusPresentation} from "@/components/domain/stack/stack-status-badge"`) keep working. A lib file importing the `Tone` *type* from `components/common/tone-badge` has precedent (`lib/health-format.ts` line 1: `import type {Tone} from "@/components/common/tone-badge";`).
**Current sources of the labels (read this session):**
- `stack-status-badge.tsx`: `DRAFT: {label: "Draft", ...}`, `BACKING_UP: {label: "Backing Up", ...}`, unknown fallback `label: status` (raw).
- `service-status-badge.tsx`: literals `"unknown"`, `"healthy"`, `"unhealthy"`, `"starting"`, `"running"`, `"exited"`, `"restarting"`; fallback `label: containerState` (raw, un-lowercased).
- `activity-timeline.tsx:130`: `` {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus} `` (raw uppercase enum text next to a compact badge for the same status).
- `services-section.tsx:158,169`: `` `Cannot upgrade while the stack is ${stackStatus}` `` (raw; `services-section.test.tsx:166` asserts `"Cannot upgrade while the stack is DEPLOYING"`). Not in the success-criterion list; format it too for consistency and update the test (low risk), or leave and record the exception. Recommendation: format it.
- Not in scope (separate vocabularies, leave as is): `BackupStatusBadge` ("In Progress"/"Completed"/"Failed"), `NotificationTypeBadge` ("Error", "Unhealthy"), `CertStatusBadge`, `formatHealthStatus` (already lowercase docker values).
**Example:**
```typescript
// lib/status-labels.ts
export function formatStatusLabel(raw: string): string {
    return raw.replaceAll("_", " ").toLowerCase();
}
// unknown values: label = formatStatusLabel(status), tone neutral, no pulse -- never throws, "" -> ""
```

### Pattern 2: Pure stats + server-derived flag (DASH-01/02)
**Server (TDD order: unit tests first):**
```typescript
// repositories/backup-repository.ts  (the only place that touches Prisma)
/** Stack ids with at least one completed backup or scheduled run -- a restore is not a snapshot. */
async findStackIdsWithSnapshot(): Promise<Set<string>> {
    const rows = await prisma.backup.groupBy({
        by: ["stackId"],
        where: {status: "COMPLETED", trigger: {in: ["MANUAL", "SCHEDULED"]}},
    });
    return new Set(rows.map((row) => row.stackId));
}
```
```typescript
// application/stack-service.ts  -- port next to StackEventReadRepo
export interface StackBackupReadRepo {
    findStackIdsWithSnapshot(): Promise<ReadonlySet<string>>;
}
// listStacks(): fetch with Promise.all([repo.findAll(), settings..., backups.findStackIdsWithSnapshot()]),
// then map the filtered/enriched stacks to {...stack, hasBackup: ids.has(stack.id)}
```
Wire in `application/index.ts`: append `backupRepository` (already imported at line 9 of that file) as the **11th** argument of `new StackService(...)`; the only other construction site is `server/test/unit/application/stack-service.test.ts:148`.
**Verified enum values** (`server/prisma/schema/backup.prisma`, read this session):
```
enum BackupTrigger {
  MANUAL
  SCHEDULED
  RESTORE
}

enum BackupStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
}
```
`backup-service.ts` creates rows with `trigger: "RESTORE"` for restores (line 372) and sets `status: "COMPLETED"` on success (lines 300, 469). Counting only `COMPLETED` and non-`RESTORE` rows avoids counting a failed attempt or an in-flight run as a snapshot. Known limitation to record: a stack whose restic repository was populated outside Docktor (no `Backup` rows) or whose rows predate this table reads `hasBackup: false`; D-04 explicitly chose Backup records over a restic call, so accept and document.
**Client:** add `hasBackup?: boolean` to `Stack` in `client/src/lib/stacks-api.ts` (there is no stack-list response schema in `@docktor/shared`; `grep` of `shared/src` for `StackWithServices` returned nothing, so CONTEXT's "typed in `@docktor/shared`" resolves to the client interface). Optional because `POST /api/stacks` and `GET /api/stacks/:id` do not include it. `computeDashboardStats` treats `undefined` as `false`. Rename `backupsConfigured: number` to `backupCoverage: number` (covered count); `total` already exists, so the card value is `` `${stats.backupCoverage}/${stats.total}` ``; zero stacks -> `0/0`.

### Pattern 3: Extending DataTable so the migrations lose nothing (UI-08)
Current `DataTable` (read this session): props `data, columns, getRowKey, itemRoute, loading, emptyMessage = "No data", pagination = true, defaultPageSize = 10`; columns `{name, render, isKey?}`; pagination state in the URL via `useSearchParams` (`page`, `pageSize`); `TableContent` uses `useNavigate` and `useIsMobile` and renders a `Card` per row below 768px.

UI-SPEC R-07 adds column `className/headerClassName/hideHeader`, `sortValue`, `renderExpanded` + `isExpanded/onToggleExpand`, `footer`, required `emptyMessage` + `emptyDescription`. That covers stack list, services (single full-width detail row), backup history, snapshots, incidents, notification log, certificates and storage backups. **Three gaps the planner must close in the same primitive task (not discover during migration):**

| Gap | Where | Recommendation |
|-----|-------|----------------|
| **Controlled / domain sort** | `storage-stacks-table.tsx` + `lib/storage-view.ts`. Tests lock: default `size` descending; first click on a new column applies its *natural* direction (name asc, size desc); second click reverses (two-state, never "none"); an unmeasured stack (`volumeSizeBytes === null`) sorts last in both directions; ties break by name. UI-SPEC's uncontrolled asc->desc->none cycle contradicts this. | Add an optional controlled form to the column: `sort?: {direction: "asc" \| "desc" \| "none"; onToggle: () => void}`. The consumer keeps `nextStorageSort`/`sortStorageStacks`/`ariaSortFor` and passes pre-sorted `data`. Lift the `SortableHead` button/`aria-sort` markup into `sortable-head.tsx` and use it for both modes. Uncontrolled `sortValue` stays for new simple cases. |
| **Multi-row expansion aligned to parent columns** | Storage volumes (one extra `<TableRow>` per volume, cells in columns 2-3, tested via `row.classList.contains("bg-muted/50")` at `storage-stacks-table.test.tsx:108`, and `aria-controls` -> `id` on the first volume row). | Let `renderExpanded` return arbitrary row elements; export a tiny `ExpandedRow` helper (colSpan wrapper) for the services case, and let storage return its own `<TableRow>`s built from `TableRow`/`TableCell` re-exported by the table module (keeps "no file outside `components/common/data/table/` imports `@/components/ui/table`" true if re-exported). Header-row hazard: UI-SPEC gives the header row `bg-muted/50`; the existing test filters *all* rows by that class, so the header row would be included and the assertion would fail. Put the header tint on `TableHeader`/`th` (e.g. `[&_th]:bg-muted/50`) not on the `<tr>`, or move the test to `data-` attributes. |
| **Grouped rows / many actions per row** | `proxy-domains-table.tsx` aggregates N domains of a service into one row with parallel flex columns; `proxy-tab.test.tsx:211` asserts 2 rows (header + 1 aggregated row). | Keep aggregation in the consumer: build `groups = Array.from(configsByService)` and pass them as `data`; each column renders `rows.map(...)`. No DataTable change; mobile card layout then shows one card per service. |

**Other facts the migration must respect:**
- `DataTable` calls `useSearchParams` and `TableContent` calls `useNavigate`, so **every migrated consumer's unit test must render inside `MemoryRouter`** (currently Router-less: `services-section.test.tsx`, `certificates-card.test.tsx`, `incident-list.test.tsx` `[ASSUMED: grep showed no Router in those files; verify per file]`). `backup-history.test.tsx` and `storage-stacks-table.test.tsx` already wrap in `MemoryRouter`.
- **Pagination default is `true`** and tables migrated from unpaginated lists must pass `pagination={false}` (issue #95 explicitly says "new table features such as ... pagination" are out of scope). If any two paginated `DataTable`s ever share a route they share `?page=`/`?pageSize=`; none do after migration if only `/stacks` paginates, but add a short comment or an optional `paramPrefix` only if needed.
- `incident-list.tsx` (`max-h-96 overflow-y-auto` wrapper) and `backup-history.tsx` (`ScrollArea h-96`) scroll internally. Keep the scroll wrapper **outside** `TableFrame` so the rounded border is not scrolled away, and note a sticky header is not provided by the shadcn `Table` (its own container is `overflow-x-auto`, which makes `position: sticky` on `th` unreliable); do not promise one.
- `ui/table.tsx` verbatim defaults to override at call sites: `TableRow` -> `"hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"`, `TableHead` -> `"text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap ..."`, `TableFooter` -> `"bg-muted/50 border-t font-medium [&>tr]:last:border-b-0"`, container `"relative w-full overflow-x-auto"`. UI-SPEC's `hover:bg-muted/30` row hover is *lighter* than the shadcn default `/50`; `cn()` (tailwind-merge) resolves the conflict in favour of the later class.
- Mobile (`< md`): `TableContent` card layout is retained (UI-SPEC A-02). For `hideHeader` (action) columns render the cell full-width; for expandable rows render the expanded content inside/under the card. Cards currently key columns by `col.name`, so action columns still need a unique `name` (e.g. `"Actions"`) even when the header is `sr-only`.
- `emptyMessage` becomes required (UI-SPEC). `stack-list.tsx` is the only current caller; `DataTable`'s empty block today renders a bare `<p>{emptyMessage}</p>`, so the heading/description structure and the "no `No data` text" test are new.
- Hand-rolled pills found in migrated files (CLAUDE.md pill rule): `notification-log-card.tsx` renders `<Badge variant={n.emailSent ? "secondary" : "outline"}>` ("Sent"/"UI only"); `certificates-card.tsx` renders the "Expiring soon" `Badge` with `text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800` (already dark-paired). UI-SPEC A-05 allows swapping the latter to `<ToneBadge tone="yellow">` when the file is touched; do the same for the notification "Sent" pill (tone `green`/`neutral`) or record the exception.
- A-01 surfaces (`env-editor.tsx` table mode, `brownfield-import.tsx`) keep their `<Table>`, get `TableFrame` and the header/hover classes. `brownfield-import.test.tsx` and `env-editor.test.tsx` use `findByRole("row", {name: ...})`/`getAllByRole("row")`, which a wrapper `div` does not affect.

### Pattern 4: Touch-target constants (A11Y-01)
**Existing duplication to consolidate (grep this session):** the literal `"min-h-11 min-w-11 md:min-h-9 md:min-w-9"` appears in `services-section.tsx` (3x), `proxy-domains-table.tsx` (2x), `storage-stacks-table.tsx` (`const TOUCH_TARGET`), `env-editor.tsx` (`const ICON_BUTTON_CLASS`) and `theme-toggle.tsx`. Replace all with the one constant so there is a single source (nice-to-have; the four required sites are mandatory).
**Required sites and their current state:**
| Control | File | Current |
|---------|------|---------|
| Stack actions trigger | `routes/app/stacks/components/stack-actions.tsx` | `<Button variant="outline" size="icon" aria-label="Stack actions">` -> 36px always |
| Theme toggle | `components/common/theme-toggle.tsx` | `className="relative min-h-11 min-w-11 hover:text-primary md:min-h-9 md:min-w-9"` (already compliant; swap to constant) |
| Certificate delete | `routes/app/settings/components/certificates-card.tsx` | `<Button variant="ghost" size="icon" aria-label={`Delete ${cert.domainPattern}`}>` -> 36px always (needs the fix) |
| Pagination buttons (4) | `components/common/data/table/table-pagination.tsx` | `className="h-8 w-8"` each, no `aria-label`; rows-per-page `SelectTrigger className="h-8 w-[70px]"` |
**Tailwind detail:** `buttonVariants` base for `size="icon"` is `"size-9"`; `icon-sm` is `"size-8"` (`ui/button.tsx`). `Button` merges via `cn(buttonVariants({variant, size, className}))` (tailwind-merge), so `size-11` replaces `size-9`, and `md:size-9`/`max-md:size-11` are different variants and coexist. Tailwind 4 scans all non-ignored source files, so class strings in `lib/touch-target.ts` are picked up (same mechanism as the existing `lib/service-color.ts`) `[ASSUMED: not re-verified this session]`.
**Test precedent:** `test/unit/components/sidebar-version-block.test.tsx:51-52` asserts `toHaveClass("size-8", "max-md:size-11")`; unit tests can only assert class tokens (jsdom has no Tailwind), the real 44px proof is Playwright.

### Pattern 5: Tab bar (UI-04)
Current `[id].tsx` (read this session): `<div className="-mx-1 overflow-x-auto px-1"><TabsList className="w-max">...`. `TabsList` is `h-9 p-[3px]` with `TabsTrigger` `h-[calc(100%-1px)]`, `focus-visible:ring-[3px]`, and a pseudo-element: `after:absolute ... group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] ... after:h-0.5 ... after:opacity-0` (only visible for `variant="line"`).
- CSS fact `[CITED: CSS Overflow Module — scrollable overflow excludes box-shadow/outline (ink overflow); includes descendant boxes incl. pseudo-elements]` `[ASSUMED: not browser-verified here]`: a `ring` (box-shadow) cannot create a scrollbar; the `::after` box that extends past the list's bottom edge can, even at `opacity: 0`. D-10's wrapper fix still removes the symptom for both causes.
- Wrapper per UI-SPEC R-05: `-mx-1 -my-1 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. `TabsList w-max` unchanged.
- Extract `stack-tab-bar.tsx` (props `activeTab`, tabs rendered from `STACK_TABS`/`STACK_TAB_LABELS`): `[id].tsx` is 100 lines today and CLAUDE.md targets ~80.
- Active-tab scroll: in a `useEffect([activeTab])`, `wrapperRef.current?.querySelector('[role="tab"][data-state="active"]')` then `scrollIntoView?.({inline: "nearest", block: "nearest"})`. **jsdom does not implement `Element.prototype.scrollIntoView`** `[ASSUMED: well-known jsdom gap; not re-checked]`, and `stack-detail-page.test.tsx` renders the full page, so use optional call (`?.()`) or stub in `test/setup.ts`. Do not pass `behavior: "smooth"`; the default is instant, which also satisfies `prefers-reduced-motion` without a media query.
- `mobile.spec.ts:388-392` already scrolls each tab into view and clicks it at 412px; keep passing.

### Pattern 6: Forms (UI-05)
Inventory of `<form>` elements (grep this session; 20 `<form` lines, one is a comment in `env-editor.tsx`): `signup-form`, `login-form`, `two-factor-step`, `account-step`, `settings-step`, `backup-step`, `notifications-step`, `proxy-step`, `create-stack-form`, `disable-two-factor-dialog`, `regenerate-codes-dialog`, `enroll-dialog` (2 forms), `backup-schedule-dialog`, `proxy-assign-dialog`, plus Settings cards `compose-checks-card`, `template-repos-card`, `backup-repository-card`, `health-retention-card`, `certificates-card`, `proxy-settings-card`; `health-probe-form.tsx` has no `<form>` but a `<Form>` provider with `<div className="space-y-4">`.
- Current baseline is already mostly `space-y-4` (16px) between fields; the real inconsistencies are (a) setup steps put `CardContent className="space-y-4"` and `CardFooter` as siblings, so the field-to-button gap is `CardFooter`'s padding, not a rule; (b) login/signup/auth put the submit `Button` directly in the `space-y-4` stack (16px, not 24px); (c) `certificates-card.tsx` file inputs use `<div className="space-y-1">` around a bare `Label` + `Input` (4px label-to-input) because they bypass `FormItem`; (d) `FormItem` (`ui/form.tsx:85`, verbatim `className={cn("grid gap-2", className)}`) gives 8px label-to-input.
- **Risk to flag:** issue #92 says "field labels sit too close to their inputs". UI-SPEC R-04 keeps `FormItem`'s 8px. If the user's complaint is about the 8px itself, the shared rule would not change what they see in `FormItem`-based forms. `FormStack` can raise it without touching `ui/form.tsx`: `[&_[data-slot=form-item]]:gap-2.5` (or `gap-3`) via descendant selector (`FormItem` carries `data-slot="form-item"`, verified at `ui/form.tsx:84`). See Open Question 2.
- `FormStack` = `flex flex-col gap-4`; `FormActions` = `flex items-center gap-2 pt-2` with `align?: "start" | "end"`. For the wizard steps the structure is `Form > form > CardContent + CardFooter`; adopt by wrapping fields in `FormStack` inside `CardContent` (replacing `space-y-4`) and keep `CardFooter` (or render `FormActions` inside it), but make the resulting field-to-button distance 24px in both layouts. A unit test per primitive asserting the class tokens is enough; visual verification of "mobile and desktop, light and dark" (issue AC) is Playwright/manual.
- `getByRole` queries in existing form tests are by label/name, not by DOM structure, so wrapping in a `div` is safe `[ASSUMED: spot-checked login-form/proxy-assign tests only]`.

### Pattern 7: StackBreadcrumb (UI-09)
- Existing: `stack-detail-header.tsx` links the stack name to `` `/stacks/${stack.id}${activeTab !== "overview" ? `/${activeTab}` : ""}` `` (the page you are on); `backup-detail-header.tsx` links `/stacks/${stackId}` correctly and then `Backups` -> `/stacks/${stackId}/backups`; `stack-page-state.tsx` has a static `Stacks > Loading.../Error` crumb (no stack name known; keep).
- New `components/domain/stack/stack-breadcrumb.tsx` per UI-SPEC R-09; both headers delegate. `BackupDetailHeader`'s props are `stackId, stackLabel, crumb, title`, so it maps to `stackName={stackLabel}` and `trail=[{label: "Backups", to: `/stacks/${stackId}/backups`}]`, `current={crumb}`.
- **Test collisions:** `test/integration/stacks.spec.ts` "breadcrumb stack-name link preserves tab context when clicked from a non-Overview tab (WR-01 regression)" asserts `toHaveAttribute("href", "/stacks/my-app/config")` and that clicking keeps `Config` current: it encodes the behaviour D-12 reverses. Rewrite it to assert `href="/stacks/my-app"` and that clicking lands on the Overview. `test/integration/stacks.spec.ts` "breadcrumbs show correct navigation on detail page" and `backup-detail-page.test.tsx:87` (Backups link path) stay valid.
- `UnsavedChangesGuard` `isSameContext={(pathname) => isStackTabPath(id, pathname)}` treats `/stacks/:id` and its tabs as the same context, so clicking the stack-name crumb from the Config tab with unsaved edits does **not** prompt (it is the same context by that rule); this is existing behaviour, but now that the crumb navigates tab -> overview it silently discards unsaved Config edits. Decide whether to leave (tab switching already behaves this way) or note it in the plan. `[VERIFIED: client/src/lib/stack-tabs.ts isStackTabPath: base path and its own tabs are same context]`

### Anti-Patterns to Avoid
- **Lowercasing with CSS (`lowercase` class).** Tests, accessible names and copy-paste then disagree (UI-SPEC R-01).
- **Importing `@/components/ui/table` from a migrated consumer** (breaks the single-look guarantee); re-export what is needed from the table module.
- **Putting Prisma or `groupBy` in `StackService`** (layering test fails); use the port.
- **Per-stack restic calls or a second dashboard request** for the snapshot signal (D-04).
- **Editing `components/ui/*`** to get the look; every override is a `className` at a call site or inside `components/common/`.
- **Adding screenshot-diff tests.** `playwright.config.ts` defines `snapshotDir` but there are no baselines in the repo; use computed-style and bounding-box assertions instead.

### Same-file collision matrix (serialise these across plans/waves)
| File | Requirements touching it |
|------|--------------------------|
| `routes/app/settings/components/certificates-card.tsx` | A11Y-01 (delete button), UI-08 (table), UI-05 (upload form), UI-03 (domain pattern mono), A-05 pill |
| `routes/app/stacks/components/services-section.tsx` | UI-08, UI-03, A11Y-adjacent constant swap, UI-02 (aria text) |
| `routes/app/stacks/components/proxy-domains-table.tsx` | UI-08, UI-03, constant swap |
| `routes/app/storage/components/storage-stacks-table.tsx` | UI-08, constant swap (`TOUCH_TARGET`) |
| `routes/app/stacks/components/stack-actions.tsx` | A11Y-01, optional CTA copy (`Deploy Stack`) |
| `components/common/stat-card.tsx` + `dashboard-stat-cards.tsx` + `lib/dashboard-stats.ts` | UI-03, DASH-01/02 (one plan) |
| `components/common/data/table/*` | UI-08, A11Y-01 (pagination) (one plan) |
| `routes/app/stacks/components/stack-detail-header.tsx` | UI-09 (+ UI-02 only through the badge) |
| `client/src/index.css` | UI-03 only |
| `components/sidebar-version-block.tsx` | UI-03 (mono version) |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | UI-09 addition + traceability row (planner task) |

### Explicit monospace call-site checklist (D-06)
From UI-SPEC "Monospace set", re-checked against the code this session. Anything not listed stays sans.
| # | File | Element | Class change |
|---|------|---------|--------------|
| 1 | `components/common/stat-card.tsx` | value `<div>` | add `font-mono` (keeps `text-2xl font-semibold tabular-nums truncate`; `stat-card.test.tsx` asserts `truncate` and `font-semibold` remain and no `font-bold`) |
| 2 | `components/common/stat-card.tsx` | label `<span>` (`text-sm font-normal text-muted-foreground`) | `font-mono text-xs`; allow wrapping (no `truncate`), icon `shrink-0` |
| 3 | `routes/app/stacks/components/services-section.tsx` | `svc.serviceName` cell, `svc.image`, `svc.imageTag ?? "latest"`, `formatPorts(parsePorts(svc.ports))` | `font-mono text-xs` (+ `break-all` for image on mobile) |
| 4 | `routes/app/stacks/components/proxy-domains-table.tsx` | domain spans, `svcName`, `row.internalPort` | `font-mono text-xs` |
| 5 | `routes/app/settings/components/certificates-card.tsx` | `cert.domainPattern` cell | `font-mono text-xs` |
| 6 | `routes/app/stacks/components/snapshots-section.tsx` | `snapshot.short_id.slice(0, 8)` | already `font-mono text-xs` |
| 7 | `components/domain/stack/service-update-badge.tsx` | the `latestTag` inside `Update available → {latestTag}` | wrap tag in `<span className="font-mono">`; `describeServiceUpdate` returns a string and is unit-tested, so either keep the string and style at render by splitting, or accept the whole pill sans (decide; tests assert the exact text) |
| 8 | `components/domain/stack/stack-update-badge.tsx` | renders literal `update available` with no version | **nothing to style**; UI-SPEC lists it but there is no version/tag text in this pill |
| 9 | `components/domain/stack/deploy-warnings-alert.tsx` | `{portLabel}` and `{holder.containerName}` inside the message | wrap each in `<code className="font-mono">` |
| 10 | `components/sidebar-version-block.tsx` | `versionText(version)` span (`text-xs tabular-nums text-sidebar-foreground/70`) | add `font-mono` (Phase 19 deferred this here); also the collapsed menu label `font-normal tabular-nums` |
| 11 | `backup-history.tsx`, `storage-backups-section.tsx` | UI-SPEC says "identifiers wherever rendered" | **no identifiers are rendered** in either (history shows status/trigger/date/duration/size; storage shows stack names); do not invent mono here. Backup detail `[backupId].tsx` and `restore-confirm-dialog.tsx` show an 8-char short id (`shortId`); optional. |
| existing | 21 `font-mono` lines (grep) in `proxy-step`, `two-factor-step`, `migration-review-step`, `enroll-dialog`, `backup-config-summary`, `snapshots-section`, `template-repos-card`, `proxy-settings-card`, `backup-repository-fields`, `recovery-codes-panel`, `brownfield-import`, `log-terminal`, `scan-skipped-directories`, `environment-warnings-banner`, `unified-diff-view`, `cert-status-badge` | inherit Geist Mono via the token, no code change; a visual check of `log-terminal` and `unified-diff-view` (alignment of ANSI output and diff columns) is worthwhile |

### Code Examples

**Font + token (client/src/index.css)** — first lines, per Tailwind docs import-ordering note and the package README:
```css
@import "@fontsource-variable/geist-mono";
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
    /* ...existing tokens... */
    --font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```
Source: `[CITED: tailwindcss.com/docs/font-family]` (override `--font-mono`, include a generic fallback; `@import` must precede other rules) and `[VERIFIED: package README.md]`. Note the Tailwind ordering warning is specifically about *URL* imports; package imports are inlined by the bundler, but keeping it first is harmless and matches UI-SPEC.

**Touch constants (client/src/lib/touch-target.ts)**
```typescript
// Applied via cn(): tailwind-merge drops Button's own size-9 / size-8.
export const TOUCH_TARGET_ICON = "size-11 md:size-9";
export const TOUCH_TARGET_ICON_SM = "size-11 md:size-8";
```

**Dashboard stats (pure)**
```typescript
const covered = hasEffectiveBackupSchedule(stack.backupSchedule, globalDefaultSchedule) || stack.hasBackup === true;
if (covered) backupCoverage += 1;
```

**useStacks freshness** (the `stack_status` branch of `hooks/use-stacks.ts`, currently only patches `status`): refetch in the background when the previous status was `BACKING_UP` and the new one is not, so `hasBackup` flips without a reload.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font hosting/subsetting | Custom `@font-face` + checked-in woff2 | `@fontsource-variable/geist-mono` | `unicode-range` subsets, `font-display: swap`, OFL licence file, hashed same-origin assets via Vite |
| Class conflicts (`size-9` vs `size-11`) | String concatenation of class names | `cn()` (clsx + tailwind-merge) | Last conflicting utility wins, variants kept |
| Sort chevrons/`aria-sort` | Per-table header buttons | One `SortableHead` lifted from `storage-stacks-table.tsx` | Already tested (`aria-sort` ascending/descending/none) |
| Grouped-by-stack boolean | N+1 `findFirst` per stack or restic calls | One `groupBy` in `BackupRepository` | D-04: single batched query |
| Case/underscore formatting | Per-component `.toLowerCase()` | `formatStatusLabel` | One rule, one test |
| Scroll-active-tab | Manual `scrollLeft` maths | `Element.scrollIntoView({inline: "nearest", block: "nearest"})` | Native, handles RTL/zoom |
| Page/page-size state | Local `useState` in each table | Existing `DataTable` URL params | Back/forward and deep-link behaviour already built |

**Key insight:** every piece of "new" behaviour in this phase already exists once somewhere in the repo (sortable header in storage, 44px classes in services/proxy/theme, correct breadcrumb in backup detail, `groupBy` precedent in `service-health-event-repository.ts`). The work is lifting each into one shared place and then deleting the copies.

## Runtime State Inventory

This is not a rename/migration phase in the data sense. Items that nevertheless persist state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the status enums in Postgres (`StackStatus`) are unchanged; only presentation changes. `hasBackup` is derived at read time, nothing is stored. | None (verified: no Prisma schema change in scope) |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts / installed packages | `yarn.lock` and `client/package.json` change when `@fontsource-variable/geist-mono` is added; Vite emits new hashed woff2 assets in `client/dist`. `.test/` coverage/report output dirs are generated. | Commit lockfile; no stale artifact cleanup |
| URL state | Pagination persists in `?page=`/`?pageSize=`; no key names change | None |
| Browser storage | next-themes stores the theme under `THEME_STORAGE_KEY`; untouched | None |

## Common Pitfalls

### Pitfall 1: DataTable is not router-free
**What goes wrong:** Migrated tables render fine in the browser but their unit tests throw "useNavigate() may be used only in the context of a <Router>" / `useSearchParams`.
**Why:** `data-table.tsx` calls `useSearchParams()`; `table-content.tsx` calls `useNavigate()`.
**How to avoid:** Wrap each affected test in `MemoryRouter` (precedent: `backup-history.test.tsx`); pass `pagination={false}` for formerly unpaginated tables. Do not make `DataTable` router-optional.
**Warning signs:** `services-section`, `certificates-card`, `incident-list` tests failing at render.

### Pitfall 2: Existing tests that encode the old behaviour
**Vitest (client), exact assertions to update:**
- `stack-status-badge.test.tsx`: the whole `LABELS` map (`"Backing Up"`, `"Running"` ...), `"WEIRD"` fallback and `getStackStatusPresentation("WEIRD")` equality (label becomes `"weird"`).
- `stack-list.test.tsx:79-80` (`getByText("Running")`), `activity-timeline.test.tsx:140-142` (`"DEPLOYING → RUNNING"` and `"Running"`), `incident-list.test.tsx:69,72` (`"Unhealthy"`, `"Error"`), `services-section.test.tsx:166` (upgrade-blocked name, if formatted).
- `dashboard-stats.test.ts` lines 50, 90, 96, 106 (`backupsConfigured`) and a new stack fixture field.
- `stat-card.test.tsx` (new `hint`; label class); `sidebar-version-block.test.tsx` (mono class if asserted); `theme-toggle.test.tsx` (class constant, if it asserts classes — grep found none for `min-h-11` in tests).
- `storage-stacks-table.test.tsx:108` (row class filter vs header tint), `storage-backups-section.test.tsx:25` (`getAllByRole("row").slice(1, 3)` with the new footer row), `proxy-tab.test.tsx:211` (row count 2).
- `settings-page.test.tsx:205` clicks `{name: "Save"}` (only affected if the UI-SPEC CTA rename to `Save Settings` is adopted), `proxy-step.test.tsx`/`proxy-settings-card.test.tsx` are unaffected.
**Playwright:** `stacks.spec.ts:925` (`"Backups Configured"` locator, value `"1"` -> `"1/2"` with new fixture data), the WR-01 breadcrumb test (~line 960-985), `stacks.spec.ts:353` and `mobile.spec.ts:376` use `getByText("Running", {exact: true})` which is case-sensitive and will fail for `running`; `stacks.spec.ts:157-158` and `:917` use non-exact `getByText("Running")`/`("Stopped")` which are case-insensitive substrings and keep passing (may hit strict-mode multi-match; verify in CI).

### Pitfall 3: Header-row tint vs. tests that count tinted rows
UI-SPEC gives the header row `bg-muted/50`; `storage-stacks-table.test.tsx:108` identifies volume rows by that exact class. Tint `th` cells (or `TableHeader`) instead, and keep the volume-row marker on the `tr`.

### Pitfall 4: Stale Backup Coverage after the first backup
`useStacks` patches `status` from `stack_status` SSE events but only refetches on `config_changed|config_error|update_available`. A stack finishing its first backup would keep `hasBackup: false` until reload. Refetch (background) on a `stack_status` event that leaves `BACKING_UP`.

### Pitfall 5: Counting the wrong Backup rows
`FAILED`, `IN_PROGRESS` and `RESTORE` rows are not snapshots. `resticSnapshotId` is stored as `""` at creation (`backup-repository.ts create`: `resticSnapshotId: data.resticSnapshotId ?? ""`) and `backup-service.ts` writes `resticSnapshotId: snapshotId ?? ""` even for `COMPLETED`, so do not filter on a non-empty snapshot id.

### Pitfall 6: `listStacks` tests use `toEqual` on whole objects
`stack-service.test.ts` (`expect(result).toEqual([allStacks[0]])`, `toEqual(allStacks)`) will fail once every stack gains `hasBackup`. Update fixtures/mocks (add the 11th mock arg returning an empty Set) and assert `hasBackup` explicitly in new tests.

### Pitfall 7: Playwright projects only run specific files
`playwright.config.ts`: `chromium` has `testIgnore: /mobile\.spec\.ts/`; `mobile-chromium` has `testMatch: /(mobile|two-factor)\.spec\.ts/`. The 44px-below-`md` assertions must be added to `mobile.spec.ts` (or the `testMatch` widened); the "compact at `md`+" and tab-bar-at-1280/768 checks go in a desktop-run spec (viewport via `page.setViewportSize`). Every spec must stub all `**/api/**` calls: the `_apiRouteGuard` fixture aborts unstubbed requests.

### Pitfall 8: `scrollIntoView` in jsdom
Calling it unguarded in the tab bar effect throws in any test that renders `StackDetailPage`. Optional-call it or stub in `test/setup.ts`.

### Pitfall 9: Tailwind 4 and arbitrary scrollbar utilities
`[scrollbar-width:none]` and `[&::-webkit-scrollbar]:hidden` are standard arbitrary property/variant forms in Tailwind 4 `[ASSUMED]`; confirm in a dev-server check that the bar disappears on Chromium (Playwright `scrollHeight`/`clientHeight` plus `getComputedStyle(wrapper).scrollbarWidth`).

### Pitfall 10: Stat card label in mono at the six-column grid
`xl:grid-cols-6` with `Updates Available` at `font-mono text-xs` in a `CardHeader flex flex-row justify-between` with an icon: let the label wrap and mark the icon `shrink-0`; the existing `truncate` on the *value* must stay (it carries `title`).

### Pitfall 11: Scope creep via UI-SPEC CTA relabels
The UI-SPEC "CTA labels by surface" table renames `Deploy`->`Deploy Stack`, `Save`->`Save Settings`, `Save`->`Save Compose File`, `Save defaults`->`Save Defaults`. None is required by UI-02..A11Y-01. `mobile.spec.ts` matches `/deploy/i` (still OK); `settings-page.test.tsx:205` matches exactly `"Save"`. Treat as one small isolated task late in the phase (or defer); do not let it block the shared-primitive work.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` `fontFamily.mono` | `--font-mono` in CSS `@theme` | Tailwind 4 | Token lives in `index.css`; no JS config |
| Per-weight static Fontsource packages (`@fontsource/geist-mono`) | `@fontsource-variable/*` single variable file set | Fontsource v5 | One `Geist Mono Variable` family covering weights 100-900 |
| Hand-built per-feature table markup | One `DataTable` + frame | this phase | Single look |

**Deprecated/outdated:** the CONTEXT D-10 diagnosis ("focus ring produces a vertical scrollbar") is likely inexact; see Pattern 5. Does not change the fix.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The vertical scrollbar on the tab bar is caused by the `::after` underline box (`bottom-[-5px]`) extending scrollable overflow, not the focus ring | Pattern 5 | Low: the prescribed wrapper fix (`overflow-y-hidden` + `py-1`) removes either cause; only the explanation changes. Verify with the Playwright `scrollHeight <= clientHeight` assertion. |
| A2 | Vite 7.3.1's default `assetsInlineLimit` is 4096 B, so no Geist Mono file is inlined as `data:` | Standard Stack | Low: even if inlined the request count drops to zero; the "no third-party host" criterion still holds |
| A3 | jsdom lacks `Element.prototype.scrollIntoView` | Pitfall 8 | Low: optional-call is safe either way |
| A4 | `services-section`, `certificates-card`, `incident-list` unit tests currently render without a Router | Pitfall 1 | Low: if wrapped already, nothing to add |
| A5 | Tailwind 4 detects class strings inside `client/src/lib/*.ts` (so `lib/touch-target.ts` constants generate CSS) | Pattern 4 | Medium: if not, the 44px classes would silently not exist; the Playwright bounding-box test catches it. `lib/service-color.ts` is the precedent (not opened this session). |
| A6 | `[scrollbar-width:none]` and `[&::-webkit-scrollbar]:hidden` compile as written in Tailwind 4.1.18 | Pitfall 9 | Low: Playwright check |
| A7 | Backup rows are the right "snapshot" proxy for stacks whose restic repo was populated outside Docktor (they will read `hasBackup: false`) | Pattern 2 | Low-Medium: D-04 chose this; user should be aware the card can under-count adopted stacks that were backed up before Docktor |
| A8 | Raising `FormItem` label-to-input gap above 8px may be what issue #92 wants | Pattern 6 / Open Question 2 | Medium: UI-SPEC R-04 keeps 8px; a user who sees no label spacing change may reject the fix |
| A9 | Leaving the A-01 editable tables (env editor, brownfield selection) off `DataTable` is acceptable under D-07 "any other `<Table>` users" | Pattern 3 | Low: UI-SPEC A-01 already records this |
| A10 | Single-file `vitest run <file> --coverage.enabled=false` is acceptable locally under the "no heavy builds" memory | Validation Architecture | Low |

## Open Questions

1. **Storage stacks table: full migration or frame-only?**
   - What we know: D-07 lists "storage stacks/backups" for migration. The stacks table has domain-specific controlled sort (natural-direction first click, two-state toggle, null-last), nested volume sub-rows in parent columns and ~12 tests locking this behaviour.
   - What's unclear: whether the user prefers a faithful migration (needs the controlled-sort and multi-row `renderExpanded` extensions in Pattern 3) or accepts the frame-only treatment already allowed for A-01 surfaces.
   - Recommendation: implement the extensions (satisfies D-07 literally, keeps tests), fall back to `TableFrame` + shared `SortableHead` only if the extension proves invasive during execution; record the choice in the plan SUMMARY.

2. **Label-to-input gap: keep 8px or raise it?**
   - What we know: `FormItem` is `grid gap-2` (8px) and not editable; issue #92 says labels sit "too close". UI-SPEC R-04 keeps 8px and standardises the rest.
   - What's unclear: whether 8px is the complaint or only the bypassing sites (certificates file inputs at 4px, button directly after fields).
   - Recommendation: default to UI-SPEC; make `FormStack` carry `[&_[data-slot=form-item]]:gap-2.5` only if the user confirms. Either way the shared primitive is the single place to change it later.

3. **UnsavedChangesGuard on the new breadcrumb navigation** (tab -> overview inside the same stack is "same context"). Leave consistent with tab switching (recommended) or add a prompt? Low priority.

4. **CTA relabels from UI-SPEC** (Pitfall 11): include in this phase or split into a follow-up? Recommend including as an isolated last task only if time allows; no requirement depends on it.

5. **`notification-log-card` and `certificates-card` hand-rolled `Badge` pills**: swap to `ToneBadge` now (touched files) or leave? Recommend swap (cheap, CLAUDE.md rule).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Everything | ✓ | v22.14.0 | — |
| Yarn (v4, `nodeLinker: node-modules`) | install font | ✓ | `yarn --version` printed nothing in this shell `[ASSUMED: repo uses Yarn v4 per CLAUDE.md; .yarnrc.yml read]` | `npm`-free; use `yarn workspace` per repo convention |
| npm registry | version/legitimacy check | ✓ | reachable (`npm view`, `npm pack` succeeded) | — |
| Playwright Chromium | integration specs | ✓ | `chromium-1208`, `chromium_headless_shell-1208`, `ffmpeg-1011` present in `~/.cache/ms-playwright` | CI |
| PostgreSQL / Docker (Testcontainers) | server integration test for `hasBackup` | not probed (not needed locally) | — | GitHub Actions CI (per user memory) |
| Browser (to confirm A1/A6) | root-cause confirmation | present but running it counts as heavy; skip locally | — | CI Playwright |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** local Postgres/Testcontainers (use CI).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (client unit) | Vitest ^4.0.18 + jsdom ^28.1.0 + @testing-library/react ^16.3.2 |
| Framework (client e2e) | Playwright ^1.58.2 (projects `chromium` = Desktop Chrome, `mobile-chromium` = Pixel 7; `workers: 1`) |
| Framework (server) | Vitest projects `unit` (`test/unit/**/*.test.ts`) and `test/integration` (Testcontainers Postgres) |
| Config files | `client/vitest.config.ts` (include `test/unit/**/*.test.{ts,tsx}`, setup `test/setup.ts`, coverage on), `client/playwright.config.ts`, `server/vitest.config.ts` |
| Quick run command (client, one file) | `yarn workspace @docktor/client exec vitest run test/unit/lib/status-labels.test.ts --coverage.enabled=false` |
| Quick run command (server, one file) | `yarn workspace @docktor/server exec vitest run --project unit test/unit/application/stack-service.test.ts --coverage.enabled=false` |
| Full suite (CI only) | `yarn test` (client + server unit), `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration`, `yarn workspace @docktor/server test:integration` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-02 | `formatStatusLabel` lowercases and replaces `_`; every known stack key/container state; unknown (`WEIRD_STATE` -> `weird state`) and `""` do not throw | unit | `vitest run test/unit/lib/status-labels.test.ts` | ❌ Wave 0 |
| UI-02 | Badges render lowercase; compact vs badge; tone/pulse unchanged | unit | `vitest run test/unit/components/domain/stack/stack-status-badge.test.tsx` (+ service badge) | ✅ (rewrite expectations) |
| UI-02 | Timeline renders `running → backing up`; upgrade-blocked text formatted | unit | `vitest run test/unit/routes/stacks/activity-timeline.test.tsx` | ✅ (update) |
| UI-02 | Same status identical text on dashboard/list/header/services/timeline | e2e | Playwright `visual-consistency.spec.ts` (new) | ❌ Wave 0 |
| UI-03 | `--font-mono` token present; `StatCard` value/label carry `font-mono`; mono call sites (checklist rows 1-10) | unit | `vitest run test/unit/components/common/stat-card.test.tsx` etc. | ✅/❌ |
| UI-03 | Zero third-party font requests; Geist Mono computed on a KPI; woff2 served from app origin | e2e | Playwright: `page.on("request")` collecting non-`localhost` origins + `getComputedStyle(kpi).fontFamily` contains `Geist Mono Variable` | ❌ Wave 0 |
| UI-04 | No scrollbar at 1280/768/375; narrow screens still scroll horizontally; active tab in view; focus ring not clipped | e2e | Playwright: wrapper `scrollHeight <= clientHeight`; `scrollWidth > clientWidth` only at 375 | ❌ Wave 0 |
| UI-04 | `StackTabBar` renders five tabs, no throw without `scrollIntoView` | unit | `vitest run test/unit/routes/stacks/stack-detail-page.test.tsx` | ✅ (guard) |
| UI-05 | `FormStack`/`FormActions` class tokens and `align` | unit | `vitest run test/unit/components/common/form-layout.test.tsx` | ❌ Wave 0 |
| UI-05 | Adopting forms still pass their existing behaviour tests | unit | `vitest run test/unit/routes/auth/components/login-form.test.tsx` etc. | ✅ |
| UI-08 | `DataTable` sort asc/desc/none + `aria-sort`; controlled sort; expandable row; footer; `hideHeader`; required `emptyMessage` + `emptyDescription`, no `No data`; `pagination={false}`; MemoryRouter | unit | `vitest run test/unit/components/common/data-table.test.tsx` | ❌ Wave 0 |
| UI-08 | Each migrated table keeps its behaviour (sort, expand, subtotal, pills, row actions, aria-labels) | unit | existing per-table tests (`services-section`, `storage-stacks-table`, `storage-backups-section`, `proxy-tab`, `incident-list`, `backup-history`, `certificates-card`) | ✅ (wrap in router, update) |
| UI-08 | Frame renders in light and dark (border/header tint resolve to theme variables) | e2e | Playwright computed-style assertion on `rounded-md border` frame with `colorScheme: dark` | ❌ Wave 0 |
| UI-09 | `StackBreadcrumb` links: overview, non-overview tab, backup-detail trail | unit | `vitest run test/unit/routes/stacks/stack-detail-header.test.tsx backup-detail-page.test.tsx` + new `stack-breadcrumb.test.tsx` | ✅/❌ |
| UI-09 | Click stack crumb from `/config` lands on `/stacks/my-app` | e2e | rewrite WR-01 test in `stacks.spec.ts` | ✅ (rewrite) |
| DASH-01/02 | Coverage: schedule-only, snapshot-only, both, neither, global default, zero stacks, `hasBackup` undefined | unit | `vitest run test/unit/lib/dashboard-stats.test.ts` | ✅ (extend) |
| DASH-01 | Card label `Backup Coverage`, value `n/total`, hint, `—` + `data unavailable` on error | unit + e2e | new `dashboard-stat-cards.test.tsx`; update `stacks.spec.ts:925` | ❌ Wave 0 / ✅ |
| DASH-02 (server) | `listStacks` merges `hasBackup`; port called once; protected-stack filtering intact | unit | `vitest run --project unit test/unit/application/stack-service.test.ts` | ✅ (extend) |
| DASH-02 (server) | `findStackIdsWithSnapshot` query shape (`status: COMPLETED`, `trigger in MANUAL, SCHEDULED`) | unit (mocked `lib/db.js`, precedent `service-health-event-repository.test.ts`) | `vitest run --project unit test/unit/repositories/backup-repository.test.ts` | ❌ Wave 0 |
| DASH-02 (server) | `GET /api/stacks` -> `hasBackup` true only for COMPLETED non-RESTORE row | integration (Testcontainers, CI) | `yarn workspace @docktor/server test:integration` (`stacks.test.ts`) | ✅ (extend) |
| DASH-02 (client) | `useStacks` refetches when a stack leaves `BACKING_UP` | unit | `vitest run test/unit/hooks/use-stacks.test.ts` | ✅ (extend) |
| A11Y-01 | Pagination buttons: names (`First/Previous/Next/Last page`) and class tokens; select `h-11 md:h-8` | unit | `vitest run test/unit/components/common/table-pagination.test.tsx` | ❌ Wave 0 |
| A11Y-01 | Stack actions trigger, theme toggle, cert delete, pagination: bbox >= 44x44 below `md`; <= compact at `md`+ | e2e | `mobile.spec.ts` (phone) + desktop spec | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single touched unit test file(s), `--coverage.enabled=false`.
- **Per wave merge:** all `client/test/unit/**` for touched directories (CI-equivalent run), plus `server --project unit` for the server plan.
- **Phase gate:** full unit suites, server integration, and Playwright (`chromium` + `mobile-chromium`) green in GitHub Actions before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `client/test/unit/lib/status-labels.test.ts` — UI-02
- [ ] `client/test/unit/components/common/data-table.test.tsx` — UI-08 (sort, controlled sort, expand, footer, hideHeader, empty copy)
- [ ] `client/test/unit/components/common/table-pagination.test.tsx` — A11Y-01
- [ ] `client/test/unit/components/common/form-layout.test.tsx` — UI-05
- [ ] `client/test/unit/components/domain/stack/stack-breadcrumb.test.tsx` — UI-09
- [ ] `client/test/unit/routes/dashboard-stat-cards.test.tsx` — DASH-01
- [ ] `server/test/unit/repositories/backup-repository.test.ts` — DASH-02
- [ ] `client/test/integration/visual-consistency.spec.ts` (new, desktop `chromium`): tab bar scrollbar at 1280/768, no third-party font host, Geist Mono computed, table frame light/dark, status casing; touch-target assertions on the phone project go in `mobile.spec.ts`
- [ ] A shared `scrollIntoView` stub or optional call (see Pitfall 8)
- [ ] Framework install: only `yarn workspace @docktor/client add @fontsource-variable/geist-mono`; no test framework gaps

## Security Domain

`security_enforcement` is absent from `.planning/config.json` (read this session), so it is treated as enabled. Attack surface in this phase is minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged |
| V3 Session Management | no | unchanged |
| V4 Access Control | yes (one read endpoint changed) | `GET /api/stacks` stays behind the route-wide `app.addHook("onRequest", requireAuth)` `[VERIFIED: server/src/routes/stacks.ts line 18-19]`; `hasBackup` is a boolean derived from data the caller can already read via `GET /api/stacks/:id/backups` |
| V5 Input Validation | no new input | the new `findStackIdsWithSnapshot` takes no parameters |
| V6 Cryptography | no | — |
| V14 Config / supply chain | yes | one new npm dependency (font): legitimacy seam `OK`, `postinstall` null, OFL-1.1, inspected tarball has no JS runtime; lockfile committed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Third-party font host leaks visitor IP/referrer | Information disclosure | Self-hosted woff2 via the npm package; Playwright asserts zero non-origin requests |
| Typosquatted font package | Tampering | Name confirmed via the package's own README and seam verdict `OK` |
| Information exposure via list response | Information disclosure | Boolean only; no snapshot ids, sizes or repo paths added |
| XSS via status label | Tampering | Labels are rendered as React text children; `formatStatusLabel` does string transforms only |

## Sources

### Primary (HIGH confidence)
- In-repo files read this session (paths in the sections above): `CLAUDE.md`, `.planning/phases/20-.../20-CONTEXT.md`, `20-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (Phase 20), `.planning/config.json`, `client/src/**` (status badges, `dashboard-stats.ts`, `dashboard-stat-cards.tsx`, `stat-card.tsx`, `data-table.tsx`, `table-content.tsx`, `table-pagination.tsx`, `index.css`, `theme-toggle.tsx`, `[id].tsx`, `stack-detail-header.tsx`, `stack-actions.tsx`, `backup-detail-header.tsx`, `stack-page-state.tsx`, `stack-tabs.ts`, the nine table consumers, `ui/table.tsx`, `ui/tabs.tsx`, `ui/button.tsx`, `ui/form.tsx`), `client/test/**` (setup, config, listed unit and Playwright specs), `server/src/routes/stacks.ts`, `application/stack-service.ts`, `application/index.ts`, `repositories/backup-repository.ts`, `repositories/stack-repository.ts`, `prisma/schema/backup.prisma`, `test/unit/architecture/layering.test.ts`, `test/unit/application/stack-service.test.ts`.
- `@fontsource-variable/geist-mono@5.3.0` tarball (`npm pack`, extracted to the scratchpad): `package.json` exports, `README.md`, `index.css`, `files/` sizes.
- gsd `package-legitimacy check` seam (verdict OK) and `npm view`.
- Tailwind CSS docs, font-family page: https://tailwindcss.com/docs/font-family (fetched this session).
- GitHub issues #71 (via requirements), #85, #92, #95, #96 (read via `gh issue view`).

### Secondary (MEDIUM confidence)
- Web search result summarising the Fontsource + Tailwind v4 pattern (`--font-sans` override with "Inter Variable" example) — consistent with the package README.

### Tertiary (LOW confidence)
- CSS scrollable-overflow semantics for the tab-bar root cause (spec knowledge, not browser-verified): flagged A1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — one new, verified, README-documented package; everything else already installed.
- Architecture: HIGH for server/client seams and layering (files and tests read); MEDIUM for the DataTable extension shape (design recommendation closing gaps the UI-SPEC did not anticipate).
- Pitfalls: HIGH for test collisions (grepped), MEDIUM for CSS behaviours (A1, A5, A6 unverified in a browser).

**Research date:** 2026-10-20
**Valid until:** 2026-11-19 (stable stack; revisit if Tailwind/Vite minor bumps land before execution)
