/**
 * better-auth's rate limiter reports the wait time in `X-Retry-After`
 * (seconds), not the standard `Retry-After` header.
 */
export const RETRY_AFTER_HEADER = "X-Retry-After";

/** Reads the wait time in seconds; null unless the header is a positive integer. */
export function readRetryAfterSeconds(headers: Pick<Headers, "get"> | null | undefined): number | null {
    const raw = headers?.get(RETRY_AFTER_HEADER);
    if (raw === null || raw === undefined || !/^\d+$/.test(raw)) {
        return null;
    }

    const seconds = Number(raw);
    return seconds > 0 ? seconds : null;
}

/** The message shown for a 429 on any password-bearing or code-bearing form. */
export function formatRetryAfter(seconds: number | null): string {
    if (seconds === null || !Number.isInteger(seconds) || seconds <= 0) {
        return "Too many attempts. Try again in a few minutes.";
    }

    const minutes = Math.ceil(seconds / 60);
    return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

interface FetchErrorContext {
    response: Pick<Response, "headers">;
}

export interface RetryAfterProbe {
    /** Pass as `fetchOptions` to a better-auth call so a failure records the wait. */
    fetchOptions: { onError: (context: FetchErrorContext) => void };

    /** The 429 message for the most recent failed attempt. */
    message(): string;
}

/** Captures X-Retry-After from a failed better-auth call so a 429 can name the wait. */
export function createRetryAfterProbe(): RetryAfterProbe {
    let seconds: number | null = null;
    return {
        fetchOptions: {
            onError: (context): void => {
                seconds = readRetryAfterSeconds(context.response.headers);
            },
        },
        message: (): string => formatRetryAfter(seconds),
    };
}
