# Phase 11: UI Rework - Research

**Researched:** 2026-09-25
**Domain:** React 19 client UI restructuring (shadcn/ui, TailwindCSS v4, CodeMirror 6, next-themes)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Page Structure**
- D-01: Keep the tab-based structure on the stack detail page — reorganize content within tabs rather than moving to a single scrolling page or sidebar nav.
- D-02: Merge the Compose and Environment tabs into one **Config** tab. Resulting tab set: Overview, Config, Logs, Backups, Proxy (5, down from today's 6: Overview/Compose/Environment/Logs/Backups/Proxy).
- D-03: Reduce Card wrapping aggressively — flatten most sections to plain divs/dividers; reserve `Card` for genuinely distinct data groupings. Directly replaces today's pattern of 3 stacked Cards on the Overview tab (Deployments table, StatusLogCard, EventLogCard).

**Dialogs for Add/Edit Flows**
- D-04: Proxy config (domain/TLS add-edit) moves into a dialog.
- D-05: Backup schedule / restore config moves into a dialog.
- D-06: Environment variables do **NOT** move to a dialog. See D-20/D-21 — superseded during the Compose/env editor discussion.

**Logs & Status Consolidation**
- D-07: Consolidate the 3 separate log tables on the Overview tab (Deployments, StatusLogCard, EventLogCard) into a **single unified timeline**, filterable by type, replacing 3 stacked Cards with 1 clear surface.
- D-08: Exact status-indicator sizing scheme is left to planner discretion, **except**: the "running" status specifically must use a pulsing animated indicator (e.g. a pulsing green dot), not a plain static badge.
- D-09: Add a stack-level "update available" badge (currently only shown per-service) at **both** the stack-list/dashboard row and the stack detail page header — mirroring exactly how the existing "config changed" badge is placed/styled today in `stack-list.tsx` and `[id].tsx`.
- D-10: When a service's update badge has no `latestTag` (a moving tag like `stable`/`latest`), use distinct copy — "content updated" (no discrete version to offer) vs. "update available → x.y.z" (has one) — rather than suppressing the badge or leaving it ambiguous.

**Visual Polish — Colors**
- D-11: Service colors are auto-derived from a fixed palette via a deterministic hash of the service name (no user override this phase); carried through into the log viewer for log-line attribution.
- D-12 (deferred): Stack-level colors — deferred to a future phase.
- D-13 (deferred): Category-based color grouping — requires a new backend field/model; deferred.

**Visual Polish — Dashboard**
- D-14: Extract the dashboard's 4 existing stat cards (Total/Running/Stopped/Errors) into a reusable `StatCard` component (closes the CLAUDE.md "Known Refactoring Targets" item) **and** add 1-2 more at-a-glance stats — user suggested updates-available count and pending-backups count as candidates. Exact final stat set left to planner discretion.

**Visual Polish — Dark Mode**
- D-15: Add dark mode using `next-themes` (already an installed dependency — confirmed no `ThemeProvider`/`useTheme` wired anywhere in `client/src` today). Default follows OS/system preference; user can manually override; the override persists (next-themes' standard localStorage pattern). — Reversibility: reversible — additive theming layer, no data model impact.
- D-16: The dark mode toggle lives in the app header/nav as an always-visible sun/moon icon — not tucked into Settings only.

**Mobile Support**
- D-17: Full responsive audit, component by component — not a spot-fix of the worst breakage only. No specific pain points were pre-flagged by the user; the researcher/planner should audit fresh.

**Compose Editor**
- D-18: Use **CodeMirror 6** for the compose YAML editor, not Monaco — smaller bundle footprint, better fit for a self-hosted single-process app than Monaco's heavier bundle.
- D-19: The compose editor does **basic YAML syntax validation only** (indentation/syntax errors) as the user types. No docker-compose-schema-specific linting — explicitly out of scope, tracked separately by the (not-folded) `configurable-compose-linting` todo.

**Env Var Editor**
- D-20: Replace the raw textarea env editor with a structured editor supporting **two toggleable modes**: a table mode (key=value rows, add/remove, inline-editable) and a raw text-editor mode. **No dialog-based editing for env vars** — this supersedes an earlier in-discussion note about a dialog.
- D-21: Table mode is the default/preferred mode — inline editing available in table mode rather than routing edits through a dialog.
- D-22: Secret masking in the env editor uses a **heuristic**: mask only values whose key name looks like a password/secret/key/token (matches `/password|secret|key|token/i`), not all values indiscriminately.

### Claude's Discretion
- Exact status-indicator sizing scheme, beyond the pulsing-dot requirement for "running" (D-08)
- Exact additional dashboard stats beyond the required 4 + the updates-available/pending-backups suggestions (D-14)
- Exact mobile-audit findings and fix scope beyond "full component-by-component pass" (D-17)
- Whether the merged Config tab (D-02) needs internal sub-navigation or a simple stacked layout
- Whether the extracted `StatCard` belongs in `components/common/` (generic, per CLAUDE.md's own component-checklist guidance) or `components/domain/stack/`

### Deferred Ideas (OUT OF SCOPE)
- Topology visualization (graph view of stack/service relationships) — future phase.
- Upgrade dialog wrong message for moving-tag services (`update-checker.ts` server bug) — not a structural/visual UI-rework item, stays a pending todo.
- Stack-level colors (D-12) — deferred to a future phase.
- Category-based color grouping (D-13) — requires new backend field/model; deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GitHub #15 (via D-01..D-22) | UI Rework — component architecture, log consolidation, dialogs, status indicators, dark mode, compose/env editors, mobile audit | See Architecture Patterns, Standard Stack, Don't Hand-Roll, and Common Pitfalls below — every D-xx decision is mapped to concrete files/line ranges and a recommended implementation pattern |
</phase_requirements>

## Summary

This phase is a structural and visual refactor of the existing, fully-functional client codebase — no server contract changes are required for the vast majority of the scope. Three areas were investigated in depth: (1) the stack detail page's tab/Card/log structure, (2) two genuinely new pieces of technology (CodeMirror 6 for the compose editor, `next-themes` for dark mode), and (3) a systematic audit of every file CONTEXT.md names as a target.

The codebase is in better shape than CLAUDE.md's "Known Refactoring Targets" table currently states for `[id].tsx` (390 lines today, already broken into `components/` sub-files per the Phase 6 precedent — the table's "~587 lines... inline tab sections" description is stale) but **`settings.tsx` and `dashboard.tsx` are still exactly as CLAUDE.md describes** — `settings.tsx` is now 1125 lines with five inline card components (`SmtpCard`, `NotificationTriggersCard`, `NotificationLogCard`, `BackupRepositoryCard`, `BackupDefaultsCard`) that must be extracted to `routes/app/settings/components/`, mirroring the `ProxySettingsCard`/`CertificatesCard` pattern already established there in Phase 6.

One finding changes the phase's risk profile: **D-09's stack-list/dashboard-row update-available badge cannot be implemented client-only.** `GET /api/stacks` (the list endpoint backing both `dashboard.tsx` and `stack-list.tsx`) calls `stackService.listStacks()` → `StackRepository.findAll()`, which does a plain `prisma.stack.findMany({include: {services: true}})` with **no** `ImageUpdateCheck` join — `updateAvailable`/`latestTag` are computed **only** inside the `GET /api/stacks/:id` route handler (a one-off join added ad hoc to that single route). The list response's `Service` objects genuinely have no `updateAvailable` field today. Closing D-09 at the list surface requires a small, additive server change (repeat the existing join, likely by moving it into `stackService.listStacks()` so both routes share it) — not a violation of the phase's "client rework" framing, but the planner must schedule a server task for it, not assume a pure client change.

Everything else is genuinely additive/refactor-only: dark mode is already 90% done at the CSS layer (`.dark {}` token block and `@custom-variant dark (&:is(.dark *));` already exist in `index.css` — confirmed by reading the file this session), so Phase 11's dark-mode work is JS wiring only (`ThemeProvider` + a toggle + `theme=` props on `CodeMirror`). The "unified timeline" (D-07) has no server dependency either: `stack.deployments`, `stack.statusLogs` (from `useStack`) and `events` (from the sibling `useStackEvents` hook) are three already-reactive, independently-SSE-updated client arrays that can be merged with a pure `useMemo` — no new endpoint, no new SSE event type.

**Primary recommendation:** Treat this phase as three parallel workstreams — (A) stack-detail-page restructure (tabs, unified timeline, dialogs, status pills, service-color util), (B) settings/dashboard extraction (StatCard, five settings cards, stack-level update badge including the server join), and (C) new-tech wiring (dark mode, CodeMirror compose editor, table/raw env editor) — since they touch almost entirely disjoint files and can be planned as separate waves.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab restructure, Card reduction, dialogs, status pills | Browser / Client | — | Pure presentation/composition, no data shape changes |
| Unified activity timeline | Browser / Client | — | Client-side merge of three already-fetched arrays; no new endpoint |
| Dark mode (next-themes) | Browser / Client | — | CSS tokens already exist server-side has no role |
| Compose/env editors (CodeMirror, table mode) | Browser / Client | — | `composeContent`/`envContent` are already raw strings end-to-end (`shared/src/validation/stacks.ts` — `envContent: z.string().optional()`); editor is purely a client-side representation of the same string |
| Stack-level update-available badge (list/dashboard row) | **API / Backend** | Browser / Client | `GET /api/stacks` list route has no `ImageUpdateCheck` join today — verified by reading `server/src/repositories/stack-repository.ts:35-40` and `server/src/application/stack-service.ts:75-79`; must be added server-side before the client can render it at the list surface |
| Stack-level update-available badge (detail page header) | Browser / Client | — | `GET /api/stacks/:id` already performs this join (`server/src/routes/stacks.ts:64-86`); client can derive `services.some(s => s.updateAvailable)` today with zero server change |
| Service-color hashing | Browser / Client | — | Pure function of `serviceName`; already implemented once (`log-viewer.tsx`), needs extraction/reuse, not a new algorithm |

## Standard Stack

### Core (new dependencies this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@uiw/react-codemirror` | ^4.25.12 [VERIFIED: npm registry — `npm view @uiw/react-codemirror version`] | React wrapper around CodeMirror 6 (state/view/commands) | Most widely used CodeMirror-in-React wrapper (3.2M weekly downloads per npm); avoids hand-wiring `EditorView`/`EditorState`/React lifecycle directly. Package legitimacy: see audit table — flagged `SUS` by the automated gate for an unrelated reason (see note below) |
| `@codemirror/lang-yaml` | ^6.1.3 [VERIFIED: npm registry] | YAML syntax highlighting/indentation for the compose editor | Official CodeMirror language package (`codemirror/lang-yaml` org repo) |
| `@codemirror/lint` | ^6.9.7 [VERIFIED: npm registry] | Diagnostic/gutter-marker framework for D-19's "basic syntax validation only" | Official CodeMirror package; the standard way to surface parse errors as inline squiggles without building a docker-compose-schema linter (which is explicitly out of scope per D-19) |
| `yaml` | ^2.9.1 [VERIFIED: npm registry] | Parses compose YAML client-side to detect syntax errors for the linter source function | Already a **server** dependency at `^2.7.0` (`server/package.json:27`, confirmed by reading the file) — same library family, same error-shape assumptions the linter will map from `YAMLParseError` to a CodeMirror `Diagnostic` |
| `next-themes` | ^0.4.6 [VERIFIED: npm registry; already in `client/package.json`] | Theme state (system/light/dark), persistence, no-flash `<html>` class injection | Purpose-built for exactly this (class-strategy dark mode with SSR/hydration-safe flash prevention); already an installed, unwired dependency — confirmed via `grep -rn "next-themes\|ThemeProvider\|useTheme" client/src` returning zero matches this session |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` `useFieldArray` | ^7.71.1 (already installed) | Dynamic add/remove rows for the table-mode env editor (D-20/D-21) | The project's own CLAUDE.md mandates `react-hook-form` for all forms — `useFieldArray` is RHF's dedicated primitive for exactly this "list of key/value rows with add/remove" shape, avoiding a hand-rolled array-of-`useState` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@uiw/react-codemirror` | Raw `@codemirror/state` + `@codemirror/view` + manual React `useRef`/`useEffect` wiring | More control, smaller true bundle, but reimplements value-sync/controlled-component lifecycle that `@uiw/react-codemirror` already solves correctly for React 18/19 — not worth it for a single compose+env editor use case |
| `@uiw/react-codemirror`'s built-in `theme="light"`/`"dark"` string prop | A separate theme package (`@uiw/codemirror-theme-github`, `@codemirror/theme-one-dark`) | The wrapper accepts the literal strings `"light"` / `"dark"` directly [CITED: npm/GitHub search — @uiw/react-codemirror README examples] and switches CodeMirror's built-in default theme with no extra dependency; **recommended default** — only add a themed package if the plain default look is rejected in review, since it's one more `SUS`-flagged (see audit) dependency for cosmetic benefit only |
| `yaml` parse-then-catch linter | A dedicated `@codemirror/lang-yaml` "lint" export | `@codemirror/lang-yaml` does not ship a linter — only highlighting/folding/indent info [CITED: github.com/codemirror/lang-yaml] — a custom `linter()` wrapping `yaml`'s `parseDocument()`/`parse()` and its errors (which carry line/column via `YAMLParseError.linePos`) is the documented community pattern [CITED: discuss.codemirror.net "YAML Linter for @uiw/react-codemirror or codemirror v6"] |

**Installation:**
```bash
yarn workspace @docktor/client add @uiw/react-codemirror @codemirror/lang-yaml @codemirror/lint yaml
```
(`next-themes` and `react-hook-form` are already installed — no `yarn add` needed for those.)

**Version verification:** All four new-package versions above were confirmed live via `npm view <pkg> version` this session (2026-09-25); training-data versions for CodeMirror packages are commonly stale by several minor versions, so this check matters.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `@uiw/react-codemirror` | npm | created 2018-07-02 [VERIFIED: `npm view @uiw/react-codemirror time.created`] | 3.2M/wk | github.com/uiwjs/react-codemirror | `SUS` (gate reason: `too-new`) | **Approved with note** — see below |
| `@codemirror/lang-yaml` | npm | — | 3.9M/wk | github.com/codemirror/lang-yaml | `OK` | Approved |
| `@codemirror/lint` | npm | — | 8.7M/wk | code.haverbeke.berlin/codemirror/lint | `OK` | Approved |
| `next-themes` | npm | — | 19.6M/wk | github.com/pacocoursey/next-themes | `OK` | Approved (already installed) |
| `yaml` | npm | created 2011-04-15 [VERIFIED: `npm view yaml time.created`] | 149.5M/wk | github.com/eemeli/yaml | `SUS` (gate reason: `too-new`) | **Approved with note** — see below |

**Note on the two `SUS` verdicts:** The `package-legitimacy check` seam's `too-new` signal is computed from the **latest published version's** timestamp (both packages had a routine release within the last ~2 weeks of this research date), not the package's inception date. `npm view <pkg> time.created` shows `@uiw/react-codemirror` was first published 2018-07-02 and `yaml` was first published 2011-04-15 — both are long-established packages (3.2M and 149.5M weekly downloads respectively), and `yaml` is **already a direct dependency of `server/package.json`** in this exact monorepo. These are false positives from a recency-only heuristic, not slopsquatting risk. The planner should still add a `checkpoint:human-verify` task per the protocol's letter (the gate's literal verdict is `SUS`), but the finding above is the evidence for a fast confirm, not a red flag requiring alternative packages.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@uiw/react-codemirror`, `yaml` — see note above; planner inserts one lightweight `checkpoint:human-verify` covering both before the `yarn add` task.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  StackDetailPage ([id].tsx)                                          │
│                                                                        │
│  useStack(id) ───────┐        useStackEvents(id) ───────┐            │
│   (SSE: container_    │        (SSE: config_changed/     │            │
│    state, stack_       │         config_error/           │            │
│    status, config_*)   │         update_available)       │            │
│         │              │                 │                │           │
│         ▼              ▼                 ▼                ▼           │
│   stack.deployments  stack.statusLogs  events[]     (both hooks      │
│         │                  │              │          already live-   │
│         └──────────┬───────┴──────────────┘          updating)      │
│                     ▼                                                 │
│         useMemo: normalize + merge + sort desc                        │
│                     ▼                                                 │
│         ┌───────────────────────────┐                                 │
│         │  Unified Timeline (D-07)  │  ← replaces 3 stacked Cards     │
│         │  filterable by type       │                                 │
│         └───────────────────────────┘                                 │
│                                                                        │
│  Tabs: Overview | Config | Logs | Backups | Proxy   (D-01/D-02)       │
│                       │                                                │
│                       ▼                                                │
│         CodeMirror(compose) / CodeMirror-or-Table(env)  (D-18..D-22)  │
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐      ┌───────────────────────────────┐
│ Backup Detail Page          │      │ LogViewer (log-viewer.tsx)     │
│ ([backupId].tsx)            │      │  - toolbar (autoscroll/ts/wrap)│
│  useBackupStream → string[] │─────▶│  - terminal render + service   │
│  (today: <LogOutput/>)      │ D-03 │    color via getServiceColor() │
│  (target: shared terminal   │ /D-07│  - currently coupled to        │
│   component from LogViewer) │      │    useLogStream(SSE) directly  │
└────────────────────────────┘      └───────────────────────────────┘
        Both need to consume a common presentational "terminal" piece —
        see Pattern 2 below for the extraction that makes this possible.

┌──────────────────────┐   ┌───────────────────────────┐
│ Dashboard / StackList │   │ next-themes ThemeProvider  │
│  StatCard × N (D-14)  │   │  wraps <App/> in main.tsx  │
│  stack-level update    │──▶│  toggle rendered in         │
│  badge (D-09) — needs  │   │  PageHeader's top row       │
│  server join, see      │   │  (rendered by every page)   │
│  Common Pitfalls        │   │  (D-16)                     │
└──────────────────────┘   └───────────────────────────┘
```

### Recommended Project Structure

```
client/src/
├── components/
│   ├── common/
│   │   ├── layout/page.tsx           # add toggle slot to PageHeader's top row (D-16)
│   │   ├── theme-provider.tsx        # NEW — thin next-themes wrapper
│   │   ├── theme-toggle.tsx          # NEW — sun/moon icon button, next to SidebarTrigger
│   │   └── stat-card.tsx             # NEW — extracted from dashboard.tsx (D-14)
│   └── domain/
│       └── stack/
│           ├── log-terminal.tsx       # NEW — presentational piece extracted from log-viewer.tsx
│           ├── stack-timeline.tsx     # NEW — unified timeline (D-07), replaces event/status cards
│           ├── status-pill.tsx        # NEW — single sizing scheme + pulsing "running" dot (D-08)
│           └── service-update-badge.tsx # NEW — shared component for D-09/D-10 copy logic
├── lib/
│   └── service-color.ts               # NEW — hash util extracted from log-viewer.tsx (D-11)
├── hooks/
│   └── use-stack-timeline.ts          # NEW — useMemo merge of deployments+statusLogs+events
└── routes/app/
    ├── settings/components/
    │   ├── smtp-card.tsx              # extracted from settings.tsx:113-332
    │   ├── notification-triggers-card.tsx # extracted from settings.tsx:332-522
    │   ├── notification-log-card.tsx  # extracted from settings.tsx:522-606
    │   ├── backup-repository-card.tsx # extracted from settings.tsx:606-834
    │   └── backup-defaults-card.tsx   # extracted from settings.tsx:834-1091
    └── stacks/
        ├── [id].tsx                   # VALID_TABS → 5; renders StackTimeline, ConfigTab
        ├── backups/[backupId].tsx     # swap <LogOutput/> for the shared log-terminal piece
        └── components/
            ├── config-tab.tsx         # NEW — merges compose-tab + environment-tab (D-02)
            ├── compose-editor.tsx     # NEW — CodeMirror + yaml linter (D-18/D-19)
            ├── env-editor.tsx         # NEW — table/raw toggle (D-20/D-21/D-22)
            ├── proxy-assign-dialog.tsx # NEW — proxy-tab.tsx's Card form → Dialog (D-04)
            └── backup-schedule-dialog.tsx # NEW — backup-config-card.tsx's schedule/retention → Dialog (D-05)
```

### Pattern 1: Client-side unified timeline (D-07) — no new endpoint

**What:** Merge three already-fetched, already-SSE-live arrays into one sorted, typed list.
**When to use:** Overview tab, replacing the 3 stacked Cards at `[id].tsx:259-312`.
**Why this is safe:** `useStack(id)` already carries `stack.deployments` and `stack.statusLogs`, both live-updated by its own `useContainerEvents` handler (`use-stack.ts:51-92`, confirmed by reading the file). `useStackEvents(id)` is a sibling hook with its own independent SSE subscription (`use-stack-events.ts:49-59`). Neither hook needs to change; a new hook just derives from both.

```typescript
// Source: derived from client/src/hooks/use-stack.ts and use-stack-events.ts
// (both read this session — StackDetail.deployments/statusLogs and StackEvent[] shapes below
// are copied verbatim from client/src/lib/stacks-api.ts:39-64)
export type TimelineEntryType = "deployment" | "status" | "event";

export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  timestamp: string; // ISO string, used for sort
  // ...type-specific fields carried through unchanged from the source record
}

export function useStackTimeline(
  deployments: StackDetail["deployments"],
  statusLogs: StackDetail["statusLogs"],
  events: StackEvent[] | null,
): TimelineEntry[] {
  return useMemo(() => {
    const merged: TimelineEntry[] = [
      ...deployments.map((d) => ({id: d.id, type: "deployment" as const, timestamp: d.deployedAt, ...d})),
      ...statusLogs.map((s) => ({id: s.id, type: "status" as const, timestamp: s.createdAt, ...s})),
      ...(events ?? []).map((e) => ({id: e.id, type: "event" as const, timestamp: e.createdAt, ...e})),
    ];
    return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [deployments, statusLogs, events]);
}
```

### Pattern 2: Decouple LogViewer's terminal rendering from its SSE hook (enables backup-page reuse)

**What:** `log-viewer.tsx` (165 lines, read this session) currently does three things in one component: (1) owns `useLogStream(stackId, service, enabled)` — a stack-log-specific SSE hook, (2) owns toolbar state (autoscroll/timestamps/wrap/service-select), (3) renders the terminal with `getServiceColor()`-based line coloring. `[backupId].tsx` needs the same terminal rendering (ANSI, autoscroll, monospace) but its data source is `useBackupStream()`, which returns plain `string[]` with **no** `service` field — structurally incompatible with `LogLineEvent[]`.

**When to use:** Extracting a presentational `LogTerminal` component that both `LogViewer` (stack logs) and the backup detail page can render, closing the CONTEXT.md-mandated backup/backup-detail → log-viewer reuse (folded from `2026-08-28-frontend-refactor-audit.md`).

**Recommended shape:** normalize both data sources to a common `{line: string; service?: string; timestamp?: string}[]` at the call site — `LogViewer` maps `LogLineEvent[]` through unchanged (already has `service`), the backup page maps its `string[]` to `{line}` objects (no `service`, so the terminal simply omits the service-color prefix span when `service` is undefined).

```typescript
// Source: extracted from client/src/components/domain/stack/log-viewer.tsx (read this session)
interface LogTerminalLine {
  line: string;
  service?: string;
  timestamp?: string;
}

interface LogTerminalProps {
  lines: LogTerminalLine[];
  autoScroll: boolean;
  lineWrap?: boolean;
  showTimestamps?: boolean;
  emptyMessage?: string;
}
// LogViewer keeps its toolbar (service select, connected/disconnected) and passes
// mapped LogLineEvent[] into <LogTerminal/>. The backup detail page renders
// <LogTerminal lines={displayLines.map(line => ({line}))} autoScroll={isStillStreaming}/>
// directly, no toolbar needed (mirrors today's LogOutput usage at [backupId].tsx:295-299).
```

This is the direct blocker CONTEXT.md's canonical refs call out ("`log-viewer.tsx` streaming/filtering/rendering logic — directly reusable in the Backups tab") — the "directly reusable" framing undersells the type mismatch; the extraction above is the actual mechanism.

### Pattern 3: Service-color hashing extraction (D-11)

**What:** `getServiceColor()` already exists and is already deterministic (`log-viewer.tsx:13-32`, read this session — hashes `serviceName` via `charCodeAt`/bit-shift into one of 10 fixed `text-*-400` Tailwind classes). D-11 does **not** ask for a new algorithm; it asks for this to be reusable beyond `log-viewer.tsx` (e.g., in `ServicesTab`'s service rows, the new unified timeline, and the log-terminal extraction above).
**Recommendation:** Move the function verbatim to `client/src/lib/service-color.ts`, export it, and import it wherever a service needs a consistent color (log terminal, services table row accent, timeline entries attributed to a service).

```typescript
// Source: client/src/components/domain/stack/log-viewer.tsx:13-32 (read this session, verbatim)
const SERVICE_COLORS = [
  "text-cyan-400", "text-yellow-400", "text-pink-400", "text-purple-400",
  "text-orange-400", "text-lime-400", "text-sky-400", "text-rose-400",
  "text-indigo-400", "text-emerald-400",
];

export function getServiceColor(serviceName: string): string {
  let hash = 0;
  for (let i = 0; i < serviceName.length; i++) {
    hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}
```

### Pattern 4: Proxy assign-domain form → Dialog (D-04)

**What:** `proxy-tab.tsx` (471 lines, read this session) currently renders the "Assign Domain" `react-hook-form` form inline in a `Card` at the bottom of the tab (lines 285-442), using `assignDomainSchema` from `@docktor/shared` with `standardSchemaResolver`. D-04 asks for this to move into a `Dialog`.
**Precedent to follow:** `service-upgrade-dialog.tsx` (183 lines, read this session) is the established Dialog-with-form pattern in this codebase — `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter` wrapping a controlled form, `open`/`onOpenChange` props, `toast.promise` on submit. The proxy dialog should follow the same shell; the form fields/`Form`+`FormField` wiring inside can be lifted verbatim from `proxy-tab.tsx`'s existing `<Form {...form}>` block (lines 289-441) into the new `DialogContent`.
**Trigger:** Replace the always-visible Card with a "Assign Domain" `Button` that opens the dialog (mirrors how `ServicesTab` opens `ServiceUpgradeDialog` via a per-row icon button, `services-tab.tsx:118`).

### Pattern 5: Backup schedule/retention → Dialog (D-05)

**What:** `backup-config-card.tsx` (276 lines, read this session) mixes two concerns in one Card: (1) an always-relevant "Backup Now" trigger + volume warnings, and (2) a schedule/retention/hooks configuration form (lines 144-249) that's edited far less often. D-05 moves (2) into a dialog, leaving (1) — the frequently-used action — inline.
**Recommendation:** Keep a slim `BackupConfigCard` showing current schedule/retention as read-only text + an "Edit configuration" button that opens a `BackupScheduleDialog` containing the existing form state/handlers (`useGlobalSchedule`, `schedule`, `useGlobalRetention`, `keepDaily/Weekly/Monthly`, `preHook`, `postHook`, `handleSave`) moved as-is into the dialog.

### Pattern 6: Dark mode wiring (D-15/D-16)

**What:** `index.css` (read this session) already has `@custom-variant dark (&:is(.dark *));` (line 5) and a complete `.dark { --background: ...; }` token block (lines 83-113) matching every `:root` token 1:1. This is next-themes' `attribute="class"` strategy already satisfied at the CSS layer — **no CSS changes needed**, only:

1. Wrap the app in `next-themes`' `ThemeProvider` (attribute `class`, `defaultTheme="system"`, `enableSystem`) in `main.tsx`, around `<App/>`. `suppressHydrationWarning` goes on `<html>` in `index.html` [CITED: next-themes README / community Tailwind v4 guides — the blocking inline script next-themes injects is what avoids the flash-of-wrong-theme, not a client-side `useEffect`].
2. Add a `theme-toggle.tsx` using `useTheme()` from `next-themes` (sun/moon icon swap, `setTheme("light"|"dark")`).
3. Render the toggle in `PageHeader`'s top row (`components/common/layout/page.tsx:24-34`, read this session) next to the existing `SidebarTrigger` — since every page (`dashboard.tsx`, `[id].tsx`, `settings.tsx`, `backups/[backupId].tsx`) renders `<PageHeader>`, this is the one place that satisfies D-16's "always-visible" requirement without inventing a new persistent app-wide header (the app currently uses a `Sidebar` layout, not a top bar — confirmed via `app-layout.tsx`/`app-sidebar.tsx`, read this session).
4. Wire `<CodeMirror theme={resolvedTheme === "dark" ? "dark" : "light"}/>` in the compose/env editors so the editor follows the app theme (`useTheme()`'s `resolvedTheme` — not `theme`, since `theme` can be `"system"`).

### Anti-Patterns to Avoid
- **Hand-rolled `<div className="fixed w-64 h-64 ...">` theme flash guards:** next-themes already solves this with a blocking inline script; don't add a custom `useEffect`-based "mounted" gate for the whole page — only gate the *toggle icon itself* if SSR/hydration mismatch on the icon specifically becomes an issue (this app has no SSR, so this is unlikely to even be needed, but it's the documented caveat if it comes up).
- **Duplicating the `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-*-100 text-*-800 dark:bg-*-900 dark:text-*-200` pill markup:** this exact class string is hand-copied at minimum 4 places today (`stack-list.tsx:32,37`, `services-tab.tsx:82`, `[backupId].tsx:273`, `event-log-card.tsx` via `Badge`) — see Don't Hand-Roll below.
- **A new server endpoint for the unified timeline:** not needed — see Pattern 1. Resist the temptation to build a `/api/stacks/:id/timeline` endpoint; the merge is a client concern only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status/config pills (`config changed`, `update available`, backup trigger label) | More copy-pasted `inline-flex items-center rounded-full px-2 py-0.5 ...` spans | Extend the existing `Badge` component (`components/ui/badge.tsx`, CVA-based) with the color variants needed, or a single new `StatusPill` domain component built on top of `Badge` | 4+ files already hand-roll the identical class string (verified this session: `stack-list.tsx:32-40`, `services-tab.tsx:82-85`, `[backupId].tsx:273-275`); D-08's "single consistent sizing scheme" is unenforceable while every call site re-types its own classes |
| Table-mode env-var rows (add/remove key=value pairs) | Array of `useState` calls with manual index-based add/remove | `react-hook-form`'s `useFieldArray` | CLAUDE.md mandates react-hook-form for all forms; `useFieldArray` is RHF's dedicated primitive for exactly this list-of-rows shape and integrates with the existing `standardSchemaResolver` pattern already used in `proxy-tab.tsx` |
| YAML syntax error detection | A hand-rolled line-by-line indentation checker | `yaml`'s `parseDocument()` + its thrown `YAMLParseError` (carries `linePos`) fed into a `@codemirror/lint` `linter()` source function | `yaml` is a mature, already-vetted parser (server dependency); its error objects already carry the line/column info a CodeMirror `Diagnostic` needs — reimplementing YAML's indentation grammar is exactly the kind of "deceptively complex" problem this rule exists for |
| Deterministic service coloring | A new hash function | The existing `getServiceColor()` (extract, don't reinvent — see Pattern 3) | Already correct, already deterministic, already used in production; D-11 only asks for wider reuse |
| Dark mode flash prevention / persistence | Custom `localStorage` read + `useEffect` class toggle | `next-themes`' `ThemeProvider` | Purpose-built, already installed, handles the SSR/hydration-safe blocking-script trick that a hand-rolled `useEffect` cannot replicate without a flash |

**Key insight:** Nearly every "Don't Hand-Roll" item in this phase is really a **consolidation** problem, not a new-capability problem — the codebase already has correct implementations of status pills, service coloring, and dialog forms in at least one place; the work is extracting and reusing them, not building anything new from scratch.

## Common Pitfalls

### Pitfall 1: D-09's list/dashboard badge silently becomes a no-op without a server change
**What goes wrong:** A task is written as "add `services.some(s => s.updateAvailable)` to `StackList`'s Status column" and ships — but `stack.services[].updateAvailable` is `undefined` for every stack in the list response, so the badge never renders, and the bug isn't caught by a type error (the `Service` interface in `stacks-api.ts` already declares `updateAvailable?: boolean` as optional, so `undefined` typechecks fine).
**Why it happens:** The field only exists on the **detail** route's response (`server/src/routes/stacks.ts:79-86`, an inline join added directly in the route handler, not in `StackRepository` or `StackService`). The **list** route (`GET /api/stacks` → `stackService.listStacks()` → `StackRepository.findAll()`, confirmed by reading `server/src/repositories/stack-repository.ts:35-40` and `server/src/application/stack-service.ts:75-79`) has no equivalent join.
**How to avoid:** Plan an explicit server task: move the `ImageUpdateCheck` join logic out of the route handler and into `StackService` (e.g. a shared private method both `listStacks()` and `getStack()` call), so both surfaces get `updateAvailable`/`latestTag` consistently. This is a small, additive, non-breaking change (adds an optional field to the list response) but it is a **server** change in a phase otherwise scoped to the client — flag it explicitly in the plan so it isn't dropped as "out of scope."
**Warning signs:** Any task description for D-09 that says "purely client-side" for the list/dashboard half of the badge.

### Pitfall 2: `LogViewer` and `LogOutput`/`useBackupStream` are not drop-in compatible
**What goes wrong:** A task says "reuse `LogViewer` in the Backups tab" and an implementer tries to pass `useBackupStream()`'s `string[]` directly into `LogViewer`'s `serviceNames`/`useLogStream`-coupled props, or tries to swap in `useLogStream(stackId, service, enabled)` for backup data (which doesn't exist — backups aren't containers, there's no `/api/stacks/:id/logs`-shaped endpoint for them).
**Why it happens:** CONTEXT.md's framing ("`log-viewer.tsx` streaming/filtering/rendering logic — directly reusable") elides the fact that `LogViewer` currently owns its own SSE hook internally, coupled to stack container logs specifically.
**How to avoid:** Follow Pattern 2 above — extract a presentational `LogTerminal` that takes `lines` as a prop, and have each page own its own data-fetching hook (`useLogStream` for stack logs, `useBackupStream` for backups) feeding that shared terminal.
**Warning signs:** Any diff that imports `useLogStream` into the backup detail page, or that tries to give `LogViewer` a `lines` prop without first splitting the component.

### Pitfall 3: CodeMirror `value`/`onChange` vs. this codebase's existing dirty-tracking pattern
**What goes wrong:** `[id].tsx`'s current compose/env `useEffect` (lines 52-61, read this session) refetches `getComposeContent`/`getEnvContent` whenever `stack.lastKnownHash` changes, **unless** the user has unsaved local edits (`composeDirty`/`envDirty` guards). If the CodeMirror integration doesn't preserve this same dirty-guard (e.g., because `@uiw/react-codemirror`'s uncontrolled-by-default internal state diverges from the `value` prop on external updates), a background SSE-triggered stack refresh could silently clobber in-progress edits, or conversely never pick up a legitimate external file change.
**Why it happens:** `@uiw/react-codemirror` is normally used as a controlled component (`value`+`onChange`), but CodeMirror 6's internal `EditorState` is itself the source of truth once mounted — passing a new `value` prop when the document already changed internally requires care (the wrapper does handle this correctly for the common case, but it's a behavior worth explicitly testing, not assuming).
**How to avoid:** Keep the existing `composeDirty`/`envDirty` state pattern unchanged around the new editor; only swap the `<Textarea>` for `<CodeMirror>` with the same `value`/`onChange={(val) => {setComposeContent(val); setComposeDirty(true)}}` wiring. Add a test asserting a background refresh does not overwrite the editor while dirty (mirrors the existing pattern already proven for the textarea).
**Warning signs:** Content resetting unexpectedly while typing, or external compose-file changes never appearing in the editor after a save.

### Pitfall 4: Env var table-mode round-trip must preserve non-KV lines
**What goes wrong:** `.env` files commonly contain comments (`# comment`) and blank lines. A naive table-mode parser that does `content.split("\n").map(line => line.split("="))` and then serializes back from the table will silently drop comments and blank-line formatting on save, which is a data-loss regression for any stack whose `.env` was hand-annotated.
**Why it happens:** D-20/D-21 ask for a structured table view, but the underlying storage (`envContent: z.string().optional()` on `updateStackSchema`, `shared/src/validation/stacks.ts:23`, read this session) is still a raw string with no comment-preservation contract.
**How to avoid:** Either (a) table mode only edits recognized `KEY=value` lines and preserves/re-emits all other lines (comments, blanks) in their original position on save, or (b) explicitly document to the user that switching to table mode and saving will strip comments (a real UX tradeoff, not just an implementation detail) — this decision should be made explicit in the plan, not discovered during implementation.
**Warning signs:** A round-trip test (load `.env` with a comment → open table mode → save without editing → compare) failing to preserve the comment.

### Pitfall 5: `settings.tsx` extraction is larger than CLAUDE.md's table suggests
**What goes wrong:** A plan estimates "extract a couple of inline cards" based on CLAUDE.md's Known Refactoring Targets table description, then discovers the file is 1125 lines (not the size implied) with five separate inline components spanning ~980 of those lines (`SmtpCard` 113-332, `NotificationTriggersCard` 332-522, `NotificationLogCard` 522-606, `BackupRepositoryCard` 606-834, `BackupDefaultsCard` 834-1091 — all verified by reading the file this session), each with its own `useState`/`useEffect`/save handlers.
**How to avoid:** Size this as its own task/wave, not a quick cleanup folded into another task. `ProxySettingsCard`/`CertificatesCard` (already extracted to `routes/app/settings/components/` in Phase 6) are the exact precedent to copy — same directory, same "props in, `toast.promise` save handler inside" shape.

## Code Examples

### YAML syntax linter for CodeMirror (D-19)
```typescript
// Pattern per discuss.codemirror.net "YAML Linter for @uiw/react-codemirror or codemirror v6"
// [CITED: discuss.codemirror.net] combined with the `yaml` package already used server-side
import {linter, type Diagnostic} from "@codemirror/lint";
import {parseDocument} from "yaml";

export const yamlSyntaxLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const doc = parseDocument(view.state.doc.toString());
  for (const error of doc.errors) {
    const [from, to] = error.pos ?? [0, view.state.doc.length];
    diagnostics.push({from, to, severity: "error", message: error.message});
  }
  return diagnostics;
});
```

### CodeMirror wired to the app's dark mode
```tsx
import CodeMirror from "@uiw/react-codemirror";
import {yaml} from "@codemirror/lang-yaml";
import {useTheme} from "next-themes";
import {yamlSyntaxLinter} from "./yaml-syntax-linter";

export function ComposeEditor({value, onChange}: {value: string; onChange: (v: string) => void}) {
  const {resolvedTheme} = useTheme(); // "light" | "dark", resolved even when theme === "system"
  return (
    <CodeMirror
      value={value}
      height="400px"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      extensions={[yaml(), yamlSyntaxLinter]}
      onChange={onChange}
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Plain `<Textarea>` for compose/env editing (`[id].tsx:315-365`, current) | CodeMirror 6 via `@uiw/react-codemirror` | This phase | Syntax highlighting + inline error diagnostics for compose YAML |
| `LogOutput` (plain string-array terminal, no service coloring) for backup logs | Shared `LogTerminal` extracted from `LogViewer`, feeding both stack and backup pages | This phase | One terminal implementation instead of two near-duplicates |
| 3 stacked `Card`s (Deployments table, `StatusLogCard`, `EventLogCard`) on Overview | Single filterable unified timeline | This phase | Directly implements D-07 |
| No theme switching (light-only, though dark tokens already defined in CSS) | `next-themes` `ThemeProvider` + header toggle | This phase | D-15/D-16 |

**Deprecated/outdated:**
- CLAUDE.md's `[id].tsx` line-count/description in "Known Refactoring Targets" (`~587 lines; all tab sections inline; ServiceStatusBadge defined locally`) is stale — the file is 390 lines today and already uses `routes/app/stacks/components/` sub-files (`ServiceStatusBadge` now lives in `components/domain/stack/service-status-badge.tsx`, not inline). The planner should update this CLAUDE.md table entry as part of this phase's cleanup, since it will otherwise keep misleading future sessions. `settings.tsx` and `dashboard.tsx`'s table entries, by contrast, are still accurate and current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `@uiw/react-codemirror`'s `theme` prop accepts the literal strings `"light"`/`"dark"` directly without an extra theme package | Standard Stack / Alternatives Considered / Code Examples | Low — if wrong, planner adds one small theme-package dependency (`@codemirror/theme-one-dark` + a light equivalent); does not block the phase, just adds one more approved-but-optional dependency |
| A2 | `react-hook-form`'s `useFieldArray` is the right primitive for the table-mode env editor and integrates cleanly with the existing `standardSchemaResolver` pattern | Standard Stack / Don't Hand-Roll | Low-medium — this is well-established RHF API, but not verified against this project's exact RHF 7.71.1 + Zod 4 + standard-schema-resolver combination this session; if a version mismatch surfaces, fallback is a plain `useState<Array<{key,value}>>` with manual add/remove, which is what D-20 describes at minimum |
| A3 | CodeMirror 6 bundle size is meaningfully smaller than Monaco (cited as "50-200kB depending on features" vs. Monaco's "~2-5MB") | Alternatives Considered (implicit, D-18 is already locked so this isn't a live decision) | None — D-18 already locks CodeMirror; this is background justification only, not a decision point |
| A4 | The `.env` table-mode round-trip should preserve comments/blank lines rather than silently stripping them (Pitfall 4) | Common Pitfalls | Medium — if the planner instead decides silent stripping is acceptable, this should be an explicit user-facing decision (confirmed with the user), not an implementation-detail default |

**Note:** All other claims in this research (file paths, line numbers, existing component shapes, server route/join behavior, CSS token presence) were verified by reading the actual source files this session and are tagged `[VERIFIED: <path>:<lines>]` inline where they appear, or stated as plain facts backed by a `Read`/`Bash grep` in this session's tool transcript.

## Open Questions

1. **Should `StatCard` (D-14) live in `components/common/` or `components/domain/stack/`?**
   - What we know: CONTEXT.md explicitly leaves this to Claude's discretion, and CLAUDE.md's own component checklist says generic (label/value/icon-parameterized) components belong in `common/`.
   - What's unclear: whether the "updates-available count" / "pending-backups count" stat variants need domain-specific formatting logic embedded in the card itself (which would push it toward `domain/`) or can stay purely presentational with the domain logic computed by the caller (`dashboard.tsx`) and passed as props.
   - Recommendation: build `StatCard` as a pure `{label, value, icon, valueClassName?}` presentational component in `components/common/`, per CLAUDE.md's own checklist — compute the updates-available/pending-backups counts in `dashboard.tsx` itself (it already computes `total`/`running`/`stopped`/`errors` the same way).

2. **Does D-09's stack-level badge on the detail-page header need a new component, or can it reuse the per-service pill from `services-tab.tsx`?**
   - What we know: The per-service pill already has the D-10 copy logic needed (`update available → x.y.z` vs. a bare fallback) once D-10 is implemented there.
   - What's unclear: whether "stack-level" should aggregate to a single badge (e.g., "3 updates available") or just a boolean presence indicator mirroring the config-changed pill's binary on/off styling.
   - Recommendation: mirror the config-changed pill exactly, as D-09 literally specifies ("mirroring exactly how... config changed badge is placed/styled") — a binary presence pill, not a count, keeping parity with the existing pattern it's explicitly asked to copy.

3. **Mobile audit (D-17) scope boundary between "fix in this phase" and "file as follow-up todo"**
   - What we know: D-17 asks for a full component-by-component audit, not a spot-fix.
   - What's unclear: whether every finding must be fixed in-phase or whether low-severity findings can be filed as follow-up GitHub issues (per CLAUDE.md's issue-tracking process) if the audit surfaces more than fits in this phase's scope.
   - Recommendation: the planner should timebox the audit itself as one task, then triage findings into "fix now" (breaks core Docktor UAT flows on mobile — deploy, view logs, view status) vs. "file as issue" (cosmetic misalignment), consistent with how Phase 9's UAT findings were triaged.

## Environment Availability

No external service/CLI dependencies are introduced by this phase — all new packages (`@uiw/react-codemirror`, `@codemirror/lang-yaml`, `@codemirror/lint`, `yaml`) are pure npm/JS libraries with no native binaries, and `next-themes` is already installed. Standard `yarn install` in the `client` workspace is sufficient; no environment audit is needed beyond the existing Node/Yarn toolchain already required by every other phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (client unit) + Playwright 1.58.2 (client integration/E2E) [VERIFIED: `client/package.json`, read this session] |
| Config file | `client/vitest.config.ts` (unit), `client/playwright.config.ts` (E2E) — both read this session |
| Quick run command | `yarn workspace @docktor/client test` |
| Full suite command | `yarn workspace @docktor/client test && yarn workspace @docktor/client test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| D-07 | Unified timeline merges deployments+statusLogs+events, sorted desc, filterable | unit (hook) | `vitest run test/unit/hooks/use-stack-timeline.test.ts` | ❌ Wave 0 |
| D-08 | "Running" status renders a pulsing indicator, not a static badge | unit (component) | `vitest run test/unit/components/status-pill.test.tsx` | ❌ Wave 0 |
| D-09/D-10 | Stack-level + per-service update badges show correct copy for null vs. present `latestTag` | unit (component) + integration (server join) | `vitest run test/unit/routes/stacks/services-tab.test.tsx`; server: `yarn workspace @docktor/server test:unit` for the new `listStacks()` join | Partial — `services-tab.test.tsx` likely exists (extend it); server join test is new, Wave 0 |
| D-04/D-05 | Proxy/backup dialogs submit correctly, replacing the inline Card forms | unit (component) | existing `proxy-tab.test.tsx`/`backup-config-card.test.tsx` (if present) adapted to dialog interaction | Verify at plan time — not confirmed present this session |
| D-15/D-16 | Theme toggle switches `.dark` class, persists across reload, defaults to system preference | unit (component) | `vitest run test/unit/components/theme-toggle.test.tsx` | ❌ Wave 0 |
| D-18/D-19 | Compose editor shows a syntax-error diagnostic for invalid YAML, none for valid YAML | unit (component) | `vitest run test/unit/routes/stacks/compose-editor.test.tsx` | ❌ Wave 0 |
| D-20/D-21/D-22 | Table mode add/remove rows round-trips to raw text mode without losing entries; secret-looking keys are masked | unit (component) | `vitest run test/unit/routes/stacks/env-editor.test.tsx` | ❌ Wave 0 |
| Mobile audit (D-17) | Key flows (deploy, view logs, view status) usable at mobile viewport widths | E2E (Playwright, viewport override) | `yarn workspace @docktor/client test:integration` with a mobile project/viewport added to `playwright.config.ts` | ❌ Wave 0 — `playwright.config.ts` currently only defines a `chromium` desktop project (read this session); a mobile viewport project should be added |

### Sampling Rate
- **Per task commit:** `yarn workspace @docktor/client test` (Vitest unit suite — fast, no browser)
- **Per wave merge:** full Vitest suite + `yarn workspace @docktor/client test:integration` (Playwright)
- **Phase gate:** Full suite green before `/gsd-verify-work`, including the new mobile-viewport Playwright project if added for D-17

### Wave 0 Gaps
- [ ] `client/test/unit/hooks/use-stack-timeline.test.ts` — covers D-07's merge/sort logic
- [ ] `client/test/unit/components/status-pill.test.tsx` — covers D-08's pulsing "running" state
- [ ] `client/test/unit/components/theme-toggle.test.tsx` — covers D-15/D-16
- [ ] `client/test/unit/routes/stacks/compose-editor.test.tsx` — covers D-18/D-19's linter behavior
- [ ] `client/test/unit/routes/stacks/env-editor.test.tsx` — covers D-20/D-21/D-22's table/raw round-trip and secret masking
- [ ] A Playwright mobile-viewport project in `client/playwright.config.ts` — needed before D-17's audit can be exercised as automated regression coverage, not just manual/visual review
- [ ] Server-side unit test for the `listStacks()` `ImageUpdateCheck` join (Pitfall 1) — new test, new production code

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unchanged — this phase touches no auth code |
| V3 Session Management | No | Unchanged |
| V4 Access Control | No | Unchanged — all routes already gated by `requireAuth` (verified for `/api/stacks/*` in `server/src/routes/stacks.ts:40`, unchanged by this phase) |
| V5 Input Validation | Yes | `envContent`/`composeContent` remain validated server-side by existing Zod schemas (`updateStackSchema`, `shared/src/validation/stacks.ts:19-24`) — the client-side table/CodeMirror editors are new **presentations** of the same string, not a new input-validation surface; no new server-side schema is needed unless the planner decides to add structural validation for the table-mode env editor (optional, not required) |
| V6 Cryptography | No | Unchanged — no secrets are newly persisted; D-22's "secret masking" is **display-only** obfuscation (regex-matched key names get their value hidden in the UI), not encryption — must not be represented to the user as a security control, since the underlying `.env` file on disk remains plaintext exactly as it is today |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| D-22's masking heuristic gives a false sense of security | Information Disclosure | None needed from a code standpoint, but the UI copy/tooltip for the masked field should make clear this is a display convenience, not encryption — the raw-text mode toggle trivially reveals the value, and the underlying `.env` file is already stored in plaintext on disk (unchanged by this phase, out of scope to fix here) |
| CodeMirror rendering of arbitrary compose/env content | Tampering (XSS via rendered content) | `@uiw/react-codemirror` renders text content as CodeMirror document text, not `dangerouslySetInnerHTML` — no injection risk beyond what already exists with the plain `<Textarea>` it replaces; no new mitigation needed |

## Sources

### Primary (HIGH confidence)
- `npm view <pkg> version` / `time.created` — direct registry queries this session for `@uiw/react-codemirror`, `@uiw/codemirror-theme-github`, `codemirror`, `@codemirror/lang-yaml`, `@codemirror/lint`, `yaml`, `js-yaml`
- `package-legitimacy check --ecosystem npm` seam output — this session, full JSON verdicts recorded above
- Direct file reads this session (all paths/line numbers cited inline throughout): `client/src/routes/app/stacks/[id].tsx`, `client/src/routes/app/settings.tsx`, `client/src/routes/app/dashboard.tsx`, `client/src/components/domain/stack/log-viewer.tsx`, `client/src/components/common/log-output.tsx`, `client/src/hooks/use-log-stream.ts`, `client/src/hooks/use-backup-stream.ts`, `client/src/hooks/use-stack.ts`, `client/src/hooks/use-stack-events.ts`, `client/src/hooks/use-container-events.ts`, `client/src/hooks/use-mobile.ts`, `client/src/lib/stacks-api.ts`, `client/src/routes/app/stacks/components/event-log-card.tsx`, `client/src/routes/app/stacks/components/status-log-card.tsx`, `client/src/routes/app/stacks/components/services-tab.tsx`, `client/src/routes/app/stacks/components/proxy-tab.tsx`, `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx`, `client/src/routes/app/stacks/components/backup-config-card.tsx`, `client/src/routes/app/stacks/backups/[backupId].tsx`, `client/src/components/domain/stack/service-status-badge.tsx`, `client/src/components/domain/stack/stack-status-badge.tsx`, `client/src/components/domain/stack/stack-list.tsx`, `client/src/components/ui/badge.tsx`, `client/src/components/common/layout/page.tsx`, `client/src/components/app-layout.tsx`, `client/src/components/app-sidebar.tsx`, `client/src/components/nav-user.tsx`, `client/src/main.tsx`, `client/src/index.css`, `client/vitest.config.ts`, `client/playwright.config.ts`, `client/package.json`, `shared/src/validation/stacks.ts`, `server/src/routes/stacks.ts`, `server/src/application/stack-service.ts`, `server/src/repositories/stack-repository.ts`, `server/package.json`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- discuss.codemirror.net "YAML Linter for @uiw/react-codemirror or codemirror v6" — community-documented pattern for wrapping a YAML parser's errors as CodeMirror diagnostics
- github.com/codemirror/lang-yaml README — confirms the package provides highlighting/indentation only, not linting
- next-themes README / GitHub (pacocoursey/next-themes) — `ThemeProvider` API, class-strategy, blocking-script flash prevention
- Community Tailwind v4 + next-themes integration guides (multiple, cross-checked) — `suppressHydrationWarning` placement, class-vs-selector strategy note

### Tertiary (LOW confidence)
- Bundle-size figures for CodeMirror 6 vs. Monaco ("50-200kB" vs. "2-5MB") — WebSearch aggregation, not independently measured against this project's actual build output; background justification only, D-18 is already locked so this doesn't gate a decision

## Metadata

**Confidence breakdown:**
- Standard stack (CodeMirror/next-themes packages): HIGH — versions and legitimacy verified via live npm registry queries this session
- Architecture (existing codebase structure, data flow, server join gap): HIGH — every claim backed by a direct file read this session, not training-data assumption
- Pitfalls: HIGH for Pitfalls 1, 2, 5 (directly observed via code reading); MEDIUM for Pitfalls 3, 4 (reasoned from library behavior + existing patterns, not independently reproduced in a running app this session)

**Research date:** 2026-09-25
**Valid until:** 2026-10-25 (30 days — client dependency versions and this codebase's own structure are the fast-moving parts; re-verify package versions if planning is delayed past this window)
