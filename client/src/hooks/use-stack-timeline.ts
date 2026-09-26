import {useMemo} from "react";
import type {StackDetail, StackEvent} from "@/lib/stacks-api";

export type TimelineEntryType = "deployment" | "status" | "event";
export type TimelineFilter = "all" | TimelineEntryType;

type Deployment = StackDetail["deployments"][number];
type StatusLog = StackDetail["statusLogs"][number];

export type TimelineEntry =
    | {
          type: "deployment";
          key: string;
          id: string;
          timestamp: string;
          success: boolean;
          errorMessage: string | null;
      }
    | {
          type: "status";
          key: string;
          id: string;
          timestamp: string;
          fromStatus: string | null;
          toStatus: string;
          message: string | null;
      }
    | {
          type: "event";
          key: string;
          id: string;
          timestamp: string;
          event: StackEvent;
      };

// Pure merge of the three source lists into one newest-first timeline. `key`
// (not just `id`) is what React keys the list on — ids from different source
// tables can collide (D-07). A null `events` argument (background-fetch
// failure) contributes nothing rather than throwing.
export function buildTimeline(
    deployments: readonly Deployment[],
    statusLogs: readonly StatusLog[],
    events: readonly StackEvent[] | null,
): TimelineEntry[] {
    const entries: TimelineEntry[] = [];

    for (const dep of deployments) {
        entries.push({
            type: "deployment",
            key: `deployment:${dep.id}`,
            id: dep.id,
            timestamp: dep.deployedAt,
            success: dep.success,
            errorMessage: dep.errorMessage,
        });
    }

    for (const log of statusLogs) {
        entries.push({
            type: "status",
            key: `status:${log.id}`,
            id: log.id,
            timestamp: log.createdAt,
            fromStatus: log.fromStatus,
            toStatus: log.toStatus,
            message: log.message,
        });
    }

    if (events) {
        for (const event of events) {
            entries.push({
                type: "event",
                key: `event:${event.id}`,
                id: event.id,
                timestamp: event.createdAt,
                event,
            });
        }
    }

    // Stable sort descending by timestamp. Entries were pushed above in
    // deployments -> statusLogs -> events order, so carrying the original
    // index through the sort preserves that source order for equal
    // timestamps regardless of the sort algorithm's own stability.
    return entries
        .map((entry, index) => ({entry, index}))
        .sort((a, b) => {
            const diff = Date.parse(b.entry.timestamp) - Date.parse(a.entry.timestamp);
            return diff !== 0 ? diff : a.index - b.index;
        })
        .map(({entry}) => entry);
}

export function filterTimeline(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
    if (filter === "all") return entries;
    return entries.filter((entry) => entry.type === filter);
}

// Pure client-side merge over data the page already has — no new endpoint,
// no new SSE event type (RESEARCH anti-pattern, plan prohibition).
export function useStackTimeline(
    deployments: readonly Deployment[],
    statusLogs: readonly StatusLog[],
    events: readonly StackEvent[] | null,
): TimelineEntry[] {
    return useMemo(
        () => buildTimeline(deployments, statusLogs, events),
        [deployments, statusLogs, events],
    );
}
