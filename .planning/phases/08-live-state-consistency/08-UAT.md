---
status: complete
phase: 08-live-state-consistency
source: [08-VERIFICATION.md]
started: 2026-09-14T08:52:59Z
updated: 2026-09-19T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. V1 (closes 05.1-02 D6, first half) — open a stack's detail page in two browser tabs, press Deploy in tab A
expected: Both tabs show the Deploying badge while the deploy runs, with no manual refresh anywhere in tab B, and both return to the running state when it finishes.
result: pass

### 2. V2 (closes 05.1-02 D6, second half) — with both tabs open, save the compose text in tab A, then the env text
expected: The yellow "Configuration has changed since last deployment. Re-deploy to apply changes." banner appears in tab B without a reload, for both the compose save and the env save.
result: issue
reported: "pass. However, when saving, the toast comes up: \"Configuration file changed externally\" although changed in the app."
severity: major

### 3. V3 (closes 05.1-04 D7, first half) — clear the backup repo config, press Backup Now on a running stack
expected: An error toast that names the missing repository, the stack's status badge does not change, and the Backups tab gains no new row.
result: pass

### 4. V4 (closes 05.1-04 D7, second half; exercises plan 08-01's Task 1) — restore the backup repo config, run a backup
expected: The status badge moves to "Backing Up" and back to its previous status live with no page reload — and while it reads "Backing Up" the badge visibly pulses, fading in and out exactly the way "Deploying" does, while staying gray/outline rather than turning blue.
result: pass

### 5. V5 (closes 05.1-06 D9, first half) — edit a running stack's .env file directly on disk, outside the app
expected: Within the file watcher's detection window the config-changed indicator appears with no reload — both the yellow pill in the stack list and the yellow banner on the detail page.
result: pass

### 6. V6 (closes 05.1-06 D9, second half) — introduce a YAML syntax error into that stack's compose file on disk
expected: A red indicator appears with no reload — a "config error" pill in the stack list and a red banner on the detail page carrying the parser's own message — and fixing the file clears both.
result: issue
reported: "test 6 passed, however an internal server error comes up when saving."
severity: blocker

### 7. V7 — judgement call: does the pulsing gray "Backing Up" badge read as work-in-progress rather than stuck, and is gray (not blue like Deploying) the right distinction?
expected: A subjective human read; "leave it as shipped" is a valid answer.
result: issue
reported: "change it also to blue."
severity: cosmetic

### 8. V8 — judgement call: did the Deploy button staying clickable during UPDATING/MIGRATING actually cause confusion during the V1-V6 passes?
expected: "No, leave it" closes the row; "yes" promotes PD-4's deferred BLOCKED_STATES gap to a follow-up todo.
result: skipped
reason: "Deferred follow-up: i think it is better to also make it disabled like during the deploy action."

## Summary

total: 8
passed: 4
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-08-2
  truth: "The yellow \"Configuration has changed since last deployment. Re-deploy to apply changes.\" banner appears in tab B without a reload, for both the compose save and the env save."
  status: failed
  reason: "User reported: pass. However, when saving, the toast comes up: \"Configuration file changed externally\" although changed in the app."
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-08-6
  truth: "A red indicator appears with no reload — a \"config error\" pill in the stack list and a red banner on the detail page carrying the parser's own message — and fixing the file clears both."
  status: failed
  reason: "User reported: test 6 passed, however an internal server error comes up when saving."
  severity: blocker
  test: 6
  artifacts: []
  missing: []

- gap_id: G-08-7
  truth: "A subjective human read; \"leave it as shipped\" is a valid answer."
  status: failed
  reason: "User reported: change it also to blue."
  severity: cosmetic
  test: 7
  artifacts: []
  missing: []

## Deferred Follow-Ups

- test: 8
  idea: "Make the Deploy button disabled during UPDATING/MIGRATING, like it is during an active deploy — promotes PD-4's deferred BLOCKED_STATES gap to a follow-up todo."
  deferred_at: 2026-09-19
