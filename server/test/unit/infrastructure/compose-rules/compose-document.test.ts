import {describe, expect, it} from "vitest";
import {
    asRecord,
    isWithinDirectory,
    resolveHostPath,
    serviceEntries,
} from "../../../../src/infrastructure/compose-rules/compose-document.js";

describe("compose-document", () => {
    describe("asRecord", () => {
        it("returns the object for a plain object", () => {
            expect(asRecord({a: 1})).toEqual({a: 1});
        });

        it("returns null for an array", () => {
            expect(asRecord([1, 2])).toBeNull();
        });

        it("returns null for null", () => {
            expect(asRecord(null)).toBeNull();
        });

        it("returns null for a scalar", () => {
            expect(asRecord("just a string")).toBeNull();
            expect(asRecord(42)).toBeNull();
        });
    });

    describe("serviceEntries", () => {
        it("returns [name, definition] pairs in declaration order", () => {
            const doc = {
                services: {
                    web: {image: "nginx"},
                    db: {image: "postgres"},
                },
            };
            expect(serviceEntries(doc)).toEqual([
                ["web", {image: "nginx"}],
                ["db", {image: "postgres"}],
            ]);
        });

        it("returns [] when services is missing", () => {
            expect(serviceEntries({})).toEqual([]);
        });

        it("returns [] for an empty document ({})", () => {
            expect(serviceEntries({services: {}})).toEqual([]);
        });

        it("returns [] for a non-object document", () => {
            expect(serviceEntries("just a string")).toEqual([]);
            expect(serviceEntries(null)).toEqual([]);
            expect(serviceEntries(undefined)).toEqual([]);
        });

        it("skips a service definition that isn't a plain mapping", () => {
            const doc = {services: {web: {image: "nginx"}, broken: "not-an-object"}};
            expect(serviceEntries(doc)).toEqual([["web", {image: "nginx"}]]);
        });
    });

    describe("isWithinDirectory — probe #20 adjacency (never string-prefix matching)", () => {
        it("classifies a sibling directory with a shared prefix as outside", () => {
            expect(isWithinDirectory("/stacks/foo", "/stacks/foo-evil")).toBe(false);
        });

        it("classifies the directory itself as inside", () => {
            expect(isWithinDirectory("/stacks/foo", "/stacks/foo")).toBe(true);
        });

        it("classifies a subpath that normalises back inside as inside", () => {
            expect(isWithinDirectory("/stacks/foo", "/stacks/foo/volumes/../data")).toBe(true);
        });

        it("classifies a subpath that normalises outside as outside", () => {
            expect(isWithinDirectory("/stacks/foo", "/stacks/foo/../bar")).toBe(false);
        });

        it("handles the win32 flavour when the directory is drive-letter-rooted", () => {
            expect(
                isWithinDirectory("C:\\docktor\\stacks\\foo", "C:\\docktor\\stacks\\foo\\data"),
            ).toBe(true);
        });
    });

    describe("resolveHostPath", () => {
        const stackDirectory = "/opt/docktor/stacks/app";

        it("resolves a relative path against the stack directory", () => {
            expect(resolveHostPath(stackDirectory, "./volumes/data")).toBe(
                "/opt/docktor/stacks/app/volumes/data",
            );
        });

        it("resolves '.' to the stack directory itself", () => {
            expect(resolveHostPath(stackDirectory, ".")).toBe(stackDirectory);
        });

        it("resolves a parent-relative path outside the stack directory", () => {
            expect(resolveHostPath(stackDirectory, "../other")).toBe("/opt/docktor/stacks/other");
        });

        it("normalises an absolute path as-is", () => {
            expect(resolveHostPath(stackDirectory, "/opt/docktor/stacks/app/data")).toBe(
                "/opt/docktor/stacks/app/data",
            );
        });

        it("expands a ~-prefixed path to the real home directory (never inside the stack directory)", () => {
            const resolved = resolveHostPath(stackDirectory, "~/data");
            expect(isWithinDirectory(stackDirectory, resolved)).toBe(false);
        });
    });
});
