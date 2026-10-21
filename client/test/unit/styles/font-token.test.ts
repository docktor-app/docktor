import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const FONT_PACKAGE = "@fontsource-variable/geist-mono";
const FONT_FAMILY = "Geist Mono Variable";
const MONO_TOKEN = `--font-mono: "${FONT_FAMILY}", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;`;

function fromHere(relative: string): string {
    return fileURLToPath(new URL(relative, import.meta.url));
}

function readText(path: string): string {
    return readFileSync(path, "utf8");
}

function installedPackageCss(): string {
    const candidates = [
        fromHere(`../../../../node_modules/${FONT_PACKAGE}/index.css`),
        fromHere(`../../../node_modules/${FONT_PACKAGE}/index.css`),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found === undefined) {
        throw new Error(`${FONT_PACKAGE} is not installed (looked in ${candidates.join(", ")})`);
    }
    return readText(found);
}

function statements(css: string): string[] {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

describe("Geist Mono font token (UI-03, D-05)", () => {
    const indexCss = readText(fromHere("../../../src/index.css"));

    it("imports the self-hosted font package as the first statement, before tailwindcss", () => {
        const lines = statements(indexCss);

        expect(lines[0]).toBe(`@import "${FONT_PACKAGE}";`);
        expect(lines.indexOf(`@import "${FONT_PACKAGE}";`)).toBeLessThan(lines.indexOf('@import "tailwindcss";'));
    });

    it("defines --font-mono in the @theme inline block", () => {
        const themeStart = indexCss.indexOf("@theme inline {");
        expect(themeStart).toBeGreaterThanOrEqual(0);
        const themeEnd = indexCss.indexOf("\n}", themeStart);

        expect(indexCss.slice(themeStart, themeEnd)).toContain(MONO_TOKEN);
    });

    it("loads no font from an external host", () => {
        expect(indexCss).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
    });

    it("lists the font package as a client dependency on the 5.x line", () => {
        const pkg: {dependencies?: Record<string, string>} = JSON.parse(readText(fromHere("../../../package.json")));

        expect(pkg.dependencies?.[FONT_PACKAGE]).toMatch(/^\^5\./);
    });

    it("registers the family named in the token and serves every file from a relative ./files/ URL", () => {
        const packageCss = installedPackageCss();
        const urls = [...packageCss.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/^['"]|['"]$/g, ""));

        expect(packageCss).toContain(`font-family: '${FONT_FAMILY}'`);
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            expect(url.startsWith("./files/")).toBe(true);
        }
    });
});
