import {z} from "zod"
import type {EnvironmentWarning} from "@docktor/shared"

/**
 * Pure startup environment check (#7, D-10/D-11/D-13).
 *
 * One Zod schema decides which variables are required (blocking errors, all
 * collected in a single pass); a list of small evaluators decides which
 * optional-variable misconfigurations are worth a non-blocking warning. The
 * caller passes the environment in — this module never reads the process
 * environment and never touches the filesystem, so every rule is unit-testable.
 *
 * Messages are built from variable names and fixed text only. An environment
 * value is never echoed: the log is readable by anyone who can run
 * `docker logs`, and the warnings are served to the browser.
 */

export const REQUIRED_ENVIRONMENT_VARIABLES = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "ENCRYPTION_KEY",
] as const

export type EnvironmentSource = Readonly<Record<string, string | undefined>>

export interface EnvironmentError {
    variable: string
    message: string
}

export interface EnvironmentCheckResult {
    errors: EnvironmentError[]
    warnings: EnvironmentWarning[]
}

export interface EnvironmentContext {
    /** True when the process runs inside a container (Docker/Podman). */
    containerized: boolean
}

const HEX_64 = /^[0-9a-fA-F]{64}$/
const TEMPLATE_PREFIX = "CHANGE_ME"
const KEY_GENERATOR = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

// `VAR=` in an env file arrives as an empty string; treat it as not set.
const blankToUndefined = (value: unknown): unknown =>
    typeof value === "string" && value.trim() === "" ? undefined : value

const required = (hint: string) => z.preprocess(blankToUndefined, z.string({error: `is required. ${hint}`}))

const encryptionKeySchema = required(`Generate one with: ${KEY_GENERATOR}`).superRefine((value, ctx) => {
    if (HEX_64.test(value)) return
    const templateNote = value.startsWith(TEMPLATE_PREFIX)
        ? " The value is still the .env.example template value."
        : ""
    ctx.addIssue({
        code: "custom",
        message: `must be exactly 64 hex characters (32 bytes). Generate one with: ${KEY_GENERATOR}.${templateNote}`,
    })
})

const requiredEnvironmentSchema = z.object({
    DATABASE_URL: required("Set the Postgres connection string, e.g. postgresql://docktor:PASSWORD@db:5432/docktor"),
    BETTER_AUTH_SECRET: required(`Generate one with: ${KEY_GENERATOR}`),
    BETTER_AUTH_URL: required("Set the URL users open Docktor at, e.g. http://SERVER-IP:3000"),
    ENCRYPTION_KEY: encryptionKeySchema,
})

function collectErrors(env: EnvironmentSource): EnvironmentError[] {
    const result = requiredEnvironmentSchema.safeParse(env)
    if (result.success) return []

    const firstMessage = new Map<string, string>()
    for (const issue of result.error.issues) {
        const variable = String(issue.path[0])
        if (!firstMessage.has(variable)) firstMessage.set(variable, issue.message)
    }
    return REQUIRED_ENVIRONMENT_VARIABLES.flatMap((variable) => {
        const message = firstMessage.get(variable)
        return message === undefined ? [] : [{variable, message}]
    })
}

/** The trimmed value of a variable, or undefined when it is unset or blank. */
function valueOf(env: EnvironmentSource, name: string): string | undefined {
    const raw = env[name]?.trim()
    return raw ? raw : undefined
}

type WarningEvaluator = (
    env: EnvironmentSource,
    context: EnvironmentContext,
) => EnvironmentWarning | EnvironmentWarning[] | null

// .env.example "TRUST_PROXY" and docs/deployment.md "Sign-in protection": behind
// a TLS-terminating proxy, an unset TRUST_PROXY puts every client in one
// sign-in rate-limit bucket.
const trustProxyUnsetBehindHttps: WarningEvaluator = (env) => {
    if (valueOf(env, "TRUST_PROXY") !== undefined) return null
    if (!/^https:\/\//i.test(valueOf(env, "BETTER_AUTH_URL") ?? "")) return null
    return {
        code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
        variable: "TRUST_PROXY",
        message:
            "BETTER_AUTH_URL is https:// but TRUST_PROXY is not set. Behind a TLS-terminating reverse proxy every " +
            "client then shares one sign-in rate-limit bucket. Set TRUST_PROXY to the number of proxies in front " +
            "of Docktor, normally 1.",
    }
}

const WARNING_EVALUATORS: readonly WarningEvaluator[] = [trustProxyUnsetBehindHttps]

function collectWarnings(env: EnvironmentSource, context: EnvironmentContext): EnvironmentWarning[] {
    const warnings = WARNING_EVALUATORS.flatMap((evaluate) => {
        const outcome = evaluate(env, context)
        if (outcome === null) return []
        return Array.isArray(outcome) ? outcome : [outcome]
    })
    return warnings.sort((a, b) => a.code.localeCompare(b.code) || a.variable.localeCompare(b.variable))
}

export function checkEnvironment(env: EnvironmentSource, context: EnvironmentContext): EnvironmentCheckResult {
    return {errors: collectErrors(env), warnings: collectWarnings(env, context)}
}

/** One block listing every blocking problem, ready for a single log call. */
export function formatEnvironmentErrors(errors: readonly EnvironmentError[]): string {
    const width = Math.max(...errors.map((error) => error.variable.length))
    return [
        `[env] Docktor cannot start: ${errors.length} environment problem(s) must be fixed first.`,
        ...errors.map((error) => `  ${error.variable.padEnd(width)}  ${error.message}`),
        "See .env.example for every variable and how to set it.",
    ].join("\n")
}

export function formatEnvironmentWarning(warning: EnvironmentWarning): string {
    return `[env] WARNING ${warning.variable} ${warning.message} (${warning.code})`
}
