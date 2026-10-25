import {describe, expect, it, vi} from "vitest";

import {DiskSpaceProbe} from "../../../src/infrastructure/disk-space-probe.js";
import {BadRequestError} from "../../../src/lib/errors.js";
import type {VolumeDockerRunner} from "../../../src/infrastructure/volume-migrator.js";

function missing(code: "ENOENT" | "ENOTDIR" = "ENOENT"): NodeJS.ErrnoException {
    return Object.assign(new Error(`${code}: no such file or directory`), {code});
}

/** A fake file system: `existing` maps each existing path to its device id. */
function fsOps(existing: Record<string, number>, free: Record<string, {bavail: number; bsize: number}> = {}) {
    return {
        stat: vi.fn(async (target: string) => {
            const dev = existing[target];
            if (dev === undefined) {
                throw missing();
            }
            return {dev};
        }),
        statfs: vi.fn(async (target: string) => {
            const stats = free[target];
            if (stats === undefined) {
                throw missing();
            }
            return stats;
        }),
    };
}

const noSizer = {measureBytes: vi.fn()};
const noDocker: VolumeDockerRunner = vi.fn();

describe.skipIf(process.platform === "win32")("DiskSpaceProbe.filesystemOf", () => {
    it("reports the device and the free bytes (bavail x bsize) of an existing path", async () => {
        const ops = fsOps({"/opt/docktor/stacks": 64}, {"/opt/docktor/stacks": {bavail: 1_000, bsize: 4_096}});

        const space = await new DiskSpaceProbe(noSizer, noDocker, ops).filesystemOf("/opt/docktor/stacks");

        expect(space).toEqual({filesystemId: "64", label: "/opt/docktor/stacks", availableBytes: 4_096_000});
    });

    it("walks up from a missing path to the nearest existing ancestor", async () => {
        const ops = fsOps({"/opt/docktor/stacks": 64, "/opt/docktor": 64, "/opt": 64}, {"/opt/docktor/stacks": {bavail: 10, bsize: 512}});

        const space = await new DiskSpaceProbe(noSizer, noDocker, ops).filesystemOf("/opt/docktor/stacks/new-stack");

        expect(space).toEqual({filesystemId: "64", label: "/opt/docktor/stacks", availableBytes: 5_120});
        expect(ops.statfs).toHaveBeenCalledWith("/opt/docktor/stacks");
    });

    it("treats a path below a file (ENOTDIR) like a missing path", async () => {
        const ops = {
            stat: vi.fn(async (target: string) => {
                if (target === "/data/file/child") {
                    throw missing("ENOTDIR");
                }
                return {dev: 7};
            }),
            statfs: vi.fn(async () => ({bavail: 2, bsize: 1_024})),
        };

        const space = await new DiskSpaceProbe(noSizer, noDocker, ops).filesystemOf("/data/file/child");

        expect(space.label).toBe("/data/file");
        expect(space.filesystemId).toBe("7");
    });

    it("gives two directories on one device the same filesystem id", async () => {
        const ops = fsOps({"/a": 5, "/b": 5}, {"/a": {bavail: 1, bsize: 1}, "/b": {bavail: 1, bsize: 1}});
        const probe = new DiskSpaceProbe(noSizer, noDocker, ops);

        expect((await probe.filesystemOf("/a")).filesystemId).toBe((await probe.filesystemOf("/b")).filesystemId);
    });

    it("rethrows a failure other than a missing path", async () => {
        const ops = {
            stat: vi.fn().mockRejectedValue(Object.assign(new Error("denied"), {code: "EACCES"})),
            statfs: vi.fn(),
        };

        await expect(new DiskSpaceProbe(noSizer, noDocker, ops).filesystemOf("/root/x")).rejects.toThrow("denied");
    });
});

describe("DiskSpaceProbe.measureDirectoryBytes", () => {
    it("delegates to the disk usage scanner", async () => {
        const sizer = {measureBytes: vi.fn().mockResolvedValue(4_096)};

        expect(await new DiskSpaceProbe(sizer, noDocker, fsOps({})).measureDirectoryBytes("/srv/data")).toBe(4_096);
        expect(sizer.measureBytes).toHaveBeenCalledWith("/srv/data");
    });

    it("passes an unmeasurable size on as null", async () => {
        const sizer = {measureBytes: vi.fn().mockResolvedValue(null)};

        expect(await new DiskSpaceProbe(sizer, noDocker, fsOps({})).measureDirectoryBytes("/srv/data")).toBeNull();
    });
});

describe("DiskSpaceProbe.measureVolumeBytes (T-22-18)", () => {
    it("measures a volume with du in a read-only helper container and converts KiB to bytes", async () => {
        const docker = vi.fn<VolumeDockerRunner>().mockResolvedValue({stdout: "2048\t/source\n", stderr: ""});

        const bytes = await new DiskSpaceProbe(noSizer, docker, fsOps({})).measureVolumeBytes("myproj_pgdata");

        expect(bytes).toBe(2_097_152);
        expect(docker).toHaveBeenCalledTimes(1);
        expect(docker).toHaveBeenCalledWith(
            ["run", "--rm", "--mount", "type=volume,src=myproj_pgdata,dst=/source,readonly", "alpine", "du", "-sk", "/source"],
            expect.any(String),
        );
    });

    it("returns null when the helper container fails", async () => {
        const docker = vi.fn<VolumeDockerRunner>().mockRejectedValue(new Error("docker unreachable"));

        expect(await new DiskSpaceProbe(noSizer, docker, fsOps({})).measureVolumeBytes("pgdata")).toBeNull();
    });

    it("returns null when du prints nothing usable", async () => {
        const docker = vi.fn<VolumeDockerRunner>().mockResolvedValue({stdout: "", stderr: ""});

        expect(await new DiskSpaceProbe(noSizer, docker, fsOps({})).measureVolumeBytes("pgdata")).toBeNull();
    });

    it.each(["../escape", "a/b", "x,dst=/etc", "", "-flag"])("rejects the volume name %j before any docker call", async (name) => {
        const docker = vi.fn<VolumeDockerRunner>();

        await expect(new DiskSpaceProbe(noSizer, docker, fsOps({})).measureVolumeBytes(name)).rejects.toBeInstanceOf(BadRequestError);
        expect(docker).not.toHaveBeenCalled();
    });
});
