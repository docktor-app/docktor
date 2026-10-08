import {prisma} from "../lib/db.js";

export interface RecordStackUsageInput {
    stackId: string;
    volumes: Array<{name: string; sizeBytes: number}>;
    volumeSizeBytes: number;
    backupSizeBytes: number | null;
    measuredAt: Date;
}

export interface StorageRow {
    stackId: string;
    displayName: string;
    volumeSizeBytes: number | null;
    backupSizeBytes: number | null;
    measuredAt: Date | null;
    volumes: Array<{name: string; sizeBytes: number}>;
}

/**
 * The only Prisma touchpoint for the disk usage figures (#27): the per-stack
 * totals on Stack and the per-volume StackVolumeUsage rows.
 *
 * Sizes are stored as BigInt and handed out as numbers, which is exact up to
 * 2^53 bytes (8 PiB).
 */
export class StackDiskUsageRepository {
    /**
     * Replaces the stack's per-volume rows and writes its totals in one
     * transaction, so a reader never sees new totals next to old rows.
     */
    async recordStackUsage(input: RecordStackUsageInput): Promise<void> {
        await prisma.$transaction([
            prisma.stackVolumeUsage.deleteMany({where: {stackId: input.stackId}}),
            prisma.stackVolumeUsage.createMany({
                data: input.volumes.map((volume) => ({
                    stackId: input.stackId,
                    name: volume.name,
                    sizeBytes: BigInt(volume.sizeBytes),
                    measuredAt: input.measuredAt,
                })),
            }),
            prisma.stack.update({
                where: {id: input.stackId},
                data: {
                    volumeSizeBytes: BigInt(input.volumeSizeBytes),
                    backupSizeBytes: input.backupSizeBytes === null ? null : BigInt(input.backupSizeBytes),
                    volumeSizeAt: input.measuredAt,
                },
            }),
        ]);
    }

    async findStorageRows(): Promise<StorageRow[]> {
        const stacks = await prisma.stack.findMany({
            select: {
                id: true,
                displayName: true,
                volumeSizeBytes: true,
                backupSizeBytes: true,
                volumeSizeAt: true,
                volumeUsages: {select: {name: true, sizeBytes: true}},
            },
            orderBy: {displayName: "asc"},
        });

        return stacks.map((stack) => ({
            stackId: stack.id,
            displayName: stack.displayName,
            volumeSizeBytes: stack.volumeSizeBytes === null ? null : Number(stack.volumeSizeBytes),
            backupSizeBytes: stack.backupSizeBytes === null ? null : Number(stack.backupSizeBytes),
            measuredAt: stack.volumeSizeAt,
            volumes: stack.volumeUsages.map((volume) => ({name: volume.name, sizeBytes: Number(volume.sizeBytes)})),
        }));
    }
}

export const stackDiskUsageRepository = new StackDiskUsageRepository();
