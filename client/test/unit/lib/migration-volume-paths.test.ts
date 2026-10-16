import {describe, expect, it} from "vitest";
import {
    buildBindMountChoices,
    countVolumesToCopy,
    toVolumeSelections,
    type BindMountChoice,
} from "../../../src/lib/migration-volume-paths";

const relativeOnly = {namedVolumes: [], absolutePaths: [], relativePaths: ["./data"]};

describe("buildBindMountChoices", () => {
    it("offers a relative bind mount moved into ./volumes/<name> by default", () => {
        expect(buildBindMountChoices(relativeOnly)).toEqual([
            {
                kind: "relative",
                originalPath: "./data",
                volumesPath: "./volumes/data",
                moveIntoVolumes: true,
                mustMove: false,
                mustKeep: false,
            },
        ]);
    });
});

describe("toVolumeSelections", () => {
    it("maps a moved relative mount to its ./volumes/ target and copies it", () => {
        expect(toVolumeSelections(buildBindMountChoices(relativeOnly))).toEqual([
            {originalPath: "./data", newPath: "./volumes/data", convert: true},
        ]);
    });
});

describe("countVolumesToCopy", () => {
    it("counts a relative mount as one volume to copy", () => {
        const choices: BindMountChoice[] = buildBindMountChoices(relativeOnly);
        expect(countVolumesToCopy({}, choices)).toBe(1);
    });
});

describe("keeping a relative mount", () => {
    it("copies a kept mount to the same relative path with no compose change, and still counts it", () => {
        const [choice] = buildBindMountChoices(relativeOnly);
        const kept: BindMountChoice = {...choice, moveIntoVolumes: false};

        expect(toVolumeSelections([kept])).toEqual([{originalPath: "./data", newPath: "./data", convert: true}]);
        expect(countVolumesToCopy({}, [kept])).toBe(1);
    });
});

describe("mounts outside or at the stack directory", () => {
    const relativeChoice = (path: string): BindMountChoice => {
        const [choice] = buildBindMountChoices({namedVolumes: [], absolutePaths: [], relativePaths: [path]});
        return choice;
    };

    it.each(["../shared", "./a/../../b", "..\\shared"])("forces %s into ./volumes/", (path) => {
        const choice = relativeChoice(path);

        expect(choice.mustMove).toBe(true);
        expect(choice.mustKeep).toBe(false);
        expect(choice.moveIntoVolumes).toBe(true);
    });

    it("keeps a path that only dips into a sibling and comes back inside the stack directory movable", () => {
        const choice = relativeChoice("./a/../b");

        expect(choice.mustMove).toBe(false);
        expect(choice.mustKeep).toBe(false);
        expect(choice.volumesPath).toBe("./volumes/b");
    });

    it.each([".", "./", "./a/.."])("forces %s, the stack directory itself, to stay put", (path) => {
        const choice = relativeChoice(path);

        expect(choice.mustKeep).toBe(true);
        expect(choice.mustMove).toBe(false);
        expect(choice.moveIntoVolumes).toBe(false);
        expect(toVolumeSelections([choice])).toEqual([{originalPath: path, newPath: path, convert: true}]);
        expect(countVolumesToCopy({}, [choice])).toBe(1);
    });

    it("handles backslash-separated relative paths with the same rules", () => {
        const choice = relativeChoice(".\\config");

        expect(choice.mustMove).toBe(false);
        expect(choice.volumesPath).toBe("./volumes/config");
    });
});

describe("collision-free ./volumes/ targets", () => {
    const targets = (stack: Parameters<typeof buildBindMountChoices>[0]): string[] =>
        buildBindMountChoices(stack).map((choice) => choice.volumesPath);

    it("suffixes bind mounts that share a last segment with -2 and -3", () => {
        expect(
            targets({namedVolumes: [], absolutePaths: ["/srv/a/data", "/srv/b/data"], relativePaths: ["./data"]}),
        ).toEqual(["./volumes/data", "./volumes/data-2", "./volumes/data-3"]);
    });

    it("reserves ./volumes/<name> for a named volume of the same name", () => {
        expect(targets({namedVolumes: ["data"], absolutePaths: [], relativePaths: ["./data"]})).toEqual([
            "./volumes/data-2",
        ]);
    });

    it("does not let a stack-directory mount consume a name", () => {
        expect(targets({namedVolumes: [], absolutePaths: [], relativePaths: [".", "./data"]})).toEqual([
            ".",
            "./volumes/data",
        ]);
    });
});
