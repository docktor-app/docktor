import {prisma} from "../lib/db.js";
import {NotFoundError} from "../lib/errors.js";
import type {BackupStatus, BackupTrigger} from "../generated/prisma/enums.js";

export class BackupRepository {
    /**
     * Creates a new Backup record. resticSnapshotId defaults to an empty string
     * and is updated once the backup completes.
     */
    async create(data: {
        stackId: string;
        trigger: BackupTrigger;
        status: BackupStatus;
        startedAt: Date;
        resticSnapshotId?: string;
    }) {
        return prisma.backup.create({
            data: {
                stackId: data.stackId,
                trigger: data.trigger,
                status: data.status,
                startedAt: data.startedAt,
                resticSnapshotId: data.resticSnapshotId ?? "",
            },
        });
    }

    /**
     * Finds a Backup record by id. Returns null if not found.
     */
    async findById(id: string) {
        return prisma.backup.findUnique({where: {id}});
    }

    /**
     * Finds a Backup record by id. Throws NotFoundError if not found.
     */
    async findByIdOrThrow(id: string) {
        const backup = await prisma.backup.findUnique({where: {id}});
        if (!backup) {
            throw new NotFoundError(`Backup "${id}" not found`);
        }
        return backup;
    }

    /**
     * Returns all Backup records for a stack, ordered by startedAt descending.
     */
    async findByStackId(stackId: string, limit = 50) {
        return prisma.backup.findMany({
            where: {stackId},
            orderBy: {startedAt: "desc"},
            take: limit,
        });
    }

    /**
     * Updates a Backup record. Accepts any subset of updatable fields.
     * This unified update method is used by BackupService for both status
     * transitions and log line accumulation.
     */
    async update(
        id: string,
        data: {
            status?: BackupStatus;
            completedAt?: Date;
            errorMessage?: string;
            sizeBytes?: bigint;
            resticSnapshotId?: string;
            logLines?: string[];
        },
    ) {
        return prisma.backup.update({where: {id}, data});
    }

    /**
     * Updates the status and optional completion metadata of a Backup record.
     */
    async updateStatus(
        id: string,
        data: {
            status: BackupStatus;
            completedAt?: Date;
            errorMessage?: string;
            sizeBytes?: bigint;
            resticSnapshotId?: string;
        },
    ) {
        return prisma.backup.update({where: {id}, data});
    }

    /**
     * Replaces the stored log lines for a Backup record.
     */
    async updateLogLines(id: string, lines: string[]) {
        return prisma.backup.update({where: {id}, data: {logLines: lines}});
    }

    /**
     * Returns all backups that are currently in progress. Used on server
     * startup to recover from orphaned BACKING_UP states after a crash.
     */
    async findInProgress() {
        return prisma.backup.findMany({where: {status: "IN_PROGRESS"}});
    }

    /**
     * Returns the ids of stacks with at least one completed manual or
     * scheduled backup. A restore, a failure or an in-flight run is not a
     * snapshot (D-04). One aggregate query regardless of stack count;
     * resticSnapshotId is deliberately not filtered on because it may stay
     * empty on completed rows.
     */
    async findStackIdsWithSnapshot(): Promise<Set<string>> {
        const groups = await prisma.backup.groupBy({
            by: ["stackId"],
            where: {status: "COMPLETED", trigger: {in: ["MANUAL", "SCHEDULED"]}},
        });
        return new Set(groups.map((group) => group.stackId));
    }

    /**
     * Converts a Backup record to a plain DTO safe for JSON serialisation.
     * BigInt sizeBytes is converted to string (or null) to prevent
     * JSON.stringify throwing TypeError.
     */
    toDto(backup: {sizeBytes: bigint | null; [key: string]: unknown}): Record<string, unknown> {
        return {
            ...backup,
            sizeBytes: backup.sizeBytes !== null ? String(backup.sizeBytes) : null,
        };
    }
}

export const backupRepository = new BackupRepository();
