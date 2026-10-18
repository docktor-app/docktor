import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {APP_VERSION} from "@/lib/app-version";

// client/package.json always carries a version field
const {version} = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf8")) as {version: string};

describe("APP_VERSION (UI-01, D-02)", () => {
    it("equals the client/package.json version injected through the build define", () => {
        expect(APP_VERSION).toBe(version);
    });

    it("looks like a semantic version, so a missing define (empty string) fails", () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
});
