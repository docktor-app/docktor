import {beforeEach, describe, expect, it, vi} from "vitest";
import {UptimeService} from "../../../src/application/uptime-service.js";
import {NotFoundError} from "../../../src/lib/errors.js";
import type {StackIncidentRow} from "../../../src/repositories/stack-incident-repository.js";
import type {StatusTransition} from "../../../src/domain/uptime.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-08T12:00:00Z");
const WINDOW_START = new Date(NOW.getTime() - 30 * DAY);

function createFakes() {
    return {
        stacks: {exists: vi.fn<(id: string) => Promise<boolean>>(), listStackIds: vi.fn<() => Promise<string[]>>()},
        statusLogs: {findTransitionsForWindow: vi.fn<(id: string, windowStart: Date) => Promise<StatusTransition[]>>()},
        incidents: {findInWindow: vi.fn<(id: string, windowStart: Date, limit: number) => Promise<StackIncidentRow[]>>()},
        settings: {getHealthSettings: vi.fn<() => Promise<{retentionDays: number}>>()},
    };
}

describe("UptimeService (#24, D-09, D-10, D-16)", () => {
    let fakes: ReturnType<typeof createFakes>;
    let service: UptimeService;

    beforeEach(() => {
        fakes = createFakes();
        fakes.settings.getHealthSettings.mockResolvedValue({retentionDays: 30});
        fakes.stacks.exists.mockResolvedValue(true);
        fakes.statusLogs.findTransitionsForWindow.mockResolvedValue([]);
        fakes.incidents.findInWindow.mockResolvedValue([]);
        service = new UptimeService(fakes.stacks, fakes.statusLogs, fakes.incidents, fakes.settings, () => NOW);
    });

    describe("getStackUptime", () => {
        it("rejects with NotFoundError for an unknown stack and calls no other port", async () => {
            fakes.stacks.exists.mockResolvedValue(false);

            await expect(service.getStackUptime("app")).rejects.toBeInstanceOf(NotFoundError);

            expect(fakes.settings.getHealthSettings).not.toHaveBeenCalled();
            expect(fakes.statusLogs.findTransitionsForWindow).not.toHaveBeenCalled();
            expect(fakes.incidents.findInWindow).not.toHaveBeenCalled();
        });

        it("reads the window from settings and each store exactly once", async () => {
            await service.getStackUptime("app");

            expect(fakes.statusLogs.findTransitionsForWindow).toHaveBeenCalledTimes(1);
            expect(fakes.statusLogs.findTransitionsForWindow).toHaveBeenCalledWith("app", WINDOW_START);
            expect(fakes.incidents.findInWindow).toHaveBeenCalledTimes(1);
            expect(fakes.incidents.findInWindow).toHaveBeenCalledWith("app", WINDOW_START, 200);
        });

        it("returns a null percent and null since for a stack without transitions", async () => {
            const result = await service.getStackUptime("app");

            expect(result).toEqual({
                stackId: "app",
                windowDays: 30,
                windowStart: WINDOW_START.toISOString(),
                since: null,
                percent: null,
                upMs: 0,
                downMs: 0,
                incidents: [],
            });
        });

        it("computes percent, upMs, downMs and since from the transitions", async () => {
            const t0 = new Date(NOW.getTime() - 10 * DAY);
            fakes.statusLogs.findTransitionsForWindow.mockResolvedValue([
                {toStatus: "RUNNING", at: t0},
                {toStatus: "UNHEALTHY", at: new Date(t0.getTime() + 9 * DAY)},
            ]);

            const result = await service.getStackUptime("app");

            expect(result.upMs).toBe(9 * DAY);
            expect(result.downMs).toBe(DAY);
            expect(result.percent).toBeCloseTo(90, 10);
            expect(result.since).toBe(t0.toISOString());
        });

        it("maps a closed incident with its duration and an open one with nulls", async () => {
            const created = new Date("2026-10-01T10:00:00Z");
            const resolved = new Date("2026-10-01T10:30:00Z");
            const openCreated = new Date("2026-10-07T08:00:00Z");
            fakes.incidents.findInWindow.mockResolvedValue([
                {id: "open", triggerType: "ERROR", createdAt: openCreated, resolvedAt: null},
                {id: "closed", triggerType: "UNHEALTHY", createdAt: created, resolvedAt: resolved},
            ]);

            const result = await service.getStackUptime("app");

            expect(result.incidents).toEqual([
                {id: "open", cause: "ERROR", startedAt: openCreated.toISOString(), endedAt: null, durationMs: null},
                {
                    id: "closed",
                    cause: "UNHEALTHY",
                    startedAt: created.toISOString(),
                    endedAt: resolved.toISOString(),
                    durationMs: 30 * 60_000,
                },
            ]);
        });

        it("skips an incident whose trigger type is neither UNHEALTHY nor ERROR", async () => {
            fakes.incidents.findInWindow.mockResolvedValue([
                {id: "odd", triggerType: "SOMETHING", createdAt: NOW, resolvedAt: null},
                {id: "ok", triggerType: "ERROR", createdAt: NOW, resolvedAt: null},
            ]);

            const result = await service.getStackUptime("app");

            expect(result.incidents.map((i) => i.id)).toEqual(["ok"]);
        });

        it("uses the configured retention for the window", async () => {
            fakes.settings.getHealthSettings.mockResolvedValue({retentionDays: 7});

            const result = await service.getStackUptime("app");

            expect(result.windowDays).toBe(7);
            expect(result.windowStart).toBe(new Date(NOW.getTime() - 7 * DAY).toISOString());
        });
    });

    describe("listStackUptimes", () => {
        it("returns one entry per stack in listing order with a single window read", async () => {
            fakes.stacks.listStackIds.mockResolvedValue(["a", "b"]);
            fakes.statusLogs.findTransitionsForWindow.mockImplementation(async (id) =>
                id === "a" ? [{toStatus: "RUNNING", at: new Date(NOW.getTime() - DAY)}] : [],
            );

            const result = await service.listStackUptimes();

            expect(result).toEqual({
                windowDays: 30,
                stacks: [
                    {stackId: "a", percent: 100},
                    {stackId: "b", percent: null},
                ],
            });
            expect(fakes.settings.getHealthSettings).toHaveBeenCalledTimes(1);
            expect(fakes.statusLogs.findTransitionsForWindow).toHaveBeenCalledTimes(2);
            expect(fakes.incidents.findInWindow).not.toHaveBeenCalled();
        });

        it("returns an empty list when there are no stacks", async () => {
            fakes.stacks.listStackIds.mockResolvedValue([]);

            expect(await service.listStackUptimes()).toEqual({windowDays: 30, stacks: []});
        });
    });
});
