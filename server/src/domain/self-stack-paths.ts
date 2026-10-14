import path from "node:path";

/**
 * Pure path rules for recognising Docktor's own compose file during a
 * brownfield scan (#13 "Hide Docktor's own stack from Import existing stack").
 *
 * Docker Compose labels every container with the HOST-side absolute path(s) of
 * the compose file(s) it was started from. Docktor sees the host filesystem
 * through its own bind mounts (production mounts host `/` at `/host`; custom
 * deployments may mount identical paths), so a host path is turned into the
 * path(s) at which Docktor itself can observe that file, and a scanned stack
 * is dropped only when its compose file is exactly one of them (D-01).
 *
 * Unknown input always means "exclude nothing" (D-02). There is deliberately
 * no container-name, image-name or install-directory heuristic in this module.
 *
 * Docker paths are Linux paths, so everything uses `path.posix` regardless of
 * the OS running the code.
 */

/** The subset of a Docker container mount these rules need. */
export interface ContainerMount {
    readonly type: string;
    readonly source: string;
    readonly destination: string;
}

/**
 * Every path at which Docktor can observe `hostFile`: the identical path first
 * (same-path mounts, or a path that is already container-local), then one
 * candidate per bind mount whose source is `hostFile` or one of its ancestors.
 */
export function containerVisiblePaths(hostFile: string, mounts: readonly ContainerMount[]): string[] {
    const candidates = [hostFile];
    if (!path.posix.isAbsolute(hostFile)) {
        return candidates;
    }

    for (const mount of mounts) {
        if (mount.type !== "bind") {
            continue;
        }
        const relative = path.posix.relative(mount.source, hostFile);
        if (relative === "" || relative.startsWith("..") || path.posix.isAbsolute(relative)) {
            continue;
        }
        candidates.push(path.posix.join(mount.destination, relative));
    }
    return candidates;
}

/**
 * Container-visible candidates for every compose file named by the
 * `com.docker.compose.project.config_files` label (comma-separated; a relative
 * entry is resolved against the `working_dir` label). Empty when the label is
 * missing or empty, which callers must read as "unknown".
 */
export function ownComposeFileCandidates(
    configFilesLabel: string | undefined,
    workingDirLabel: string | undefined,
    mounts: readonly ContainerMount[],
): string[] {
    if (!configFilesLabel) {
        return [];
    }

    const hostFiles = configFilesLabel
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .flatMap((entry) => resolveAgainstWorkingDir(entry, workingDirLabel));

    return [...new Set(hostFiles.flatMap((hostFile) => containerVisiblePaths(hostFile, mounts)))];
}

function resolveAgainstWorkingDir(entry: string, workingDir: string | undefined): string[] {
    if (path.posix.isAbsolute(entry)) {
        return [entry];
    }
    return workingDir ? [path.posix.resolve(workingDir, entry)] : [];
}

/** Backslashes to forward slashes, so Windows-style scanned paths compare against Docker paths. */
export function toComparablePath(p: string): string {
    return p.replaceAll("\\", "/");
}

/**
 * Drops every stack whose compose file is exactly one of `ownPaths` (D-01).
 * File equality, never directory equality: a different compose file in the
 * same directory stays offered. An empty `ownPaths` returns every stack.
 */
export function excludeOwnComposeFiles<T extends {readonly path: string}>(
    stacks: readonly T[],
    ownPaths: readonly string[],
): T[] {
    const own = new Set(ownPaths.map(toComparablePath));
    return stacks.filter((stack) => !own.has(toComparablePath(stack.path)));
}
