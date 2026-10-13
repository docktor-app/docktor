import type {EnvironmentReport} from "@docktor/shared"
import {
    checkEnvironment,
    formatEnvironmentErrors,
    formatEnvironmentWarning,
    type EnvironmentSource,
} from "./environment-check.js"

/**
 * Process bootstrap for the environment check (#7, D-10/D-13).
 *
 * Injectable like installShutdownHandlers: the environment, the container flag,
 * the log and the exit function are all parameters, so the whole decision is
 * unit-testable without touching process state. It must not import lib/auth.ts
 * or anything that reaches it — it runs before that module is allowed to load.
 */

export type StartupLog = Pick<Console, "info" | "warn" | "error">

export interface StartupEnvironmentOptions {
    env: EnvironmentSource
    containerized: boolean
    log: StartupLog
    exit: (code: number) => void
}

/**
 * Blocking errors are logged as one block and end the process with code 1.
 * Otherwise every warning is logged once and the report is returned so it can
 * be stored for GET /api/settings/environment.
 */
export function runStartupEnvironmentCheck(options: StartupEnvironmentOptions): EnvironmentReport {
    const {env, containerized, log, exit} = options
    const {errors, warnings} = checkEnvironment(env, {containerized})

    if (errors.length > 0) {
        log.error(formatEnvironmentErrors(errors))
        exit(1)
        // Only reachable when `exit` is a test stub; process.exit never returns.
        return {warnings: []}
    }

    for (const warning of warnings) log.warn(formatEnvironmentWarning(warning))
    log.info(`[env] environment check passed with ${warnings.length} warning(s)`)
    return {warnings}
}
