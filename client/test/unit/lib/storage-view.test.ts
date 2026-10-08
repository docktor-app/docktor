import {describe, expect, it} from "vitest";
import type {StorageStack} from "@/lib/storage-api";
import {DEFAULT_STORAGE_SORT, sortStorageStacks} from "@/lib/storage-view";

function makeStack(displayName: string, volumeSizeBytes: number | null): StorageStack {
    return {
        stackId: displayName.toLowerCase(),
        displayName,
        volumeSizeBytes,
        measuredAt: volumeSizeBytes === null ? null : "2026-10-08T03:00:00Z",
        volumes: [],
    };
}

const names = (stacks: StorageStack[]) => stacks.map((stack) => stack.displayName);

describe("sortStorageStacks", () => {
    const stacks = [makeStack("a", 10), makeStack("b", null), makeStack("c", 30), makeStack("d", 30)];

    it("defaults to size descending", () => {
        expect(DEFAULT_STORAGE_SORT).toEqual({key: "size", direction: "desc"});
    });

    it("orders size descending, breaks ties by name and puts unmeasured stacks last", () => {
        expect(names(sortStorageStacks(stacks, DEFAULT_STORAGE_SORT))).toEqual(["c", "d", "a", "b"]);
    });

    it("returns a new array and leaves the input untouched", () => {
        const input = [...stacks];
        const result = sortStorageStacks(input, DEFAULT_STORAGE_SORT);
        expect(result).not.toBe(input);
        expect(names(input)).toEqual(["a", "b", "c", "d"]);
    });
});
