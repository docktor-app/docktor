import type {EventBusPort} from "../application/ports/event-bus-port.js"
import type {ProbeObservation, ProbeTransportPort} from "../application/ports/probe-transport-port.js"
import type {ProbeOwnershipWriter} from "../application/probed-service-registry.js"
import type {DomainEventMap, ServiceProbeClearedEvent} from "../domain/events.js"
import {PROBE_DEADLINE_MARGIN_MS, PROBE_INTERVAL_MS, probeStaggerOffsetMs} from "../domain/health-probe.js"
import {isTransitionalStatus} from "../domain/stack-state-derivation.js"
import {domainEventBus} from "../infrastructure/event-bus.js"
import type {HealthProbeSpec} from "../lib/compose-health-probe.js"
import {parseHealthProbes} from "../lib/compose-health-probe.js"
import {DeadlineExceededError, withDeadline} from "../lib/with-deadline.js"
import type {Job, JobHealthReporter} from "./job.js"
import {IntervalJob} from "./job.js"

/** D-06: no more than this many probes are in flight at once (T-14-51). */
export const PROBE_CONCURRENCY = 8

/**
 * Each start() pre-step (stale attachment sweep, ownership seeding) is bounded
 * at this, so a stalled Docker daemon or database never blocks
 * JobRegistry.startAll() or the server's listen() (RESEARCH Finding 7).
 */
export const START_STEP_TIMEOUT_MS = 30_000

/**
 * A tick still running after this no longer suppresses later ticks. Far above
 * the longest tick the per-call and per-probe bounds allow, so it only fires on
 * a hang outside Docker, such as the database.
 */
export const MAX_TICK_DURATION_MS = 5 * 60_000

export interface ProbeJobService {
    serviceName: string
    containerId: string | null
    containerState: string | null
}

export interface ProbeJobStack {
    id: string
    status: string
    services: ReadonlyArray<ProbeJobService>
}

/** Read-only on purpose: the job reads stacks and emits events, and writes nothing. */
export interface HealthProbeJobStore {
    listStacks(): Promise<ReadonlyArray<ProbeJobStack>>
}

export interface HealthProbeJobDeps {
    store: HealthProbeJobStore
    readCompose: (stackId: string) => Promise<string>
    transport: ProbeTransportPort
    /** D-07: told which services each stack's compose file gives a probe, so Docker stops owning their health. */
    ownership: ProbeOwnershipWriter
    bus: Pick<EventBusPort, "emit">
    now: () => number
}

interface ParsedCompose {
    content: string
    /** The probes to act on: the last file content that parsed (empty before any did). */
    probes: ReadonlyMap<string, HealthProbeSpec>
}

/** A scheduled probe; the ids are kept so a cleared event can be emitted without the stack row. */
interface ScheduleEntry {
    stackId: string
    serviceName: string
    nextDueAt: number
}

interface DueProbe {
    stackId: string
    serviceName: string
    containerId: string
    spec: HealthProbeSpec
    key: string
}

/**
 * Producer of HTTP probe results (#23, D-06). Ticks every 5 seconds and probes
 * each probed, running service once every 30 seconds, offset by a per-service
 * stagger so a stack's probes do not all fire together. Probe configuration is
 * read from each stack's compose file on every tick (D-01), so a compose edit
 * takes effect without a redeploy.
 *
 * Lifecycle: a service that stops being probed (block removed, service or stack
 * gone, container no longer running) gets one `service.probe_cleared` so its
 * health never stays stale. A broken block is probed as a failure without any
 * request (fail-closed, D-08), and a compose file that stops parsing keeps its
 * last good probes. A stack in a transitional status is left alone entirely.
 *
 * Ownership (D-07): every tick, and once in start() before the schedule begins,
 * the job tells the ownership registry which services of each stack carry a
 * probe block (valid or not), so StatePoller and the catch-up leave their
 * health to the probe. Nothing is probed at start.
 *
 * Liveness (CR-01): nothing a Docker daemon does can stop probing. Every
 * Docker call in the transport is bounded (PROBE_DOCKER_CALL_TIMEOUT_MS), each
 * probe as a whole is bounded at its timeout plus PROBE_DEADLINE_MARGIN_MS and
 * a miss is recorded as a failed probe (D-08), each start() pre-step is
 * bounded at START_STEP_TIMEOUT_MS, and a tick still in flight after
 * MAX_TICK_DURATION_MS is logged, reported and replaced by the next one.
 *
 * The job does I/O and emits events; deciding what a result means and
 * persisting it belongs to ServiceHealthService (Phase 10 pattern).
 */
