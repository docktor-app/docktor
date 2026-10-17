import {describe, expect, it} from "vitest";

import {composeProjectName, normalizeComposeProjectName} from "../../../src/domain/compose-project-name.js";

const COMPOSE = "services:\n  web:\n    image: nginx:latest\n";

describe("normalizeComposeProjectName", () => {
    it("lowercases and drops characters outside a-z 0-9 _ -", () => {
        expect(normalizeComposeProjectName("My App.v2")).toBe("myappv2");
    });

    it("keeps underscores and hyphens inside the name", () => {
        expect(normalizeComposeProjectName("my_app-2")).toBe("my_app-2");
    });

    it("strips leading underscores and hyphens", () => {
        expect(normalizeComposeProjectName("-_app")).toBe("app");
    });

    it("returns an empty string when nothing usable is left", () => {
        expect(normalizeComposeProjectName("...")).toBe("");
    });
});

describe("composeProjectName", () => {
    it("falls back to the normalised directory name without a .env or a name:", () => {
        expect(composeProjectName({composeContent: COMPOSE, envContent: null, directoryName: "Memos"})).toEqual({
            name: "memos",
            source: "directory",
        });
    });
});
