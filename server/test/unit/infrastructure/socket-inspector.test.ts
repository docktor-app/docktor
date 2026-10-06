import {describe, expect, it} from "vitest";
import {parseLsofOutput, parseSsOutput, SocketInspector} from "../../../src/infrastructure/socket-inspector.js";

describe("parseSsOutput", () => {
    it("parses a tcp listener with an identified owning process", () => {
        const stdout = 'tcp   LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1,fd=20))';
        expect(parseSsOutput(stdout)).toEqual([{port: 3000, protocol: "tcp", processName: "node", pid: 1}]);
    });

    it("parses a udp listener with no owning process identified", () => {
        const stdout = "udp UNCONN 0 0 [::]:5353 [::]:*";
        expect(parseSsOutput(stdout)).toEqual([{port: 5353, protocol: "udp", processName: null, pid: null}]);
    });

    it("parses both lines together, ignores blank lines, and skips non-tcp/udp rows", () => {
        const stdout = [
            'tcp   LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1,fd=20))',
            "",
            "udp UNCONN 0 0 [::]:5353 [::]:*",
        ].join("\n");
        expect(parseSsOutput(stdout)).toEqual([
            {port: 3000, protocol: "tcp", processName: "node", pid: 1},
            {port: 5353, protocol: "udp", processName: null, pid: null},
        ]);
    });

    it("returns [] for empty output", () => {
        expect(parseSsOutput("")).toEqual([]);
    });
});

describe("parseLsofOutput", () => {
    it("parses a pid/command/protocol/address record into a listener", () => {
        const stdout = ["p1234", "cnginx", "PTCP", "n0.0.0.0:8080"].join("\n");
        expect(parseLsofOutput(stdout)).toEqual([{port: 8080, protocol: "tcp", processName: "nginx", pid: 1234}]);
    });

    it("applies the current pid/command to multiple n/P records under the same process", () => {
        const stdout = ["p1234", "cnginx", "PTCP", "n0.0.0.0:8080", "PTCP", "n0.0.0.0:8443"].join("\n");
        expect(parseLsofOutput(stdout)).toEqual([
            {port: 8080, protocol: "tcp", processName: "nginx", pid: 1234},
            {port: 8443, protocol: "tcp", processName: "nginx", pid: 1234},
        ]);
    });

    it("returns [] for empty output", () => {
        expect(parseLsofOutput("")).toEqual([]);
    });
});

describe("SocketInspector", () => {
    it("returns the ss-parsed listeners when ss succeeds", async () => {
        const run = async (file: string) => {
            if (file === "ss") return {stdout: 'tcp   LISTEN 0 4096 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1,fd=20))'};
            throw new Error("should not reach lsof");
        };
        const inspector = new SocketInspector([run]);
        expect(await inspector.listListeners()).toEqual([{port: 3000, protocol: "tcp", processName: "node", pid: 1}]);
    });

    it("falls back to the lsof-parsed listeners when ss rejects", async () => {
        const run = async (file: string) => {
            if (file === "ss") throw new Error("ss: command not found");
            return {stdout: ["p1234", "cnginx", "PTCP", "n0.0.0.0:8080"].join("\n")};
        };
        const inspector = new SocketInspector([run]);
        expect(await inspector.listListeners()).toEqual([{port: 8080, protocol: "tcp", processName: "nginx", pid: 1234}]);
    });

    it("resolves [] without throwing when both ss and lsof reject", async () => {
        const run = async () => {
            throw new Error("command not found");
        };
        const inspector = new SocketInspector([run]);
        await expect(inspector.listListeners()).resolves.toEqual([]);
    });

    it("invokes ss and lsof with their fixed argv, never a shell", async () => {
        const calls: Array<{file: string; args: readonly string[]}> = [];
        const run = async (file: string, args: readonly string[]) => {
            calls.push({file, args});
            throw new Error("unavailable");
        };
        const inspector = new SocketInspector([run]);
        await inspector.listListeners();
        expect(calls).toEqual([
            {file: "ss", args: ["-H", "-l", "-n", "-p", "-t", "-u"]},
            {file: "lsof", args: ["-nP", "-iTCP", "-sTCP:LISTEN", "-iUDP", "-F", "pcPn"]},
        ]);
    });

    it("prefers the first (host-namespace) runner and falls back to the next when it fails", async () => {
        const host = async () => {
            throw new Error("no docker socket");
        };
        const local = async () => ({stdout: 'tcp LISTEN 0 1 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=7,fd=3))'});
        const inspector = new SocketInspector([host, local]);
        expect(await inspector.listListeners()).toEqual([{port: 80, protocol: "tcp", processName: "nginx", pid: 7}]);
    });

    it("uses the host-namespace result without consulting the local runner", async () => {
        const host = async () => ({stdout: 'tcp LISTEN 0 1 0.0.0.0:9000 0.0.0.0:* users:(("nc",pid=42,fd=3))'});
        const local = async () => {
            throw new Error("must not be called");
        };
        const inspector = new SocketInspector([host, local]);
        expect(await inspector.listListeners()).toEqual([{port: 9000, protocol: "tcp", processName: "nc", pid: 42}]);
    });
});
