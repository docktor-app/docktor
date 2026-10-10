import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useNow} from "@/hooks/use-now";

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T10:00:00.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useNow", () => {
    it("returns the current time and advances it on each tick while enabled", () => {
        const {result} = renderHook(() => useNow(60_000, true));
        const initial = result.current;
        expect(initial).toBe(new Date("2026-10-08T10:00:00.000Z").getTime());

        act(() => {
            vi.advanceTimersByTime(60_000);
        });

        expect(result.current).toBe(initial + 60_000);
    });

    it("never schedules an interval while disabled", () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

        const {result} = renderHook(() => useNow(60_000, false));
        const initial = result.current;
        act(() => {
            vi.advanceTimersByTime(180_000);
        });

        expect(setIntervalSpy).not.toHaveBeenCalled();
        expect(result.current).toBe(initial);
        setIntervalSpy.mockRestore();
    });

    it("starts ticking once enabled flips on, with a freshly read time", () => {
        const {result, rerender} = renderHook(({enabled}) => useNow(60_000, enabled), {
            initialProps: {enabled: false},
        });
        act(() => {
            vi.advanceTimersByTime(120_000);
        });
        expect(result.current).toBe(new Date("2026-10-08T10:00:00.000Z").getTime());

        rerender({enabled: true});

        expect(result.current).toBe(new Date("2026-10-08T10:02:00.000Z").getTime());
    });

    it("clears the interval on unmount", () => {
        const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

        const {unmount} = renderHook(() => useNow(60_000, true));
        unmount();

        expect(clearIntervalSpy).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        clearIntervalSpy.mockRestore();
    });
});
