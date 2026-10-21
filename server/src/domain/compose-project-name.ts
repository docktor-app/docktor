import {parse as parseYaml} from "yaml";
import type {ComposeProjectNameSource} from "@docktor/shared";

import {interpolateEnv, parseEnvAssignments} from "./host-ports.js";

export interface ComposeProjectName {
    readonly name: string;
    readonly source: ComposeProjectNameSource;
}

export interface ComposeProjectNameInput {
    readonly composeContent: string;
    /** The stack's `.env` text, or null when it has none. */
    readonly envContent: string | null;
    /** The name of the directory Docker Compose runs in. */
    readonly directoryName: string;
}

/**
 * Normalises a raw name the way Docker Compose does for a project name:
 * lowercase, only a-z, 0-9, "_" and "-", and no leading "_" or "-".
 */
export function normalizeComposeProjectName(raw: string): string {
    return raw
        .toLowerCase()
        .replaceAll(/[^a-z0-9_-]/g, "")
        .replace(/^[_-]+/, "");
}

/** The top-level `name:` of a compose file, interpolated against `env`; null when absent, not a string, unresolvable or unparsable. */
function composeFileName(composeContent: string, env: Record<string, string>): string | null {
    let document: unknown;
    try {
        document = parseYaml(composeContent);
    } catch {
        return null;
    }
    if (typeof document !== "object" || document === null || !("name" in document)) {
        return null;
    }
    return typeof document.name === "string" ? interpolateEnv(document.name, env) : null;
}

/**
 * G-18-22-status: the Docker Compose project name a stack runs under, as far as
 * its files show. Mirrors Docker Compose's order (-p, COMPOSE_PROJECT_NAME,
 * name:, directory name) for the sources the files expose: COMPOSE_PROJECT_NAME
 * in the stack's `.env`, then the compose file's top-level `name:` (interpolated
 * from that `.env`), then the directory name. A project started with -p or a
 * shell variable is not visible here. Each candidate is normalised and only
 * used when it is not empty; a compose file that does not parse has no name.
 */
export function composeProjectName({composeContent, envContent, directoryName}: ComposeProjectNameInput): ComposeProjectName {
    const env = envContent === null ? {} : parseEnvAssignments(envContent);
    const candidates: ReadonlyArray<{readonly raw: string | null; readonly source: ComposeProjectNameSource}> = [
        {raw: env.COMPOSE_PROJECT_NAME ?? null, source: "env-file"},
        {raw: composeFileName(composeContent, env), source: "compose-file"},
        {raw: directoryName, source: "directory"},
    ];
    for (const {raw, source} of candidates) {
        const name = raw === null ? "" : normalizeComposeProjectName(raw);
        if (name !== "") {
            return {name, source};
        }
    }
    return {name: "", source: "directory"};
}
