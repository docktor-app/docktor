import type {EventBusPort} from "../ports/event-bus-port.js";
import type {StackEventType} from "../../generated/prisma/enums.js";

/**
 * Narrow write-only shape of StackEventRepository — this subscriber never
 * reads the StackEvent table, so it depends on the one method it calls, not
 * the concrete repository class.
 */
export interface StackEventSubscriberRepo {
    createEvent(input: {stackId: string; type: StackEventType; message?: string; payload?: string}): Promise<unknown>;
}

/**
 * Writes the StackEvent audit-trail row for two of the three events D-15
 * item 2 covers (stack.config_changed, stack.config_error), replacing the
 * inline `createStackEvent`/`createEvent` calls that used to live at
 * FileWatcher's three call sites (plan 10-13). The third audit type named
 * in the enum (`update_available`) has no producer anywhere in the codebase
 * today — grepping `createStackEvent` confirmed only the file watcher's
 * sites ever wrote a row — so this subscriber adds none either (PD-10):
 * that would be new behaviour, not a migration.
 *
 * PD-9: a configuration-changed event is only ever audited when it
 * originated externally (FileWatcher). StackService's in-app save has
 * always emitted the same event with source: "app" and has never written an
 * audit row — reacting to it here would inflate a stack's event log with
 * rows no prior release produced. Do not "fix" this by removing the check;
 * it is the one thing keeping this subscriber's behaviour identical to the
 * inline calls it replaces.
 *
 * Since D-17 requires per-listener isolation to live in the bus itself, the
 * handlers below have no try/catch of their own — but a rejected
 * `createEvent()` call is still caught and logged with the event's name, so
 * a write failure produces one line instead of an unhandled rejection
 * (matching notification-subscriber.ts's and state-broadcast-subscriber.ts's
 * convention).
 */
export function subscribeStackEvents(
    bus: Pick<EventBusPort, "subscribe">,
    repo: StackEventSubscriberRepo,
): () => void {
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
        bus.subscribe("stack.config_changed", (payload) => {
            if (payload.source !== "external") return undefined;

            const previousHash = payload.previousHash ?? "";
            const payloadString =
                payload.changedFile === "env"
                    ? JSON.stringify({oldHash: previousHash, newHash: payload.newHash, source: "env"})
                    : JSON.stringify({oldHash: previousHash, newHash: payload.newHash});

            return writeEvent(
                repo,
                {stackId: payload.stackId, type: "config_changed", payload: payloadString},
                "stack.config_changed",
            );
        }),
    );

    unsubscribers.push(
        bus.subscribe("stack.config_error", (payload) => {
            return writeEvent(
                repo,
                {stackId: payload.stackId, type: "config_error", message: payload.message},
                "stack.config_error",
            );
        }),
    );

    return () => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe();
        }
    };
}

async function writeEvent(
    repo: StackEventSubscriberRepo,
    input: {stackId: string; type: StackEventType; message?: string; payload?: string},
    eventName: string,
): Promise<void> {
    try {
        await repo.createEvent(input);
    } catch (err) {
        console.error(`[stack-event-subscriber] failed to write StackEvent for "${eventName}":`, err);
    }
}
