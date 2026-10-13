import {afterEach, describe, expect, it, vi} from "vitest";
import type {EnvironmentReport} from "@docktor/shared";
import {EnvironmentStatusService} from "../../../src/application/environment-status-service.js";
import {getEnvironmentReport, setEnvironmentReport} from "../../../src/lib/environment-report.js";

const REPORT: EnvironmentReport = {
    warnings: [{code: "TRUST_PROXY_TRUSTS_ALL", variable: "TRUST_PROXY", message: "Trusts every hop."}],
};

describe("EnvironmentStatusService (#7, D-13)", () => {
    it("returns the report its reader supplies", () => {
        const service = new EnvironmentStatusService(() => REPORT);

        expect(service.getReport()).toEqual(REPORT);
    });

    it("reads the report on every call, so a later boot-time store is visible", () => {
        let current: EnvironmentReport = {warnings: []};
        const service = new EnvironmentStatusService(() => current);

        expect(service.getReport()).toEqual({warnings: []});
        current = REPORT;
        expect(service.getReport()).toEqual(REPORT);
    });
});

describe("environment report store (#7, D-13)", () => {
    afterEach(() => {
        setEnvironmentReport({warnings: []});
    });

    it("defaults to an empty report before anything is set", async () => {
        // Fresh module instance: other tests in this file may already have set the store.
        vi.resetModules();
        const fresh = await import("../../../src/lib/environment-report.js");
        expect(fresh.getEnvironmentReport()).toEqual({warnings: []});
    });

    it("returns what was set", () => {
        setEnvironmentReport(REPORT);

        expect(getEnvironmentReport()).toEqual(REPORT);
    });

    it("is isolated from later mutation of the object that was set", () => {
        const mutable: EnvironmentReport = {warnings: [...REPORT.warnings]};
        setEnvironmentReport(mutable);

        mutable.warnings.push({code: "STACKS_HOST_DIR_UNSET", variable: "DOCKTOR_STACKS_HOST_DIR", message: "x"});

        expect(getEnvironmentReport()).toEqual(REPORT);
    });

    it("is isolated from mutation of the object that was returned", () => {
        setEnvironmentReport(REPORT);

        getEnvironmentReport().warnings.length = 0;

        expect(getEnvironmentReport()).toEqual(REPORT);
    });
});
