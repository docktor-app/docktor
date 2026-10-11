import {describe, expect, it, vi} from "vitest"
import {runStartupEnvironmentCheck} from "../../../src/lib/startup-environment.js"
import type {EnvironmentSource} from "../../../src/lib/environment-check.js"

const HEX_KEY = "0123456789abcdef".repeat(4)

const VALID_ENV: EnvironmentSource = {
    DATABASE_URL: "postgresql://u:p@db:5432/d",
    BETTER_AUTH_SECRET: HEX_KEY,
    BETTER_AUTH_URL: "http://localhost:3000",
    ENCRYPTION_KEY: HEX_KEY,
}

function silentLog() {
    return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

describe("runStartupEnvironmentCheck (#7, D-10)", () => {
    it("logs one error block naming every failing variable and exits 1", () => {
        const log = silentLog()
        const exit = vi.fn()

        runStartupEnvironmentCheck({env: {}, containerized: false, log, exit})

        expect(log.error).toHaveBeenCalledTimes(1)
        const block = String(log.error.mock.calls[0]?.[0])
        for (const variable of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "ENCRYPTION_KEY"]) {
            expect(block).toContain(variable)
        }
        expect(exit).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(1)
    })

    it("does not log warnings or the success line when it exits", () => {
        const log = silentLog()

        runStartupEnvironmentCheck({env: {}, containerized: false, log, exit: vi.fn()})

        expect(log.warn).not.toHaveBeenCalled()
        expect(log.info).not.toHaveBeenCalled()
    })

    it("never exits for a valid environment and logs each warning once", () => {
        const log = silentLog()
        const exit = vi.fn()
        const env = {...VALID_ENV, BETTER_AUTH_URL: "https://docktor.example.com"}

        const report = runStartupEnvironmentCheck({env, containerized: false, log, exit})

        expect(exit).not.toHaveBeenCalled()
        expect(log.error).not.toHaveBeenCalled()
        expect(log.warn).toHaveBeenCalledTimes(1)
        expect(String(log.warn.mock.calls[0]?.[0])).toContain("TRUST_PROXY_UNSET_BEHIND_HTTPS")
        expect(report.warnings.map((w) => w.code)).toEqual(["TRUST_PROXY_UNSET_BEHIND_HTTPS"])
    })

    it("logs an info line stating the check passed and how many warnings it found", () => {
        const log = silentLog()

        runStartupEnvironmentCheck({env: VALID_ENV, containerized: false, log, exit: vi.fn()})

        expect(log.info).toHaveBeenCalledWith("[env] environment check passed with 0 warning(s)")
    })

    it("returns an empty report for a clean environment", () => {
        const report = runStartupEnvironmentCheck({
            env: VALID_ENV,
            containerized: false,
            log: silentLog(),
            exit: vi.fn(),
        })

        expect(report).toEqual({warnings: []})
    })
})
