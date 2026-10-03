---
status: testing
phase: 12-compose-safety-and-templates
source: [12-VERIFICATION.md]
started: 2026-10-03T19:48:51.885Z
updated: 2026-10-03T19:48:51.885Z
---

## Current Test

number: 1
name: Merged diff + warning dialog visual layout (D-03)
expected: |
  Open an existing stack, edit its compose file to introduce a compose-check finding
  (e.g. add `privileged: true`) alongside an unrelated line change, save, and inspect
  the resulting dialog. The dialog shows the GitHub-style unified diff AND the
  `privileged` finding rendered as a red badge anchored directly under the diff line
  that introduced it. Layout is legible in both light and dark mode. "Keep Editing"
  returns to the editor with the edit intact; "Confirm & Apply" writes it.
awaiting: user response

## Tests

### 1. Merged diff + warning dialog visual layout (D-03)
expected: Dialog shows the unified diff with the `privileged` finding anchored as a red badge directly under the diff line that introduced it, legible in both light and dark mode; "Keep Editing" preserves the edit, "Confirm & Apply" writes it.
result: [pending]

### 2. Template grid browse/search UX (D-07)
expected: Open `/stacks/create/templates`, search by name, filter by category. Card grid updates live as the user types/filters; empty search/filter state reads clearly; "Use Template" on a single-variant template goes straight to the prefilled create form, a multi-variant template opens the picker dialog.
result: [pending]

### 3. Real host-level, non-Docker port conflict (D-13 last-resort tier)
expected: Bind a host port with a process outside Docker (e.g. a local `nc -l` or another non-containerized service), then deploy a Docktor stack whose compose file requests that same port. The pre-deploy warnings banner reports the port as already in use by that process (name + PID) when `ss`/`lsof` can resolve it, or falls back to an "unknown process" holder when it can't — and the deploy proceeds either way (never blocked).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
