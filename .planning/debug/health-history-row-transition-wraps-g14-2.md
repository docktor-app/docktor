---
status: diagnosed
trigger: "G-14-2 (14-UAT.md test 2): \"it wraps, but also the healthy->unhealthy is wrapped. For mobile, add some spaces between the rows. the rest looks good.\""
created: 2026-10-10T08:00:00Z
updated: 2026-10-10T08:20:00Z
---

## Current Focus

hypothesis: CONFIRMED - see Resolution
test: n/a (goal: find_root_cause_only)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller

## Symptoms

expected: Health history message wraps inside the h-48 ScrollArea without horizontal overflow, with the status transition intact and readable rows
actual: Message wraps, but the "healthy -> unhealthy" transition text also wraps; on mobile (Pixel 7, 412px) the rows need more spacing between them
errors: none (visual/layout)
reproduction: Stack detail > Services > History button on a service whose latest event has a ~200 char http-probe failure message; view in light/dark at desktop and Pixel 7 width
started: Introduced with Phase 14-03 (commits de5d332, 58bb70d), never layout-tested beyond jsdom class assertions

## Eliminated

- hypothesis: The transition span wraps at Pixel 7 width (412px) because of the same flex-shrink squeeze
  evidence: At 412px the row is `flex-col` (below `sm`), so every child is stretched to the full 352px row width. The transition span measured 352x20 (one line) on all four rows. The wrap only appears from the `sm` breakpoint (640px) upward. Mobile therefore has a different, spacing-only problem.
  timestamp: 2026-10-10T08:15:00Z
- hypothesis: The long message causes horizontal overflow of the ScrollArea
  evidence: ScrollArea viewport scrollWidth === clientWidth at 412, 640, 700, 1024 (no overflow). `min-w-0 break-words wrap-anywhere` on the message plus `whitespace-normal` on the container work as intended (matches UAT: "it wraps").
  timestamp: 2026-10-10T08:15:00Z
- hypothesis: formatHealthStatus produces text that contains a line-break opportunity beyond the natural spaces
  evidence: It returns the raw status string ("healthy"/"unhealthy"/"unknown"/"cleared"); the break opportunities are the two spaces around the arrow in the JSX template `{from} → {to}`, inside a single span. Not the cause, only the thing that becomes breakable.
  timestamp: 2026-10-10T08:15:00Z

## Evidence

- timestamp: 2026-10-10T08:05:00Z
  checked: client/src/routes/app/stacks/components/service-health-timeline.tsx HealthEventRow (lines 67-85)
  found: Row is `flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2` with NO `flex-wrap`. Children: StatusDot (shrink-0), timestamp span (`whitespace-nowrap`), transition span (`text-sm` only - no whitespace-nowrap, no shrink-0), ToneBadge (Badge base has `whitespace-nowrap shrink-0`), message span (`min-w-0 break-words wrap-anywhere text-xs`). List wrapper is `space-y-2 pr-3`, no divider/border/padding per row.
  implication: At >= sm, all five items compete for one line. The transition span is the only other shrinkable item besides the message, and it has min-width:auto (min-content = longest word), so it can shrink and wrap.

- timestamp: 2026-10-10T08:08:00Z
  checked: Existing tests (client/test/unit/routes/stacks/service-health-timeline.test.tsx, client/test/integration/service-health.spec.ts)
  found: The jsdom test asserts only `whitespace-normal` on the container and `min-w-0`/`wrap-anywhere` on the message, and getByText("healthy -> cleared"). Nothing asserts transition no-wrap or row spacing; jsdom performs no layout. The E2E spec has no wrap/overflow/spacing assertions.
  implication: The regression slipped through because no gate measures layout. The only protection that can run in jsdom is a class assertion.

