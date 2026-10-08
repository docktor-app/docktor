import {describe, expect, it} from "vitest";
import {
    HEALTH_SOURCE_LABELS,
    formatHealthStatus,
    getHealthTone,
    groupHealthEventsByService,
} from "@/lib/health-format";
import type {ServiceHealthEvent} from "@/lib/health-api";

function makeEvent(overrides: Partial<ServiceHealthEvent> = {}): ServiceHealthEvent {
    return {
        id: "e1",
        serviceName: "web",
        fromStatus: null,
        toStatus: "healthy",
        source: "docker-healthcheck",
        message: null,
        createdAt: "2026-10-08T07:00:00Z",
        ...overrides,
    };
}

describe("HEALTH_SOURCE_LABELS", () => {
    it("labels both sources", () => {
        expect(HEALTH_SOURCE_LABELS["docker-healthcheck"]).toBe("Docker healthcheck");
        expect(HEALTH_SOURCE_LABELS["http-probe"]).toBe("HTTP probe");
    });
});

describe("formatHealthStatus", () => {
    it("reads a null from-status as unknown", () => {
        expect(formatHealthStatus(null, "from")).toBe("unknown");
    });

    it("reads a null to-status as cleared", () => {
        expect(formatHealthStatus(null, "to")).toBe("cleared");
    });

    it("returns a concrete status unchanged on either side", () => {
        expect(formatHealthStatus("healthy", "to")).toBe("healthy");
        expect(formatHealthStatus("unhealthy", "from")).toBe("unhealthy");
    });
});

describe("getHealthTone", () => {
    it("maps healthy, unhealthy and starting to green, red and yellow", () => {
        expect(getHealthTone("healthy")).toBe("green");
        expect(getHealthTone("unhealthy")).toBe("red");
        expect(getHealthTone("starting")).toBe("yellow");
    });

    it("maps null and unrecognised statuses to neutral", () => {
        expect(getHealthTone(null)).toBe("neutral");
        expect(getHealthTone("other")).toBe("neutral");
    });
});

describe("groupHealthEventsByService", () => {
    it("groups by service and preserves the newest-first order within and across groups", () => {
        const webNewer = makeEvent({id: "w2", serviceName: "web"});
        const dbOnly = makeEvent({id: "d1", serviceName: "db"});
        const webOlder = makeEvent({id: "w1", serviceName: "web"});

        const grouped = groupHealthEventsByService([webNewer, dbOnly, webOlder]);

        expect([...grouped.keys()]).toEqual(["web", "db"]);
        expect(grouped.get("web")).toEqual([webNewer, webOlder]);
        expect(grouped.get("db")).toEqual([dbOnly]);
    });

    it("returns an empty map for no events", () => {
        expect(groupHealthEventsByService([]).size).toBe(0);
    });
});
