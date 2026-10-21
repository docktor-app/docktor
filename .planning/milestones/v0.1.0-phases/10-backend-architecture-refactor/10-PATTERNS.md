# Phase 10: Backend Architecture Refactor - Pattern Map

**Mapped:** 2026-09-22
**Files analyzed:** 14 (new) + 6 (modified)
**Analogs found:** 20 / 20

This phase is a pure internal restructuring of `server/src/` — there is no client-side or route-contract work. Every new file's closest analog is an existing file in the *same* layer that already follows (or half-follows) the target pattern; the job here is to extend an established local convention, not import a foreign one.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `repositories/index.ts` (NEW, D-09) | config/composition-root | CRUD (wiring) | `application/index.ts` (composition-root pattern, one layer up) | role-match |
| `repositories/user-repository.ts` (NEW, D-10) | model/repository | CRUD | `repositories/stack-repository.ts` | exact |
| `domain/backup-retention-policy.ts` (NEW, D-08) | utility/domain | transform (pure) | `domain/stack-status-machine.ts` | exact |
| `domain/proxy-idempotency.ts` (NEW, D-08) | utility/domain | transform (pure) | `domain/stack-status-machine.ts` | exact |
| `domain/events.ts` (NEW, D-15/D-16) | model/domain | event-driven (type defs) | `lib/state-broadcaster.ts` (StateEvent union) | exact |
| `infrastructure/event-bus.ts` (NEW, D-16/D-17) | service/infrastructure | event-driven, pub-sub | `lib/state-broadcaster.ts` (StateBroadcaster class) | role-match (extends the pattern with isolation) |
| `infrastructure/smtp-client.ts` (NEW, D-07) | service/infrastructure | request-response (adapter) | `infrastructure/stack-filesystem.ts` (thin wrapper class around Node/3rd-party API) | role-match |
| Port interfaces for `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, `SmtpClient` (NEW, D-07) | interface/application | request-response | `application/stack-service.ts`'s `StackEventReadRepo` interface (lines 18-26) — existing "read port declared in the consuming layer" precedent | exact |
| `jobs/job.ts` (NEW, D-12/D-13) | model/utility | event-driven + batch (lifecycle contract) | `jobs/disk-checker.ts` + `jobs/state-poller.ts` (the two concrete shapes IntervalJob/WatcherJob must generalize) | role-match |
| `jobs/job-registry.ts` (NEW, D-14) | service | event-driven, batch | `jobs/index.ts` (`startJob()` wrapper + `startJobs()`/`stopJobs()`) | exact (this file is being replaced, not just imitated) |
| `application/notification-service.ts` (MODIFIED, D-10) | service | request-response | itself — gains a `UserRepository`/port dependency, drops `prisma` import | n/a (modify in place) |
| `application/stack-service.ts` (MODIFIED, D-15 item 3) | service | event-driven | itself — `transitionStatus()`/`publishConfigChanged()` swap `broadcaster.publish` for `eventBus.emit` | n/a (modify in place) |
| `application/backup-service.ts` (MODIFIED, D-08/D-15) | service | event-driven, CRUD | itself — `writeStackStatus()` swaps to event bus; `parseRetentionPolicy()` moves to `domain/backup-retention-policy.ts` | n/a (modify in place) |
| `application/proxy-service.ts` (MODIFIED, D-08) | service | CRUD | itself — inline idempotency checks extracted to `domain/proxy-idempotency.ts` | n/a (modify in place) |
| `routes/stacks.ts` (MODIFIED, Open Question 3) | route | request-response | itself — replace direct `imageUpdateCheckRepository` import with a `StackService` call | n/a (modify in place) |
| `lib/state-broadcaster.ts` (MODIFIED, D-15 item 3/D-18) | service | pub-sub | itself — becomes a subscriber on the new bus rather than being called inline; `publish()`/`subscribe()` public shape unchanged | n/a (modify in place) |
| Audit-log subscriber module (NEW, D-15 item 2, name at planner's discretion, likely `application/stack-event-subscriber.ts` or inline in `application/index.ts`) | service (event subscriber) | event-driven | `jobs/notification-watcher.ts` (existing "subscribe to StateBroadcaster and react" shape) | role-match |
| `src/services/` (DELETE, D-11) | n/a | n/a | n/a — deletion, no analog needed | n/a |
| `test/unit/infrastructure/event-bus.test.ts` (NEW) | test | event-driven | `test/unit/jobs/notification-watcher.test.ts` (nearest existing pub-sub-consumer test) + no direct precedent for the isolation guarantee itself | partial |
| `test/unit/repositories/*.test.ts` (NEW, first repo tests) | test | CRUD | `test/unit/application/*.test.ts` (mock-Prisma-client style, nearest available convention) | partial |
| `test/unit/jobs/job.test.ts`, `job-registry.test.ts` (NEW) | test | event-driven, batch | `test/unit/jobs/index.test.ts` (being rewritten, but the mocking style for job lifecycle carries over) | role-match |

## Pattern Assignments

### `repositories/index.ts` (config, composition-root)

**Analog:** `server/src/application/index.ts`

**Composition-root pattern** (lines 1-30 of `application/index.ts`):
```typescript
import {StackRepository} from "../repositories/stack-repository.js";
import {StackFilesystem} from "../infrastructure/stack-filesystem.js";
import {DockerExecutor} from "../infrastructure/docker-executor.js";
import {stackEventRepository} from "../repositories/stack-event-repository.js";
import {StackService} from "./stack-service.js";
import {SettingsRepository} from "../repositories/settings-repository.js";
import {SettingsService} from "./settings-service.js";
// ... more repo/service imports ...

const repo = new StackRepository();
const fs = new StackFilesystem();
const docker = new DockerExecutor();

export const settingsRepository = new SettingsRepository();
export const settingsService = new SettingsService(settingsRepository);

export const stackService = new StackService(repo, fs, docker, stackEventRepository, stateEventBroadcaster, settingsService);
```
`stackEventRepository` (imported as a ready-made singleton, `repositories/stack-event-repository.ts`) is the one existing repo that already exports a singleton instance rather than a class — that file (not `application/index.ts`) is the concrete precedent for what each repo file itself should export once `repositories/index.ts` re-exports them: `export const stackEventRepository = new StackEventRepository()` at that file's bottom. `repositories/index.ts` should mirror `application/index.ts`'s **file shape** (plain module-level `export const` singletons, imported dependency-first, no factory function, no DI container) applied one layer down — the repositories generally have no constructor dependencies today, so the file is mostly a flat re-export/instantiate list. `application/index.ts` is then edited to `import {stackRepository, settingsRepository, ...} from "../repositories/index.js"` instead of instantiating repos itself.

---

### `repositories/user-repository.ts` (repository, CRUD) — D-10

**Analog:** `server/src/repositories/stack-repository.ts`

**Imports + class shape pattern** (lines 1-18):
```typescript
import {prisma} from "../lib/db.js";
import {NotFoundError} from "../lib/errors.js";
import type {StackStatus} from "../generated/prisma/enums.js";

export class StackRepository {
    async findById(id: string) {
        return prisma.stack.findUnique({where: {id}});
    }

    async findByIdOrThrow(id: string) {
        const stack = await prisma.stack.findUnique({where: {id}});
        if (!stack) {
            throw new NotFoundError(`Stack "${id}" not found`);
        }
        return stack;
    }
    // ...
}
```
`UserRepository` needs exactly one method to replace `application/notification-service.ts:76`'s `prisma.user.findMany({select: {email: true}})` — e.g. `findAllEmails(): Promise<string[]>` or `findAll(): Promise<{email: string}[]>`, following the same "thin Prisma wrapper, no business logic" shape as every method above. No `NotFoundError` needed here (`findMany` never throws on empty).

**Error handling pattern:** `NotFoundError` from `lib/errors.ts` is thrown by `*OrThrow` methods only — `UserRepository` likely has no `*OrThrow` variant since notification-service only ever needs the full list, not a single lookup.

---

### `domain/backup-retention-policy.ts` and `domain/proxy-idempotency.ts` (domain, transform) — D-08

**Analog:** `server/src/domain/stack-status-machine.ts` (full file, 54 lines — read in full, reproduced above in codebase reads)

**Core pure-function pattern** (lines 45-53):
```typescript
export function canTransition(current: StackStatus, action: Action): boolean {
    return TRANSITIONS[action].includes(current);
}

export function assertTransition(current: StackStatus, action: Action): void {
    if (!canTransition(current, action)) {
        throw new TransitionError(current, action, TRANSITIONS[action]);
    }
}
```
Pattern to copy: pure functions (no I/O, no Prisma, no Fastify), a custom `Error` subclass local to the domain module when the failure needs to carry structured context (`TransitionError` carries `currentStatus`/`action`/`allowedFrom`), and `as const` typed lookup tables (`TRANSITIONS`, `ACTION_TARGET`) instead of switch statements. `backup-retention-policy.ts` extracts `application/backup-service.ts`'s existing `parseRetentionPolicy()` (find via `grep -n "parseRetentionPolicy" application/backup-service.ts`, body shown in Code Examples below) verbatim, just relocated and exported as a standalone function taking/returning the same `RetentionPolicy` type currently imported from `infrastructure/restic-executor.ts`. `proxy-idempotency.ts` extracts the inline existing-row idempotency checks currently living in `application/proxy-service.ts` (grep for the checks around `ConflictError`/existing-domain lookups in that file) into pure predicate functions the service then calls.

**Existing body to relocate** (`application/backup-service.ts`, `parseRetentionPolicy`):
```typescript
private parseRetentionPolicy(retentionJson: string | null): RetentionPolicy {
    if (retentionJson) {
        try {
            return JSON.parse(retentionJson) as RetentionPolicy
        } catch {
            // Fall through to defaults
        }
    }
    return {keepDaily: 7, keepWeekly: 4, keepMonthly: 12}
}
```

---

### `domain/events.ts` (domain, event-driven type defs) — D-15/D-16

**Analog:** `server/src/lib/state-broadcaster.ts` (lines 1-77, the discriminated-union `StateEvent` type)

**Discriminated-union event pattern** (lines 3-76):
```typescript
export interface StackStatusEvent {
    type: "stack_status"
    stackId: string
    stackStatus: string
}
// ... 6 more event interfaces ...

export type StateEvent =
    | ContainerStateEvent
    | StackStatusEvent
    | ConfigChangedEvent
    | ConfigErrorEvent
    | UpdateAvailableEvent
    | NotificationCreatedEvent
    | ProxyCertStatusEvent
```
`domain/events.ts` should define the new `DomainEvent` union the same way — one `interface` per event kind with a literal `type` discriminant, unioned into a single exported type. Per the event-bus's generic `EventBus<TEventMap extends Record<string, unknown>>` shape (see Code Examples below, from RESEARCH.md's verified pattern), this may instead be expressed as a `DomainEventMap` keyed-object type (`{"stack.status_changed": {...}, "stack.config_changed": {...}}`) rather than a union — planner's discretion per CONTEXT.md, but the per-event-shape content (what fields each event carries) should mirror `StateEvent`'s existing fields for the events that migrate 1:1 (`stack_status`→status-changed, `config_changed`, `config_error`, `update_available`).

---

### `infrastructure/event-bus.ts` (infrastructure, pub-sub with isolation) — D-16/D-17

**Analog:** `server/src/lib/state-broadcaster.ts` (class shape) — **do not copy `publish()`'s body**, only the class shape.

**Structural pattern to copy** (lines 78-90):
```typescript
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
**Critical deviation required (RESEARCH.md Pitfall 1, live-verified this session):** `this.emitter.emit()` does NOT isolate listeners — a throwing listener aborts the whole dispatch and any listener registered after it never runs. The new bus's `emit()` must iterate `rawListeners(event)` manually with a per-listener try/catch instead of delegating to `EventEmitter.emit()`. RESEARCH.md's `InMemoryEventBus` code example (Architecture Patterns, Pattern 2) is the concrete target implementation — copy that dispatch loop, not `StateBroadcaster.publish()`'s naive pass-through. Keep `setMaxListeners(100)` (same precedent, more subscribers per event expected).

**Error handling pattern:** each listener wrapped individually:
```typescript
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
```

---

### `infrastructure/smtp-client.ts` (infrastructure adapter) — D-07

**Analog:** `server/src/infrastructure/stack-filesystem.ts` (full file, 46 lines)

**Thin-wrapper class pattern** (lines 1-13):
```typescript
import fs from "node:fs/promises";
import {getComposePath, getEnvPath, getStackPath,} from "../lib/stacks-dir.js";

export class StackFilesystem {
    getStackDirectory(stackId: string): string {
        return getStackPath(stackId);
    }

    async createDirectory(stackId: string): Promise<string> {
        const hostPath = getStackPath(stackId);
        await fs.mkdir(hostPath, {recursive: true});
        return hostPath;
    }
    // ...
}
```
`SmtpClient` wraps `nodemailer.createTransport()`/`sendMail()`, currently inlined in `application/notification-service.ts`'s private `createTransport()` method (lines 111-119) and its two call sites (`notify()` line 82-84, `testSmtp()` line 98). Extract those into `infrastructure/smtp-client.ts` implementing a new `SmtpClientPort` interface (declared in `application/`, per D-07 — see Port Interfaces section below), with methods like `sendMail(config: SmtpConfig, message: {to: string; subject: string; text: string}): Promise<void>`. `NotificationService` then depends on the port type, not on `nodemailer` directly.

**Security note (from RESEARCH.md):** the existing `createTransport()` call never logs the config object — preserve this; do not add a debug `console.log` of SMTP credentials in the new adapter.

---

### Port interfaces for D-07 (`DockerExecutor`, `StackFilesystem`, `ResticExecutor`, `SmtpClient`)

**Analog:** `server/src/application/stack-service.ts` lines 18-26 — the existing `StackEventReadRepo` interface, the one place in the codebase that already does exactly what D-07 asks for a repository dependency (not yet for an infra one).

**Pattern to copy** (lines 16-26):
```typescript
/**
 * Read port for the StackEvent audit trail. Declared here rather than
 * importing the concrete StackEventRepository, so this service stays
 * unit-testable with a plain object and the dependency arrow keeps
 * pointing inward (application depends on a port, not on repositories/).
 */
