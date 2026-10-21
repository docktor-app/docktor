---
phase: 14-health-uptime-and-disk-visibility
plan: 03
subsystem: ui
tags: [react, vite, vitest, playwright, sse, radix-scroll-area, tailwind]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-01 GET /api/stacks/:id/health-events and the http-probe / docker-healthcheck source vocabulary
provides:
  - getServiceHealthEvents() API client and ServiceHealthEvent / HealthSource types
  - pure health-format helpers (HEALTH_SOURCE_LABELS, formatHealthStatus, getHealthTone, groupHealthEventsByService)
  - useServiceHealthEvents(stackId) - one fetch per stack, background refetch on container_state SSE
  - ServiceHealthTimeline panel with populated, loading, error+Retry and empty states
  - History icon button and expandable colSpan=6 row in ServicesSection
  - neutral "HTTP probe" badge in the Status cell and a yellow "starting" service presentation
  - default Playwright stub for health-events so every Overview-visiting spec stays green
affects: [14-06 http probes, 14-07 stack overview, 14-11 stable health state, 14-12 incidents]

actuals:
  tokens: 17600
  tasks: 2
  commits: 2
plan_head_before: df8168c18013ebc1f2ed801a04f899c31ba40681
plan_head_after: 58bb70df3424ac816714e640479590432c627cf5

tech-stack:
  added: []
  patterns:
    - "Stack-wide fetch grouped client-side and handed to rows as slices (no per-row request)"
    - "initial/background FetchMode hook with unknown-narrowed catch (no any)"
    - "Reset inherited whitespace-nowrap (whitespace-normal) when rendering free text inside a shadcn TableCell"

key-files:
  created:
    - client/src/lib/health-api.ts
    - client/src/lib/health-format.ts
    - client/src/hooks/use-service-health-events.ts
    - client/src/routes/app/stacks/components/service-health-timeline.tsx
    - client/test/integration/service-health.spec.ts
    - client/test/unit/lib/health-format.test.ts
    - client/test/unit/hooks/use-service-health-events.test.ts
    - client/test/unit/routes/stacks/service-health-timeline.test.tsx
  modified:
    - client/src/routes/app/stacks/components/services-section.tsx
    - client/src/routes/app/stacks/components/overview-tab.tsx
    - client/src/components/domain/stack/service-status-badge.tsx
    - client/test/integration/fixtures.ts
    - client/test/unit/routes/stacks/services-section.test.tsx
    - client/test/unit/components/domain/stack/service-status-badge.test.tsx

key-decisions:
  - "refetch() runs in initial mode so Retry from the error state re-enters loading and clears the error; SSE-triggered refetches stay background and never flash the skeleton"
  - "A successful fetch of either mode clears error, so a background refetch can recover a failed initial load"
  - "Message rendering uses break-words plus wrap-anywhere and the panel root resets whitespace-normal, because TableCell is whitespace-nowrap and Radix ScrollArea sizes its content wrapper to max-content"
  - "service-health.spec.ts asserts 'opening panels adds no request and no request carries serviceName', not an exact request count, because dev StrictMode double-invokes mount effects"

patterns-established:
  - "Pitfall 7 default stub: fixtures.ts registers an empty-list route for each new Overview endpoint; specs override per test"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Each Services row has a History button (Show/Hide health history for {service}, aria-expanded, aria-controls) that opens a full-width row with that service's transitions, newest first, in an h-48 ScrollArea; several rows can be open"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx#health history (D-12)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#History button expands the service's transitions and collapses again"
        status: pass
    human_judgment: false
  - id: D2
    description: "Timeline rows show a static toned StatusDot, muted timestamp, from-to with unknown/cleared wording, neutral source badge and the message verbatim as text"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/health-format.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Overview fetches the stack's events once and slices per service; a container_state frame for that stack refetches in the background; nothing polls"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-service-health-events.test.ts"
        status: pass
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#serves every service from one stack-wide fetch; opening panels sends no further request"
        status: pass
    human_judgment: false
  - id: D4
    description: "Loading (two skeletons), error (exact copy plus Retry) and empty (exact copy) states render inside the open panel"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx#states"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx#renders the loading, error and empty states inside an opened panel"
        status: pass
    human_judgment: false
  - id: D5
    description: "Status cell shows a neutral HTTP probe badge only for services with an http-probe event; running + starting reads as a yellow non-pulsing 'starting' pill"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/services-section.test.tsx#HTTP probe badge (UI-SPEC D)"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/service-status-badge.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Existing Playwright specs that open a stack Overview still pass through the default health-events stub"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts, mobile.spec.ts, theme.spec.ts (41 passed, run on system Edge)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A 200-character probe message wraps in the panel with no horizontal page overflow (light and dark, desktop and Pixel 7 width)"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#a 200-character probe message wraps inside the panel without horizontal page overflow"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx#resets inherited nowrap"
        status: pass
    human_judgment: true
    rationale: "Overflow is measured by script in both themes and at 412px, but legibility of the source badge and dot and the vertical stacking at phone width were not looked at by a person (the plan's human-check). Recorded in .planning/WINDOWS.md."

