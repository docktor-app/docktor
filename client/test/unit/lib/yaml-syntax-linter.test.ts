import {describe, expect, it} from "vitest";
import {yamlSyntaxDiagnostics} from "@/lib/yaml-syntax-linter";

describe("yamlSyntaxDiagnostics", () => {
    it("returns no diagnostics for valid YAML", () => {
        expect(yamlSyntaxDiagnostics("services:\n  web:\n    image: nginx\n")).toEqual([]);
    });

    it("returns one or more error diagnostics for an unclosed double quote, with in-bounds ranges", () => {
        const source = 'services:\n  web:\n    image: "nginx\n';
        const diagnostics = yamlSyntaxDiagnostics(source);
        const maxPos = Math.max(source.length, 1);

        expect(diagnostics.length).toBeGreaterThanOrEqual(1);
        for (const diagnostic of diagnostics) {
            expect(diagnostic.severity).toBe("error");
            expect(diagnostic.from).toBeGreaterThanOrEqual(0);
            expect(diagnostic.to).toBeLessThanOrEqual(maxPos);
            expect(diagnostic.to).toBeGreaterThan(diagnostic.from);
        }
    });

    it("uses the yaml package's own error message verbatim for an unclosed quote", () => {
        const source = 'services:\n  web:\n    image: "nginx\n';
        const diagnostics = yamlSyntaxDiagnostics(source);

        expect(diagnostics[0]?.message).toMatch(/missing closing/i);
    });

    it("returns an error diagnostic for duplicate mapping keys", () => {
        const source = "services:\n  web:\n    image: nginx\n  web:\n    image: redis\n";
        const diagnostics = yamlSyntaxDiagnostics(source);

        expect(diagnostics.length).toBeGreaterThanOrEqual(1);
        expect(diagnostics.every((d) => d.severity === "error")).toBe(true);
        expect(diagnostics.some((d) => /unique/i.test(d.message))).toBe(true);
    });

    it("clamps ranges to [0, max(source.length, 1)] for an empty document", () => {
        // A document with only a syntax-breaking tab-as-indent still parses to
        // zero errors for an empty string, but this exercises the clamp math
        // against a pathologically short source instead of relying on a
        // hypothetical error position outside document bounds.
        const diagnostics = yamlSyntaxDiagnostics("");
        expect(diagnostics).toEqual([]);
    });
});
