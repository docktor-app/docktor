import {describe, expect, it} from "vitest";
import {
    extractRequestedHostPorts,
    MAX_PORTS_PER_RANGE,
    MAX_REQUESTED_PORTS,
    parseEnvAssignments,
} from "../../../src/domain/host-ports.js";

describe("extractRequestedHostPorts", () => {
    it("extracts a short-form host port request", () => {
        const compose = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n";
        expect(extractRequestedHostPorts(compose, {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", hostIp: null},
        ]);
    });

    it("returns [] for invalid YAML", () => {
        expect(extractRequestedHostPorts(":\n  - [unterminated", {})).toEqual([]);
    });

    it("returns [] for a compose document without a services key", () => {
        expect(extractRequestedHostPorts("version: \"3\"\n", {})).toEqual([]);
    });

    it("returns [] for an empty string", () => {
        expect(extractRequestedHostPorts("", {})).toEqual([]);
    });

    it("ignores a container-only port entry (requests no host port)", () => {
        const compose = "services:\n  web:\n    image: nginx\n    ports:\n      - \"80\"\n";
        expect(extractRequestedHostPorts(compose, {})).toEqual([]);
    });

    it("dedupes by port/protocol, keeping the first service in declaration order", () => {
        const compose = [
            "services:",
            "  first:",
            "    ports:",
            "      - \"8080:80\"",
            "  second:",
            "    ports:",
            "      - \"8080:81\"",
        ].join("\n");
        expect(extractRequestedHostPorts(compose, {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "first", hostIp: null},
        ]);
    });

    function singlePortCompose(portEntry: unknown): string {
        return JSON.stringify({services: {web: {image: "nginx", ports: [portEntry]}}});
    }

    it("extracts a udp protocol suffix", () => {
        expect(extractRequestedHostPorts(singlePortCompose("8080:80/udp"), {})).toEqual([
            {port: 8080, protocol: "udp", serviceName: "web", hostIp: null},
        ]);
    });

    it("extracts an IPv4 host-IP prefix", () => {
        expect(extractRequestedHostPorts(singlePortCompose("127.0.0.1:8080:80"), {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", hostIp: "127.0.0.1"},
        ]);
    });

    it("extracts a bracketed IPv6 host-IP prefix", () => {
        expect(extractRequestedHostPorts(singlePortCompose("[::1]:8080:80"), {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", hostIp: "::1"},
        ]);
    });

    it("expands a host port range", () => {
        expect(extractRequestedHostPorts(singlePortCompose("8000-8002:8000-8002"), {})).toEqual([
            {port: 8000, protocol: "tcp", serviceName: "web", hostIp: null},
            {port: 8001, protocol: "tcp", serviceName: "web", hostIp: null},
            {port: 8002, protocol: "tcp", serviceName: "web", hostIp: null},
        ]);
    });

    it("caps a hostile range at MAX_PORTS_PER_RANGE and the whole result at MAX_REQUESTED_PORTS", () => {
        const result = extractRequestedHostPorts(singlePortCompose("1-65535:1-65535"), {});
        expect(result.length).toBeLessThanOrEqual(MAX_PORTS_PER_RANGE);
        expect(result.length).toBeLessThanOrEqual(MAX_REQUESTED_PORTS);
        expect(result[0]).toEqual({port: 1, protocol: "tcp", serviceName: "web", hostIp: null});
    });

    it("extracts a long-form port mapping (numeric published)", () => {
        expect(extractRequestedHostPorts(singlePortCompose({target: 80, published: 8080}), {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", hostIp: null},
        ]);
    });

    it("extracts a long-form port mapping with string published, udp protocol, and host_ip", () => {
        expect(
            extractRequestedHostPorts(
                singlePortCompose({target: 80, published: "8081", protocol: "udp", host_ip: "0.0.0.0"}),
                {},
            ),
        ).toEqual([{port: 8081, protocol: "udp", serviceName: "web", hostIp: "0.0.0.0"}]);
    });

    it("ignores a long-form mapping with no published field", () => {
        expect(extractRequestedHostPorts(singlePortCompose({target: 80}), {})).toEqual([]);
    });

    it("resolves ${VAR:-default} to the inline default when the var is unset", () => {
        expect(extractRequestedHostPorts(singlePortCompose("${WEB_PORT:-8080}:80"), {})).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", hostIp: null},
        ]);
    });

    it("resolves ${VAR:-default} to the env value when the var is set", () => {
        expect(extractRequestedHostPorts(singlePortCompose("${WEB_PORT:-8080}:80"), {WEB_PORT: "9000"})).toEqual([
            {port: 9000, protocol: "tcp", serviceName: "web", hostIp: null},
        ]);
    });

    it("skips an entry with an unresolvable ${VAR} reference (no default, not in env)", () => {
        expect(extractRequestedHostPorts(singlePortCompose("${MISSING}:80"), {})).toEqual([]);
    });
});

describe("parseEnvAssignments", () => {
    it("parses simple KEY=value lines", () => {
        expect(parseEnvAssignments("WEB_PORT=9000\n")).toEqual({WEB_PORT: "9000"});
    });

    it("ignores blank lines and full-line comments", () => {
        expect(parseEnvAssignments("\n# a comment\nWEB_PORT=9000\n")).toEqual({WEB_PORT: "9000"});
    });

    it("strips an optional export prefix", () => {
        expect(parseEnvAssignments("export WEB_PORT=9000\n")).toEqual({WEB_PORT: "9000"});
    });

    it("strips one pair of matching surrounding quotes", () => {
        expect(parseEnvAssignments('WEB_PORT="9000"\nNAME=\'blog\'\n')).toEqual({WEB_PORT: "9000", NAME: "blog"});
    });

    it("splits only on the first '=' so a value containing '=' stays intact", () => {
        expect(parseEnvAssignments("CONNECTION_STRING=host=localhost;port=5432\n")).toEqual({
            CONNECTION_STRING: "host=localhost;port=5432",
        });
    });
});
