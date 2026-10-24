import path from "node:path";
import {describe, expect, it} from "vitest";
import {
    locateBindSource,
    needsOwnMounts,
    resolveHomeRelativeSources,
    type HomeSourceResolution,
    type OwnMountsView,
} from "../../../src/domain/bind-mount-sources.js";
import type {ProjectContainer, ProjectContainerMount} from "../../../src/domain/compose-project.js";
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
        it.each([HOST, UNKNOWN, container(ROOT_AT_HOST)])("refuses a raw ~ and ~/data in every view as a backstop (%j)", (view) => {
            expect(locateBindSource("~/data", "/work/stack", view)).toEqual({kind: "refused", reason: "home-unresolved"});
            expect(locateBindSource("~", "/work/stack", view)).toEqual({kind: "refused", reason: "home-unresolved"});
        });
    });
});

function projectContainer(service: string | null, mounts: readonly ProjectContainerMount[], index = 1): ProjectContainer {
    return {id: `c${index}`, name: `app-${service ?? "x"}-${index}`, service, running: true, mounts};
}

const bind = (source: string, destination: string): ProjectContainerMount => ({type: "bind", source, destination});
const declared = (path: string, serviceName: string, containerPath: string) => ({path, serviceName, containerPath});

describe("resolveHomeRelativeSources", () => {
    const resolved = (hostPath: string): HomeSourceResolution => ({kind: "resolved", hostPath});
    const unresolved = (reason: "no-container" | "inconsistent" | "unsupported"): HomeSourceResolution => ({
        kind: "unresolved",
        reason,
    });

    it("resolves ~/data to the host directory the service's container mounts at that destination", () => {
        const result = resolveHomeRelativeSources(
            [declared("~/data", "db", "/var/lib/data")],
            [projectContainer("db", [bind("/home/alice/data", "/var/lib/data")])],
        );

        expect(result.get("~/data")).toEqual(resolved("/home/alice/data"));
    });

    it("resolves a bare ~ to the home directory the container mounts", () => {
        const result = resolveHomeRelativeSources(
            [declared("~", "db", "/root")],
            [projectContainer("db", [bind("/home/alice", "/root")])],
        );

        expect(result.get("~")).toEqual(resolved("/home/alice"));
    });

    it("leaves sources that do not start with ~ out of the result", () => {
        const result = resolveHomeRelativeSources(
            [declared("./data", "db", "/a"), declared("/opt/x", "db", "/b"), declared("named", "db", "/c")],
            [projectContainer("db", [bind("/opt/x", "/b")])],
        );

        expect(result.size).toBe(0);
    });

    it("is unresolved when no container of the service mounts that destination", () => {
        const containers = [
            projectContainer("web", [bind("/home/alice/data", "/var/lib/data")]),
            projectContainer("db", [bind("/home/alice/data", "/other")]),
            projectContainer("db", [{type: "volume", name: "v", source: "/var/lib/docker/volumes/v/_data", destination: "/var/lib/data"}], 2),
        ];

        expect(resolveHomeRelativeSources([declared("~/data", "db", "/var/lib/data")], containers).get("~/data")).toEqual(
            unresolved("no-container"),
        );
        expect(resolveHomeRelativeSources([declared("~/data", "db", "/var/lib/data")], []).get("~/data")).toEqual(
            unresolved("no-container"),
        );
    });

    it("is inconsistent when two services resolve the same ~ source to different directories", () => {
        const result = resolveHomeRelativeSources(
            [declared("~/data", "db", "/a"), declared("~/data", "web", "/b")],
            [projectContainer("db", [bind("/home/alice/data", "/a")]), projectContainer("web", [bind("/home/bob/data", "/b")])],
        );

        expect(result.get("~/data")).toEqual(unresolved("inconsistent"));
    });

    it("is inconsistent when the recorded source does not end in the declared remainder", () => {
        const result = resolveHomeRelativeSources(
            [declared("~/data", "db", "/a")],
            [projectContainer("db", [bind("/srv/elsewhere", "/a")])],
        );

        expect(result.get("~/data")).toEqual(unresolved("inconsistent"));
    });

    it("resolves the same ~ source declared by two services to one directory", () => {
        const result = resolveHomeRelativeSources(
            [declared("~/data", "db", "/a"), declared("~/data", "web", "/b")],
            [projectContainer("db", [bind("/home/alice/data", "/a")]), projectContainer("web", [bind("/home/alice/data/", "/b")])],
        );

        expect(result.get("~/data")).toEqual(resolved("/home/alice/data"));
    });

    it.each(["~other/x", "~+/x", "~-"])("does not support %s", (declaredPath) => {
        const result = resolveHomeRelativeSources(
            [declared(declaredPath, "db", "/a")],
            [projectContainer("db", [bind("/home/other/x", "/a")])],
        );

        expect(result.get(declaredPath)).toEqual(unresolved("unsupported"));
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
