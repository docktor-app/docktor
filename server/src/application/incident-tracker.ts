import {decideIncidentAction} from "../domain/incident-tracking.js";
import {withKeyedLock} from "../lib/keyed-mutex.js";
import type {StackIncidentRepository} from "../repositories/stack-incident-repository.js";

export type IncidentTrackerRepo = Pick<StackIncidentRepository, "findOpen" | "open" | "resolve">;

interface OpenIncident {
    id: string;
    triggerType: string;
}

/**
 * Writes the StackIncident rows behind the uptime incident list (#24, D-11):
 * one row per UNHEALTHY/ERROR episode of a stack.
 *
 * State-based and idempotent, like NotificationWatcher: it is told the stack's
 * current status and decides from the open incident whether to open, keep or
 * close, so repeated or out-of-order observations are harmless.
 *
 * Writes are serialised per stack (RESEARCH Finding 6): the StackIncident
 * unique key cannot stop duplicate open rows (NULLs are distinct) and status
 * events for one stack arrive concurrently. The lock key is prefixed so it
 * never queues behind ProxyService's locks on the bare stack id.
 */
export class IncidentTracker {
    /** Open incident per stack; absent = not read yet, null = read and none open. */
    private readonly openByStack = new Map<string, OpenIncident | null>();

    constructor(
        private readonly repo: IncidentTrackerRepo,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /** Never rejects: bus listeners must not throw (Phase 10 D-17). */
    async observeStackStatus(stackId: string, status: string): Promise<void> {
        await withKeyedLock(`incident:${stackId}`, async () => {
            try {
                await this.apply(stackId, status);
            } catch (err) {
                this.openByStack.delete(stackId);
                console.error(`[IncidentTracker] failed to record incident transition for "${stackId}":`, err);
            }
        });
    }

    private async apply(stackId: string, status: string): Promise<void> {
        const open = await this.readOpen(stackId);
        const action = decideIncidentAction(open, status);

        if (action.kind === "open") {
            const created = await this.repo.open(stackId, action.cause, this.now());
            this.openByStack.set(stackId, {id: created.id, triggerType: created.triggerType});
        } else if (action.kind === "close" && open !== null) {
            await this.repo.resolve(open.id, this.now());
            this.openByStack.set(stackId, null);
        }
    }

    private async readOpen(stackId: string): Promise<OpenIncident | null> {
        const cached = this.openByStack.get(stackId);
        if (cached !== undefined) {
            return cached;
        }
        const found = await this.repo.findOpen(stackId);
        this.openByStack.set(stackId, found);
        return found;
    }
}
