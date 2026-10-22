import {describe, expect, it} from "vitest";
import {
    composeStopTimeoutMs,
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

describe("stillRunning", () => {
    it("returns the names of the running containers only", () => {
        const containers = [
            container({name: "p-db-1", service: "db"}),
            container({name: "p-job-1", service: "job", running: false}),
            container({name: "p-web-1", service: "web"}),
        ];

        expect(stillRunning(containers)).toEqual(["p-db-1", "p-web-1"]);
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
