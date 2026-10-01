---
phase: 11-ui-rework
plan: 07
subsystem: client-ui
tags: [react, react-hook-form, radix-dialog, shadcn, tailwind, playwright, vitest, proxy, backups]

# Dependency graph
requires:
  - phase: 11-ui-rework
    provides: "Section/SectionHeader/SectionTitle/SectionDescription/SectionActions primitive (11-01) and the Dialog-with-form shell precedent (service-upgrade-dialog.tsx, pre-existing) that both new dialogs in this plan compose"
provides:
  - "useStackProxy(stackId) hook (client/src/hooks/use-stack-proxy.ts) owning the Proxy tab's configs/deployed/certificates/loading/reload state"
  - "ProxyDomainsTable and ProxyAssignDialog/ProxyDialogTarget (client/src/routes/app/stacks/components/) — flat grouped-by-service table with per-row Edit/Remove actions, and the shared Assign/Edit dialog over the existing proxy upsert endpoint"
  - "BackupScheduleDialog/toBackupConfigPayload() and BackupConfigSummary/describeSchedule()/describeRetention() (client/src/routes/app/stacks/components/) — the backup schedule editor and its read-only summary, replacing BackupConfigCard"
  - "ProxyTab and BackupsTab now render no Card — both are flat Section/plain-div compositions (D-03 closed for these two tabs)"
affects: [11-08]

# Actuals (#2632)
actuals:
  tokens: 32000
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dialog-with-form shell (service-upgrade-dialog.tsx precedent) reused for two more forms: ProxyAssignDialog and BackupScheduleDialog both use controlled open/onOpenChange, toast.promise submit (loading/success/error), and ApiError.fields -> form.setError on failure"
    - "Assign/Edit share one dialog via a discriminated-union target prop ({mode:'assign'} | {mode:'edit'; config}) — domain and service are locked in edit mode, everything else pre-fills from the target config"
    - "React.useState/React.useEffect via namespace import in backup-schedule-dialog.tsx (not named imports) to keep the file's own local-state footprint minimal and grep-verifiable — the only true useState call is the submitting flag; all form fields live in react-hook-form"
key-files:
  created:
    - client/src/hooks/use-stack-proxy.ts
    - client/src/routes/app/stacks/components/proxy-assign-dialog.tsx
    - client/src/routes/app/stacks/components/proxy-domains-table.tsx
    - client/src/routes/app/stacks/components/backup-schedule-dialog.tsx
    - client/src/routes/app/stacks/components/backup-config-summary.tsx
    - client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx
    - client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx
    - client/test/unit/routes/stacks/backup-config-summary.test.tsx
  modified:
    - client/src/routes/app/stacks/components/proxy-tab.tsx
    - client/src/routes/app/stacks/components/backups-tab.tsx
    - client/test/unit/routes/proxy-tab.test.tsx
    - client/test/integration/proxy.spec.ts
    - client/test/integration/backups.spec.ts
key-decisions:
  - "Service selection in ProxyAssignDialog stays a plain useState (not a react-hook-form field) — mirrored verbatim from the pre-existing proxy-tab.tsx form, since assignDomainSchema itself has no serviceName field (the service is a URL path segment, not part of the validated body)"
  - "BackupScheduleFormValues is a dedicated form-values type (not stackBackupConfigSchema's own z.infer output) so retention can be a required nested object (retention.keepDaily/keepWeekly/keepMonthly as concrete FormField paths) instead of the schema's nullable/optional union — the standardSchemaResolver cast documents why this is safe, mirroring the existing AssignDomainInput cast pattern"
  - "toBackupConfigPayload() falls back preHook/postHook to null via a falsy check (`value || null`), not `.trim()`, matching BackupConfigCard's original handleSave exactly — no behavior change introduced while moving the logic"
patterns-established:
  - "Discriminated-union dialog target ({mode:'assign'}|{mode:'edit';config}) is the pattern for any future 'one dialog, two entry points' UI in this codebase"
