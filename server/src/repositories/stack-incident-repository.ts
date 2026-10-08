import {prisma} from "../lib/db.js";

export interface StackIncidentRow {
    id: string;
    triggerType: string;
    createdAt: Date;
    resolvedAt: Date | null;
}

export interface OpenIncidentRow {
    id: string;
    triggerType: string;
}

export class StackIncidentRepository {
    /** The newest incident of the stack that has not been resolved yet, if any. */
    async findOpen(stackId: string): Promise<OpenIncidentRow | null> {
        return prisma.stackIncident.findFirst({
            where: {stackId, resolvedAt: null},
            orderBy: {createdAt: "desc"},
            select: {id: true, triggerType: true},
        });
    }

    /**
     * A plain insert, deliberately not an upsert on the (stackId, triggerType,
     * resolvedAt) unique: Postgres treats NULL resolvedAt values as distinct,
     * so that key can never match an open row. Callers serialise per stack.
     */
    async open(stackId: string, cause: string, at: Date): Promise<OpenIncidentRow> {
        return prisma.stackIncident.create({
            data: {stackId, triggerType: cause, createdAt: at},
            select: {id: true, triggerType: true},
        });
    }

    async resolve(id: string, at: Date): Promise<void> {
        await prisma.stackIncident.update({where: {id}, data: {resolvedAt: at}});
    }

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
