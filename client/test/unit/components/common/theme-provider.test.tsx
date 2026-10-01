import {beforeEach, describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import {THEME_STORAGE_KEY, ThemeProvider} from "@/components/common/theme-provider";
import {toSonnerTheme} from "@/components/common/themed-toaster";

describe("ThemeProvider", () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove("dark");
    });

    it("puts the dark class on document.documentElement when localStorage holds theme=dark", async () => {
        localStorage.setItem(THEME_STORAGE_KEY, "dark");

        render(
            <ThemeProvider>
                <p>content</p>
            </ThemeProvider>,
        );

        await screen.findByText("content");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
});

describe("toSonnerTheme", () => {
    it("maps 'dark' to 'dark'", () => {
        expect(toSonnerTheme("dark")).toBe("dark");
    });

    it("maps 'light' to 'light'", () => {
        expect(toSonnerTheme("light")).toBe("light");
    });

    it("maps 'system', undefined, and any other value to 'system'", () => {
        expect(toSonnerTheme("system")).toBe("system");
        expect(toSonnerTheme(undefined)).toBe("system");
        expect(toSonnerTheme("anything-else")).toBe("system");
    });
});

describe("index.html pre-paint theme script", () => {
    it("contains the THEME_STORAGE_KEY value and a prefers-color-scheme media query", () => {
        const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");

        expect(html).toContain(THEME_STORAGE_KEY);
        expect(html).toContain("prefers-color-scheme: dark");
    });
});
