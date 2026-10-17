# Phase 10: Backend Architecture Refactor - Research

**Researched:** 2026-09-22
**Domain:** Server-side DDD/hexagonal layering, job scheduling, in-process domain-event bus (Node.js/TypeScript/Fastify)
**Confidence:** HIGH (codebase-derived; every claim below is grounded in a file read or a live probe run this session, not training-data recall)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope — all four issue-#16 items are in, at their most ambitious variant**
- **D-01:** DDD/hexagonal layering: full broader restructure, not just fixing found violations — explicit ports/interfaces for infrastructure dependencies, stricter DI conventions across the board.
- **D-02:** Job handling: formalize a shared Job abstraction/registry, not just cleanup.
- **D-03:** Dead-code removal: dedicated audit pass across the server workspace, not just opportunistic cleanup while touching files.
- **D-04:** Event-driven architecture: add a genuinely new internal domain-event bus, not just accept the current dockerode-events + StateBroadcaster/SSE setup as "event-driven enough."
- **D-05:** Structure as one phase (10), planned as multiple sequential plan waves — not split into separate roadmap phases. `/gsd-plan-phase 10` should sequence waves by dependency (the event bus depends on clean application-service boundaries from the layering work, so layering is understood to be the foundation; jobs and dead-code cleanup are more independent). No locked wave order beyond that — the planner decides based on actual dependencies found.
- **D-06:** No fallback/descope trigger if the broader restructure or event bus prove risky mid-implementation — full scope is committed to. Reversibility: costly — a fallback becomes a scope renegotiation with the user, not a silent descope.

