import type {MigrationLedgerEntry} from "@docktor/shared";
import type {ProjectContainer} from "./compose-project.js";

/** D-07: how long a rollback waits to see the restarted services running before it stops claiming a restore. */
export const RESTART_VERIFY_TIMEOUT_MS = 90_000;

/** D-07: how often the restarted services are looked at while waiting. */
export const RESTART_VERIFY_INTERVAL_MS = 2_000;

/**
 * The journal of what a migration run did to the world. `record` is awaited
 * before the next side effect, so a ledger that cannot be written (the durable
 * one of plan 22-08) stops the run before it changes anything it could not undo.
 */
export interface MigrationLedger {
    record(entry: MigrationLedgerEntry): Promise<void>;

    entries(): readonly MigrationLedgerEntry[];
}

export class InMemoryMigrationLedger implements MigrationLedger {
    private readonly recorded: MigrationLedgerEntry[] = [];

    record(entry: MigrationLedgerEntry): Promise<void> {
        this.recorded.push(entry);
        return Promise.resolve();
    }

    entries(): readonly MigrationLedgerEntry[] {
        return [...this.recorded];
    }
}

/** The entries in the order a rollback undoes them: the last side effect first. */
export function compensationOrder(entries: readonly MigrationLedgerEntry[]): MigrationLedgerEntry[] {
    return [...entries].reverse();
}

/**
 * D-07: true only when every service has a running container. Anything less
 * (including no services to look for) is not a verified restore.
 */
export function allServicesRunning(services: readonly string[], containers: readonly ProjectContainer[]): boolean {
    if (services.length === 0) {
        return false;
    }
    const running = new Set(containers.filter((container) => container.running).map((container) => container.service));
    return services.every((service) => running.has(service));
}
