---
phase: 14-health-uptime-and-disk-visibility
plan: 10
subsystem: ui
tags: [react, react-hook-form, zod, vitest, playwright, tailwind, shadcn-alert-dialog, sse]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-04 GET /api/uptime/stacks and GET/PUT /api/settings/health, shared healthSettingsSchema
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-07 uptime-format.ts (formatUptimePercent, getUptimeTone) and the Pitfall 7 default-stub pattern in fixtures.ts
provides:
  - getStackUptimes() / StackUptimes batch API client
  - useStackUptimes() - one batch request, silent degradation, refetch only on real status transitions
  - UptimeBadge domain component and an opt-in Uptime column on StackList (Dashboard and Stacks page)
  - getHealthSettings() / saveHealthSettings() API client
  - HealthRetentionCard mounted at the end of Settings > Stacks, with a shorten-retention confirmation dialog
  - default Playwright stubs for GET /api/uptime/stacks and GET /api/settings/health
affects: [14-14 phase verification]

actuals:
  tokens: 13100
  tasks: 2
  commits: 2
plan_head_before: 32ee2f73e0dba9a35e2bec1524f344ca2de56788
plan_head_after: 8ab322434f29d01e3aff9e07afb88cbd07181504

tech-stack:
  added: []
  patterns:
    - "StackList stays data-free: the Uptime column exists only when a page passes an `uptimes` prop built by a hook"
    - "Latest-request counter in a refetching hook so a slow older response never overwrites a newer one"
    - "Destructive-change gate: a form submit that lowers a value opens an AlertDialog; pending values outlive the dialog so its copy does not blank during the exit animation"

key-files:
  created:
    - client/src/hooks/use-stack-uptimes.ts
    - client/src/components/domain/stack/uptime-badge.tsx
    - client/src/routes/app/settings/components/health-retention-card.tsx
    - client/test/integration/uptime-retention.spec.ts
    - client/test/unit/hooks/use-stack-uptimes.test.ts
    - client/test/unit/components/domain/stack/uptime-badge.test.tsx
    - client/test/unit/routes/settings/health-retention-card.test.tsx
  modified:
    - client/src/lib/uptime-api.ts
    - client/src/lib/settings-api.ts
    - client/src/components/domain/stack/stack-list.tsx
    - client/src/routes/app/dashboard.tsx
    - client/src/routes/app/stacks/index.tsx
    - client/src/routes/app/settings.tsx
    - client/test/integration/fixtures.ts
    - client/test/unit/components/domain/stack/stack-list.test.tsx
    - client/test/unit/routes/settings/settings-page.test.tsx

key-decisions:
  - "The shorten-retention confirm button uses the secondary variant: UI-SPEC reserves the accent for Save Health Settings and forbids a destructive-styled button, so the confirm is neither"
  - "Keep {old} days closes the dialog but leaves the typed value in the field, so pressing Save again re-opens the confirmation instead of silently discarding the edit"
  - "An empty retention input maps to NaN so the shared schema, not client code, produces the 1-365 message"
  - "useStackUptimes refetches on stack_status frames and on container_state frames that carry a statusLog; every other frame is ignored and there is no polling"

patterns-established:
  - "Pitfall 7 default stubs now also cover GET /api/uptime/stacks and GET /api/settings/health"

requirements-completed: ["#24"]

