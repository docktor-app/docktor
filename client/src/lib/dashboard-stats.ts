import type {StackWithServices} from "@/lib/stacks-api";

export interface DashboardStats {
    total: number;
    running: number;
    stopped: number;
    errors: number;
    updatesAvailable: number;
    backupsConfigured: number;
}

const RUNNING_STATUSES = new Set(["RUNNING", "HEALTHY"]);
const ERROR_STATUSES = new Set(["ERROR", "UNHEALTHY"]);

// Mirrors the server's backup-scheduler registration rule
// (stack.backupSchedule ?? globalDefault) — a stack counts as "configured"
// when either its own schedule or the global default resolves to a
// non-empty string. Empty-string schedules are treated as unset.
function hasEffectiveBackupSchedule(
    stackSchedule: string | null,
    globalDefaultSchedule: string | null,
): boolean {
    const effective = stackSchedule && stackSchedule.length > 0 ? stackSchedule : globalDefaultSchedule;
    return typeof effective === "string" && effective.length > 0;
}

export function computeDashboardStats(
    stacks: ReadonlyArray<StackWithServices>,
    globalDefaultSchedule: string | null,
): DashboardStats {
    let running = 0;
    let stopped = 0;
    let errors = 0;
    let updatesAvailable = 0;
    let backupsConfigured = 0;

    for (const stack of stacks) {
        if (RUNNING_STATUSES.has(stack.status)) running += 1;
        if (stack.status === "STOPPED") stopped += 1;
        if (ERROR_STATUSES.has(stack.status)) errors += 1;
        if (stack.services.some((service) => service.updateAvailable === true)) updatesAvailable += 1;
        if (hasEffectiveBackupSchedule(stack.backupSchedule, globalDefaultSchedule)) backupsConfigured += 1;
    }

    return {
        total: stacks.length,
        running,
        stopped,
        errors,
        updatesAvailable,
        backupsConfigured,
    };
}