export interface StackEventReadRepo {
    findRecentByStack(stackId: string, limit?: number): Promise<Array<{
        id: string;
        type: StackEventType;
        message: string | null;
        payload: string | null;
        createdAt: Date;
    }>>;
}
```
Apply the identical shape to `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, `SmtpClient`: a named interface (`DockerExecutorPort`, `StackFilesystemPort`, etc.) declared in `application/` (see RESEARCH.md Assumption A1 — `application/`, not `domain/`, since all four are only consumed by `application/` services today), doc-commented with the same "why a port, not the concrete class" rationale, listing every method the concrete class's current callers actually use. The concrete classes (`infrastructure/stack-filesystem.ts` etc.) then gain `implements StackFilesystemPort`. Note the codebase's existing halfway-there convention using structural typing instead of named interfaces — `application/proxy-service.ts` line 38: `fs: Pick<StackFilesystem, "readCompose" | "writeCompose" | "createDirectory">` — D-07 explicitly asks to replace this `Pick<>` style with named interfaces for the four listed classes.

---

### `jobs/job.ts` (job lifecycle base contract) — D-12/D-13

**Analog A (IntervalJob shape):** `server/src/jobs/disk-checker.ts` (full file)
**Analog B (WatcherJob shape):** `server/src/jobs/state-poller.ts` (full file, `start()`/`stop()` at lines 103-124)

