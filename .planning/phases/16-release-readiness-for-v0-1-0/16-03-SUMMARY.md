---
phase: 16-release-readiness-for-v0-1-0
plan: 03
subsystem: ui
tags: [react, localStorage, banner, environment-warnings, docs-links, playwright, vitest]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "plan 01 GET /api/settings/environment and the shared EnvironmentReport DTO"
  - phase: 16-release-readiness-for-v0-1-0
    provides: "plan 02 Release inputs (DOCS_LINK_STYLE=github, DOCS_BASE_URL)"
provides:
  - "Dismissible yellow 'Configuration warnings' banner above every authenticated page (D-13)"
  - "docsUrl(page, anchor?) and DOCS_BASE_URL: the single place the client builds docs links"
  - "getEnvironmentReport() client call and useEnvironmentWarnings() hook with per-browser dismissal"
  - "Playwright default stub for /api/settings/environment plus environment-banner.spec.ts"
affects: [16-06 docs Startup checks anchor, 16-09 release candidate smoke test, 16-10 verification]

requirements-completed: ["#7"]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: a73f94d85e626f760ebd43694351e444db6ae635
plan_head_after: e3ca049883f20fd39600ef09be03d234a2b17f1c

tech-stack:
  added: []
  patterns:
    - "Docs links built only through docsUrl(); a pure buildDocsUrl(style, base, page, anchor) keeps both link styles testable"
    - "Per-browser dismissal: localStorage JSON string array of code:variable keys, guarded adapter, persisted by an effect only when the set changes"

key-files:
  created:
    - client/src/lib/docs-links.ts
    - client/src/hooks/use-environment-warnings.ts
    - client/src/components/domain/environment/environment-warnings-banner.tsx
    - client/test/unit/lib/docs-links.test.ts
    - client/test/unit/hooks/use-environment-warnings.test.ts
    - client/test/unit/components/domain/environment/environment-warnings-banner.test.tsx
    - client/test/unit/components/app-layout.test.tsx
    - client/test/integration/environment-banner.spec.ts
  modified:
    - client/src/lib/settings-api.ts
    - client/src/components/app-layout.tsx
    - client/test/integration/fixtures.ts

key-decisions:
  - "The banner lives in AppLayout inside SidebarInset above the Outlet; its px-6 pt-4 wrapper renders only while warnings exist, so pages without warnings are unchanged"
  - "Dismissal key is code:variable, so the same code on another variable shows (for example TEMPLATE_SECRET_IN_PRODUCTION for DATABASE_URL after BETTER_AUTH_SECRET was dismissed)"
  - "Persistence is an effect that writes only when the dismissed set object changed; the post-load prune returns the same set when nothing is pruned, so a normal mount never writes"
  - "dismissAll unions the current report's keys into the stored set instead of replacing it"
  - "The docs link style is the interim github one (DOCS_LINK_STYLE=github); switching to a hosted site means changing two constants in docs-links.ts"

patterns-established:
  - "Presentational banner in components/domain/ takes props in and callbacks out; the hook owns data and storage"

coverage:
  - id: D1
    description: "A signed-in user sees every environment warning (variable and message) in a yellow banner rendered by AppLayout above the routed page, with a docs link to the Startup checks section"
    requirement: "#7"
    verification:
      - kind: unit
        ref: "client/test/unit/components/app-layout.test.tsx#renders the banner together with the routed page"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/environment/environment-warnings-banner.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/docs-links.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dismissals persist per browser by code:variable, stale keys are pruned, new or reintroduced warnings reappear, unreadable storage degrades safely"
    requirement: "#7"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-environment-warnings.test.ts#useEnvironmentWarnings dismissal persistence (#7, D-13)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No warnings or a failed request renders nothing; message markup renders as literal text"
    requirement: "#7"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-environment-warnings.test.ts#exposes no warnings and the message when the request fails, without retrying"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/environment/environment-warnings-banner.test.tsx#renders markup in a message as literal text (T-16-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Playwright journey (show, dismiss, reload, new warning, Dismiss all, docs link) passes on chromium and mobile-chromium, and the default stub keeps every existing spec green"
    requirement: "#7"
    verification:
      - kind: e2e
        ref: "client/test/integration/environment-banner.spec.ts (runs on GitHub Actions CI only)"
        status: unknown
    human_judgment: false
  - id: D5
    description: "The banner has readable contrast in light and dark theme and the 'How to fix these' link opens the Startup checks section"
    verification: []
    human_judgment: true
    rationale: "Visual contrast and the final docs destination (the docs page and anchor are written by 16-06) need a human looking at the running app"

duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 03: Environment warnings banner Summary

**A signed-in user now sees the server's boot-time environment warnings in a dark-mode-aware, dismissible banner above every authenticated page, with dismissals kept per browser by code:variable and a docs link built by a single docsUrl() helper.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-11T21:13:05Z
- **Completed:** 2026-10-11T21:17:47Z (last task commit)
- **Tasks:** 2 (1 tracer, 1 auto), both TDD
- **Files:** 11 (8 new, 3 modified)

## Accomplishments

