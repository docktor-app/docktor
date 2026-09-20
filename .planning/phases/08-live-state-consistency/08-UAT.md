---
status: resolved
phase: 08-live-state-consistency
source: [08-VERIFICATION.md]
started: 2026-09-14T08:52:59Z
updated: 2026-09-20T00:00:00Z
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
reported: "test 6 passed, however an internal server error comes up when saving. Clarification: it comes up when saving the YAML with the error, not when fixing it."
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
  root_cause: "The config_changed SSE event has no origin field, so client/src/hooks/use-stack.ts shows the \"changed externally\" toast for every config_changed event unconditionally, including the ones StackService itself publishes right after an app-initiated compose/env save. Compounding bug: updateStack's env-save branch never calls repo.updateEnvHash(), so the DB's envHash stays stale after an in-app env save — when chokidar's own change event for that same write later fires, the file watcher compares against the stale hash, sees a mismatch, and fires a second, genuinely-misclassified config_changed broadcast."
  artifacts:
    - path: "client/src/hooks/use-stack.ts"
      issue: "config_changed handler (~lines 77-81) shows the external-change toast unconditionally, with no origin check"
    - path: "client/src/hooks/use-container-events.ts"
      issue: "ConfigChangedEvent interface (lines 25-28) only carries {type, stackId} — no source/origin discriminator to check against"
    - path: "server/src/lib/state-broadcaster.ts"
      issue: "publish() (~line 73) broadcasts the same event shape regardless of caller origin"
    - path: "server/src/application/stack-service.ts"
      issue: "updateStack (lines 103-158): publishConfigChanged calls at line 122 (compose) and line 147 (env) don't tag origin as app-initiated; env branch (126-148) never calls repo.updateEnvHash(), unlike the compose branch's repo.updateStackHash"
    - path: "server/src/jobs/file-watcher.ts"
      issue: "handleFileChange (269-273) and handleEnvChange (305-324) publish the identical config_changed event type/shape as the app-initiated path, with no origin tag"
  missing:
    - "Add an origin discriminator to the config_changed event (e.g. source: \"app\" | \"external\") — StackService.publishConfigChanged sends source: \"app\"; FileWatcher's two publish call sites send source: \"external\""
    - "use-stack.ts's config_changed handler should only show the \"changed externally\" toast when event.source === \"external\"; an app-initiated event should just silently refresh state"
    - "Fix updateStack's env-save branch to call repo.updateEnvHash() (mirroring the compose branch's updateStackHash) so the file watcher's later reconcile of the same write is a no-op instead of a second misclassified broadcast"
  debug_session: ""

- gap_id: G-08-6
  truth: "A red indicator appears with no reload — a \"config error\" pill in the stack list and a red banner on the detail page carrying the parser's own message — and fixing the file clears both."
  status: failed
  reason: "User reported: test 6 passed, however an internal server error comes up when saving. Clarification: it comes up when saving the YAML with the error, not when fixing it."
  severity: blocker
  test: 6
  root_cause: "StackService.updateStack() calls createComposeConfig(input.composeContent) with no try/catch; the underlying parseComposeContent() throws a raw new Error(...) on any parse failure (invalid YAML), which is not an AppError subclass, so Fastify's global error handler falls through to its generic catch-all and returns an opaque 500 instead of a typed 400 with the parser's message."
  artifacts:
    - path: "server/src/application/stack-service.ts"
      issue: "updateStack (103-124): line 108 calls createComposeConfig(input.composeContent) unguarded right after fs.writeCompose at line 107 — no try/catch, no translation to a typed error; also never calls repo.clearConfigError(id) on a successful save, only setConfigChanged"
    - path: "server/src/domain/compose-config.ts"
      issue: "createComposeConfig (10-15) is a thin wrapper around parseComposeContent that propagates whatever it throws"
    - path: "server/src/lib/compose-parser.ts"
      issue: "parseComposeContent (49-60) throws plain new Error(...) (e.g. \"Compose file missing 'services' key\") instead of a typed BadRequestError from lib/errors.ts"
    - path: "server/src/app.ts"
      issue: "global error handler (92-119) only special-cases AppError and Zod errors; any other thrown value (including this raw Error) hits the catch-all at 118-119 and returns a generic 500"
  missing:
    - "Wrap createComposeConfig(input.composeContent) in updateStack() in a try/catch, converting any parse failure into a BadRequestError (400) carrying the parser's message — mirrors the existing pattern in upgradeServiceImage (stack-service.ts:454-460) via translateComposeEditError, and jobs/file-watcher.ts:234-251 which already catches this same exception type"
    - "On successful parse/save, updateStack() should also call repo.clearConfigError(id) so a valid save actually clears the red banner/pill"
  debug_session: ""

- gap_id: G-08-7
  truth: "A subjective human read; \"leave it as shipped\" is a valid answer."
  status: failed
  reason: "User reported: change it also to blue."
  severity: cosmetic
  test: 7
  root_cause: "In StackStatusBadge, both DEPLOYING and BACKING_UP get the animate-pulse treatment, but DEPLOYING is explicitly given blue background/text/border classes while BACKING_UP only gets animate-pulse with no color classes, so it falls back to the default outline (gray) variant."
  artifacts:
    - path: "client/src/components/domain/stack/stack-status-badge.tsx"
      issue: "Line 15: BACKING_UP variant config is \"outline\" (gray) vs DEPLOYING's \"default\" at line 8; line 29: BACKING_UP color map is just \"animate-pulse\" with no color classes vs DEPLOYING's \"bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse\" at line 25"
  missing:
    - "Change BACKING_UP's variant (line 15) from \"outline\" to \"default\", matching DEPLOYING"
    - "Change BACKING_UP's color class (line 29) from \"animate-pulse\" to \"bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse\", identical to DEPLOYING's, keeping the pulse animation. RESTORING and MIGRATING are out of scope — untouched."
  debug_session: ""

## Deferred Follow-Ups

- test: 8
  idea: "Make the Deploy button disabled during UPDATING/MIGRATING, like it is during an active deploy — promotes PD-4's deferred BLOCKED_STATES gap to a follow-up todo."
  deferred_at: 2026-09-19
