---
phase: 11-ui-rework
plan: 01
subsystem: ui
tags: [react, react-router, tailwind, shadcn, playwright, vitest]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "Unchanged server API surface (GET /api/stacks/:id/compose, GET /api/stacks/:id/env, PUT /api/stacks/:id) that this plan's Config tab consumes without modification."
provides:
  - "STACK_TABS/StackTab/STACK_TAB_LABELS/LEGACY_STACK_TAB_ALIASES/resolveStackTab() (client/src/lib/stack-tabs.ts) — the single source of truth for the 5-tab set and legacy-URL redirect, consumed by every later phase-11 plan touching the stack detail page"
  - "useStackConfigFiles() hook + StackConfigFiles interface (client/src/hooks/use-stack-config-files.ts) — owns compose/env load, dirty-guarding (survives a background refresh mid-edit), and save; plans 11-09 (compose editor) and 11-12 (env editor) build on this shape without changing it"
  - "Section/SectionHeader/SectionTitle/SectionDescription/SectionActions (client/src/components/common/layout/section.tsx) — the generic flat-section primitive every later D-03 Card-flattening (11-04, 11-06, 11-07, 11-08) composes"
  - "ConfigTab (merged Compose + Environment tab, no Card, no nested Tabs)"
  - "StackDetailHeader/StackPageState/StackAlerts/OverviewTab — the extracted section components '[id].tsx' now composes"
  - "'[id].tsx' reduced from a monolithic page to an 89-line composition-only orchestrator (CLAUDE.md Known Refactoring Target closed)"
  - "client/playwright.config.ts reads PLAYWRIGHT_PORT (default 5173) with --strictPort, so later waves' parallel worktree executors can each run E2E on a distinct port"
affects: [11-04, 11-06, 11-07, 11-08, 11-09, 11-10, 11-12]

# Actuals (#2632)
actuals:
  tokens: 42000
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat-section primitive (Section/SectionHeader/SectionTitle/SectionDescription/SectionActions) replacing Card for D-03's Card-reduction goal — mirrors components/common/layout/page.tsx's data-slot/cn() conventions"
    - "Page-composition pattern (CLAUDE.md Page Composition): '[id].tsx' calls hooks, renders the Page shell, and composes section components — no business logic or inline JSX blocks of substance in the page file itself"
    - "Dirty-guard-via-ref pattern in useStackConfigFiles: a ref mirrors each dirty boolean synchronously so a load-response microtask (which can resolve before a useEffect re-run observes updated state) still sees the current dirty status and discards a stale response instead of clobbering an in-progress edit"

key-files:
  created:
    - client/src/lib/stack-tabs.ts
    - client/src/hooks/use-stack-config-files.ts
    - client/src/components/common/layout/section.tsx
    - client/src/routes/app/stacks/components/config-tab.tsx
    - client/src/routes/app/stacks/components/stack-detail-header.tsx
    - client/src/routes/app/stacks/components/stack-page-state.tsx
    - client/src/routes/app/stacks/components/stack-alerts.tsx
    - client/src/routes/app/stacks/components/overview-tab.tsx
  modified:
    - client/src/routes/app/stacks/[id].tsx
    - client/playwright.config.ts

key-decisions:
  - "Dirty flags are mirrored into refs (composeDirtyRef/envDirtyRef) rather than read from state inside the load-response .then() callback, because a promise microtask can run before React flushes the effect that would otherwise re-derive a closure over fresh state — the ref is the only way to guarantee the check sees the dirty flag as of right now, not as of when the effect closure was created. This is the concrete fix for RESEARCH Pitfall 3 (a load in flight when the user starts typing must not overwrite the edit)."
  - "OverviewTab, StackDetailHeader, StackAlerts and StackPageState were extracted as behavior-preserving moves only (verbatim content, same visible text/props) — no attempt to also improve their internals in this plan, since plan 11-06 already owns rewriting OverviewTab's insides (the log-surface unification) and touching it twice would blur which plan is responsible for which behavior change."

patterns-established:
  - "Section primitive: any future flat, non-domain section layout should reuse Section/SectionHeader/SectionTitle/SectionDescription/SectionActions from components/common/layout/section.tsx rather than hand-rolling similar markup."
  - "resolveStackTab()-style tab resolution: a pure function returning a discriminated union ({kind:'tab'} | {kind:'redirect'}) is the pattern for any future tab-set change that needs to preserve old URLs."

requirements-completed: ["GH-15"]

