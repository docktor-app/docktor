import path from "node:path";
import {COMPOSE_VOLUME_NAME_PATTERN} from "@docktor/shared";
import {relateDirectories, type DirectoryIdentity} from "./directory-identity.js";

/**
 * How the directory a migration builds the new stack in relates to the
 * directory of the old stack (G-18-7), decided over directory identities so
 * every spelling of a directory counts (G-18-22-inplace):
 * - `separate`: unrelated directories; the original is only ever read.
 * - `in-place`: the very same directory (the stack already lives in Docktor's
 *   stacks folder under the same name, however the scan reached it); the
 *   original is renamed aside first.
 * - `nested`: one directory sits inside the other; always refused, because
 *   copying a directory into itself and removing the target on rollback would
 *   endanger the original (RESEARCH Pitfall 4).
 */
export type MigrationTargetKind = "separate" | "in-place" | "nested";

/** Host-native path comparison, used for the destination collisions below. */
function isInside(child: string, parent: string): boolean {
    return child.startsWith(parent + path.sep);
}

export function classifyMigrationTarget(target: DirectoryIdentity, original: DirectoryIdentity): MigrationTargetKind {
    switch (relateDirectories(target, original)) {
        case "same":
            return "in-place";
        case "nested":
            return "nested";
        case "unrelated":
            return "separate";
    }
}

/**
 * Directory names to try, in order, when renaming the original of an in-place
 * migration aside: `<id>-pre-migration`, then `<id>-pre-migration-2`, ...
 */
export function asideNameCandidates(stackId: string, limit: number): string[] {
    const base = `${stackId}-pre-migration`;
    return Array.from({length: Math.max(0, limit)}, (_, index) => (index === 0 ? base : `${base}-${index + 1}`));
}

/** D-07/D-08: an opted-in backup is a plain copy of the old stack directory at this name inside the new stack. */
export const BACKUP_DIR_NAME = "pre-migration-backup";

/** D-03: the old stack directory is copied to `<backup>/stack`. */
export const BACKUP_STACK_DIR = "stack";

/** D-03: each selected bind source outside the old stack directory is copied to `<backup>/bind-mounts/<n>-<name>`. */
export const BACKUP_BIND_MOUNTS_DIR = "bind-mounts";

/** D-03: what the backup holds and where it came from, written into the backup directory. */
export const BACKUP_MANIFEST_NAME = "manifest.json";

/** A selected bind source the backup copies next to the old stack directory. */
export interface PlannedBackupCopy {
    readonly originalPath: string;
    readonly sourcePath: string;
    /** Where it goes inside the backup directory, always with `/` separators: `bind-mounts/<n>-<name>`. */
    readonly backupPath: string;
}

/** The directory name reduced to letters, digits, dot, underscore and hyphen, so it is safe at any depth of a backup. */
function backupDirectoryName(sourcePath: string): string {
    const reduced = path.basename(sourcePath).replace(/[^A-Za-z0-9._-]+/g, "_");
    return reduced === "" ? "source" : reduced;
}

