import type {ComposeProjectNameSource} from "@docktor/shared";

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

/**
 * G-18-22-status: the Docker Compose project name a stack runs under, as far as
 * its files show. Docker Compose derives it from the directory name.
 */
export function composeProjectName({directoryName}: ComposeProjectNameInput): ComposeProjectName {
    return {name: normalizeComposeProjectName(directoryName), source: "directory"};
}
