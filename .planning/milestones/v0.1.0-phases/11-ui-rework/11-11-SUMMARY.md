---
phase: 11-ui-rework
plan: 11
subsystem: client-ui
tags: [react, settings-page, component-extraction, tone-badge, refactor]
requires:
  - phase: 11-ui-rework
    provides: "11-02's ToneBadge/Tone contract (client/src/components/common/tone-badge.tsx) this plan's NotificationTypeBadge builds on; 06-05's routes/app/settings/components/ directory and ProxySettingsCard/CertificatesCard file-shape precedent"
provides:
  - "TimezoneCombobox (client/src/routes/app/settings/components/timezone-combobox.tsx) — moved verbatim, props renamed TimezoneComboboxProps with Readonly<>"
  - "GeneralSettingsCard (client/src/routes/app/settings/components/general-settings-card.tsx) — owns the General form's state, load effect and handleSaveGeneral's ApiError field-mapping, extracted out of SettingsPage"
  - "SmtpCard, NotificationTriggersCard, NotificationLogCard, BackupRepositoryCard, BackupDefaultsCard — one file each in routes/app/settings/components/, moved verbatim from settings.tsx"
  - "NotificationTypeBadge / describeNotificationType(type) (client/src/components/domain/notification/notification-type-badge.tsx) — D-08 tone mapping (red/yellow/orange, neutral fallback) replacing the deleted getTypeBadgeClass/formatType helper pair"
  - "settings.tsx reduced from 1125 to 72 lines — composition-only orchestrator resolving the active tab and rendering nine section components, closing CLAUDE.md's settings.tsx Known Refactoring Target"
  - "TabsList wrapped in an overflow-x-auto container (D-17) so the tab row scrolls horizontally on narrow screens instead of widening the page"
affects: [11-13]
actuals:
  tokens: 16232
  tasks: 2
  commits: 4
plan_head_before: 9557f2a7e1f8d298d65a001e877b9729d0caf470
plan_head_after: 1b5cb22b017ea6b0336f49d82885797edb2c3cb5
tech-stack:
  added: []
  patterns:
    - "One-component-per-file extraction from a monolithic route file (matching 06-05's ProxySettingsCard/CertificatesCard precedent and 11-01/11-04's prior Known-Refactoring-Target closures) — verbatim moves preserve behaviour, only prop-typing/Readonly<> tightened in place per CLAUDE.md TypeScript standards"
    - "describeNotificationType(type) returns {label, tone} consumed by both the domain NotificationTypeBadge component and (indirectly, via the badge) any future caller that needs the same D-08 tone mapping without importing a component"
key-files:
  created:
    - client/src/routes/app/settings/components/timezone-combobox.tsx
    - client/src/routes/app/settings/components/general-settings-card.tsx
    - client/src/routes/app/settings/components/smtp-card.tsx
    - client/src/routes/app/settings/components/notification-triggers-card.tsx
    - client/src/routes/app/settings/components/notification-log-card.tsx
    - client/src/routes/app/settings/components/backup-repository-card.tsx
    - client/src/routes/app/settings/components/backup-defaults-card.tsx
    - client/src/components/domain/notification/notification-type-badge.tsx
    - client/test/unit/components/domain/notification/notification-type-badge.test.tsx
    - client/test/unit/routes/settings/settings-page.test.tsx
  modified:
    - client/src/routes/app/settings.tsx
key-decisions:
  - "describeNotificationType() genuinely followed RED-GREEN TDD (new pure-function behaviour: a failing test importing the not-yet-created module, then the minimal implementation). The five moved cards (SmtpCard, NotificationTriggersCard, NotificationLogCard, GeneralSettingsCard, BackupRepositoryCard, BackupDefaultsCard, TimezoneCombobox) are verbatim behaviour-preserving moves with no new behaviour to describe as a failing assertion first — tdd.md's own principle ('if you can describe the behavior as expect(fn).toBe(output) before writing fn') does not apply to a pure relocation, so these were done as refactor commits with the settings-page smoke test added afterward as the regression net, per the plan's own action ordering (move code, then add tests as step 4)."
  - "settings-page.test.tsx wraps every render in SidebarProvider and stubs window.matchMedia (PageHeader's SidebarTrigger requires SidebarProvider context) and globalThis.ResizeObserver (ProxySettingsCard's Switch, via @radix-ui/react-use-size, needs one to measure the thumb) — both established patterns copied from stack-detail-page.test.tsx and proxy-tab.test.tsx rather than invented fresh."