**IntervalJob shape to generalize** (`disk-checker.ts` lines 14-36):
```typescript
export class DiskChecker {
    private cronTask: cron.ScheduledTask | null = null

    start(): void {
        void this.check()
        this.cronTask = cron.schedule("0 0 * * *", () => {
            void this.check()
        })
    }

    stop(): void {
        this.cronTask?.stop()
        this.cronTask = null
    }
}
```

**WatcherJob shape to generalize** (`state-poller.ts` lines 103-124):
```typescript
async start(): Promise<void> {
    await this.startEventStream()
    // Run reconcile every 60 seconds as a safety net
    this.cronTask = cron.schedule("*/60 * * * * *", async () => {
        try {
            await this.reconcile()
        } catch (err) {
            console.error("[StatePoller] reconcile error:", err)
        }
    })
}

stop(): void {
    if (this.abortController) {
        this.abortController.abort()
        this.abortController = null
    }
    if (this.cronTask) {
        this.cronTask.stop()
        this.cronTask = null
    }
}
```
`jobs/job.ts` should define a common `Job` interface (`name: string; start(): Promise<void> | void; stop(): Promise<void> | void`) plus two abstract/base helper shapes (`IntervalJob`, `WatcherJob`) that existing job classes extend or structurally satisfy — both existing classes already independently implement `cron.ScheduledTask | null` + `start()`/`stop()`, so the base class mainly needs to factor out the `cronTask` field and its start/stop boilerplate. **Flag from RESEARCH.md Pitfall 3:** `notification-watcher.ts` (zero cron, pure event-driven) and `backup-scheduler.ts` (dynamic per-stack `Map<string, cron.ScheduledTask>`) do not cleanly fit either kind — RESEARCH.md's recommended resolution (Assumption A2) is treating `NotificationWatcher` as a `WatcherJob` with an always-empty cron fallback, and letting `BackupScheduler` satisfy only the registry's outer lifecycle contract while keeping its internal per-stack task map untouched. This should be confirmed as a planning decision, not silently assumed.

