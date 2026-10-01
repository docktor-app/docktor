---
phase: 11-ui-rework
plan: 06
subsystem: ui
tags: [react, tailwind, shadcn, radix-select, activity-feed, stack-detail]

requires:
  - phase: 11-ui-rework
    provides: "Plan 11-01's OverviewTab/StackDetailHeader extraction and Section primitive; plan 11-02's ToneBadge/StatusDot, StackStatusBadge/ServiceStatusBadge display=\"compact\", lib/service-color.ts, lib/service-ports.ts, ServiceUpdateBadge/StackUpdateBadge"
provides:
  - "lib/stack-event-description.ts — describeStackEvent() returning {label, description, tone}, the single source for event-entry copy/tone"
  - "hooks/use-stack-timeline.ts — TimelineEntry/TimelineFilter types, buildTimeline()/filterTimeline() pure functions, useStackTimeline() memoized hook — the client-side merge over deployments/statusLogs/events with no new endpoint or SSE type"
  - "routes/app/stacks/components/activity-timeline.tsx — ActivityTimeline, the unified type-filterable timeline replacing the Recent Deployments table + StatusLogCard + EventLogCard trio"
  - "routes/app/stacks/components/services-section.tsx — ServicesSection, the flat (no-Card) Services table with per-service color dots, D-10 update copy, and accessible 44px icon-button actions"
  - "OverviewTab now composes ServicesSection + ActivityTimeline directly (calls useStackEvents/useStackTimeline itself); StackDetailHeader renders the stack-level StackUpdateBadge next to StackStatusBadge"
affects: [11-07, 11-08, 11-11]

actuals:
  tokens: 20380
  tasks: 2
  commits: 4
  plan_head_before: 6882f40621dc9b6f634b46cdb42872b9766fc657

tech-stack:
  added: []
  patterns:
    - "Pure client-side timeline merge (buildTimeline/filterTimeline as plain functions, useStackTimeline as a thin useMemo wrapper) — the pattern for any future feed that must merge multiple already-fetched sources without a new endpoint"

key-files:
  created:
    - client/src/lib/stack-event-description.ts
    - client/src/hooks/use-stack-timeline.ts
    - client/src/routes/app/stacks/components/activity-timeline.tsx
    - client/src/routes/app/stacks/components/services-section.tsx
    - client/test/unit/lib/stack-event-description.test.ts
    - client/test/unit/hooks/use-stack-timeline.test.ts
    - client/test/unit/routes/stacks/activity-timeline.test.tsx
    - client/test/unit/routes/stacks/services-section.test.tsx
    - client/test/unit/routes/stacks/stack-detail-header.test.tsx
  modified:
    - client/src/routes/app/stacks/components/overview-tab.tsx
    - client/src/routes/app/stacks/components/stack-detail-header.tsx

key-decisions:
  - "TimelineEntry keys are 'type:id' (not bare id) since deployment/statusLog/event ids come from three different tables and can collide — React keys on the raw id would silently merge unrelated rows."
  - "ActivityTimeline owns the type-filter's local useState itself (not lifted to OverviewTab/useStackTimeline) — the merge stays a pure function over the three source lists; filtering is a presentational concern of the list, matching the plan's 'pure client-side useMemo' framing without adding a second piece of hook state."
  - "Row layout follows the plan's literal prescription per entry type: deployment/event rows show a ToneBadge type label plus a break-words description; status rows show plain '{from} -> {to}' text plus a compact StackStatusBadge for the target status (the badge doubles as the row's type indicator) plus the optional message — reconciles the general 'ToneBadge type label' row contract with the more specific per-type behavior bullets in the plan."
  - "services-section.tsx wraps each row's action buttons in their own TooltipProvider (matching stack-actions.tsx's established per-usage-site pattern), and the disabled Upgrade button's Tooltip trigger is a wrapping <span> (not the Button itself) since a disabled Radix trigger stops receiving hover/focus events."

