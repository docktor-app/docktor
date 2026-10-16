import {describe, expect, it} from "vitest";
import {
    annotateManagedStacks,
    findManagingStack,
    type ManagedStackLocation,
} from "../../../src/domain/managed-stack-paths.js";

const APP: ManagedStackLocation = {id: "app", displayName: "App", hostPath: "/opt/app"};

describe("findManagingStack (G-18-2: one Docktor stack per directory)", () => {
    it("returns the stack whose hostPath is the compose file's directory", () => {
        expect(findManagingStack("/opt/app/docker-compose.yml", [APP])).toEqual({id: "app", displayName: "App"});
    });

    it("ignores a trailing separator on the stored hostPath", () => {
        expect(findManagingStack("/opt/app/docker-compose.yml", [{...APP, hostPath: "/opt/app/"}])).toEqual({
            id: "app",
            displayName: "App",
        });
    });

    it("matches a compose path written with backslashes", () => {
        expect(findManagingStack("\\opt\\app\\docker-compose.yml", [APP])).toEqual({id: "app", displayName: "App"});
    });

    it("matches a sibling compose file in the managed directory", () => {
        expect(findManagingStack("/opt/app/compose.yml", [APP])).toEqual({id: "app", displayName: "App"});
    });

    it("does not match a directory that merely shares a prefix", () => {
        expect(findManagingStack("/opt/app2/docker-compose.yml", [APP])).toBeNull();
    });

    it("does not match the parent directory", () => {
        expect(findManagingStack("/opt/docker-compose.yml", [APP])).toBeNull();
    });

    it("returns null when no stack is managed", () => {
        expect(findManagingStack("/opt/app/docker-compose.yml", [])).toBeNull();
    });
});

describe("annotateManagedStacks", () => {
    it("keeps every row in order and adds the managing stack or null without dropping fields", () => {
        const rows = [
            {path: "/opt/app/docker-compose.yml", name: "app"},
            {path: "/opt/wiki/docker-compose.yml", name: "wiki"},
        ];

        expect(annotateManagedStacks(rows, [APP])).toEqual([
            {path: "/opt/app/docker-compose.yml", name: "app", managedStack: {id: "app", displayName: "App"}},
            {path: "/opt/wiki/docker-compose.yml", name: "wiki", managedStack: null},
        ]);
    });
});
