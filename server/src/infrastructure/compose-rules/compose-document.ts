import path from "node:path";
import os from "node:os";

// Matches a Windows drive-letter-rooted path ("C:\..." or "C:/..."). Used to
// pick path.win32 vs path.posix for containment math — the stack directory's
// own form is the single signal, never the running OS (tests exercise both
// flavours on any platform).
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:[\\/]/;

type PathFlavour = typeof path.posix;

function flavourFor(directory: string): PathFlavour {
    return WINDOWS_DRIVE_PREFIX.test(directory) ? path.win32 : path.posix;
}

/**
 * Expands a leading "~" to the real home directory. A home-relative bind
 * mount is never considered part of a stack's own directory tree, so this
 * is resolved to an actual filesystem path (not left as a literal "~"
 * segment, which would otherwise lexically join underneath the stack
 * directory and be misclassified as contained).
 */
function expandTilde(hostPath: string, flavour: PathFlavour): string {
    if (hostPath === "~") return os.homedir();
    if (hostPath.startsWith("~/") || hostPath.startsWith("~\\")) {
        return flavour.join(os.homedir(), hostPath.slice(2));
    }
    return hostPath;
}

function resolveAndNormalize(directory: string, target: string, flavour: PathFlavour): string {
    if (flavour.isAbsolute(target)) {
        return flavour.normalize(target);
    }
    return flavour.normalize(flavour.resolve(directory, target));
}

/**
 * Resolves a compose bind mount's host-side path against the stack
 * directory it belongs to. Relative paths (`./volumes/data`, `../other`)
 * are resolved against `stackDirectory`; `~`-prefixed paths are expanded to
 * the real home directory; anything already absolute is normalised as-is.
 */
export function resolveHostPath(stackDirectory: string, hostPath: string): string {
    const flavour = flavourFor(stackDirectory);
    const expanded = expandTilde(hostPath, flavour);
    return resolveAndNormalize(stackDirectory, expanded, flavour);
}

/**
 * Segment-boundary-aware containment check (never string-prefix matching —
 * probe #20 adjacency: `/stacks/foo-evil` must not be misclassified as
 * inside `/stacks/foo`). `target` is resolved against `directory` first
 * (relative targets are joined, not resolved against the process cwd), then
 * normalised, then compared via `path.relative`.
 */
export function isWithinDirectory(directory: string, target: string): boolean {
    const flavour = flavourFor(directory);
    const resolved = resolveAndNormalize(directory, target, flavour);
    const rel = flavour.relative(directory, resolved);

    if (rel === "") return true;
    if (rel === "..") return false;
    if (rel.startsWith(".." + flavour.sep)) return false;
    if (flavour.isAbsolute(rel)) return false;
    return true;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

/**
 * Returns the compose document's `services` mapping as `[name, definition]`
 * pairs, in declaration order, skipping any entry whose own definition isn't
 * a plain mapping (probe #20 ordering: rules iterate services in the order
 * `Object.entries()` yields them for every non-integer-like key).
 */
export function serviceEntries(doc: unknown): Array<[string, Record<string, unknown>]> {
    const root = asRecord(doc);
    const services = root ? asRecord(root.services) : null;
    if (!services) return [];

    const entries: Array<[string, Record<string, unknown>]> = [];
    for (const [name, definition] of Object.entries(services)) {
        const record = asRecord(definition);
        if (record) entries.push([name, record]);
    }
    return entries;
}
