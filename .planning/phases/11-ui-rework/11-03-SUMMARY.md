---
phase: 11-ui-rework
plan: 03
subsystem: client-ui
tags: [dark-mode, next-themes, theme-provider, header-toggle, sonner, tailwind-v4]
requires:
  - phase: 11-ui-rework
    provides: "11-01's PageHeader/PageTitle contract in components/common/layout/page.tsx and the CSS dark-mode token layer already in index.css"
provides:
  - "ThemeProvider (client/src/components/common/theme-provider.tsx) — next-themes wrapper, THEME_STORAGE_KEY='theme'"
  - "ThemedToaster (client/src/components/common/themed-toaster.tsx) + toSonnerTheme() — sonner Toaster wired to the active theme"
  - "No-flash pre-paint script + color-scheme meta in client/index.html"
  - "ThemeToggle (client/src/components/common/theme-toggle.tsx) — sun/moon DropdownMenu toggle, aria-label 'Toggle theme', 44px mobile touch target"
  - "PageHeader renders ThemeToggle in its top row on every authenticated page; PageTitle uses font-semibold"
  - "client/test/integration/theme.spec.ts — OS-default, manual-override reload-persistence, and toggle-visibility E2E coverage"
affects: [11-09, 11-12, dashboard, stack-detail-page, settings, backup-detail-page]
actuals:
  tokens: 5803
  tasks: 2
  commits: 2
plan_head_before: 00e618effa770263c43ec48980c2f67ae138ad2e
tech-stack:
  added: []
  patterns:
    - "next-themes ThemeProvider (attribute=class, defaultTheme=system, enableSystem, storageKey, disableTransitionOnChange) as the single theme store"
    - "Static inline pre-paint script in index.html mirroring next-themes' storage key/class strategy — flash prevention for a client-rendered SPA with no hydration step"
    - "Icon visibility driven by the dark class via CSS dark: variants, not React state (no flash of wrong icon before next-themes resolves)"
key-files:
  created:
    - client/src/components/common/theme-provider.tsx
    - client/src/components/common/themed-toaster.tsx
    - client/src/components/common/theme-toggle.tsx
    - client/test/unit/components/common/theme-provider.test.tsx
    - client/test/unit/components/common/theme-toggle.test.tsx
    - client/test/unit/components/common/page-header.test.tsx
    - client/test/integration/theme.spec.ts
  modified:
    - client/src/main.tsx
    - client/index.html
    - client/test/setup.ts
    - client/src/components/common/layout/page.tsx
key-decisions:
  - "Pre-paint flash prevention is a hand-authored static <script> in index.html (not next-themes' own SSR-oriented injected script) — this app is a client-rendered Vite SPA with no hydration step, so the RESEARCH doc's suppressHydrationWarning note doesn't apply"
  - "Pre-paint script only ever compares the stored value against the three fixed strings 'dark'/'light'/'system' — never evaluates, injects, or assigns it — closing threat T-11-08 with no CSP/nonce plumbing needed"
  - "ThemeToggle is a DropdownMenu (Light/Dark/System), not a two-state button — a two-state toggle would give users no way back to 'follow OS' after overriding, which D-15 implies they should retain"
  - "test/setup.ts's global matchMedia stub is guarded by typeof window.matchMedia !== 'function', so the pre-existing per-test stubs in stack-detail-page.test.tsx and backup-detail-page.test.tsx become no-ops automatically with zero edits to those files"
