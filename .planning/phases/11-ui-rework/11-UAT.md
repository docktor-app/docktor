---
status: diagnosed
phase: 11-ui-rework
source: [11-VERIFICATION.md]
started: "2026-09-30T15:53:17Z"
updated: "2026-10-01T00:00:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. 390px light/dark-mode walkthrough across the reworked UI
expected: At 390px width, in both light and dark mode, walk dashboard -> stack detail (all five tabs, both dialogs: Assign Domain and Edit Schedule) -> backup detail -> settings. Nothing is cut off or illegible in either theme; the filed follow-up issue (GitHub #71 — four sub-44px touch targets) matches what is actually visible, with no additional un-filed breakage.
result: issue
reported: "pass, however, the dropdown for the theme has no check to show the current selected."
severity: minor

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-11-1
  truth: "Theme dropdown shows which option (Light/Dark/System) is currently selected"
  status: failed
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