coverage:
  - id: D1
    description: "Stack detail page keeps 5-tab navigation (Overview, Config, Logs, Backups, Proxy) in that exact order (D-01)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/stack-tabs.test.ts"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'breadcrumbs show correct navigation on detail page'"
        status: pass
    human_judgment: false
  - id: D2
    description: "/stacks/:id/config renders one merged Config tab (Compose File + Environment Variables sections, independent Save buttons); legacy /compose and /environment URLs redirect to /config (D-02)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/config-tab.test.tsx, client/test/unit/routes/stacks/stack-detail-page.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'stack detail config tab: edit and save the compose file (D-02/D-03)', 'legacy /compose URL redirects to /config (D-02)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Config tab renders no Card component; two flat Section elements separated by a Separator, no nested Tabs (D-03)"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*)' client/src/routes/app/stacks/components/config-tab.tsx | grep -c '<Card' -> 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Saving compose/env sends the existing PUT /api/stacks/:id, clears the matching dirty flag, triggers a stack refetch; a failed save keeps the edit dirty and shows the UI-SPEC error toast copy"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-config-files.test.ts"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'stack detail config tab: edit and save the compose file (D-02/D-03)' (asserts PUT body)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A background refresh (lastKnownHash change) never overwrites a file with unsaved edits, including a load response that resolves after the user has already started typing (RESEARCH Pitfall 3)"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-config-files.test.ts — late-load-response-while-dirty case"
        status: pass
    human_judgment: false
  - id: D6
    description: "'[id].tsx' is a composition-only page of at most 90 lines (CLAUDE.md ~80-line target; Known Refactoring Target closed)"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "wc -l < 'client/src/routes/app/stacks/[id].tsx' -> 89"
        status: pass
    human_judgment: false
  - id: D7
    description: "The tab list stays reachable at a 390px-wide viewport by scrolling horizontally inside its own container instead of widening the page (D-17 responsive baseline)"
    verification:
      - kind: other
        ref: "grep -c 'overflow-x-auto' 'client/src/routes/app/stacks/[id].tsx' -> 1"
        status: pass
    human_judgment: true
    rationale: "The grep confirms the overflow-x-auto class is applied; actual visual scroll behavior at 390px was not screenshotted in this session and is a fair candidate for a human/UI-review pass."
  - id: D8
    description: "Playwright binds the dev server to PLAYWRIGHT_PORT with strictPort, so parallel plans in later waves can each run E2E without reusing another worktree's dev server"
    verification:
      - kind: e2e
        ref: "PLAYWRIGHT_PORT=5199 playwright test test/integration/stacks.spec.ts -> 13/13 passed"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min (task-visible span; the executing session was interrupted by a container restart between finishing Task 2 and writing this SUMMARY, so wall-clock elapsed time is not meaningful)
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 01: Config Tab Tracer + Stack Detail Page Decomposition Summary

**Merged Compose/Environment into a single Config tab (no Card, flat Sections) with a legacy-URL redirect, and decomposed the 500+-line stack detail page into an 89-line composition-only orchestrator plus five extracted section components.**

## Performance

- **Tasks:** 2
- **Files modified:** 15 (8 new, 7 modified — see `key-files`)
- **Completed:** 2026-09-26

## Accomplishments

- New `lib/stack-tabs.ts`: `STACK_TABS`/`StackTab`/`STACK_TAB_LABELS`/`LEGACY_STACK_TAB_ALIASES`/`resolveStackTab()` — the single source of truth for the 5-tab set (Overview, Config, Logs, Backups, Proxy) and the `/compose`, `/environment` → `/config` redirect.
- New `hooks/use-stack-config-files.ts`: `useStackConfigFiles()` hook owning compose/env load, dirty-guarding (a background refresh or a load response that resolves mid-edit can never clobber an unsaved change — refs mirror the dirty flags synchronously alongside state), and save via the existing `PUT /api/stacks/:id`.
- New `components/common/layout/section.tsx`: generic `Section`/`SectionHeader`/`SectionTitle`/`SectionDescription`/`SectionActions` flat-section primitive, mirroring `page.tsx`'s conventions — the primitive every later D-03 Card-flattening plan (11-04, 11-06, 11-07, 11-08) will compose.
- New `routes/app/stacks/components/config-tab.tsx`: merged Config tab — Compose File section, Separator, Environment Variables section, each with its own Save button disabled until dirty, no Card, no nested Tabs.
- Decomposed `[id].tsx` (previously ~500+ lines) into: `stack-page-state.tsx` (loading/error shells), `stack-detail-header.tsx` (breadcrumb + title + actions), `stack-alerts.tsx` (config-error/config-changed alerts), `overview-tab.tsx` (Overview content, moved verbatim). `[id].tsx` itself is now 89 lines: hooks, redirect/loading/error early returns, then `Page` → `StackDetailHeader` → `PageContent` → `StackAlerts` → `Tabs`.
- `TabsList` wrapped in an `overflow-x-auto` scroller so the 5-tab bar stays reachable at a 390px-wide viewport instead of widening the page (D-17).
- `playwright.config.ts` now reads `PLAYWRIGHT_PORT` (default 5173) with `--strictPort` for both `use.baseURL` and the Vite `webServer`, so later waves' parallel worktree executors can each bind a distinct port.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end merged Config tab — one tab, edit and save the compose file, legacy URLs redirect** - `0bb3054` (feat)
2. **Task 2: Decompose the stack detail page into section components (≤ 90 lines) and parameterize the Playwright port** - `562b8e9` (refactor)