**DDD/layering restructure depth**
- **D-07:** Interface every infrastructure dependency, even single-implementation ones: `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, the SMTP client all get an interface defined in application/domain, with the concrete class in `infrastructure/` implementing it.
- **D-08:** Expand `domain/` (currently just `stack-status-machine.ts`, 5 files total) by pulling more pure business rules out of `application/` services — e.g. backup retention policy math, proxy-config idempotency rules — into domain modules with no I/O.
- **D-09:** Create the missing `repositories/index.ts`. Export singleton repository instances from it; `application/index.ts` imports them instead of instantiating repos itself.
- **D-10:** Fix `application/notification-service.ts:76` — `prisma.user.findMany(...)` called directly from the application layer — must go through a repository (e.g. `UserRepository`).
- **D-11:** Remove the dead `src/services/` directory.

**Job handling approach**
- **D-12:** Keep `node-cron` as the underlying scheduler — wrap it in a `Job` interface (start/stop/name). Reversible: thin wrapper, swap library later without touching call sites.
- **D-13:** Distinguish job *kinds* explicitly: `IntervalJob` (pure cron-driven — `disk-checker`, `backup-scheduler`, `update-checker`, `proxy-cert-poller`) vs. `WatcherJob` (event-driven with a cron-based reconciliation fallback — `state-poller`, `file-watcher`), both implementing a common lifecycle contract for the `jobs/index.ts` registry.
- **D-14:** The job registry tracks per-job health state — last run, last error, running/stopped status — replacing the current duplicated try/catch-per-job in `jobs/index.ts`. Internal state only, no UI/endpoint this phase (groundwork for Phase 14).

**"Event-driven architecture" — internal domain-event bus**
- **D-15:** Three side-effect categories move onto the new event bus: (1) Notifications (stack ERROR/UNHEALTHY, disk space, backup failure) — service emits domain event, `notification-service` subscribes; (2) StackEvent audit trail (`config_changed`, `config_error`, `update_available`) — service emits domain event, an audit-log subscriber writes the row; (3) Status/state transitions — `StateBroadcaster` becomes a subscriber like any other, not a special-cased inline call.
- **D-16:** The bus is in-memory and synchronous — a simple `EventEmitter`-style bus within the single Fastify process, no persistence/durability. An event is lost if the process crashes mid-handler — accepted tradeoff.
- **D-17:** Subscribers fail in isolation with no retry — each subscriber's handler is wrapped so one failing doesn't block other subscribers or the emitting operation. No retry/backoff.
- **D-18:** `StateBroadcaster` drives the live SSE state consistency validated in Phase 08 — rewiring it onto the event bus must preserve the exact same observable SSE events at the same points; internal wiring change, not a behavior change.

### Claude's Discretion
- Exact interface/type names for the Job kinds, event bus, and new domain modules are left to planning/implementation.
- Whether the dead-code audit pass surfaces additional findings beyond `src/services/` is open.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. D-14's per-job health-state tracking is groundwork Phase 14 could build a UI on top of, but this phase adds no UI. 15 backlog todos matched by keyword search were reviewed and explicitly not folded (all UI/feature-shaped, already tracked as GitHub issues).

### Hard constraints (phase boundary, not decisions but binding)
- No existing API endpoint's request/response contract changes.
- Existing integration tests (`server/test/integration/`, 5 files) pass unmodified.
- Target layering conventions are already fully specified in `CLAUDE.md` — this phase enforces/deepens, does not redefine.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GitHub #16 | "[CHORE] Backend Refactoring" — open-list discussion prompt covering DDD/hexagonal layering, job handling, dead-code removal, event-driven architecture; scoped into 18 concrete decisions (D-01..D-18) by `/gsd-discuss-phase`, reproduced verbatim above | Every section below maps to one or more of D-01..D-18: Standard Stack / Architecture Patterns → D-07/D-08/D-09/D-12/D-13/D-16; Don't Hand-Roll → D-12/D-16; Common Pitfalls → D-17/D-18; Code Examples → D-07/D-09/D-13/D-15/D-16 |

</phase_requirements>

## Summary

This phase has no new external dependencies to research — it is a pure internal restructuring of `server/src/` using patterns (Repository, Strategy/ports-and-adapters, Observer) that `CLAUDE.md` already mandates and the codebase already partially follows. The real research value here is a precise, file:line-accurate map of the *current* violations and call sites, since the planner's job is to sequence a restructure, not discover whether one is needed.

Four findings materially change how the planner should scope this phase versus what CONTEXT.md's scouting pass assumed:

1. **The event-bus migration surface is narrower than it looks.** Both status-transition side effects (`StackService.transitionStatus()` at `application/stack-service.ts:575-587` and `BackupService.writeStackStatus()` at `application/backup-service.ts:682-692`) are *already* single choke points that wrap a repo write + one `broadcaster.publish()` call in try/catch. D-15 item 3 (status/state transitions → event bus) is a two-call-site swap, not a 27-call-site rewrite (there are 27 call sites *into* these two wrappers, but the wrappers themselves are the only places touching `StateBroadcaster`).

2. **Node's built-in `EventEmitter` is already the exact pattern in use** (`lib/state-broadcaster.ts` — `class StateBroadcaster extends EventEmitter`, single `"event"` channel, discriminated-union payload type, `setMaxListeners(100)`) — confirming D-16/D-8's discretion question (no library needed) — **but a live probe this session proved `EventEmitter.emit()` does not isolate listeners**: a throwing listener aborts the emit call and any listener registered after it never runs. D-17's "subscribers fail in isolation" requirement is **not satisfied by wrapping `StateBroadcaster`'s existing emit pattern as-is** — the new bus must dispatch to each listener in its own try/catch, not rely on `EventEmitter.emit()`'s native behavior. This is the single highest-risk implementation detail in the phase and should be a dedicated task with its own test.

3. **The "notifications called directly" framing in D-15 item 1 is only half true.** Stack ERROR/UNHEALTHY notifications already go through an indirection: `NotificationWatcher` (a job) subscribes to `StateBroadcaster` and calls `notificationService.notify()` itself — it is *not* `StackService` calling `notify()` directly. Only `disk-checker.ts:104` and 5 call sites in `backup-service.ts` (287, 356, 420, 444, 633) call `notify()` directly today. The event-bus migration for "notifications" is really: convert those 6 direct calls to emit a domain event, and repoint `NotificationWatcher`'s *existing* subscription from `StateBroadcaster` to the new bus (it already only reacts to `stack_status`/`container_state` events, which after D-15 item 3 move to the new bus anyway).

4. **A concrete, previously undocumented layering violation exists**: `routes/stacks.ts:17,76,178` imports `imageUpdateCheckRepository` directly and calls it from a route handler — a second violation of "routes only call application services" beyond the notification-service Prisma call D-10 already names. The planner should fold this into the same layering wave as D-10's fix.

**Primary recommendation:** Sequence the phase as CONTEXT.md's D-05 anticipates — layering (D-07/D-08/D-09/D-10/D-11) first since the event bus depends on clean service boundaries, then the event bus (D-15/D-16/D-17/D-18) as the highest-risk wave with a dedicated multi-listener-isolation test, then jobs (D-12/D-13/D-14) as an independent track that can run in parallel with either, then the dead-code audit last (it benefits from the other waves having already deleted call sites). Node's `EventEmitter`, extended with per-listener try/catch dispatch, is sufficient — no new package needed.

## Architectural Responsibility Map

Docktor is a single-process Fastify backend (per `PROJECT.md`'s constraint: "Single Fastify process: API + background jobs + SSE + static files"), so all capabilities in this phase map to the **API/Backend** tier's internal sub-layers, not across process/tier boundaries. The map below is expressed as CLAUDE.md's own layer names, since that is the tier granularity this phase actually restructures:

| Capability | Primary Tier (layer) | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP request validation, auth gating | `routes/` | — | Unchanged by this phase; routes stay thin per CLAUDE.md |
| Business orchestration (deploy, backup, proxy assign) | `application/` | `domain/` (pure rules) | D-08 moves pure rules (retention math, idempotency checks) down into `domain/`; `application/` keeps orchestration |
| State-machine invariants, retention policy, naming/idempotency rules | `domain/` | — | D-08's expansion target; must stay I/O-free |
| Data access | `repositories/` | — | D-09 formalizes the missing `repositories/index.ts`; D-10 closes the one Prisma-in-application leak |
| Docker/filesystem/restic/SMTP adapters | `infrastructure/` | `application/`, `domain/` (port interfaces) | D-07: interfaces live in application/domain, concrete adapters stay in `infrastructure/` |
| Scheduled/background work | `jobs/` | `application/`, `repositories/` (via DI) | D-12/D-13/D-14 formalize the Job abstraction; jobs already call repos/services via constructor DI, that stays |
| Cross-cutting side effects (notify, audit log, SSE broadcast) | new **domain-event bus** (sits between `application/` and its subscribers) | `jobs/`, `lib/` | D-15/D-16: emitted from `application/`, consumed by subscribers in `application/` (notification-service), `repositories/` (audit log), and `lib/` (StateBroadcaster) |
| Live SSE fan-out to browser clients | `lib/state-broadcaster.ts` (becomes a bus subscriber) | `routes/events.ts` | D-18: must preserve exact observable event sequence; `routes/events.ts`'s `/api/events` handler is unchanged, only what feeds `StateBroadcaster.publish()` changes |

No capability in this phase crosses into the client/browser tier — this is confirmed by the phase boundary text itself ("Independent of Phase 11... separate server/client tracks") and by the fact that none of the investigated call sites touch `client/src/`.

## Standard Stack

No new libraries are introduced by this phase (D-12 explicitly keeps `node-cron`; D-16 explicitly rejects a library for the event bus). The table below documents the *existing* dependencies this phase touches, with versions verified against the installed lockfile/registry this session.

### Core (existing, unchanged versions — no upgrade in scope)
| Library | Installed | Purpose | Why Standard |
|---------|-----------|---------|--------------|
| `node-cron` | `^3.0.3` [VERIFIED: server/package.json] | Cron scheduling for `IntervalJob`/`WatcherJob` fallback ticks | D-12 keeps this; registry's current major is `4.6.0` with `engines: {node: ">=20"}` — `npm view node-cron version` returned `4.6.0` this session, but a version bump is explicitly **not** in scope (D-12 only asks for a wrapper, not a library swap) |
| `chokidar` | `^4.0.3` [VERIFIED: server/package.json] | FileWatcher's underlying watch implementation | Unchanged — FileWatcher becomes a `WatcherJob`, chokidar itself isn't touched |
| `dockerode` | `^4.0.4` [VERIFIED: server/package.json] | Docker Engine API client (`DockerodeClient`) | Unchanged |
| `nodemailer` | `^8.0.2` [VERIFIED: server/package.json] | SMTP transport, called inline via `createTransport()` in `NotificationService` | D-07 wraps this behind a new `SmtpClient` port; the library itself is unchanged |
| `node.js events.EventEmitter` (built-in, no package) | Node `>=22.0.0` [VERIFIED: server/package.json engines field] | Base class for the new domain-event bus | Already the pattern `lib/state-broadcaster.ts` uses (`class StateBroadcaster extends EventEmitter`) — reuse the same idiom for the new bus, do not add a package (D-16) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node's built-in `EventEmitter` for the new bus | `eventemitter3`, `mitt`, `emittery` (typed/async-aware emitters) | D-16 already locks "no library needed" — this row is here only to record that the alternative was considered and explicitly rejected by the user's own discussion decision, not by this research pass. `emittery` in particular offers built-in per-listener error isolation (async, Promise-based) which would sidestep the pitfall in Summary point 2 — worth surfacing to the user as an option during planning if the hand-rolled isolation wrapper proves fiddly, but not a default recommendation since it contradicts D-16 |
| `node-cron` | `croner`, `bree`, `node-schedule`, `agenda` | D-12 explicitly keeps node-cron; out of scope |

**Installation:** None — no new packages for this phase.

## Package Legitimacy Audit

**Not applicable.** This phase adds zero new npm dependencies (D-12 keeps `node-cron`; D-16 rejects a bus library; D-07's port interfaces are hand-written TypeScript `interface` declarations, not a package). The Package Legitimacy Gate protocol is skipped per its own trigger condition ("every phase that installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │              routes/*.ts                     │
                         │  (Zod validation, requireAuth, thin handlers)│
                         └───────────────────┬───────────────────────────┘
                                              │ calls
                                              ▼
                         ┌─────────────────────────────────────────────┐
                         │            application/*.ts                  │
                         │  StackService, BackupService, ProxyService,  │
                         │  NotificationService, CertificateService,    │
                         │  SettingsService, MigrationService            │
                         │                                               │
                         │  orchestrates:                                │
                         │   - domain/ (pure rules)                      │
                         │   - repositories/ (via ports)                 │
                         │   - infrastructure/ (via new D-07 ports)      │
                         │   - emits domain events ───────────┐          │
                         └───────────────────┬─────────────────┼─────────┘
                                              │ reads/writes    │ emits
                                              ▼                 ▼
                         ┌──────────────────────┐   ┌─────────────────────────────┐
                         │   domain/*.ts          │   │   NEW: domain-event bus     │
                         │  (pure, no I/O)        │   │  (in-process EventEmitter,  │
                         │  stack-status-machine, │   │   per-listener try/catch    │
                         │  +retention policy,    │   │   dispatch — D-17)          │
                         │  +proxy idempotency     │   └──────────┬──────────┬──────┘
                         │  rules (D-08)          │              │          │
                         └──────────────────────┘      subscriber│  subscriber
                                              ▲                   ▼          ▼
                                              │         ┌──────────────┐ ┌─────────────────┐
                         ┌──────────────────────┐       │ notification-│ │ audit-log        │
                         │  repositories/*.ts     │◄──────┤ service      │ │ subscriber       │
                         │  (only Prisma access)  │write  │ (subscribes) │ │ (writes          │
                         │  index.ts (D-09, NEW)  │       └──────────────┘ │ StackEvent rows) │
                         └──────────────────────┘                         └─────────────────┘
                                              ▲                                    │
                                              │                                    ▼ writes via
                         ┌──────────────────────┐                        ┌─────────────────┐
                         │  infrastructure/*.ts   │                        │ stack-event-     │
                         │  DockerExecutor,       │                        │ repository        │
                         │  StackFilesystem,      │                        └─────────────────┘
                         │  ResticExecutor,       │
                         │  SmtpClient (D-07 new  │       ┌──────────────────────────────┐
                         │  port + adapter)       │       │  lib/state-broadcaster.ts      │
                         └──────────────────────┘       │  (StateBroadcaster becomes a    │
                                                          │   subscriber — D-15 item 3,     │
                         ┌──────────────────────┐       │   D-18 — same publish() shape)  │
                         │  jobs/*.ts             │──────►└──────────────┬────────────────┘
                         │  IntervalJob/WatcherJob│ emits to bus                  │ .publish()
                         │  registry (D-13/D-14)  │                                ▼
                         └──────────────────────┘                        ┌─────────────────┐
                                                                          │ routes/events.ts  │
                                                                          │ GET /api/events    │
                                                                          │ (SSE, unchanged)    │
                                                                          └─────────────────┘
```

