import {describe, expect, it} from "vitest";
import {
    ENVIRONMENT_WARNING_CODES,
    environmentReportSchema,
    environmentWarningCodeSchema,
    environmentWarningSchema,
} from "../../../src/validation/environment.js";

const EXPECTED_CODES = [
    "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    "TRUST_PROXY_TRUSTS_ALL",
    "DOCKER_DATA_PATH_NOT_HOST_MOUNT",
    "NODE_ENV_NOT_PRODUCTION_IN_CONTAINER",
    "STACKS_HOST_DIR_UNSET",
    "STACKS_MOUNT_CHECK_DISABLED",
    "TEMPLATE_SECRET_IN_PRODUCTION",
    "DATABASE_URL_NOT_POSTGRES",
    "BETTER_AUTH_URL_NOT_HTTP",
];

describe("ENVIRONMENT_WARNING_CODES", () => {
    it("lists the nine warning codes of the startup environment check", () => {
        expect([...ENVIRONMENT_WARNING_CODES].sort()).toEqual([...EXPECTED_CODES].sort());
    });
});

describe("environmentWarningCodeSchema", () => {
    it.each(EXPECTED_CODES)("accepts %s", (code) => {
        expect(environmentWarningCodeSchema.safeParse(code).success).toBe(true);
    });

    it("rejects an unknown code", () => {
        expect(environmentWarningCodeSchema.safeParse("SOMETHING_ELSE").success).toBe(false);
    });
});

describe("environmentWarningSchema", () => {
    const valid = {code: "TRUST_PROXY_TRUSTS_ALL", variable: "TRUST_PROXY", message: "Trusts every hop."};

    it("accepts a complete warning", () => {
        expect(environmentWarningSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects an empty variable name", () => {
        expect(environmentWarningSchema.safeParse({...valid, variable: ""}).success).toBe(false);
    });

    it("rejects an empty message", () => {
        expect(environmentWarningSchema.safeParse({...valid, message: ""}).success).toBe(false);
    });
});

describe("environmentReportSchema", () => {
    it("accepts an empty warning list", () => {
        expect(environmentReportSchema.safeParse({warnings: []}).success).toBe(true);
    });

    it("accepts a list of valid warnings", () => {
        const result = environmentReportSchema.safeParse({
            warnings: [{code: "TRUST_PROXY_TRUSTS_ALL", variable: "TRUST_PROXY", message: "Trusts every hop."}],
        });
        expect(result.success).toBe(true);
    });

    it("rejects a warning with an unknown code", () => {
        const result = environmentReportSchema.safeParse({
            warnings: [{code: "NOPE", variable: "TRUST_PROXY", message: "x"}],
        });
        expect(result.success).toBe(false);
    });

    it("rejects a warning with an empty variable", () => {
        const result = environmentReportSchema.safeParse({
            warnings: [{code: "TRUST_PROXY_TRUSTS_ALL", variable: "", message: "x"}],
        });
        expect(result.success).toBe(false);
    });

    it("strips fields other than code, variable and message", () => {
        const result = environmentReportSchema.parse({
            warnings: [{code: "TRUST_PROXY_TRUSTS_ALL", variable: "TRUST_PROXY", message: "x", value: "true"}],
        });
        expect(result.warnings[0]).toEqual({code: "TRUST_PROXY_TRUSTS_ALL", variable: "TRUST_PROXY", message: "x"});
    });
});