**Plan metadata:** this SUMMARY.md, committed separately (this plan's execution spanned a container restart — see Issues Encountered).

## Files Created/Modified

- `client/src/lib/stack-tabs.ts` - tab set, labels, legacy-alias map, `resolveStackTab()`
- `client/src/hooks/use-stack-config-files.ts` - compose/env load/dirty/save state, extracted from the page
- `client/src/components/common/layout/section.tsx` - generic flat-section primitive (Section/SectionHeader/SectionTitle/SectionDescription/SectionActions)
- `client/src/routes/app/stacks/components/config-tab.tsx` - merged Config tab (Compose File + Environment Variables)
- `client/src/routes/app/stacks/components/stack-detail-header.tsx` - breadcrumb/title/actions header, extracted
- `client/src/routes/app/stacks/components/stack-page-state.tsx` - loading/error page shells, extracted
- `client/src/routes/app/stacks/components/stack-alerts.tsx` - config-error/config-changed alerts, extracted
- `client/src/routes/app/stacks/components/overview-tab.tsx` - Overview tab content, extracted verbatim
- `client/src/routes/app/stacks/[id].tsx` - reduced to an 89-line composition-only orchestrator
- `client/playwright.config.ts` - `PLAYWRIGHT_PORT`-driven baseURL/webServer with `--strictPort`
- `client/test/unit/lib/stack-tabs.test.ts`, `client/test/unit/hooks/use-stack-config-files.test.ts`, `client/test/unit/routes/stacks/config-tab.test.tsx`, `client/test/unit/routes/stacks/stack-detail-page.test.tsx` - new/updated unit coverage
- `client/test/integration/stacks.spec.ts` - updated E2E (5-tab assertions, Config-tab save flow with PUT-body assertion, legacy-URL redirect)

## Decisions Made

See `key-decisions` in the frontmatter: the ref-mirrored dirty-flag pattern (fixes RESEARCH Pitfall 3) and the decision to extract Overview/Header/Alerts/PageState as behavior-preserving moves only, leaving their internal rewrites to their respective later plans (11-06 for Overview).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria (tab-order grep, zero-Card greps, `useStackConfigFiles`/`VALID_TABS` presence/absence greps, error-copy grep, ≤90-line page, `PLAYWRIGHT_PORT`/`strictPort` presence, `overflow-x-auto` presence) were independently re-verified against the tree in this session and all match exactly.

## Issues Encountered

**Container restart interrupted the original executing session between finishing Task 2 and writing this SUMMARY.** Both tasks' code, tests, and commits (`0bb3054`, `562b8e9`) were already complete and pushed to `origin/feature/phase-11-ui-rework` — no work was lost — but the SUMMARY.md write and final verification pass never happened before the restart. This session independently re-verified everything from scratch (all acceptance-criteria greps, full unit suite, full typecheck, and the Playwright E2E suite including the `PLAYWRIGHT_PORT=5199` parallel-port case) before writing this SUMMARY, rather than trusting the prior session's implied completion.

**Playwright's pinned browser revision (1208, headless-shell) was not the one pre-installed in this sandbox (1194).** Per this environment's own guidance for a version-mismatched Playwright install, verification was run with a scratch, uncommitted config overriding `use.launchOptions.executablePath` to the sandbox's pre-installed `/opt/pw-browsers/chromium` full-Chrome binary; the scratch config was deleted immediately after and never touched the repository. This is a sandbox-verification detail only — `client/playwright.config.ts` itself is unmodified from what Task 2 wrote.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 of Phase 11 is complete. The `StackConfigFiles` interface, `ConfigTab`/`OverviewTab`/`StackDetailHeader`/`StackAlerts`/`StackPageState` prop shapes, and the `Section` primitive's export list are all stable and ready for Wave 2 (11-02 status indicators, 11-03 dark mode, 11-04 dashboard, 11-05 server list enrichment) and beyond — see `key-links` in `11-01-PLAN.md`'s frontmatter for which later plans read which contract.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*
