import {describe, expect, it} from "vitest";
import {
    containerVisiblePaths,
    excludeOwnComposeFiles,
    isOwnComposeFile,
    ownComposeFileCandidates,
    toComparablePath,
    type ContainerMount,
} from "../../../src/domain/self-stack-paths.js";

const ROOT_AT_HOST: ContainerMount = {type: "bind", source: "/", destination: "/host"};

describe("containerVisiblePaths", () => {
    it("returns only the identical path when there are no mounts", () => {
        expect(containerVisiblePaths("/opt/docktor/docker-compose.yml", [])).toEqual([
            "/opt/docktor/docker-compose.yml",
        ]);
    });

    it("maps the host path through a bind mount of the host root", () => {
        expect(containerVisiblePaths("/opt/docktor/docker-compose.yml", [ROOT_AT_HOST])).toEqual([
            "/opt/docktor/docker-compose.yml",
            "/host/opt/docktor/docker-compose.yml",
        ]);
    });

    it("maps the host path through a bind mount of an ancestor directory", () => {
        const mount: ContainerMount = {type: "bind", source: "/srv/stacks", destination: "/stacks"};

        expect(containerVisiblePaths("/srv/stacks/docktor/compose.yaml", [mount])).toContain(
            "/stacks/docktor/compose.yaml",
        );
    });

    it("ignores a bind mount that is not an ancestor of the file", () => {
        const mount: ContainerMount = {type: "bind", source: "/var/lib/docktor", destination: "/data"};

        expect(containerVisiblePaths("/opt/docktor/docker-compose.yml", [mount])).toEqual([
            "/opt/docktor/docker-compose.yml",
        ]);
    });

    it("ignores a prefix sibling whose name merely starts with the same characters", () => {
        const mount: ContainerMount = {type: "bind", source: "/opt/doc", destination: "/doc"};

        expect(containerVisiblePaths("/opt/docktor/docker-compose.yml", [mount])).toEqual([
            "/opt/docktor/docker-compose.yml",
        ]);
    });

    it("ignores mounts that are not bind mounts", () => {
        const mount: ContainerMount = {type: "volume", source: "/", destination: "/host"};

        expect(containerVisiblePaths("/opt/docktor/docker-compose.yml", [mount])).toEqual([
            "/opt/docktor/docker-compose.yml",
        ]);
    });

    it("maps nothing for a relative host path", () => {
        expect(containerVisiblePaths("docker-compose.yml", [ROOT_AT_HOST])).toEqual(["docker-compose.yml"]);
    });
});

describe("ownComposeFileCandidates", () => {
    it("de-duplicates an identical-path mount to a single candidate", () => {
        const mount: ContainerMount = {type: "bind", source: "/opt/stacks", destination: "/opt/stacks"};

        expect(
            ownComposeFileCandidates("/opt/stacks/docktor/docker-compose.yml", "/opt/stacks/docktor", [mount]),
        ).toEqual(["/opt/stacks/docktor/docker-compose.yml"]);
    });

    it("returns candidates for every file of a comma-separated label", () => {
        const candidates = ownComposeFileCandidates(
            "/a/docker-compose.yml, /a/docker-compose.override.yml",
            "/a",
            [ROOT_AT_HOST],
        );

        expect(candidates).toContain("/host/a/docker-compose.yml");
        expect(candidates).toContain("/host/a/docker-compose.override.yml");
    });

    it.each([undefined, ""])("returns nothing for a missing or empty label (%j)", (label) => {
        expect(ownComposeFileCandidates(label, "/a", [ROOT_AT_HOST])).toEqual([]);
    });

    it("resolves a relative entry against the working directory", () => {
        expect(ownComposeFileCandidates("docker-compose.yml", "/opt/docktor", [])).toEqual([
            "/opt/docktor/docker-compose.yml",
        ]);
    });

    it("drops a relative entry when there is no working directory", () => {
        expect(ownComposeFileCandidates("docker-compose.yml", undefined, [ROOT_AT_HOST])).toEqual([]);
    });

    it("skips empty entries produced by stray commas", () => {
        expect(ownComposeFileCandidates("/a/compose.yml,,", "/a", [])).toEqual(["/a/compose.yml"]);
    });
});

describe("toComparablePath", () => {
    it("replaces every backslash with a forward slash", () => {
        expect(toComparablePath("\\host\\opt\\docktor\\compose.yml")).toBe("/host/opt/docktor/compose.yml");
    });
});

describe("excludeOwnComposeFiles", () => {
    const stack = (path: string) => ({path});

    it("keeps a different compose file in the same directory as Docktor's own", () => {
        const stacks = [stack("/host/opt/docktor/compose.override.yml")];

        expect(excludeOwnComposeFiles(stacks, ["/host/opt/docktor/docker-compose.yml"])).toEqual(stacks);
    });

    it("drops the exact own file and keeps the others in order", () => {
        const own = stack("/host/opt/docktor/docker-compose.yml");
        const first = stack("/host/opt/a/docker-compose.yml");
        const last = stack("/host/opt/z/docker-compose.yml");

        expect(excludeOwnComposeFiles([first, own, last], [own.path])).toEqual([first, last]);
    });

    it("matches a Windows-style scanned path against a posix own path", () => {
        const stacks = [stack("\\host\\opt\\docktor\\docker-compose.yml")];

        expect(excludeOwnComposeFiles(stacks, ["/host/opt/docktor/docker-compose.yml"])).toEqual([]);
    });

    it("returns every stack in the original order when the own list is empty", () => {
        const stacks = [stack("/b/compose.yml"), stack("/a/compose.yml")];

        expect(excludeOwnComposeFiles(stacks, [])).toEqual(stacks);
    });
});

describe("isOwnComposeFile", () => {
    it("is true when the compose path equals one of the own paths", () => {
        expect(isOwnComposeFile("/host/opt/docktor/docker-compose.yml", ["/x/compose.yml", "/host/opt/docktor/docker-compose.yml"])).toBe(true);
    });

    it("is true when the compose path uses backslashes against a posix own path", () => {
        expect(isOwnComposeFile("\\host\\opt\\docktor\\docker-compose.yml", ["/host/opt/docktor/docker-compose.yml"])).toBe(true);
    });

    it("is false for a different compose file in the same directory (D-01)", () => {
        expect(isOwnComposeFile("/host/opt/docktor/compose.override.yml", ["/host/opt/docktor/docker-compose.yml"])).toBe(false);
    });

    it("is false when the own stack is unknown (D-02)", () => {
        expect(isOwnComposeFile("/host/opt/docktor/docker-compose.yml", [])).toBe(false);
    });
});
