import type {MigrationDiskSpace} from "@docktor/shared";

/**
 * D-08: a migration needs the data it writes plus a tenth on top, because the
 * measured sizes are allocated bytes on the source and the destination may
 * allocate differently (block size, metadata, sparse files).
 */
export const DISK_SPACE_MARGIN = 1.1;

/** Bytes a migration writes onto one filesystem. `label` is the path shown to the user. */
export interface DiskRequirement {
    readonly filesystemId: string;
    readonly label: string;
    readonly bytes: number;
}

/** What one filesystem has free for an unprivileged writer. */
export interface FilesystemSpace {
    readonly filesystemId: string;
    readonly label: string;
    readonly availableBytes: number;
}

const SIZE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

/** The margin in whole percent: integer arithmetic keeps 1000 bytes at exactly 1100, not 1101. */
function marginPercent(margin: number): number {
    return Math.round(margin * 100);
}

function requiredWithMargin(bytes: number, margin: number): number {
    return Math.ceil((bytes * marginPercent(margin)) / 100);
}

function sumByFilesystem(requirements: readonly DiskRequirement[]): Map<string, {label: string; bytes: number}> {
    const totals = new Map<string, {label: string; bytes: number}>();
    for (const {filesystemId, label, bytes} of requirements) {
        const total = totals.get(filesystemId);
        totals.set(filesystemId, {label: total?.label ?? label, bytes: (total?.bytes ?? 0) + bytes});
    }
    return totals;
}

/**
 * D-08: groups the requirements by destination filesystem, adds the margin and
 * compares each total with what that filesystem has free. A filesystem the
 * caller has no figures for counts as having nothing free: the check refuses
 * rather than guesses.
 */
export function assessDiskSpace(
    requirements: readonly DiskRequirement[],
    spaces: ReadonlyMap<string, FilesystemSpace>,
    margin: number = DISK_SPACE_MARGIN,
): MigrationDiskSpace {
    const filesystems = [...sumByFilesystem(requirements)].map(([filesystemId, {label, bytes}]) => ({
        label,
        requiredBytes: requiredWithMargin(bytes, margin),
        availableBytes: spaces.get(filesystemId)?.availableBytes ?? 0,
    }));
    return {ok: filesystems.every((fs) => fs.availableBytes >= fs.requiredBytes), filesystems};
}

/** `1.5 KiB`, `5.0 GiB`: one decimal above bytes, whole bytes below 1 KiB. */
export function formatByteSize(bytes: number): string {
    let value = bytes;
    let unit = 0;
    // Compare the rounded figure, so 1023.96 KiB reads as 1.0 MiB and never as 1024.0 KiB.
    while (unit < SIZE_UNITS.length - 1 && (unit === 0 ? value : Math.round(value * 10) / 10) >= 1_024) {
        value /= 1_024;
        unit += 1;
    }
    return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

/** The refusal shown when a filesystem lacks the space, naming each short one with needed and available size. */
export function diskShortfallMessage(assessment: MigrationDiskSpace): string {
    const margin = `${marginPercent(DISK_SPACE_MARGIN) - 100}%`;
    const short = assessment.filesystems
        .filter((fs) => fs.availableBytes < fs.requiredBytes)
        .map(
            (fs) =>
                `${fs.label} needs ${formatByteSize(fs.requiredBytes)} (including a ${margin} margin), ${formatByteSize(fs.availableBytes)} available.`,
        );
    return ["Migration refused before anything was stopped: not enough free disk space.", ...short].join(" ");
}
