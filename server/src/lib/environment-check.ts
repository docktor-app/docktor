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

// .env.example "TRUST_PROXY": "true" trusts every hop, so any client can forge
// its IP (lib/auth-config.ts parseTrustProxy).
const trustProxyTrustsAll: WarningEvaluator = (env) => {
    if (valueOf(env, "TRUST_PROXY") !== "true") return null
    return {
        code: "TRUST_PROXY_TRUSTS_ALL",
        variable: "TRUST_PROXY",
        message:
            "TRUST_PROXY is true, which trusts every hop, so any client can forge its IP address and dodge the " +
            "sign-in rate limit. Set it to the number of proxies in front of Docktor instead, normally 1.",
    }
}

// .env.example "Disk monitoring" / docs/deployment.md: the disk checker's default
// (/var/lib/docker) measures the container's own throwaway filesystem layer.
const dockerDataPathNotHostMount: WarningEvaluator = (env, context) => {
    if (!context.containerized) return null
    const dataPath = valueOf(env, "DOCKER_DATA_PATH")?.replace(/\/+$/, "")
    if (dataPath !== undefined && dataPath !== "/var/lib/docker") return null
    return {
        code: "DOCKER_DATA_PATH_NOT_HOST_MOUNT",
        variable: "DOCKER_DATA_PATH",
        message:
            "Disk monitoring measures this container's own filesystem, not the host disk. Set " +
            "DOCKER_DATA_PATH=/host/var/lib/docker, which is the read-only host mount in docker-compose.yml.",
    }
}

// .env.example "NODE_ENV": the built UI is only served when NODE_ENV=production
// (server/src/app.ts).
const nodeEnvNotProductionInContainer: WarningEvaluator = (env, context) => {
    if (!context.containerized || valueOf(env, "NODE_ENV") === "production") return null
    return {
        code: "NODE_ENV_NOT_PRODUCTION_IN_CONTAINER",
        variable: "NODE_ENV",
        message:
            "Docktor runs in a container but NODE_ENV is not production. The built web UI is only served when " +
            "NODE_ENV=production. Set NODE_ENV=production.",
    }
}

// .env.example "Stacks directory": without the host path, the DooD path-match
// assertion in lib/stacks-dir.ts cannot run.
const stacksHostDirUnset: WarningEvaluator = (env, context) => {
    if (!context.containerized || valueOf(env, "DOCKTOR_STACKS_HOST_DIR") !== undefined) return null
    return {
        code: "STACKS_HOST_DIR_UNSET",
        variable: "DOCKTOR_STACKS_HOST_DIR",
        message:
            "The host and container stacks paths cannot be verified, so relative bind mounts in managed stacks may " +
            "be written to the wrong host location. Set DOCKTOR_STACKS_HOST_DIR to the host path of the stacks volume.",
    }
}

// docs/deployment.md "Stacks directory persistence": lib/stacks-dir.ts skips the
// persistence check only on the exact value "false".
const stacksMountCheckDisabled: WarningEvaluator = (env) => {
    if (env.DOCKTOR_STACKS_MOUNT_CHECK !== "false") return null
    return {
        code: "STACKS_MOUNT_CHECK_DISABLED",
        variable: "DOCKTOR_STACKS_MOUNT_CHECK",
        message:
            "The stacks persistence check is disabled. If the stacks volume is not mounted, everything written " +
            "there is lost when the container is recreated. Remove DOCKTOR_STACKS_MOUNT_CHECK=false once the " +
            "volume is mounted.",
    }
}

// .env.example CHANGE_ME values (D-12): production only, a warning never a block.
// A CHANGE_ME ENCRYPTION_KEY is not listed here — it fails the 64-hex rule instead.
const TEMPLATE_SECRET_VARIABLES = ["BETTER_AUTH_SECRET", "DATABASE_URL"] as const

const templateSecretInProduction: WarningEvaluator = (env) => {
    if (env.NODE_ENV !== "production") return null
    return TEMPLATE_SECRET_VARIABLES.filter((variable) => valueOf(env, variable)?.includes(TEMPLATE_PREFIX)).map(
        (variable): EnvironmentWarning => ({
            code: "TEMPLATE_SECRET_IN_PRODUCTION",
            variable,
            message:
                `${variable} still holds the CHANGE_ME value from .env.example. Anyone who has seen the template ` +
                "knows it. Generate a real value and restart.",
        }),
    )
}

// .env.example "Database": Docktor only supports PostgreSQL (Prisma + pg).
const databaseUrlNotPostgres: WarningEvaluator = (env) => {
    const url = valueOf(env, "DATABASE_URL")
    if (url === undefined || /^postgres(ql)?:\/\//i.test(url)) return null
    return {
        code: "DATABASE_URL_NOT_POSTGRES",
        variable: "DATABASE_URL",
        message:
            "Docktor only supports PostgreSQL. DATABASE_URL should be a connection string starting with " +
            "postgresql://, e.g. postgresql://docktor:PASSWORD@db:5432/docktor.",
    }
}

function isHttpUrl(value: string): boolean {
    try {
        const {protocol} = new URL(value)
        return protocol === "http:" || protocol === "https:"
    } catch {
        return false
    }
}

// .env.example "Authentication": a BETTER_AUTH_URL without an http(s) scheme
// produces an "invalid origin" sign-in failure, not a crash.
const betterAuthUrlNotHttp: WarningEvaluator = (env) => {
    const url = valueOf(env, "BETTER_AUTH_URL")
    if (url === undefined || isHttpUrl(url)) return null
    return {
        code: "BETTER_AUTH_URL_NOT_HTTP",
        variable: "BETTER_AUTH_URL",
        message:
            "BETTER_AUTH_URL must be a full http:// or https:// URL, e.g. http://SERVER-IP:3000, or sign-in fails " +
            "with an invalid-origin error.",
    }
}

const WARNING_EVALUATORS: readonly WarningEvaluator[] = [
    trustProxyUnsetBehindHttps,
    trustProxyTrustsAll,
    dockerDataPathNotHostMount,
    nodeEnvNotProductionInContainer,
    stacksHostDirUnset,
    stacksMountCheckDisabled,
    templateSecretInProduction,
    databaseUrlNotPostgres,
    betterAuthUrlNotHttp,
]

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