patterns-established:
  - "toSonnerTheme()-style narrowing switch (not a cast) for mapping a broader library value onto a component's narrower prop type"
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-15 (dark mode via next-themes: system default, manual override, persisted) and D-16 (always-visible sun/moon toggle in the app header)."
coverage:
  - id: D1
    description: "OS dark/light preference drives the html class on first paint with no stored preference"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/theme-provider.test.tsx#ThemeProvider > puts the dark class on document.documentElement when localStorage holds theme=dark"
        status: pass
      - kind: e2e
        ref: "client/test/integration/theme.spec.ts#Dark mode (D-15/D-16) > follows the OS dark preference on first paint with no stored preference"
        status: pass
      - kind: e2e
        ref: "client/test/integration/theme.spec.ts#Dark mode (D-15/D-16) > follows the OS light preference on first paint with no stored preference"
        status: pass
    human_judgment: false
  - id: D2
    description: "A manual Light/Dark/System override applies immediately and persists across a full reload via localStorage"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/theme-toggle.test.tsx#ThemeToggle > choosing Dark adds the dark class and stores 'dark' under the theme storage key"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/common/theme-toggle.test.tsx#ThemeToggle > choosing Light removes the dark class and stores 'light'"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/common/theme-toggle.test.tsx#ThemeToggle > choosing System stores 'system'"
        status: pass
      - kind: e2e
        ref: "client/test/integration/theme.spec.ts#Dark mode (D-15/D-16) > a manual Dark override persists across a reload, even against an OS dark preference already set"
        status: pass
      - kind: e2e
        ref: "client/test/integration/theme.spec.ts#Dark mode (D-15/D-16) > a manual Light override persists across a reload, even against an OS dark preference"
        status: pass
    human_judgment: false
  - id: D3
    description: "localStorage-unavailable/throwing falls back to the OS preference silently, no error UI or crash"
    requirement: "D-15 / UI-SPEC error row"
    verification:
      - kind: unit
        ref: "client/index.html pre-paint script's try/catch, asserted present via client/test/unit/components/common/theme-provider.test.tsx#index.html pre-paint theme script"
        status: pass
    human_judgment: true
    rationale: "The try/catch fallback path (a throwing localStorage) is not exercised by an automated test — code-reviewed as correct against the UI-SPEC error row, but a live throwing-localStorage scenario (private-mode/disabled storage) was not simulated in a browser."
  - id: D4
    description: "Always-visible sun/moon toggle (aria-label 'Toggle theme') in PageHeader's top row on every authenticated page, 44px touch target below md"
    requirement: "D-16"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/page-header.test.tsx#PageHeader (D-16) > renders the 'Toggle theme' button in its top row alongside the breadcrumbs"
        status: pass
      - kind: e2e
        ref: "client/test/integration/theme.spec.ts#Dark mode (D-15/D-16) > the 'Toggle theme' button is visible on the stacks list and a stack detail page"
        status: pass
    human_judgment: true
    rationale: "44px (min-h-11/min-w-11) touch-target sizing and the icon-swap visual polish were verified via class assertions and manual code review, not a rendered-pixel/visual screenshot check."
  - id: D5
    description: "Toast notifications follow the active theme; icon visibility (sun/moon) is CSS-driven so it never flashes the wrong icon"
    requirement: "D-15/D-16 (toast theming, loading-state row)"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/theme-provider.test.tsx#toSonnerTheme > maps 'dark'/'light'/'system'-or-other correctly"
        status: pass
    human_judgment: false
  - id: D6
    description: "PageTitle uses font-semibold (600), not font-bold (700), per the Typography contract"
    requirement: "UI-SPEC Typography"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/page-header.test.tsx#PageTitle typography > uses font-semibold, not font-bold"
        status: pass
    human_judgment: false
duration: 30min
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 03: Dark Mode Wiring Summary

**Wired next-themes end to end: a no-flash pre-paint script, ThemeProvider/ThemedToaster, and an always-visible header sun/moon toggle whose choice persists across reloads.**