duration: 19min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 03: Service health history client Summary

**Each service on a stack's Overview now expands a health history panel (transitions, source, message) fed by one stack-wide request, with loading/error/empty states, an HTTP probe badge and a yellow `starting` pill**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-08T07:48:43Z
- **Completed:** 2026-10-08T08:08:00Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 14 (8 created, 6 modified)

## Accomplishments
- `getServiceHealthEvents()` plus pure formatters, and `useServiceHealthEvents(stackId)`: one request per stack, grouped by service, SSE `container_state` frames for the same stack trigger a background refetch that never re-enters loading.
- `ServicesSection` gained the History icon button (Show/Hide label, `aria-expanded`, `aria-controls`) and an expanded `colSpan={6}` row hosting `ServiceHealthTimeline`; `OverviewTab` stays composition-only at 48 lines.
- `ServiceHealthTimeline` renders populated rows, two-skeleton loading, a destructive error Alert with Retry, and the empty copy, all with message text rendered as React text only.
- Status cell shows a neutral `HTTP probe` badge for probed services; `running + starting` is now a yellow, non-pulsing `starting` presentation.
- `fixtures.ts` stubs `**/api/stacks/*/health-events**` with `[]`, so the existing stack, mobile and theme specs stay green.
- Tracer gate: `Tracer verified end-to-end - expanding` (unit set, typecheck and Playwright all passed before Task 2 started).

## Task Commits

1. **Task 1: End-to-end health history panel (tracer)** - `de5d332` (feat)
2. **Task 2: Timeline states, HTTP probe badge, starting presentation** - `58bb70d` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written alongside each unit and landed in the same commit as the implementation, because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `client/src/lib/health-api.ts` - types and pure `getServiceHealthEvents(stackId, query?)`
- `client/src/lib/health-format.ts` - source labels, status wording, tone mapping, grouping
- `client/src/hooks/use-service-health-events.ts` - the per-stack hook (unknown-narrowed catch, no `any`)
- `client/src/routes/app/stacks/components/service-health-timeline.tsx` - the panel
- `client/src/routes/app/stacks/components/services-section.tsx` - History button, expandable row, probe badge
- `client/src/routes/app/stacks/components/overview-tab.tsx` - calls the hook and passes four props
- `client/src/components/domain/stack/service-status-badge.tsx` - `starting` branch
- `client/test/integration/fixtures.ts` - default empty stub; `service-health.spec.ts` - 3 e2e cases
- Unit tests for the formatters, hook, timeline, services section and status badge

## Decisions Made
- See `key-decisions` above. The notable one: Retry uses initial mode so the user sees the skeleton again and the error clears; SSE refetches stay silent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Long probe messages did not wrap and scrolled the page**
- **Found during:** Task 2, while performing the plan's long-text check by script
- **Issue:** shadcn `TableCell` is `whitespace-nowrap` and the panel inherited it, so `break-words` did nothing. A 200-character message made the document 1536px wide at a 1280px viewport (and the Radix ScrollArea viewport 1600px), and it never wrapped at 412px either. This violated the plan's long-text truth.
- **Fix:** `whitespace-normal` on the panel root; `wrap-anywhere` added next to `break-words` so an unbroken string (for example a URL) also breaks. Re-measured: light and dark, 1280px and 412px, spaced and unbroken messages all equal the short-message baseline.
- **Files modified:** `client/src/routes/app/stacks/components/service-health-timeline.tsx`
- **Verification:** new Playwright case in `service-health.spec.ts` (page and viewport `scrollWidth <= clientWidth`) and a class-level unit test
- **Committed in:** 58bb70d

