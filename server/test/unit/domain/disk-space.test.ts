import {describe, expect, it} from "vitest";

import {
    assessDiskSpace,
    DISK_SPACE_MARGIN,
    diskShortfallMessage,
    formatByteSize,
    type FilesystemSpace,
} from "../../../src/domain/disk-space.js";

function spaces(...entries: FilesystemSpace[]): ReadonlyMap<string, FilesystemSpace> {
    return new Map(entries.map((entry) => [entry.filesystemId, entry]));
}

const STACKS = "/opt/docktor/stacks";

describe("DISK_SPACE_MARGIN (D-08)", () => {
    it("asks for ten percent more than the data written", () => {
        expect(DISK_SPACE_MARGIN).toBe(1.1);
    });
});

describe("assessDiskSpace", () => {
    it.each([
        ["more than enough", 5_000, 1_100, true],
        ["exactly the required size", 1_100, 1_100, true],
        ["one byte short of the margin", 1_099, 1_100, false],
        ["room for the data but not the margin", 1_050, 1_100, false],
        ["nothing available", 0, 1_100, false],
    ])("with %s, 1000 bytes needed", (_label, availableBytes, requiredBytes, ok) => {
        const result = assessDiskSpace(
            [{filesystemId: "a", label: STACKS, bytes: 1_000}],
            spaces({filesystemId: "a", label: STACKS, availableBytes}),
        );

        expect(result).toEqual({ok, filesystems: [{label: STACKS, requiredBytes, availableBytes}]});
    });

    it("rounds the required size up to a whole byte", () => {
        const result = assessDiskSpace(
            [{filesystemId: "a", label: STACKS, bytes: 1_001}],
            spaces({filesystemId: "a", label: STACKS, availableBytes: 10_000}),
        );

        expect(result.filesystems[0]?.requiredBytes).toBe(1_102);
    });

    it("does not let floating point noise raise a terabyte requirement", () => {
        const terabyte = 1_000_000_000_000;
        const result = assessDiskSpace(
            [{filesystemId: "a", label: STACKS, bytes: terabyte}],
            spaces({filesystemId: "a", label: STACKS, availableBytes: terabyte * 2}),
        );

        expect(result.filesystems[0]?.requiredBytes).toBe(1_100_000_000_000);
    });

    it("sums the requirements on one filesystem before applying the margin", () => {
        const result = assessDiskSpace(
            [
                {filesystemId: "a", label: STACKS, bytes: 600},
                {filesystemId: "a", label: STACKS, bytes: 400},
            ],
            spaces({filesystemId: "a", label: STACKS, availableBytes: 1_100}),
        );

        expect(result).toEqual({ok: true, filesystems: [{label: STACKS, requiredBytes: 1_100, availableBytes: 1_100}]});
    });

    it("judges every filesystem on its own", () => {
        const result = assessDiskSpace(
            [
                {filesystemId: "a", label: STACKS, bytes: 1_000},
                {filesystemId: "b", label: "/mnt/data", bytes: 1_000},
            ],
            spaces(
                {filesystemId: "a", label: STACKS, availableBytes: 9_000},
                {filesystemId: "b", label: "/mnt/data", availableBytes: 1_000},
            ),
        );

        expect(result.ok).toBe(false);
        expect(result.filesystems).toEqual([
            {label: STACKS, requiredBytes: 1_100, availableBytes: 9_000},
            {label: "/mnt/data", requiredBytes: 1_100, availableBytes: 1_000},
        ]);
    });

    it("is ok when nothing is written", () => {
        expect(assessDiskSpace([], spaces())).toEqual({ok: true, filesystems: []});
    });

    it("treats a filesystem it knows nothing about as having no space", () => {
        const result = assessDiskSpace([{filesystemId: "x", label: "/mnt/x", bytes: 10}], spaces());

        expect(result).toEqual({ok: false, filesystems: [{label: "/mnt/x", requiredBytes: 11, availableBytes: 0}]});
    });

    it("honours another margin", () => {
        const result = assessDiskSpace(
            [{filesystemId: "a", label: STACKS, bytes: 1_000}],
            spaces({filesystemId: "a", label: STACKS, availableBytes: 1_500}),
            1.5,
        );

        expect(result).toEqual({ok: true, filesystems: [{label: STACKS, requiredBytes: 1_500, availableBytes: 1_500}]});
    });
});

describe("formatByteSize", () => {
    it.each([
        [0, "0 B"],
        [512, "512 B"],
        [1_023, "1023 B"],
        [1_024, "1.0 KiB"],
        [1_536, "1.5 KiB"],
        [1_048_576, "1.0 MiB"],
        [5 * 1_073_741_824, "5.0 GiB"],
        [1_099_511_627_776, "1.0 TiB"],
        [1_048_575, "1.0 MiB"],
        [3 * 1_099_511_627_776 * 1_024, "3072.0 TiB"],
    ])("formats %d bytes as %s", (bytes, expected) => {
        expect(formatByteSize(bytes)).toBe(expected);
    });
});

describe("diskShortfallMessage", () => {
    it("names each short filesystem with needed and available size, and skips the ones with room", () => {
        const message = diskShortfallMessage({
            ok: false,
            filesystems: [
                {label: STACKS, requiredBytes: 2_147_483_648, availableBytes: 1_073_741_824},
                {label: "/mnt/data", requiredBytes: 1_024, availableBytes: 4_096},
                {label: "/mnt/other", requiredBytes: 1_048_576, availableBytes: 0},
            ],
        });

        expect(message).toBe(
            "Migration refused before anything was stopped: not enough free disk space." +
                ` ${STACKS} needs 2.0 GiB (including a 10% margin), 1.0 GiB available.` +
                " /mnt/other needs 1.0 MiB (including a 10% margin), 0 B available.",
        );
    });
});
