import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStackUptimes} from "@/hooks/use-stack-uptimes";
import {getStackUptimes} from "@/lib/uptime-api";
import type {StateEvent} from "@/hooks/use-container-events";

vi.mock("@/lib/uptime-api", () => ({
    getStackUptimes: vi.fn(),
}));

// Captures the handler the hook registers so tests can drive SSE frames
// without a real EventSource.
let capturedHandler: ((event: StateEvent) => void) | undefined;
vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn((handler: (event: StateEvent) => void) => {
        capturedHandler = handler;
    }),
}));

const mockGetStackUptimes = vi.mocked(getStackUptimes);

const payload = {
    windowDays: 30,
    stacks: [
        {stackId: "a", percent: 99.95},
        {stackId: "b", percent: null},
    ],
};

beforeEach(() => {
    mockGetStackUptimes.mockReset();
    capturedHandler = undefined;
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("useStackUptimes", () => {
    it("starts loading with an empty map", () => {
        mockGetStackUptimes.mockReturnValue(new Promise(() => {}));

        const {result} = renderHook(() => useStackUptimes());

        expect(result.current.loading).toBe(true);
        expect(result.current.byStackId.size).toBe(0);
        expect(result.current.windowDays).toBeNull();
    });

    it("maps each stack id to its percent once loaded", async () => {
        mockGetStackUptimes.mockResolvedValue(payload);

        const {result} = renderHook(() => useStackUptimes());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.byStackId.get("a")).toBe(99.95);
        expect(result.current.byStackId.get("b")).toBeNull();
        expect(result.current.byStackId.has("missing")).toBe(false);
        expect(result.current.windowDays).toBe(30);
    });

    it("degrades silently when the request fails", async () => {
        mockGetStackUptimes.mockRejectedValue(new Error("boom"));

        const {result} = renderHook(() => useStackUptimes());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.byStackId.size).toBe(0);
        expect(result.current.windowDays).toBeNull();
        expect(console.warn).toHaveBeenCalled();
        expect(result.current).not.toHaveProperty("error");
    });

    it("refetches once in the background on a stack_status frame", async () => {
        mockGetStackUptimes.mockResolvedValueOnce(payload);
        mockGetStackUptimes.mockResolvedValueOnce({windowDays: 30, stacks: [{stackId: "a", percent: 90}]});

        const {result} = renderHook(() => useStackUptimes());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!({type: "stack_status", stackId: "a", stackStatus: "UNHEALTHY"});
        });

        expect(result.current.loading).toBe(false);
        await waitFor(() => expect(result.current.byStackId.get("a")).toBe(90));
        expect(mockGetStackUptimes).toHaveBeenCalledTimes(2);
    });

    it("ignores a container_state frame without a statusLog", async () => {
        mockGetStackUptimes.mockResolvedValue(payload);

        const {result} = renderHook(() => useStackUptimes());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!({
                type: "container_state",
                stackId: "a",
                serviceName: "web",
                containerState: "running",
                healthStatus: null,
                stackStatus: "RUNNING",
            });
        });

        expect(mockGetStackUptimes).toHaveBeenCalledTimes(1);
    });

    it("refetches on a container_state frame that carries a statusLog", async () => {
        mockGetStackUptimes.mockResolvedValue(payload);

        const {result} = renderHook(() => useStackUptimes());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!({
                type: "container_state",
                stackId: "a",
                serviceName: "web",
                containerState: "running",
                healthStatus: "unhealthy",
                stackStatus: "UNHEALTHY",
                statusLog: {
                    id: "log-1",
                    fromStatus: "RUNNING",
                    toStatus: "UNHEALTHY",
                    message: null,
                    createdAt: "2026-10-08T10:00:00.000Z",
                },
            });
        });

        await waitFor(() => expect(mockGetStackUptimes).toHaveBeenCalledTimes(2));
    });

    it("ignores unrelated frames", async () => {
        mockGetStackUptimes.mockResolvedValue(payload);

        const {result} = renderHook(() => useStackUptimes());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!({type: "config_changed", stackId: "a", source: "app"});
        });

        expect(mockGetStackUptimes).toHaveBeenCalledTimes(1);
    });
});