patterns-established:
  - "settings/components/ now holds nine section files (proxy-settings-card, certificates-card, timezone-combobox, general-settings-card, smtp-card, notification-triggers-card, notification-log-card, backup-repository-card, backup-defaults-card) — any new Settings section should follow this same one-file-per-card shape."
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan closes CLAUDE.md's Known Refactoring Target for routes/app/settings.tsx (11-CONTEXT.md: 'this phase should close all three'), applies the phase's clean-component-architecture goal (SRP, one section per file) to Settings, and brings the notification-type pill onto the D-08 single badge scheme."
coverage:
  - id: D1
    description: "describeNotificationType(type) maps stack_error/stack_unhealthy/disk_warning to {label, tone} and falls back to {label: type, tone: neutral} for unknown types"
    requirement: "D-08 single tone-badge scheme; GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/notification/notification-type-badge.test.tsx#describeNotificationType"
        status: pass
    human_judgment: false
  - id: D2
    description: "NotificationTypeBadge renders the mapped label with the correct ToneBadge data-tone attribute"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/notification/notification-type-badge.test.tsx#NotificationTypeBadge"
        status: pass
    human_judgment: false
  - id: D3
    description: "settings.tsx is a ≤80-line composition-only orchestrator with no inline components/helpers; every Settings section lives in its own file under routes/app/settings/components/"
    requirement: "GH-15 (CLAUDE.md Known Refactoring Target)"
    verification:
      - kind: unit
        ref: "wc -l client/src/routes/app/settings.tsx (72) and grep -cE '^(function|const [A-Za-z]+ = \\()' (0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each Settings tab (General/Notifications/Backup/Proxy) renders its expected headings/fields with behaviour unchanged, including the 400 ApiError -> instance-name field mapping and the unknown-tab-falls-back-to-General case"
    requirement: "GH-15 behaviour-preservation"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/settings-page.test.tsx (7 tests)"
        status: pass
      - kind: integration
        ref: "client/test/integration/backups.spec.ts — 3 Settings Backup-tab tests, unmodified"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Settings tab list scrolls horizontally inside its own container on narrow screens instead of widening the page"
    requirement: "D-17 baseline"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/settings-page.test.tsx#scrolls the tab list horizontally instead of widening the page on narrow screens"
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-09-29
status: complete
---

# Phase 11 Plan 11: Settings Page Decomposition Summary

**Split the 1125-line settings.tsx monolith into nine one-component-per-file Settings cards plus a 72-line orchestrator, and moved the notification-type pill onto the D-08 ToneBadge scheme.**

## Performance
- **Duration:** 55min
- **Started:** 2026-09-29T23:20:00Z
- **Completed:** 2026-09-29T00:15:00Z
- **Tasks:** 2
- **Files modified:** 11 (1 modified, 10 created)

## Accomplishments
- Closed CLAUDE.md's `routes/app/settings.tsx` Known Refactoring Target — the last of the three targets 11-CONTEXT.md asked this phase to close (after `[id].tsx` in 11-01 and `dashboard.tsx` in 11-04).
- Extracted seven Settings section components (`TimezoneCombobox`, `GeneralSettingsCard`, `SmtpCard`, `NotificationTriggersCard`, `NotificationLogCard`, `BackupRepositoryCard`, `BackupDefaultsCard`) into their own files under `routes/app/settings/components/`, alongside the existing `ProxySettingsCard`/`CertificatesCard`.
- Added `NotificationTypeBadge`/`describeNotificationType()` on the shared `ToneBadge` scheme (D-08), deleting the hand-rolled `getTypeBadgeClass`/`formatType` helper pair.
- Reduced `settings.tsx` from 1125 lines to 72 — it now only resolves the active tab, renders the `Page` shell, and composes the four `TabsContent` sections.
- Wrapped the `TabsList` in an `overflow-x-auto` container (D-17) so the tab row scrolls horizontally on narrow screens instead of widening the page.
- Added a 7-test `settings-page.test.tsx` smoke suite (General/Notifications/Backup/Proxy tabs, unknown-tab fallback, 400 ApiError field mapping, horizontal-scroll container) as the behaviour-preservation net; the existing `backups.spec.ts` Settings Backup-tab E2E tests pass unmodified.

## Task Commits
1. **Task 1: Extract the Notifications tab sections and the notification-type badge**
   - `cd3787e` (test) — RED: failing spec for `describeNotificationType`/`NotificationTypeBadge`
   - `675dcdb` (feat) — GREEN: `NotificationTypeBadge` on the shared `ToneBadge` scheme
   - `e852da1` (refactor) — extract `SmtpCard`/`NotificationTriggersCard`/`NotificationLogCard`, wire `NotificationLogCard` onto the new badge, add the first `settings-page.test.tsx` smoke test
2. **Task 2: Extract General, Timezone and Backup sections and reduce settings.tsx to a ≤80-line orchestrator**
   - `1b5cb22` (refactor) — extract `TimezoneCombobox`/`GeneralSettingsCard`/`BackupRepositoryCard`/`BackupDefaultsCard`, reduce `settings.tsx` to 72 lines, extend `settings-page.test.tsx`
**Plan metadata:** committed alongside this SUMMARY (see final commit hash in STATE.md session record)

