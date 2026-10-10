import type {Tone} from "@/components/common/tone-badge";
import type {HealthSource, ServiceHealthEvent} from "@/lib/health-api";

export const HEALTH_SOURCE_LABELS: Record<HealthSource, string> = {
    "docker-healthcheck": "Docker healthcheck",
    "http-probe": "HTTP probe",
};

// A null "from" means no earlier state was ever recorded; a null "to" means
// the health status was cleared (for example the healthcheck was removed).
export function formatHealthStatus(status: string | null, side: "from" | "to"): string {
    if (status !== null) return status;
    return side === "from" ? "unknown" : "cleared";
}

export function getHealthTone(status: string | null): Tone {
    switch (status) {
        case "healthy":
            return "green";
        case "unhealthy":
            return "red";
        case "starting":
            return "yellow";
        default:
            return "neutral";
    }
}

// Groups a newest-first event list by service. Map insertion order follows
// first appearance and each service's events keep their incoming order.
export function groupHealthEventsByService(
    events: readonly ServiceHealthEvent[],
): ReadonlyMap<string, ServiceHealthEvent[]> {
    const grouped = new Map<string, ServiceHealthEvent[]>();
    for (const event of events) {
        const existing = grouped.get(event.serviceName);
        if (existing) {
            existing.push(event);
        } else {
            grouped.set(event.serviceName, [event]);
        }
    }
    return grouped;
}