**2. [Rule 3 - Blocking] Playwright browsers are not installed on this machine**
- **Found during:** Task 1 verify
- **Issue:** `yarn workspace @docktor/client test:integration ...` fails every test with `browserType.launch: Executable doesn't exist` (`%LOCALAPPDATA%\ms-playwright` does not exist). The plan's canonical command cannot pass here.
- **Fix:** No browser was downloaded. The same specs were run against the system Edge through a throwaway config kept outside the repository (it imports the project's `playwright.config.ts` and only adds `channel: "msedge"`). Nothing in the repo changed for this.
- **Verification:** `service-health`, `stacks`, `mobile` and `theme` specs: 41 passed, with no "Unstubbed API request(s)" error.
- **Follow-up:** run the canonical command once after `yarn playwright install chromium`.

**3. [Rule 1 - Bug] Planned e2e assertion "requested once" was wrong in dev**
- **Found during:** Task 1 verify
- **Issue:** `main.tsx` wraps the app in `<StrictMode>`, which double-invokes mount effects on the Vite dev server (every existing hook does the same), so the exact count was 2.
- **Fix:** The spec now uses a two-service stack and asserts that opening both panels sends no further request and that no request carries `serviceName=`.
- **Files modified:** `client/test/integration/service-health.spec.ts`
- **Committed in:** de5d332

**4. [Scope note] "service-health.spec.ts passes on both Playwright projects"**
- The `mobile-chromium` project matches only `mobile.spec.ts` (`testMatch`), so a new spec cannot run there without editing `playwright.config.ts`, which was out of scope. The spec runs on the `chromium` project; phone-width behaviour was measured by a throwaway script at 412px (see deviation 1). All 12 `mobile.spec.ts` cases still pass.

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking) plus 1 scope note
**Impact on plan:** No scope change. One real layout bug was caught and fixed before it shipped.

## Issues Encountered
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (tsc --build) is clean.
- Vite logs `http proxy error: /api/events` (ECONNREFUSED) during Playwright runs. The route is stubbed by `fixtures.ts`; the line is dev-server noise that predates this plan.
- The plan's visual human-check (legibility in light/dark, vertical stacking at Pixel 7 width) was not performed by a person; see Known Gaps.

## Known Stubs
None.

## Known Gaps
- Human visual check of the expanded panel in light and dark theme at phone width (recorded as `unrun-verify` in `.planning/WINDOWS.md`).
- Canonical Playwright command not run on a machine with Playwright browsers installed (deviation 2).

## Threat Flags
None. T-14-10 is mitigated (message and service name rendered as React text only, covered by a unit test with an `<img onerror>` payload; no `dangerouslySetInnerHTML`). T-14-11 is mitigated (one request per stack, refetch only on `container_state` for the same stack, no polling).

## Next Phase Readiness
- 14-06 can emit `http-probe` events over the same pipeline: the badge, source label and `starting` pill are already in place.
- Other plans that add Overview endpoints should follow the Pitfall 7 pattern and add a default stub in `fixtures.ts`.
- Open: install Playwright browsers and re-run the canonical e2e command.

## Self-Check: PASSED

- All created files exist on disk (4 source files, 1 e2e spec, 3 unit test files).
- Commits `de5d332` and `58bb70d` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Acceptance criteria re-run: `useServiceHealthEvents(stack.id)` 1; `health-events` in fixtures.ts 1; `colSpan={6}` 1; `any` in the hook 0; overview-tab.tsx 48 lines; `Couldn't load health history` 1; empty copy 1; `"starting"` in service-status-badge.tsx 3.
- Verification: client unit suite 84 files / 737 tests passed; Playwright (system Edge) 42 passed across service-health, stacks, mobile and theme; `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