Primary use-case trace (a stack transitions to ERROR): `StatePoller` (job) detects a dockerode event → calls `repo.updateStackStatus()` → `StackService.transitionStatus()` (or equivalent post-refactor call) writes the DB row → emits a domain event on the new bus → three subscribers react independently and in isolation: `StateBroadcaster` publishes to SSE (unchanged client experience, D-18), `NotificationWatcher`/`notification-service` sends an email, an audit-log subscriber writes a `StackEvent` row. Each subscriber's failure (e.g. SMTP down) must not block the other two (D-17) — this is the one path a live probe this session proved is **not** automatic with a bare `EventEmitter`.

### Recommended Project Structure (delta from current)
```
server/src/
├── domain/
│   ├── stack-status-machine.ts       # existing
│   ├── certificate-naming.ts         # existing
│   ├── certificate-validation.ts     # existing
│   ├── compose-config.ts             # existing
│   ├── image-update-detection.ts     # existing
│   ├── backup-retention-policy.ts    # NEW (D-08) — extracted from application/backup-service.ts:757 parseRetentionPolicy()
│   ├── proxy-idempotency.ts          # NEW (D-08) — extracted from application/proxy-service.ts's inline existing-row checks
│   └── events.ts                     # NEW (D-15/D-16) — the DomainEvent union type + EventBus port interface (naming is Claude's discretion)
├── repositories/
│   ├── index.ts                      # NEW (D-09) — exports all 8 singleton repos
│   └── user-repository.ts            # NEW (D-10) — replaces notification-service.ts:76's raw prisma.user.findMany()
├── infrastructure/
│   ├── event-bus.ts                  # NEW (D-16) — concrete EventEmitter-based bus with per-listener isolation (D-17)
│   └── smtp-client.ts                # NEW (D-07) — wraps nodemailer.createTransport(), implements the new SmtpClient port
├── jobs/
│   ├── job.ts                        # NEW (D-12/D-13) — IntervalJob/WatcherJob base contract
│   └── job-registry.ts               # NEW (D-14) — replaces jobs/index.ts's per-job try/catch with health-tracked registry
└── services/                          # DELETED (D-11) — dead, .gitkeep only
```

### Pattern 1: Explicit port interface for an infrastructure dependency (D-07)
**What:** Every infra class gets a named interface (not just an inline `Pick<ConcreteClass, "...">`) declared in `application/` or `domain/`, implemented by the concrete class in `infrastructure/`.
**When to use:** For `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, and the new `SmtpClient` (D-07's explicit list) — and, per the planner's scoping decision, potentially the other 6 infra classes found this session (see Open Questions).
**Current state (before):** `application/stack-service.ts:35-36` takes `fs: StackFilesystem` and `docker: DockerExecutor` as concrete class types, not interfaces. Other services already use structural `Pick<>` typing (e.g. `application/proxy-service.ts:38`: `fs: Pick<StackFilesystem, "readCompose" | "writeCompose" | "createDirectory">`), which is halfway to a port but not a named interface.
**Example (target shape):**
```typescript
// domain/ports/stack-filesystem-port.ts (or application/ — CLAUDE.md doesn't
// currently distinguish; D-07 says "application/domain", planner should pick one
// and apply it consistently across all four ports)
export interface StackFilesystemPort {
    getStackDirectory(stackId: string): string
    createDirectory(stackId: string): Promise<string>
    writeCompose(stackId: string, content: string): Promise<void>
    readCompose(stackId: string): Promise<string>
    writeEnv(stackId: string, content: string): Promise<void>
    readEnv(stackId: string): Promise<string>
    removeEnv(stackId: string): Promise<void>
    removeDirectory(stackId: string): Promise<void>
}

