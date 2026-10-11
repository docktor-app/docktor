import {describe, expect, it} from "vitest"
import {
    checkEnvironment,
    formatEnvironmentErrors,
    formatEnvironmentWarning,
    REQUIRED_ENVIRONMENT_VARIABLES,
    type EnvironmentSource,
} from "../../../src/lib/environment-check.js"

const HEX_KEY = "0123456789abcdef".repeat(4)
const TEMPLATE_KEY = "CHANGE_ME_GENERATE_A_RANDOM_64_HEX_KEY"

const VALID_ENV: EnvironmentSource = {
    DATABASE_URL: "postgresql://u:p@db:5432/d",
    BETTER_AUTH_SECRET: HEX_KEY,
    BETTER_AUTH_URL: "http://localhost:3000",
    ENCRYPTION_KEY: HEX_KEY,
}

const HOST = {containerized: false}

function errorsFor(env: EnvironmentSource) {
    return checkEnvironment(env, HOST).errors
}

describe("checkEnvironment: blocking errors (#7, D-10)", () => {
    it("lists exactly the four required variables, in order, when the environment is empty", () => {
        const {errors} = checkEnvironment({}, HOST)

        expect(errors.map((e) => e.variable)).toEqual([
            "DATABASE_URL",
            "BETTER_AUTH_SECRET",
            "BETTER_AUTH_URL",
            "ENCRYPTION_KEY",
        ])
        expect([...REQUIRED_ENVIRONMENT_VARIABLES]).toEqual(errors.map((e) => e.variable))
    })

    it("gives every error a non-empty message with a fix hint", () => {
        for (const error of errorsFor({})) {
            expect(error.message).toMatch(/is required/)
            expect(error.message.length).toBeGreaterThan(20)
        }
    })

    it.each(["", "   ", "\t"])("treats %j as missing with the same message as unset", (blank) => {
        const unset = errorsFor({...VALID_ENV, DATABASE_URL: undefined})
        const blanked = errorsFor({...VALID_ENV, DATABASE_URL: blank})

        expect(blanked).toEqual(unset)
        expect(blanked).toHaveLength(1)
        expect(blanked[0]?.variable).toBe("DATABASE_URL")
    })

    it("reports only the variables that fail, not the valid ones", () => {
        const errors = errorsFor({...VALID_ENV, BETTER_AUTH_URL: undefined})

        expect(errors.map((e) => e.variable)).toEqual(["BETTER_AUTH_URL"])
    })

    it("reports no error when all four variables are valid", () => {
        expect(errorsFor(VALID_ENV)).toEqual([])
    })

    it.each([
        ["63 hex characters", HEX_KEY.slice(0, 63)],
        ["65 hex characters", `${HEX_KEY}a`],
        ["64 characters with a non-hex character", `${HEX_KEY.slice(0, 63)}g`],
    ])("rejects an ENCRYPTION_KEY of %s", (_label, key) => {
        const errors = errorsFor({...VALID_ENV, ENCRYPTION_KEY: key})

        expect(errors).toHaveLength(1)
        expect(errors[0]?.variable).toBe("ENCRYPTION_KEY")
        expect(errors[0]?.message).toContain("exactly 64 hex characters")
    })

    it("rejects the .env.example template ENCRYPTION_KEY and says it is the template value", () => {
        const errors = errorsFor({...VALID_ENV, ENCRYPTION_KEY: TEMPLATE_KEY})

        expect(errors).toHaveLength(1)
        expect(errors[0]?.variable).toBe("ENCRYPTION_KEY")
        expect(errors[0]?.message).toContain("exactly 64 hex characters")
        expect(errors[0]?.message).toContain(".env.example template value")
    })

    it("does not mention the template for an ordinary malformed key", () => {
        const errors = errorsFor({...VALID_ENV, ENCRYPTION_KEY: "short"})

        expect(errors[0]?.message).not.toContain("template")
    })

    it.each([HEX_KEY, HEX_KEY.toUpperCase()])("accepts a 64-character hex ENCRYPTION_KEY (%#)", (key) => {
        expect(errorsFor({...VALID_ENV, ENCRYPTION_KEY: key})).toEqual([])
    })
})

describe("checkEnvironment: TRUST_PROXY_UNSET_BEHIND_HTTPS (#7, D-11)", () => {
    const behindHttps = {...VALID_ENV, BETTER_AUTH_URL: "https://docktor.example.com"}

    it.each([undefined, "", "  "])("warns for an https URL with TRUST_PROXY %j", (trustProxy) => {
        const {warnings} = checkEnvironment({...behindHttps, TRUST_PROXY: trustProxy}, HOST)

        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toMatchObject({
            code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
            variable: "TRUST_PROXY",
        })
        expect(warnings[0]?.message.length).toBeGreaterThan(0)
    })

    it("does not warn when TRUST_PROXY is set", () => {
        const {warnings} = checkEnvironment({...behindHttps, TRUST_PROXY: "1"}, HOST)

        expect(warnings.map((w) => w.code)).not.toContain("TRUST_PROXY_UNSET_BEHIND_HTTPS")
    })

    it("does not warn for an http URL", () => {
        const {warnings} = checkEnvironment(VALID_ENV, HOST)

        expect(warnings.map((w) => w.code)).not.toContain("TRUST_PROXY_UNSET_BEHIND_HTTPS")
    })
})

