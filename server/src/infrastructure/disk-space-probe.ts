import fs from "node:fs/promises";
import path from "node:path";

import {COMPOSE_VOLUME_NAME_PATTERN} from "@docktor/shared";

import type {DiskSpaceProbePort} from "../application/ports/disk-space-probe-port.js";
import type {DiskUsageScannerPort} from "../application/ports/disk-usage-scanner-port.js";
import type {FilesystemSpace} from "../domain/disk-space.js";
import {BadRequestError, hasErrorCode} from "../lib/errors.js";

import {diskUsageScanner, parseDuBytes} from "./disk-usage-scanner.js";
import {defaultVolumeDockerRunner, type VolumeDockerRunner} from "./volume-migrator.js";

/** The two file system calls the probe makes, injectable so the walk up to an existing ancestor is unit-tested. */
export interface DiskSpaceFsOps {
    stat(target: string): Promise<{dev: number}>;
    statfs(target: string): Promise<{bavail: number; bsize: number}>;
}

const defaultFsOps: DiskSpaceFsOps = {
    stat: (target) => fs.stat(target),
    statfs: (target) => fs.statfs(target),
};

function isMissingPath(err: unknown): boolean {
    return hasErrorCode(err, "ENOENT") || hasErrorCode(err, "ENOTDIR");
}

/** T-22-18: the name ends up inside a `--mount` option string, where a comma would start another option. */
function assertVolumeName(volumeName: string): void {
    if (!COMPOSE_VOLUME_NAME_PATTERN.test(volumeName)) {
        throw new BadRequestError(`"${volumeName}" is not a valid Docker volume name`);
    }
}

/**
 * Free space per filesystem (`statfs` plus the device id), directory sizes
 * through the disk usage scanner's `du`, and volume sizes through `du` in a
 * throwaway read-only container (#107).
 */
export class DiskSpaceProbe implements DiskSpaceProbePort {
    constructor(
        private readonly sizer: Pick<DiskUsageScannerPort, "measureBytes"> = diskUsageScanner,
        private readonly docker: VolumeDockerRunner = defaultVolumeDockerRunner,
        private readonly fsOps: DiskSpaceFsOps = defaultFsOps,
    ) {}

    async filesystemOf(target: string): Promise<FilesystemSpace> {
        const {existing, dev} = await this.nearestExisting(target);
        const {bavail, bsize} = await this.fsOps.statfs(existing);
        return {filesystemId: String(dev), label: existing, availableBytes: bavail * bsize};
    }

    measureDirectoryBytes(target: string): Promise<number | null> {
        return this.sizer.measureBytes(target);
    }

    async measureVolumeBytes(volumeName: string): Promise<number | null> {
        assertVolumeName(volumeName);
        try {
            const {stdout} = await this.docker(
                ["run", "--rm", "--mount", `type=volume,src=${volumeName},dst=/source,readonly`, "alpine", "du", "-sk", "/source"],
                "Volume size",
            );
            return parseDuBytes(stdout);
        } catch {
            return null;
        }
    }

    /** The path itself when it exists, else the closest ancestor that does (the root always does). */
    private async nearestExisting(target: string): Promise<{existing: string; dev: number}> {
        let candidate = path.resolve(target);
        for (;;) {
            try {
                const {dev} = await this.fsOps.stat(candidate);
                return {existing: candidate, dev};
            } catch (err: unknown) {
                const parent = path.dirname(candidate);
                if (!isMissingPath(err) || parent === candidate) {
                    throw err;
                }
                candidate = parent;
            }
        }
    }
}

export const diskSpaceProbe = new DiskSpaceProbe();