// infrastructure/stack-filesystem.ts
export class StackFilesystem implements StackFilesystemPort { /* unchanged body */ }
```
[VERIFIED: server/src/infrastructure/stack-filesystem.ts:1-47 — the full method list above is quoted verbatim from that file's current public API]

### Pattern 2: Domain-event bus with per-subscriber isolation (D-15/D-16/D-17)
**What:** A synchronous, in-memory, typed pub/sub bus. Emitting is synchronous (matches D-16); dispatch to each listener happens inside its own try/catch so one throwing subscriber cannot block another or the emitting call (closes the gap proven in Summary point 2).
**When to use:** Every call site currently calling `notificationService.notify()` directly, every `stackEventRepository.createEvent()` write, and both status-transition choke points (`StackService.transitionStatus()`, `BackupService.writeStackStatus()`).
**Example:**
```typescript
// infrastructure/event-bus.ts
import {EventEmitter} from "node:events"

export interface EventBus<TEventMap extends Record<string, unknown>> {
    emit<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): void
    subscribe<K extends keyof TEventMap & string>(
        event: K,
        handler: (payload: TEventMap[K]) => void | Promise<void>,
    ): () => void
}

export class InMemoryEventBus<TEventMap extends Record<string, unknown>> implements EventBus<TEventMap> {
    private readonly emitter = new EventEmitter()

    constructor() {
        // Matches lib/state-broadcaster.ts's existing precedent (100, not the
        // Node default of 10) — this bus will accumulate more subscribers per
        // event than StateBroadcaster's single SSE channel did.
        this.emitter.setMaxListeners(100)
    }

