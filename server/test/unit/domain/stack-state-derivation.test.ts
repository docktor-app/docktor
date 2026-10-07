import {describe, expect, it} from "vitest";
import {
    deriveStackStatus,
    isTransitionalStatus,
    TRANSITIONAL_STATES,
} from "../../../src/domain/stack-state-derivation.js";

describe("deriveStackStatus", () => {
    it("derives RUNNING for an empty service list", () => {
        expect(deriveStackStatus([])).toBe("RUNNING");
    });

    it("derives RUNNING for a single running service without a health check", () => {
        expect(deriveStackStatus([{containerState: "running", healthStatus: null}])).toBe("RUNNING");
    });

    it("derives ERROR when any service is restarting", () => {
        expect(deriveStackStatus([{containerState: "restarting"}])).toBe("ERROR");
    });

    it("derives ERROR when any service is dead, even next to a running one", () => {
        expect(
            deriveStackStatus([{containerState: "dead"}, {containerState: "running"}]),
        ).toBe("ERROR");
    });

    it("derives STOPPED when every service is exited", () => {
        expect(
            deriveStackStatus([{containerState: "exited"}, {containerState: "exited"}]),
        ).toBe("STOPPED");
    });

    it("derives RUNNING when only some services are exited", () => {
        expect(
            deriveStackStatus([{containerState: "running"}, {containerState: "exited"}]),
        ).toBe("RUNNING");
    });

    it("derives UNHEALTHY when any service is unhealthy", () => {
        expect(
            deriveStackStatus([{containerState: "running", healthStatus: "unhealthy"}]),
        ).toBe("UNHEALTHY");
    });

    it("derives HEALTHY when at least one health check exists and all are healthy or absent", () => {
        expect(
            deriveStackStatus([
                {containerState: "running", healthStatus: "healthy"},
                {containerState: "running", healthStatus: null},
            ]),
        ).toBe("HEALTHY");
    });

    it("derives RUNNING while a health check is still starting", () => {
        expect(
            deriveStackStatus([{containerState: "running", healthStatus: "starting"}]),
        ).toBe("RUNNING");
    });

    it("treats a missing container state as not exited (pins current precedence)", () => {
        expect(
            deriveStackStatus([{containerState: null}, {containerState: "exited"}]),
        ).toBe("RUNNING");
    });
});

describe("isTransitionalStatus", () => {
    it.each(["DEPLOYING", "UPDATING", "BACKING_UP", "RESTORING", "MIGRATING"])(
        "is true for %s",
        (status) => {
            expect(isTransitionalStatus(status)).toBe(true);
        },
    );

    it.each(["RUNNING", "ERROR", "STOPPED", "HEALTHY", "UNHEALTHY", "DRAFT"])(
        "is false for %s",
        (status) => {
            expect(isTransitionalStatus(status)).toBe(false);
        },
    );

    it("exposes exactly the five transitional statuses", () => {
        expect([...TRANSITIONAL_STATES].sort()).toEqual(
            ["BACKING_UP", "DEPLOYING", "MIGRATING", "RESTORING", "UPDATING"],
        );
    });
});
