import {describe, expect, it} from "vitest";
import type {StorageStack, StorageVolume} from "@/lib/storage-api";
import {
    ariaSortFor,
    DEFAULT_STORAGE_SORT,
    formatMeasurementAge,
    formatVolumeCount,
    isStorageMeasurementStale,
    nextStorageSort,
    sortStorageStacks,
    sortStorageVolumes,
} from "@/lib/storage-view";

function makeStack(displayName: string, volumeSizeBytes: number | null): StorageStack {
    return {
        stackId: displayName.toLowerCase(),
        displayName,
        volumeSizeBytes,
        measuredAt: volumeSizeBytes === null ? null : "2026-10-08T03:00:00Z",
        volumes: [],
    };
}

const names = (items: Array<{displayName: string} | {name: string}>) =>
    items.map((item) => ("displayName" in item ? item.displayName : item.name));

describe("sortStorageStacks", () => {
    const stacks = [makeStack("a", 10), makeStack("b", null), makeStack("c", 30), makeStack("d", 30)];

    it("defaults to size descending", () => {
        expect(DEFAULT_STORAGE_SORT).toEqual({key: "size", direction: "desc"});
    });

    it("orders size descending, breaks ties by name and puts unmeasured stacks last", () => {
        expect(names(sortStorageStacks(stacks, DEFAULT_STORAGE_SORT))).toEqual(["c", "d", "a", "b"]);
    });

    it("keeps unmeasured stacks last when size ascending", () => {
        expect(names(sortStorageStacks(stacks, {key: "size", direction: "asc"}))).toEqual(["a", "c", "d", "b"]);
    });

    it("sorts by name in both directions, still with unmeasured stacks last", () => {
        expect(names(sortStorageStacks(stacks, {key: "name", direction: "asc"}))).toEqual(["a", "c", "d", "b"]);
        expect(names(sortStorageStacks(stacks, {key: "name", direction: "desc"}))).toEqual(["d", "c", "a", "b"]);
    });

    it("orders several unmeasured stacks by name", () => {
        const input = [makeStack("z", null), makeStack("y", null), makeStack("x", 1)];
        expect(names(sortStorageStacks(input, DEFAULT_STORAGE_SORT))).toEqual(["x", "y", "z"]);
    });

    it("returns a new array and leaves the input untouched", () => {
        const input = [...stacks];
        const result = sortStorageStacks(input, DEFAULT_STORAGE_SORT);
        expect(result).not.toBe(input);
        expect(names(input)).toEqual(["a", "b", "c", "d"]);
    });
});

describe("sortStorageVolumes", () => {
    const volumes: StorageVolume[] = [
        {name: "x", sizeBytes: 5},
        {name: "y", sizeBytes: 9},
        {name: "z", sizeBytes: 5},
    ];

    it("sorts size descending with ties by name ascending", () => {
        expect(names(sortStorageVolumes(volumes, {key: "size", direction: "desc"}))).toEqual(["y", "x", "z"]);
    });

    it("sorts by name ascending", () => {
        expect(names(sortStorageVolumes(volumes, {key: "name", direction: "asc"}))).toEqual(["x", "y", "z"]);
    });
});

describe("nextStorageSort", () => {
    it("applies the natural direction on a new column", () => {
        expect(nextStorageSort({key: "size", direction: "desc"}, "name")).toEqual({key: "name", direction: "asc"});
        expect(nextStorageSort({key: "name", direction: "desc"}, "size")).toEqual({key: "size", direction: "desc"});
    });

    it("reverses the direction on the same column", () => {
        expect(nextStorageSort({key: "name", direction: "asc"}, "name")).toEqual({key: "name", direction: "desc"});
        expect(nextStorageSort({key: "size", direction: "desc"}, "size")).toEqual({key: "size", direction: "asc"});
    });
});

describe("ariaSortFor", () => {
    it("maps the active column to its direction and others to none", () => {
        expect(ariaSortFor({key: "size", direction: "desc"}, "size")).toBe("descending");
        expect(ariaSortFor({key: "size", direction: "desc"}, "name")).toBe("none");
        expect(ariaSortFor({key: "name", direction: "asc"}, "name")).toBe("ascending");
    });
});

describe("isStorageMeasurementStale", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

    it("is false when nothing has been measured", () => {
        expect(isStorageMeasurementStale(null, now)).toBe(false);
    });

    it("is false at 47 hours and true at 49 hours", () => {
        expect(isStorageMeasurementStale(hoursAgo(47), now)).toBe(false);
        expect(isStorageMeasurementStale(hoursAgo(49), now)).toBe(true);
    });
});

describe("formatMeasurementAge", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

    it.each([
        [1, "1 hour"],
        [30, "30 hours"],
        [49, "2 days"],
        [24 * 3 + 5, "3 days"],
    ])("formats %d hours as %s", (hours, expected) => {
        expect(formatMeasurementAge(hoursAgo(hours), now)).toBe(expected);
    });
});

describe("formatVolumeCount", () => {
    it("pluralizes", () => {
        expect(formatVolumeCount(1)).toBe("1 volume");
        expect(formatVolumeCount(3)).toBe("3 volumes");
    });
});
