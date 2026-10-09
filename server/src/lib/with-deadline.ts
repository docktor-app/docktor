/**
 * Thrown by {@link withDeadline} when the work did not finish in time. A
 * technical error, not part of the HTTP `AppError` hierarchy: it never reaches
 * a route, only the job and adapter code that bounded a call.
 */
export class DeadlineExceededError extends Error {
    constructor(
        readonly what: string,
        readonly ms: number,
    ) {
        super(`${what} did not finish within ${ms}ms`);
        this.name = "DeadlineExceededError";
    }
}

/**
 * Bounds `work` at `ms` milliseconds. The deadline bounds the caller's wait:
 * when it passes, the returned promise rejects with a
 * {@link DeadlineExceededError} and the signal handed to `work` is aborted so
 * an adapter can cancel the underlying request. Whatever `work` settles with
 * afterwards is ignored.
 *
 * Built from `setTimeout` and an `AbortController` rather than
 * `AbortSignal.timeout` so fake timers can drive it in tests.
 */
export function withDeadline<T>(what: string, ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            const error = new DeadlineExceededError(what, ms);
            controller.abort(error);
            reject(error);
        }, ms);
    });

    let pending: Promise<T>;
    try {
        pending = Promise.resolve(work(controller.signal));
    } catch (err) {
        // A synchronous throw is a rejection, like any other failure of the work.
        pending = Promise.reject(err);
    }

    // race() keeps a handler on `pending`, so a rejection after the deadline is not unhandled.
    return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
}
