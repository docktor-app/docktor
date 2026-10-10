---
phase: 14-health-uptime-and-disk-visibility
plan: 07
subsystem: ui
tags: [react, vite, vitest, playwright, sse, tailwind, shadcn-table, stat-card]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-04 GET /api/stacks/:id/uptime (percent, since, windowDays, incidents newest first)
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-02 numeric volumeSizeBytes / backupSizeBytes on the stack detail response
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-05 formatBytes(bytes | null)
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-03 overview-tab.tsx health wiring and the Pitfall 7 default-stub pattern in fixtures.ts
provides:
  - getStackUptime() API client and StackUptime / Incident / IncidentCause types
  - pure uptime formatters (formatUptimePercent truncating, getUptimeTone, uptimeValueClassName, formatUptimeWindowLabel)
  - formatIncidentDuration(ms)
  - useStackUptime(stackId, stackStatus) - one fetch per stack, background refetch when stack.status changes
  - generic useNow(intervalMs, enabled) tick hook
  - UptimeCard (Uptime, Incidents, Disk Used StatCards) and IncidentList sections on the stack Overview
  - Stack.volumeSizeBytes / backupSizeBytes on the client type
  - default Playwright stub for GET /api/stacks/*/uptime
affects: [14-08 stack list uptime column (reuses uptime-format), 14-14 phase verification]

actuals:
  tokens: 16650
  tasks: 2
  commits: 2
plan_head_before: d7ab023b5febb991e5e99b40fe44eff0293a80f3
plan_head_after: 11bbcec411014aa3dd25de032ab5950e9b0eab29

tech-stack:
  added: []
  patterns:
    - "Refetch signal is a ref-compared prop (stack.status, already SSE-driven by useStack) instead of a second SSE subscription"
    - "Latest-request counter so a slow response for an old status or stack can never overwrite a newer one"
    - "Hint for a generic StatCard lives in a focusable role=group Tooltip wrapper; StatCard stays unmodified"
    - "Elapsed-time tick hook that owns no timer while disabled"

key-files:
  created:
    - client/src/lib/uptime-api.ts
    - client/src/lib/uptime-format.ts
    - client/src/lib/format-incident-duration.ts
    - client/src/hooks/use-stack-uptime.ts
    - client/src/hooks/use-now.ts
    - client/src/routes/app/stacks/components/uptime-card.tsx
    - client/src/routes/app/stacks/components/incident-list.tsx
    - client/test/integration/uptime.spec.ts
    - client/test/unit/lib/uptime-format.test.ts
    - client/test/unit/lib/format-incident-duration.test.ts
    - client/test/unit/hooks/use-stack-uptime.test.ts
    - client/test/unit/hooks/use-now.test.ts
    - client/test/unit/routes/stacks/uptime-card.test.tsx
    - client/test/unit/routes/stacks/incident-list.test.tsx
  modified:
    - client/src/lib/stacks-api.ts
    - client/src/routes/app/stacks/components/overview-tab.tsx
    - client/test/integration/fixtures.ts

key-decisions:
  - "formatUptimePercent truncates with Math.floor(p * 10 + 1e-9) / 10: the epsilon keeps 99.9 at 99.9 despite binary floating point, and only exactly 100 prints 100%, so measured downtime never reads 100%"
  - "A background refetch that supersedes an in-flight initial load still ends loading (any latest request clears it), so the cards cannot stay on skeletons"
  - "UptimeCard ignores uptime data while error is set, so a stale summary never shows next to the error alert"
  - "The 'No uptime data' tooltip wraps StatCard in a role=group, tabIndex=0 div rather than modifying the shared StatCard"
  - "useNow reads a fresh Date.now() when it becomes enabled, because incident data arrives after mount and the initial value would be stale"

patterns-established:
  - "Pitfall 7 default stub: fixtures.ts registers an empty uptime summary for GET /api/stacks/*/uptime; specs override per test"

requirements-completed: ["#24", "#27"]

