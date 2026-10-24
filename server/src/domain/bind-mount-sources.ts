import path from "node:path";
import type {ProjectContainer} from "./compose-project.js";
import {containerPathsOfHostPath} from "./directory-identity.js";
import {toComparablePath, type ContainerMount} from "./self-stack-paths.js";

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

export type BindSourceRefusal =
    /** Docktor is containerized and no own bind mount covers the source. */
    | "not-visible"
    /** Docktor is containerized but could not determine its mounts. */
    | "mounts-unknown"
    /**
     * The source starts with `~` and was not resolved to a host directory
     * ({@link resolveHomeRelativeSources}); it is never expanded against Docktor's own HOME.
     */
    | "home-unresolved";

export type BindSourceLocation =
    | {readonly kind: "candidates"; readonly paths: readonly string[]}
    | {readonly kind: "refused"; readonly reason: BindSourceRefusal};

function isInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isHomeRelative(declaredPath: string): boolean {
    return declaredPath.startsWith("~");
}

function isAbsoluteSource(declaredPath: string): boolean {
    return path.posix.isAbsolute(declaredPath) || path.isAbsolute(declaredPath);
}

function resolveRelative(declaredPath: string, composeDir: string): string {
    return path.resolve(composeDir, declaredPath);
}

/** Candidates inside `composeDir` first, so an in-place relocation keeps working. */
function insideFirst(candidates: readonly string[], composeDir: string): string[] {
    const unique = [...new Set(candidates)];
    const comparableDir = toComparablePath(path.resolve(composeDir));
    const inside = (candidate: string): boolean => isInside(toComparablePath(candidate), comparableDir);
    return [...unique.filter(inside), ...unique.filter((candidate) => !inside(candidate))];
}

/** True when `resolved` lies within the destination of one of Docktor's own bind mounts. */
function isWithinMountDestination(resolved: string, mounts: readonly ContainerMount[]): boolean {
    const comparable = toComparablePath(resolved);
    return mounts.some(
        (mount) => mount.type === "bind" && isInside(comparable, path.posix.normalize(mount.destination)),
    );
}

/**
 * True when locating `declaredPath` depends on what Docktor can see of the
 * host: an absolute source, or a relative one that leaves `composeDir`.
 */
export function needsOwnMounts(declaredPath: string, composeDir: string): boolean {
    if (isHomeRelative(declaredPath)) {
        return false;
    }
    if (isAbsoluteSource(declaredPath)) {
        return true;
    }
    return !isInside(resolveRelative(declaredPath, composeDir), path.resolve(composeDir));
}

function locateRelative(resolved: string, composeDir: string, view: OwnMountsView): BindSourceLocation {
    const candidate: BindSourceLocation = {kind: "candidates", paths: [resolved]};
    if (view.kind === "host" || isInside(resolved, path.resolve(composeDir))) {
        return candidate;
    }
    if (view.kind === "unknown") {
        return {kind: "refused", reason: "mounts-unknown"};
    }
    return isWithinMountDestination(resolved, view.mounts) ? candidate : {kind: "refused", reason: "not-visible"};
}

function locateAbsolute(declaredPath: string, composeDir: string, view: OwnMountsView): BindSourceLocation {
    if (view.kind === "host") {
        return {kind: "candidates", paths: [declaredPath]};
    }
    if (view.kind === "unknown") {
        return {kind: "refused", reason: "mounts-unknown"};
    }
    const paths = insideFirst(containerPathsOfHostPath(declaredPath, view.mounts), composeDir);
    return paths.length === 0 ? {kind: "refused", reason: "not-visible"} : {kind: "candidates", paths};
}

/**
 * Locates `declaredPath` (exactly as the compose file spells it) for a compose
 * file in `composeDir`: the candidate paths Docktor can read it at, or why it
 * cannot.
 */
export function locateBindSource(
    declaredPath: string,
    composeDir: string,
    view: OwnMountsView,
): BindSourceLocation {
    if (isHomeRelative(declaredPath)) {
        return {kind: "refused", reason: "home-unresolved"};
    }
    return isAbsoluteSource(declaredPath)
        ? locateAbsolute(declaredPath, composeDir, view)
        : locateRelative(resolveRelative(declaredPath, composeDir), composeDir, view);
}

