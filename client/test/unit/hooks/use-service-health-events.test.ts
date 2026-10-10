import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useServiceHealthEvents} from "@/hooks/use-service-health-events";
import {getServiceHealthEvents, type ServiceHealthEvent} from "@/lib/health-api";
import type {StateEvent} from "@/hooks/use-container-events";

vi.mock("@/lib/health-api", () => ({
    getServiceHealthEvents: vi.fn(),
}));

// Captures the handler the hook registers with useContainerEvents so tests
// can drive SSE frames directly without a real EventSource.
let capturedHandler: ((event: StateEvent) => void) | undefined;
vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn((handler: (event: StateEvent) => void) => {
        capturedHandler = handler;
    }),
}));

const mockGetEvents = vi.mocked(getServiceHealthEvents);

function makeEvent(overrides: Partial<ServiceHealthEvent> = {}): ServiceHealthEvent {
    return {
        id: "e1",
        serviceName: "web",
        fromStatus: null,
        toStatus: "healthy",
        source: "docker-healthcheck",
        message: null,
        createdAt: "2026-10-08T07:00:00Z",
        ...overrides,
    };
}

function containerState(stackId: string): StateEvent {
    return {
        type: "container_state",
        stackId,
        serviceName: "web",
        containerState: "running",
        healthStatus: "healthy",
        stackStatus: "RUNNING",
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
    mockGetEvents.mockReset();
    capturedHandler = undefined;
});

describe("useServiceHealthEvents", () => {
    it("fetches the stack's events exactly once on mount and groups them by service", async () => {
        const web = makeEvent({id: "w1", serviceName: "web"});
        const db = makeEvent({id: "d1", serviceName: "db"});
        mockGetEvents.mockResolvedValue([web, db]);

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGetEvents).toHaveBeenCalledTimes(1);
        expect(mockGetEvents).toHaveBeenCalledWith("app");
        expect(result.current.eventsByService.get("web")).toEqual([web]);
        expect(result.current.eventsByService.get("db")).toEqual([db]);
        expect(result.current.error).toBeNull();
    });

    it("sets error to the message when the initial load rejects", async () => {
        mockGetEvents.mockRejectedValue(new Error("not found"));

        const {result} = renderHook(() => useServiceHealthEvents("app"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("not found");
        expect(result.current.eventsByService.size).toBe(0);
    });

    it("falls back to a generic message when a non-Error is thrown", async () => {
        mockGetEvents.mockRejectedValue("boom");

        const {result} = renderHook(() => useServiceHealthEvents("app"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Failed to fetch health history");
    });

    it("a container_state frame for this stack triggers one background refetch that does not set loading", async () => {
        const first = makeEvent({id: "w1"});
        const second = makeEvent({id: "w2", toStatus: "unhealthy", fromStatus: "healthy"});
        mockGetEvents.mockResolvedValueOnce([first]);
        const refresh = deferred<ServiceHealthEvent[]>();
        mockGetEvents.mockReturnValueOnce(refresh.promise);

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!(containerState("app"));
        });

        expect(mockGetEvents).toHaveBeenCalledTimes(2);
        expect(result.current.loading).toBe(false);
        expect(result.current.eventsByService.get("web")).toEqual([first]);

        await act(async () => {
            refresh.resolve([second, first]);
            await refresh.promise;
        });

        await waitFor(() => expect(result.current.eventsByService.get("web")).toEqual([second, first]));
        expect(result.current.loading).toBe(false);
    });

    it("ignores a container_state frame for another stack", async () => {
        mockGetEvents.mockResolvedValue([]);

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        mockGetEvents.mockClear();

        act(() => {
            capturedHandler!(containerState("other-app"));
        });

        expect(mockGetEvents).not.toHaveBeenCalled();
    });

    it("ignores SSE frames that are not container_state", async () => {
        mockGetEvents.mockResolvedValue([]);

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        await waitFor(() => expect(result.current.loading).toBe(false));
        mockGetEvents.mockClear();

        act(() => {
            capturedHandler!({type: "stack_status", stackId: "app", stackStatus: "RUNNING"});
        });

        expect(mockGetEvents).not.toHaveBeenCalled();
    });

    it("a failed background refetch keeps the previous events and leaves error null", async () => {
        const first = makeEvent({id: "w1"});
        mockGetEvents.mockResolvedValueOnce([first]);
        mockGetEvents.mockRejectedValueOnce(new Error("network down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            capturedHandler!(containerState("app"));
        });

        await waitFor(() => expect(warn).toHaveBeenCalled());
        expect(result.current.eventsByService.get("web")).toEqual([first]);
        expect(result.current.error).toBeNull();
        warn.mockRestore();
    });

    it("refetch() after a failed load retries and clears the error", async () => {
        const first = makeEvent({id: "w1"});
        mockGetEvents.mockRejectedValueOnce(new Error("offline"));
        mockGetEvents.mockResolvedValueOnce([first]);

        const {result} = renderHook(() => useServiceHealthEvents("app"));
        await waitFor(() => expect(result.current.error).toBe("offline"));

        act(() => {
            result.current.refetch();
        });

        await waitFor(() => expect(result.current.eventsByService.get("web")).toEqual([first]));
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(false);
    });
});