coverage:
  - id: D1
    description: "Overview opens with a UptimeCard row of three StatCards (Uptime, Incidents, Disk Used volumes) above ServicesSection; overview-tab.tsx stays a composition-only orchestrator at 71 lines"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/uptime-card.test.tsx#renders the three figures with their labels"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#the uptime row sits above the Services section"
        status: pass
    human_judgment: false
  - id: D2
    description: "Uptime value is an em dash for null, 100% only for exactly 100, otherwise truncated to one decimal (99.96 reads 99.9%); tone green from 99.9, yellow from 99, red below, null neutral, each as the light/dark pair"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/uptime-format.test.ts"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/uptime-card.test.tsx#tones the uptime value by threshold"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#the Overview shows the truncated uptime percentage and the volumes' disk usage"
        status: pass
    human_judgment: false
  - id: D3
    description: "Disk Used (volumes) shows formatBytes(stack.volumeSizeBytes) from the already-loaded stack detail, an em dash when null; the client Stack type carries the numeric size fields"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/uptime-card.test.tsx#shows an em dash under Disk Used when the size is unmeasured"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#the Overview shows the truncated uptime percentage and the volumes' disk usage"
        status: pass
    human_judgment: false
  - id: D4
    description: "Uptime is fetched once per stack and refetched in the background exactly once per real stack.status change; no new SSE subscription and no polling; a failed background refetch keeps the previous figures and only warns"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-uptime.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "IncidentList: flat Section with description, Started/Ended/Duration/Cause table in a max-h-96 overflow-y-auto wrapper, whitespace-nowrap times, compact StackStatusBadge cause, closed duration formatted as s / m s / h m / d h"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/incident-list.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/format-incident-duration.test.ts"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#the Incidents section lists an ongoing and a closed incident newest first"
        status: pass
    human_judgment: false
  - id: D6
    description: "An ongoing incident shows a red Ongoing badge and an elapsed duration recomputed on a 60-second tick that exists only while one is open"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/incident-list.test.tsx#re-renders the ongoing duration after a 60-second tick"
        status: pass
      - kind: unit
        ref: "client/test/unit/hooks/use-now.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Empty (No incidents copy), loading (three skeletons), error (destructive alert with exact copy and Retry; Uptime and Incidents read an em dash), younger-than-window label and the 'No uptime data' tooltip"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/incident-list.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/uptime-card.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#a failed uptime request shows the error alert, and Retry recovers"
        status: pass
    human_judgment: false
  - id: D8
    description: "Existing Playwright specs that open a stack Overview still pass through the default uptime stub"
    requirement: "#24"
    verification:
      - kind: e2e
        ref: "uptime, stacks, service-health, mobile and theme specs (system Edge, 46 passed, no unstubbed-request error)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Thirty incidents scroll inside the list past 384px and nothing widens the page at phone width; tone contrast in light and dark, and StatCards collapsing to one column"
    requirement: "#24"
    verification:
      - kind: e2e
        ref: "client/test/integration/uptime.spec.ts#30 incidents scroll inside the list and do not widen the page at phone width"
        status: pass
    human_judgment: true
    rationale: "Page overflow and the vertical scroll are measured by script at 412px, but the plan's human-check (contrast of the uptime and incident tones in both themes, horizontal scroll feel on the phone, single-column StatCards) was not performed by a person. Recorded in .planning/WINDOWS.md."

duration: 14min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 07: Stack Overview uptime Summary

**Every stack Overview now opens with its truncated uptime percentage, incident count and volumes' disk usage, followed by a scrollable incident table with a live Ongoing marker, all refreshed in the background when the stack's status changes**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-08T09:28:00Z
- **Completed:** 2026-10-08T09:42:00Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 17 (14 created, 3 modified)

## Accomplishments
- `getStackUptime()`, pure formatters and `useStackUptime(stackId, stackStatus)`: one request per stack, refetched in the background exactly once per real `stack.status` change, no SSE subscription of its own and no polling.
- Tracer: `UptimeCard` (Uptime, Incidents, Disk Used) above `ServicesSection`, wired through the Overview and verified end to end before any expansion work. Log: `Tracer verified end-to-end - expanding` (unit set, typecheck and 38 Playwright cases across uptime, stacks, service-health and mobile all passed).
- Uptime value truncates instead of rounding (99.96 reads 99.9%, only exactly 100 reads 100%), toned green / yellow / red by threshold with the `text-{c}-600 dark:text-{c}-400` pair; the Incidents count turns red above zero.
- `IncidentList`: Started / Ended / Duration / Cause table, newest first, in a `max-h-96 overflow-y-auto` wrapper; an ongoing incident shows a red `Ongoing` badge and an elapsed time that moves on a 60-second `useNow` tick which exists only while one is open.
- Loading (skeletons), error (exact alert copy and Retry, with the two cards reading an em dash), empty, younger-than-window label and the focusable `No uptime data` tooltip are all handled.
- `fixtures.ts` stubs `**/api/stacks/*/uptime` so every spec that opens an Overview stays green; `overview-tab.tsx` is a 71-line composition of UptimeCard, ServicesSection, IncidentList and ActivityTimeline.

## Task Commits

1. **Task 1: End-to-end uptime on the Overview (tracer)** - `0c62467` (feat)
2. **Task 2: Incident list and card states** - `11bbcec` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written alongside each unit and landed in the same commit as the implementation, because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `client/src/lib/uptime-api.ts`, `uptime-format.ts`, `format-incident-duration.ts` - API client and pure formatters
- `client/src/hooks/use-stack-uptime.ts`, `use-now.ts` - fetch/refetch hook (unknown-narrowed catch, no `any`) and the generic tick hook
- `client/src/routes/app/stacks/components/uptime-card.tsx`, `incident-list.tsx` - the two section components
- `client/src/routes/app/stacks/components/overview-tab.tsx` - composition and the new order
- `client/src/lib/stacks-api.ts` - `volumeSizeBytes` / `backupSizeBytes` on `Stack`
- `client/test/integration/fixtures.ts`, `uptime.spec.ts` - default stub and 6 e2e cases
- Unit tests: `uptime-format`, `format-incident-duration`, `use-stack-uptime`, `use-now`, `uptime-card`, `incident-list`

