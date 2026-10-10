import {withDeadline} from "./with-deadline.js"

/**
 * Ordered, per-step bounded shutdown for the server process.
 *
 * Node is PID 1 in the image (Dockerfile CMD). Without a signal handler
 * `docker stop` therefore always ends in SIGKILL after the grace period, nothing
 * detaches the probe network attachment on Docktor's own container, and Docker
 * then refuses to start the container once that network is gone (G-14-1a).
 *
 * The handler runs each step in order under its own deadline, so one stalled
 * step cannot keep the later ones from running, and a hard deadline ends the
 * process inside Docker's default 10 second stop grace whatever happens.
 */

/** Exits inside Docker's default 10 second stop grace period. */
export const SHUTDOWN_HARD_DEADLINE_MS = 9_000

export interface ShutdownStep {
    name: string
    timeoutMs: number
    run: () => Promise<unknown> | unknown
}

export type ShutdownLog = Pick<Console, "info" | "warn" | "error">

export interface ShutdownOptions {
    /** Run in order; each is bounded at its own `timeoutMs`. */
    steps: ReadonlyArray<ShutdownStep>
    /** Counted from the first signal; passing it ends the process with code 1. */
    hardDeadlineMs: number
    exit: (code: number) => void
    /** Defaults to the global console. */
    log?: ShutdownLog
}

/** The part of `process` (or an EventEmitter standing in for it) that signals arrive on. */
export interface SignalSource {
    on(signal: string, listener: () => void): unknown
    off(signal: string, listener: () => void): unknown
}

export type ShutdownHandler = (signal: string) => Promise<void>

const DEFAULT_SIGNALS: ReadonlyArray<string> = ["SIGTERM", "SIGINT"]

/**
 * Builds the handler for one process lifetime. The first call runs the steps;
 * a later call (a second signal) exits at once with code 1. `exit` is called at
 * most once, whichever of the normal end, the hard deadline or a second signal
 * comes first.
 */
export function createShutdownHandler(options: ShutdownOptions): ShutdownHandler {
    const {steps, hardDeadlineMs, exit} = options
    const log = options.log ?? console

    let started = false
    let exited = false
    let hardTimer: ReturnType<typeof setTimeout> | undefined

    const finish = (code: number): void => {
        if (exited) return
        exited = true
        clearTimeout(hardTimer)
        exit(code)
    }

    const runSteps = async (): Promise<boolean> => {
        let allSucceeded = true
        for (const step of steps) {
            if (exited) break
            try {
                await withDeadline(`shutdown step "${step.name}"`, step.timeoutMs, async () => step.run())
            } catch (err) {
                allSucceeded = false
                log.error(`[shutdown] step "${step.name}" failed:`, err)
            }
        }
        return allSucceeded
    }

    return async (signal) => {
        if (started) {
            log.warn(`[shutdown] ${signal} received during shutdown; exiting immediately`)
            finish(1)
            return
        }
        started = true
        log.info(`[shutdown] ${signal} received; shutting down`)

        hardTimer = setTimeout(() => {
            log.error(`[shutdown] not finished within ${hardDeadlineMs}ms; exiting`)
            finish(1)
        }, hardDeadlineMs)

        finish((await runSteps()) ? 0 : 1)
    }
}

/**
 * Starts the shutdown on SIGTERM and SIGINT (or the given signals). Registered
 * with `on`, not `once`, so a second signal reaches the handler. Returns a
 * disposer that removes the listeners.
 */
export function installShutdownHandlers(
    options: ShutdownOptions,
    source: SignalSource = process,
    signals: ReadonlyArray<string> = DEFAULT_SIGNALS,
): () => void {
    const handler = createShutdownHandler(options)
    const registered = signals.map((signal): [string, () => void] => [signal, () => void handler(signal)])

    for (const [signal, listener] of registered) source.on(signal, listener)

    return () => {
        for (const [signal, listener] of registered) source.off(signal, listener)
    }
}
