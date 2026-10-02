import {describe, expect, it} from "vitest";
import type {RequestedHostPort} from "../../../src/domain/host-ports.js";
import {
    type DocktorStackPorts,
    type ResolvePortConflictsInput,
    resolvePortConflicts,
} from "../../../src/domain/port-conflicts.js";

const WEB_8080: RequestedHostPort = {port: 8080, protocol: "tcp", serviceName: "web", hostIp: null};

function blogStack(overrides: Partial<DocktorStackPorts> = {}): DocktorStackPorts {
    return {
        id: "blog",
        displayName: "Blog",
        status: "RUNNING",
        services: [{ports: JSON.stringify([{host: 8080, container: 80, protocol: "tcp"}])}],
        ...overrides,
    };
}

function baseInput(overrides: Partial<ResolvePortConflictsInput> = {}): ResolvePortConflictsInput {
    return {
        stackId: "new-app",
        requested: [WEB_8080],
        stacks: [blogStack()],
        containers: [],
        listeners: [],
        ...overrides,
    };
}

describe("resolvePortConflicts", () => {
    it("attributes a conflict to a running Docktor stack holding the port", () => {
        expect(resolvePortConflicts(baseInput())).toEqual([
            {
                port: 8080,
                protocol: "tcp",
                serviceName: "web",
                holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"},
            },
        ]);
    });

    it("ignores a stack that is not in a port-holding status", () => {
        const input = baseInput({stacks: [blogStack({status: "STOPPED"})]});
        expect(resolvePortConflicts(input)).toEqual([]);
    });

    it("never reports a conflict with the stack being deployed (self-exclusion)", () => {
        const input = baseInput({stackId: "blog", stacks: [blogStack()]});
        expect(resolvePortConflicts(input)).toEqual([]);
    });

    it("ignores malformed Service.ports JSON on another stack instead of throwing", () => {
        const input = baseInput({
            stacks: [blogStack({services: [{ports: "{not valid json"}]})],
        });
        expect(() => resolvePortConflicts(input)).not.toThrow();
        expect(resolvePortConflicts(input)).toEqual([]);
    });

    it("returns no entry for a requested port with no holder in any tier", () => {
        const input = baseInput({stacks: []});
        expect(resolvePortConflicts(input)).toEqual([]);
    });
});
