export const DOCKER_CLI_ENV_ALLOWLIST: readonly string[] = [];

export function dockerCliEnvironment(_source: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
    return {};
}
