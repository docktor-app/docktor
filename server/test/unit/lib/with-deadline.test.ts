import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {DeadlineExceededError, withDeadline} from "../../../src/lib/with-deadline.js";

describe("withDeadline", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns the value when the work finishes first and leaves no timer behind", async () => {
        const result = await withDeadline("x", 1000, async () => "done");

        expect(result).toBe("done");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("rethrows the work's own error unchanged and leaves no timer behind", async () => {
        const failure = new Error("boom");

        await expect(withDeadline("x", 1000, async () => Promise.reject(failure))).rejects.toBe(failure);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("rejects with a DeadlineExceededError and aborts the signal when the deadline passes first", async () => {
        let seen: AbortSignal | undefined;
        const outcome = withDeadline("the thing", 1000, (signal) => {
            seen = signal;
            return new Promise<string>(() => {});
        });
        const assertion = expect(outcome).rejects.toSatisfy((err: unknown) => {
            return (
                err instanceof Error &&
                err instanceof DeadlineExceededError &&
                err.name === "DeadlineExceededError" &&
                err.message.includes("the thing") &&
                err.message.includes("1000") &&
                err.what === "the thing" &&
                err.ms === 1000
            );
        });

        await vi.advanceTimersByTimeAsync(999);
        expect(seen?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await assertion;

        expect(seen?.aborted).toBe(true);
        expect(seen?.reason).toBeInstanceOf(DeadlineExceededError);
    });

    it("causes no unhandled rejection when the work rejects after the deadline", async () => {
        let rejectLate: (reason: Error) => void = () => {};
        const outcome = withDeadline("x", 1000, () => new Promise<string>((_resolve, reject) => (rejectLate = reject)));
        const assertion = expect(outcome).rejects.toBeInstanceOf(DeadlineExceededError);

        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
        rejectLate(new Error("too late"));
        await vi.advanceTimersByTimeAsync(0);
    });

    it("turns a synchronous throw into a rejection", async () => {
        const failure = new Error("sync");

        const outcome = withDeadline("x", 1000, () => {
            throw failure;
        });

        await expect(outcome).rejects.toBe(failure);
        expect(vi.getTimerCount()).toBe(0);
    });
});
