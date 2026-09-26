# Phase 11: UI Rework - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up the stack-management UI's component structure and visual design without adding new stack-management capabilities: adopt shadcn patterns consistently, refactor toward a clean component architecture (hooks, compound components, SRP), consolidate the deployments/event/status log tables into one clearer surface, reduce unnecessary Card wrapping, restructure (not abandon) the stack detail page's tabs, move select add/edit flows into dialogs, unify status-indicator styling, rework the Backups tab to reuse the existing log-viewer component, and add a proper compose/env editor and dark mode. This phase is sequenced before Phases 12/14/15 so their new UI is built on these reworked patterns instead of needing re-skinning afterward.

GitHub issue [#15](https://github.com/docktor-app/docktor/issues/15) is an open list, not a concrete spec — the decisions below are what make it concrete.

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- **D-01:** Keep the tab-based structure on the stack detail page — reorganize content within tabs rather than moving to a single scrolling page or sidebar nav.
- **D-02:** Merge the Compose and Environment tabs into one **Config** tab. Resulting tab set: Overview, Config, Logs, Backups, Proxy (5, down from today's 6: Overview/Compose/Environment/Logs/Backups/Proxy).
- **D-03:** Reduce Card wrapping aggressively — flatten most sections to plain divs/dividers; reserve `Card` for genuinely distinct data groupings. Directly replaces today's pattern of 3 stacked Cards on the Overview tab (Deployments table, StatusLogCard, EventLogCard).

### Dialogs for Add/Edit Flows
- **D-04:** Proxy config (domain/TLS add-edit) moves into a dialog.
- **D-05:** Backup schedule / restore config moves into a dialog.
- **D-06:** Environment variables do **NOT** move to a dialog. See D-20/D-21 — superseded during the Compose/env editor discussion.

### Logs & Status Consolidation
- **D-07:** Consolidate the 3 separate log tables on the Overview tab (Deployments, StatusLogCard, EventLogCard) into a **single unified timeline**, filterable by type, replacing 3 stacked Cards with 1 clear surface.
- **D-08:** Exact status-indicator sizing scheme is left to planner discretion, **except**: the "running" status specifically must use a pulsing animated indicator (e.g. a pulsing green dot), not a plain static badge.
- **D-09:** Add a stack-level "update available" badge (currently only shown per-service) at **both** the stack-list/dashboard row and the stack detail page header — mirroring exactly how the existing "config changed" badge is placed/styled today in `stack-list.tsx` and `[id].tsx`.
- **D-10:** When a service's update badge has no `latestTag` (a moving tag like `stable`/`latest`), use distinct copy — "content updated" (no discrete version to offer) vs. "update available → x.y.z" (has one) — rather than suppressing the badge or leaving it ambiguous.

### Visual Polish — Colors
- **D-11:** Service colors are auto-derived from a fixed palette via a deterministic hash of the service name (no user override this phase); carried through into the log viewer for log-line attribution.
- **D-12 (deferred):** Stack-level colors — raised during discussion but explicitly deferred to a future phase, not this one.
- **D-13 (deferred):** Category-based color grouping (e.g. "media", "files") — requires a new backend field/model to classify stacks by category. Out of scope for a client-side visual-cleanup phase; deferred.

### Visual Polish — Dashboard
- **D-14:** Extract the dashboard's 4 existing stat cards (Total/Running/Stopped/Errors) into a reusable `StatCard` component (closes the CLAUDE.md "Known Refactoring Targets" item) **and** add 1-2 more at-a-glance stats — user suggested updates-available count and pending-backups count as candidates. Exact final stat set left to planner discretion.

### Visual Polish — Dark Mode
- **D-15:** Add dark mode using `next-themes` (already an installed dependency — confirmed no `ThemeProvider`/`useTheme` wired anywhere in `client/src` today). Default follows OS/system preference; user can manually override; the override persists (next-themes' standard localStorage pattern). — **Reversibility:** reversible — additive theming layer, no data model impact.
- **D-16:** The dark mode toggle lives in the app header/nav as an always-visible sun/moon icon — not tucked into Settings only.

### Mobile Support
- **D-17:** Full responsive audit, component by component — not a spot-fix of the worst breakage only. No specific pain points were pre-flagged by the user; the researcher/planner should audit fresh.

### Compose Editor
- **D-18:** Use **CodeMirror 6** for the compose YAML editor, not Monaco — smaller bundle footprint, better fit for a self-hosted single-process app than Monaco's heavier bundle.
- **D-19:** The compose editor does **basic YAML syntax validation only** (indentation/syntax errors) as the user types. No docker-compose-schema-specific linting — that is explicitly out of scope, tracked separately by the (not-folded) `configurable-compose-linting` todo.

### Env Var Editor
- **D-20:** Replace the raw textarea env editor with a structured editor supporting **two toggleable modes**: a table mode (key=value rows, add/remove, inline-editable) and a raw text-editor mode. **No dialog-based editing for env vars** — this supersedes an earlier in-discussion note about a dialog.
- **D-21:** Table mode is the default/preferred mode — the user specifically wants inline editing available in table mode rather than routing edits through a dialog.
- **D-22:** Secret masking in the env editor uses a **heuristic**: mask only values whose key name looks like a password/secret/key/token (e.g. matches `/password|secret|key|token/i`), not all values indiscriminately.

### Claude's Discretion
- Exact status-indicator sizing scheme, beyond the pulsing-dot requirement for "running" (D-08)
- Exact additional dashboard stats beyond the required 4 + the updates-available/pending-backups suggestions (D-14)
- Exact mobile-audit findings and fix scope beyond "full component-by-component pass" (D-17)
- Whether the merged Config tab (D-02) needs internal sub-navigation or a simple stacked layout
- Whether the extracted `StatCard` belongs in `components/common/` (generic, per CLAUDE.md's own component-checklist guidance) or `components/domain/stack/`

### Folded Todos
- **`2026-08-28-frontend-refactor-audit.md`** (Audit frontend for reusable-component refactors) — log-viewer.tsx reuse in the Backups tab. Directly matches the roadmap's explicit success criterion #3. Folded into D-03/D-07 scope and the general component-extraction goal.
- **`2026-08-28-redesign-ui-ux-service-colors-mobile.md`** (Redesign UI/UX — service colors, tab layout, mobile support) — split across D-11 (service colors), D-01/D-02 (tab layout), D-17 (mobile).
- **`2026-08-28-redesign-dashboard-statistics.md`** (Redesign dashboard with richer statistics) — folded into D-14.
- **`2026-08-28-update-available-badge-missing-at-stack-level.md`** (Update badge only shown per-service) — folded into D-09.
- **`2026-08-28-update-badge-shown-with-null-latest-tag.md`** (Badge shows even without a latestTag) — folded into D-10.
- **`2026-08-28-add-yaml-env-editor.md`** (Add a sophisticated compose YAML editor and env editor) — folded into D-18 through D-22.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` §Phase 11: UI Rework — phase goal, draft success criteria (log-table consolidation, Card-wrapping reduction, tab-structure decision, dialogs for add/edit flows, status-indicator sizing, backup-page rework)
- GitHub issue [#15](https://github.com/docktor-app/docktor/issues/15) — the open list this phase scopes from
- `CLAUDE.md` §Known Refactoring Targets — documents `[id].tsx` (~587 lines, inline tab sections, local `ServiceStatusBadge`), `settings.tsx` (inline cards), `dashboard.tsx` (inline stat cards) as existing violations this phase should close

### Folded Todos (source)
- `.planning/todos/pending/2026-08-28-frontend-refactor-audit.md`
- `.planning/todos/pending/2026-08-28-redesign-ui-ux-service-colors-mobile.md`
- `.planning/todos/pending/2026-08-28-redesign-dashboard-statistics.md`
- `.planning/todos/pending/2026-08-28-update-available-badge-missing-at-stack-level.md`
- `.planning/todos/pending/2026-08-28-update-badge-shown-with-null-latest-tag.md`
- `.planning/todos/pending/2026-08-28-add-yaml-env-editor.md`

### Existing Code — Stack Detail Page
- `client/src/routes/app/stacks/[id].tsx` — 390 lines, `VALID_TABS = ["overview","compose","environment","logs","backups","proxy"]`; Overview tab stacks 3 Card-wrapped log tables (Deployments inline table ~L259-308, `StatusLogCard` ~L310, `EventLogCard` ~L312)
- `client/src/routes/app/stacks/components/event-log-card.tsx` (121 lines)
- `client/src/routes/app/stacks/components/status-log-card.tsx` (55 lines)
- `client/src/components/domain/stack/log-viewer.tsx` (165 lines) — target for reuse in the Backups tab
- `client/src/routes/app/stacks/components/services-tab.tsx` — per-service "update available" badge (lines ~81-85)
- `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` — existing dialog pattern precedent

### Dashboard / Stack List
- `client/src/routes/app/dashboard.tsx` — inline stat cards (Total/Running/Stopped/Errors), target for `StatCard` extraction
- `client/src/components/domain/stack/stack-list.tsx` — existing "config changed" badge placement/styling to mirror for the new stack-level update-available badge

### Theming
- `next-themes` 0.4.x — already a dependency per `.planning/codebase/STACK.md`; confirmed unwired (no `ThemeProvider`/`useTheme` anywhere in `client/src`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `log-viewer.tsx` streaming/filtering/rendering logic — directly reusable in the Backups tab for restic output (per the frontend-refactor-audit todo)
- Existing "config changed" badge pattern (`stack-list.tsx` + `[id].tsx`) — template for the new stack-level update-available badge
- `service-upgrade-dialog.tsx` — existing dialog pattern the new proxy-config/backup dialogs should follow
- `next-themes` (installed, unwired) — wire up its `ThemeProvider` for dark mode rather than hand-rolling theme state

### Established Patterns
- One-component-per-tab under `client/src/routes/app/stacks/components/` (Phase 6 precedent) — applies to the merged Config tab and any new tab content
- shadcn `Card`-based sectioning — being deliberately reduced per D-03
- CLAUDE.md's "Known Refactoring Targets" table — `[id].tsx`, `settings.tsx`, `dashboard.tsx` already flagged; this phase should close all three

### Integration Points
- `client/src/routes/app/stacks/[id].tsx` — `VALID_TABS` changes (6→5, Compose+Environment merge), Overview tab log consolidation, Card reduction
- `client/src/components/domain/stack/` — new pulsing-dot running-status indicator, stack-level update badge
- `client/src/components/common/` — candidate home for the extracted `StatCard` (generic, per CLAUDE.md's own component checklist)
- A new `client/src/components/common/theme-provider.tsx` (or similar) wired into `client/src/main.tsx` — `next-themes` `ThemeProvider` for dark mode
- `client/src/routes/app/stacks/components/environment-tab.tsx` (or its merged-Config equivalent) — table/text-mode toggle for env editing
- `client/src/routes/app/stacks/components/compose-tab.tsx` — CodeMirror 6 integration

</code_context>

<specifics>
## Specific Ideas

- **Pulsing green dot for "running" status** — the user specifically pictured a pulsing animated indicator (not a static badge) for services/stacks in the running state.
- **Dark mode via `next-themes`** — already installed, just needs wiring: `ThemeProvider`, header toggle, system-preference default with persisted override.
- **CodeMirror over Monaco** — explicit bundle-size concern for a self-hosted app.
- **Table-mode preferred over dialogs for env vars** — the user was explicit: "inline is easier when in table mode instead of dialog." The toggle is between table mode and a raw text-editor mode, not table vs. dialog.
- **Category-based stack colors (media/files, etc.)** — the user's own idea, but they recognized it needs backend changes and it was deferred rather than forced into this phase.

</specifics>

<deferred>
## Deferred Ideas

- **Topology visualization** (graph view of stack/service relationships) — cosmetic severity, belongs in its own future phase. Not folded.
- **Upgrade dialog wrong message for moving-tag services** (`2026-08-28-upgrade-dialog-wrong-message-for-moving-tags.md`) — a correctness bug that touches server code (`update-checker.ts`), not a structural/visual UI-rework item. Not folded — stays a pending todo.
- **Stack-level colors** (D-12) — raised during discussion, explicitly deferred to a future phase.
- **Category-based color grouping** (D-13) — requires a new backend field/model; deferred to a future phase once that backend work is scoped.

### Reviewed Todos (not folded)
- `2026-08-28-upgrade-dialog-wrong-message-for-moving-tags.md` — reviewed via the todo-phase matcher; correctness bug spanning server + client, not a UI-rework item. Deferred as its own fix, not folded here.
- Other automated matches below the folding threshold (`configurable-compose-linting`, `container-status-unknown-after-deploy`, `no-manual-update-check-trigger`, `support-authenticated-custom-registries`, `add-live-resource-stats`, `restic-version-pinned-too-old`, `stale-imageupdatecheck-rows-never-pruned`) were not UI-structural/visual matches and were not presented for folding.

</deferred>

---

*Phase: 11-ui-rework*
*Context gathered: 2026-09-24*