- timestamp: 2026-10-10T08:12:00Z
  checked: Real component rendered in headless Chrome (scratch Vite+Tailwind v4 harness importing the actual ServiceHealthTimeline inside the same Table > TableCell colSpan structure as services-section.tsx), 200-char http-probe message, widths 412 / 640 / 700 / 1024
  found: |
    Transition span "healthy -> unhealthy" (natural size 126x20 = one line, seen on rows that have no message):
      412px : 352x20 on every row (no wrap; flex-col stretches it)
      640px : 61x60 (3 lines) on the long-message rows
      700px : 61x60 (3 lines)
      1024px: 68x40 (2 lines)
    The message span gets 296-673px and wraps to 2-4 lines. Rows with null / short message keep the transition at 126x20.
    ScrollArea viewport: scrollWidth == clientWidth at all widths (no horizontal overflow).
  implication: Reproduces the UAT report exactly (message wraps, transition wraps). The squeeze is data-dependent (only rows whose message does not fit) which is why it looks inconsistent row to row.

- timestamp: 2026-10-10T08:13:00Z
  checked: Flexbox arithmetic at 1024px (row 964px)
  found: Fixed items: dot 8 + timestamp 100 + badge 83 + 4 gaps x 8 = 223px. Shrinkable: transition (flex-basis 126) and message (flex-basis = max-content of 200 chars, ~1500px; `min-w-0` lets it go to 0). Overflow ~885px is distributed in proportion to flex-basis, so the transition loses ~58px of its 126px and is clamped at its min-content (the word "unhealthy"/"healthy" + arrow) = 61-68px, forcing the wrap.
  implication: Cause is flex-shrink distribution, not the message wrapping logic. The message's `min-w-0` is correct for it to shrink, but nothing protects its siblings.

- timestamp: 2026-10-10T08:14:00Z
  checked: Mobile (412px) screenshot and gaps
  found: Rows are `flex-col`: dot (own 8px line), timestamp, transition, badge, message = 4-5 stacked lines per row. Gap between rows is 8px (space-y-2), versus 4px between lines inside a row (gap-1) - only 2x. Visually the next row's lone dot sits right under the previous message's last line, so rows run together. No border/divider/padding.
  implication: Confirms the "add some spaces between the rows" report. Inter-row separation is too weak relative to intra-row spacing in the stacked layout.

- timestamp: 2026-10-10T08:18:00Z
  checked: Fix-direction experiment (CSS injected into the page via Playwright; no source files modified)
  found: |
    (a) Adding only `white-space: nowrap` to the transition span: transition = 126x20 (one line) on every row at 640 and 1024, no horizontal overflow (message still wraps, min-w-0 absorbs the shrink). 412px unchanged.
    (b) Header line `flex-wrap items-center gap-x-2 gap-y-1` (dot, timestamp, transition nowrap, badge) + message `basis-full` on its own line + per-row bottom border/padding: transition 126x20 at 412/640/1024, no overflow; at 412 the rows are clearly separated and the dot is no longer orphaned on its own line (screenshots fix-412.png / fix-1024.png in scratchpad).
  implication: Both defects are layout-class issues in HealthEventRow only; formatHealthStatus and the data are fine.

## Resolution

root_cause: |
  Two layout defects in HealthEventRow (service-health-timeline.tsx lines 67-85):
  1. Transition wrap (>= sm): the row is a single non-wrapping flex row (`sm:flex-row`, no flex-wrap) in which the long message (flex-basis = its 200-char max-content, `min-w-0`) shares the line with the transition span. The transition span (`text-sm` only; no `whitespace-nowrap`/`shrink-0`) is a normal shrinkable flex item with min-width:auto, so the flex algorithm distributes the overflow across it and the message proportionally to flex-basis. It is squeezed down to its min-content (61-68px) and its text wraps ("healthy →" / "unhealthy", up to 3 lines). It only happens on rows whose message does not fit on the remaining line.
  2. Row spacing (< sm, Pixel 7): the phone layout is `flex-col` with 4-5 stacked lines per row (including a lone StatusDot line), separated from the next row only by the list's `space-y-2` (8px) versus `gap-1` (4px) inside a row. No divider, no row padding, so rows visually run together.
fix: (not applied - diagnose only)
verification: (not applied - diagnose only; fix direction validated by in-browser CSS injection, see Evidence)
files_changed: []
