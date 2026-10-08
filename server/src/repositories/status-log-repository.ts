import type {StatusTransition} from "../domain/uptime.js";
import {prisma} from "../lib/db.js";

const TRANSITION_SELECT = {toStatus: true, createdAt: true} as const;

export class StatusLogRepository {
    /**
     * The status history needed to compute uptime over a window (#24): the
     * newest row at or before `windowStart` (the status in force when the
     * window opened) followed by every row inside the window, ascending.
     * Both reads are served by the (stackId, createdAt) index.
     */
    async findTransitionsForWindow(stackId: string, windowStart: Date): Promise<StatusTransition[]> {
        const [anchor, inWindow] = await Promise.all([
            prisma.statusLog.findFirst({
                where: {stackId, createdAt: {lte: windowStart}},
                orderBy: {createdAt: "desc"},
                select: TRANSITION_SELECT,
            }),
            prisma.statusLog.findMany({
                where: {stackId, createdAt: {gt: windowStart}},
                orderBy: {createdAt: "asc"},
                select: TRANSITION_SELECT,
            }),
        ]);

        const rows = anchor === null ? inWindow : [anchor, ...inWindow];
        return rows.map((row) => ({toStatus: row.toStatus, at: row.createdAt}));
    }
}

export const statusLogRepository = new StatusLogRepository();