- `docs-links.ts` is the only place the client knows the docs URL scheme: `DOCS_LINK_STYLE="github"` and `DOCS_BASE_URL=https://github.com/docktor-app/docks/blob/main` from 16-02's Release inputs. The pure `buildDocsUrl` serves both styles (site: `base/page#anchor`, github: `base/page.md#anchor`), no `#` without an anchor.
- `useEnvironmentWarnings` fetches once per mount (no SSE, no polling: the report is fixed per boot), swallows errors into `error`, and exposes `warnings`, `dismiss`, `dismissAll`. Dismissals live in `docktor.environment-warnings.dismissed` as `code:variable` strings; after a load, stored keys absent from the report are pruned; a throwing or invalid store means "nothing dismissed" and a throwing `setItem` keeps the in-memory dismissal.
- `EnvironmentWarningsBanner` follows the stack-alerts yellow alert with `dark:` counterparts, a `ToneBadge tone="yellow"` count, a `<code>` variable name and plain-text message per item, per-item dismiss buttons, "Dismiss all" (only when more than one warning) and a "How to fix these" link with `target="_blank" rel="noopener noreferrer"`.
- `AppLayout` renders it inside `SidebarInset` above `<Outlet />`; with no warnings no wrapper is rendered.
- `fixtures.ts` stubs `**/api/settings/environment` with `{"warnings":[]}` by default (RESEARCH Pitfall 4); `environment-banner.spec.ts` overrides it through one handler reading a mutable list.
- Tracer gate: Task 1's verification (four unit files plus `tsc -b`, and the full client suite) was re-run end to end before Task 2 started. Result: tracer verified, expansion continued.

## Task Commits

1. **Task 1 (tracer): docs-link helper, API call, hook, banner, AppLayout wiring, Playwright default stub** - `e442933` (feat)
2. **Task 2: localStorage dismissal by code:variable, stale-key pruning, Playwright journey** - `e3ca049` (feat)

The plan's tasks are `tdd="true"` with one commit per task, so RED and GREEN share a commit. RED was observed first both times: all four Task 1 files failed at module resolution, and 6 of the 16 hook tests failed on the persistence assertions before the implementation.

**Plan metadata:** this SUMMARY plus STATE.md/ROADMAP.md/REQUIREMENTS.md. Measured with `git rev-list --count` from `plan_head_before` to HEAD before this SUMMARY: 2.

## Verification results

- Plan verify command: docs-links, hook, banner and app-layout files - 4 files, 20 tests passed after Task 1; hook (16 tests) and app-layout (2 tests) passed after Task 2.
- Full client unit suite after Task 1: 118 files, 1127 tests passed.
- `yarn workspace @docktor/client exec tsc -b`: exit 0 after both tasks.
- Acceptance greps: `api/settings/environment` in fixtures.ts = 1; `useEnvironmentWarnings()` in app-layout.tsx = 1 and `<Outlet` = 1; `git diff --quiet -- client/src/components/ui` exits 0; banner light color utilities 5 = dark counterparts 5; `dangerouslySetInnerHTML` = 0; `docktor.environment-warnings.dismissed` in the hook = 1; `page.reload` in the spec = 3.
- Not run here by project rule: Playwright (`environment-banner.spec.ts` and the whole integration suite run on GitHub Actions).

## Files Created/Modified

- `client/src/lib/docs-links.ts` - docs URL scheme, `DocsPage` union, `buildDocsUrl`, `docsUrl`
- `client/src/lib/settings-api.ts` - `getEnvironmentReport()`
- `client/src/hooks/use-environment-warnings.ts` - fetch-once hook with persisted dismissal
- `client/src/components/domain/environment/environment-warnings-banner.tsx` - presentational banner
- `client/src/components/app-layout.tsx` - hook call and banner above the Outlet
- `client/test/unit/...` - four unit files (docs-links, hook, banner, app-layout)
- `client/test/integration/fixtures.ts` - default empty-warnings stub
- `client/test/integration/environment-banner.spec.ts` - Playwright journey

## Decisions Made

See `key-decisions` above. The `DocsPage` union holds exactly the fixed page paths from the plan; `guide/introduction` (used by 16-02's issue chooser) is not in it because nothing in the client links to it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None. The banner's data comes from the live endpoint; the only hardcoded value is the interim docs base URL, which is intentional and replaced when a docs site is hosted (see Next Phase Readiness).

## Threat Flags

None. T-16-09 (value-free DTO, session required) holds because the banner renders only code, variable and message from the 16-01 DTO; T-16-10 is covered by the literal-text unit test and the absence of `dangerouslySetInnerHTML`; T-16-11 by the swallowed-error test (single fetch, nothing rendered on failure); T-16-12 by the `rel` assertion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-06 must publish the `startup-checks` anchor on `reference/deployment`; the banner link points at `https://github.com/docktor-app/docks/blob/main/reference/deployment.md#startup-checks`.
- Human check (D5): start the app with `TRUST_PROXY=true`, sign in, and confirm the banner reads well in light and dark and that the link opens the Startup checks section once 16-06's page exists.
- CI: confirm the whole Playwright suite plus `environment-banner.spec.ts` on chromium and mobile-chromium on the first push.
- When a docs site is hosted, change `DOCS_LINK_STYLE` and `DOCS_BASE_URL` in `client/src/lib/docs-links.ts`.

## Self-Check: PASSED

All eight created files exist on disk; commits `e442933` and `e3ca049` are ancestors of HEAD; `git rev-list --count` from `plan_head_before` to HEAD measured 2 before this SUMMARY commit.
