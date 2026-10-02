import {describe, expect, it} from "vitest";
import {extractRequestedHostPorts, parseEnvAssignments} from "../../../src/domain/host-ports.js";

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
