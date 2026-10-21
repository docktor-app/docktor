import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {APP_VERSION} from "@/lib/app-version";

// client/package.json always carries a version field
const {version} = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf8")) as {version: string};

// The sidebar shows the client version and the release is cut from the root version, so they must not drift.
function manifestVersion(manifest: string): string {
    const parsed = JSON.parse(readFileSync(resolve(__dirname, "../../../../", manifest), "utf8")) as {version: string};
    return parsed.version;
}

describe("APP_VERSION (UI-01, D-02)", () => {
    it("equals the client/package.json version injected through the build define", () => {
        expect(APP_VERSION).toBe(version);
    });

    it("looks like a semantic version, so a missing define (empty string) fails", () => {
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("carries the same version as the root, shared and server package.json, so the sidebar shows the release version (REL-01)", () => {
        expect({
            root: manifestVersion("package.json"),
            shared: manifestVersion("shared/package.json"),
            server: manifestVersion("server/package.json"),
            client: APP_VERSION,
        }).toEqual({root: APP_VERSION, shared: APP_VERSION, server: APP_VERSION, client: APP_VERSION});
    });
});
