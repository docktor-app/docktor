---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 09
subsystem: ui
tags: [react, data-table, forms, dialogs, touch-targets, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "20-02 DataTable, 20-03 TOUCH_TARGET, 20-04 FormStack/FormActions"
provides:
  - "Certificates and notification log rendered through DataTable in the shared frame"
  - "Certificate delete button with a 44px touch target below md"
  - "Certificate upload form and five dialog forms on FormStack/FormActions"
  - "notification-log-card unit test (new)"
affects: [20-10, 20-11]

commits: 6
plan_head_before: ba233623dc948a0c1dbb99d335703e6158334502
plan_head_after: b5a9df2b63aff6a0bddc40ead3ab1d2493e24569

actuals:
  tokens: 16600
  tasks: 3
  commits: 6

key-files:
  created:
    - client/test/unit/routes/settings/notification-log-card.test.tsx
  modified:
    - client/src/routes/app/settings/components/certificates-card.tsx
    - client/src/routes/app/settings/components/notification-log-card.tsx
    - client/src/routes/app/stacks/components/backup-schedule-dialog.tsx
    - client/src/routes/app/stacks/components/proxy-assign-dialog.tsx
    - client/src/routes/app/account/components/enroll-dialog.tsx
    - client/src/routes/app/account/components/disable-two-factor-dialog.tsx
    - client/src/routes/app/account/components/regenerate-codes-dialog.tsx
    - client/test/unit/routes/settings/certificates-card.test.tsx
    - client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx

key-decisions:
  - "Certificate file fields use FormItem + plain Label (no FormField), so the FormStack descendant rule gives them the shared 8px label gap and getByLabelText keeps working through htmlFor"
  - "Certificate columns are built inside the component (the delete column needs setDeleteTarget); notification columns are a module-level constant"
  - "Dialog forms drop their spacing class and wrap fields in FormStack; the in-form DialogFooter becomes FormActions variant=dialog with identical buttons and FOOTER_BUTTON_CLASS"

requirements-completed: [UI-08, A11Y-01, UI-05, UI-03]
---

# Phase 20 Plan 09: Settings tables and dialog forms Summary

**Certificates and the notification log render in the shared DataTable frame (mono domain pattern, ToneBadge expiry and email pills, 44px delete), and the certificate upload form plus five dialog forms follow the shared FormStack/FormActions rhythm.**

## Accomplishments

- Tracer: CertificatesCard -> DataTable -> TableFrame with a mono `font-mono text-xs` domain cell, `ToneBadge tone="yellow"` "Expiring soon", and a hidden-header Actions column holding the delete button with `TOUCH_TARGET` (`size-9 max-md:size-11`). Delete still only opens the AlertDialog; empty copy is now heading plus description. Load-error Alert with Retry and loading skeletons are unchanged (DataTable's own loading branch is not used for the card-level loading state).
- Certificate upload form: `<form>` keeps only its divider classes; FormStack holds the domain pattern field, three `FormItem` + `Label` + `Input` file fields, the upload-error Alert and `FormActions` with the submit button. The 4px `space-y-1` wrappers are gone.
- Notification log: DataTable with Type (isKey), Stack, Message (`max-w-xs truncate`), Email (`ToneBadge` green "Sent" / neutral "UI only") and Time, no pagination, UI-SPEC empty copy, loading handled by DataTable.
- Dialogs (backup schedule, proxy assign, enroll x2, disable two-factor, regenerate codes): fields in FormStack, in-form footer replaced by `FormActions variant="dialog"`. Footers outside a form (enroll codes step, regenerate done step) untouched. `DialogFooter` import dropped where no footer remains.
- `client/src/components/ui/` unchanged since 7cc2dec; no Settings card was migrated to react-hook-form.

## Task Commits

1. `2e48bb5` test(20-09) certificates in the shared table with ToneBadge pill and 44px delete (RED)
2. `4520e07` feat(20-09) certificates in the shared table with a 44px delete
3. `55033b8` test(20-09) upload form layout and notification log table with pills (RED)
4. `dd751a5` feat(20-09) certificate upload on form primitives, notification log on DataTable
5. `026a6ea` test(20-09) dialog form actions layout in the backup schedule dialog (RED)
6. `b5a9df2` feat(20-09) dialog forms use FormStack and FormActions variant dialog

## Deviations from Plan

None - plan executed as written. Two notes:

- Task 3 RED evidence: the implementation had already been edited in the working tree when the test was written, so RED was demonstrated by temporarily restoring the original `backup-schedule-dialog.tsx` (new test failed, 10 others passed), then re-applying the implementation before committing.
- Visual consequence: the backup-schedule dialog's switch rows use `FormItem className="flex items-center gap-3 space-y-0"`; inside FormStack the descendant `gap-2` rule now wins over `gap-3`, so the switch-to-label gap shrinks from 12px to 8px. Acceptable under the shared 8px rule; flagged for the visual backstop.

## Verification

- Targeted vitest: certificates-card, notification-log-card, settings-page, backup-schedule-dialog, proxy-assign-dialog, proxy-tab, proxy-domains-table and all of `test/unit/routes/account` pass. Two enroll-dialog QR/copy tests hit the 5s default timeout once under parallel load and pass in isolation (21/21), the same documented host-contention flake class as other dialog suites.
- Acceptance greps all match the plan (DataTable 1, no `ui/table` or `ui/badge` imports in migrated cards, `tone="yellow"` 1, no amber classes, `variant="dialog"` counts 1/1/1/1/2, no `space-y-4` forms).

## Deferred Verifications (CI, per project resource constraint)

- `yarn typecheck` / `tsc --build`, full `yarn test:unit`.
- Playwright `chromium` (`proxy.spec.ts`, `backups.spec.ts`, `two-factor.spec.ts`) and `mobile-chromium` (`mobile.spec.ts` dialogs fit the viewport, `two-factor.spec.ts`).
- Visual backstop: certificates and notification log in light/dark at 1280px and as cards at 375px; dialogs keep stacked full-width buttons on phones.

## Known Stubs

None.

## Threat Flags

None. Layout-only changes; File objects still go straight to `uploadCertificate`, the "never renders certificate body" test remains green, and delete still requires the confirmation dialog.

## Self-Check: PASSED

All six commits are ancestors of HEAD and all files listed under key-files exist.
