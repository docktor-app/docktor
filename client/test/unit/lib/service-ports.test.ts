import {describe, expect, it} from "vitest";
import {formatPorts, parsePorts} from "@/lib/service-ports";

describe("parsePorts", () => {
    it("returns [] for null/undefined input", () => {
        expect(parsePorts(null)).toEqual([]);
        expect(parsePorts(undefined)).toEqual([]);
    });

    it("returns [] for invalid JSON without throwing", () => {
        expect(parsePorts("not json")).toEqual([]);
    });

    it("parses a valid array of port bindings", () => {
        expect(parsePorts('[{"host":8080,"container":80}]')).toEqual([{host: 8080, container: 80}]);
    });

    it("drops entries that are not conforming port bindings", () => {
        expect(
            parsePorts('[{"host":8080,"container":80},{"host":"nope"},null,"x",{"container":443}]'),
        ).toEqual([{host: 8080, container: 80}]);
    });

    it("returns [] when the parsed JSON is not an array", () => {
        expect(parsePorts('{"host":8080,"container":80}')).toEqual([]);
    });
});

describe("formatPorts", () => {
    it('returns "-" for null/undefined/empty input', () => {
        expect(formatPorts(null)).toBe("-");
        expect(formatPorts(undefined)).toBe("-");
        expect(formatPorts([])).toBe("-");
    });

    it("formats two bindings as a comma-separated host:container list", () => {
        expect(
            formatPorts([
                {host: 8080, container: 80},
                {host: 8443, container: 443},
            ]),
        ).toBe("8080:80, 8443:443");
    });
});
