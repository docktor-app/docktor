---
phase: 14-health-uptime-and-disk-visibility
plan: 18
subsystem: ui
tags: [react, tailwind, playwright, vitest, layout, gap-closure]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: ServiceHealthTimeline and the per-service health history panel (14-03)
provides:
  - HealthEventRow restructured as a wrapping header line plus a full-width message line
  - Browser-measured layout gate for the health history panel (transition height, row separation)
affects: [14-UAT re-test of test 2, 14-UI-SPEC design contract]

actuals:
  tokens: 3450
  tasks: 2
  commits: 2
plan_head_before: d4135805a330ac3cec5470e1e7066905009024a7
plan_head_after: 2a64bf063d7afa79a182989e7a21b7fee9aaecdd
commits: 2

tech-stack:
  added: []
  patterns:
    - "Layout regressions that jsdom cannot see are guarded by Playwright boundingBox/evaluate assertions on data-slot hooks"

key-files:
  created: []
  modified:
    - client/src/routes/app/stacks/components/service-health-timeline.tsx
    - client/test/unit/routes/stacks/service-health-timeline.test.tsx
    - client/test/integration/service-health.spec.ts
    - .planning/phases/14-health-uptime-and-disk-visibility/14-UI-SPEC.md

key-decisions:
  - "Message element changed from span to p so it is a block on its own line under the header; still React text only (T-14-10)"
  - "Phone-width Playwright case runs in the desktop chromium project via setViewportSize(412x915) rather than the Pixel 7 project, which only matches mobile.spec.ts"

patterns-established:
  - "data-slot=health-event-row / health-event-header as stable hooks for browser layout measurements"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Status transition text never wraps, measured in a browser beside a 200-character message"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#the status transition stays on one line beside a 200-character message"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx#never wraps the status transition"
        status: pass
    human_judgment: false
  - id: D2
    description: "Message renders on its own full-width line under a flex-wrap header, wrapping inside the ScrollArea without overflow at 412 px and desktop"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#at phone width the panel does not overflow and rows are visibly separated"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx#renders the message on its own line after the header, outside it"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rows separated by a divider with larger vertical padding on phones (at least 16 px between one row's last line and the next header at 412 px)"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/service-health.spec.ts#at phone width the panel does not overflow and rows are visibly separated"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/service-health-timeline.test.tsx#separates rows with a divider and pads them more on phones"
        status: pass
    human_judgment: false
  - id: D4
    description: "Overall readability of the history panel in light and dark at desktop and Pixel 7 widths (UAT test 2 re-test)"
    verification: []
    human_judgment: true
    rationale: "Visual adequacy of spacing and theme appearance is a human judgment; recorded via /gsd-verify-work 14"

duration: 9min
completed: 2026-10-10
status: complete
---

# Phase 14 Plan 18: Health history row layout Summary

**HealthEventRow now renders a flex-wrap header line (dot, timestamp, no-wrap transition, source badge) with the probe message on its own full-width line, rows divided by `divide-y` with `py-3` on phones, guarded by browser-measured Playwright cases.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-10T08:44:21Z
- **Completed:** 2026-10-10T08:53:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Closed UAT gap G-14-2: the `healthy → unhealthy` transition no longer wraps next to a long message, and rows are readable on phones.
- Added a browser layout gate, closing the gap that let the defect pass jsdom-only testing.
- Amended the 14-UI-SPEC.md row-layout line so the design contract matches the component.

Measured transition height beside a 200-character message at 1280 px desktop width (Playwright desktop project):
- Before the change: 40 px (two lines) when the test ran against the unchanged component.
- After the change: under 28 px (asserted; the plan's debug session measured the one-line transition at 126x20 after the same CSS).

The phone-width case could not be observed failing on the pre-change component for the spacing reason: the `health-event-row` hooks did not yet exist, so it failed on `rowCount` (0 of 3). Its 16 px gap assertion is therefore proven green after the change but was not observed red on a real adjacent-rows measurement.

## Task Commits

1. **Task 1: Health history row layout end-to-end (tracer)** - `23dbfb5` (fix)
2. **Task 2: Amend the design contract and run the client regression gate** - `2a64bf0` (docs)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `client/src/routes/app/stacks/components/service-health-timeline.tsx` - HealthEventRow as header line plus message line; `divide-y pr-3` list wrapper; `whitespace-nowrap` transition
- `client/test/unit/routes/stacks/service-health-timeline.test.tsx` - "row structure" cases (header classes and order, nowrap transition, message outside header, null message, divider and padding)
- `client/test/integration/service-health.spec.ts` - transition-on-one-line case at desktop width and phone-width overflow plus row-separation case
- `.planning/phases/14-health-uptime-and-disk-visibility/14-UI-SPEC.md` - amended row-layout line

## Decisions Made
- Message element is a `p` (block) so it sits on its own line under the header while keeping `min-w-0 break-words wrap-anywhere`; text-only rendering preserves T-14-10 / T-14-69.
- The phone-width case uses `page.setViewportSize` inside the desktop `chromium` project, as the plan prescribed; the History button was reachable via `scrollIntoViewIfNeeded`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright Chromium browser was not installed**
- **Found during:** Task 1 (RED run of the Playwright spec)
- **Issue:** `browserType.launch: Executable doesn't exist` for chromium_headless_shell-1208; no `ms-playwright` directory existed, so no integration test could run.
- **Fix:** Ran `yarn workspace @docktor/client exec playwright install chromium`, which downloads the browser pinned by the project's existing `@playwright/test` dependency. No package was added and no project file changed (not a package-manager dependency install).
- **Files modified:** none (user-level browser cache only)
- **Verification:** all Playwright specs then ran
- **Committed in:** n/a

---

**Total deviations:** 1 auto-fixed (1 blocking, environment only)
**Impact on plan:** None on scope; the browser download was required to run the plan's own verify commands.

## Issues Encountered
- The `<verify>` for the unit run prints a coverage table that truncates the vitest summary; re-ran with `--coverage.enabled=false` to read the "Test Files" line (41 tests passed in the two targeted files; 941 passed across 100 files in the full client suite).

## Verification Results
- `yarn workspace @docktor/client test`: 100 files, 941 tests passed.
- Playwright desktop (service-health, stacks, theme): 32 passed. Pixel 7 mobile spec: 12 passed.
- `yarn typecheck`: exit 0.
- Acceptance greps: `health-event-row` 1, `health-event-header` 1, `divide-y` 1, `flex-wrap` 1, `whitespace-nowrap` 3; `14-UI-SPEC.md` has `flex-wrap`; `14-UAT.md` has no diff.
- Pending human step (per plan): UAT test 2 re-test through `/gsd-verify-work 14`.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths, or trust-boundary changes; T-14-69 mitigated (message stays a React text node, the "renders the message verbatim as text, never as HTML" case still passes).

## User Setup Required

None - no external service configuration required. (Developers running Playwright locally need the Chromium browser: `yarn workspace @docktor/client exec playwright install chromium`.)

## Next Phase Readiness
- Gap G-14-2 is fixed and awaits the human UAT re-test; remaining gap-closure plans 14-19 and 14-20 are independent of this change.

## Self-Check: PASSED

- FOUND: client/src/routes/app/stacks/components/service-health-timeline.tsx
- FOUND: client/test/unit/routes/stacks/service-health-timeline.test.tsx
- FOUND: client/test/integration/service-health.spec.ts
- FOUND commit 23dbfb5, FOUND commit 2a64bf0

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-10*