requirements-completed: ["GH-15"]

coverage:
  - id: D1
    description: "Proxy tab's Assign Domain form moved into a dialog opened via an 'Assign Domain' button; submit reads 'Save Domain' (D-04)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/proxy-tab.test.tsx — 'renders the empty state...' / 'assigns a domain and reloads the list on success'"
        status: pass
      - kind: e2e
        ref: "client/test/integration/proxy.spec.ts — 'shows the empty state and assigns a new domain via the dialog'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each domain row has an Edit action opening the same dialog pre-filled, with domain and service locked, re-assigning through the existing upsert endpoint"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx — 'opens the edit flow pre-filled...' / 'calls assignDomain with the locked domain and service on an edit save'"
        status: pass
      - kind: e2e
        ref: "client/test/integration/proxy.spec.ts — 'edits an existing domain's internal port through the dialog'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Assign flow opens with an empty domain field; Edit flow never opens empty"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx — 'opens the assign flow with every field empty' / 'opens the edit flow pre-filled with the target config...'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Proxy dialog loading/error/partial: disabled submit + toast.promise loading, dialog stays open on failure, ApiError.fields map onto form fields, error copy exact"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx — 'keeps the dialog open, maps ApiError.fields onto the domain field, and returns the UI-SPEC error copy on failure'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Long domain names truncate in the list with a Tooltip revealing the full value; the dialog's own input scrolls natively"
    verification:
      - kind: other
        ref: "proxy-domains-table.tsx uses max-w-xs truncate + Tooltip/TooltipContent per row (no title attribute)"
        status: pass
    human_judgment: true
    rationale: "Native horizontal-scroll behavior of a plain text Input at long values was not screenshotted this session — a fair candidate for a human/UI-review pass."
  - id: D6
    description: "Remove-domain confirmation reads 'Remove domain {domain}?' / body copy / 'Remove domain' (destructive) / 'Cancel'"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/proxy-tab.test.tsx — 'opens a confirmation dialog with the UI-SPEC copy and only removes after confirming'"
        status: pass
      - kind: e2e
        ref: "client/test/integration/proxy.spec.ts — 'removes a domain after confirming the destructive dialog'"
        status: pass
    human_judgment: false
  - id: D7
    description: "Backups tab shows a read-only 'Backup Configuration' summary (schedule, retention, hooks, volume warnings) with 'Backup Now' and 'Edit Schedule'; editing happens only in a dialog with submit 'Save Schedule'"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-config-summary.test.tsx — 'renders the summary text, Backup Now, and Edit Schedule'"
        status: pass
      - kind: e2e
        ref: "client/test/integration/backups.spec.ts — 'shows the backup configuration summary and edits schedule/retention/hooks in a dialog'"
        status: pass
    human_judgment: false
  - id: D8
    description: "Backup dialog opens pre-filled from the stack's config, falling back to global retention then 7/4/12 — never a blank required field"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx — 'opens pre-filled from an override config' / 'falls back to global retention, then 7/4/12...'"
        status: pass
    human_judgment: false
  - id: D9
    description: "Backup dialog loading/error/partial: same Dialog-with-form behavior (disabled submit + toast.promise, ApiError.fields, exact error copy)"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx — 'keeps the dialog open and returns the UI-SPEC error copy on a failed save'"
        status: pass
    human_judgment: false
  - id: D10
    description: "Snapshot restore keeps its existing typed-name confirmation dialog unchanged"
    verification:
      - kind: e2e
        ref: "client/test/integration/backups.spec.ts — 'opens restore confirmation dialog with typed-name gate' (untouched file, re-verified passing)"
        status: pass
    human_judgment: false
  - id: D11
    description: "Backup config form uses react-hook-form with the shared stackBackupConfigSchema, replacing the eight ad-hoc useState fields"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c 'useForm'/'stackBackupConfigSchema' backup-schedule-dialog.tsx -> >=1 each; grep -c 'useState' -> 1 (submitting flag only)"
        status: pass
    human_judgment: false
  - id: D12
    description: "Proxy tab and the Backups-tab configuration surface render no Card; flat Section elements (not-deployed proxy state is an Alert)"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*)' proxy-tab.tsx | grep -c '<Card' -> 0; same for backup-config-summary.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D13
    description: "Per-row Edit/Remove icon buttons carry accessible names and are >=44px below md; retention inputs stack to one column below sm"
    verification:
      - kind: other
        ref: "proxy-domains-table.tsx: min-h-11 min-w-11 md:min-h-9 md:min-w-9 + aria-label per button; backup-schedule-dialog.tsx: grid grid-cols-1 gap-3 sm:grid-cols-3"
        status: pass
    human_judgment: false