patterns-established:
  - "formatPorts(parsePorts(raw)) replaces inline JSON.parse in table cells — the two-step lib/service-ports.ts pipeline (introduced in 11-02) is now applied at its first real call site, replacing services-tab.tsx's unguarded JSON.parse that could throw on malformed data."

requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-07 (unified, type-filterable activity timeline), the Overview half of D-03 (no Card, flat Sections), the detail-header half of D-09 (stack-level update pill), D-10's per-service update copy, and D-11's service-color reuse in the services table. ROADMAP success criterion 2."

coverage:
  - id: D1
    description: "Overview tab shows one 'Activity' section merging deployments, status transitions, and events into a single newest-first list, replacing the three stacked cards (D-07)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-timeline.test.ts — buildTimeline merge/order/null-events cases"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/activity-timeline.test.tsx — renders deployment/status/event rows"
        status: pass
      - kind: other
        ref: "grep -rn 'EventLogCard\\|StatusLogCard' client/src -> empty; grep -c '<Card' overview-tab.tsx+activity-timeline.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "'Filter activity by type' Select narrows the timeline to All/Deployments/Status changes/Events; an empty result shows 'No matching activity.'"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/activity-timeline.test.tsx — 'filters entries by type...' and 'No matching activity.' cases"
        status: pass
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-timeline.test.ts — filterTimeline cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty (no activity yet), loading (skeleton), and error (destructive Alert + Retry, deployment/status entries still render) states per UI-SPEC"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/activity-timeline.test.tsx — empty/loading/error+retry cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Populated/overflow rows sit in an h-96 ScrollArea, newest first; long text wraps via break-words instead of truncating"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c 'h-96' activity-timeline.tsx -> 1; grep -c 'break-words' activity-timeline.tsx -> 4"
        status: pass
    human_judgment: true
    rationale: "The grep confirms the classes are applied and unit tests confirm row content; actual scroll/wrap rendering at a real viewport was not screenshotted in this session."
  - id: D5
    description: "Timeline liveness: entries update via the existing useStack SSE-driven deployments/statusLogs and useStackEvents refetch, with no new endpoint or SSE event type"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c 'stacks/:id/activity' server/src/routes/stacks.ts -> 0; git status --porcelain server/ -> empty; use-stack.ts/use-stack-events.ts diff against plan_head_before -> empty"
        status: pass
    human_judgment: false
  - id: D6
    description: "Overview tab renders no Card — Services and Activity are flat Section elements (D-03, Overview half)"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c '<Card' overview-tab.tsx+activity-timeline.tsx -> 0; grep -c '<Card' services-section.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D7
    description: "Stack detail header shows the blue 'update available' pill next to the status badge whenever any service has updateAvailable true (D-09, header half)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/stack-detail-header.test.tsx"
        status: pass
      - kind: other
        ref: "grep -c 'StackUpdateBadge' stack-detail-header.tsx -> 2"
        status: pass
    human_judgment: false
  - id: D8
    description: "Each service row shows a color dot (getServiceColor) matching its log-viewer color, and 'Update available -> {tag}' / 'Content updated' via ServiceUpdateBadge instead of a hand-rolled pill (D-10, D-11)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx — color-dot, update-copy, malformed-ports-no-throw, empty-state, upgrade-gating, view-logs cases"
        status: pass
      - kind: other
        ref: "grep -c 'getServiceColor' services-section.tsx -> 2; grep -c 'JSON.parse' services-section.tsx -> 0; grep -c 'rounded-full px-2 py-0.5' services-section.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D9
    description: "Per-service icon buttons (upgrade, view logs) have accessible names and are at least 44px below the md breakpoint (UI-SPEC spacing exception)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx — button accessible-name assertions ('Upgrade web', 'Cannot upgrade while the stack is DEPLOYING', 'View logs for web')"
        status: pass
      - kind: other
        ref: "services-section.tsx: Button className min-h-11 min-w-11 md:min-h-9 md:min-w-9"
        status: pass
    human_judgment: true
    rationale: "The class names encode the 44px minimum per the UI-SPEC exception; actual rendered hit-target size at a real <768px viewport was not measured in this session."

