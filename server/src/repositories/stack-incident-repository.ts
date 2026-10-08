import {prisma} from "../lib/db.js";

export interface StackIncidentRow {
    id: string;
    triggerType: string;
    createdAt: Date;
    resolvedAt: Date | null;
}

export class StackIncidentRepository {
    /**
     * Incidents that intersect the window, newest first: still open, or
     * resolved at or after `windowStart` — so one that began before the
     * window but ended inside it is listed.
     */
    async findInWindow(stackId: string, windowStart: Date, limit: number): Promise<StackIncidentRow[]> {
        return prisma.stackIncident.findMany({
            where: {
                stackId,
                OR: [{resolvedAt: null}, {resolvedAt: {gte: windowStart}}],
            },
            orderBy: {createdAt: "desc"},
            take: limit,
            select: {id: true, triggerType: true, createdAt: true, resolvedAt: true},
        });
    }
}

export const stackIncidentRepository = new StackIncidentRepository();
