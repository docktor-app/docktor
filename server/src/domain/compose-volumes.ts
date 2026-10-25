import {parse as parseYaml} from "yaml";

import type {ProjectContainer} from "./compose-project.js";
import {interpolateEnv, parseEnvAssignments} from "./host-ports.js";

/** The Docker volume a top-level compose volume key really refers to. */
export interface ComposeVolumeName {
    /** The Docker volume name; empty when the compose file's `name:` cannot be resolved. */
    readonly name: string;
    /** The compose file declares the volume as external: Docker owns it, compose never creates it. */
    readonly external: boolean;
}

export interface ResolveComposeVolumeNamesInput {
    readonly composeContent: string;
    /** The stack's `.env` text, or null when it has none. */
    readonly envContent: string | null;
    /** The compose project Docker runs the stack under; prefixes every volume without a `name:`. */
    readonly projectName: string;
}

/** A volume Docker creates for a container with no name of its own: its data is not part of any named volume. */
export interface AnonymousVolume {
    readonly service: string;
    readonly containerPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The parsed compose document, or null when the text does not parse. */
function parseCompose(composeContent: string): unknown {
    try {
        return parseYaml(composeContent);
    } catch {
        return null;
    }
}

/** `external: true` or the legacy `external: {name: ...}`. */
function externalOf(definition: Record<string, unknown>): {readonly external: boolean; readonly legacyName: string | null} {
    const {external} = definition;
    if (isRecord(external)) {
        return {external: true, legacyName: typeof external.name === "string" ? external.name : null};
    }
    return {external: external === true, legacyName: null};
}

/** The text of a `name:` after `${VAR}` interpolation against the `.env`; empty when it cannot be resolved. */
function interpolatedName(raw: string, env: Record<string, string>): string {
    return interpolateEnv(raw, env) ?? "";
}

function resolveOne(key: string, value: unknown, projectName: string, env: Record<string, string>): ComposeVolumeName {
    const definition = isRecord(value) ? value : {};
    const {external, legacyName} = externalOf(definition);
    const declared = typeof definition.name === "string" ? interpolatedName(definition.name, env) : legacyName;
    if (declared !== null) {
        return {name: declared, external};
    }
    return {name: external ? key : `${projectName}_${key}`, external};
}

/**
 * The Docker volume every top-level compose volume really refers to (#101): the
 * `name:` when the file sets one (interpolated from the stack's `.env`), the
 * literal key for an external volume, and `<project>_<key>` otherwise. Compose
 * applies exactly this, so it is the volume the old stack's data lives in. A
 * file that does not parse, or declares no volumes, has none.
 */
export function resolveComposeVolumeNames({
    composeContent,
    envContent,
    projectName,
}: ResolveComposeVolumeNamesInput): ReadonlyMap<string, ComposeVolumeName> {
    const document = parseCompose(composeContent);
    const resolved = new Map<string, ComposeVolumeName>();
    if (!isRecord(document) || !isRecord(document.volumes)) {
        return resolved;
    }
    const env = envContent === null ? {} : parseEnvAssignments(envContent);
    for (const [key, value] of Object.entries(document.volumes)) {
        resolved.set(key, resolveOne(key, value, projectName, env));
    }
    return resolved;
}

/** The container path of a volumes[] entry that names no source, or null for every other entry. */
function anonymousTarget(entry: unknown): string | null {
    if (typeof entry === "string") {
        return entry.includes(":") || entry === "" ? null : entry;
    }
    if (!isRecord(entry) || entry.type !== "volume" || typeof entry.target !== "string") {
        return null;
    }
    const {source} = entry;
    return source === undefined || source === null || source === "" ? entry.target : null;
}

function declaredAnonymousVolumes(composeContent: string): AnonymousVolume[] {
    const document = parseCompose(composeContent);
    if (!isRecord(document) || !isRecord(document.services)) {
        return [];
    }
    const found: AnonymousVolume[] = [];
    for (const [service, definition] of Object.entries(document.services)) {
        if (!isRecord(definition) || !Array.isArray(definition.volumes)) {
            continue;
        }
        for (const entry of definition.volumes) {
            const containerPath = anonymousTarget(entry);
            if (containerPath !== null) {
                found.push({service, containerPath});
            }
        }
    }
    return found;
}

/** Docker names an anonymous volume with its 64-character hexadecimal id. */
const ANONYMOUS_VOLUME_NAME = /^[0-9a-f]{64}$/;

function mountedAnonymousVolumes(containers: readonly ProjectContainer[]): AnonymousVolume[] {
    return containers.flatMap((container) =>
        container.mounts
            .filter((mount) => mount.type === "volume" && ANONYMOUS_VOLUME_NAME.test(mount.name ?? ""))
            .map((mount) => ({service: container.service ?? container.name, containerPath: mount.destination})),
    );
}

/**
 * The anonymous volumes of the old stack (D-05): those the compose file declares
 * (a service volume with no source) and those its containers actually have
 * (a mount of type volume named by a 64-character id). They are never copied, so
 * the new stack starts them empty. Deduplicated and sorted by service, then path.
 */
export function findAnonymousVolumes({
    composeContent,
    containers,
}: {
    readonly composeContent: string;
    readonly containers: readonly ProjectContainer[];
}): AnonymousVolume[] {
    const unique = new Map<string, AnonymousVolume>();
    for (const volume of [...declaredAnonymousVolumes(composeContent), ...mountedAnonymousVolumes(containers)]) {
        unique.set(`${volume.service}\0${volume.containerPath}`, volume);
    }
    return [...unique.values()].sort(
        (a, b) => a.service.localeCompare(b.service) || a.containerPath.localeCompare(b.containerPath),
    );
}
