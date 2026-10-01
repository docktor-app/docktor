---
status: testing
phase: 11-ui-rework
source: [11-VERIFICATION.md]
started: "2026-09-30T15:53:17Z"
updated: "2026-10-01T10:30:00Z"
---

## Current Test

number: 2
name: Theme menu shows the current selection (re-test of G-11-1)
expected: |
  Click the sun/moon theme toggle in the page header. The dropdown lists
  Light, Dark and System, and a check mark appears next to the active one
  (System on a fresh profile). Choosing another option moves the check to it
  and the theme changes immediately, in both desktop and 390px widths.
awaiting: user response

## Tests

### 1. 390px light/dark-mode walkthrough across the reworked UI
expected: At 390px width, in both light and dark mode, walk dashboard -> stack detail (all five tabs, both dialogs: Assign Domain and Edit Schedule) -> backup detail -> settings. Nothing is cut off or illegible in either theme; the filed follow-up issue (GitHub #71 — four sub-44px touch targets) matches what is actually visible, with no additional un-filed breakage.
result: issue
reported: "pass, however, the dropdown for the theme has no check to show the current selected."
severity: minor

### 2. Theme menu shows the current selection (re-test of G-11-1)
expected: Click the theme toggle; a check mark sits next to the active option (Light/Dark/System). Choosing another option moves the check and changes the theme immediately.
result: [pending]

## Summary

total: 2
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-11-1
  truth: "Theme dropdown shows which option (Light/Dark/System) is currently selected"
  status: resolved
  resolved_by: quick fix (theme-toggle.tsx DropdownMenuCheckboxItem)
  resolved_at: 2026-10-01
  reason: "User reported: pass, however, the dropdown for the theme has no check to show the current selected."
  severity: minor
  test: 1
  root_cause: "ThemeToggle renders plain DropdownMenuItem entries and only destructures setTheme from useTheme(); it never reads the active `theme`, so no item can indicate selection."
  artifacts:
    - path: "client/src/components/common/theme-toggle.tsx"
      issue: "Menu items are not selection-aware (no theme value read, no checked state)"
    - path: "client/test/unit/components/common/theme-toggle.test.tsx"
      issue: "Asserts role=menuitem; no coverage of the selected state"
  missing:
    - "Read `theme` from useTheme() and render items as DropdownMenuCheckboxItem (check indicator) or RadioGroup/RadioItem (dot indicator in current shadcn primitive) bound to it"
    - "Update tests to cover the checked state for Light/Dark/System, including default 'system'"
  debug_session: ""
