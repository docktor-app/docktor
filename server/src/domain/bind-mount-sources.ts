import path from "node:path";
import {containerVisiblePaths, toComparablePath, type ContainerMount} from "./self-stack-paths.js";

/**
 * Where Docktor can read a bind-mount source that a compose file declares
 * (CR-03, MIG-04).
 *
 * A compose bind source is a HOST path. Inside a container only a path reached
 * through one of Docktor's own bind mounts is host data: the bare path would
 * read Docktor's own image filesystem. These rules translate a declared source
 * into the paths at which Docktor can observe it, so a migration copies the
 * real data or knows it cannot.
 */

/** What Docktor knows about its own mounts. */
export type OwnMountsView =
    /** Docktor is not containerized: a host path is a local path. */
    | {readonly kind: "host"}
    /** Docktor runs in a container whose mounts are known. */
    | {readonly kind: "container"; readonly mounts: readonly ContainerMount[]}
    /** Docktor is containerized but the lookup failed. */
    | {readonly kind: "unknown"};

export type BindSourceLocation = {readonly kind: "candidates"; readonly paths: readonly string[]};

function isInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Candidates inside `composeDir` first, so an in-place relocation keeps working. */
function insideFirst(candidates: readonly string[], composeDir: string): string[] {
    const unique = [...new Set(candidates)];
    const comparableDir = toComparablePath(path.resolve(composeDir));
    const inside = (candidate: string): boolean =>
        isInside(toComparablePath(candidate), comparableDir);
    return [...unique.filter(inside), ...unique.filter((candidate) => !inside(candidate))];
}

/** True when locating `declaredPath` depends on what Docktor can see of the host. */
export function needsOwnMounts(declaredPath: string): boolean {
    return path.posix.isAbsolute(declaredPath) || path.isAbsolute(declaredPath);
}

/**
 * Locates `declaredPath` (exactly as the compose file spells it) for a compose
 * file in `composeDir`.
 */
export function locateBindSource(
    declaredPath: string,
    composeDir: string,
    view: OwnMountsView,
): BindSourceLocation {
    if (!path.posix.isAbsolute(declaredPath) && !path.isAbsolute(declaredPath)) {
        return {kind: "candidates", paths: [path.resolve(composeDir, declaredPath)]};
    }
    if (view.kind !== "container") {
        return {kind: "candidates", paths: [declaredPath]};
    }
    // Drop the leading identical-path entry: a same-path mount still yields the
    // identical path through its own mount entry, the bare path is not host data.
    const [, ...mounted] = containerVisiblePaths(declaredPath, view.mounts);
    return {kind: "candidates", paths: insideFirst(mounted, composeDir)};
}