## Performance
- **Duration:** 30min
- **Started:** 2026-09-26T10:19:00Z
- **Completed:** 2026-09-26T10:48:00Z
- **Tasks:** 2
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- Wrapped the app in next-themes' `ThemeProvider` (attribute="class", defaultTheme="system", enableSystem, storageKey="theme", disableTransitionOnChange) directly inside `StrictMode` in `main.tsx`.
- Added a static, non-evaluating pre-paint `<script>` to `client/index.html` that reads `localStorage.getItem("theme")`, falls back to `prefers-color-scheme: dark` on missing/"system"/any other value or a thrown error, and sets the `dark` class + `color-scheme` before any stylesheet/module loads — closing the white-flash gap for this hydration-less SPA.
- Replaced the bare sonner `Toaster` with `ThemedToaster`, which derives its `theme` prop from `useTheme()` via a narrowing `toSonnerTheme()` function (no cast).
- Fixed `ProtectedRoute`'s light-only `text-gray-500` loading text to `text-muted-foreground` so it's legible in dark mode.
- Added `ThemeToggle`: a DropdownMenu (Light/Dark/System) behind a ghost icon button, `aria-label="Toggle theme"`, 44px touch target below `md`, `hover:text-primary` tint, and a CSS-driven (not React-state-driven) sun/moon icon swap.
- Rendered `ThemeToggle` in `PageHeader`'s top row (`ml-auto`, after breadcrumbs) — since every authenticated page already renders `PageHeader`, this satisfies D-16's "always visible" requirement with zero new persistent chrome.
- Made `PageHeader`'s children row `flex-wrap` (was a plain flex row) so title/actions wrap on narrow screens instead of overflowing, and converged `PageTitle` from `font-bold` to `font-semibold` per the Typography contract.
- Added a global `matchMedia` stub to `test/setup.ts`, guarded by `typeof window.matchMedia !== "function"` — the two pre-existing per-test local stubs (stack-detail-page.test.tsx, backup-detail-page.test.tsx) needed zero edits and became no-ops automatically.
- `client/test/integration/theme.spec.ts`: 5 self-sufficient Playwright tests covering OS-dark/OS-light first paint, Dark/Light override reload-persistence (against an OS dark preference), and toggle visibility on both the stacks list and a stack detail page.

## Task Commits
1. **Task 1: Follow the OS theme from first paint — ThemeProvider, pre-paint script, themed toasts** - `20c695d` (feat)
2. **Task 2: Always-visible sun/moon toggle in the page header with a persisted override** - `33529b4` (feat)

## Files Created/Modified
- `client/src/components/common/theme-provider.tsx` - `ThemeProvider` + `THEME_STORAGE_KEY` (next-themes wrapper)
- `client/src/components/common/themed-toaster.tsx` - `ThemedToaster` + `toSonnerTheme()`
- `client/src/components/common/theme-toggle.tsx` - `ThemeToggle` (header sun/moon dropdown)
- `client/src/main.tsx` - wraps `App` in `ThemeProvider`, renders `ThemedToaster`, fixes loading text
- `client/index.html` - pre-paint theme script + `color-scheme` meta
- `client/src/components/common/layout/page.tsx` - `PageHeader` renders `ThemeToggle`; `flex-wrap` children row; `PageTitle` → `font-semibold`
- `client/test/setup.ts` - global `matchMedia` stub
- `client/test/unit/components/common/theme-provider.test.tsx` - `ThemeProvider`/`toSonnerTheme`/pre-paint-script coverage
- `client/test/unit/components/common/theme-toggle.test.tsx` - toggle open/select/persist coverage
- `client/test/unit/components/common/page-header.test.tsx` - toggle visibility + `PageTitle` typography coverage
- `client/test/integration/theme.spec.ts` - E2E OS-default, reload-persistence, and visibility coverage

## Decisions Made
See `key-decisions` in the frontmatter above.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The full client unit suite showed one flaky failure (`service-upgrade-dialog.test.tsx`'s "renders one option per candidate with the latest preselected") on the first full-suite run under this host's resource contention; it passed cleanly in isolation and again on a full clean re-run afterward (343/343 passing, 3 todo). Not attributable to this plan's changes — no file this plan touches is imported by that test. Consistent with the documented flake class already noted elsewhere in STATE.md (host contention under the full parallel suite).
- `yarn` was not on `PATH` in this execution environment (corepack's global symlink step failed with `EACCES`); all `yarn` invocations in this plan were run via `corepack yarn ...` instead, which works identically. No project files were affected by this environment workaround.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 11-04 (dashboard StatCard extraction). `ThemeProvider`/`useTheme` is now the single theme store for the whole app; plans 11-09 and 11-12 can key CodeMirror's theme off `useTheme().resolvedTheme` as planned. Note for 11-10 (main.tsx → data router conversion): the current provider nesting is `StrictMode > ThemeProvider > App`, with `ThemedToaster` rendered inside `App`'s `BrowserRouter` — carry this nesting forward when converting to a data router.

## Self-Check: PASSED

All 7 created/modified files verified present on disk; both task commits (`20c695d`, `33529b4`) verified present in `git log`.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*
