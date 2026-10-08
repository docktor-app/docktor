import type {ProbeOwnershipPort} from "./ports/probe-ownership-port.js";

/**
 * In-memory record of which services of which stacks are owned by an HTTP
 * probe (D-07). Pure state, no I/O.
 *
 * Ownership mirrors the compose files as last read by HealthProbeJob. It is
 * rebuilt when the job starts and on every tick, so a Docktor restart
 * re-establishes it before StatePoller's first reconcile.
 */
export class ProbedServiceRegistry implements ProbeOwnershipPort {
    private readonly byStack = new Map<string, ReadonlySet<string>>();

    /** Replaces the probe-owned services of one stack; an empty set removes its ownership. */
    replaceStack(stackId: string, serviceNames: Iterable<string>): void {
        const names = new Set(serviceNames);
        if (names.size === 0) {
            this.byStack.delete(stackId);
            return;
        }
        this.byStack.set(stackId, names);
    }

    /** Drops every stack that is not in `stackIds` (a vanished stack owns nothing). */
    retainStacks(stackIds: Iterable<string>): void {
        const keep = new Set(stackIds);
        for (const stackId of [...this.byStack.keys()]) {
            if (!keep.has(stackId)) this.byStack.delete(stackId);
        }
    }

    isProbeOwned(stackId: string, serviceName: string): boolean {
        return this.byStack.get(stackId)?.has(serviceName) ?? false;
    }
}

/** The write side, which is all HealthProbeJob needs. */
export type ProbeOwnershipWriter = Pick<ProbedServiceRegistry, "replaceStack" | "retainStacks">;

export const probedServiceRegistry = new ProbedServiceRegistry();
