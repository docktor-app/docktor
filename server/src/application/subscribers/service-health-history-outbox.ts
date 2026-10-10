import type {ServiceHealthChangedEvent} from "../../domain/events.js";

export interface ServiceHealthHistoryRecordInput {
    stackId: string;
    serviceName: string;
    fromStatus: string | null;
    toStatus: string | null;
    source: ServiceHealthChangedEvent["source"];
    message?: string;
    /** Set on a retried write so the row shows when the transition happened. */
    createdAt?: Date;
}

/**
 * Narrow write-only shape of ServiceHealthEventRepository: the outbox never
 * reads the history, so it depends on the one method it calls.
 */
export interface ServiceHealthHistoryRepo {
    record(input: ServiceHealthHistoryRecordInput): Promise<unknown>;
}

export const OUTBOX_CAPACITY = 200;
export const OUTBOX_RETRY_INTERVAL_MS = 15_000;

export interface ServiceHealthHistoryOutboxOptions {
    capacity?: number;
    retryIntervalMs?: number;
    /** The time an event is handled at; becomes the createdAt of a late row. */
    now?: () => Date;
}

interface QueuedWrite {
    input: ServiceHealthHistoryRecordInput;
    handledAt: Date;
}

const LOG_PREFIX = "[service-health-history-subscriber]";

/**
 * Keeps health history writes that fail (UAT G-14-1: the database can be
 * unreachable while the Docker daemon is stalled) and retries them, so a
 * transition is recorded once the database answers instead of being lost.
 *
 * A failed write is queued with the time the event was handled, retried every
 * OUTBOX_RETRY_INTERVAL_MS and on every later write, always head first and in
 * order. A retried row gets that time as its createdAt, so the history shows
 * when the transition happened, not when the database returned. The queue
 * holds at most OUTBOX_CAPACITY writes; past that the oldest is dropped with a
 * warning. It is in memory only and is lost on a process restart, an accepted
 * limit: the Service row transition itself is retried by ServiceHealthService.
 *
 * `record` never rejects, so a history failure cannot reach the bus, the
 * poller or the probe path that produced the event.
 */
export class ServiceHealthHistoryOutbox {
    private readonly queue: QueuedWrite[] = [];
    private readonly capacity: number;
    private readonly retryIntervalMs: number;
    private readonly now: () => Date;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private flushing: Promise<void> | undefined;
    private disposed = false;

    constructor(
        private readonly repo: ServiceHealthHistoryRepo,
        options: ServiceHealthHistoryOutboxOptions = {},
    ) {
        this.capacity = options.capacity ?? OUTBOX_CAPACITY;
        this.retryIntervalMs = options.retryIntervalMs ?? OUTBOX_RETRY_INTERVAL_MS;
        this.now = options.now ?? (() => new Date());
    }

    get size(): number {
        return this.queue.length;
    }

    async record(input: ServiceHealthHistoryRecordInput): Promise<void> {
        const handledAt = this.now();
        if (this.queue.length > 0) {
            // Older writes come first, so this one waits behind them.
            this.enqueue({input, handledAt});
            await this.flush();
            return;
        }
        try {
            await this.repo.record(input);
        } catch (err) {
            console.error(
                `${LOG_PREFIX} failed to record health transition for "${input.stackId}/${input.serviceName}", queued for retry:`,
                err,
            );
            this.enqueue({input, handledAt});
            this.armTimer();
        }
    }

    /** Stops the retry timer. Writes still queued are dropped with the process. */
    dispose(): void {
        this.disposed = true;
        this.clearTimer();
    }

    private enqueue(write: QueuedWrite): void {
        if (this.queue.length >= this.capacity) {
            const dropped = this.queue.shift();
            if (dropped !== undefined) {
                console.warn(
                    `${LOG_PREFIX} history outbox is full, dropped the oldest queued transition for "${dropped.input.stackId}/${dropped.input.serviceName}"`,
                );
            }
        }
        this.queue.push(write);
    }

    private flush(): Promise<void> {
        this.flushing ??= this.drain().finally(() => {
            this.flushing = undefined;
        });
        return this.flushing;
    }

    // Writes head first and stops at the first failure; an entry leaves the
    // queue only after its write succeeded.
    private async drain(): Promise<void> {
        while (!this.disposed) {
            const head = this.queue[0];
            if (head === undefined) {
                this.clearTimer();
                return;
            }
            try {
                await this.repo.record({...head.input, createdAt: head.handledAt});
            } catch {
                this.armTimer();
                return;
            }
            this.queue.shift();
        }
    }

    private armTimer(): void {
        if (this.disposed || this.timer !== undefined) {
            return;
        }
        const timer = setTimeout(() => {
            this.timer = undefined;
            void this.flush();
        }, this.retryIntervalMs);
        // A pending retry must never keep the process alive.
        timer.unref?.();
        this.timer = timer;
    }

    private clearTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
