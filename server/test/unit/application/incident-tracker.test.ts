import {afterEach, describe, expect, it, vi} from "vitest";
import {IncidentTracker, type IncidentTrackerRepo} from "../../../src/application/incident-tracker.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");

function createRepo(open: {id: string; triggerType: string} | null = null) {
    return {
        findOpen: vi.fn().mockResolvedValue(open),
        open: vi.fn().mockImplementation(async (_stackId: string, cause: string) => ({id: "inc-1", triggerType: cause})),
        resolve: vi.fn().mockResolvedValue(undefined),
    } satisfies Record<keyof IncidentTrackerRepo, ReturnType<typeof vi.fn>>;
}

function createTracker(repo: IncidentTrackerRepo): IncidentTracker {
    return new IncidentTracker(repo, () => NOW);
}

describe("IncidentTracker.observeStackStatus (D-11)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens an incident on UNHEALTHY, then neither re-reads nor writes on a flip to ERROR", async () => {
        const repo = createRepo();
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "UNHEALTHY");
        await tracker.observeStackStatus("a", "ERROR");

        expect(repo.open).toHaveBeenCalledTimes(1);
        expect(repo.open).toHaveBeenCalledWith("a", "UNHEALTHY", NOW);
        expect(repo.findOpen).toHaveBeenCalledTimes(1);
        expect(repo.resolve).not.toHaveBeenCalled();
    });

    it("resolves the cached open incident when the stack reaches RUNNING", async () => {
        const repo = createRepo();
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "ERROR");
        await tracker.observeStackStatus("a", "RUNNING");

        expect(repo.resolve).toHaveBeenCalledTimes(1);
        expect(repo.resolve).toHaveBeenCalledWith("inc-1", NOW);
    });

    it("opens a fresh incident after the previous one resolved", async () => {
        const repo = createRepo();
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "UNHEALTHY");
        await tracker.observeStackStatus("a", "HEALTHY");
        await tracker.observeStackStatus("a", "UNHEALTHY");

        expect(repo.open).toHaveBeenCalledTimes(2);
        expect(repo.resolve).toHaveBeenCalledTimes(1);
    });

    it("does nothing for a healthy stack without an open incident", async () => {
        const repo = createRepo();
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "RUNNING");
        await tracker.observeStackStatus("a", "DEPLOYING");

        expect(repo.open).not.toHaveBeenCalled();
        expect(repo.resolve).not.toHaveBeenCalled();
    });

    it("tracks stacks independently", async () => {
        const repo = createRepo();
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "UNHEALTHY");
        await tracker.observeStackStatus("b", "RUNNING");

        expect(repo.open).toHaveBeenCalledTimes(1);
        expect(repo.resolve).not.toHaveBeenCalled();
    });

    it("opens exactly one incident for five concurrent UNHEALTHY observations", async () => {
        const repo = createRepo();
        repo.open.mockImplementation(async (_stackId: string, cause: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return {id: "inc-1", triggerType: cause};
        });
        const tracker = createTracker(repo);

        await Promise.all(Array.from({length: 5}, () => tracker.observeStackStatus("a", "UNHEALTHY")));

        expect(repo.open).toHaveBeenCalledTimes(1);
    });

    it("resolves a pre-existing open incident after a restart", async () => {
        const repo = createRepo({id: "persisted", triggerType: "ERROR"});
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "HEALTHY");

        expect(repo.findOpen).toHaveBeenCalledWith("a");
        expect(repo.resolve).toHaveBeenCalledWith("persisted", NOW);
        expect(repo.open).not.toHaveBeenCalled();
    });

    it("does not open a second incident when one persisted across a restart", async () => {
        const repo = createRepo({id: "persisted", triggerType: "UNHEALTHY"});
        const tracker = createTracker(repo);

        await tracker.observeStackStatus("a", "ERROR");

        expect(repo.open).not.toHaveBeenCalled();
    });

    it("logs and resolves when a write rejects, then re-reads the open incident on the next observation", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const repo = createRepo();
        repo.open.mockRejectedValueOnce(new Error("db down"));
        const tracker = createTracker(repo);

        await expect(tracker.observeStackStatus("a", "UNHEALTHY")).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const [message] = consoleError.mock.calls[0] ?? [];
        expect(message).toContain("IncidentTracker");
        expect(message).toContain('"a"');

        await tracker.observeStackStatus("a", "UNHEALTHY");

        expect(repo.findOpen).toHaveBeenCalledTimes(2);
        expect(repo.open).toHaveBeenCalledTimes(2);
    });

    it("logs and resolves when the open-incident read rejects", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const repo = createRepo();
        repo.findOpen.mockRejectedValueOnce(new Error("db down"));
        const tracker = createTracker(repo);

        await expect(tracker.observeStackStatus("a", "ERROR")).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(repo.open).not.toHaveBeenCalled();
    });
});
