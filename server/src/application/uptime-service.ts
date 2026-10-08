import type {HealthSettings} from "@docktor/shared";
import {computeUptime, windowStartFor, type UptimeResult} from "../domain/uptime.js";
import {NotFoundError} from "../lib/errors.js";
import type {StackIncidentRepository, StackIncidentRow} from "../repositories/stack-incident-repository.js";
import type {StatusLogRepository} from "../repositories/status-log-repository.js";

const INCIDENT_LIST_LIMIT = 200;

export type IncidentCause = "UNHEALTHY" | "ERROR";

export interface IncidentDto {
    id: string;
    cause: IncidentCause;
    startedAt: string;
    /** Null while the incident is ongoing. */
    endedAt: string | null;
    /** Null while the incident is ongoing. */
    durationMs: number | null;
}

export interface StackUptimeDto {
    stackId: string;
    windowDays: number;
    windowStart: string;
    /** Start of the observed span inside the window; null when nothing was observed. */
    since: string | null;
    percent: number | null;
    upMs: number;
    downMs: number;
    incidents: IncidentDto[];
}

export interface StackUptimesDto {
    windowDays: number;
    stacks: Array<{stackId: string; percent: number | null}>;
}

export interface UptimeStackPort {
    exists(id: string): Promise<boolean>;
    listStackIds(): Promise<string[]>;
}

function isIncidentCause(value: string): value is IncidentCause {
    return value === "UNHEALTHY" || value === "ERROR";
}

function toIncidentDto(row: StackIncidentRow): IncidentDto | null {
    if (!isIncidentCause(row.triggerType)) {
        return null;
    }
    return {
        id: row.id,
        cause: row.triggerType,
        startedAt: row.createdAt.toISOString(),
        endedAt: row.resolvedAt?.toISOString() ?? null,
        durationMs: row.resolvedAt === null ? null : row.resolvedAt.getTime() - row.createdAt.getTime(),
    };
}

/**
 * Read side of the per-stack uptime view (#24): the uptime percentage over
 * the retention window (D-09, D-10) and the incidents inside it (D-11).
 */
export class UptimeService {
    constructor(
        private readonly stacks: UptimeStackPort,
        private readonly statusLogs: Pick<StatusLogRepository, "findTransitionsForWindow">,
        private readonly incidents: Pick<StackIncidentRepository, "findInWindow">,
        private readonly settings: {getHealthSettings(): Promise<HealthSettings>},
        private readonly now: () => Date = () => new Date(),
    ) {}

    async getStackUptime(stackId: string): Promise<StackUptimeDto> {
        if (!(await this.stacks.exists(stackId))) {
            throw new NotFoundError(`Stack "${stackId}" not found`);
        }
        const {retentionDays} = await this.settings.getHealthSettings();
        const now = this.now();
        const windowStart = windowStartFor(now, retentionDays);

        const [summary, rows] = await Promise.all([
            this.summarize(stackId, windowStart, now),
            this.incidents.findInWindow(stackId, windowStart, INCIDENT_LIST_LIMIT),
        ]);

        return {
            stackId,
            windowDays: retentionDays,
            windowStart: windowStart.toISOString(),
            since: summary.observedFrom?.toISOString() ?? null,
            percent: summary.percent,
            upMs: summary.upMs,
            downMs: summary.downMs,
            incidents: rows.map(toIncidentDto).filter((dto): dto is IncidentDto => dto !== null),
        };
    }

    async listStackUptimes(): Promise<StackUptimesDto> {
        const {retentionDays} = await this.settings.getHealthSettings();
        const now = this.now();
        const windowStart = windowStartFor(now, retentionDays);
        const stackIds = await this.stacks.listStackIds();

        const stacks = await Promise.all(
            stackIds.map(async (stackId) => ({
                stackId,
                percent: (await this.summarize(stackId, windowStart, now)).percent,
            })),
        );
        return {windowDays: retentionDays, stacks};
    }

    private async summarize(stackId: string, windowStart: Date, now: Date): Promise<UptimeResult> {
        const transitions = await this.statusLogs.findTransitionsForWindow(stackId, windowStart);
        return computeUptime(transitions, windowStart, now);
    }
}
