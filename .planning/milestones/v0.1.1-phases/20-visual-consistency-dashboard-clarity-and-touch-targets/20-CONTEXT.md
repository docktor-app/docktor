# Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The interface reads as one consistent system: one status casing from one shared mapping (UI-02), a self-hosted monospace font for KPIs and technical values (UI-03), a tab bar without a scrollbar (UI-04), one form spacing rule (UI-05), one restyled table look (UI-08), an honest backup card on the dashboard (DASH-01, DASH-02), and 44px touch targets below `md` (A11Y-01). Also in scope, added during discussion: the stack breadcrumb must link back to the stack overview (last unchecked item of bundle #96; new requirement **UI-09**, to be added to REQUIREMENTS.md and ROADMAP.md by the planner). Source issues #71, #85, #89, #90, #91, #92, #95 (bundle #96). `components/ui/` is not edited.

</domain>

<decisions>
## Implementation Decisions

### Status casing (UI-02)
- **D-01:** All status labels are **lowercase** (`running`, `healthy`, `backing up`, `exited`) on dashboard, stack list, stack header, services table and activity timeline. Stack badges therefore change from Title Case to lowercase; service/container badges keep their current casing.
- **D-02:** One module (e.g. `client/src/lib/status-labels.ts`) owns the label formatter and **both** presentation maps (stack statuses such as `BACKING_UP`, container states such as `running`). `getStackStatusPresentation` and `getServiceStatusPresentation` consume it. Underscores become spaces. Unknown values pass through the same formatter (lowercased), never throwing. A unit test asserts the casing rule so it cannot drift.

### Backup card (DASH-01, DASH-02)
- **D-03:** "Backups Configured" is replaced by a single **"Backup Coverage"** card shown as `n/total`. A stack counts when it has an effective schedule (own or global default) **or** at least one snapshot, so manual-snapshot-only stacks are visible. The denominator is the total stack count.
- **D-04:** The snapshot signal comes from a **new field on the server stack-list response** (e.g. `hasBackup` / `lastBackupAt`, derived from Backup records inside the backup repository, exposed through the stack service, typed in `@docktor/shared`/stacks-api). No extra dashboard request and no per-stack restic call. `computeDashboardStats` stays pure. The existing error behaviour (em dash when stacks or backup-defaults fail) is preserved.

### Monospace typography (UI-03)
- **D-05:** **Geist Mono**, self-hosted through `@fontsource-variable/geist-mono` bundled by Vite (no external font host request). Defined as a `--font-mono` token in the `@theme inline` block of `client/src/index.css`.
- **D-06:** The mono set is: KPI numbers, stat-card labels, **and technical values** (image tags, versions, ports, container names, snapshot IDs and similar identifiers in tables and badges). The planner must produce an explicit list of call sites; tabular figures enabled for KPIs.

### Data tables (UI-08)
- **D-07:** Restyle the shared primitives (`DataTable`, `TableContent`, `TablePagination` in `components/common/data/table/`) to the shadcn data-table block look, then **migrate the hand-built tables** (services, proxy domains, certificates, storage stacks/backups, backup history, snapshots, incident list, notification log, and any other `<Table>` users) onto `DataTable`. Sorting, status pills (`ToneBadge`/`StatusDot`) and row actions must be preserved.
- **D-08:** The look is a **bordered, rounded container**: rounded-md border wrapper, muted header row, subtle row hover, compact pagination footer. Must be verified in light and dark mode.

### Forms (UI-05)
- **D-09:** Shared **form layout primitives in `components/common/`** (a field stack and an actions row, e.g. `FormStack` / `FormActions`) own the label-to-input and field-to-button spacing. All forms adopt them (login, signup, setup steps, create/import, dialogs, settings cards touched in passing). `components/ui/form.tsx` is not edited. Settings cards are NOT migrated to react-hook-form here (separate refactoring target).

### Tab bar (UI-04)
- **D-10:** The scrollbar the user sees is the **vertical** one, not horizontal. Root cause: `overflow-x-auto` forces `overflow-y: auto`, so focus ring/border overflow of the triggers produces a vertical scrollbar. Fix the vertical overflow (e.g. `overflow-y-hidden` plus enough padding for the focus ring) in `routes/app/stacks/[id].tsx`; horizontal swipe scrolling stays for narrow screens, with the horizontal scrollbar hidden. Active tab scrolls into view on narrow screens. Verify with Playwright at desktop, tablet and phone widths.