    emit<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): void {
        // Deliberately NOT this.emitter.emit(event, payload) — EventEmitter.emit()
        // does not isolate listeners: a throwing listener aborts the call and any
        // listener registered after it never runs (verified live this session).
        // rawListeners() (not listeners()) so decorator/wrapper compatibility with
        // future subscribe() implementations isn't silently broken.
        for (const listener of this.emitter.rawListeners(event) as Array<(p: TEventMap[K]) => void | Promise<void>>) {
            try {
                const result = listener(payload)
                if (result instanceof Promise) {
                    result.catch((err) => console.error(`[EventBus] async subscriber failed for "${event}":`, err))
                }
            } catch (err) {
                console.error(`[EventBus] subscriber failed for "${event}":`, err)
            }
        }
    }

    subscribe<K extends keyof TEventMap & string>(
        event: K,
        handler: (payload: TEventMap[K]) => void | Promise<void>,
    ): () => void {
        this.emitter.on(event, handler)
        return () => this.emitter.off(event, handler)
    }
}
```
Naming (`InMemoryEventBus`, `EventBus`, the event map shape) is Claude's discretion per CONTEXT.md. The isolation loop above is the load-bearing part — [VERIFIED: live probe, this session, pasted in Common Pitfalls below] confirms the naive `this.emitter.emit()` alternative fails D-17.

### Pattern 3: Job kind distinction (D-13) — verified per-job shape
**What:** Two lifecycle contracts sharing a common `start()`/`stop()`/`name` surface for the registry, with kind-specific internals.
[VERIFIED: server/src/jobs/*.ts — read this session; exact cron expressions quoted below]

| Job | File | Cron expression (quoted verbatim) | Shape |
|-----|------|-----------------------------------|-------|
| StatePoller | `jobs/state-poller.ts:106` | `"*/60 * * * * *"` | **WatcherJob** — dockerode event stream (`startEventStream()`) + cron reconcile fallback |
| FileWatcher | `jobs/file-watcher.ts:171` | `"*/60 * * * * *"` | **WatcherJob** — chokidar watch + cron reconcile fallback |
| UpdateChecker | `jobs/update-checker.ts:342` | `"*/5 * * * *"` | **IntervalJob** — pure cron, no event source |
| DiskChecker | `jobs/disk-checker.ts:28` | `"0 0 * * *"` | **IntervalJob** — pure cron (daily), plus one immediate `void this.check()` fired from `start()` itself (`jobs/disk-checker.ts:27`) |
| ProxyCertPoller | `jobs/proxy-cert-poller.ts:129` | `"*/60 * * * * *"` | **IntervalJob** — pure cron reconcile, no independent event source |
| **NotificationWatcher** | `jobs/notification-watcher.ts:23-28` | **none** | **Neither kind as defined.** `start()` only calls `this.broadcaster.subscribe(...)` — no `cron.schedule()` call anywhere in the file. Pure event-reactive with **no** cron fallback, unlike D-13's WatcherJob definition ("event-driven with a cron-based reconciliation fallback"). See Open Questions. |
| **BackupScheduler** | `jobs/backup-scheduler.ts:31-189` | **dynamic, per-stack** | **Neither kind as defined.** Holds `private tasks = new Map<string, cron.ScheduledTask>()` (`jobs/backup-scheduler.ts:32`) — one independent cron task *per stack*, created/destroyed at runtime via `upsert(stackId, cronExpr)`/`remove(stackId)` called from `routes/backups.ts:286,288` (not from `jobs/index.ts`). `loadAll()` (called from the exported `start` wrapper) is the closest thing to a `start()`. See Open Questions. |

**Registry today (to be replaced by D-14):** `jobs/index.ts:12-18`'s `startJob()` helper wraps each job's `start()` in try/catch individually, called 7 times in `startJobs()` (`jobs/index.ts:20-32`) plus one extra `startJob("BackupRecovery", ...)` call for `backupService.recoverInProgressBackups()` that is not itself a registered job. `stopJobs()` (`jobs/index.ts:34-42`) has no try/catch at all — a throwing `.stop()` would abort the remaining stops. This asymmetry (isolated starts, non-isolated stops) is a concrete gap D-14's registry should close.

### Anti-Patterns to Avoid
- **Relying on `EventEmitter.emit()` for subscriber isolation:** proven false this session (see Common Pitfalls). Always dispatch to listeners individually with per-listener try/catch.
- **Treating `Pick<ConcreteClass, "method">` as equivalent to D-07's port requirement:** it achieves the same testability today, but D-07 asks for a *named* interface, which additionally documents the port's contract independent of the concrete class and allows a genuinely swappable second implementation (e.g. a test double that isn't a partial mock of the real class's public surface).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed pub/sub dispatch | A bespoke event-name-string-keyed `Map<string, Function[]>` | Node's `EventEmitter` (already the codebase's own precedent in `lib/state-broadcaster.ts`) wrapped with a per-listener try/catch dispatch loop | D-16 explicitly rejects a third-party library; `EventEmitter` already handles listener storage, `setMaxListeners`, and `off()` correctly — only the isolation guarantee needs to be added on top |
| Cron parsing/scheduling | A custom interval scheduler | `node-cron` (already installed, D-12 keeps it) | Cron expression parsing/validation (`cron.validate()`, used at `jobs/backup-scheduler.ts:47`) is a solved, tested problem; hand-rolling risks silent DST/timezone bugs |
| SMTP protocol handling | A raw `net.Socket` SMTP client | `nodemailer` (already installed) behind the new D-07 `SmtpClient` port | STARTTLS/SSL negotiation, MIME encoding, and auth handshakes are exactly the kind of "deceptively complex" problem CLAUDE.md's Core Principles warn against re-implementing |

**Key insight:** This phase's entire "don't hand-roll" risk is concentrated in one place — the temptation to reach for a pub/sub library or a custom event-isolation mechanism when Node's `EventEmitter` plus ~15 lines of dispatch-loop code (Pattern 2 above) already solves it, matching the codebase's own established `StateBroadcaster` precedent.

## Runtime State Inventory

**Not applicable — this is not a rename/refactor/migration phase in the Runtime State Inventory sense** (no renamed string, no data migration). It is a structural code reorganization with no change to persisted data shapes, environment variable names, or externally-registered state. Confirmed by cross-checking against the trigger categories:
- **Stored data:** No Prisma schema changes are implied by any of D-01..D-18 — repositories are relocated/consolidated (D-09) and one gets a new sibling (`UserRepository`, D-10), but no table/column is renamed or migrated.
- **Live service config:** N/A — no n8n/Tailscale/Cloudflare-style external config exists in this stack.
- **OS-registered state:** N/A — no Task Scheduler/pm2/systemd state is touched.
- **Secrets/env vars:** N/A — no environment variable is renamed by this phase.
- **Build artifacts:** N/A — no package/directory rename occurs; `src/services/` is *deleted* (D-11), not renamed, and it is already empty except `.gitkeep` [VERIFIED: `ls -la server/src/services/` this session — output: `total 8 ... -rw-rw-r-- 1 raphael raphael 0 Aug 27 13:57 .gitkeep`].

## Common Pitfalls

### Pitfall 1: `EventEmitter.emit()` does not isolate listeners — verified live this session
**What goes wrong:** If the new event bus is implemented as a thin pass-through to `EventEmitter.emit()` (matching `StateBroadcaster`'s current `publish() { this.emit("event", event) }` pattern), a throwing subscriber aborts the *entire* emit call. Any listener registered after the throwing one for that same event **never runs** in that dispatch.
**Why it happens:** Node's `EventEmitter.emit()` iterates registered listeners synchronously and does not catch exceptions — an uncaught throw inside a listener propagates straight up through `emit()`.
**Falsification run this session** (executed live, not assumed):
```
$ node test-emitter.mjs
emit() threw synchronously: boom from listener A
secondCalled: false
```
Script: two listeners registered on the same event, the first throws, `emit()` is wrapped in try/catch at the call site. Output confirms the second listener's `secondCalled` flag stayed `false` — it was never invoked.
**How to avoid:** Implement the bus's dispatch loop to catch each listener's exception individually (Pattern 2's `InMemoryEventBus.emit()` above), never call `this.emitter.emit()` directly for events with more than one subscriber.
**Warning signs:** A new test that registers two subscribers on the same event, makes the first throw, and asserts the second still ran — if this test doesn't exist, the isolation guarantee (D-17) is unverified.

### Pitfall 2: `StateBroadcaster`'s current try/catch is at the *publisher*, not the *subscriber*, boundary
**What goes wrong:** Both existing status-transition choke points already wrap their `broadcaster.publish()` call in try/catch (`application/stack-service.ts:582-586`, `application/backup-service.ts:687-691`) — but this only protects the *caller* (StackService/BackupService) from a broadcaster failure; it does nothing for isolating multiple listeners *within* that one broadcast from each other, since `StateBroadcaster` today only ever has SSE-stream listeners on its single `"event"` channel (each browser tab's own `subscribe()` call), and losing one to another's exception is exactly Pitfall 1's failure mode, silently.
**Why it happens:** The existing pattern was designed for "don't let a broadcast failure strand a stack in a transitional status" (correct, and should be preserved), not for "don't let one *subscriber type* (e.g. an email-sending subscriber) block another (e.g. the audit-log subscriber)" — a distinct requirement that only becomes live once D-15 adds heterogeneous subscriber types to the same event.
**How to avoid:** Keep the existing publisher-side try/catch (it's still correct — a bus-level throw must never strand a DB write's caller) *and* add the new bus's per-listener isolation (Pitfall 1) — the two are complementary, not redundant.
**Warning signs:** A regression where enabling SMTP notifications makes the audit-log (`StackEvent` row) stop being written whenever the mail server is unreachable — this is the exact symptom D-17 exists to prevent, and it will reappear if either isolation layer is skipped.

### Pitfall 3: Two job kinds don't fit D-13's binary distinction — `NotificationWatcher` and `BackupScheduler`
**What goes wrong:** D-13 defines `IntervalJob` (pure cron) and `WatcherJob` (event-driven + cron fallback). Neither of `NotificationWatcher` (pure event-driven, **zero** cron — no `cron.schedule()` call anywhere in `jobs/notification-watcher.ts`) nor `BackupScheduler` (dynamic **per-stack** cron tasks stored in a `Map`, upserted/removed at runtime from `routes/backups.ts`, not a single fixed schedule) fits cleanly. Forcing either into the two-kind taxonomy as-is will produce an awkward implementation (e.g. a `WatcherJob` with a no-op cron fallback, or an `IntervalJob` whose "interval" is actually N independent dynamically-managed intervals).
**Why it happens:** D-13's two kinds were derived from CONTEXT.md's scouting pass, which named 4 examples for IntervalJob and 2 for WatcherJob — `notification-watcher.ts` and `backup-scheduler.ts` weren't in either list, and turn out not to match either definition on inspection.
**How to avoid:** Flag this explicitly during planning (see Open Questions) rather than silently forcing a fit. A reasonable resolution: `NotificationWatcher` still satisfies `WatcherJob`'s *lifecycle* contract (`start()`/`stop()`) even with an always-empty cron fallback (it has genuinely no need for reconciliation — a missed `StateBroadcaster` event has no queryable "current state" to reconcile against, unlike file-hash or container-state drift). `BackupScheduler` may need to keep its own internal multi-task bookkeeping and satisfy only the registry's outer lifecycle contract, or the registry's health-tracking (D-14) may need to report per-stack rather than per-job for this one case.
**Warning signs:** A `Job` interface that cannot express "zero scheduled ticks, ever" without a workaround, or a health-tracking field (`lastRun`) that is meaningless for `BackupScheduler` (which stack's last run?).

### Pitfall 4: `jobs/index.ts`'s `stopJobs()` has no per-job isolation, unlike `startJobs()`
**What goes wrong:** `startJobs()` wraps every job start in `startJob()`'s try/catch (`jobs/index.ts:12-18`); `stopJobs()` (`jobs/index.ts:34-42`) calls each job's `.stop()` directly with no try/catch at all. A throwing `.stop()` (e.g. `FileWatcher.stop()`'s `await this.watcher.close()` rejecting) would abort the remaining `.stop()` calls, potentially leaking a still-running cron task or event stream on shutdown.
**Why it happens:** The original isolation fix (STATE.md: "[Phase 02]... RESOLVED 2026-08-30... each job's startup is now individually try/caught") only addressed the cold-start crash scenario; shutdown was never revisited.
**How to avoid:** D-14's registry should apply the same per-job isolation to stop as to start.
**Warning signs:** A test asserting all 7 jobs are stopped even when one job's `.stop()` throws — if absent, this gap is unverified.

## Code Examples

### Existing "single choke point" pattern to preserve during the event-bus migration (D-18)
```typescript
// Source: server/src/application/stack-service.ts:575-587 (read this session)
private async transitionStatus(
    id: string,
    from: StackStatus,
    to: StackStatus,
    message?: string,
): Promise<void> {
    await this.repo.transitionStatus(id, from, to, message);
    try {
        this.broadcaster.publish({type: "stack_status", stackId: id, stackStatus: to});
    } catch (err) {
        console.error(`[StackService] failed to publish stack_status for "${id}":`, err);
    }
}
```
D-15 item 3 replaces `this.broadcaster.publish(...)` with `this.eventBus.emit("stack.status_changed", {...})`; `StateBroadcaster` then becomes one of that event's subscribers, re-publishing to SSE in its current shape (D-18). The `await this.repo... ; try { publish } catch` ordering — DB write completes before any broadcast — must be preserved exactly, since a broadcast before a failed write would advertise a status that never existed (per the existing comment at `application/stack-service.ts:568-570`, quoted for context, not as a new finding).

### Existing StateBroadcaster pattern the new bus should mirror structurally
```typescript
// Source: server/src/lib/state-broadcaster.ts:78-90 (read this session, quoted verbatim)
export class StateBroadcaster extends EventEmitter {
    publish(event: StateEvent): void {
        this.emit("event", event)
    }

