import {describe, expect, it} from "vitest";
import type {OwnMountsView} from "../../../src/domain/bind-mount-sources.js";
import {
    hostPathsOfContainerPath,
    localDirectoryIdentity,
    relateDirectories,
} from "../../../src/domain/directory-identity.js";
import type {ContainerMount} from "../../../src/domain/self-stack-paths.js";

// Production shape: the host root at /host (read-only) and the stacks folder at its identical host path.
const MOUNTS: readonly ContainerMount[] = [
    {type: "bind", source: "/", destination: "/host"},
    {type: "bind", source: "/opt/docktor/stacks", destination: "/opt/docktor/stacks"},
];
const CONTAINER: OwnMountsView = {kind: "container", mounts: MOUNTS};
const UNKNOWN: OwnMountsView = {kind: "unknown"};
const HOST: OwnMountsView = {kind: "host"};

describe("relateDirectories in a container whose mounts are known (G-18-22-inplace)", () => {
    it("treats the /host spelling and the stacks-folder spelling of one directory as the same", () => {
        const viaHost = localDirectoryIdentity(["/host/opt/docktor/stacks/memos"], CONTAINER);
        const viaStacks = localDirectoryIdentity(["/opt/docktor/stacks/memos"], CONTAINER);

        expect(relateDirectories(viaHost, viaStacks)).toBe("same");
        expect(relateDirectories(viaStacks, viaHost)).toBe("same");
    });

    it("reports a directory containing another one as nested, in both argument orders", () => {
        const parent = localDirectoryIdentity(["/host/opt/docktor"], CONTAINER);
        const child = localDirectoryIdentity(["/opt/docktor/stacks/memos"], CONTAINER);

        expect(relateDirectories(parent, child)).toBe("nested");
        expect(relateDirectories(child, parent)).toBe("nested");
    });

    it("does not treat a shared name prefix as nesting", () => {
        const a = localDirectoryIdentity(["/opt/docktor/stacks/memos-2"], CONTAINER);
        const b = localDirectoryIdentity(["/opt/docktor/stacks/memos"], CONTAINER);

        expect(relateDirectories(a, b)).toBe("unrelated");
    });

    it("ignores a trailing slash", () => {
        const a = localDirectoryIdentity(["/opt/docktor/stacks/memos/"], CONTAINER);
        const b = localDirectoryIdentity(["/opt/docktor/stacks/memos"], CONTAINER);

        expect(relateDirectories(a, b)).toBe("same");
    });

    it("reports directories of different branches as unrelated", () => {
        const a = localDirectoryIdentity(["/host/home/u/memos"], CONTAINER);
        const b = localDirectoryIdentity(["/opt/docktor/stacks/memos"], CONTAINER);

        expect(relateDirectories(a, b)).toBe("unrelated");
    });

    it("reports mountsKnown", () => {
        expect(localDirectoryIdentity(["/opt/x"], CONTAINER).mountsKnown).toBe(true);
    });
});

describe("hostPathsOfContainerPath", () => {
    it("translates a path under a bind mount destination to the host path", () => {
        expect(hostPathsOfContainerPath("/host/srv/app", MOUNTS)).toEqual(["/srv/app"]);
        expect(hostPathsOfContainerPath("/opt/docktor/stacks/x", MOUNTS)).toEqual(["/opt/docktor/stacks/x"]);
    });

    it("returns nothing for a path outside every bind mount", () => {
        expect(hostPathsOfContainerPath("/etc", MOUNTS)).toEqual([]);
    });

    it("never translates through a volume mount", () => {
        const volumes: readonly ContainerMount[] = [{type: "volume", source: "docktor-data", destination: "/data"}];

        expect(hostPathsOfContainerPath("/data/x", volumes)).toEqual([]);
    });

    it("translates the mount destination itself", () => {
        expect(hostPathsOfContainerPath("/host", MOUNTS)).toEqual(["/"]);
    });
});

describe("relateDirectories when Docktor's mounts are unknown (fail-safe)", () => {
    it("never treats an unrecognised alias as the same directory", () => {
        const viaHost = localDirectoryIdentity(["/host/opt/x"], UNKNOWN);
        const direct = localDirectoryIdentity(["/opt/x"], UNKNOWN);

        expect(relateDirectories(viaHost, direct)).toBe("unrelated");
        expect(viaHost.mountsKnown).toBe(false);
        expect(direct.mountsKnown).toBe(false);
    });

    it("still matches identical spellings", () => {
        const a = localDirectoryIdentity(["/opt/x"], UNKNOWN);
        const b = localDirectoryIdentity(["/opt/x"], UNKNOWN);

        expect(relateDirectories(a, b)).toBe("same");
    });
});

describe("relateDirectories outside a container", () => {
    it("matches equal paths and tags every key as a host path", () => {
        const a = localDirectoryIdentity(["/srv/stacks/memos"], HOST);
        const b = localDirectoryIdentity(["/srv/stacks/memos/"], HOST);

        expect(relateDirectories(a, b)).toBe("same");
        expect(a.keys.every((key) => key.startsWith("host:"))).toBe(true);
        expect(a.mountsKnown).toBe(true);
    });

    it("matches a backslash spelling with its slash spelling", () => {
        const a = localDirectoryIdentity(["\\srv\\stacks\\memos"], HOST);
        const b = localDirectoryIdentity(["/srv/stacks/memos"], HOST);

        expect(relateDirectories(a, b)).toBe("same");
    });

    it("reports nesting and unrelated siblings", () => {
        const parent = localDirectoryIdentity(["/srv/stacks"], HOST);
        const child = localDirectoryIdentity(["/srv/stacks/memos"], HOST);
        const sibling = localDirectoryIdentity(["/srv/stacks/memos-new"], HOST);

        expect(relateDirectories(parent, child)).toBe("nested");
        expect(relateDirectories(child, sibling)).toBe("unrelated");
    });

    it("treats the root as the parent of everything", () => {
        const root = localDirectoryIdentity(["/"], HOST);
        const child = localDirectoryIdentity(["/srv"], HOST);

        expect(relateDirectories(root, child)).toBe("nested");
        expect(relateDirectories(root, root)).toBe("same");
    });
});
