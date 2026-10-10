import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStackUptime} from "@/hooks/use-stack-uptime";
import {getStackUptime, type StackUptime} from "@/lib/uptime-api";

vi.mock("@/lib/uptime-api", () => ({
    getStackUptime: vi.fn(),
}));

const mockGetUptime = vi.mocked(getStackUptime);

function makeUptime(overrides: Partial<StackUptime> = {}): StackUptime {
    return {
        stackId: "app",
        windowDays: 30,
        windowStart: "2026-09-08T00:00:00.000Z",
        since: "2026-09-08T00:00:00.000Z",
        percent: 99.95,
        upMs: 1000,
        downMs: 1,
        incidents: [],
        ...overrides,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return {promise, resolve};
}

beforeEach(() => {
    mockGetUptime.mockReset();
});

describe("useStackUptime", () => {
    it("fetches once on mount and exposes the uptime", async () => {
        const uptime = makeUptime();
        mockGetUptime.mockResolvedValue(uptime);

        const {result} = renderHook(() => useStackUptime("app", "RUNNING"));
        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGetUptime).toHaveBeenCalledTimes(1);
        expect(mockGetUptime).toHaveBeenCalledWith("app");
        expect(result.current.uptime).toEqual(uptime);
        expect(result.current.error).toBeNull();
    });

    it("refetches in the background exactly once when the status changes", async () => {
        const first = makeUptime({percent: 100});
        const second = makeUptime({percent: 99.5});
        mockGetUptime.mockResolvedValueOnce(first);
        const refresh = deferred<StackUptime>();
        mockGetUptime.mockReturnValueOnce(refresh.promise);

        const {result, rerender} = renderHook(({status}) => useStackUptime("app", status), {
            initialProps: {status: "RUNNING"},
        });
        await waitFor(() => expect(result.current.loading).toBe(false));

        rerender({status: "UNHEALTHY"});

        expect(mockGetUptime).toHaveBeenCalledTimes(2);
        expect(result.current.loading).toBe(false);
        expect(result.current.uptime).toEqual(first);

        await act(async () => {
            refresh.resolve(second);
            await refresh.promise;
        });

        await waitFor(() => expect(result.current.uptime).toEqual(second));
        expect(result.current.loading).toBe(false);
    });

    it("does not refetch when rerendered with the same status", async () => {
        mockGetUptime.mockResolvedValue(makeUptime());

        const {result, rerender} = renderHook(({status}) => useStackUptime("app", status), {
            initialProps: {status: "RUNNING"},
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        mockGetUptime.mockClear();

        rerender({status: "RUNNING"});

        expect(mockGetUptime).not.toHaveBeenCalled();
    });

    it("a failed background refetch keeps the previous uptime and only warns", async () => {
        const first = makeUptime();
        mockGetUptime.mockResolvedValueOnce(first);
        mockGetUptime.mockRejectedValueOnce(new Error("network down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const {result, rerender} = renderHook(({status}) => useStackUptime("app", status), {
            initialProps: {status: "RUNNING"},
        });
        await waitFor(() => expect(result.current.loading).toBe(false));

        rerender({status: "ERROR"});

        await waitFor(() => expect(warn).toHaveBeenCalled());
        expect(result.current.uptime).toEqual(first);
        expect(result.current.error).toBeNull();
        warn.mockRestore();
    });

    it("sets error to the message when the initial load rejects", async () => {
        mockGetUptime.mockRejectedValue(new Error("not found"));

        const {result} = renderHook(() => useStackUptime("app", "RUNNING"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("not found");
        expect(result.current.uptime).toBeNull();
    });

    it("falls back to a generic message when a non-Error is thrown", async () => {
        mockGetUptime.mockRejectedValue("boom");

        const {result} = renderHook(() => useStackUptime("app", "RUNNING"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Failed to fetch uptime");
    });

    it("retry() after a failed load re-enters loading, retries and clears the error", async () => {
        const uptime = makeUptime();
        mockGetUptime.mockRejectedValueOnce(new Error("offline"));
        mockGetUptime.mockResolvedValueOnce(uptime);

        const {result} = renderHook(() => useStackUptime("app", "RUNNING"));
        await waitFor(() => expect(result.current.error).toBe("offline"));

        act(() => {
            result.current.retry();
        });
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();

        await waitFor(() => expect(result.current.uptime).toEqual(uptime));
        expect(result.current.loading).toBe(false);
    });

    it("a background refetch that supersedes the initial load still ends loading", async () => {
        const initial = deferred<StackUptime>();
        const background = deferred<StackUptime>();
        mockGetUptime.mockReturnValueOnce(initial.promise);
        mockGetUptime.mockReturnValueOnce(background.promise);

        const {result, rerender} = renderHook(({status}) => useStackUptime("app", status), {
            initialProps: {status: "RUNNING"},
        });
        rerender({status: "UNHEALTHY"});

        const latest = makeUptime({percent: 98});
        await act(async () => {
            background.resolve(latest);
            await background.promise;
        });
        await act(async () => {
            initial.resolve(makeUptime({percent: 100}));
            await initial.promise;
        });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.uptime).toEqual(latest);
    });
});