---

### `jobs/job-registry.ts` (job registry, replaces jobs/index.ts) — D-14

**Analog:** `server/src/jobs/index.ts` (full file, 43 lines — being replaced, not just imitated)

**Existing isolation pattern to extend** (lines 9-18):
```typescript
// A job that fails to start (e.g. the DB isn't reachable yet on a cold
// docker-compose start) must not prevent the other jobs — or the HTTP
// server itself — from coming up, so each job's startup is isolated here.
async function startJob(name: string, start: () => Promise<void> | void): Promise<void> {
    try {
        await start()
    } catch (err) {
        console.error(`[Jobs] ${name} failed to start:`, err)
    }
}
```
**Known gap to close (RESEARCH.md Pitfall 4):** `stopJobs()` (lines 34-42) has NO try/catch — calls `.stop()` directly on each job with no isolation, unlike `startJobs()`. The new registry must apply the same per-job try/catch to `stop()` as `start()` already has, plus track health state (`lastRun`, `lastError`, `running`/`stopped` status) per job — this is new surface with no existing precedent in the codebase; model it as a plain `Map<string, JobHealth>` keyed by job name, updated inside the same try/catch wrappers.

**Existing registration list to preserve as the "which jobs" contract** (lines 20-32):
```typescript
export async function startJobs(): Promise<void> {
    const {backupService} = await import("../application/index.js")
    await startJob("BackupRecovery", () => backupService.recoverInProgressBackups())

    await startJob("StatePoller", () => statePoller.start())
    await startJob("FileWatcher", () => fileWatcher.start())
    await startJob("UpdateChecker", () => updateChecker.start())
    await startJob("DiskChecker", () => diskChecker.start())
    await startJob("NotificationWatcher", () => notificationWatcher.start())
    await startJob("BackupScheduler", () => backupScheduler.start())
    await startJob("ProxyCertPoller", () => proxyCertPoller.start())
}
```
Note `"BackupRecovery"` is registered via `startJob()` but is not itself a `Job`-interface object (it's a one-shot async call) — the new registry needs to either keep this as a special pre-start hook outside the `Job` abstraction, or decide it doesn't belong in the registry's health tracking at all (recommend the former — flag as a planning note, not silently folded into the Job list).

---

### Event-emission changes to `application/stack-service.ts` and `application/backup-service.ts` (D-15 item 3, D-18)

**Analog:** the files' own existing choke points — the change is in-place, not a new-file pattern.

**Existing single choke point to preserve exactly (ordering + publisher-side try/catch)** (`stack-service.ts`, private `transitionStatus`):
```typescript
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
D-15 item 3 replaces `this.broadcaster.publish(...)` with `this.eventBus.emit("stack.status_changed", {...})` — the `await repo write; try { emit } catch` ordering must be preserved exactly (DB write completes before any broadcast). `StateBroadcaster` then subscribes to this same event and republishes to SSE in its current shape, preserving D-18's "exact same observable SSE events" constraint. The identical pattern exists in `application/backup-service.ts`'s `writeStackStatus()` (same shape, same try/catch-around-publish convention, doc-commented as mirroring `StackService.transitionStatus()`) — both call sites migrate identically.

---

### Audit-log subscriber (D-15 item 2, new file)

**Analog:** `server/src/jobs/notification-watcher.ts` (full file) — nearest existing "subscribe and react" shape, even though it's a job not an application-layer subscriber.

**Subscribe/react pattern to copy** (lines 12-27):
```typescript
export class NotificationWatcher {
    private unsubscribe: (() => void) | null = null

    constructor(
        private readonly notificationService: NotificationWatcherNotificationService,
        private readonly broadcaster: NotificationWatcherBroadcaster,
    ) {}

    start(): void {
        this.unsubscribe = this.broadcaster.subscribe((event: StateEvent) => {
            void this.handleStateEvent(event)
        })
        console.log("[NotificationWatcher] Started - subscribed to StateBroadcaster")
    }

    stop(): void {
        this.unsubscribe?.()
        this.unsubscribe = null
    }
}
```
The new audit-log subscriber (writing `StackEvent` rows via `stack-event-repository.ts` on `config_changed`/`config_error`/`update_available` events) should follow this same constructor-injected-dependency + `subscribe()`-returns-unsubscribe-function shape, wired in `application/index.ts` alongside the other composition-root singletons. Since D-17 requires per-listener isolation to live in the bus itself (not in each subscriber), this subscriber's own handler body does not need its own try/catch wrapper — the bus already isolates it — but should still log-and-swallow write failures if `stackEventRepository.createEvent()` itself might throw down the line to keep with `NotFoundError`/`AppError` handling conventions.

---

### `routes/stacks.ts` layering fix (Open Question 3, folded into D-10's wave)

**Analog:** the route file's own existing service-call pattern for comparison — find the surrounding handlers in `routes/stacks.ts` that already call `stackService.*` rather than a repository directly, and replace the 3 `imageUpdateCheckRepository` call sites (lines 17, 76, 178 per RESEARCH.md) with an equivalent `stackService` method, adding that method to `StackService` if it doesn't exist yet. This mirrors D-10's `notification-service.ts` Prisma-violation fix — both are "route/service reaching past its layer into a repository directly," fixed the same way (add or use an existing application-service method).

## Shared Patterns

### Repository pattern (CRUD data access)
**Source:** `repositories/stack-repository.ts` (all 8 existing repos follow this)
**Apply to:** `repositories/user-repository.ts`
```typescript
import {prisma} from "../lib/db.js";
import {NotFoundError} from "../lib/errors.js";

export class XRepository {
    async findById(id: string) { return prisma.x.findUnique({where: {id}}); }
    async findByIdOrThrow(id: string) {
        const row = await prisma.x.findUnique({where: {id}});
        if (!row) throw new NotFoundError(`X "${id}" not found`);
        return row;
    }
}
```

### Error handling (typed hierarchy, unchanged by this phase)
**Source:** `lib/errors.ts` (`AppError`, `NotFoundError`, `ConflictError`, `BadRequestError`)
**Apply to:** all new/modified application/domain/repository files — reuse as-is, no new error types needed for D-01..D-18 except the domain-local ones already established (`TransitionError` precedent for any new domain invariant errors in `backup-retention-policy.ts`/`proxy-idempotency.ts`, if needed).

### Publisher-side non-throwing guard (preserve across the event-bus migration)
**Source:** `application/stack-service.ts` `transitionStatus()`, `application/backup-service.ts` `writeStackStatus()`
**Apply to:** every call site migrating from `broadcaster.publish()` to `eventBus.emit()` — wrap the emit call in try/catch at the call site (defense in depth, complementary to the bus's own D-17 per-listener isolation, per RESEARCH.md Pitfall 2's "these are complementary, not redundant" finding).

### Constructor dependency injection via `Pick<>` or named interface
**Source:** `application/proxy-service.ts` constructor (lines 34-41)
**Apply to:** every new/modified application service constructor — D-07 upgrades the `Pick<ConcreteClass, "...">` style to named port interfaces for the 4 listed infra classes, but the DI-via-constructor-parameters convention itself is unchanged.

## No Analog Found

None — every file in this phase's scope has at least a role-match analog within the same layer. This is expected for a pure internal-restructuring phase where the target patterns (Repository, Observer, ports-and-adapters) are already partially established in the codebase; the phase's job is to generalize/complete them, not introduce a new pattern family.

## Metadata

**Analog search scope:** `server/src/{application,domain,repositories,infrastructure,jobs,lib}/`, `server/test/unit/{application,jobs}/`
**Files scanned:** `application/index.ts`, `application/stack-service.ts`, `application/backup-service.ts`, `application/proxy-service.ts`, `application/notification-service.ts`, `repositories/stack-repository.ts`, `repositories/*` (listing), `infrastructure/stack-filesystem.ts`, `infrastructure/*` (listing), `jobs/index.ts`, `jobs/disk-checker.ts`, `jobs/state-poller.ts`, `jobs/notification-watcher.ts`, `jobs/backup-scheduler.ts` (partial), `domain/stack-status-machine.ts`, `lib/state-broadcaster.ts`, `test/unit/**` (listing)
**Pattern extraction date:** 2026-09-22
