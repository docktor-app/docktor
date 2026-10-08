import type {EventBusPort} from "../application/ports/event-bus-port.js"
import type {ProbeObservation, ProbeTransportPort} from "../application/ports/probe-transport-port.js"
import {PROBE_INTERVAL_MS, probeStaggerOffsetMs} from "../domain/health-probe.js"
import {domainEventBus} from "../infrastructure/event-bus.js"
import type {HealthProbeSpec} from "../lib/compose-health-probe.js"
import {parseHealthProbes} from "../lib/compose-health-probe.js"
import type {Job, JobHealthReporter} from "./job.js"
import {IntervalJob} from "./job.js"

export interface ProbeJobService {
    serviceName: string
    containerId: string | null
    containerState: string | null
}

export interface ProbeJobStack {
    id: string
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
    bus: Pick<EventBusPort, "emit">
    now: () => number
}

interface ParsedCompose {
    content: string
    probes: ReadonlyMap<string, HealthProbeSpec> | null
}

/**
 * Producer of HTTP probe results (#23, D-06). Ticks every 5 seconds and probes
 * each probed, running service once every 30 seconds, offset by a per-service
 * stagger so a stack's probes do not all fire together. Probe configuration is
 * read from each stack's compose file on every tick (D-01), so a compose edit
 * takes effect without a redeploy.
 *
 * The job does I/O and emits `service.probe_completed`; deciding what a result
 * means and persisting it belongs to ServiceHealthService (Phase 10 pattern).
 */
export class HealthProbeJob extends IntervalJob {
    readonly name = "HealthProbeJob"
    protected readonly cronExpression = "*/5 * * * * *"
    // The first probes are staggered over the first 30 seconds anyway.
    protected readonly runImmediatelyOnStart = false

    private inFlight = false
    private readonly nextDueAt = new Map<string, number>()
    private readonly composeCache = new Map<string, ParsedCompose>()

    constructor(private readonly deps: HealthProbeJobDeps) {
        super()
    }

    protected async run(): Promise<void> {
        // IntervalJob does not stop a run from overlapping the previous one, and
        // a probe can take up to its timeout, so a tick that starts while the
        // last one is running is skipped.
        if (this.inFlight) return
        this.inFlight = true
        try {
            await this.tick()
        } finally {
            this.inFlight = false
        }
    }

    private async tick(): Promise<void> {
        const now = this.deps.now()
        const stacks = await this.deps.store.listStacks()
        const seen = new Set<string>()

        for (const stack of stacks) {
            const probes = await this.probesFor(stack.id)
            if (probes === null) continue

            for (const service of stack.services) {
                const spec = probes.get(service.serviceName)
                if (spec?.kind !== "valid" || service.containerState !== "running" || !service.containerId) continue

                const key = `${stack.id}/${service.serviceName}`
                seen.add(key)
                if (this.isDue(key, now)) {
                    await this.probeService(stack.id, service.serviceName, service.containerId, spec, key, now)
                }
            }
        }

        // Forget services that are no longer probed, so the schedule cannot
        // grow with every removed stack and a restarted container is staggered anew.
        for (const key of this.nextDueAt.keys()) {
            if (!seen.has(key)) this.nextDueAt.delete(key)
        }
    }

    // The first sighting of a key schedules its first probe at a deterministic
    // offset inside the first interval (D-06).
    private isDue(key: string, now: number): boolean {
        let due = this.nextDueAt.get(key)
        if (due === undefined) {
            due = now + probeStaggerOffsetMs(key)
            this.nextDueAt.set(key, due)
        }
        return due <= now
    }

    private async probeService(
        stackId: string,
        serviceName: string,
        containerId: string,
        spec: Extract<HealthProbeSpec, {kind: "valid"}>,
        key: string,
        now: number,
    ): Promise<void> {
        // Rescheduled before the request so a slow probe does not shorten the
        // time to the next one.
        this.nextDueAt.set(key, now + PROBE_INTERVAL_MS)

        let observation: ProbeObservation
        try {
            observation = await this.deps.transport.probe({containerId, url: spec.url, timeoutMs: spec.timeoutMs})
        } catch (err) {
            // The port promises never to reject; this keeps a violation of that
            // promise from aborting the probes of every service after this one.
            console.error(`[HealthProbeJob] probe request failed for "${key}":`, err)
            return
        }

        // Defence in depth alongside the bus's own per-subscriber isolation
        // (D-17), as in DiskChecker.
        try {
            this.deps.bus.emit("service.probe_completed", {
                stackId,
                serviceName,
                containerId,
                containerStartedAt: observation.containerStartedAt,
                outcome: observation.outcome,
            })
        } catch (err) {
            console.error("[HealthProbeJob] bus emit failed", err)
        }
    }

    // Parsed per stack and re-parsed only when the file's content changes.
    private async probesFor(stackId: string): Promise<ReadonlyMap<string, HealthProbeSpec> | null> {
        try {
            const content = await this.deps.readCompose(stackId)
            const cached = this.composeCache.get(stackId)
            if (cached?.content === content) return cached.probes

            const probes = parseHealthProbes(content)
            this.composeCache.set(stackId, {content, probes})
            return probes
        } catch (err) {
            console.error(`[HealthProbeJob] failed to read the compose file of stack "${stackId}":`, err)
            return null
        }
    }
}

let _job: HealthProbeJob | null = null
let _healthReporter: JobHealthReporter | null = null

async function createProductionHealthProbeJob(): Promise<HealthProbeJob> {
    const [{stackRepository}, {StackFilesystem}, {probeTransport}] = await Promise.all([
        import("../repositories/index.js"),
        import("../infrastructure/stack-filesystem.js"),
        import("../infrastructure/probe-transport.js"),
    ])

    const filesystem = new StackFilesystem()
    const job = new HealthProbeJob({
        store: {listStacks: () => stackRepository.findAll()},
        readCompose: (stackId) => filesystem.readCompose(stackId),
        transport: probeTransport,
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
