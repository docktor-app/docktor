import {describe, expect, it} from "vitest";
import {decideIncidentAction} from "../../../src/domain/incident-tracking.js";

const STACK_STATUSES = [
    "DRAFT",
    "DEPLOYING",
    "RUNNING",
    "HEALTHY",
    "UNHEALTHY",
    "STOPPED",
    "ERROR",
    "UPDATING",
    "BACKING_UP",
    "RESTORING",
    "MIGRATING",
] as const;

const OPEN_UNHEALTHY = {triggerType: "UNHEALTHY"};
const OPEN_ERROR = {triggerType: "ERROR"};

describe("decideIncidentAction (D-11)", () => {
    describe("without an open incident", () => {
        it.each(["UNHEALTHY", "ERROR"] as const)("opens an incident with cause %s", (status) => {
            expect(decideIncidentAction(null, status)).toEqual({kind: "open", cause: status});
        });

        it.each(STACK_STATUSES.filter((s) => s !== "UNHEALTHY" && s !== "ERROR"))(
            "does nothing for %s",
            (status) => {
                expect(decideIncidentAction(null, status)).toEqual({kind: "none"});
            },
        );
    });

    describe("with an open incident", () => {
        it.each(["UNHEALTHY", "ERROR"] as const)("keeps the episode open across a flip to %s", (status) => {
            expect(decideIncidentAction(OPEN_UNHEALTHY, status)).toEqual({kind: "none"});
            expect(decideIncidentAction(OPEN_ERROR, status)).toEqual({kind: "none"});
        });

        it.each(["RUNNING", "HEALTHY", "STOPPED"] as const)("closes the incident when the stack reaches %s", (status) => {
            expect(decideIncidentAction(OPEN_UNHEALTHY, status)).toEqual({kind: "close"});
            expect(decideIncidentAction(OPEN_ERROR, status)).toEqual({kind: "close"});
        });

        it.each(["DRAFT", "DEPLOYING", "UPDATING", "BACKING_UP", "RESTORING", "MIGRATING"] as const)(
            "leaves the incident untouched for %s",
            (status) => {
                expect(decideIncidentAction(OPEN_UNHEALTHY, status)).toEqual({kind: "none"});
            },
        );
    });

    it("treats an unknown status as neutral", () => {
        expect(decideIncidentAction(null, "SOMETHING_ELSE")).toEqual({kind: "none"});
        expect(decideIncidentAction(OPEN_ERROR, "SOMETHING_ELSE")).toEqual({kind: "none"});
    });
});
