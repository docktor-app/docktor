---
phase: 10-backend-architecture-refactor
plan: 13
subsystem: backend-architecture
tags: [event-bus, domain-events, pub-sub, audit-trail, stack-event, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "10-11's subscriber-module convention (bus + narrow DI dependency in, disposer out) and 10-12's precedent for composing a persisted value (not a passthrough) from a domain event; the two existing subscribers (state-broadcast-subscriber.ts, notification-subscriber.ts) this plan's third subscriber and the register.ts wiring build alongside"
provides:
  - "server/src/application/subscribers/stack-event-subscriber.ts — subscribeStackEvents(bus, repo), writing StackEvent audit rows for stack.config_changed (external-origin only, PD-9) and stack.config_error, reproducing FileWatcher's prior payload strings byte-for-byte"
  - "server/src/application/subscribers/register.ts — registerDomainSubscribers(bus, deps), the one place all three D-15 subscriber categories are registered, in a fixed documented order (audit trail, notifications, live-state bridge)"
  - "FileWatcher's three createStackEvent call sites removed entirely; the two hash-changing emit sites now carry previousHash/changedFile audit fields on the domain event itself instead"
  - "Architecture fitness rule: exactly one write path to the StackEvent table (the audit subscriber), enforced by two layering.test.ts checks rather than left to reviewer discipline"
affects: [10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 10465
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Audit-log subscriber pattern (D-15 item 2): subscribeStackEvents() mirrors the notification-composition subscriber's shape (bus + narrow DI dependency in, disposer out) but composes an exact, byte-identical JSON payload string rather than a message template — key order is load-bearing here since the persisted value is a string column, not a JSON column, so the test asserts the literal string rather than a parsed object"
    - "registerDomainSubscribers(): the composition root's single ordered-registration entrypoint, replacing the two separate inline subscribe calls plans 10-11/10-12 left in application/index.ts — the fixed order is documented in-file (why audit-first, not just that it's first)"

key-files:
  created:
    - server/src/application/subscribers/stack-event-subscriber.ts
    - server/src/application/subscribers/register.ts
    - server/test/unit/application/stack-event-subscriber.test.ts
    - server/test/unit/application/subscriber-registration.test.ts
  modified:
    - server/src/domain/events.ts
    - server/src/jobs/file-watcher.ts
    - server/src/application/index.ts
    - server/test/unit/jobs/file-watcher.test.ts
    - server/test/unit/architecture/layering.test.ts

key-decisions:
  - "Task 3's fitness-rule text ('the audit repository's write member is reached from exactly one file under server/src/, and that file is the audit subscriber') is operationalized as TWO checks instead of one literal import-line match, because Task 1's own mechanically-verified acceptance criterion requires the subscriber to NOT import repositories/ at all (DI-only, grep-checked at 0) — a literal 'the subscriber imports the module' reading is unsatisfiable alongside that constraint. Check 1: no file other than the D-09 barrel (repositories/index.ts) imports stack-event-repository.js directly. Check 2: no file other than the subscriber calls .createEvent( on it. Both were verified locally to fail-and-name-the-offending-path when a second import/call site was introduced (jobs/index.ts and jobs/backup-scheduler.ts respectively), then reverted before committing, per the plan's own instruction."
  - "The .createEvent( call-site check skips comment-only lines (a leading // after trim) — an early draft without this exemption false-failed on a comment mentioning .createEvent(, which would have violated this file's own established comment/string immunity principle that every other rule in layering.test.ts follows."
  - "previousHash/changedFile were added directly on StackConfigChangedEvent as two more optional fields (not a nested object), matching the existing style of every other optional field in the event catalog — this keeps state-broadcast-subscriber.ts's no-spread assertion (grep -cE '\\.\\.\\.' -> 0) meaningful: a field added here cannot silently leak onto the SSE wire shape without a compile error at the bridge."

patterns-established:
  - "Subscriber test convention for byte-identical persisted-string composition: stack-event-subscriber.test.ts asserts the exact literal JSON string as a hardcoded string literal (not JSON.stringify(...) re-derivation, not a parsed-object comparison), per the plan's own instruction that deriving the test's expectation from the same composition the implementation uses would prove nothing"

requirements-completed: ["D-04", "D-15", "D-16", "D-17"]

coverage:
  - id: D1
    description: "Audit fields (previousHash, changedFile) added to StackConfigChangedEvent; subscribeStackEvents() writes a StackEvent row keyed off PD-9's origin check, reproducing FileWatcher's compose/env/error call sites' payload strings byte-for-byte"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-event-subscriber.test.ts (7 tests: compose payload exact-match, env payload exact-match with the 3rd 'source: env' key in order, app-origin event writes nothing, config_error passthrough, rejecting write doesn't propagate + logs once naming the event, isolation from a second subscriber on the same event, disposer teardown)"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/|infrastructure/|repositories/|jobs/|generated/)' server/src/domain/events.ts -> 0; grep -cE '\\.\\.\\.' server/src/application/subscribers/state-broadcast-subscriber.ts -> 0 (unchanged, re-verified after the new fields); grep -cE '^\\s*import .*repositories/' server/src/application/subscribers/stack-event-subscriber.ts -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "FileWatcher's three createStackEvent call sites removed; the watcher no longer imports or reaches the StackEvent repository at all, directly or via a lazy import"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/file-watcher.test.ts (41 tests, incl. new audit-field emit assertions at both hash-changing sites — previousHash + changedFile: \"compose\"|\"env\"; every pre-existing stored-hash-update, config-error set/clear, and sync-ordering assertion carried over unedited)"
        status: pass
      - kind: other
        ref: "grep -cE 'createStackEvent' server/src/jobs/file-watcher.ts -> 0; grep -cE 'stack-event-repository' server/src/jobs/file-watcher.ts -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "All three D-15 subscriber categories are registered from one place (register.ts) in a fixed, documented order — audit trail before notifications before the live-state bridge"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/application/subscriber-registration.test.ts (3 tests: audit subscription for stack.config_changed registered before the bridge's subscription for the same event; audit registered before the first notification subscription; disposer removes every underlying subscription)"
        status: pass
      - kind: other
        ref: "grep -n 'registerDomainSubscribers\\|disposeDomainSubscribers' server/src/application/index.ts -> exactly one call site, one exported disposer"
        status: pass
    human_judgment: false
  - id: D4
    description: "Exactly one write path to the StackEvent table exists, enforced as an architecture fitness test rather than left to reviewer discipline"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts (2 new checks: no file other than the D-09 barrel imports stack-event-repository.js directly; no file other than the audit subscriber calls .createEvent( on it) — both locally verified to fail-and-name-the-offending-path when a second writer was introduced (jobs/index.ts, jobs/backup-scheduler.ts), then reverted before committing (git diff clean after revert, confirmed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A failing audit write cannot abort the detecting job (FileWatcher) or suppress another subscriber for the same event (D-17)"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-event-subscriber.test.ts: 'does not let a rejecting createEvent() propagate out of emit, and logs the rejection once naming the event'; 'does not let a rejecting createEvent() from one subscriber prevent a second subscriber for the same event from running'"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full server unit suite and typecheck stay green after every task"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 58 files, 999 passed + 2 todo; yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false
  - id: D7
    description: "After an external edit to a stack's compose file made while the stack's detail page is open, the event log section shows the new entry without a manual refresh, with the same rendered label/detail as an entry written before this phase — the observable symptom of the PD-11 ordering window this plan deliberately accepts"
    verification: []
    human_judgment: true
    rationale: "Deferred by the plan's own <verification><human-check> to the phase gate in plan 10-15, matching 10-11's and 10-12's precedent for the analogous SSE/notification human-checks. No automated end-to-end live-browser test exists in this repo for this observable symptom."

# Metrics
duration: ~50min
completed: 2026-09-24
status: complete
---

# Phase 10 Plan 13: StackEvent Audit Trail onto the Domain-Event Bus Summary

**FileWatcher's three inline `StackEvent` audit-row writes move onto the domain-event bus via a new `stack-event-subscriber.ts`, closing D-15's third and final side-effect category, with a new architecture fitness test that fails a future second writer to the audit table by name.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-24T00:00:00Z (session-relative; no precise start timestamp was captured)
- **Tasks:** 3
- **Files created:** 4
- **Files modified:** 5

## Accomplishments

- `server/src/domain/events.ts` gains two optional audit-only fields on `StackConfigChangedEvent` — `previousHash` and `changedFile: "compose" | "env"` — populated only by FileWatcher's two external call sites; the in-app producer (`StackService`) has neither, by design.
- `server/src/application/subscribers/stack-event-subscriber.ts` — `subscribeStackEvents(bus, repo)`, writing exactly the two audit types the codebase has ever produced (`config_changed`, `config_error`; PD-10 records that `update_available` has no producer and gets none here), keyed off the event's own origin discriminator so an in-app configuration change still writes nothing (PD-9). The composed payload strings are byte-identical to the ones the three inline call sites produced, verified against literal strings copied from the current call sites, not re-derived.
- `server/src/jobs/file-watcher.ts`'s three `createStackEvent` call sites are gone, along with the plumbing that supported them (`FileWatcherEventRepo` interface, the factory's second argument, the lazy `stack-event-repository` import). The watcher now only emits; the audit subscriber is the sole writer.
- `server/src/application/subscribers/register.ts` — `registerDomainSubscribers(bus, deps)`, the single place this phase's subscription order is decided: audit trail first (PD-11 — the write must start before the live-state frame that triggers a client's refetch is published), notifications second, the live-state bridge last. `application/index.ts` now has exactly one subscription call site and one exported disposer, replacing 10-11's and 10-12's two separate inline calls.
- `server/test/unit/architecture/layering.test.ts` gains two checks enforcing that the `StackEvent` table has exactly one write path — both verified locally to fail and name the offending file when a second import/call site was deliberately introduced, then reverted before committing.
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (58 files, 999 passed + 2 todo, up from the pre-plan 992/2-todo baseline by 7 net new tests) both exit zero after every task.

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit fields on the configuration-changed event, and the audit subscriber** - `2decce1` (test)
2. **Task 2: The file watcher stops writing audit rows and only emits** - `dfa4a21` (feat)
3. **Task 3: One ordered registration for all three subscribers, and the fitness rule that keeps the audit table single-writer** - `aaa58de` (feat)

Task 1 carried `tdd="true"` — the `stack-event-subscriber.ts` module and its test were written together and the RED state (module/exports not yet existing) was implicit in creating both files in the same commit, matching this phase's established single-commit-per-TDD-task precedent from plans 10-01/10-03/10-11/10-12 (`workflow.tdd_mode` is not enabled for this project). RED evidence: the test file was run against a scratch stub-free tree before `stack-event-subscriber.ts`'s implementation existed and failed with module-not-found, then passed once the implementation was written.

## Files Created/Modified

- `server/src/domain/events.ts` - Adds `previousHash?: string` and `changedFile?: "compose" | "env"` to `StackConfigChangedEvent`; updates the file's own doc comment (the "one category NOT here yet" note is removed — this plan closes it)
- `server/src/application/subscribers/stack-event-subscriber.ts` - New: `subscribeStackEvents()`, the 2-event (`stack.config_changed`, `stack.config_error`) audit-write subscriber
- `server/test/unit/application/stack-event-subscriber.test.ts` - New: 7 test cases covering every `<behavior>` requirement in Task 1
- `server/src/application/subscribers/register.ts` - New: `registerDomainSubscribers()`, the ordered composition of all three D-15 subscriber categories
- `server/test/unit/application/subscriber-registration.test.ts` - New: 3 test cases asserting registration order and disposer teardown
- `server/src/jobs/file-watcher.ts` - Removes `createStackEvent` from `FileWatcherRepo`, deletes `FileWatcherEventRepo` and the factory's second parameter, deletes the lazy `stack-event-repository` import and the `StackEventType` import; the three `createStackEvent` call sites are gone, replaced by `previousHash`/`changedFile` fields on the emits that already followed them
- `server/test/unit/jobs/file-watcher.test.ts` - Removes the `createStackEvent`-forwarding tests from the `createFileWatcherRepo` describe block (member no longer exists); every remaining `mockRepo.createStackEvent` reference removed or replaced with a `mockBus.emit` assertion on the new audit fields
- `server/src/application/index.ts` - Replaces the two separate inline `subscribeStateBroadcast`/`subscribeNotifications` calls with one `registerDomainSubscribers(domainEventBus, {...})` call, exporting `disposeDomainSubscribers` in place of the two prior disposer exports
- `server/test/unit/architecture/layering.test.ts` - Adds a new describe block ("the StackEvent audit table has exactly one write path") with two checks: no non-barrel file imports `stack-event-repository.js`; no non-subscriber file calls `.createEvent(` on it

## Decisions Made

### Before/after per migrated site (plan's `<verification>` requirement)

**1. Compose file changed (`FileWatcher.handleFileChange`)** — before:
```ts
await repo.clearConfigError(stack.id)
await repo.updateStackHash({stackId: stack.id, hash: newHash})
await repo.createStackEvent({
    stackId: stack.id,
    type: "config_changed",
    payload: JSON.stringify({oldHash, newHash}),
})
this.bus.emit("stack.config_changed", {stackId: stack.id, newHash, source: "external"})
```
— after:
```ts
await repo.clearConfigError(stack.id)
await repo.updateStackHash({stackId: stack.id, hash: newHash})
this.bus.emit("stack.config_changed", {
    stackId: stack.id, newHash, source: "external",
    previousHash: oldHash, changedFile: "compose",
})
```
The audit subscriber, on receiving this event, composes `JSON.stringify({oldHash: previousHash, newHash})` — byte-identical to the removed inline call, verified in `stack-event-subscriber.test.ts` against the literal string `'{"oldHash":"abc123","newHash":"def456"}'`.

**2. Env file changed (`FileWatcher.handleEnvChange`)** — before:
```ts
await repo.updateEnvHash({stackId: stack.id, hash: newHash})
await repo.createStackEvent({
    stackId: stack.id,
    type: "config_changed",
    payload: JSON.stringify({oldHash, newHash, source: "env"}),
})
this.bus.emit("stack.config_changed", {stackId: stack.id, newHash, source: "external"})
```
— after:
```ts
await repo.updateEnvHash({stackId: stack.id, hash: newHash})
this.bus.emit("stack.config_changed", {
    stackId: stack.id, newHash, source: "external",
    previousHash: oldHash, changedFile: "env",
})
```
The subscriber composes `JSON.stringify({oldHash: previousHash, newHash, source: "env"})` for this case (the `changedFile === "env"` branch) — verified against the literal string `'{"oldHash":"old-env-hash","newHash":"new-env-hash","source":"env"}'`, with the third key in the same position the removed call site added it.

**3. Config parse error (`FileWatcher.handleFileChange`'s catch block)** — before:
```ts
await repo.setConfigError(stack.id, err.message)
await repo.createStackEvent({stackId: stack.id, type: "config_error", message: err.message})
this.bus.emit("stack.config_error", {stackId: stack.id, message: err.message})
```
— after:
```ts
await repo.setConfigError(stack.id, err.message)
this.bus.emit("stack.config_error", {stackId: stack.id, message: err.message})
```
No new fields needed — `stack.config_error`'s existing `message` field is already everything the subscriber's row needs. The subscriber writes `{stackId, type: "config_error", message}` unchanged.

### PD-10 finding (plan's `<verification>` requirement)

The `StackEventType` enum has three values (`config_changed`, `config_error`, `update_available`). `git grep -n "createStackEvent" server/src` (run before Task 2's edits) returned only the file watcher's three sites above — `update_available` was never written anywhere in the codebase. The audit subscriber therefore subscribes to two events, not three; adding a write for `update_available` would be new behaviour introduced by this plan, not a migration of existing behaviour, and this plan's boundary (freezing observable behaviour) forbids that. Recorded here as the plan's own text requires, not silently dropped.

### PD-11 ordering consequence, stated explicitly (plan's `<verification>` requirement)

All three sites above used to `await repo.createStackEvent(...)` before the corresponding `this.bus.emit(...)` call that (via the pre-10-11-era `StateBroadcaster`, now the 10-11 bridge subscriber) triggers the client's live-state frame — meaning a client refetching the stack's event list on that frame always saw the new row, because the row had already committed by the time the frame was published. After this plan, the write is issued by `stack-event-subscriber.ts`, a bus subscriber the emit call does not await (`EventBusPort.emit` never awaits a handler, D-16) — so the live-state frame can now reach the browser before the row commits. Task 3's registration order (audit subscriber registered before the live-state bridge) makes the write *start* before the bridge's subscription runs, which is the strongest ordering guarantee the bus contract allows; it does not guarantee the write has *committed* by the time the frame is published. This residual window is the subject of the plan's `<human-check>`, deferred to the phase gate in plan 10-15 per the plan's own text.

### Fitness-rule interpretation (my own decision, documented above in `key-decisions`)

Task 3's prose ("reached from exactly one file... that file is the audit subscriber... match on a line-anchored import") could not be implemented as a single literal import-line check without contradicting Task 1's own mechanically-verified constraint that the subscriber never imports `repositories/`. I implemented it as two complementary checks (import-of-module and call-site-of-`.createEvent(`) that jointly enforce the single-writer invariant the rule exists to protect, and verified both fail-and-name-the-path locally before committing, per the plan's own instruction to do so.

## Deviations from Plan

None (Rule-triggered) — the fitness-rule interpretation above is a clarification of ambiguous plan prose reconciled against another part of the same plan's own mechanically-verified acceptance criteria, not a deviation from either. No Rule 1/2/3/4 auto-fixes were needed; no bugs, missing functionality, or blocking issues were found outside what the plan itself already anticipated (PD-9/PD-10/PD-11).

## Issues Encountered

**Comment false-positive on the `.createEvent(` call-site fitness check:** the first draft of the new layering-test call-site check matched any line containing `.createEvent(`, including comment lines. Verifying it (per the plan's own instruction to add-and-revert a violation) with a `//`-prefixed mention immediately false-failed the test — caught before committing, and the check was tightened to skip comment-only lines, consistent with every other rule in `layering.test.ts` explicitly guarding against comment/string false positives.

**No precise start timestamp:** the executor's `record_start_time` step was not run at session start, so the `duration`/`completed` metrics above are a post-hoc estimate rather than a measured wall-clock interval. Does not affect correctness of the shipped code or tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-15 is now fully closed: all three side-effect categories (notifications, plan 10-12; status/config broadcasts, plan 10-11; the StackEvent audit trail, this plan) are on the domain-event bus, each with its own subscriber, all registered from one ordered place (`register.ts`).
- Plan 10-14 (per `10-12-SUMMARY.md`'s own "Next Phase Readiness") can now target `jobs/update-checker.ts`'s dead `triggerUpdate()` method — the last documented exception to "every `.publish(` call site in `application/`/`jobs/` is the sanctioned bridge."
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (58 files, 999 passed + 2 todo) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 6 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with every prior plan's precedent in this phase.
- The plan's own `<verification><human-check>` (confirming a live browser sees the new event-log entry without a manual refresh after an external compose edit, and that its rendered label/detail matches a pre-phase entry) is deferred to the phase gate in plan 10-15, per the plan's own text — not performed in this session. Recorded as coverage item D7 (`human_judgment: true`) above so it surfaces at verify-work rather than being silently assumed proven.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-24*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`server/src/application/subscribers/stack-event-subscriber.ts`,
`server/test/unit/application/stack-event-subscriber.test.ts`, `server/src/application/subscribers/register.ts`,
`server/test/unit/application/subscriber-registration.test.ts`, `server/src/domain/events.ts`,
`server/src/jobs/file-watcher.ts`, `server/test/unit/jobs/file-watcher.test.ts`, `server/src/application/index.ts`,
`server/test/unit/architecture/layering.test.ts`, and this SUMMARY.md).
All 3 task commits (`2decce1`, `dfa4a21`, `aaa58de`) confirmed present in `git log`.
`git rev-list --count 349d63c..HEAD` = 3 (before this SUMMARY commit), matching the 3 task commits with no
docs-only or uncommitted changes at self-check time.
