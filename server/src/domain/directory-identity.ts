import path from "node:path";
import type {OwnMountsView} from "./bind-mount-sources.js";
import {containerVisiblePaths, toComparablePath, type ContainerMount} from "./self-stack-paths.js";

/**
 * Which directory is this? (G-18-22-inplace, review WR-10)
 *
 * Inside Docktor's container one folder has several spellings: the scan sees
 * `/host/home/u/docktor/stacks/memos` through the read-only host-root mount,
 * the stacks folder is mounted at its identical host path
 * `/home/u/docktor/stacks/memos`, and symlinks add more. Comparing path
 * strings therefore misses that two spellings are one directory.
 *
 * A {@link DirectoryIdentity} is the set of spellings a directory is known
 * under. Every key is tagged with the namespace it lives in, `host:<path>` (a
 * path on the host) or `container:<path>` (a path inside Docktor's container),
 * because the two namespaces overlap textually: `/opt/x` in one is not `/opt/x`
 * in the other. Two identities relate through shared or nested keys.
 *
 * Docker paths are Linux paths, so everything uses `path.posix` over
 * {@link toComparablePath} strings regardless of the OS running the code.
 */
export interface DirectoryIdentity {
    /** Namespace-tagged spellings: `host:<path>` and `container:<path>`. */
    readonly keys: readonly string[];
    /** False when Docktor is containerized but its mounts could not be read: only identical spellings can match. */
    readonly mountsKnown: boolean;
}

export type DirectoryRelation = "same" | "nested" | "unrelated";

type Namespace = "host" | "container";

/** A comparable spelling: forward slashes, normalised, no trailing slash (the root stays "/"). */
function comparable(spelling: string): string {
    const normalized = path.posix.normalize(toComparablePath(spelling));
    let end = normalized.length;
    while (end > 1 && normalized[end - 1] === "/") {
        end--;
    }
    return normalized.slice(0, end);
}

function tag(namespace: Namespace, spelling: string): string {
    return `${namespace}:${spelling}`;
}

/**
 * The host paths at which the container path `containerPath` is a bind mount:
 * one per bind mount whose destination is `containerPath` or one of its
 * ancestors. A volume mount is never host data and never translates.
 */
export function hostPathsOfContainerPath(containerPath: string, mounts: readonly ContainerMount[]): string[] {
    const target = comparable(containerPath);
    const hostPaths = new Set<string>();
    for (const mount of mounts) {
        if (mount.type !== "bind") {
            continue;
        }
        const relative = path.posix.relative(comparable(mount.destination), target);
        if (relative.startsWith("..") || path.posix.isAbsolute(relative)) {
            continue;
        }
        hostPaths.add(comparable(path.posix.join(mount.source, relative)));
    }
    return [...hostPaths];
}

/**
 * Paths at which Docktor reads the host path `hostPath` through its own bind
 * mounts: the destinations of mounts whose source IS `hostPath` first (a data
 * directory that is itself mounted), then one candidate per mount whose source
 * is a strict ancestor, in mount order. The identical path is not included: a
 * same-path mount still yields it through its own mount entry, the bare path is
 * not host data.
 */
export function containerPathsOfHostPath(hostPath: string, mounts: readonly ContainerMount[]): string[] {
    const [, ...beneathMounts] = containerVisiblePaths(hostPath, mounts);
    const exact = mounts
        .filter((mount) => mount.type === "bind" && path.posix.normalize(mount.source) === path.posix.normalize(hostPath))
        .map((mount) => mount.destination);
    return [...exact, ...beneathMounts];
}

function keysOfSpelling(spelling: string, view: OwnMountsView): string[] {
    const own = comparable(spelling);
    if (view.kind === "host") {
        return [tag("host", own)];
    }
    const containerKey = tag("container", own);
    if (view.kind === "unknown") {
        return [containerKey];
    }
    return [containerKey, ...hostPathsOfContainerPath(own, view.mounts).map((host) => tag("host", host))];
}

/**
 * The identity of a directory as Docktor itself sees it: a scanned path, a
 * stack's `hostPath`, a stacks-folder target. Outside a container every
 * spelling is a host path; inside, each spelling is also translated to the
 * host paths its bind mounts expose; when the mounts are unknown only the
 * spelling itself is known (fail-safe: an unrecognised alias never matches).
 */
export function localDirectoryIdentity(spellings: readonly string[], view: OwnMountsView): DirectoryIdentity {
    const keys = spellings.flatMap((spelling) => keysOfSpelling(spelling, view));
    return {keys: [...new Set(keys)], mountsKnown: view.kind !== "unknown"};
}

/**
 * The identity of a directory named by a compose label
 * (`com.docker.compose.project.working_dir`, or the directory of a
 * `config_files` entry): a host path, or a container path when Docktor's own
 * compose CLI created the container. `containerSpellings` are the paths at
 * which Docktor can observe the host path (see {@link containerPathsOfHostPath}).
 *
 * Residual: a host directory spelled exactly like an unrelated container-only
 * path would match through the `container:` key. Docktor's stacks mount uses
 * identical paths, so this does not arise in the documented deployment.
 */
export function labelDirectoryIdentity(
    labelPath: string,
    containerSpellings: readonly string[],
    view: OwnMountsView,
): DirectoryIdentity {
    if (view.kind === "host") {
        return localDirectoryIdentity([labelPath, ...containerSpellings], view);
    }
    const label = comparable(labelPath);
    const observed = localDirectoryIdentity(containerSpellings, view);
    return {
        keys: [...new Set([tag("host", label), tag("container", label), ...observed.keys])],
        mountsKnown: view.kind === "container",
    };
}

function splitKey(key: string): {namespace: string; spelling: string} {
    const separator = key.indexOf(":");
    return {namespace: key.slice(0, separator), spelling: key.slice(separator + 1)};
}

function isStrictDescendant(child: string, parent: string): boolean {
    if (parent === "/") {
        return child !== "/" && child.startsWith("/");
    }
    return child.startsWith(`${parent}/`);
}

function containsKey(parentKey: string, childKey: string): boolean {
    const parent = splitKey(parentKey);
    const child = splitKey(childKey);
    return parent.namespace === child.namespace && isStrictDescendant(child.spelling, parent.spelling);
}

function anyNested(outer: DirectoryIdentity, inner: DirectoryIdentity): boolean {
    return outer.keys.some((outerKey) => inner.keys.some((innerKey) => containsKey(outerKey, innerKey)));
}

/**
 * How two directories relate: `same` when any spelling is shared, `nested` when
 * a spelling of one lies strictly inside a spelling of the other (in the same
 * namespace), else `unrelated`.
 */
export function relateDirectories(a: DirectoryIdentity, b: DirectoryIdentity): DirectoryRelation {
    const known = new Set(a.keys);
    if (b.keys.some((key) => known.has(key))) {
        return "same";
    }
    return anyNested(a, b) || anyNested(b, a) ? "nested" : "unrelated";
}
