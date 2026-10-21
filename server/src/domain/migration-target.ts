import path from "node:path";
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

// CR-02: Docker volume names are also passed verbatim as the `-v` source to
// `docker run`; a name containing `/` is interpreted by Docker as a host bind
// path rather than a named volume, so names must be constrained to Docker's
// own allowed volume-name character set before ever reaching the CLI.
export const VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

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
