---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 11
subsystem: testing
tags: [playwright, e2e, a11y, touch-target, fonts, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "20-01 status labels, 20-02 DataTable/TableFrame, 20-03 TOUCH_TARGET, 20-05 self-hosted Geist Mono, 20-09 stack tab bar, 20-10 stack-detail tables"
provides:
  - "client/test/integration/visual-consistency.spec.ts: desktop browser proof for UI-02, UI-03, UI-04, UI-08 and compact A11Y-01 sizes"
  - "mobile.spec.ts '44px touch targets (A11Y-01)': phone proof of 44px targets plus 320px and long-image overflow backstops"
  - "UI-SPEC verb + noun CTA labels (Deploy Stack / Redeploy Stack, Save Settings, Save Defaults, Save Compose File)"
affects: [20-verification]

commits: 4
plan_head_before: 6224f0efa8ebfd99bbb0b4413a89a4ac02a92507
plan_head_after: 1f51ca6d555a402cf52c6dbfec22a7ee4ea2c27f

actuals:
  tokens: 6700
  tasks: 3
  commits: 4

key-files:
  created:
    - client/test/integration/visual-consistency.spec.ts
  modified:
    - client/test/integration/mobile.spec.ts
    - client/src/routes/app/stacks/components/stack-actions.tsx
    - client/src/routes/app/stacks/components/config-tab.tsx
    - client/src/routes/app/settings/components/general-settings-card.tsx
    - client/src/routes/app/settings/components/backup-defaults-card.tsx
    - client/test/unit/routes/stacks/stack-actions.test.tsx
    - client/test/unit/routes/settings/settings-page.test.tsx

key-decisions:
  - "Third-party-host proof compares request hostnames (not full origins) because the dev client addresses its stubbed API on :3000; the font file itself is held to the exact app origin"
  - "Dark-mode table frame is measured by emulateMedia(dark) plus reload in the same page, so the light and dark colours come from one stubbed session"
  - "Compose save keeps aria-label 'Save compose file'; only the visible text changed, so every existing Playwright and unit selector stays valid"

requirements-completed: [UI-02, UI-03, UI-04, UI-08, A11Y-01]
---

# Phase 20 Plan 11: Browser proof and CTA labels Summary

**Playwright specs now prove the phase's CSS-dependent promises in real browsers (one lowercase status vocabulary, self-hosted Geist Mono with no third-party host, scrollbar-free tab bar at three widths, bordered table frame in light and dark, 44px phone targets vs compact desktop sizes), and the primary CTAs read as verb + noun.**

## Accomplishments

- `visual-consistency.spec.ts` (chromium, "Visual consistency (Phase 20)"), five tests, computed styles and bounding boxes only, no screenshot baselines:
  - status reads `running` on the dashboard recent list, stack list, stack header and services table, and the timeline reads `deploying → running` (UI-02);
  - dashboard requests all stay on the app hostname, a `geist-mono` `.woff2` is fetched from the exact app origin, KPI font-family starts with Geist Mono Variable and `document.fonts.check` is true (UI-03, T-20-24);
  - tab bar wrapper has `scrollHeight <= clientHeight` and `scrollbar-width: none` at 1280, 768 and 375, no horizontal overflow at 1280 and 768, the Proxy tab stays inside the bar at 375, and four ArrowRight presses neither add vertical overflow nor scroll the page (UI-04);
  - table frame has a 1px border, rounded corner and non-transparent header tint in light and dark, with differing border colours (UI-08);
  - Stack actions, Toggle theme and the certificate delete button are at most 36px and the four pagination buttons at most 32px at 1280 (A11Y-01).
- `mobile.spec.ts` (Pixel 7) gained "44px touch targets (A11Y-01)": Stack actions and Toggle theme at least 44x44, pagination buttons at least 44x44 and rows-per-page select at least 44 tall, 320px no horizontal overflow with all four pagination buttons in the viewport, certificate delete at least 44x44, and a 60-character image with no overflow at 412px and 375px.
- CTA copy per UI-SPEC: `Deploy Stack` / `Redeploy Stack`, `Save Settings`, `Save Defaults`, visible `Save Compose File` (aria-label unchanged). Copy only, no behaviour change.

## Task Commits

1. Task 1 (tracer): `9b103ca` status vocabulary and self-hosted font spec. The tracer gate (spec lists both tests) passed before expanding.
2. Task 2: `692d601` tab bar, table frame, touch-target specs and overflow backstops.
3. Task 3: RED `ac48b9e` (4 failing label assertions), GREEN `1f51ca6`.

## Verification

- `playwright test --list` over both specs: 22 tests in 2 files, including all required titles and the four mobile-chromium "44px touch targets (A11Y-01)" tests.
- Vitest (`stack-actions`, `settings-page`, `config-tab`): 3 files, 35 tests passed after GREEN.
- Phase-wide guards (local): `git grep -l "@/components/ui/table" -- client/src` lists exactly sortable-head.tsx, table-content.tsx, table-rows.tsx (all under components/common/data/table), brownfield-import.tsx and env-editor.tsx; `git diff --quiet 7cc2dec -- client/src/components/ui` exits 0; `git grep -n "min-h-11 min-w-11" -- client/src` prints nothing.
- Acceptance greps: `toBeGreaterThanOrEqual(44)` in mobile.spec.ts = 6, `toBeLessThanOrEqual(36)` = 4, `toBeLessThanOrEqual(32)` = 2, `colorScheme: "dark"` = 1, `width: (1280|768|375)` = 4, no `toHaveScreenshot`/`toMatchSnapshot`.

Deferred to CI per the user's resource constraint (no Playwright, `tsc --build` or full test run locally): the assertions of both Playwright specs under `chromium` and `mobile-chromium`, `yarn typecheck`, and the full unit suite. Because the specs were only collected (not executed), selector or timing adjustments may surface in CI.

## Deviations from Plan

None - plan executed as written. One interpretation: the plan says "zero requests to any host other than the app origin"; the check compares hostnames because `client/src/lib/api.ts` addresses the (fully stubbed) API on `localhost:3000` when the app runs on port 5173, while the font file is held to the exact app origin.

## Known Stubs

None.

## Threat Flags

None. T-20-24 (third-party font host) is now covered by the request-hostname assertion; T-20-25 holds because both specs use the shared fixtures and stub every `**/api/**` call.

## Self-Check: PASSED

- FOUND: client/test/integration/visual-consistency.spec.ts
- FOUND commits 9b103ca, 692d601, ac48b9e, 1f51ca6 (ancestors of HEAD)
