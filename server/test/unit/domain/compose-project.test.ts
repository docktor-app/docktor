import {describe, expect, it} from "vitest";
import {
    activeWithoutService,
    composeStopTimeoutMs,
    isActive,
    runningServices,
    stillRunning,
    stopNotVerifiedMessage,
    type ProjectContainer,
} from "../../../src/domain/compose-project.js";

function container(overrides: Partial<ProjectContainer> & Pick<ProjectContainer, "name">): ProjectContainer {
    return {id: `id-${overrides.name}`, service: null, running: true, mounts: [], ...overrides};
}

describe("runningServices", () => {
    it("returns the sorted unique services of the running containers", () => {
        const containers = [
            container({name: "p-web-2", service: "web"}),
            container({name: "p-db-1", service: "db"}),
            container({name: "p-web-1", service: "web"}),
            container({name: "p-job-1", service: "job", running: false}),
        ];

        expect(runningServices(containers)).toEqual(["db", "web"]);
    });

    it("skips running containers without a service label", () => {
        expect(runningServices([container({name: "orphan", service: null})])).toEqual([]);
    });

    it("is empty without containers", () => {
        expect(runningServices([])).toEqual([]);
    });
});

describe("isActive (WR-02)", () => {
    it("is true for a running, a restarting and a paused container", () => {
        expect(isActive(container({name: "a"}))).toBe(true);
        expect(isActive(container({name: "a", running: false, restartingOrPaused: true}))).toBe(true);
    });

    it("is false for an exited, created or dead container", () => {
        expect(isActive(container({name: "a", running: false}))).toBe(false);
        expect(isActive(container({name: "a", running: false, restartingOrPaused: false}))).toBe(false);
    });
});

describe("activeWithoutService (WR-05)", () => {
    it("names the active containers that carry no service label", () => {
        const containers = [
            container({name: "p-web-1", service: "web"}),
            container({name: "orphan", service: null}),
            container({name: "looping", service: null, running: false, restartingOrPaused: true}),
            container({name: "stopped", service: null, running: false}),
        ];

        expect(activeWithoutService(containers)).toEqual(["orphan", "looping"]);
    });
});

describe("stillRunning", () => {
    it("returns the names of the running containers only", () => {
        const containers = [
            container({name: "p-db-1", service: "db"}),
            container({name: "p-job-1", service: "job", running: false}),
            container({name: "p-web-1", service: "web"}),
        ];

        expect(stillRunning(containers)).toEqual(["p-db-1", "p-web-1"]);
    });

    it("counts a restarting or paused container as still running (WR-02)", () => {
        const containers = [
            container({name: "p-db-1", service: "db", running: false, restartingOrPaused: true}),
            container({name: "p-web-1", service: "web", running: false}),
        ];

        expect(stillRunning(containers)).toEqual(["p-db-1"]);
        expect(runningServices(containers)).toEqual(["db"]);
    });

    it("is empty when everything is stopped", () => {
        expect(stillRunning([container({name: "p-db-1", running: false})])).toEqual([]);
    });
});

describe("stopNotVerifiedMessage (D-04)", () => {
    it("names the project and every container and says nothing was copied", () => {
        const message = stopNotVerifiedMessage("other", ["other-db-1", "other-web-1"]);

        expect(message).toContain('"other"');
        expect(message).toContain("other-db-1");
        expect(message).toContain("other-web-1");
        expect(message).toContain("Nothing was created or copied");
    });
});

describe("composeStopTimeoutMs", () => {
    it.each([
        [0, 120_000],
        [1, 120_000],
        [4, 120_000],
        [5, 150_000],
        [10, 300_000],
        [30, 900_000],
        [100, 900_000],
    ])("allows %i container(s) %i ms", (count, expected) => {
        expect(composeStopTimeoutMs(count)).toBe(expected);
    });
});
