import {describe, expect, it} from "vitest";
import {
    brownfieldAdoptSchema,
    composeFilePathSchema,
    migrationExecuteSchema,
    migrationPreviewSchema,
} from "../../../src/validation/brownfield.js";

describe("composeFilePathSchema (T-18-05)", () => {
    it.each([
        "/opt/app/docker-compose.yml",
        "/opt/app/docker-compose.yaml",
        "/opt/app/compose.yaml",
        "/opt/app/compose.yml",
        "/docker-compose.yml",
        "C:\\stacks\\app\\compose.yaml",
        "D:/stacks/app/docker-compose.yml",
    ])("accepts %s", (value) => {
        expect(composeFilePathSchema.safeParse(value).success).toBe(true);
    });

    it.each([
        ["a relative path", "docker-compose.yml"],
        ["a dot-relative path", "./app/compose.yml"],
        ["a non-compose file", "/etc/passwd"],
        ["a look-alike prefix", "/opt/app/my-docker-compose.yml"],
        ["a backup suffix", "/opt/app/docker-compose.yml.bak"],
        ["a trailing slash", "/opt/app/docker-compose.yml/"],
        ["an empty string", ""],
        ["an embedded NUL character", "/opt/app/\0docker-compose.yml"],
    ])("rejects %s", (_label, value) => {
        expect(composeFilePathSchema.safeParse(value).success).toBe(false);
    });
});

const validPreview = {
    composePath: "/opt/app/docker-compose.yml",
    volumeSelections: [{originalPath: "/srv/data", newPath: "./volumes/data", convert: true}],
    namedVolumeSelections: {pgdata: true},
};

describe("migrationPreviewSchema", () => {
    it("accepts a full valid body", () => {
        expect(migrationPreviewSchema.safeParse(validPreview).success).toBe(true);
    });

    it("rejects a non-boolean convert", () => {
        const body = {
            ...validPreview,
            volumeSelections: [{originalPath: "/srv/data", newPath: "./volumes/data", convert: "yes"}],
        };
        expect(migrationPreviewSchema.safeParse(body).success).toBe(false);
    });
});

describe("brownfieldAdoptSchema", () => {
    it("accepts a compose path with a display name", () => {
        const body = {composePath: "/opt/app/compose.yml", displayName: "My App"};
        expect(brownfieldAdoptSchema.safeParse(body).success).toBe(true);
    });

    it("rejects an empty displayName", () => {
        const body = {composePath: "/opt/app/compose.yml", displayName: ""};
        expect(brownfieldAdoptSchema.safeParse(body).success).toBe(false);
    });
});

describe("migrationExecuteSchema", () => {
    it("accepts a full valid body", () => {
        expect(migrationExecuteSchema.safeParse({...validPreview, displayName: "My App"}).success).toBe(true);
    });

    it("rejects a body without displayName", () => {
        expect(migrationExecuteSchema.safeParse(validPreview).success).toBe(false);
    });
});
