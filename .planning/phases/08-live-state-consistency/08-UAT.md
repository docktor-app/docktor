---
status: testing
phase: 08-live-state-consistency
source: [08-VERIFICATION.md]
started: 2026-09-14T08:52:59Z
updated: 2026-09-14T08:52:59Z
---

## Current Test

number: 1
name: V1 (closes 05.1-02 D6, first half) — open a stack's detail page in two browser tabs, press Deploy in tab A
expected: |
  Both tabs show the Deploying badge while the deploy runs, with no manual refresh anywhere in tab B, and both return to the running state when it finishes.
awaiting: user response

## Tests

### 1. V1 (closes 05.1-02 D6, first half) — open a stack's detail page in two browser tabs, press Deploy in tab A
expected: Both tabs show the Deploying badge while the deploy runs, with no manual refresh anywhere in tab B, and both return to the running state when it finishes.
result: [pending]

### 2. V2 (closes 05.1-02 D6, second half) — with both tabs open, save the compose text in tab A, then the env text
expected: The yellow "Configuration has changed since last deployment. Re-deploy to apply changes." banner appears in tab B without a reload, for both the compose save and the env save.
result: [pending]

### 3. V3 (closes 05.1-04 D7, first half) — clear the backup repo config, press Backup Now on a running stack
expected: An error toast that names the missing repository, the stack's status badge does not change, and the Backups tab gains no new row.
result: [pending]

### 4. V4 (closes 05.1-04 D7, second half; exercises plan 08-01's Task 1) — restore the backup repo config, run a backup
expected: The status badge moves to "Backing Up" and back to its previous status live with no page reload — and while it reads "Backing Up" the badge visibly pulses, fading in and out exactly the way "Deploying" does, while staying gray/outline rather than turning blue.
result: [pending]

### 5. V5 (closes 05.1-06 D9, first half) — edit a running stack's .env file directly on disk, outside the app
expected: Within the file watcher's detection window the config-changed indicator appears with no reload — both the yellow pill in the stack list and the yellow banner on the detail page.
result: [pending]

### 6. V6 (closes 05.1-06 D9, second half) — introduce a YAML syntax error into that stack's compose file on disk
expected: A red indicator appears with no reload — a "config error" pill in the stack list and a red banner on the detail page carrying the parser's own message — and fixing the file clears both.
result: [pending]

### 7. V7 — judgement call: does the pulsing gray "Backing Up" badge read as work-in-progress rather than stuck, and is gray (not blue like Deploying) the right distinction?
expected: A subjective human read; "leave it as shipped" is a valid answer.
result: [pending]

### 8. V8 — judgement call: did the Deploy button staying clickable during UPDATING/MIGRATING actually cause confusion during the V1-V6 passes?
expected: "No, leave it" closes the row; "yes" promotes PD-4's deferred BLOCKED_STATES gap to a follow-up todo.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
