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

    describe("COMPOSE_PROJECT_NAME in the .env", () => {
        it("wins over name: and the directory", () => {
            expect(
                composeProjectName({
                    composeContent: `name: other\n${COMPOSE}`,
                    envContent: "COMPOSE_PROJECT_NAME=Shop\n",
                    directoryName: "dir",
                }),
            ).toEqual({name: "shop", source: "env-file"});
        });

        it("is ignored when empty", () => {
            expect(
                composeProjectName({composeContent: COMPOSE, envContent: "COMPOSE_PROJECT_NAME=\n", directoryName: "dir"}),
            ).toEqual({name: "dir", source: "directory"});
        });

        it("is read with an export prefix and quotes", () => {
            expect(
                composeProjectName({
                    composeContent: COMPOSE,
                    envContent: 'export COMPOSE_PROJECT_NAME="quoted"\n',
                    directoryName: "dir",
                }),
            ).toEqual({name: "quoted", source: "env-file"});
        });
    });

    describe("top-level name: in the compose file", () => {
        const withName = (name: string): string => `name: ${name}\n${COMPOSE}`;

        it("wins over the directory", () => {
            expect(composeProjectName({composeContent: withName("Blog"), envContent: null, directoryName: "dir"})).toEqual({
                name: "blog",
                source: "compose-file",
            });
        });

        it("is interpolated from the .env", () => {
            expect(
                composeProjectName({
                    composeContent: withName("${PROJECT:-fallback}"),
                    envContent: "PROJECT=wiki\n",
                    directoryName: "dir",
                }),
            ).toEqual({name: "wiki", source: "compose-file"});
        });

        it("uses the inline default when the variable is unset", () => {
            expect(
                composeProjectName({composeContent: withName("${PROJECT:-fallback}"), envContent: null, directoryName: "dir"}),
            ).toEqual({name: "fallback", source: "compose-file"});
        });

        it("falls back to the directory when a reference cannot be resolved", () => {
            expect(
                composeProjectName({composeContent: withName("${MISSING}"), envContent: null, directoryName: "dir"}),
            ).toEqual({name: "dir", source: "directory"});
        });

        it("falls back to the directory when name: is not a string", () => {
            expect(composeProjectName({composeContent: withName("42"), envContent: null, directoryName: "dir"})).toEqual({
                name: "dir",
                source: "directory",
            });
        });

        it("falls back to the directory when the compose file does not parse", () => {
            expect(
                composeProjectName({composeContent: "services: [unclosed\n  - : :", envContent: null, directoryName: "dir"}),
            ).toEqual({name: "dir", source: "directory"});
        });
    });
});
