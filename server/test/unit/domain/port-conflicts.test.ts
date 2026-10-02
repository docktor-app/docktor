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

    describe("tier 2: containers", () => {
        it("attributes a conflict to a non-Docktor container by name, stripping the leading slash", () => {
            const input = baseInput({
                stacks: [],
                containers: [
                    {
                        containerName: "/legacy-nginx",
                        composeProject: null,
                        publishedPorts: [{port: 8080, protocol: "tcp"}],
                    },
                ],
            });
            expect(resolvePortConflicts(input)).toEqual([
                {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "container", containerName: "legacy-nginx"}},
            ]);
        });

        it("attributes a conflict to the owning Docktor stack when the container's compose project matches a known stack id, regardless of that stack's status", () => {
            const input = baseInput({
                stacks: [blogStack({status: "STOPPED"})],
                containers: [
                    {
                        containerName: "/blog-web-1",
                        composeProject: "blog",
                        publishedPorts: [{port: 8080, protocol: "tcp"}],
                    },
                ],
            });
            expect(resolvePortConflicts(input)).toEqual([
                {
                    port: 8080,
                    protocol: "tcp",
                    serviceName: "web",
                    holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"},
                },
            ]);
        });

        it("ignores a container whose compose project equals the deploying stack (self-exclusion)", () => {
            const input = baseInput({
                stackId: "new-app",
                stacks: [],
                containers: [
                    {
                        containerName: "/new-app-web-1",
                        composeProject: "new-app",
                        publishedPorts: [{port: 8080, protocol: "tcp"}],
                    },
                ],
            });
            expect(resolvePortConflicts(input)).toEqual([]);
        });
    });

    describe("tier 3: listeners", () => {
        it("attributes a conflict to a named process", () => {
            const input = baseInput({
                stacks: [],
                listeners: [{port: 8080, protocol: "tcp", processName: "nginx", pid: 4242}],
            });
            expect(resolvePortConflicts(input)).toEqual([
                {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: 4242}},
            ]);
        });

        it("reports an unknown holder when the listener's owning process could not be identified", () => {
            const input = baseInput({
                stacks: [],
                listeners: [{port: 8080, protocol: "tcp", processName: null, pid: null}],
            });
            expect(resolvePortConflicts(input)).toEqual([
                {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}},
            ]);
        });
    });

    it("precedence: a DB-tier stack holder wins over a matching container holder for the same port", () => {
        const input = baseInput({
            stacks: [blogStack()],
            containers: [
                {
                    containerName: "/legacy-nginx",
                    composeProject: null,
                    publishedPorts: [{port: 8080, protocol: "tcp"}],
                },
            ],
        });
        const conflicts = resolvePortConflicts(input);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].holder).toEqual({kind: "stack", stackId: "blog", stackDisplayName: "Blog"});
    });
});