    subscribe(handler: (event: StateEvent) => void): () => void {
        this.on("event", handler)
        return () => this.off("event", handler)
    }
}

export const stateEventBroadcaster = new StateBroadcaster()
stateEventBroadcaster.setMaxListeners(100)
```
This is the exact precedent that answers investigation point 8: yes, `EventEmitter` with a discriminated-union payload type is already idiomatic here — but note this class's `publish()` is the naive pass-through Pitfall 1 warns against. Don't copy this method body verbatim into the new bus; copy the class shape (extends EventEmitter, typed payload, `setMaxListeners`) and replace `publish()`'s body with Pattern 2's per-listener dispatch loop.

## State of the Art

Not applicable in the "library/framework changed" sense — this is an internal-only refactor of code the team already wrote, using patterns already documented in `CLAUDE.md`. The one relevant "old → new" shift is internal to the codebase itself:

| Old Approach (current code) | New Approach (this phase) | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Services call `notificationService.notify()` / `broadcaster.publish()` directly, inline, at the point of the side effect | Services emit a domain event; subscribers (notification, audit-log, SSE) react independently | This phase (D-15) | Decouples the "what happened" (domain event) from "who cares" (subscribers) — a future 4th subscriber (e.g. Phase 14's health-probe consumer) can be added without touching `StackService`/`BackupService` again |
| `jobs/index.ts`'s manual per-job try/catch, duplicated 7 times | A `Job` abstraction + registry with per-kind lifecycle and health tracking | This phase (D-12/D-13/D-14) | Removes duplication; adds observability groundwork for Phase 14, with no new UI this phase |
| Repos instantiated ad hoc inside `application/index.ts` (`new StackRepository()`, `new SettingsRepository()`, etc.) | Singleton repos exported from `repositories/index.ts`, imported by `application/index.ts` | This phase (D-09) | Matches the pattern CLAUDE.md already documents ("Export singleton repository instances from `repositories/index.ts`") — the file simply doesn't exist yet |

**Deprecated/outdated:** Nothing external is deprecated. Internally, `jobs/update-checker.ts`'s `triggerUpdate()` method (`jobs/update-checker.ts:483-503`) is confirmed **dead code with zero callers** anywhere in `server/src/` or `server/test/` outside its own definition and its own test file [VERIFIED: `grep -rn "triggerUpdate" server/src` this session, only match is the method's own definition and internal `console.error` string]. It also contains an `as any` cast at line 501 (`} as any)`), a direct CLAUDE.md violation ("No unchecked casts"). This matches a Phase 02 review finding already recorded in STATE.md ("`update-checker.ts`'s `triggerUpdate()` is unreachable dead code with an unexplained `as any` cast") — confirmed still true this session and a strong, low-risk candidate for D-03's dead-code audit.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-07's port interfaces should be declared in `application/` (not `domain/`) since all four named infra dependencies (Docker, filesystem, restic, SMTP) are consumed only by `application/` services today, never by `domain/` code — D-07's own text says "application/domain" without picking one | Architecture Patterns, Pattern 1 | If the planner picks `domain/` instead, a stricter reading of "domain is pure, no I/O-adjacent types" could be violated by importing port interfaces that describe I/O operations (even if the interface itself has no I/O) into `domain/`; low risk either way since it's a placement choice, not a behavior change |
| A2 | `NotificationWatcher` should be treated as a `WatcherJob` with an intentionally-empty cron fallback, and `BackupScheduler` should satisfy only the registry's outer lifecycle contract while keeping its own internal per-stack task map — rather than inventing a third `Job` kind | Common Pitfalls, Pitfall 3 | If wrong, the planner may need a third kind (e.g. `EventOnlyJob`) or a different resolution; this is flagged as an Open Question below specifically so the user/planner decides rather than this research silently picking |
| A3 | The general ports-and-adapters (hexagonal) pattern — named interface in the calling layer, concrete adapter implementing it in `infrastructure/` — is the correct interpretation of D-07's "interface every infrastructure dependency," as opposed to e.g. an abstract base class or a factory-function type | Architecture Patterns, Pattern 1 | Low risk — this is standard, uncontroversial TypeScript DI practice and matches the Strategy pattern CLAUDE.md's own Design Patterns table already assigns to `infrastructure/` adapters |

## Open Questions

1. **Does D-07's infrastructure-port scope extend beyond the 4 named classes?**
   - What we know: D-07 names `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, and the SMTP client explicitly. The full `infrastructure/` directory has 10 files; the other 6 (`BrownfieldScanner`, `CertificateFilesystem`, `ComposeAnalyzer`, `ComposeRewriter`, `DockerodeClient`, `RegistryClient`, `VolumeMigrator` — 7 actually, see corrected count below) currently export only concrete classes with no port interface either, same as the 4 named ones.
   - What's unclear: D-07's phrasing ("interface every infrastructure dependency, even single-implementation ones") reads as a general principle illustrated by 4 examples, not a closed list — but CONTEXT.md's own scouting only names 4.
   - Recommendation: Planner should ask the user (or apply Claude's Discretion, since exact interface names were already delegated) whether the remaining 6-7 infra classes get ports in this phase or are deliberately deferred. Given D-06 ("full scope is committed to, no fallback"), the safer reading is probably "all of infrastructure/," but this doubles the port-authoring surface from 4 to ~10-11 files and should be an explicit wave-sizing decision, not an assumption.

2. **How should `BackupScheduler`'s per-stack dynamic cron tasks and `NotificationWatcher`'s cron-less event subscription fit the `IntervalJob`/`WatcherJob` taxonomy?**
   - What we know: Neither matches D-13's two definitions exactly (see Pitfall 3 for the full detail).
   - What's unclear: Whether the user wants a third kind, an exception carve-out, or a reinterpretation of one of the two existing kinds to stretch over these cases.
   - Recommendation: Surface this to the user during planning rather than silently forcing a fit — A2 in the Assumptions Log proposes a default resolution, but it's a genuine judgment call CONTEXT.md didn't anticipate.

3. **Where does the corrected repository count (8, not 6 or 7) change D-09's scope?**
   - What we know: CONTEXT.md's "Established Patterns" section says "the 6 existing repositories" but then lists 7 filenames, and misses `image-update-check-repository.ts` entirely — the actual count is **8** repository files [VERIFIED: `find server/src/repositories -name "*.ts"` this session]. `imageUpdateCheckRepository` is also imported directly by `routes/stacks.ts:17,76,178` — a route bypassing `application/` entirely, a second layering violation alongside D-10's notification-service one.
   - What's unclear: Whether fixing the `routes/stacks.ts` violation (routing the lookup through `StackService` instead) is in scope for this phase, since it wasn't named in D-10 or anywhere else in CONTEXT.md.
   - Recommendation: Given D-01's "full broader restructure... enforce and deepen" framing and this being the exact class of violation D-10 already targets, recommend folding it into the same layering wave — but flag it as a scope addition beyond CONTEXT.md's explicit list, not a silent inclusion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ | v24.20.0 (repo requires `>=22.0.0`, [VERIFIED: server/package.json engines field]) | — |
| `node-cron` | Job wrapper (D-12) | ✓ (installed) | `^3.0.3` declared, `4.6.0` latest on registry [VERIFIED: `npm view node-cron version`] | — (no upgrade in scope) |
| PostgreSQL (live DB) | `server/test/integration/*` (5 files), all repository code | ✗ in this sandboxed session | — | **No fallback for the integration-test verification step.** STATE.md documents a long-standing, reconfirmed host-level TCP-to-Docker-published-port block across nearly every prior phase (05.1, 06, 08, 09) — this phase's "integration tests pass unmodified" hard constraint will very likely need the same human-on-an-unrestricted-host verification pattern already established in this project |
| Docker daemon / `docker.sock` | `DockerExecutor`, `DockerodeClient`, `ProxyCertPoller` runtime behavior | Not probed this session (not needed for a code-reading research pass) | — | Existing jobs already degrade gracefully on Docker unavailability (e.g. `StatePoller.startEventStream()`'s retry-with-backoff at `jobs/state-poller.ts:131-140`) — no new fallback needed, this phase doesn't add new Docker call sites |

**Missing dependencies with no fallback:**
- Live PostgreSQL for integration-test verification — same class of gap this project has repeatedly deferred to a human/unrestricted-host pass (see STATE.md's "Server integration suite... cannot be verified to exit 0 in a network-restricted execution environment" and its many phase-specific echoes). The planner should budget a `checkpoint:human-verify` (or equivalent) step for the final "integration tests pass unmodified" gate rather than assuming an agent session can self-verify it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest [VERIFIED: server/vitest.config.ts — `projects` config with `unit` and `test/integration` named projects] |
| Config file | `server/vitest.config.ts` |
| Quick run command | `yarn workspace @docktor/server test:unit` (runs `--project unit` only — no live DB needed) |
| Full suite command | `yarn workspace @docktor/server test` (runs both projects; `test:integration` needs a live Postgres — see Environment Availability) |

### Phase Requirements → Test Map

Since this phase's only "requirement" is GitHub issue #16 scoped into D-01..D-18 (not REQ-IDs), the map below is keyed by decision ID against the concrete existing/needed test files [VERIFIED: `find server/test/unit -name "*.test.ts"` this session — 45 files enumerated].

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-09 | `repositories/index.ts` exports all 8 singletons | unit | new test file needed | ❌ Wave 0 — `repositories/` currently has **zero** unit test files (`server/test/unit/` has no `repositories/` subdirectory) |
| D-10 | `notification-service.ts` no longer imports `prisma` directly | unit | `vitest run --project unit test/unit/application/notification-service.test.ts` | ✅ exists, needs update — constructor gains a `UserRepository`/port dependency |
| D-07 | Each of the 4 (or more, see Open Question 1) infra classes has a named port interface, concrete class implements it | unit (type-level; a `satisfies`/`implements` compile check plus existing behavior tests) | `tsc --build` (CLAUDE.md mandate: "zero type errors allowed") + existing service test files | ✅ existing service tests cover behavior; the interface-conformance check is a compiler-level assertion, no new runtime test strictly required |
| D-12/D-13 | Job abstraction: `IntervalJob`/`WatcherJob` start/stop lifecycle | unit | new test file(s) needed for `job.ts`/`job-registry.ts`; existing `jobs/index.test.ts` needs substantial rewrite | ❌ Wave 0 for the new base classes; ✅ `jobs/index.test.ts` exists but tests the *current* try/catch shape, will need rewriting not just updating |
| D-14 | Registry tracks last-run/last-error/running-stopped per job | unit | new assertions in the rewritten `jobs/index.test.ts` (or its replacement) | ❌ Wave 0 |
| D-15/D-16/D-17 | Event bus: emit/subscribe, per-listener isolation (throwing subscriber doesn't block others) | unit | new test file needed, e.g. `test/unit/infrastructure/event-bus.test.ts` | ❌ Wave 0 — this is the single most important new test in the phase given Pitfall 1's live-proven failure mode |
| D-18 | `StateBroadcaster` (as bus subscriber) still publishes the exact same SSE event shapes at the exact same points | unit + existing integration | Existing `application/stack-service.test.ts`, `application/backup-service.test.ts` (mock the broadcaster/bus and assert `publish`/`emit` payload shape unchanged); no integration test currently exercises SSE directly [VERIFIED: `grep -n "SSE\|EventSource\|/api/events" server/test/integration/*.ts` this session returned no matches] | ✅ unit coverage exists and should be extended; ⚠️ **no integration test currently protects SSE behavior at all** — D-18's "preserve exact observable SSE events" constraint is validated only by the existing unit tests' payload-shape assertions plus (per Phase 08's STATE.md notes) prior manual/UAT verification, not by an automated integration test |

### Sampling Rate
- **Per task commit:** `yarn workspace @docktor/server test:unit`
- **Per wave merge:** `yarn workspace @docktor/server test` (requires live Postgres — see Environment Availability gap)
- **Phase gate:** Full suite green before `/gsd-verify-work`, with the integration-test run likely needing a human-on-unrestricted-host pass per this project's established pattern

### Wave 0 Gaps
- [ ] `test/unit/infrastructure/event-bus.test.ts` — covers D-15/D-16/D-17, specifically the per-listener isolation guarantee (Pitfall 1)
- [ ] `test/unit/jobs/job.test.ts` (or equivalent) — covers D-12/D-13's base `Job` lifecycle contract
- [ ] `test/unit/jobs/job-registry.test.ts` (or a rewritten `jobs/index.test.ts`) — covers D-14's health tracking and the stop-isolation gap (Pitfall 4)
- [ ] `test/unit/repositories/` directory — currently doesn't exist; D-09's `repositories/index.ts` and D-10's new `UserRepository` are the first repository-layer code in this codebase with no existing test precedent to follow, so the planner should establish the pattern (likely mirroring `application/*.test.ts`'s existing mock-Prisma-client style) rather than assume one exists

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged by this phase — `lib/auth.ts`/`lib/auth-middleware.ts` are not touched by any of D-01..D-18 |
| V3 Session Management | no | Unchanged |
| V4 Access Control | no | `requireAuth` preHandlers on routes are unchanged; this phase only reorganizes what happens *after* a request passes auth |
| V5 Input Validation | no | No Zod schema in `@docktor/shared` changes — the phase boundary explicitly forbids any API contract change |
| V6 Cryptography | no | `lib/crypto.ts` (AES-256-GCM for SMTP/restic passwords) is not touched; the new `SmtpClient` port wraps `nodemailer.createTransport()`'s existing usage, not the credential storage |
| V1 Architecture, Design and Threat Modeling | **yes** | This is the one ASVS category genuinely in scope: V1.1's "verify a secure software development lifecycle" intent maps onto D-01's layering enforcement, and V1.5's "verify all trust boundaries are defined" maps onto D-07's port-interface work — but these are process/structure controls, not authn/authz/crypto controls |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A throwing event-bus subscriber silently suppressing a security-relevant audit log write (the `StackEvent` audit trail, D-15 item 2) | Repudiation | D-17's per-listener isolation (Pitfall 1's fix) directly mitigates this — without it, an SMTP outage could silently stop audit-trail writes for every stack event, not just notifications, since a naive `EventEmitter.emit()` would abort the whole dispatch |
| A new `SmtpClient` port/adapter (D-07) accidentally logging plaintext SMTP credentials during the refactor (e.g. a debug `console.log` of the config object passed to `createTransport()`) | Information Disclosure | None currently present — `application/notification-service.ts`'s existing `createTransport()` call (line 111-118) does not log the config object; the new adapter should preserve this discipline. No SMTP password appears in any `console.log` call in the current file [VERIFIED: `application/notification-service.ts` read in full this session — the `console.log` calls at lines 40, 49, 51, 55, 62, 72, 78, 91 log only `type`, `stackId`, `subject`, toggle values, and notification IDs, never `smtpConfig`] |
| A future subscriber added to the event bus without going through the same non-throwing-to-caller discipline the two current publish choke points already have | Denial of Service (of the emitting operation) | The existing pattern (`await repo write; try { publish } catch`) must be preserved for every migrated call site — a bus `emit()` that could throw synchronously to its caller would risk stranding a stack in a transitional status again, the exact bug class Phase 05.1-02 fixed |

## Sources

### Primary (HIGH confidence — direct codebase reads this session)
- `server/src/application/index.ts` (full read) — composition-root wiring, every service/repo instantiation site
- `server/src/application/stack-service.ts`, `application/backup-service.ts`, `application/notification-service.ts`, `application/proxy-service.ts` (targeted reads) — transitionStatus/writeStackStatus choke points, notify() call sites, Prisma violation, proxy idempotency location
- `server/src/domain/stack-status-machine.ts` (full read) — confirms state machine is pure validation only, does not itself call StateBroadcaster
- `server/src/infrastructure/*.ts` (directory listing + targeted reads of docker-executor.ts, stack-filesystem.ts, dockerode-client.ts) — confirmed no existing port interfaces, 10-file inventory
- `server/src/jobs/*.ts` (full reads of all 7 job files + index.ts) — cron expressions, start/stop shapes, kind classification
- `server/src/lib/state-broadcaster.ts` (full read) — existing EventEmitter pattern, StateEvent union, setMaxListeners precedent
- `server/src/repositories/stack-event-repository.ts`, `repositories/image-update-check-repository.ts` usage sites — StackEvent write path, routes/stacks.ts layering violation
- `server/src/routes/stacks.ts`, `routes/events.ts`, `app.ts` (targeted reads) — SSE endpoint wiring, jobs skipped in NODE_ENV=test, routes/stacks.ts direct repo import
- `server/prisma/schema/stack-event.prisma` (via generated class.ts inline schema) — StackEventType enum values quoted verbatim
- `server/test/integration/*.test.ts` (describe/it names via grep) — 5 files, no SSE coverage confirmed
- `server/test/unit/**/*.test.ts` (directory listing) — 45 files, confirms zero repositories/ test coverage
- `server/vitest.config.ts`, `server/tsconfig.json`, `server/package.json` (full/targeted reads) — test framework config, TS strict settings, dependency versions, engines field
- Live probe: `node test-emitter.mjs` executed this session — falsifies "EventEmitter.emit() isolates listeners"
- `.planning/phases/10-backend-architecture-refactor/10-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `/home/raphael/workspace/docktor/CLAUDE.md` (full reads, required reading)

### Secondary (MEDIUM confidence)
- `npm view node-cron version` / `npm view node-cron engines` — registry check, confirms 4.6.0 latest vs. 3.0.3 installed (not acted on, D-12 keeps current version)

### Tertiary (LOW confidence)
- None — this phase required no external/web research; all findings are codebase-derived or live-probe-verified

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies, all versions read directly from `server/package.json` and cross-checked against the npm registry
- Architecture Patterns: HIGH — every pattern is grounded in an actual file:line read this session, with verbatim quotes for load-bearing claims
- Common Pitfalls: HIGH — Pitfall 1 (the highest-risk finding in this document) was falsified live via an executable probe, not inferred from documentation or training data
- Job kind classification (D-13): MEDIUM — the 5 jobs that fit D-13's taxonomy are HIGH confidence (direct code reads); the 2 that don't fit (NotificationWatcher, BackupScheduler) are a genuine open question requiring a planning-time or user decision, not a research gap

**Research date:** 2026-09-22
**Valid until:** No external expiry — this research is a snapshot of the current codebase state; it becomes stale only if the codebase changes before planning happens (unlikely within a single session-to-session gap), not on a calendar timer

