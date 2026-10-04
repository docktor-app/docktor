---
status: complete
phase: 12-compose-safety-and-templates
source: [12-VERIFICATION.md]
started: 2026-10-03T19:48:51.885Z
updated: 2026-10-04T12:55:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Merged diff + warning dialog visual layout (D-03)
expected: Dialog shows the unified diff with the `privileged` finding anchored as a red badge directly under the diff line that introduced it, legible in both light and dark mode; "Keep Editing" preserves the edit, "Confirm & Apply" writes it.
result: issue
reported: "pass. However, leave some space between the findings or seperate them. Currently, this looks squashy. Also the text directly next to the check name is not that good. maybe wrap them in a card or structure them as a table."
severity: cosmetic

### 2. Template grid browse/search UX (D-07)
expected: Open `/stacks/create/templates`, search by name, filter by category. Card grid updates live as the user types/filters; empty search/filter state reads clearly; "Use Template" on a single-variant template goes straight to the prefilled create form, a multi-variant template opens the picker dialog.
result: skipped
reason: "Deferred follow-up: pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc."

### 3. Real host-level, non-Docker port conflict (D-13 last-resort tier)
expected: The pre-deploy warnings banner reports the port as already in use by the host-level process (name + PID, or "unknown process" fallback) and the deploy proceeds either way (never blocked).
result: issue
reported: "No banner appeared, when deploying I'll only get an error since the port is already in use."
severity: blocker

### 3. Real host-level, non-Docker port conflict (D-13 last-resort tier)
expected: Bind a host port with a process outside Docker (e.g. a local `nc -l` or another non-containerized service), then deploy a Docktor stack whose compose file requests that same port. The pre-deploy warnings banner reports the port as already in use by that process (name + PID) when `ss`/`lsof` can resolve it, or falls back to an "unknown process" holder when it can't — and the deploy proceeds either way (never blocked).
result: [pending]

## Summary

total: 3
passed: 0
issues: 2
pending: 0
skipped: 1
blocked: 0

## Deferred Follow-Ups

- test: 2
  idea: "pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc."
  deferred_at: 2026-10-04

## Gaps

- gap_id: G-12-1
  truth: "Dialog shows the unified diff with the `privileged` finding anchored as a red badge directly under the diff line that introduced it, legible in both light and dark mode; \"Keep Editing\" preserves the edit, \"Confirm & Apply\" writes it."
  status: failed
  reason: "User reported: pass. However, leave some space between the findings or seperate them. Currently, this looks squashy. Also the text directly next to the check name is not that good. maybe wrap them in a card or structure them as a table."
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []

- gap_id: G-12-2
  truth: "The pre-deploy warnings banner reports the port as already in use by the host-level process (name + PID, or \"unknown process\" fallback) and the deploy proceeds either way (never blocked)."
  status: failed
  reason: "User reported: No banner appeared, when deploying I'll only get an error since the port is already in use."
  severity: blocker
  test: 3
  artifacts: []
  missing: []
