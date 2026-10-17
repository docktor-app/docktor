import path from "node:path";
import {describe, expect, it} from "vitest";
import {
    locateBindSource,
    needsOwnMounts,
    type OwnMountsView,
} from "../../../src/domain/bind-mount-sources.js";
import {toComparablePath, type ContainerMount} from "../../../src/domain/self-stack-paths.js";

const ROOT_AT_HOST: ContainerMount = {type: "bind", source: "/", destination: "/host"};
const STACKS_MOUNT: ContainerMount = {
    type: "bind",
    source: "/opt/docktor/stacks",
    destination: "/opt/docktor/stacks",
};

function container(...mounts: ContainerMount[]): OwnMountsView {
    return {kind: "container", mounts};
}

const HOST: OwnMountsView = {kind: "host"};
const UNKNOWN: OwnMountsView = {kind: "unknown"};

describe("locateBindSource", () => {
    describe("absolute sources", () => {
        it("is its own candidate when Docktor is not containerized", () => {
            expect(locateBindSource("/opt/app/data", "/work/stack", HOST)).toEqual({
                kind: "candidates",
                paths: ["/opt/app/data"],
            });
        });

        it("translates the host path through a host-root mount and never offers the bare path", () => {
            expect(locateBindSource("/opt/app/data", "/work/stack", container(ROOT_AT_HOST))).toEqual({
                kind: "candidates",
                paths: ["/host/opt/app/data"],
            });
        });

        it("offers every mount-derived candidate, the one inside the compose directory first", () => {
            const location = locateBindSource(
                "/opt/docktor/stacks/x/data",
                "/opt/docktor/stacks/x",
                container(ROOT_AT_HOST, STACKS_MOUNT),
            );

            expect(location).toEqual({
                kind: "candidates",
                paths: ["/opt/docktor/stacks/x/data", "/host/opt/docktor/stacks/x/data"],
            });
        });

        it("reads a directory that is itself the source of a bind mount from the mount destination", () => {
            const mount: ContainerMount = {type: "bind", source: "/srv/media", destination: "/media"};

            expect(locateBindSource("/srv/media", "/work/stack", container(mount))).toEqual({
                kind: "candidates",
                paths: ["/media"],
            });
        });

        it("refuses a source no own bind mount covers", () => {
            expect(locateBindSource("/srv/elsewhere", "/work/stack", container(STACKS_MOUNT))).toEqual({
                kind: "refused",
                reason: "not-visible",
            });
        });

        it("never reads through a mount that is not a bind mount", () => {
            const volume: ContainerMount = {type: "volume", source: "/", destination: "/host"};

            expect(locateBindSource("/opt/app/data", "/work/stack", container(volume))).toEqual({
                kind: "refused",
                reason: "not-visible",
            });
        });

        it("refuses when the mounts are unknown", () => {
            expect(locateBindSource("/opt/app/data", "/work/stack", UNKNOWN)).toEqual({
                kind: "refused",
                reason: "mounts-unknown",
            });
        });
    });

    describe("relative sources", () => {
        const composeDir = path.resolve("work", "stack");

        it.each([HOST, UNKNOWN, container()])("resolves a source inside the compose directory (%j)", (view) => {
            expect(locateBindSource("./data", composeDir, view)).toEqual({
                kind: "candidates",
                paths: [path.resolve(composeDir, "data")],
            });
        });

        it("resolves a source escaping the compose directory when Docktor is not containerized", () => {
            expect(locateBindSource("../shared", composeDir, HOST)).toEqual({
                kind: "candidates",
                paths: [path.resolve(composeDir, "..", "shared")],
            });
        });

        it("refuses a source escaping the compose directory when the mounts are unknown", () => {
            expect(locateBindSource("../shared", composeDir, UNKNOWN)).toEqual({
                kind: "refused",
                reason: "mounts-unknown",
            });
        });

        it("refuses a source escaping the compose directory that no own mount contains", () => {
            expect(locateBindSource("../shared", composeDir, container())).toEqual({
                kind: "refused",
                reason: "not-visible",
            });
        });

        it.skipIf(process.platform === "win32")(
            "accepts a source escaping the compose directory that lies within an own mount destination",
            () => {
                const mount: ContainerMount = {type: "bind", source: "/srv", destination: "/work"};

                expect(locateBindSource("../shared", "/work/stack", container(mount))).toEqual({
                    kind: "candidates",
                    paths: [path.resolve("/work/stack", "..", "shared")],
                });
                expect(toComparablePath(path.resolve("/work/stack", "..", "shared"))).toContain("/work/shared");
            },
        );
    });

    describe("home-relative sources", () => {
        it.each([HOST, UNKNOWN, container(ROOT_AT_HOST)])("refuses ~ and ~/data in every view (%j)", (view) => {
            expect(locateBindSource("~/data", "/work/stack", view)).toEqual({kind: "refused", reason: "home-relative"});
            expect(locateBindSource("~", "/work/stack", view)).toEqual({kind: "refused", reason: "home-relative"});
        });
    });
});

describe("needsOwnMounts", () => {
    const composeDir = path.resolve("work", "stack");

    it("is true for an absolute source and a relative source leaving the compose directory", () => {
        expect(needsOwnMounts("/opt/app/data", composeDir)).toBe(true);
        expect(needsOwnMounts("../shared", composeDir)).toBe(true);
    });

    it("is false for a source inside the compose directory and for a refused ~ source", () => {
        expect(needsOwnMounts("./data", composeDir)).toBe(false);
        expect(needsOwnMounts(".", composeDir)).toBe(false);
        expect(needsOwnMounts("~/data", composeDir)).toBe(false);
    });
});