describe("formatEnvironmentErrors", () => {
    it("states the count first, lists every variable one per line, and points to .env.example last", () => {
        const block = formatEnvironmentErrors(errorsFor({}))
        const lines = block.split("\n")

        expect(lines[0]).toBe("[env] Docktor cannot start: 4 environment problem(s) must be fixed first.")
        expect(lines.at(-1)).toBe("See .env.example for every variable and how to set it.")
        for (const variable of REQUIRED_ENVIRONMENT_VARIABLES) {
            expect(lines.filter((line) => line.includes(variable))).toHaveLength(1)
        }
        expect(lines).toHaveLength(6)
    })

    it("pads the variable names to a common width", () => {
        const lines = formatEnvironmentErrors(errorsFor({})).split("\n").slice(1, -1)
        const messageColumns = lines.map((line) => line.indexOf("is required"))

        expect(new Set(messageColumns).size).toBe(1)
    })
})

describe("formatEnvironmentWarning", () => {
    it("renders prefix, variable, message and code on one line", () => {
        const line = formatEnvironmentWarning({
            code: "TRUST_PROXY_TRUSTS_ALL",
            variable: "TRUST_PROXY",
            message: "Trusts every hop.",
        })

        expect(line).toBe("[env] WARNING TRUST_PROXY Trusts every hop. (TRUST_PROXY_TRUSTS_ALL)")
    })
})

function warningCodes(env: EnvironmentSource, context = HOST): string[] {
    return checkEnvironment(env, context).warnings.map((w) => w.code)
}

const IN_CONTAINER = {containerized: true}

// A container deployment that triggers none of the warnings, as the starting point for each rule.
const HEALTHY_CONTAINER_ENV: EnvironmentSource = {
    ...VALID_ENV,
    NODE_ENV: "production",
    DOCKER_DATA_PATH: "/host/var/lib/docker",
    DOCKTOR_STACKS_HOST_DIR: "/opt/docktor/stacks",
}