## Files Created/Modified
- `client/src/components/domain/notification/notification-type-badge.tsx` — `describeNotificationType(type)` and `NotificationTypeBadge({type})`, D-08 tone mapping
- `client/src/routes/app/settings/components/timezone-combobox.tsx` — `TimezoneCombobox`, moved verbatim with `Readonly<>` props
- `client/src/routes/app/settings/components/general-settings-card.tsx` — `GeneralSettingsCard`, owns the General form's state/load/save logic
- `client/src/routes/app/settings/components/smtp-card.tsx` — `SmtpCard`, moved verbatim
- `client/src/routes/app/settings/components/notification-triggers-card.tsx` — `NotificationTriggersCard`, moved verbatim
- `client/src/routes/app/settings/components/notification-log-card.tsx` — `NotificationLogCard`, now renders `NotificationTypeBadge` instead of the deleted class/label helpers
- `client/src/routes/app/settings/components/backup-repository-card.tsx` — `BackupRepositoryCard`, moved verbatim
- `client/src/routes/app/settings/components/backup-defaults-card.tsx` — `BackupDefaultsCard`, moved verbatim
- `client/src/routes/app/settings.tsx` — reduced to a 72-line composition-only orchestrator
- `client/test/unit/components/domain/notification/notification-type-badge.test.tsx` — 6 tests covering the tone-mapping function and the badge component
- `client/test/unit/routes/settings/settings-page.test.tsx` — 7 tests covering all four tabs, unknown-tab fallback, 400-error field mapping, horizontal tab scroll

## Decisions Made
See `key-decisions` in frontmatter: (1) genuine RED-GREEN TDD applied only to the new `describeNotificationType`/`NotificationTypeBadge` behaviour, with the verbatim card moves treated as behaviour-preserving refactors backed by a smoke-test regression net (per the plan's own step ordering); (2) `settings-page.test.tsx` reuses the `SidebarProvider`/`matchMedia`/`ResizeObserver` test-scaffolding patterns already established by `stack-detail-page.test.tsx` and `proxy-tab.test.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] settings-page.test.tsx required SidebarProvider, matchMedia and ResizeObserver stubs to render**
- **Found during:** Task 1, writing the first settings-page.test.tsx smoke test
- **Issue:** `SettingsPage` renders `PageHeader` (which renders `SidebarTrigger`, requiring `SidebarProvider` context) and, on the Proxy tab, `ProxySettingsCard`'s Radix `Switch` (which needs `ResizeObserver`, absent in jsdom); `SidebarProvider`'s mobile-detection hook also needs `window.matchMedia`, absent in jsdom.
- **Fix:** Wrapped every render in `<SidebarProvider>` and added the same `matchMedia`/`ResizeObserver` stubs already used by `stack-detail-page.test.tsx` and `proxy-tab.test.tsx` — no source-code changes, test-infrastructure only.
- **Files modified:** `client/test/unit/routes/settings/settings-page.test.tsx`
- **Commit:** `e852da1` (SidebarProvider/matchMedia), `1b5cb22` (ResizeObserver, Proxy-tab test)

**Total deviations:** 1 auto-fixed (Rule 3, test-infrastructure only — no production code affected).
**Impact:** None on shipped behaviour; the fix only enabled the new tests to render the existing component tree correctly.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Remaining Ad-Hoc Form State (for 11-13)

None of the extracted cards use `react-hook-form` — per the plan's own prohibition, this was a behaviour-preserving move only, not a form-library migration. The following extracted files carry ad-hoc (`useState`-per-field) form state that 11-13 should note in its CLAUDE.md update as a residual Known Refactoring Target:

- `general-settings-card.tsx` — `instanceName`/`baseUrl`/`timezone` each their own `useState`, manual `errors` record, manual `ApiError.message` substring-matching to pick which field to blame
- `smtp-card.tsx` — nine separate `useState` fields, manual `smtpErrors` record keyed by field name
- `notification-triggers-card.tsx` — five separate `useState` fields plus manual optimistic-update/rollback logic per toggle
- `backup-repository-card.tsx` — ten separate `useState` fields, no field-level validation errors surfaced (relies on `toast.promise`'s generic "Failed to save")
- `backup-defaults-card.tsx` — four separate `useState` fields, no field-level validation

`ProxySettingsCard` and `CertificatesCard` (both pre-existing, not touched by this plan) already use `react-hook-form` and are the target pattern for a future migration.

## Next Phase Readiness

Wave 3 complete — ready for 11-12 (Wave 4, structured .env editor).

---
*Phase: 11-ui-rework*
*Completed: 2026-09-29*

## Self-Check: PASSED

All 12 created/modified files verified present on disk; all 4 task commits (`cd3787e`, `675dcdb`, `e852da1`, `1b5cb22`) verified present in `git log --oneline --all`.
