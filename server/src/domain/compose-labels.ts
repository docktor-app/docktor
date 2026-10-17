import path from "node:path";

export const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
export const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
export const COMPOSE_WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";
export const COMPOSE_CONFIG_FILES_LABEL = "com.docker.compose.project.config_files";

/**
 * The directory a container's compose project was started from, read from its
 * labels: the trimmed `working_dir`, else the directory of the first absolute
 * `config_files` entry, else null.
 *
 * These paths are written by the compose CLI that created the container: a host
 * path, or a container path when Docktor's own CLI ran inside its container.
 */
export function composeProjectDirectory(labels: Readonly<Record<string, string>> | undefined): string | null {
    const workingDir = labels?.[COMPOSE_WORKING_DIR_LABEL]?.trim();
    if (workingDir) {
        return workingDir;
    }
    const firstAbsolute = labels?.[COMPOSE_CONFIG_FILES_LABEL]
        ?.split(",")
        .map((entry) => entry.trim())
        .find((entry) => path.posix.isAbsolute(entry));
    return firstAbsolute ? path.posix.dirname(firstAbsolute) : null;
}