export class HealthProbeJob extends IntervalJob {
    readonly name = "HealthProbeJob"
    protected readonly cronExpression = "*/5 * * * * *"
    // The first probes are staggered over the first 30 seconds anyway.
    protected readonly runImmediatelyOnStart = false

    // The tick in progress, if any. An object so a stale tick that settles late
    // can tell the marker is no longer its own and leave the newer tick's alone.
    private inFlight: {startedAt: number} | null = null
    private readonly schedule = new Map<string, ScheduleEntry>()
    private readonly composeCache = new Map<string, ParsedCompose>()

    constructor(private readonly deps: HealthProbeJobDeps) {
        super()
    }

    // Before the schedule begins: attachments a crashed run left behind are
    // removed (amended D-05), and ownership is seeded so it is known before
    // StatePoller's first 60-second reconcile (D-07).
    override async start(): Promise<void> {
        await this.sweepStaleAttachments()
        await this.refreshOwnership()
        await super.start()
    }

    private async sweepStaleAttachments(): Promise<void> {
        try {
            const removed = await withDeadline("stale attachment sweep", START_STEP_TIMEOUT_MS, () =>
                this.deps.transport.sweepStaleAttachments(),
            )
            if (removed > 0) console.warn(`[HealthProbeJob] removed ${removed} stale probe network attachment(s)`)
        } catch (err) {
            console.error("[HealthProbeJob] stale attachment sweep failed:", err)
        }
    }

    private async refreshOwnership(): Promise<void> {
        try {
            await withDeadline("ownership refresh", START_STEP_TIMEOUT_MS, async () => {
                const stacks = await this.deps.store.listStacks()
                for (const stack of stacks) {
                    this.deps.ownership.replaceStack(stack.id, (await this.probesFor(stack.id)).keys())
                }
                this.deps.ownership.retainStacks(stacks.map((stack) => stack.id))
            })
        } catch (err) {
            console.error("[HealthProbeJob] ownership refresh failed:", err)
        }
    }

    protected async run(): Promise<void> {
        // IntervalJob does not stop a run from overlapping the previous one, and
        // a probe can take up to its timeout, so a tick that starts while the
        // last one is running is skipped, until the watchdog gives up on it.
        const now = this.deps.now()
        if (this.inFlight !== null) {
            if (now - this.inFlight.startedAt < MAX_TICK_DURATION_MS) return
            console.error(
                `[HealthProbeJob] watchdog: the previous tick has run for over ${MAX_TICK_DURATION_MS / 1000}s; starting a new tick`,
            )
            this.reportError(new DeadlineExceededError("probe tick", MAX_TICK_DURATION_MS))
        }

        const marker = {startedAt: now}
        this.inFlight = marker
        try {
            await this.tick()
        } finally {
            if (this.inFlight === marker) this.inFlight = null
        }
    }

    private async tick(): Promise<void> {
        const now = this.deps.now()
        const stacks = await this.deps.store.listStacks()
        const due = await this.collectDue(stacks, now)
        await this.runDue(due)
    }