## Decisions Made
- See `key-decisions` above. The notable one: the refetch signal is the SSE-driven `stack.status` prop compared against a ref, so the page makes one request per real change and nothing else.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright browsers are not installed on this machine**
- **Found during:** Task 1 verify
- **Issue:** `PLAYWRIGHT_PORT=5185 yarn workspace @docktor/client test:integration ...` cannot launch Chromium (`%LOCALAPPDATA%\ms-playwright` does not exist), same as 14-03 and 14-05.
- **Fix:** No browser was downloaded. The specs were run against the system Edge through a throwaway config kept outside the repository (it imports the project's `playwright.config.ts` and only adds `channel: "msedge"`). Nothing in the repo changed for this.
- **Verification:** uptime, stacks, service-health, mobile and theme specs: 46 passed, no "Unstubbed API request(s)" error.
- **Follow-up:** run the canonical command once after `yarn playwright install chromium`.

**2. [Rule 1 - Bug] Superseded initial load could leave the cards on skeletons**
- **Found during:** Task 1, while designing the hook's race handling
- **Issue:** with the latest-request guard, a background refetch that superseded an in-flight initial load would never clear `loading` (only initial-mode requests did), leaving the cards on skeletons.
- **Fix:** any latest request clears `loading`; a dedicated unit test covers the superseding order.
- **Files modified:** `client/src/hooks/use-stack-uptime.ts`
- **Committed in:** 0c62467

**3. [Rule 1 - Bug] e2e selectors counted the Services table and measured while loading**
- **Found during:** Task 2 verify
- **Issue:** the incident e2e cases indexed rows across the whole page (the Services table comes first) and the overflow case measured as soon as the Incidents heading rendered, which is also visible while loading, so the wrapper did not exist yet.
- **Fix:** rows are scoped to the table containing a `Cause` header and the overflow case waits for the `Ended` column header.
- **Files modified:** `client/test/integration/uptime.spec.ts`
- **Committed in:** 11bbcec

**4. [Scope note] Error handling in Task 1 and mobile project adaptation**
- The plan's `UptimeCard` already carried an `error` prop in Task 1 but defers its use to Task 2; it is wired in Task 2 as planned.
- "uptime.spec.ts passes on both Playwright projects": the `mobile-chromium` project matches only `mobile.spec.ts`, so the spec runs on `chromium`. The held-out phone-width check is a 412px-viewport case inside `uptime.spec.ts`; all 12 `mobile.spec.ts` cases still pass.

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking) plus 1 scope note
**Impact on plan:** No scope change.

## Issues Encountered
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (tsc --build) is clean.
- Vite logs `http proxy error: /api/events` (ECONNREFUSED) during Playwright runs; the route is stubbed by `fixtures.ts` and the line is pre-existing dev-server noise.
- The plan's human visual check was not performed by a person; see Known Gaps.

## Known Stubs
None.

## Known Gaps
- Human visual check of the Overview in light and dark theme at desktop and Pixel 7 width with 30 incidents (one ongoing). Recorded as `unrun-verify` in `.planning/WINDOWS.md`.
- Canonical Playwright command not run on a machine with Playwright browsers installed (deviation 1).

## Threat Flags
None. T-14-41 is mitigated: uptime values, timestamps and the cause render as React text children (a unit test feeds an `<img onerror>` cause and asserts no element is created), `cause` goes through StackStatusBadge's fixed map, there is no `dangerouslySetInnerHTML`, and the request path uses `encodeURIComponent(stackId)`. T-14-42 is mitigated: one background request per real `stack.status` change (ref-compared; the same value never refetches), no polling, and the 60-second tick re-renders only while an incident is ongoing.

## Next Phase Readiness
- `uptime-format.ts` (percent format, tone, class names) is ready for the 14-08 stack-list Uptime column.
- Other plans adding Overview endpoints should keep the Pitfall 7 pattern (default stub in `fixtures.ts`).
- Open: install Playwright browsers and re-run the canonical e2e command.

## Self-Check: PASSED

- All created files exist on disk (7 source files, `uptime.spec.ts`, and 6 unit test files).
- Commits `0c62467` and `11bbcec` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Acceptance criteria re-run: `useStackUptime(stack.id, stack.status)` 1; `<UptimeCard` before `<ServicesSection`; `stacks/*/uptime` in fixtures.ts 1; `volumeSizeBytes` in stacks-api.ts 1; `any` in hook and libs 0; overview-tab.tsx 71 lines; `Couldn't load uptime` 1; `No incidents` 1; `max-h-96` 1; `No uptime data` 1; order `<UptimeCard`, `<ServicesSection`, `<IncidentList`, `<ActivityTimeline`; `git diff --stat` on stat-card.tsx empty.
- Verification: client unit suite 98 files / 917 tests passed; Playwright (system Edge) uptime 6, stacks, service-health, mobile and theme passed (46 total); `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