describe("checkEnvironment: warning rules (#7, D-11)", () => {
    it("reports no warning for a healthy container deployment", () => {
        expect(warningCodes(HEALTHY_CONTAINER_ENV, IN_CONTAINER)).toEqual([])
    })

    it.each([
        ["true", true],
        [" true ", true],
        ["1", false],
        ["10.0.0.0/8", false],
        [undefined, false],
    ])("TRUST_PROXY_TRUSTS_ALL for TRUST_PROXY %j: %s", (trustProxy, expected) => {
        const codes = warningCodes({...VALID_ENV, TRUST_PROXY: trustProxy})

        expect(codes.includes("TRUST_PROXY_TRUSTS_ALL")).toBe(expected)
        if (expected) {
            const warning = checkEnvironment({...VALID_ENV, TRUST_PROXY: trustProxy}, HOST).warnings[0]
            expect(warning?.variable).toBe("TRUST_PROXY")
        }
    })

    it.each([
        ["containerized, unset", IN_CONTAINER, undefined, true],
        ["containerized, the container's own default", IN_CONTAINER, "/var/lib/docker", true],
        ["containerized, the default with a trailing slash", IN_CONTAINER, "/var/lib/docker/", true],
        ["containerized, the host mount", IN_CONTAINER, "/host/var/lib/docker", false],
        ["not containerized, unset", HOST, undefined, false],
        ["not containerized, the default", HOST, "/var/lib/docker", false],
    ])("DOCKER_DATA_PATH_NOT_HOST_MOUNT when %s", (_label, context, dockerDataPath, expected) => {
        const env = {...HEALTHY_CONTAINER_ENV, DOCKER_DATA_PATH: dockerDataPath}

        expect(warningCodes(env, context).includes("DOCKER_DATA_PATH_NOT_HOST_MOUNT")).toBe(expected)
    })

    it.each([
        ["containerized, development", IN_CONTAINER, "development", true],
        ["containerized, unset", IN_CONTAINER, undefined, true],
        ["containerized, production", IN_CONTAINER, "production", false],
        ["not containerized, development", HOST, "development", false],
        ["not containerized, unset", HOST, undefined, false],
    ])("NODE_ENV_NOT_PRODUCTION_IN_CONTAINER when %s", (_label, context, nodeEnv, expected) => {
        const env = {...HEALTHY_CONTAINER_ENV, NODE_ENV: nodeEnv}
        const warnings = checkEnvironment(env, context).warnings

        expect(warnings.some((w) => w.code === "NODE_ENV_NOT_PRODUCTION_IN_CONTAINER")).toBe(expected)
        if (expected) {
            expect(warnings.find((w) => w.code === "NODE_ENV_NOT_PRODUCTION_IN_CONTAINER")?.variable).toBe("NODE_ENV")
        }
    })

    it.each([
        ["containerized, unset", IN_CONTAINER, undefined, true],
        ["containerized, blank", IN_CONTAINER, "  ", true],
        ["containerized, set", IN_CONTAINER, "/opt/docktor/stacks", false],
        ["not containerized, unset", HOST, undefined, false],
    ])("STACKS_HOST_DIR_UNSET when %s", (_label, context, hostDir, expected) => {
        const env = {...HEALTHY_CONTAINER_ENV, DOCKTOR_STACKS_HOST_DIR: hostDir}
        const warnings = checkEnvironment(env, context).warnings

        expect(warnings.some((w) => w.code === "STACKS_HOST_DIR_UNSET")).toBe(expected)
        if (expected) {
            expect(warnings.find((w) => w.code === "STACKS_HOST_DIR_UNSET")?.variable).toBe("DOCKTOR_STACKS_HOST_DIR")
        }
    })

    it.each([
        ["false in a container", IN_CONTAINER, "false", true],
        ["false outside a container", HOST, "false", true],
        ["true", HOST, "true", false],
        ["unset", HOST, undefined, false],
    ])("STACKS_MOUNT_CHECK_DISABLED for DOCKTOR_STACKS_MOUNT_CHECK %s", (_label, context, check, expected) => {
        const env = {...HEALTHY_CONTAINER_ENV, DOCKTOR_STACKS_MOUNT_CHECK: check}

        expect(warningCodes(env, context).includes("STACKS_MOUNT_CHECK_DISABLED")).toBe(expected)
    })

    it.each([
        ["mysql://u:p@h/d", true],
        ["postgres://u:p@h/d", false],
        ["postgresql://u:p@h/d", false],
        ["POSTGRESQL://u:p@h/d", false],
    ])("DATABASE_URL_NOT_POSTGRES for %s: %s", (url, expected) => {
        const warnings = checkEnvironment({...VALID_ENV, DATABASE_URL: url}, HOST).warnings

        expect(warnings.some((w) => w.code === "DATABASE_URL_NOT_POSTGRES")).toBe(expected)
    })

    it("reports a missing DATABASE_URL only as the blocking error, not as a warning", () => {
        const result = checkEnvironment({...VALID_ENV, DATABASE_URL: undefined}, HOST)

        expect(result.errors.map((e) => e.variable)).toEqual(["DATABASE_URL"])
        expect(result.warnings).toEqual([])
    })

    it.each([
        ["localhost:3000", true],
        ["ftp://host", true],
        ["not a url", true],
        ["http://localhost:3000", false],
        ["https://docktor.example.com", false],
    ])("BETTER_AUTH_URL_NOT_HTTP for %s: %s", (url, expected) => {
        const env = {...VALID_ENV, BETTER_AUTH_URL: url, TRUST_PROXY: "1"}

        expect(warningCodes(env).includes("BETTER_AUTH_URL_NOT_HTTP")).toBe(expected)
    })

    it("reports a missing BETTER_AUTH_URL only as the blocking error, not as a warning", () => {
        const result = checkEnvironment({...VALID_ENV, BETTER_AUTH_URL: undefined}, HOST)

        expect(result.errors.map((e) => e.variable)).toEqual(["BETTER_AUTH_URL"])
        expect(result.warnings).toEqual([])
    })

    it("sorts warnings by code, then variable, so the output is deterministic", () => {
        const env = {
            ...VALID_ENV,
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: "CHANGE_ME_GENERATE_A_RANDOM_SECRET",
            DATABASE_URL: "postgresql://docktor:CHANGE_ME_DB_PASSWORD@db:5432/docktor",
            TRUST_PROXY: "true",
            DOCKTOR_STACKS_MOUNT_CHECK: "false",
        }
        const warnings = checkEnvironment(env, HOST).warnings
        const keys = warnings.map((w) => `${w.code}/${w.variable}`)

        expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)))
        expect(keys).toHaveLength(4)
    })
})