duration: ~35min (task-visible span; three commits 00:20-00:38 plus prior context-loading/implementation time not separately timestamped)
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 07: Proxy & Backups Tabs — Assign/Edit and Schedule Dialogs Summary

**Moved the Proxy tab's always-visible Assign Domain form and the Backups tab's schedule/retention/hooks form into Dialogs (adding a new per-row Edit flow for proxy domains and converting the backup form to react-hook-form + the shared schema), flattening both tabs to Card-free Sections.**

## Performance
- **Duration:** ~35min
- **Tasks:** 2
- **Files modified:** 14 (8 created, 5 modified, 1 deleted)

## Accomplishments
- New `useStackProxy(stackId)` hook extracts the Proxy tab's load effect (configs/deployed/certificates/loading/reload) out of the component.
- New `ProxyDomainsTable`: the existing grouped-by-service table plus an accessible (44px, aria-labeled) Edit/Remove actions column, with a Tooltip revealing full domain values instead of the native `title` attribute.
- New `ProxyAssignDialog`/`ProxyDialogTarget`: Assign and Edit share one Dialog-with-form shell (service-upgrade-dialog.tsx pattern); Edit locks domain+service and pre-fills the rest; ApiError.fields map onto form fields on a failed save.
- Rewrote `ProxyTab` as a flat `Section` (no Card) composing the hook + table + dialog + the UI-SPEC remove-domain confirmation copy.
- New `BackupScheduleDialog`/`toBackupConfigPayload()`: schedule/retention/hooks editing moved onto react-hook-form + the shared `stackBackupConfigSchema`, replacing `BackupConfigCard`'s eight ad-hoc `useState` fields.
- New `BackupConfigSummary`/`describeSchedule()`/`describeRetention()`: a flat, read-only summary Section with inline "Backup Now" and "Edit Schedule", plus a Retry-capable error state for a failed config load (previously an endless "Loading...").
- `BackupsTab` now renders `BackupConfigSummary`; `backup-config-card.tsx` deleted.
- Adapted `proxy-tab.test.tsx` and `proxy.spec.ts`/`backups.spec.ts` to the new dialog-based flows; added three new unit test files for the two new dialogs and the backup summary.

## Task Commits
1. **Task 1: Proxy domains — flat list with Assign/Edit in a dialog and the UI-SPEC remove confirmation** - `dd0ed9a` (feat)
2. **Task 2: Backups tab — read-only configuration summary with an Edit Schedule dialog on react-hook-form** - `6900b13` (feat)
3. **Fixup: dialog test-timeout bump (Rule 1 — flaky test)** - `a9de6f9` (fix)

**Plan metadata:** this SUMMARY.md, committed separately.

