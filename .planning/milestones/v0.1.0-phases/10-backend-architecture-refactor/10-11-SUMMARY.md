---
phase: 10-backend-architecture-refactor
plan: 11
subsystem: backend-architecture
tags: [event-bus, domain-events, pub-sub, sse, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "10-03's EventBusPort/InMemoryEventBus/domainEventBus and the DomainEventMap catalog; 10-10's completed route-layering wave the composition root builds on"
provides:
  - "server/src/application/subscribers/state-broadcast-subscriber.ts — the bridge subscriber, subscribeStateBroadcast(bus, broadcaster), translating every domain event into its live-state SSE equivalent field-for-field"
  - "StackService and BackupService take EventBusPort instead of the live-state broadcaster; both status choke points (transitionStatus, publishConfigChanged, writeStackStatus) emit domain events after their DB writes"
  - "state-poller.ts, file-watcher.ts, proxy-cert-poller.ts, and update-checker.ts's reachable checkImage() path emit domain events instead of publishing to the broadcaster directly"
  - "The live-state broadcaster is now an ordinary bus subscriber (D-15 item 3) fed by exactly one bridge, with zero change to the server-sent-events wire contract (D-18)"
affects: [10-12, 10-13, 10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 18546
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bridge subscriber pattern: one function (subscribeStateBroadcast) owns every domain-event -> live-state-event translation, with an explicit per-field mapping (no spread, no cast) so a future domain-event field addition is a compile error at the bridge, not a silent passthrough to the wire"
    - "Publisher-side non-throwing guard kept alongside bus-level subscriber isolation (belt-and-suspenders, not redundant): every migrated wrapper (transitionStatus, publishConfigChanged, writeStackStatus) still wraps its emit in try/catch even though EventBusPort's own contract says emit never throws"

key-files:
  created:
    - server/src/application/subscribers/state-broadcast-subscriber.ts
    - server/test/unit/application/state-broadcast-subscriber.test.ts
  modified:
    - server/src/application/index.ts
    - server/src/application/stack-service.ts
    - server/src/application/backup-service.ts
    - server/src/jobs/state-poller.ts
    - server/src/jobs/file-watcher.ts
    - server/src/jobs/update-checker.ts
    - server/src/jobs/proxy-cert-poller.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/unit/application/backup-service.test.ts
    - server/test/unit/jobs/file-watcher.test.ts
    - server/test/unit/jobs/proxy-cert-poller.test.ts
    - server/test/unit/jobs/update-checker.test.ts

key-decisions:
  - "update-checker.ts's UpdateChecker keeps both a `bus` field (for the reachable checkImage() emit) and a `broadcaster` field (solely for the dead triggerUpdate() method, unreachable in production, removed wholesale by plan 10-14) — a single-field migration would have broken the dead method's own StateEvent-shaped publish call, which the plan explicitly says to leave untouched"
  - "Domain events emitted for stack.status_changed carry only {stackId, status} — never previousStatus or message, even though the domain-event payload type allows both as optional — because the pre-existing live stack_status broadcast never included either field, and D-18 freezes exact field parity, not the domain event's full potential shape"
  - "The bridge subscriber's field-for-field container_state mapping builds the optional statusLog member via an if-branch assignment rather than a conditional spread, since the subscriber file's own acceptance criterion (grep -cE '\\.\\.\\.' -> 0) forbids spread anywhere in that file; the job files (state-poller.ts etc.) carry no such restriction and keep their original conditional-spread construction unchanged"

patterns-established:
  - "subscribeStateBroadcast()'s mapping-table doc comment: every subscriber that bridges one event system onto another documents the full key->key mapping as an in-file comment table, not just in prose, so a future reader diffs two type files against one comment instead of the implementation"

requirements-completed: ["D-04", "D-15", "D-17", "D-18"]

coverage:
  - id: D1
    description: "The bridge subscriber translates all 7 domain events into their live-state SSE equivalents, field-for-field, with a disposer and synchronous same-turn dispatch (D-18)"
    requirement: "D-18"
    verification:
      - kind: unit
        ref: "server/test/unit/application/state-broadcast-subscriber.test.ts (12 cases: one deep-equality case per domain event plus statusLog-present/absent, message-present/absent, disposer teardown, broadcaster-throws isolation, same-turn ordering)"
        status: pass
      - kind: other
        ref: "grep -cE 'await|async' server/src/application/subscribers/state-broadcast-subscriber.ts -> 0; grep -cE '\\.\\.\\.' -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "StackService and BackupService's three status/config-changed wrappers (transitionStatus, publishConfigChanged, writeStackStatus) emit domain events after their DB write resolves, keep their try/catch, and no longer import the broadcaster"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts (70 tests, incl. new 'resolves the repository write before emitting stack.status_changed' ordering test); server/test/unit/application/backup-service.test.ts (96 tests, incl. new 'resolves the stack repository write before emitting stack.status_changed' ordering test)"
        status: pass
      - kind: other
        ref: "grep -cE 'broadcaster' server/src/application/stack-service.ts -> 0; grep -cE '^\\s*import .*state-broadcaster' server/src/application/{stack,backup}-service.ts -> 0 for both"
        status: pass
    human_judgment: false
  - id: D3
    description: "The four job publishers (state-poller, file-watcher, proxy-cert-poller, update-checker's reachable path) emit domain events instead of publishing to the broadcaster directly; the file-watcher's external-origin discriminator and the state-poller's optional statusLog stay hardcoded/conditional exactly as before"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/file-watcher.test.ts (44 tests), server/test/unit/jobs/proxy-cert-poller.test.ts (24 tests), server/test/unit/jobs/update-checker.test.ts (40 tests), server/test/unit/jobs/state-poller.test.ts (8 tests + 2 todo, unchanged — no broadcaster assertions existed there)"
        status: pass
      - kind: other
        ref: "grep -cE 'broadcaster\\.publish' server/src/jobs/{state-poller,file-watcher,proxy-cert-poller}.ts -> 0 for each; grep -cE 'broadcaster\\.publish' server/src/jobs/update-checker.ts -> 2 (matches the two calls inside the dead triggerUpdate() method)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full server unit suite and typecheck stay green after every task, and the server-sent-events endpoint / integration tests are provably untouched by this plan's diff"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 55 files, 962 passed + 2 todo; yarn typecheck -> 0 errors"
        status: pass
      - kind: other
        ref: "git diff --stat HEAD~3 -- server/test/integration/ server/src/routes/events.ts server/src/lib/state-broadcaster.ts server/src/domain/events.ts -> empty (no output)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No automated integration test exercises the server-sent-events stream end-to-end; a human must connect a browser to GET /api/events and confirm a deploy/stop/external-compose-edit/backup each produce the same event sequence as before this plan"
    verification: []
    human_judgment: true
    rationale: "10-RESEARCH.md confirmed no integration file references the SSE endpoint. The plan's own <verification> block defers this human-check to the phase gate in plan 10-15 rather than requiring it per-plan — recorded here so verify-work does not silently auto-pass an unverified end-to-end claim."

# Metrics
duration: ~1h10m
completed: 2026-09-24
status: complete
---

# Phase 10 Plan 11: Domain-Event Bus Migration — Status/Configuration Broadcasts Summary

**Every status and configuration broadcast in the server (StackService's two choke points, BackupService's one, and four job publishers) now flows through the domain-event bus via a single translating bridge subscriber, with the live-state broadcaster reduced to an ordinary bus subscriber and zero change to what a connected browser receives over `GET /api/events`.**

## Performance

- **Duration:** ~1h10m
- **Started:** 2026-09-24T03:20:00Z (approx, first file read after worktree fast-forward)
- **Completed:** 2026-09-24T04:33:05Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 12

## Accomplishments
- `server/src/application/subscribers/state-broadcast-subscriber.ts` — `subscribeStateBroadcast(bus, broadcaster)`, the bridge that translates each of the 7 `DomainEventMap` events into its exact live-state `StateEvent` equivalent, synchronously (no `await`/`async` anywhere in the file, verified by grep), with every field mapped explicitly (no spread, no cast, verified by grep) and each publish call wrapped in try/catch. Registered at module load in `application/index.ts` (`disposeStateBroadcastSubscription`), wired to `domainEventBus` and `stateEventBroadcaster`.
- `StackService.transitionStatus()` and `.publishConfigChanged()`, and `BackupService.writeStackStatus()` — the three single choke points for every status transition and config-changed broadcast in the server — now call `this.bus.emit(...)` instead of `this.broadcaster.publish(...)`, strictly after their DB write resolves, with their non-throwing try/catch kept verbatim (defence-in-depth alongside the bus's own per-subscriber isolation, per D-17). Both services' constructors take `Pick<EventBusPort, "emit">` and no longer import `lib/state-broadcaster.js`.
- `state-poller.ts`, `file-watcher.ts`, and `proxy-cert-poller.ts` — every publisher migrated onto the bus: the state poller's two `container_state` emit sites (its optional `statusLog` construction unchanged) and its `reconcile()` `stack_status` emit; the file watcher's three emit sites (`config_changed` app/external-origin discriminators still hardcoded literals at each call site, `config_error`); the cert poller's single `proxy_cert_status` emit.
- `update-checker.ts`'s reachable `checkImage()` `update_available` emit migrated onto the bus. The unreachable `triggerUpdate()` method (no caller anywhere in `server/src/`, carries an `as any` cast for a `"update_error"` live-state shape that has no domain-event catalog equivalent) was deliberately left on the old `broadcaster.publish` path — `UpdateChecker` now carries both a `bus` field (reachable path) and a `broadcaster` field (solely for this dead method), as the plan's own action text directs.
- All three test suites for the migrated application services and jobs updated in place: fake-broadcaster mocks (`{publish: vi.fn()}`) became fake-bus mocks (`{emit: vi.fn()}`), every existing assertion about broadcast payload/timing/count survived as an equivalent bus-emit assertion (none weakened), and two new explicit ordering tests were added (one for `StackService.transitionStatus()`, one for `BackupService.writeStackStatus()`) proving the repository write resolves before the emit — the acceptance criterion the pre-existing suites proved only indirectly.
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (55 files, 962 passed + 2 todo) both exit zero after every task and at plan completion. `server/test/integration/`, `routes/events.ts`, `lib/state-broadcaster.ts`, and `domain/events.ts` are confirmed byte-identical to the plan's starting point (`git diff --stat` empty against all four) — the server-sent-events wire contract this plan is bound by (D-18) is untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: The bridge subscriber — bus events become live-state events, unchanged** - `4bf637f` (feat)
2. **Task 2: The two status choke points emit domain events** - `e4f9132` (feat)
3. **Task 3: The four job publishers emit domain events** - `6f4dcb9` (feat)

_No TDD RED/GREEN split beyond Task 1 — Task 1 followed the plan's `tdd="true"` flag (RED: failing test against the not-yet-existing module, confirmed via a dedicated test run before the implementation was written; GREEN: implementation, all 12 cases pass in one commit per this phase's established single-commit-per-TDD-task precedent, matching plans 10-01/10-03). Tasks 2 and 3 are not TDD-flagged in the plan frontmatter._

## Files Created/Modified
- `server/src/application/subscribers/state-broadcast-subscriber.ts` - New: `subscribeStateBroadcast()`, the 7-event bridge with its in-file mapping-table comment
- `server/test/unit/application/state-broadcast-subscriber.test.ts` - New: 12 test cases (7 required deep-equality cases + statusLog/message present-absent variants + disposer/isolation/ordering)
- `server/src/application/index.ts` - Imports `domainEventBus`/`subscribeStateBroadcast`; exports `disposeStateBroadcastSubscription`; `stackService`/`backupService` construction now passes `domainEventBus` in place of `stateEventBroadcaster`
- `server/src/application/stack-service.ts` - Constructor's `broadcaster` param -> `bus: Pick<EventBusPort, "emit">`; `transitionStatus()`/`publishConfigChanged()` emit instead of publish
- `server/src/application/backup-service.ts` - Constructor's `broadcaster` param -> `bus: Pick<EventBusPort, "emit">`; `writeStackStatus()` emits instead of publishes
- `server/src/jobs/state-poller.ts` - Constructor's `broadcaster` param -> `bus`; all three publish sites emit `stack.container_state_changed`/`stack.status_changed`
- `server/src/jobs/file-watcher.ts` - Constructor's `broadcaster` param -> `bus`; all three publish sites emit `stack.config_changed`/`stack.config_error`
- `server/src/jobs/update-checker.ts` - Constructor gains `bus` (3rd positional param) alongside a retained `broadcaster` (5th, dead-method-only); `checkImage()`'s reachable emit migrated, `triggerUpdate()` deliberately untouched with a new doc comment naming why
- `server/src/jobs/proxy-cert-poller.ts` - Constructor's `broadcaster` param -> `bus`; single `applyStatus()` publish site emits `proxy.cert_status_changed`
- `server/test/unit/application/stack-service.test.ts` - `createMockBroadcaster()` -> `createMockBus()`; 16 `broadcaster.publish` assertions migrated to `bus.emit`; 1 new ordering test
- `server/test/unit/application/backup-service.test.ts` - Same mock rename; 7 `mockBroadcaster.publish` assertions migrated to `mockBus.emit`; 1 new ordering test
- `server/test/unit/jobs/file-watcher.test.ts` - Same mock rename; 9 assertions migrated
- `server/test/unit/jobs/proxy-cert-poller.test.ts` - Same mock rename; 8 assertions migrated
- `server/test/unit/jobs/update-checker.test.ts` - Adds `createMockBus()`/`mockBus` alongside the retained `createMockBroadcaster()`/`mockBroadcaster` (used only by the dead-method `triggerUpdate()` describe block); 3 reachable-path assertions migrated

## Decisions Made

**Per-migrated-call-site mapping (plan's `<verification>` requirement — the live-state event previously published, side by side with the domain event now emitted, and the bridge's mapping that reproduces the former from the latter):**

| Call site | Live-state event before | Domain event now emitted | Bridge maps back to |
|---|---|---|---|
| `StackService.transitionStatus()` | `{type:"stack_status", stackId, stackStatus}` | `stack.status_changed` `{stackId, status}` | `{type:"stack_status", stackId, stackStatus: status}` |
| `StackService.publishConfigChanged()` | `{type:"config_changed", stackId, newHash, source:"app"}` | `stack.config_changed` `{stackId, newHash, source:"app"}` | `{type:"config_changed", stackId, newHash, source}` |
| `BackupService.writeStackStatus()` | `{type:"stack_status", stackId, stackStatus}` | `stack.status_changed` `{stackId, status}` | same as above |
| `StatePoller.handleEvent()` (2 sites) | `{type:"container_state", stackId, serviceName, containerState, healthStatus, stackStatus, statusLog?}` | `stack.container_state_changed` (identical field set) | identical field set, `statusLog` present iff the domain event carried it |
| `StatePoller.reconcile()` | `{type:"stack_status", stackId, stackStatus}` | `stack.status_changed` `{stackId, status}` | same as StackService row |
| `FileWatcher.handleFileChange()` (config_changed) | `{type:"config_changed", stackId, newHash, source:"external"}` | `stack.config_changed` `{stackId, newHash, source:"external"}` | same as StackService row |
| `FileWatcher.handleFileChange()` (config_error) | `{type:"config_error", stackId, message}` | `stack.config_error` `{stackId, message}` | `{type:"config_error", stackId, message}` |
| `FileWatcher.handleEnvChange()` | `{type:"config_changed", stackId, newHash, source:"external"}` | `stack.config_changed` `{stackId, newHash, source:"external"}` | same as above |
| `UpdateChecker.checkImage()` | `{type:"update_available", stackId, imageRef, latestTag, hasUpdate}` | `stack.update_available` (identical field set) | identical field set |
| `ProxyCertPoller.applyStatus()` | `{type:"proxy_cert_status", proxyConfigId, stackId, domain, status, message?}` | `proxy.cert_status_changed` (identical field set) | identical field set, `message` present iff the domain event carried it |

**Three status wrappers' bodies, before and after (plan's `<verification>` requirement — proving try/catch and write-then-emit ordering intact):**

`StackService.transitionStatus()` — before:
```ts
await this.repo.transitionStatus(id, from, to, message);
try {
    this.broadcaster.publish({type: "stack_status", stackId: id, stackStatus: to});
} catch (err) {
    console.error(`[StackService] failed to publish stack_status for "${id}":`, err);
}
```
— after:
```ts
await this.repo.transitionStatus(id, from, to, message);
try {
    this.bus.emit("stack.status_changed", {stackId: id, status: to});
} catch (err) {
    console.error(`[StackService] failed to emit stack.status_changed for "${id}":`, err);
}
```

`StackService.publishConfigChanged()` — before:
```ts
try {
    this.broadcaster.publish({type: "config_changed", stackId: id, newHash, source: "app"});
} catch (err) {
    console.error(`[StackService] failed to publish config_changed for "${id}":`, err);
}
```
— after:
```ts
try {
    this.bus.emit("stack.config_changed", {stackId: id, newHash, source: "app"});
} catch (err) {
    console.error(`[StackService] failed to emit stack.config_changed for "${id}":`, err);
}
```

`BackupService.writeStackStatus()` — before:
```ts
await this.stackRepo.update(stackId, data)
try {
    this.broadcaster.publish({type: "stack_status", stackId, stackStatus: data.status})
} catch (err) {
    console.error("[BackupService] broadcaster publish failed", err)
}
```
— after:
```ts
await this.stackRepo.update(stackId, data)
try {
    this.bus.emit("stack.status_changed", {stackId, status: data.status})
} catch (err) {
    console.error("[BackupService] bus emit failed", err)
}
```

All three keep the `await <write>` strictly before the `try { emit }` block, unchanged from the plan's requirement.

**`stack.status_changed` carries only `{stackId, status}`, never `previousStatus`/`message`:** the domain-event payload type (`StackStatusChangedEvent`, written in 10-03) declares both as optional fields for a future consumer (e.g. Phase 14's health/uptime work), but every migrated wrapper emits only the two fields the pre-existing live `stack_status` broadcast ever carried. D-18 freezes the *observable SSE event*, not the domain event's full potential shape — populating the optional fields now would be scope this plan doesn't own and the bridge doesn't forward them to the wire event anyway (its explicit mapping only reads `payload.status`).

**`UpdateChecker` keeps two broadcaster-shaped fields, not one:** a straight rename of the constructor's third parameter from `broadcaster` to `bus` would have broken `triggerUpdate()` — the plan's own action text says to leave that method's `publish` call and `as any` cast alone, and its acceptance criterion (`grep -cE 'broadcaster\.publish' update-checker.ts` -> exactly the dead method's call count) requires the literal identifier `broadcaster.publish` to still exist in the file. `bus` was inserted as a new third positional constructor parameter (shifting `registry` to fourth) and `broadcaster` retained as a fifth, defaulting to `stateEventBroadcaster` exactly as it always did.

## Deviations from Plan

**1. [Rule 2 — acceptance-criterion doesn't literally hold] `grep -cE 'broadcaster' server/src/application/backup-service.ts` is 7, not 0**

- **Found during:** Task 2
- **Issue:** The plan's Task 2 acceptance criteria state `grep -cE 'broadcaster' server/src/application/stack-service.ts server/src/application/backup-service.ts` should print `0` for both files. `stack-service.ts` does. `backup-service.ts` does not — but every one of its 7 remaining "broadcaster" occurrences is a reference to the pre-existing, unrelated per-backup live-log `EventEmitter` map (`backupBroadcasters`, `ensureBackupBroadcaster()`, `getBackupBroadcaster()`, `disposeBackupBroadcaster()`, and their doc comments) that streams a running backup's restic output to a subscribed SSE client — a completely different mechanism from the live-state `StateBroadcaster` this plan migrates, present in the file before this plan started, and outside Task 2's declared `<files>`/`<action>` scope (which names only "the private status writer" `writeStackStatus()` and the constructor parameter).
- **Fix:** No code change — the field/import criteria that actually target the StateBroadcaster dependency (`grep -cE '^\s*import .*state-broadcaster'` -> 0 for both files; the constructor no longer takes a `broadcaster` param typed against `StateBroadcaster`) hold exactly as required. Documented here rather than silently renaming an unrelated, out-of-scope public API (`getBackupBroadcaster` is re-exported from `application/index.ts` and consumed by `routes/backups.ts`'s SSE log stream) to satisfy an overly broad literal grep.
- **Files modified:** None beyond Task 2's own scope.
- **Verification:** `grep -cE '^\s*import .*state-broadcaster' server/src/application/backup-service.ts` -> `0`; `grep -cE 'broadcaster' server/src/application/backup-service.ts` -> `7`, all pre-existing `backupBroadcasters`/`ensureBackupBroadcaster`/`getBackupBroadcaster`/`disposeBackupBroadcaster` references, confirmed unrelated to `StateBroadcaster` by reading each match.
- **Committed in:** `e4f9132` (Task 2 commit)

**2. [Rule 2 — acceptance-criterion doesn't literally hold] `grep -rcE 'broadcaster\.publish' server/src/application/` is non-zero for two files, not one**

- **Found during:** Task 3
- **Issue:** The plan's Task 3 acceptance criteria say that after Tasks 2 and 3, "only the notification service still publishes inline" (`notification-service.ts`, migrating in plan 10-12), implying the grep should be non-zero for exactly that one file. It is non-zero for two: `notification-service.ts` (1, as anticipated) and `subscribers/state-broadcast-subscriber.ts` (1) — the Task 1 bridge's own internal `publish()` helper, which by design is the single sanctioned call site that turns a translated bus event back into a real `broadcaster.publish(event)` call. This is not a second inline publisher left behind; it is the bridge itself, and Task 1 (which created this file) predates the plan text's "after Task 2 and this task" framing.
- **Fix:** No code change — this is the intended, load-bearing shape of the migration (D-15 item 3: the live-state broadcaster becomes an ordinary bus subscriber, fed by exactly one bridge). Documented here so the grep result is not mistaken for an incomplete migration.
- **Files modified:** None beyond Task 3's own scope.
- **Verification:** `grep -rcE 'broadcaster\.publish' server/src/application/` -> non-zero only for `notification-service.ts` and `subscribers/state-broadcast-subscriber.ts`; every other file under `application/` is `0`.
- **Committed in:** `6f4dcb9` (Task 3 commit)

---

**Total deviations:** 2 documented (both acceptance-criteria text not accounting for pre-existing, unrelated code or for Task 1's own bridge file — no code was changed for either)
**Impact on plan:** Zero. Both are documentation-only clarifications; the underlying, load-bearing acceptance criteria (state-broadcaster import removal, constructor no longer typed against `StateBroadcaster`, exactly-one-feed for every reachable publisher) hold exactly as written.

## Issues Encountered

**Fresh-worktree setup:** `node_modules` was absent (`yarn install`, ~1m17s) and the Prisma client had never been generated (`yarn db:generate`) — the same pre-existing per-worktree prerequisite every plan since 10-02 has documented, not introduced by this plan.

**Worktree base was stale:** this worktree's branch predated plans 10-01 through 10-10 (confirmed via `git merge-base --is-ancestor`); fast-forward-merged `feature/phase-10-backend-refactoring` in before starting, per this plan's own dispatch instructions. No conflicts — the fast-forward was clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 10-12 (notifications) and 10-13 (the StackEvent audit trail) can now follow this plan's exact bridge-subscriber pattern for their own D-15 categories — `subscribers/` already exists as a directory, and `subscribeStateBroadcast()`'s in-file mapping-table comment is the precedent for how each should document its own translation.
- Plan 10-14 (job-kind formalization / dead-code removal) has a named, grep-confirmed target: `update-checker.ts`'s `triggerUpdate()` method (unreachable, `as any` cast, still on the old broadcaster path) — this plan deliberately left it in place rather than touch code outside its own declared scope.
- `EventBusPort`/`domainEventBus` now has real production traffic flowing through it for the first time (previously wired but unused by any publisher since plan 10-03) — every status transition, config-changed/config-error broadcast, and container-state/update-available/cert-status event in the server now passes through the bus before reaching a connected browser.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (55 files, 962 passed + 2 todo, up from the pre-plan 55 files / 960 passed baseline by 2 new tests — the two explicit write-then-emit ordering tests) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 6 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with every prior plan's precedent in this phase. Confirmed unmodified by this plan's diff (`git diff --stat` against the pre-plan HEAD is empty for `server/test/integration/`).
- The plan's own `<verification>` `<human-check>` (connecting a real browser/events client to `GET /api/events` and confirming a deploy/stop/external-compose-edit/backup produce the same event sequence as before) is deferred to the phase gate in plan 10-15, per the plan's own text — not performed in this session. Recorded as coverage item D5 (`human_judgment: true`) above so it surfaces at verify-work rather than being silently assumed proven.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-24*

## Self-Check: PASSED

All created files (`server/src/application/subscribers/state-broadcast-subscriber.ts`,
`server/test/unit/application/state-broadcast-subscriber.test.ts`, and this SUMMARY.md)
confirmed present on disk; all 3 task commits (`4bf637f`, `e4f9132`, `6f4dcb9`) confirmed
present in `git log`. `git rev-list --count 000eb54..HEAD` = 3, matching the 3 task commits
with no docs-only or uncommitted changes at self-check time.