describe("checkEnvironment: TEMPLATE_SECRET_IN_PRODUCTION (#7, D-12)", () => {
    const TEMPLATE_SECRET = "CHANGE_ME_GENERATE_A_RANDOM_SECRET"
    const TEMPLATE_DATABASE_URL = "postgresql://docktor:CHANGE_ME_DB_PASSWORD@db:5432/docktor"

    function templateWarnings(env: EnvironmentSource) {
        return checkEnvironment(env, HOST).warnings.filter((w) => w.code === "TEMPLATE_SECRET_IN_PRODUCTION")
    }

    it("warns for a template BETTER_AUTH_SECRET in production", () => {
        const warnings = templateWarnings({...VALID_ENV, NODE_ENV: "production", BETTER_AUTH_SECRET: TEMPLATE_SECRET})

        expect(warnings.map((w) => w.variable)).toEqual(["BETTER_AUTH_SECRET"])
    })

    it("warns for a template DATABASE_URL in production", () => {
        const warnings = templateWarnings({...VALID_ENV, NODE_ENV: "production", DATABASE_URL: TEMPLATE_DATABASE_URL})

        expect(warnings.map((w) => w.variable)).toEqual(["DATABASE_URL"])
    })

    it("gives two separate warnings when both are still the template", () => {
        const warnings = templateWarnings({
            ...VALID_ENV,
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: TEMPLATE_SECRET,
            DATABASE_URL: TEMPLATE_DATABASE_URL,
        })

        expect(warnings.map((w) => w.variable)).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"])
    })

    it.each(["development", "test", undefined])("does nothing when NODE_ENV is %j", (nodeEnv) => {
        const env = {
            ...VALID_ENV,
            NODE_ENV: nodeEnv,
            BETTER_AUTH_SECRET: TEMPLATE_SECRET,
            DATABASE_URL: TEMPLATE_DATABASE_URL,
        }
        const result = checkEnvironment(env, HOST)

        expect(result.warnings.filter((w) => w.code === "TEMPLATE_SECRET_IN_PRODUCTION")).toEqual([])
        expect(result.errors).toEqual([])
    })

    it("never turns a template value into a blocking error", () => {
        const env = {
            ...VALID_ENV,
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: TEMPLATE_SECRET,
            DATABASE_URL: TEMPLATE_DATABASE_URL,
        }

        expect(checkEnvironment(env, HOST).errors).toEqual([])
    })

    it("yields one ENCRYPTION_KEY error and no other error for the whole .env.example template", () => {
        const template: EnvironmentSource = {
            NODE_ENV: "production",
            PORT: "3000",
            HOST: "0.0.0.0",
            DATABASE_URL: TEMPLATE_DATABASE_URL,
            BETTER_AUTH_SECRET: TEMPLATE_SECRET,
            BETTER_AUTH_URL: "http://localhost:3000",
            ENCRYPTION_KEY: TEMPLATE_KEY,
            DOCKTOR_STACKS_DIR: "/opt/docktor/stacks",
            DOCKTOR_STACKS_HOST_DIR: "/opt/docktor/stacks",
            DOCKER_DATA_PATH: "/host/var/lib/docker",
        }
        const result = checkEnvironment(template, IN_CONTAINER)

        expect(result.errors.map((e) => e.variable)).toEqual(["ENCRYPTION_KEY"])
        expect(result.errors[0]?.message).toContain(".env.example template value")
        expect(result.warnings.map((w) => `${w.code}/${w.variable}`)).toEqual([
            "TEMPLATE_SECRET_IN_PRODUCTION/BETTER_AUTH_SECRET",
            "TEMPLATE_SECRET_IN_PRODUCTION/DATABASE_URL",
        ])
    })
})

describe("environment check output never echoes a value (#7, T-16-01)", () => {
    const SECRETS = ["s3cr3t-VALUE-xyz", "p4ssw0rd-XYZ", "SECRETKEY"]
    const env: EnvironmentSource = {
        DATABASE_URL: "mysql://u:p4ssw0rd-XYZ@h/d",
        BETTER_AUTH_SECRET: "s3cr3t-VALUE-xyz",
        BETTER_AUTH_URL: "https://docktor.example.com",
        ENCRYPTION_KEY: "zz-not-hex-SECRETKEY",
        TRUST_PROXY: "true",
        NODE_ENV: "production",
    }

    it("keeps secret-looking values out of error lines, warning lines and the serialized result", () => {
        const result = checkEnvironment(env, IN_CONTAINER)
        const output = [
            formatEnvironmentErrors(result.errors),
            ...result.warnings.map(formatEnvironmentWarning),
            JSON.stringify(result),
        ].join("\n")

        // The fixture must actually exercise both an error and a warning path.
        expect(result.errors.map((e) => e.variable)).toEqual(["ENCRYPTION_KEY"])
        expect(result.warnings.map((w) => w.code)).toContain("DATABASE_URL_NOT_POSTGRES")
        expect(result.warnings.map((w) => w.code)).toContain("TRUST_PROXY_TRUSTS_ALL")
        for (const secret of SECRETS) {
            expect(output).not.toContain(secret)
        }
    })
})