/** What a `~` bind source of the old stack stands for on the host (#104). */
export type HomeSourceResolution =
    | {readonly kind: "resolved"; readonly hostPath: string}
    | {
          readonly kind: "unresolved";
          /**
           * `no-container`: no old container mounts it; `inconsistent`: the old containers disagree or
           * the host directory does not match the declared path; `unsupported`: `~user`, `~+`, `~-`.
           */
          readonly reason: "no-container" | "inconsistent" | "unsupported";
      };

/** A bind mount as the compose file declares it: the source string, its service and its container path. */
export interface DeclaredBindMount {
    readonly path: string;
    readonly serviceName: string;
    readonly containerPath: string;
}

/** A POSIX path in normal form without a trailing separator (the root stays `/`). */
function normalizedPosix(value: string): string {
    const normalized = path.posix.normalize(value);
    let end = normalized.length;
    while (end > 1 && normalized[end - 1] === "/") {
        end--;
    }
    return normalized.slice(0, end);
}

/** The part of `~/rest` after the home directory: "" for a bare `~`, null when the form is not supported. */
function homeRemainder(declaredPath: string): string | null {
    if (declaredPath === "~") {
        return "";
    }
    if (!declaredPath.startsWith("~/")) {
        return null;
    }
    const remainder = normalizedPosix(declaredPath.slice(2));
    if (remainder === ".." || remainder.startsWith("../")) {
        return null;
    }
    return remainder === "." ? "" : remainder;
}

/** The host directories the service's containers bind at `containerPath`. */
function mountedSources(mount: DeclaredBindMount, containers: readonly ProjectContainer[]): string[] {
    const destination = normalizedPosix(mount.containerPath);
    return containers
        .filter((container) => container.service === mount.serviceName)
        .flatMap((container) => container.mounts)
        .filter((candidate) => candidate.type === "bind" && normalizedPosix(candidate.destination) === destination)
        .map((candidate) => normalizedPosix(candidate.source));
}

function endsWithRemainder(hostPath: string, remainder: string): boolean {
    return path.posix.isAbsolute(hostPath) && (remainder === "" || hostPath.endsWith(`/${remainder}`));
}

function resolveOneHomeSource(
    declaredPath: string,
    mounts: readonly DeclaredBindMount[],
    containers: readonly ProjectContainer[],
): HomeSourceResolution {
    const remainder = homeRemainder(declaredPath);
    if (remainder === null) {
        return {kind: "unresolved", reason: "unsupported"};
    }
    const sources = new Set(mounts.flatMap((mount) => mountedSources(mount, containers)));
    if (sources.size === 0) {
        return {kind: "unresolved", reason: "no-container"};
    }
    const [hostPath] = sources;
    if (sources.size > 1 || !endsWithRemainder(hostPath, remainder)) {
        return {kind: "unresolved", reason: "inconsistent"};
    }
    return {kind: "resolved", hostPath};
}

/**
 * Resolves every `~` bind source of the compose file to the host directory the
 * old containers really mount (#104): the shell that started the old stack
 * expanded `~` to its own HOME, which Docktor cannot know and must never guess.
 * Evidence is Docker's record of the bind mounts of the service's containers at
 * the declared container path, and the recorded directory must end in what the
 * declared path says after `~/`. Sources that do not start with `~` are not in
 * the result. The same declared string from several services must agree.
 */
export function resolveHomeRelativeSources(
    mounts: readonly DeclaredBindMount[],
    containers: readonly ProjectContainer[],
): ReadonlyMap<string, HomeSourceResolution> {
    const byPath = new Map<string, DeclaredBindMount[]>();
    for (const mount of mounts.filter((candidate) => isHomeRelative(candidate.path))) {
        byPath.set(mount.path, [...(byPath.get(mount.path) ?? []), mount]);
    }
    return new Map([...byPath].map(([declaredPath, group]) => [declaredPath, resolveOneHomeSource(declaredPath, group, containers)]));
}
