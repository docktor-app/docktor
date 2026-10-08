import {apiFetch} from "./api";

export type HealthSource = "docker-healthcheck" | "http-probe";

// Mirrors the 14-01 contract of GET /api/stacks/:id/health-events: one row
// per recorded health transition, newest first.
export interface ServiceHealthEvent {
    id: string;
    serviceName: string;
    fromStatus: string | null;
    toStatus: string | null;
    source: HealthSource;
    message: string | null;
    createdAt: string;
}

export interface ServiceHealthEventsQuery {
    serviceName?: string;
    limit?: number;
}

// Query parameters are forwarded only when supplied, so the server's own
// defaults (latest 50 per service) govern when the caller omits them.
export function getServiceHealthEvents(
    stackId: string,
    query?: ServiceHealthEventsQuery,
): Promise<ServiceHealthEvent[]> {
    const params = new URLSearchParams();
    if (query?.serviceName !== undefined) params.set("serviceName", query.serviceName);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const queryString = params.size > 0 ? `?${params.toString()}` : "";
    return apiFetch<ServiceHealthEvent[]>(
        `/api/stacks/${encodeURIComponent(stackId)}/health-events${queryString}`,
    );
}
