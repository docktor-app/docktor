import {describe, expect, it} from "vitest";
import {
    brownfieldAdoptSchema,
    composeFilePathSchema,
    discoveredStackSchema,
    migrationExecuteSchema,
    migrationPreviewSchema,
    migrationTargetSchema,
    scanResultSchema,
    skippedDirectorySchema,
    stackDirectoryNameSchema,
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
    displayName: "My App",
    volumeSelections: [{originalPath: "/srv/data", newPath: "./volumes/data", convert: true}],
    namedVolumeSelections: {pgdata: true},
};

describe("migrationPreviewSchema", () => {
    it("accepts a full valid body", () => {
        expect(migrationPreviewSchema.safeParse(validPreview).success).toBe(true);
    });

    it("rejects a body without displayName (G-18-7)", () => {
        const {displayName: _displayName, ...body} = validPreview;
        expect(migrationPreviewSchema.safeParse(body).success).toBe(false);
    });

    it("rejects an empty displayName (G-18-7)", () => {
        expect(migrationPreviewSchema.safeParse({...validPreview, displayName: ""}).success).toBe(false);
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
    const validExecute = {...validPreview, displayName: "My App", backup: true, stopOldStack: true};

    it("accepts a full valid body", () => {
        expect(migrationExecuteSchema.safeParse(validExecute).success).toBe(true);
    });

    it("accepts a body with both choices declined", () => {
        expect(migrationExecuteSchema.safeParse({...validExecute, backup: false, stopOldStack: false}).success).toBe(
            true,
        );
    });

    it("rejects a body without displayName", () => {
        const {displayName: _displayName, ...body} = validExecute;
        expect(migrationExecuteSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a body without backup (D-12)", () => {
        const {backup: _backup, ...body} = validExecute;
        expect(migrationExecuteSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a body without stopOldStack (D-12)", () => {
        const {stopOldStack: _stopOldStack, ...body} = validExecute;
        expect(migrationExecuteSchema.safeParse(body).success).toBe(false);
    });

    it("rejects a non-boolean backup", () => {
        expect(migrationExecuteSchema.safeParse({...validExecute, backup: "true"}).success).toBe(false);
    });

    it("accepts an optional valid inPlaceAsideName (G-18-7)", () => {
        expect(migrationExecuteSchema.safeParse({...validExecute, inPlaceAsideName: "memos-old"}).success).toBe(true);
        expect(migrationExecuteSchema.safeParse(validExecute).success).toBe(true);
    });

    it("rejects a traversing inPlaceAsideName (T-18-33)", () => {
        expect(migrationExecuteSchema.safeParse({...validExecute, inPlaceAsideName: "../x"}).success).toBe(false);
    });
});

describe("stackDirectoryNameSchema (T-18-33)", () => {
    it.each(["memos-pre-migration", "a.b_c", "a", "7zip"])("accepts %s", (value) => {
        expect(stackDirectoryNameSchema.safeParse(value).success).toBe(true);
    });

    it.each([
        ["an empty name", ""],
        ["a single dot", "."],
        ["a double dot", ".."],
        ["a forward slash", "a/b"],
        ["a backslash", "a\\b"],
        ["a leading dot", ".hidden"],
        ["a space", "a b"],
        ["101 characters", "a".repeat(101)],
    ])("rejects %s", (_label, value) => {
        expect(stackDirectoryNameSchema.safeParse(value).success).toBe(false);
    });

    it("accepts exactly 100 characters", () => {
        expect(stackDirectoryNameSchema.safeParse("a".repeat(100)).success).toBe(true);
    });
});

describe("migrationTargetSchema (G-18-7)", () => {
    const target = {
        stackId: "memos",
        directory: "/opt/docktor/stacks/memos",
        originalDirectory: "/opt/docktor/stacks/memos",
        inPlace: true,
        suggestedAsideName: "memos-pre-migration",
    };

    it("accepts an in-place target with a suggested aside name", () => {
        expect(migrationTargetSchema.safeParse(target).success).toBe(true);
    });

    it("accepts a separate target without a suggested aside name", () => {
        expect(
            migrationTargetSchema.safeParse({...target, inPlace: false, suggestedAsideName: null}).success,
        ).toBe(true);
    });

    it("rejects a target with a missing suggestedAsideName", () => {
        const {suggestedAsideName: _suggested, ...body} = target;
        expect(migrationTargetSchema.safeParse(body).success).toBe(false);
    });
});

describe("scan result schemas", () => {
    const validStack = {
        path: "/opt/app/docker-compose.yml",
        directory: "/opt/app",
        compatibility: "yellow",
        serviceCount: 1,
        namedVolumes: [],
        absolutePaths: [],
        relativePaths: ["./data"],
        inlineEnvVars: false,
        unsupportedFeatures: [],
        managedStack: null,
    };

    it("accepts a scan result with a stack and a not_found skipped root", () => {
        const result = {
            stacks: [validStack],
            skippedDirectories: 1,
            skipped: [{directory: "/run/desktop/mnt/host/c/stacks", reason: "not_found"}],
        };
        expect(scanResultSchema.safeParse(result).success).toBe(true);
    });

    it.each(["not_found", "permission_denied", "system_directory"])("accepts the skip reason %s", (reason) => {
        expect(skippedDirectorySchema.safeParse({directory: "/x", reason}).success).toBe(true);
    });

    it("rejects an unknown skip reason", () => {
        expect(skippedDirectorySchema.safeParse({directory: "/x", reason: "missing"}).success).toBe(false);
    });

    it("rejects a discovered stack without relativePaths", () => {
        const {relativePaths: _relativePaths, ...withoutRelative} = validStack;
        expect(discoveredStackSchema.safeParse(withoutRelative).success).toBe(false);
    });

    it("accepts a row managed by an existing stack", () => {
        const managed = {...validStack, managedStack: {id: "app", displayName: "App"}};
        expect(discoveredStackSchema.safeParse(managed).success).toBe(true);
    });

    it("rejects a discovered stack without managedStack", () => {
        const {managedStack: _managedStack, ...withoutManaged} = validStack;
        expect(discoveredStackSchema.safeParse(withoutManaged).success).toBe(false);
    });

    it("rejects a managedStack without a display name", () => {
        expect(discoveredStackSchema.safeParse({...validStack, managedStack: {id: "app"}}).success).toBe(false);
    });

    it("rejects an unknown compatibility level", () => {
        expect(discoveredStackSchema.safeParse({...validStack, compatibility: "blue"}).success).toBe(false);
    });
});