### Touch targets (A11Y-01)
- **D-11:** **Per-site classes** via a shared constant or `cn()` helper (e.g. `size-11 md:size-8`) applied at call sites: stack actions trigger, theme toggle, certificate delete button, table pagination buttons. 44px below `md`, compact at `md` and up. `SidebarTrigger` stays out of scope; no wrapper component.

### Stack breadcrumb (UI-09, added scope)
- **D-12:** On non-overview stack pages (`/stacks/:id/:tab`) the stack-name crumb links to `/stacks/:id` (overview) and the tab name is the current page. Implement as a shared stack breadcrumb used by the stack detail header (and reconcile with `backup-detail-header.tsx`, which already links it).

### Claude's Discretion
- Exact class values for the form spacing rule, table styling details, exact tab-bar padding, hook/field naming for the snapshot signal, and the technical-value call-site list, within the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and contracts
- `.planning/ROADMAP.md` §Phase 20 — goal, success criteria, notes
- `.planning/REQUIREMENTS.md` — UI-02, UI-03, UI-04, UI-05, UI-08, DASH-01, DASH-02, A11Y-01 (UI-09 to be added)
- `.planning/phases/19-sidebar-templates-and-version-block/19-CONTEXT.md` and `19-UI-SPEC.md` — the Templates page and sidebar the shared rules must also apply to; 44px-below-`md` convention
- `CLAUDE.md` — layering, page composition, dark-mode `dark:` rule, `ToneBadge`/`StatusDot` rule, no `components/ui/` edits, TDD
- GitHub issues `docktor-app/docktor#71`, `#85`, `#89`, `#90`, `#91`, `#92`, `#95`, bundle `#96`

### Existing code touched
- `client/src/components/domain/stack/stack-status-badge.tsx`, `service-status-badge.tsx` — status maps
- `client/src/lib/dashboard-stats.ts`, `client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx`, `client/src/components/common/stat-card.tsx` — dashboard card
- `server/src/repositories/backup-repository.ts` and the stack list service/route — snapshot signal
- `client/src/index.css` — design tokens (`@theme inline`)
- `client/src/components/common/data/table/` — shared table primitives
- `client/src/routes/app/stacks/[id].tsx`, `routes/app/stacks/components/stack-page-state.tsx`, `routes/app/stacks/backups/components/backup-detail-header.tsx` — tab bar and breadcrumbs
- `client/src/components/common/theme-toggle.tsx`, `routes/app/settings/components/certificates-card.tsx`, `routes/app/stacks/components/stack-actions.tsx`, `table-pagination.tsx` — touch targets

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ToneBadge`, `StatusDot`, `StatCard` (`valueClassName`), `DataTable<T>`, `Page`/`PageHeader`/`Section`, shadcn `Breadcrumb`
- `computeDashboardStats` (pure, unit-tested) and `hasEffectiveBackupSchedule`

### Established Patterns
- Pure presentation maps in `lib`/domain badge files with unit tests
- Light-only colour utilities need `dark:` counterparts
- Tab bar currently `-mx-1 overflow-x-auto px-1` wrapping `TabsList className="w-max"`

### Integration Points
- Stack list API response gains a snapshot field; client `stacks-api` types and `StackWithServices` follow
- No `@fontsource*` package is installed yet; no font is configured in `index.css`

</code_context>

<specifics>
## Specific Ideas

- Status labels are lowercase everywhere, matching Docker's vocabulary.
- Card reads like `3/5` under the label "Backup Coverage".

</specifics>

<deferred>
## Deferred Ideas

- Migrating Settings cards to react-hook-form (existing Known Refactoring Target, separate work).
- Auditing other nested stack pages beyond the stack-name crumb (user chose the non-overview-tab case only).

</deferred>

---

*Phase: 20-Visual Consistency, Dashboard Clarity and Touch Targets*
*Context gathered: 2026-10-20*
