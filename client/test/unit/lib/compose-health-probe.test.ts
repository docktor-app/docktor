import {describe, expect, it} from "vitest";
import {parse} from "yaml";
import {readHealthProbes, removeHealthProbe, setHealthProbe} from "@/lib/compose-health-probe";

const TWO_SERVICES = "services:\n  web:\n    image: nginx # pinned\n  db:\n    image: postgres\n";

type ComposeShape = {services: Record<string, Record<string, unknown>>};

function parseCompose(content: string): ComposeShape {
    return parse(content) as ComposeShape;
}

describe("readHealthProbes", () => {
    it("lists services in document order with null probes", () => {
        expect(readHealthProbes(TWO_SERVICES)).toEqual({
            ok: true,
            services: [
                {serviceName: "web", probe: null},
                {serviceName: "db", probe: null},
            ],
        });
    });

    it("returns ok:false for unparseable YAML", () => {
        expect(readHealthProbes("services: [unclosed")).toEqual({ok: false});
    });

    it("returns ok:false when services is not a map", () => {
        expect(readHealthProbes("services:\n  - web\n")).toEqual({ok: false});
    });

    it("returns ok:false for duplicate keys (the file does not parse cleanly)", () => {
        expect(readHealthProbes("services:\n  web:\n    image: a\n  web:\n    image: b\n")).toEqual({ok: false});
    });

    it("reads an empty services map and a missing services key as zero services", () => {
        expect(readHealthProbes("services: {}\n")).toEqual({ok: true, services: []});
        expect(readHealthProbes("")).toEqual({ok: true, services: []});
        expect(readHealthProbes("name: demo\n")).toEqual({ok: true, services: []});
    });

    it("reads the probe url and timeout", () => {
        const content =
            "services:\n  web:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 7\n";
        expect(readHealthProbes(content)).toEqual({
            ok: true,
            services: [{serviceName: "web", probe: {url: "http://localhost:8080/health", timeout: 7}}],
        });
    });

    it("reads a probe without a timeout as timeout null", () => {
        const content = "services:\n  web:\n    x-docktor:\n      health-probe:\n        url: http://localhost/\n";
        expect(readHealthProbes(content)).toEqual({
            ok: true,
            services: [{serviceName: "web", probe: {url: "http://localhost/", timeout: null}}],
        });
    });

    it("reads a probe block without a string url as null", () => {
        const content = "services:\n  web:\n    x-docktor:\n      health-probe:\n        timeout: 5\n";
        expect(readHealthProbes(content)).toEqual({ok: true, services: [{serviceName: "web", probe: null}]});
    });

    it("treats a non-numeric timeout as null", () => {
        const content =
            "services:\n  web:\n    x-docktor:\n      health-probe:\n        url: http://localhost/\n        timeout: soon\n";
        const read = readHealthProbes(content);
        expect(read).toEqual({
            ok: true,
            services: [{serviceName: "web", probe: {url: "http://localhost/", timeout: null}}],
        });
    });
});

