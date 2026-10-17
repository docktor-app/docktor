import path from "node:path";
import {describe, expect, it} from "vitest";
import type {OwnMountsView} from "../../../src/domain/bind-mount-sources.js";
import {localDirectoryIdentity} from "../../../src/domain/directory-identity.js";
import {
    asideNameCandidates,
    classifyMigrationTarget,
    copyDestinationViolations,
} from "../../../src/domain/migration-target.js";

/** Host-view identities, as when Docktor is not containerized. */
function classify(targetDir: string, originalDir: string, view: OwnMountsView = {kind: "host"}) {
    return classifyMigrationTarget(localDirectoryIdentity([targetDir], view), localDirectoryIdentity([originalDir], view));
}

describe("classifyMigrationTarget (G-18-7)", () => {
    const original = path.resolve("/srv/stacks/memos");

    it("classifies a target equal to the original directory as in-place", () => {
        expect(classify(original, original)).toBe("in-place");
    });

    it("ignores a trailing separator on either side when comparing", () => {
        expect(classify(original + "/", original)).toBe("in-place");
        expect(classify(original, original + "/")).toBe("in-place");
    });

    it("classifies a target inside the original directory as nested", () => {
        expect(classify(path.join(original, "memos"), original)).toBe("nested");
    });

    it("classifies a target containing the original directory as nested", () => {
        expect(classify(path.resolve("/srv/stacks"), original)).toBe("nested");
    });

    it("classifies a sibling directory as separate", () => {
        expect(classify(path.resolve("/srv/stacks/memos-new"), original)).toBe("separate");
    });

    it("does not treat a shared name prefix as nesting", () => {
        expect(classify(path.resolve("/srv/stacks/memos-2"), original)).toBe("separate");
    });
});

describe("classifyMigrationTarget across spellings (G-18-22-inplace)", () => {
    const container: OwnMountsView = {
        kind: "container",
        mounts: [
            {type: "bind", source: "/", destination: "/host"},
            {type: "bind", source: "/opt/docktor/stacks", destination: "/opt/docktor/stacks"},
        ],
    };

    it("classifies the stacks-folder spelling against the /host spelling as in-place", () => {
        expect(classify("/opt/docktor/stacks/memos", "/host/opt/docktor/stacks/memos", container)).toBe("in-place");
    });

    it("classifies a target inside the original, reached through /host, as nested", () => {
        expect(classify("/opt/docktor/stacks/memos", "/host/opt/docktor/stacks", container)).toBe("nested");
    });

    it("classifies a separate stack in the stacks folder as separate", () => {
        expect(classify("/opt/docktor/stacks/memos", "/host/home/u/memos", container)).toBe("separate");
    });
});

describe("asideNameCandidates (G-18-7)", () => {
    it("lists the pre-migration name first and numbered fallbacks after it", () => {
        expect(asideNameCandidates("memos", 3)).toEqual([
            "memos-pre-migration",
            "memos-pre-migration-2",
            "memos-pre-migration-3",
        ]);
    });

    it("returns a single candidate for a limit of one", () => {
        expect(asideNameCandidates("memos", 1)).toEqual(["memos-pre-migration"]);
    });

    it("returns nothing for a limit of zero", () => {
        expect(asideNameCandidates("memos", 0)).toEqual([]);
    });
});

describe("copyDestinationViolations (WR-01)", () => {
    const targetDir = path.resolve("/srv/docktor/stacks/app");
    const composeDir = path.resolve("/opt/old/app");

    function violations(
        bindCopies: Array<{originalPath: string; newPath: string}>,
        namedVolumes: string[] = [],
    ): readonly string[] {
        return copyDestinationViolations({targetDir, composeDir, bindCopies, namedVolumes});
    }

    it("accepts a regular bind destination next to a named volume", () => {
        expect(violations([{originalPath: "./data", newPath: "./volumes/data"}], ["pgdata"])).toEqual([]);
    });

    it("accepts the stack-directory mount copied to the stack root", () => {
        expect(violations([{originalPath: ".", newPath: "."}])).toEqual([]);
        expect(violations([{originalPath: "./", newPath: "."}])).toEqual([]);
        expect(violations([{originalPath: composeDir, newPath: "."}])).toEqual([]);
    });

    it("rejects destinations that escape the new stack directory", () => {
        expect(violations([{originalPath: "./data", newPath: "../../outside"}])).toEqual([
            expect.stringContaining("escapes"),
        ]);
        expect(violations([{originalPath: "./data", newPath: path.resolve("/etc/cron.d")}])).toEqual([
            expect.stringContaining("escapes"),
        ]);
    });

    it("rejects the stack root for any source but the stack-directory mount", () => {
        expect(violations([{originalPath: "./data", newPath: "."}])).toEqual([expect.stringContaining("stack directory")]);
    });

    it.each([
        "./docker-compose.yml",
        "docker-compose.yaml",
        "./compose.yml",
        "compose.yaml",
        ".env",
        "pre-migration-backup/x",
    ])("rejects a destination named %s", (newPath) => {
        expect(violations([{originalPath: "./data", newPath}])).toEqual([expect.stringContaining(newPath)]);
    });

    it("rejects equal destinations", () => {
        expect(
            violations([
                {originalPath: "./a", newPath: "./volumes/x"},
                {originalPath: "./b", newPath: "./volumes/x"},
            ]),
        ).toHaveLength(1);
    });

    it("rejects nested destinations", () => {
        expect(
            violations([
                {originalPath: "./a", newPath: "./volumes/a"},
                {originalPath: "./b", newPath: "./volumes/a/b"},
            ]),
        ).toHaveLength(1);
    });

    it("rejects a bind destination that collides with a named volume", () => {
        expect(violations([{originalPath: "./a", newPath: "./volumes/pgdata"}], ["pgdata"])).toHaveLength(1);
    });

    it.each(["../escape", "a/b", ""])("rejects the named volume name %j", (name) => {
        expect(violations([], [name])).not.toEqual([]);
    });

    it("rejects an empty destination and a destination containing NUL", () => {
        expect(violations([{originalPath: "./a", newPath: ""}])).not.toEqual([]);
        expect(violations([{originalPath: "./a", newPath: "./volumes/a\0b"}])).not.toEqual([]);
    });
});
