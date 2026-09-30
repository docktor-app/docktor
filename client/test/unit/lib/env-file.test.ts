import {describe, expect, it} from "vitest";
import {
    applyTableRows,
    countPassthroughLines,
    isSecretKey,
    parseEnvFile,
    serializeEnvFile,
    toTableRows,
} from "@/lib/env-file";

describe("parseEnvFile / serializeEnvFile round-trip (RESEARCH Pitfall 4)", () => {
    const fixtures = [
        "",
        "A=1",
        "A=1\n",
        "# c\n\nA=1\r\nexport B=2\n=bad\n1X=y\nC=\n",
    ];

    it.each(fixtures)("serializeEnvFile(parseEnvFile(%j)) === input", (input) => {
        expect(serializeEnvFile(parseEnvFile(input))).toBe(input);
    });
});

describe("toTableRows", () => {
    it("returns only variable lines, in original order, with their line index", () => {
        const lines = parseEnvFile("# c\nA=1\nC=");
        expect(toTableRows(lines)).toEqual([
            {key: "A", value: "1", lineIndex: 1},
            {key: "C", value: "", lineIndex: 2},
        ]);
    });
});

describe("applyTableRows", () => {
    it("rewrites only the edited line, keeping comments in place", () => {
        const lines = parseEnvFile("# c\nA=1\nC=");
        const rows = [
            {key: "A", value: "2", lineIndex: 1},
            {key: "C", value: "", lineIndex: 2},
        ];
        expect(applyTableRows(lines, rows)).toBe("# c\nA=2\nC=");
    });

    it("drops only the removed row's line", () => {
        const lines = parseEnvFile("# c\nA=1\nC=");
        const rows = [{key: "A", value: "1", lineIndex: 1}];
        expect(applyTableRows(lines, rows)).toBe("# c\nA=1");
    });

    it("appends a new row (lineIndex null) before a trailing newline's empty passthrough line", () => {
        const lines = parseEnvFile("A=1\n");
        const rows = [
            {key: "A", value: "1", lineIndex: 0},
            {key: "D", value: "4", lineIndex: null},
        ];
        expect(applyTableRows(lines, rows)).toBe("A=1\nD=4\n");
    });
});

describe("isSecretKey (D-22)", () => {
    it.each(["DB_PASSWORD", "API_KEY", "SECRET", "GITHUB_TOKEN", "keycloak_url"])(
        "matches %s as a secret-looking key",
        (key) => {
            expect(isSecretKey(key)).toBe(true);
        },
    );

    it.each(["HOST", "PORT"])("does not match %s as a secret-looking key", (key) => {
        expect(isSecretKey(key)).toBe(false);
    });
});

describe("countPassthroughLines", () => {
    it("counts non-blank passthrough lines only", () => {
        const lines = parseEnvFile("# c\n\nA=1\nexport B=2\n");
        expect(countPassthroughLines(lines)).toBe(2);
    });

    it("returns 0 when there are no comments or unrecognised lines", () => {
        expect(countPassthroughLines(parseEnvFile("A=1\nB=2"))).toBe(0);
    });
});
