/**
 * Environment handed to every `docker` / `docker compose` child Docktor spawns (#109).
 *
 * Compose gives the calling environment precedence over a stack's own `.env`, so inheriting
 * Docktor's environment would let its secrets (BETTER_AUTH_SECRET, DATABASE_URL, ENCRYPTION_KEY),
 * its DOCKTOR_* settings and any COMPOSE_* variable (project name, files, profiles) leak into the
 * interpolation of a user's compose file. Children therefore receive only what the docker CLI
 * needs to reach the daemon. `${VAR}` references in a stack resolve from that stack's own `.env`
 * and compose defaults, never from Docktor's process.
 */
export const DOCKER_CLI_ENV_ALLOWLIST: readonly string[] = [
    "PATH",
    "HOME",
    "USER",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "TMPDIR",
    "DOCKER_HOST",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_API_VERSION",
    "SSH_AUTH_SOCK",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
];

/** Copies the allowlisted, defined variables of `source` into a new environment object. */
export function dockerCliEnvironment(source: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {};
    for (const name of DOCKER_CLI_ENV_ALLOWLIST) {
        const value = source[name];
        if (value !== undefined) {
            environment[name] = value;
        }
    }
    return environment;
}
