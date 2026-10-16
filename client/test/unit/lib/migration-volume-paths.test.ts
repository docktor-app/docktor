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