    // Walks every stack, schedules what is new, clears what stopped being
    // probed, and returns the probes that are due now.
    private async collectDue(stacks: ReadonlyArray<ProbeJobStack>, now: number): Promise<DueProbe[]> {
        const seen = new Set<string>()
        const due: DueProbe[] = []

        for (const stack of stacks) {
            if (isTransitionalStatus(stack.status)) {
                // An operation owns the stack: neither probe nor clear it.
                this.keepScheduled(stack.id, seen)
                continue
            }
            const probes = await this.probesFor(stack.id)
            // Valid and invalid specs both own the service: a broken probe must
            // not hand its health back to Docker (fail-closed, D-07/D-08).
            this.deps.ownership.replaceStack(stack.id, probes.keys())
            for (const service of stack.services) {
                const spec = probes.get(service.serviceName)
                if (spec === undefined) continue

                const key = scheduleKey(stack.id, service.serviceName)
                if (service.containerState !== "running" || !service.containerId) {
                    if (this.schedule.delete(key)) this.emitCleared(stack.id, service.serviceName, "container-not-running")
                    continue
                }
                seen.add(key)
                if (this.isDue(key, stack.id, service.serviceName, now)) {
                    due.push({stackId: stack.id, serviceName: service.serviceName, containerId: service.containerId, spec, key})
                }
            }
        }

        this.clearUnseen(seen)
        this.forgetRemovedStacks(stacks)
        this.deps.ownership.retainStacks(stacks.map((stack) => stack.id))
        return due
    }

    private keepScheduled(stackId: string, seen: Set<string>): void {
        for (const [key, entry] of this.schedule) {
            if (entry.stackId === stackId) seen.add(key)
        }
    }

    // Anything still scheduled that this tick did not see lost its probe: the
    // block was removed, or the service or its whole stack is gone.
    private clearUnseen(seen: ReadonlySet<string>): void {
        for (const [key, entry] of [...this.schedule]) {
            if (seen.has(key)) continue
            this.schedule.delete(key)
            this.emitCleared(entry.stackId, entry.serviceName, "probe-removed")
        }
    }

    private forgetRemovedStacks(stacks: ReadonlyArray<ProbeJobStack>): void {
        const present = new Set(stacks.map((stack) => stack.id))
        for (const stackId of this.composeCache.keys()) {
            if (!present.has(stackId)) this.composeCache.delete(stackId)
        }
    }

    // The first sighting of a key schedules its first probe at a deterministic
    // offset inside the first interval (D-06). A due key is rescheduled right
    // away, before its request, so a slow probe does not shorten the time to
    // the next one.
    private isDue(key: string, stackId: string, serviceName: string, now: number): boolean {
        let entry = this.schedule.get(key)
        if (entry === undefined) {
            entry = {stackId, serviceName, nextDueAt: now + probeStaggerOffsetMs(key)}
            this.schedule.set(key, entry)
        }
        if (entry.nextDueAt > now) return false
        entry.nextDueAt = now + PROBE_INTERVAL_MS
        return true
    }

    // A small promise pool: PROBE_CONCURRENCY workers drain one shared queue.
    private async runDue(due: ReadonlyArray<DueProbe>): Promise<void> {
        let next = 0
        const worker = async (): Promise<void> => {
            for (let probe = due[next++]; probe !== undefined; probe = due[next++]) {
                await this.probeService(probe)
            }
        }
        await Promise.all(Array.from({length: Math.min(PROBE_CONCURRENCY, due.length)}, worker))
    }

    private async probeService({stackId, serviceName, containerId, spec, key}: DueProbe): Promise<void> {
        if (spec.kind === "invalid") {
            // Fail-closed (D-08): the user asked for a probe, so a broken one is
            // a failed probe carrying the reason, and no request is made.
            this.emitCompleted(stackId, serviceName, containerId, {
                containerStartedAt: null,
                outcome: {ok: false, reason: {kind: "invalid-config", message: spec.message}},
            })
            return
        }

        let observation: ProbeObservation
        try {
            observation = await withDeadline(`probe of "${key}"`, spec.timeoutMs + PROBE_DEADLINE_MARGIN_MS, () =>
                this.deps.transport.probe({containerId, url: spec.url, timeoutMs: spec.timeoutMs}),
            )
        } catch (err) {
            // The port promises never to reject and to answer in time. Either way
            // no answer is a failed probe (D-08), never a skipped one, and the
            // race guarantees exactly one result however late the transport is.
            this.logProbeFailure(key, err)
            observation = {containerStartedAt: null, outcome: {ok: false, reason: {kind: "network-unreachable"}}}
        }
        this.emitCompleted(stackId, serviceName, containerId, observation)
    }