/** True when `target` is `parent` itself or lies below it (a name like `..cache` is a child, not a parent segment). */
function isWithin(target: string, parent: string): boolean {
    const relative = path.relative(parent, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * D-03: the bind sources a backup has to copy besides the old stack directory.
 * A source inside the old directory is already in the stack copy and a source
 * that does not exist has nothing to copy, so only the readable sources
 * outside the old directory remain, numbered from 1 in request order.
 */
export function planBackupCopies(
    bindCopies: readonly {readonly originalPath: string; readonly sourcePath: string | null}[],
    originalDir: string,
): PlannedBackupCopy[] {
    const planned: PlannedBackupCopy[] = [];
    for (const {originalPath, sourcePath} of bindCopies) {
        if (sourcePath === null || isWithin(sourcePath, originalDir)) {
            continue;
        }
        planned.push({
            originalPath,
            sourcePath,
            backupPath: `${BACKUP_BIND_MOUNTS_DIR}/${planned.length + 1}-${backupDirectoryName(sourcePath)}`,
        });
    }
    return planned;
}

// CR-02: Docker volume names are also passed verbatim as the `-v` source to
// `docker run`; a name containing `/` is interpreted by Docker as a host bind
// path rather than a named volume. The pattern is shared with the request schema.
export const VOLUME_NAME_PATTERN = COMPOSE_VOLUME_NAME_PATTERN;

// Docker Compose picks one of these up from the stack directory; a copied
// file with such a name would take precedence over the rewritten compose file.
const RESERVED_ROOT_NAMES: ReadonlySet<string> = new Set([
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    ".env",
    BACKUP_DIR_NAME,
]);

/** One converted bind mount, as the request spells it. */
export interface BindCopyRequest {
    readonly originalPath: string;
    readonly newPath: string;
}

export interface CopyDestinationRequest {
    /** The new stack directory every destination must stay inside. */
    readonly targetDir: string;
    /** The directory of the old compose file (relative sources are relative to it). */
    readonly composeDir: string;
    readonly bindCopies: readonly BindCopyRequest[];
    /** Names of the named volumes converted to bind mounts (copied to `volumes/<name>`). */
    readonly namedVolumes: readonly string[];
}

interface Destination {
    readonly label: string;
    readonly resolved: string;
}

function isStackDirectoryMount(originalPath: string, composeDir: string): boolean {
    return !originalPath.startsWith("~") && path.resolve(composeDir, originalPath) === path.resolve(composeDir);
}

function bindDestinationViolation(
    copy: BindCopyRequest,
    targetDir: string,
    composeDir: string,
): {violation: string} | {destination: Destination | null} {
    const {originalPath, newPath} = copy;
    if (newPath === "" || newPath.includes("\0")) {
        return {violation: `Destination for ${originalPath} must be a non-empty path without NUL characters`};
    }
    const root = path.resolve(targetDir);
    const resolved = path.resolve(root, newPath);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return {violation: `Destination ${newPath} for ${originalPath} escapes the new stack directory`};
    }
    if (relative === "") {
        return isStackDirectoryMount(originalPath, composeDir)
            ? {destination: null}
            : {violation: `Destination ${newPath} for ${originalPath} is the stack directory itself, which only the stack directory mount may use`};
    }
    const firstSegment = relative.split(path.sep)[0]?.toLowerCase() ?? "";
    if (RESERVED_ROOT_NAMES.has(firstSegment)) {
        return {violation: `Destination ${newPath} for ${originalPath} would overwrite ${firstSegment} in the new stack directory`};
    }
    return {destination: {label: newPath, resolved}};
}

function namedVolumeDestination(name: string, targetDir: string): {violation: string} | {destination: Destination} {
    if (!VOLUME_NAME_PATTERN.test(name)) {
        return {violation: `Invalid volume name: ${name}`};
    }
    return {destination: {label: `volume ${name}`, resolved: path.resolve(targetDir, "volumes", name)}};
}

function collisions(destinations: readonly Destination[]): string[] {
    const messages: string[] = [];
    destinations.forEach((destination, index) => {
        for (const other of destinations.slice(index + 1)) {
            if (destination.resolved === other.resolved) {
                messages.push(`Destinations of ${destination.label} and ${other.label} are the same`);
            } else if (isInside(destination.resolved, other.resolved) || isInside(other.resolved, destination.resolved)) {
                messages.push(`Destinations of ${destination.label} and ${other.label} are nested`);
            }
        }
    });
    return messages;
}

/**
 * WR-01: everything wrong with the destinations a migration request asks for,
 * decided before anything is stopped, moved, created or copied. Each
 * destination must stay inside the new stack directory (the stack root only
 * for the stack-directory mount), must not overwrite a compose file, `.env` or
 * the backup directory, and no two destinations may be equal or nested.
 * Named-volume names must be valid Docker volume names. Empty when valid.
 */
export function copyDestinationViolations(request: CopyDestinationRequest): readonly string[] {
    const {targetDir, composeDir, bindCopies, namedVolumes} = request;
    const violations: string[] = [];
    const destinations: Destination[] = [];

    for (const copy of bindCopies) {
        const outcome = bindDestinationViolation(copy, targetDir, composeDir);
        if ("violation" in outcome) {
            violations.push(outcome.violation);
        } else if (outcome.destination !== null) {
            destinations.push(outcome.destination);
        }
    }
    for (const name of namedVolumes) {
        const outcome = namedVolumeDestination(name, targetDir);
        if ("violation" in outcome) {
            violations.push(outcome.violation);
        } else {
            destinations.push(outcome.destination);
        }
    }
    return [...violations, ...collisions(destinations)];
}