## Files Created/Modified
- `client/src/hooks/use-stack-proxy.ts` - `useStackProxy()` hook (new)
- `client/src/routes/app/stacks/components/proxy-assign-dialog.tsx` - `ProxyAssignDialog`/`ProxyDialogTarget` (new)
- `client/src/routes/app/stacks/components/proxy-domains-table.tsx` - `ProxyDomainsTable` (new)
- `client/src/routes/app/stacks/components/proxy-tab.tsx` - rewritten as a flat Section composing the above
- `client/src/routes/app/stacks/components/backup-schedule-dialog.tsx` - `BackupScheduleDialog`/`toBackupConfigPayload()` (new)
- `client/src/routes/app/stacks/components/backup-config-summary.tsx` - `BackupConfigSummary`/`describeSchedule()`/`describeRetention()` (new, replaces `backup-config-card.tsx`)
- `client/src/routes/app/stacks/components/backups-tab.tsx` - renders `BackupConfigSummary`
- `client/test/unit/routes/proxy-tab.test.tsx`, `client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx`, `client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx`, `client/test/unit/routes/stacks/backup-config-summary.test.tsx` - unit coverage
- `client/test/integration/proxy.spec.ts`, `client/test/integration/backups.spec.ts` - updated/added E2E coverage

## Decisions Made
See `key-decisions` in the frontmatter: the plain-`useState` service selector in `ProxyAssignDialog` (mirrors the pre-existing form, `serviceName` isn't part of `assignDomainSchema`), the dedicated `BackupScheduleFormValues` type (keeps `retention.keepDaily`-style FormField paths concrete rather than nullable), and the falsy-check (not `.trim()`) hook-to-null mapping in `toBackupConfigPayload()` to preserve `BackupConfigCard`'s exact prior behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Flaky test] Bumped test timeouts on three new Dialog+Form-heavy suites**
- **Found during:** Full `yarn workspace @docktor/client test` run after both tasks were committed
- **Issue:** `proxy-assign-dialog.test.tsx` timed out at the vitest default 5000ms under full-parallel-suite CPU contention — the same documented flake class already noted in `proxy-tab.test.tsx`/`service-upgrade-dialog.test.tsx` (see STATE.md, 05.1-01-SUMMARY.md). All 5 tests in that file pass reliably in isolation (verified: 7s total).
- **Fix:** Added `vi.setConfig({testTimeout: 15000})` to `proxy-assign-dialog.test.tsx`, and preventatively to `backup-schedule-dialog.test.tsx`/`backup-config-summary.test.tsx` (same Dialog/Form/userEvent shape).
- **Files modified:** `client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx`, `client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx`, `client/test/unit/routes/stacks/backup-config-summary.test.tsx`
- **Verification:** All four affected files re-run together, 44/44 passing.
- **Commit:** `a9de6f9`

**Total deviations:** 1 auto-fixed (flaky test). **Impact:** none on production code; test-only timing fix.

### Out of scope (not fixed)

The same full-suite run also showed `test/unit/components/common/theme-toggle.test.tsx` (plan 11-03's file, not touched by this plan) failing 2/4 tests with the identical `Test timed out in 5000ms` symptom. Re-run in isolation: 4/4 pass in 3.9s. This is the same pre-existing, environment-driven full-suite resource-contention class as the fix above, but the file is out of this plan's declared scope (`files_modified` does not include it) — left untouched per the scope-boundary rule, not logged to `deferred-items.md` since it is already a documented, project-wide known flake class (STATE.md) rather than a new discovery.

## Issues Encountered

None beyond the flaky-test deviation above — no auth gates, no architectural questions, no blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 11-08 (backup-history.tsx and the backup detail page) was not touched by this plan, per the plan's own explicit scope boundary. `BackupConfigSummary`'s `onSaved` re-load and `BackupHistory`/`SnapshotsSection` composition in `backups-tab.tsx` are unchanged from before this plan, so 11-08 can proceed independently. Ready for 11-08.

## Self-Check: PASSED

All 8 created source/test files confirmed present on disk, `backup-config-card.tsx` confirmed removed, and all 3 task/fixup commit hashes (`dd0ed9a`, `6900b13`, `a9de6f9`) confirmed present in `git log`.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*
