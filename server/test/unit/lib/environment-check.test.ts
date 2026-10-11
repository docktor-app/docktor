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
