import {describe, expect, it} from "vitest";
import {parseHealthProbes} from "../../../src/lib/compose-health-probe.js";

const HOST_MESSAGE =
    "The host must be localhost, 127.0.0.1, or [::1]. Docktor sends the request to this service's container.";

function compose(probeBlock: string): string {
    return `services:\n  web:\n    image: nginx\n    x-docktor:\n${probeBlock}\n  db:\n    image: postgres\n`;
}

describe("parseHealthProbes (D-01)", () => {
    it("reads a valid block with the default timeout", () => {
        const probes = parseHealthProbes(compose("      health-probe:\n        url: http://localhost:8080/health"));

        expect(probes?.get("web")).toEqual({kind: "valid", url: "http://localhost:8080/health", timeoutMs: 5000});
    });

    it("converts an explicit timeout from seconds to milliseconds", () => {
        const probes = parseHealthProbes(
            compose("      health-probe:\n        url: http://127.0.0.1:80/\n        timeout: 7"),
        );

        expect(probes?.get("web")).toEqual({kind: "valid", url: "http://127.0.0.1:80/", timeoutMs: 7000});
    });

    it("leaves a service without the block out of the map", () => {
        const probes = parseHealthProbes(compose("      health-probe:\n        url: http://localhost/"));

        expect(probes?.has("db")).toBe(false);
    });

    it("marks a host outside the loopback allow-list invalid with the shared host message (amended D-05)", () => {
        const probes = parseHealthProbes(compose("      health-probe:\n        url: http://example.com/"));

        expect(probes?.get("web")).toEqual({kind: "invalid", message: HOST_MESSAGE});
    });

    it("marks a metadata-service address invalid", () => {
        const probes = parseHealthProbes(
            compose("      health-probe:\n        url: http://169.254.169.254/latest/meta-data"),
        );

        expect(probes?.get("web")).toMatchObject({kind: "invalid", message: HOST_MESSAGE});
    });

    it("marks a timeout outside 1-30 invalid", () => {
        const probes = parseHealthProbes(
            compose("      health-probe:\n        url: http://localhost/\n        timeout: 99"),
        );

        expect(probes?.get("web")).toEqual({kind: "invalid", message: "Enter a whole number from 1 to 30."});
    });

    it("marks a block without a url invalid", () => {
        const probes = parseHealthProbes(compose("      health-probe:\n        timeout: 5"));

        expect(probes?.get("web")).toEqual({kind: "invalid", message: "Enter a valid http:// or https:// URL."});
    });

    it("marks a health-probe given as a plain string invalid", () => {
        const probes = parseHealthProbes(compose("      health-probe: http://localhost/"));

        expect(probes?.get("web")).toMatchObject({kind: "invalid"});
    });

    it("marks an empty health-probe key invalid", () => {
        const probes = parseHealthProbes(compose("      health-probe:"));

        expect(probes?.get("web")).toMatchObject({kind: "invalid"});
    });

    it("returns null for YAML that does not parse", () => {
        expect(parseHealthProbes("services:\n  web: [unclosed")).toBeNull();
    });

    it("returns an empty map for a file without services", () => {
        expect(parseHealthProbes("version: '3'\n")?.size).toBe(0);
        expect(parseHealthProbes("")?.size).toBe(0);
    });
});