duration: ~50min
completed: 2026-09-27
status: complete
---

# Phase 11 Plan 06: Unified Activity Timeline + Flat Services Section Summary

**Replaced the Overview tab's three stacked log Cards (Recent Deployments, Status Log, Event Log) with one type-filterable Activity timeline, and flattened the Services card into a section with per-service color dots, D-10 update copy, and accessible 44px actions.**

## Performance

- **Duration:** ~50min
- **Tasks:** 2
- **Files modified:** 11 (9 new, 2 modified) plus 3 deletions (event-log-card.tsx, status-log-card.tsx, services-tab.tsx) and 1 test deletion (event-log-card.test.tsx)
- **Completed:** 2026-09-27

## Accomplishments

- `lib/stack-event-description.ts`: `describeStackEvent()` moved out of the deleted `event-log-card.tsx` unchanged in behaviour (payload parsing, malformed/empty/absent-payload never-throws contract carried over verbatim), now returning `{label, description, tone}` for `ToneBadge` (config_changed yellow, config_error red, update_available blue) instead of a `Badge` variant.
- `hooks/use-stack-timeline.ts`: `TimelineEntry`/`TimelineFilter` types, `buildTimeline()` (pure merge of deployments/statusLogs/events into a newest-first list with a stable deployments→statusLogs→events tiebreak for equal timestamps, and a `type:id` key to avoid cross-table id collisions), `filterTimeline()`, and `useStackTimeline()` (a thin `useMemo` wrapper) — the whole merge is client-side over data the page already fetches, no new endpoint or SSE event type.
- `routes/app/stacks/components/activity-timeline.tsx`: `ActivityTimeline` — a `Section` with a "Filter activity by type" `Select` (All activity/Deployments/Status changes/Events), ordered rendering (error Alert+Retry, then loading skeleton, then empty state, then "No matching activity.", then an `h-96` `ScrollArea` list), and per-type row rendering (deployment: ToneBadge "Deploy succeeded/failed" + error message; status: "{from} → {to}" text + compact `StackStatusBadge` + message; event: `describeStackEvent`'s ToneBadge + description), all wrapped in `break-words` containers.
- `overview-tab.tsx` now calls `useStackEvents(stack.id)` and `useStackTimeline(...)` itself and renders `ServicesSection` + `ActivityTimeline` inside a two-section flat layout — no Card anywhere in the Overview tab.
- `routes/app/stacks/components/services-section.tsx`: `ServicesSection` replaces `services-tab.tsx` — same `Table`/`UPGRADE_BLOCKED_STATES` logic, now inside a `Section` (no Card), with a `getServiceColor`-colored dot before each service name (D-11), `ServiceStatusBadge display="compact"`, `ServiceUpdateBadge` for D-10 copy (replacing the hand-rolled blue pill), `formatPorts(parsePorts(...))` replacing an unguarded inline `JSON.parse`, and icon-button actions with `aria-label`s and `Tooltip`s sized `min-h-11 min-w-11 md:min-h-9 md:min-w-9`.
- `stack-detail-header.tsx` now renders `StackUpdateBadge services={stack.services}` immediately after `StackStatusBadge` in the existing `flex flex-wrap items-center gap-1` container (D-09, header half).

## Task Commits

Each task followed RED → GREEN (tdd="true"):

1. **Task 1: Unified, filterable activity timeline** — RED `ea9408b` (test), GREEN `a52497f` (feat)
2. **Task 2: Flat Services section + header update pill** — RED `3491f64` (test), GREEN `4ed4e9e` (feat)

**Plan metadata:** this SUMMARY.md, committed separately.

## Files Created/Modified

- `client/src/lib/stack-event-description.ts` - describeStackEvent() + label/tone maps, moved from event-log-card.tsx
- `client/src/hooks/use-stack-timeline.ts` - TimelineEntry/TimelineFilter types, buildTimeline()/filterTimeline()/useStackTimeline()
- `client/src/routes/app/stacks/components/activity-timeline.tsx` - ActivityTimeline (type filter, loading/error/empty/populated states)
- `client/src/routes/app/stacks/components/services-section.tsx` - ServicesSection (replaces services-tab.tsx)
- `client/src/routes/app/stacks/components/overview-tab.tsx` - composes ServicesSection + ActivityTimeline, owns useStackEvents/useStackTimeline
- `client/src/routes/app/stacks/components/stack-detail-header.tsx` - adds StackUpdateBadge next to StackStatusBadge
- `client/test/unit/lib/stack-event-description.test.ts`, `client/test/unit/hooks/use-stack-timeline.test.ts`, `client/test/unit/routes/stacks/activity-timeline.test.tsx`, `client/test/unit/routes/stacks/services-section.test.tsx`, `client/test/unit/routes/stacks/stack-detail-header.test.tsx` - new unit coverage
- Deleted: `client/src/routes/app/stacks/components/event-log-card.tsx`, `status-log-card.tsx`, `services-tab.tsx`, `client/test/unit/routes/stacks/event-log-card.test.tsx`

## Decisions Made

See `key-decisions` in the frontmatter: the `type:id` timeline key, keeping the type filter's state local to `ActivityTimeline`, the per-entry-type row layout reconciling the plan's general and specific row descriptions, and the per-row `TooltipProvider` pattern in `services-section.tsx` matching `stack-actions.tsx`'s precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a ResizeObserver stub to services-section.test.tsx**
- **Found during:** Task 2 GREEN verification (full client suite run)
- **Issue:** `services-section.tsx`'s icon-button actions are now wrapped in Radix `Tooltip`/`TooltipProvider` (a new dependency for this file, needed for the D-17 accessible-label requirement). jsdom has no `ResizeObserver`, which Radix's tooltip positioning internals require; without a stub the test file threw an unhandled `ReferenceError: ResizeObserver is not defined` after its assertions had already passed, corrupting the full-suite run (1 file counted as failed).
- **Fix:** Added the same `globalThis.ResizeObserver` stub already established in `stack-actions.test.tsx`/`page-header.test.tsx` for the identical Radix-Tooltip-in-jsdom situation.
- **Files modified:** `client/test/unit/routes/stacks/services-section.test.tsx`
- **Verification:** Full client suite re-run: 48/48 test files, 388 passed / 3 todo, 0 errors.
- **Committed in:** `4ed4e9e` (folded into the GREEN commit since it was found during that task's own verification pass, before any commit)

---

**Total deviations:** 1 (blocking test-infrastructure fix). **Impact:** No production-code or behavior change — a jsdom test-environment gap for a browser API Radix's Tooltip depends on, already a known/established pattern in this codebase.

## Issues Encountered

None beyond the ResizeObserver deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ActivityTimeline`'s `{entries, eventsLoading, eventsError, onRetryEvents}` contract and `ServicesSection`'s `{services, stackId, stackStatus, onViewLogs, onUpgraded}` contract are stable; no other plan in this phase currently depends on importing them directly, but 11-07 (proxy/backups) and 11-08 (backup detail) can reuse the same `Section`-based flat-layout and `ToneBadge`/`StatusDot` patterns this plan continues to apply.
- Ready for 11-07.

## Self-Check: PASSED

All 9 created files confirmed present on disk; all 4 deleted files (event-log-card.tsx, status-log-card.tsx, services-tab.tsx, event-log-card.test.tsx) confirmed absent; all 4 task commit hashes (ea9408b, a52497f, 3491f64, 4ed4e9e) confirmed present in `git log`.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-27*
