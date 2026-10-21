import {describe, expect, it} from "vitest";
import type {OwnMountsView} from "../../../src/domain/bind-mount-sources.js";
import {localDirectoryIdentity} from "../../../src/domain/directory-identity.js";
import {
    composeDirectoryOf,
    findManagingStack,
    type IdentifiedManagedStack,
    type ManagedStackLocation,
} from "../../../src/domain/managed-stack-paths.js";

const HOST: OwnMountsView = {kind: "host"};
const CONTAINER: OwnMountsView = {
    kind: "container",
    mounts: [
        {type: "bind", source: "/", destination: "/host"},
        {type: "bind", source: "/opt/docktor/stacks", destination: "/opt/docktor/stacks"},
    ],
};

const APP: ManagedStackLocation = {id: "app", displayName: "App", hostPath: "/opt/app"};

function identified(stack: ManagedStackLocation, view: OwnMountsView = HOST): IdentifiedManagedStack {
    return {
        id: stack.id,
        displayName: stack.displayName,
        identity: localDirectoryIdentity([stack.hostPath], view),
    };
}

function find(composePath: string, managed: readonly IdentifiedManagedStack[], view: OwnMountsView = HOST) {
    return findManagingStack(localDirectoryIdentity([composeDirectoryOf(composePath)], view), managed);
}

describe("findManagingStack (G-18-2: one Docktor stack per directory)", () => {
    it("returns the stack whose directory is the compose file's directory", () => {
        expect(find("/opt/app/docker-compose.yml", [identified(APP)])).toEqual({id: "app", displayName: "App"});
    });

    it("ignores a trailing separator on the stored hostPath", () => {
        expect(find("/opt/app/docker-compose.yml", [identified({...APP, hostPath: "/opt/app/"})])).toEqual({
            id: "app",
            displayName: "App",
        });
    });

    it("matches a compose path written with backslashes", () => {
        expect(find("\\opt\\app\\docker-compose.yml", [identified(APP)])).toEqual({id: "app", displayName: "App"});
    });

    it("matches a sibling compose file in the managed directory", () => {
        expect(find("/opt/app/compose.yml", [identified(APP)])).toEqual({id: "app", displayName: "App"});
    });

    it("does not match a directory that merely shares a prefix", () => {
        expect(find("/opt/app2/docker-compose.yml", [identified(APP)])).toBeNull();
    });

    it("does not match the parent directory", () => {
        expect(find("/opt/docker-compose.yml", [identified(APP)])).toBeNull();
    });

    it("returns null when no stack is managed", () => {
        expect(find("/opt/app/docker-compose.yml", [])).toBeNull();
    });
});

describe("findManagingStack across spellings (review WR-10)", () => {
    it("matches the /host spelling of a managed stack's directory", () => {
        const blog = identified({id: "blog", displayName: "Blog", hostPath: "/opt/docktor/stacks/blog"}, CONTAINER);

        expect(find("/host/opt/docktor/stacks/blog/docker-compose.yml", [blog], CONTAINER)).toEqual({
            id: "blog",
            displayName: "Blog",
        });
    });

    it("does not match another directory beneath the same mount", () => {
        const blog = identified({id: "blog", displayName: "Blog", hostPath: "/opt/docktor/stacks/blog"}, CONTAINER);

        expect(find("/host/opt/docktor/stacks/wiki/docker-compose.yml", [blog], CONTAINER)).toBeNull();
    });
});

describe("composeDirectoryOf", () => {
    it("returns the directory of a compose path, written with either separator", () => {
        expect(composeDirectoryOf("/opt/app/docker-compose.yml")).toBe("/opt/app");
        expect(composeDirectoryOf("\\opt\\app\\docker-compose.yml")).toBe("/opt/app");
    });

    it("returns the root for a file in the root and the empty string for a bare file name", () => {
        expect(composeDirectoryOf("/docker-compose.yml")).toBe("/");
        expect(composeDirectoryOf("docker-compose.yml")).toBe("");
    });
});