coverage:
  - id: D1
    description: "Dashboard and Stacks page show an Uptime column between Status and Services, each cell an UptimeBadge with the truncated percentage, tone and the 'Uptime over the last N days' title; StackList renders the column only when given an uptimes prop"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-list.test.tsx#places the Uptime column between Status and Services"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/uptime-badge.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#shows each stack's truncated uptime and an em dash for a stack without data"
        status: pass
    human_judgment: false
  - id: D2
    description: "Loading shows a Skeleton per cell; a failed batch request degrades silently to em dashes with no toast or alert; a null or missing percentage reads an em dash with aria-label 'No uptime data'"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-list.test.tsx#renders a skeleton in every Uptime cell while loading"
        status: pass
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-uptimes.test.ts#degrades silently when the request fails"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#degrades silently to em dashes when the batch request fails"
        status: pass
    human_judgment: false
  - id: D3
    description: "Batch uptime refreshes in the background only on stack_status frames or container_state frames carrying a statusLog; no polling"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack-uptimes.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Phone width: the Uptime value appears as a labelled row in the DataTable card layout"
    requirement: "#24"
    verification:
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#renders Uptime as a labelled row in the phone card layout"
        status: pass
    human_judgment: false
  - id: D5
    description: "Health History card at the end of Settings > Stacks: Retention (days) field validated by the shared schema (message 'Enter a whole number from 1 to 365.' after blur or submit), Save Health Settings with the documented toasts, form re-seeded from the saved value"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/health-retention-card.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/settings/settings-page.test.tsx#renders the Health History card after the Template Repositories card"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#raising the window saves immediately without a dialog"
        status: pass
    human_judgment: false
  - id: D6
    description: "Lowering the retention opens an AlertDialog 'Shorten retention to N days?'; Keep and Escape send no request, Shorten retention sends PUT /api/settings/health; raising or keeping saves without a dialog (T-14-47)"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/health-retention-card.test.tsx#asks for confirmation before shortening, and Keep cancels without saving"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#shortening opens the dialog; Keep sends no request, Shorten retention saves"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#Escape closes the dialog without saving"
        status: pass
    human_judgment: false
  - id: D7
    description: "Retention card loading (Skeleton rows) and error (Alert 'Couldn't load health settings. Reload the page to try again.', no Save button) states"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/health-retention-card.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/uptime-retention.spec.ts#a failed load shows the alert instead of the form"
        status: pass
    human_judgment: false
  - id: D8
    description: "Existing specs that visit the Dashboard, Stacks page or Settings still pass through the new default stubs (no unstubbed-request error)"
    requirement: "#24"
    verification:
      - kind: e2e
        ref: "stacks, mobile, backups, setup-wizard, theme and uptime-retention specs (system Edge, 74 + 47 passed)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Visual and keyboard quality of the Health History card and the shorten dialog in light and dark theme at desktop and Pixel 7 width; validation message appears after blur rather than on the first keystroke"
    requirement: "#24"
    verification: []
    human_judgment: true
    rationale: "The plan's human-check was not performed by a person. Behaviour (Escape and Keep cancel, submit validation) is asserted by script; the on-blur timing, contrast and phone layout need eyes. Recorded in .planning/WINDOWS.md."

duration: 22min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 10: Stack list uptime column and retention setting Summary

**Every stack on the Dashboard and Stacks page now shows its uptime over the retention window as a toned badge from one batch request, and Settings > Stacks gains a Health History card whose retention window (1-365 days) asks for confirmation before shortening**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-08T13:31:22Z
- **Completed:** 2026-10-08T13:53:40Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 16 (7 created, 9 modified)

## Accomplishments
- Tracer: `getStackUptimes` -> `useStackUptimes` -> `UptimeBadge` -> StackList `Uptime` column on both list pages, verified end to end (unit set, typecheck, 47 Playwright cases) before the retention work began. Log: `Tracer verified end-to-end - expanding`.
- `useStackUptimes` degrades silently (empty map, `console.warn`, no error state), guards against stale responses with a latest-request counter, and refetches only on `stack_status` or statusLog-bearing `container_state` frames.
- `StackList` stays data-free: it renders the column only when handed an `uptimes` prop; `dashboard.tsx` (70 lines) and `stacks/index.tsx` (55 lines) remain composition-only.
- `HealthRetentionCard`: react-hook-form over the shared `healthSettingsSchema` (no client schema copy), `onTouched` validation, Skeleton loading, an Alert on load failure, `toast.promise` save with the documented copy, and form re-seeding from the saved value.
- Decreasing the window opens an AlertDialog with the UI-SPEC title and body; `Keep {old} days` and Escape send nothing, `Shorten retention` saves. Raising or keeping saves directly.
- `fixtures.ts` stubs both new endpoints so every existing spec stays green.

## Task Commits

1. **Task 1: Uptime column on the stack lists (tracer)** - `7bb1ac1` (feat)
2. **Task 2: Health History retention card** - `8ab3224` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written alongside each unit and landed in the same commit, because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `client/src/lib/uptime-api.ts`, `settings-api.ts` - batch uptime and health-settings clients
- `client/src/hooks/use-stack-uptimes.ts` - batch hook
- `client/src/components/domain/stack/uptime-badge.tsx`, `stack-list.tsx` - badge and the opt-in column
- `client/src/routes/app/dashboard.tsx`, `stacks/index.tsx` - call the hook and pass `uptimes`
- `client/src/routes/app/settings/components/health-retention-card.tsx`, `settings.tsx` - card and mount
- `client/test/integration/fixtures.ts`, `uptime-retention.spec.ts` - default stubs and 9 e2e cases
- Unit tests: `use-stack-uptimes`, `uptime-badge`, `stack-list` (extended), `health-retention-card`, `settings-page` (extended)

