import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {JsonLinesDecoder} from "../../../src/lib/json-lines-decoder.js";

describe("JsonLinesDecoder", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("decodes one event per chunk", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push(Buffer.from('{"a":1}\n'))).toEqual([{a: 1}]);
        expect(decoder.push(Buffer.from('{"a":2}\n'))).toEqual([{a: 2}]);
    });

    it("decodes two events delivered in one chunk", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push(Buffer.from('{"a":1}\n{"a":2}\n'))).toEqual([{a: 1}, {a: 2}]);
    });

    it("decodes an event split across three chunks exactly once", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push('{"name":')).toEqual([]);
        expect(decoder.push('"web"')).toEqual([]);
        expect(decoder.push("}\n")).toEqual([{name: "web"}]);
        expect(decoder.push("")).toEqual([]);
    });

    it("keeps a multi-byte character split between two chunks intact", () => {
        const decoder = new JsonLinesDecoder();
        const bytes = Buffer.from('{"service":"ü"}\n');
        const split = bytes.indexOf(0xc3) + 1;
        expect(decoder.push(bytes.subarray(0, split))).toEqual([]);
        expect(decoder.push(bytes.subarray(split))).toEqual([{service: "ü"}]);
    });

    it("accepts CRLF line endings", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push('{"a":1}\r\n{"a":2}\r\n')).toEqual([{a: 1}, {a: 2}]);
    });

    it("ignores blank lines", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push('\n\n{"a":1}\n   \n')).toEqual([{a: 1}]);
    });

    it("skips a malformed line without losing the lines around it", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push('{"a":1}\n{not json\n{"a":3}\n')).toEqual([{a: 1}, {a: 3}]);
    });

    it("warns about a malformed line with its length only, never its content", () => {
        const decoder = new JsonLinesDecoder();
        decoder.push("{secret-path\n");
        const warnings = vi.mocked(console.warn).mock.calls.flat().join(" ");
        expect(warnings).toContain("12");
        expect(warnings).not.toContain("secret-path");
    });

    it("returns a trailing line without newline only once its newline arrives", () => {
        const decoder = new JsonLinesDecoder();
        expect(decoder.push('{"a":1}')).toEqual([]);
        expect(decoder.push("\n")).toEqual([{a: 1}]);
    });

    it("drops an unterminated line longer than the limit and resumes at the next line", () => {
        const decoder = new JsonLinesDecoder({maxLineLength: 64});
        expect(decoder.push(`{"a":"${"x".repeat(100)}`)).toEqual([]);
        expect(decoder.push(`${"y".repeat(50)}"}\n{"a":2}\n`)).toEqual([{a: 2}]);
    });

    it("warns once about a dropped line, with its length only", () => {
        const decoder = new JsonLinesDecoder({maxLineLength: 16});
        decoder.push("z".repeat(40));
        decoder.push("z".repeat(40));
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).not.toContain("zzzz");
    });
});
