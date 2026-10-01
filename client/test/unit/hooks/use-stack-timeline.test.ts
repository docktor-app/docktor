import {describe, expect, it} from "vitest";
import {renderHook} from "@testing-library/react";
import {
    buildTimeline,
    filterTimeline,
    useStackTimeline,
    type TimelineEntry,
} from "@/hooks/use-stack-timeline";
import type {StackDetail, StackEvent} from "@/lib/stacks-api";

function makeDeployment(overrides: Partial<StackDetail["deployments"][number]> = {}) {
    return {
        id: "dep-1",
        composeHash: "hash-1",
        deployedAt: "2026-01-01T00:00:00Z",
        success: true,
        errorMessage: null,
        ...overrides,
    };
}

function makeStatusLog(overrides: Partial<StackDetail["statusLogs"][number]> = {}) {
    return {
        id: "log-1",
        fromStatus: "DEPLOYING",
        toStatus: "RUNNING",
        message: null,
        createdAt: "2026-01-01T00:00:03Z",
        ...overrides,
    };
}

function makeEvent(overrides: Partial<StackEvent> = {}): StackEvent {
    return {
        id: "event-1",
        type: "config_changed",
        message: null,
        payload: null,
        createdAt: "2026-01-01T00:00:02Z",
        ...overrides,
    };
}

describe("buildTimeline", () => {
    it("merges a deployment, status log and event newest-first", () => {
        const deployments = [makeDeployment({deployedAt: "2026-01-01T00:00:00Z"})];
        const statusLogs = [makeStatusLog({createdAt: "2026-01-01T00:00:03Z"})];
        const events = [makeEvent({createdAt: "2026-01-01T00:00:02Z"})];

        const result = buildTimeline(deployments, statusLogs, events);

        expect(result.map((entry) => entry.type)).toEqual(["status", "event", "deployment"]);
    });

    it("keeps source order deployments -> status logs -> events for equal timestamps", () => {
        const sameTimestamp = "2026-01-01T00:00:00Z";
        const deployments = [makeDeployment({id: "dep-1", deployedAt: sameTimestamp})];
        const statusLogs = [makeStatusLog({id: "log-1", createdAt: sameTimestamp})];
        const events = [makeEvent({id: "event-1", createdAt: sameTimestamp})];

        const result = buildTimeline(deployments, statusLogs, events);

        expect(result.map((entry) => entry.type)).toEqual(["deployment", "status", "event"]);
    });

    it("contributes nothing from a null events argument", () => {
        const deployments = [makeDeployment()];
        const statusLogs = [makeStatusLog()];

        const result = buildTimeline(deployments, statusLogs, null);

        expect(result).toHaveLength(2);
        expect(result.every((entry) => entry.type !== "event")).toBe(true);
    });

    it("assigns a collision-safe key combining type and id", () => {
        const deployments = [makeDeployment({id: "1"})];
        const statusLogs = [makeStatusLog({id: "1"})];

        const result = buildTimeline(deployments, statusLogs, null);

        const keys = result.map((entry) => entry.key);
        expect(new Set(keys).size).toBe(2);
    });

    it("returns an empty array when there is nothing to show", () => {
        expect(buildTimeline([], [], null)).toEqual([]);
        expect(buildTimeline([], [], [])).toEqual([]);
    });
});

describe("filterTimeline", () => {
    const entries: TimelineEntry[] = buildTimeline(
        [makeDeployment({id: "dep-1"})],
        [makeStatusLog({id: "log-1"})],
        [makeEvent({id: "event-1"})],
    );

    it("returns every entry for 'all'", () => {
        expect(filterTimeline(entries, "all")).toHaveLength(3);
    });

    it("keeps only deployment entries for 'deployment'", () => {
        const result = filterTimeline(entries, "deployment");
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("deployment");
    });

    it("keeps only status entries for 'status'", () => {
        const result = filterTimeline(entries, "status");
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("status");
    });

    it("keeps only event entries for 'event'", () => {
        const result = filterTimeline(entries, "event");
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("event");
    });

    it("returns an empty array when no entry matches the filter", () => {
        const onlyDeployments = filterTimeline(
            buildTimeline([makeDeployment()], [], null),
            "status",
        );
        expect(onlyDeployments).toEqual([]);
    });
});

describe("useStackTimeline", () => {
    it("memoizes the merged timeline built from its three inputs", () => {
        const deployments = [makeDeployment()];
        const statusLogs = [makeStatusLog()];
        const events = [makeEvent()];

        const {result, rerender} = renderHook(
            ({d, s, e}) => useStackTimeline(d, s, e),
            {initialProps: {d: deployments, s: statusLogs, e: events}},
        );

        expect(result.current).toHaveLength(3);
        const firstResult = result.current;

        rerender({d: deployments, s: statusLogs, e: events});
        expect(result.current).toBe(firstResult);
    });
});
