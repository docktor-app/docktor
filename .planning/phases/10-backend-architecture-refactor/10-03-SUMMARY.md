---
phase: 10-backend-architecture-refactor
plan: 03
subsystem: backend-architecture
tags: [event-bus, domain-events, pub-sub, node-eventemitter, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "10-01's application/ports/ convention and repositories/index.ts composition-root pattern"
provides:
  - "server/src/domain/events.ts — DomainEventMap, the pure event-payload catalog every publisher/subscriber types against"
  - "server/src/application/ports/event-bus-port.ts — EventBusPort, the two-member emit/subscribe contract"
  - "server/src/infrastructure/event-bus.ts — InMemoryEventBus + domainEventBus singleton, with per-subscriber failure isolation (D-17)"
affects: [10-11, 10-12, 10-13]

# Actuals (#2632)
actuals:
  tokens: 3630
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyed event-map type (DomainEventMap) instead of a bare discriminated union — the bus is generic over the map so emit()/subscribe() infer the payload from the event-name key"
    - "Dispatch-loop isolation: never call the underlying EventEmitter's own emit(); iterate rawListeners() and wrap each call in its own try/catch, catching a Promise-returning listener's rejection separately"

key-files:
  created:
    - server/src/domain/events.ts
    - server/src/application/ports/event-bus-port.ts
    - server/src/infrastructure/event-bus.ts
    - server/test/unit/infrastructure/event-bus.test.ts
  modified: []

key-decisions:
  - "Payload interfaces omit a 'type' discriminator field (unlike StateEvent's union members) — the DomainEventMap key itself is the discriminator, so carrying a redundant type field inside each payload would duplicate information already known at the call site"
  - "subscribe()'s returned unsubscribe function tracks its own 'already unsubscribed' boolean in closure, making a second call to the same unsubscribe function a guaranteed no-op independent of EventEmitter.off()'s own listener-matching behavior"
  - "Domain-event catalog populated with exactly the 7 events that have an existing, grounded producer in StateBroadcaster today — notification-intent events (10-12) and audit-trail fields (10-13) are explicitly deferred with an in-file comment naming those plans"

patterns-established:
  - "InMemoryEventBus.emit()'s per-listener try/catch dispatch loop — the load-bearing pattern for D-17; any future bus-like primitive in this codebase should copy this loop, not EventEmitter.emit() directly"

requirements-completed: [D-04, D-15, D-16, D-17]

coverage:
  - id: D1
    description: "A domain-event catalog exists as pure types with no I/O and no imports from infrastructure, repositories or lib (D-15, D-16)"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts (33 tests, full RULES table, domain/ purity rule)"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/|infrastructure/|repositories/|jobs/|generated/)' server/src/domain/events.ts → 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "The bus is in-memory and synchronous within the single Fastify process, with no persistence, no durability and no retry (D-16, D-17)"
    requirement: "D-16"
    verification:
      - kind: unit
        ref: "grep -cE 'setTimeout|setInterval|retry|backoff|persist' server/src/infrastructure/event-bus.ts → 0"
        status: pass
      - kind: other
        ref: "emit()'s implementation signature returns void, not Promise<void> — verified by yarn typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "When two subscribers are registered for one event and the first throws, the second still runs (D-17) — proven by a test, not by the emitter's default behaviour"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#still invokes the second subscriber when the first throws synchronously, and emit returns normally"
        status: pass
      - kind: other
        ref: "Deliberate regression: this.emitter.emit(event, payload) delegation made this exact test fail; reverted, confirmed byte-identical via diff"
        status: pass
    human_judgment: false
  - id: D4
    description: "emit() never propagates a subscriber's exception to the code that emitted the event (D-17)"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#logs exactly one error naming the event key when a subscriber throws"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#emitting an event with zero subscribers is a no-op that does not throw"
        status: pass
    human_judgment: false
  - id: D5
    description: "A rejected promise returned by an async subscriber is caught and logged, never surfacing as an unhandled rejection"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#still invokes the second subscriber when the first returns a rejected promise, with no unhandled rejection"
        status: pass
    human_judgment: false
  - id: D6
    description: "Unsubscribing removes exactly the handler that was registered and leaves other handlers for the same event in place"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#unsubscribe removes only that handler, leaving a second handler for the same key in place"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/event-bus.test.ts#calling unsubscribe twice is a no-op and does not remove another handler"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 03: Domain-Event Bus Primitive Summary

**In-memory synchronous domain-event bus (`InMemoryEventBus`) with a per-listener try/catch dispatch loop that proves — via a deliberately-broken regression check — that a throwing or rejecting subscriber can never block or suppress another subscriber, closing the exact defect D-17 exists to prevent.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-23T11:20:00Z (approx, first file read)
- **Completed:** 2026-09-23T11:55:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- Declared `DomainEventMap` in `server/src/domain/events.ts` — 7 pure, I/O-free event payload interfaces mirroring `StateBroadcaster`'s existing `StateEvent` producers 1:1, with in-file comments naming plans 10-12/10-13 as the owners of the two categories intentionally not included yet (D-15, D-16)
- Declared `EventBusPort` in `server/src/application/ports/event-bus-port.ts` — a two-member `emit`/`subscribe` contract, `emit` returning `void` and documented as never throwing or awaiting
- Implemented `InMemoryEventBus` in `server/src/infrastructure/event-bus.ts` via full RED→GREEN TDD: a failing 10-case test suite first (confirming the module didn't exist), then the dispatch-loop implementation that iterates `rawListeners()` with per-listener try/catch — never delegating to the underlying `EventEmitter`'s own `emit()` (D-17)
- Live-verified the isolation guarantee actually discriminates a naive implementation: temporarily replaced the dispatch loop with `this.emitter.emit(event, payload)`, confirmed exactly the two isolation tests plus the single-error-log test failed (7 of 10 still passed), reverted, and confirmed the restored file is byte-identical to the committed version via `diff`

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain-event catalog and the EventBusPort contract** - `56f808b` (feat)
2. **Task 2: InMemoryEventBus with per-subscriber failure isolation** - TDD, two commits:
   - RED: `7d59c0f` (test) — 10-case failing test suite, confirmed failing on "Cannot find module" since the implementation didn't exist yet
   - GREEN: `2c8da57` (feat) — dispatch-loop implementation, all 10 tests pass

No REFACTOR commit — the GREEN implementation needed no cleanup.

## Files Created/Modified
- `server/src/domain/events.ts` - `DomainEventMap` and 7 payload interfaces (`StackStatusChangedEvent`, `StackContainerStateChangedEvent`, `StackConfigChangedEvent`, `StackConfigErrorEvent`, `StackUpdateAvailableEvent`, `NotificationCreatedEvent`, `ProxyCertStatusChangedEvent`); zero imports outside the domain layer
- `server/src/application/ports/event-bus-port.ts` - `EventBusPort` interface, generic over `DomainEventMap`, documenting the never-throws/never-awaits contract
- `server/src/infrastructure/event-bus.ts` - `InMemoryEventBus implements EventBusPort` with the per-listener try/catch dispatch loop; `domainEventBus` singleton export with no subscribers yet
- `server/test/unit/infrastructure/event-bus.test.ts` - 10 test cases covering every case in the plan's `<behavior>` block plus the singleton export check; 100% file coverage on `event-bus.ts`

## Decisions Made
- Payload interfaces in `domain/events.ts` omit a `type` discriminator field — the `DomainEventMap` key itself is the discriminator for a keyed-map bus design, so a redundant in-payload `type` field (as `StateEvent`'s union members carry) would duplicate information already known at every call site.
- `subscribe()`'s unsubscribe closure tracks its own `unsubscribed` boolean rather than relying solely on `EventEmitter.off()`'s listener-matching semantics, guaranteeing double-unsubscribe is a true no-op regardless of any edge case with duplicate handler references.
- The catalog stops at exactly the 7 events with an existing, grounded producer today — no speculative events were added; the two deferred categories (notification-intent events, audit-trail fields) are named in-file for 10-12/10-13's authors.

## Deviations from Plan

None - plan executed exactly as written. Both tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1-4 deviation.

## Issues Encountered

Session was interrupted by a rate-limit after both tasks were committed but before SUMMARY.md was written. Resumed in the same worktree/branch, re-verified all three commits present with a clean working tree, re-ran every plan verification command (typecheck, event-bus.test.ts, layering.test.ts, both grep checks, full unit suite) to confirm the on-disk state still satisfies the plan before writing this SUMMARY — no code changes were needed on resume.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `EventBusPort` and `InMemoryEventBus`/`domainEventBus` are ready for plan 10-11 (status/configuration broadcasts), 10-12 (notifications), and 10-13 (the audit trail) to migrate their respective D-15 side-effect category onto, one plan each, as designed — no existing call site was touched by this plan.
- `DomainEventMap` is the typed contract those three plans subscribe/emit against; 10-12 and 10-13 extend the catalog with their own new payload fields per the in-file comments left in `domain/events.ts`.
- No blockers. `yarn typecheck` and the full unit suite (49 files, 788 passed, 2 pre-existing todo) both exit zero, matching 10-01's confirmed baseline plus this plan's one new test file — no regression outside this plan's scope.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 4 created files (`server/src/domain/events.ts`, `server/src/application/ports/event-bus-port.ts`, `server/src/infrastructure/event-bus.ts`, `server/test/unit/infrastructure/event-bus.test.ts`) and this SUMMARY.md confirmed present on disk; all 3 commits (`56f808b`, `7d59c0f`, `2c8da57`) confirmed present in git history via `git log`.