## Decisions Made
- See `key-decisions` above. The notable one: the confirm button is `secondary`, honouring UI-SPEC's rule that the accent belongs to Save and that no destructive-styled button exists in this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright browsers are not installed on this machine**
- **Found during:** Task 1 verify
- **Issue:** `PLAYWRIGHT_PORT=5186 yarn workspace @docktor/client test:integration ...` cannot launch Chromium (`%LOCALAPPDATA%\ms-playwright` does not exist); same as 14-03, 14-05 and 14-07.
- **Fix:** No browser was downloaded. Specs ran against the system Edge through a throwaway config kept in the session scratchpad, outside the repository (it imports the project's `playwright.config.ts` and adds `channel: "msedge"`). Nothing in the repo changed for this.
- **Verification:** uptime-retention (9), stacks, mobile, backups, setup-wizard and theme specs all passed (47 and 74 cases across two runs), no "Unstubbed API request(s)" error.
- **Follow-up:** run the canonical command once after `yarn playwright install chromium`.

**2. [Scope note] "passes on both Playwright projects"**
- The `mobile-chromium` project matches only `mobile.spec.ts`, so `uptime-retention.spec.ts` runs on `chromium`. The phone-width requirement is covered by a 412px-viewport case inside the spec (same adaptation as 14-07); all `mobile.spec.ts` cases still pass on `mobile-chromium`.

**3. [Scope note] Unrelated flake observed**
- One full-suite run failed `storage-stacks-table.test.tsx > sorts by name ascending...` under load; the file passes alone (13/13) and in the earlier full run (933 passed). It is outside this plan's files and was not touched.

---

**Total deviations:** 1 auto-fixed (blocking) plus 2 scope notes
**Impact on plan:** No scope change.

## Issues Encountered
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (tsc --build) is clean.
- Vite logs `http proxy error: /api/events` (ECONNREFUSED) during Playwright runs; the route is stubbed by `fixtures.ts` and the line is pre-existing dev-server noise.
- The plan's human visual check was not performed by a person; see Known Gaps.

## Known Stubs
None.

## Known Gaps
- Human check of the Health History card and shorten dialog in light and dark theme at desktop and Pixel 7 width (including that the validation message appears on blur rather than the first keystroke). Recorded as `unrun-verify` in `.planning/WINDOWS.md`.
- Canonical Playwright command not run on a machine with Playwright browsers installed (deviation 1).

## Threat Flags
None. T-14-47 is mitigated: the shared schema validates before submit, any decrease requires the AlertDialog, Escape and Keep send no request (unit and e2e tests assert no PUT). T-14-48 is mitigated: the batch refetch fires only on `stack_status` or statusLog-bearing `container_state` frames, never on a timer, and a failure leaves a silent empty map with no retry loop.

## Next Phase Readiness
- Phase 14 success criterion 3 (#24) is covered on the client: every stack shows an uptime percentage in the lists and the retention window is configurable.
- Open: install Playwright browsers and re-run the canonical e2e command; perform the human visual check.

## Self-Check: PASSED

- All created files exist on disk (3 source files, `uptime-retention.spec.ts`, 3 unit test files).
- Commits `7bb1ac1` and `8ab3224` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Acceptance criteria re-run: `useStackUptimes()` in dashboard.tsx 1 and stacks/index.tsx 1; `uptime/stacks` in fixtures.ts 1; data-fetching imports in stack-list.tsx 0; `any` in the hook and badge 0; dashboard.tsx 70 lines and stacks/index.tsx 55 lines; `<HealthRetentionCard` 1 and after `<TemplateReposCard`; `Shorten retention` 2; `Couldn't load health settings` 1; `healthSettingsSchema` 2; `settings/health` in fixtures.ts 2.
- Verification: client unit suite 101 files, 944 of 945 passed with the one unrelated load flake noted above (passes alone); Playwright (system Edge) 9 uptime-retention cases plus stacks, mobile, backups, setup-wizard and theme passed; `yarn typecheck` exit 0.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