    private logProbeFailure(key: string, err: unknown): void {
        if (err instanceof DeadlineExceededError) {
            console.warn(`[HealthProbeJob] probe of "${key}" did not finish within ${err.ms / 1000}s; recording a failed probe`)
        } else {
            console.error(`[HealthProbeJob] probe request failed for "${key}":`, err)
        }
    }

    private emitCompleted(stackId: string, serviceName: string, containerId: string, observation: ProbeObservation): void {
        this.emit("service.probe_completed", {
            stackId,
            serviceName,
            containerId,
            containerStartedAt: observation.containerStartedAt,
            outcome: observation.outcome,
        })
    }

    private emitCleared(stackId: string, serviceName: string, reason: ServiceProbeClearedEvent["reason"]): void {
        this.emit("service.probe_cleared", {stackId, serviceName, reason})
    }

    // Defence in depth alongside the bus's own per-subscriber isolation
    // (D-17), as in DiskChecker.
    private emit<K extends keyof DomainEventMap & string>(event: K, payload: DomainEventMap[K]): void {
        try {
            this.deps.bus.emit(event, payload)
        } catch (err) {
            console.error("[HealthProbeJob] bus emit failed", err)
        }
    }

    // Parsed per stack and re-parsed only when the file's content changes. A
    // file that cannot be read or no longer parses keeps the last good probes,
    // so a typo in the YAML never silently turns probing off.
    private async probesFor(stackId: string): Promise<ReadonlyMap<string, HealthProbeSpec>> {
        const cached = this.composeCache.get(stackId)
        try {
            const content = await this.deps.readCompose(stackId)
            if (cached?.content === content) return cached.probes

            const probes = parseHealthProbes(content) ?? cached?.probes ?? EMPTY_PROBES
            this.composeCache.set(stackId, {content, probes})
            return probes
        } catch (err) {
            console.error(`[HealthProbeJob] failed to read the compose file of stack "${stackId}":`, err)
            return cached?.probes ?? EMPTY_PROBES
        }
    }
}

const EMPTY_PROBES: ReadonlyMap<string, HealthProbeSpec> = new Map()

function scheduleKey(stackId: string, serviceName: string): string {
    return `${stackId}/${serviceName}`
}

let _job: HealthProbeJob | null = null
let _healthReporter: JobHealthReporter | null = null

async function createProductionHealthProbeJob(): Promise<HealthProbeJob> {
    const [{stackRepository}, {StackFilesystem}, {probeTransport}, {probedServiceRegistry}] = await Promise.all([
        import("../repositories/index.js"),
        import("../infrastructure/stack-filesystem.js"),
        import("../infrastructure/probe-transport.js"),
        import("../application/probed-service-registry.js"),
    ])

    const filesystem = new StackFilesystem()
    const job = new HealthProbeJob({
        store: {listStacks: () => stackRepository.findAll()},
        readCompose: (stackId) => filesystem.readCompose(stackId),
        transport: probeTransport,
        ownership: probedServiceRegistry,
        bus: domainEventBus,
        now: Date.now,
    })
    if (_healthReporter) job.setHealthReporter(_healthReporter)
    return job
}

// A Job facade over the lazily-constructed production job — the lazy
// construction is what keeps the database client and the Docker client out of
// the unit-test module graph (same shape as disk-checker.ts).
export const healthProbeJob: Job = {
    name: "HealthProbeJob",
    kind: "interval",
    start: async () => {
        _job = await createProductionHealthProbeJob()
        await _job.start()
    },
    stop: () => _job?.stop(),
    setHealthReporter: (reporter: JobHealthReporter) => {
        _healthReporter = reporter
        _job?.setHealthReporter(reporter)
    },
}
