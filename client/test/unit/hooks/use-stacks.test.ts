import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStacks} from "../../../src/hooks/use-stacks";
import {listStacks} from "@/lib/stacks-api";
import type {StateEvent} from "@/hooks/use-container-events";

vi.mock("@/lib/stacks-api", () => ({
    listStacks: vi.fn(),
}));

// Captures the handler useStacks registers with useContainerEvents so tests can
// drive SSE events directly without a real EventSource.
let capturedHandler: ((event: StateEvent) => void) | undefined;
vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn((handler: (event: StateEvent) => void) => {
        capturedHandler = handler;
    }),
}));

const mockListStacks = vi.mocked(listStacks);

beforeEach(() => {
    mockListStacks.mockReset();
    capturedHandler = undefined;
});

describe("useStacks", () => {
    it("starts in loading state", () => {
        mockListStacks.mockReturnValue(new Promise(() => {}));

        const {result} = renderHook(() => useStacks());
        expect(result.current.loading).toBe(true);
        expect(result.current.stacks).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it("returns stacks on success", async () => {
        const stacks = [{id: "my-app", displayName: "My App", services: []}];
        mockListStacks.mockResolvedValue(stacks as any);

        const {result} = renderHook(() => useStacks());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.stacks).toEqual(stacks);
        expect(result.current.error).toBeNull();
    });

    it("returns error on failure", async () => {
        mockListStacks.mockRejectedValue(new Error("Network error"));

        const {result} = renderHook(() => useStacks());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Network error");
        expect(result.current.stacks).toEqual([]);
    });

    it("a config_error event triggers a refetch", async () => {
        const stacks = [{id: "my-app", displayName: "My App", services: [], configError: null}];
        const refetchedStacks = [{id: "my-app", displayName: "My App", services: [], configError: "bad yaml"}];
        mockListStacks.mockResolvedValueOnce(stacks as any);
        mockListStacks.mockResolvedValueOnce(refetchedStacks as any);

        const {result} = renderHook(() => useStacks());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            capturedHandler!({type: "config_error", stackId: "my-app", message: "bad yaml"});
        });

        await waitFor(() => expect(result.current.stacks).toEqual(refetchedStacks));
    });

    it("an update_available event triggers a background refetch exactly once, without flipping loading back to true", async () => {
        const stacks = [{id: "my-app", displayName: "My App", services: []}];
        const refetchedStacks = [{id: "my-app", displayName: "My App", services: [{serviceName: "web", updateAvailable: true}]}];
        mockListStacks.mockResolvedValueOnce(stacks as any);
        mockListStacks.mockResolvedValueOnce(refetchedStacks as any);

        const {result} = renderHook(() => useStacks());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const loadingStates: boolean[] = [];
        act(() => {
            capturedHandler!({
                type: "update_available",
                stackId: "my-app",
                imageRef: "nginx:latest",
                latestTag: "1.28",
                hasUpdate: true,
            });
            loadingStates.push(result.current.loading);
        });

        expect(loadingStates).toEqual([false]);
        await waitFor(() => expect(result.current.stacks).toEqual(refetchedStacks));
        expect(mockListStacks).toHaveBeenCalledTimes(2);
    });

    describe("stack_status events (D-04 freshness)", () => {
        it("refetches in the background once when a stack leaves BACKING_UP, without flipping loading", async () => {
            const stacks = [{id: "my-app", displayName: "My App", status: "BACKING_UP", services: []}];
            const refetched = [{id: "my-app", displayName: "My App", status: "RUNNING", hasBackup: true, services: []}];
            mockListStacks.mockResolvedValueOnce(stacks as any);
            mockListStacks.mockResolvedValueOnce(refetched as any);

            const {result} = renderHook(() => useStacks());
            await waitFor(() => expect(result.current.loading).toBe(false));

            const loadingStates: boolean[] = [];
            act(() => {
                capturedHandler!({type: "stack_status", stackId: "my-app", stackStatus: "RUNNING"});
                loadingStates.push(result.current.loading);
            });

            expect(loadingStates).toEqual([false]);
            await waitFor(() => expect(result.current.stacks).toEqual(refetched));
            expect(mockListStacks).toHaveBeenCalledTimes(2);
        });

        it("only patches the status when a stack moves between other states", async () => {
            const stacks = [{id: "my-app", displayName: "My App", status: "RUNNING", services: []}];
            mockListStacks.mockResolvedValueOnce(stacks as any);

            const {result} = renderHook(() => useStacks());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                capturedHandler!({type: "stack_status", stackId: "my-app", stackStatus: "STOPPED"});
            });

            await waitFor(() => expect(result.current.stacks[0]!.status).toBe("STOPPED"));
            expect(mockListStacks).toHaveBeenCalledTimes(1);
        });

        it("refetches once when two events land before a re-render and the first one leaves BACKING_UP", async () => {
            const stacks = [{id: "my-app", displayName: "My App", status: "BACKING_UP", services: []}];
            const refetched = [{id: "my-app", displayName: "My App", status: "RUNNING", hasBackup: true, services: []}];
            mockListStacks.mockResolvedValueOnce(stacks as any);
            mockListStacks.mockResolvedValueOnce(refetched as any);

            const {result} = renderHook(() => useStacks());
            await waitFor(() => expect(result.current.loading).toBe(false));

            // Both handlers run against the same render; the second must see the
            // status written by the first, not the stale BACKING_UP snapshot.
            act(() => {
                capturedHandler!({type: "stack_status", stackId: "my-app", stackStatus: "RUNNING"});
                capturedHandler!({type: "stack_status", stackId: "my-app", stackStatus: "RUNNING"});
            });

            await waitFor(() => expect(result.current.stacks).toEqual(refetched));
            expect(mockListStacks).toHaveBeenCalledTimes(2);
        });

        it("refetches when a container_state event carries the stack out of BACKING_UP", async () => {
            const stacks = [{id: "my-app", displayName: "My App", status: "BACKING_UP", services: []}];
            const refetched = [{id: "my-app", displayName: "My App", status: "RUNNING", hasBackup: true, services: []}];
            mockListStacks.mockResolvedValueOnce(stacks as any);
            mockListStacks.mockResolvedValueOnce(refetched as any);

            const {result} = renderHook(() => useStacks());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                capturedHandler!({
                    type: "container_state",
                    stackId: "my-app",
                    serviceName: "web",
                    containerState: "running",
                    healthStatus: "healthy",
                    stackStatus: "RUNNING",
                } as StateEvent);
            });

            await waitFor(() => expect(result.current.stacks).toEqual(refetched));
            expect(mockListStacks).toHaveBeenCalledTimes(2);
        });

        it("does not refetch for an unknown stack id", async () => {
            const stacks = [{id: "my-app", displayName: "My App", status: "BACKING_UP", services: []}];
            mockListStacks.mockResolvedValueOnce(stacks as any);

            const {result} = renderHook(() => useStacks());
            await waitFor(() => expect(result.current.loading).toBe(false));

            act(() => {
                capturedHandler!({type: "stack_status", stackId: "ghost", stackStatus: "RUNNING"});
            });

            expect(mockListStacks).toHaveBeenCalledTimes(1);
            expect(result.current.stacks[0]!.status).toBe("BACKING_UP");
        });
    });

    it("a failed initial fetch with a non-Error rejection sets a generic message", async () => {
        mockListStacks.mockRejectedValue("boom");

        const {result} = renderHook(() => useStacks());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Failed to fetch stacks");
        expect(result.current.stacks).toEqual([]);
    });
});