describe("setHealthProbe", () => {
    it("writes the block under services.web.x-docktor.health-probe and preserves comments and other services", () => {
        const next = setHealthProbe(TWO_SERVICES, "web", {url: "http://localhost:8080/health", timeout: null});

        const parsed = parseCompose(next);
        expect(parsed.services.web["x-docktor"]).toEqual({"health-probe": {url: "http://localhost:8080/health"}});
        expect(parsed.services.web.image).toBe("nginx");
        expect(parsed.services.db).toEqual({image: "postgres"});
        expect(next).toContain("# pinned");
    });

    it("writes the timeout when given", () => {
        const next = setHealthProbe(TWO_SERVICES, "web", {url: "http://localhost/", timeout: 12});
        expect(parseCompose(next).services.web["x-docktor"]).toEqual({
            "health-probe": {url: "http://localhost/", timeout: 12},
        });
    });

    it("updates in place and removes a stale timeout when timeout becomes null", () => {
        const first = setHealthProbe(TWO_SERVICES, "web", {url: "http://localhost/", timeout: 12});
        const second = setHealthProbe(first, "web", {url: "http://localhost:9000/", timeout: null});
        expect(parseCompose(second).services.web["x-docktor"]).toEqual({
            "health-probe": {url: "http://localhost:9000/"},
        });
    });

    it("keeps sibling keys inside x-docktor", () => {
        const content = "services:\n  web:\n    x-docktor:\n      other: keep-me\n";
        const next = setHealthProbe(content, "web", {url: "http://localhost/", timeout: null});
        expect(parseCompose(next).services.web["x-docktor"]).toEqual({
            other: "keep-me",
            "health-probe": {url: "http://localhost/"},
        });
    });

    it("preserves comments inside the existing probe block", () => {
        const content =
            "services:\n  web:\n    x-docktor:\n      health-probe:\n        # keep this note\n        url: http://localhost/old\n";
        const next = setHealthProbe(content, "web", {url: "http://localhost/new", timeout: null});
        expect(next).toContain("# keep this note");
        expect(next).toContain("http://localhost/new");
    });

    it("returns the content unchanged for an unknown service", () => {
        expect(setHealthProbe(TWO_SERVICES, "cache", {url: "http://localhost/", timeout: null})).toBe(TWO_SERVICES);
    });

    it("returns the content unchanged when the YAML does not parse", () => {
        const broken = "services: [unclosed";
        expect(setHealthProbe(broken, "web", {url: "http://localhost/", timeout: null})).toBe(broken);
    });

    it("returns the content unchanged when x-docktor is not a map", () => {
        const content = "services:\n  web:\n    x-docktor: true\n";
        expect(setHealthProbe(content, "web", {url: "http://localhost/", timeout: null})).toBe(content);
    });

    it("replaces an empty x-docktor key", () => {
        const content = "services:\n  web:\n    x-docktor:\n";
        const next = setHealthProbe(content, "web", {url: "http://localhost/", timeout: null});
        expect(parseCompose(next).services.web["x-docktor"]).toEqual({"health-probe": {url: "http://localhost/"}});
    });

    it("round-trips through readHealthProbes", () => {
        const next = setHealthProbe(TWO_SERVICES, "db", {url: "https://127.0.0.1:5432/", timeout: 3});
        expect(readHealthProbes(next)).toEqual({
            ok: true,
            services: [
                {serviceName: "web", probe: null},
                {serviceName: "db", probe: {url: "https://127.0.0.1:5432/", timeout: 3}},
            ],
        });
    });
});

describe("removeHealthProbe", () => {
    it("removes the probe and prunes an x-docktor map left empty", () => {
        const withProbe = setHealthProbe(TWO_SERVICES, "web", {url: "http://localhost/", timeout: null});
        const next = removeHealthProbe(withProbe, "web");

        expect(next).not.toContain("x-docktor");
        expect(parseCompose(next).services.web).toEqual({image: "nginx"});
        expect(next).toContain("# pinned");
    });

    it("keeps x-docktor when it holds another key", () => {
        const content =
            "services:\n  web:\n    x-docktor:\n      other: keep-me\n      health-probe:\n        url: http://localhost/\n";
        const next = removeHealthProbe(content, "web");
        expect(parseCompose(next).services.web["x-docktor"]).toEqual({other: "keep-me"});
    });

    it("returns the content unchanged for a service without a probe", () => {
        expect(removeHealthProbe(TWO_SERVICES, "web")).toBe(TWO_SERVICES);
    });

    it("returns the content unchanged for an unknown service", () => {
        expect(removeHealthProbe(TWO_SERVICES, "cache")).toBe(TWO_SERVICES);
    });

    it("returns the content unchanged for a service with an x-docktor map but no probe", () => {
        const content = "services:\n  web:\n    x-docktor:\n      other: keep-me\n";
        expect(removeHealthProbe(content, "web")).toBe(content);
    });

    it("returns the content unchanged when the YAML does not parse", () => {
        const broken = "services: [unclosed";
        expect(removeHealthProbe(broken, "web")).toBe(broken);
    });

    it("does not touch other services' probes", () => {
        let content = setHealthProbe(TWO_SERVICES, "web", {url: "http://localhost/a", timeout: null});
        content = setHealthProbe(content, "db", {url: "http://localhost/b", timeout: null});
        const next = removeHealthProbe(content, "web");
        expect(readHealthProbes(next)).toEqual({
            ok: true,
            services: [
                {serviceName: "web", probe: null},
                {serviceName: "db", probe: {url: "http://localhost/b", timeout: null}},
            ],
        });
    });
});
