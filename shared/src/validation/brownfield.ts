import {z} from "zod";

// Request bodies for the brownfield adopt/preview/migrate routes. Shared by
// server/src/routes/setup.ts and server/src/routes/imports.ts so both route
// families validate identically (#72, D-12).

// T-18-05: preview and adopt read `composePath` from disk and echo the content
// back to the caller, so it must point at a compose file, never at an
// arbitrary readable path. The file names are the ones the brownfield scanner
// recognises. No node:path here: shared code also runs in the browser.
export const COMPOSE_FILE_NAMES = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yaml",
    "compose.yml",
] as const;

const COMPOSE_FILE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/])(?:.*[\\/])?(?:docker-compose\.ya?ml|compose\.ya?ml)$/;

// CR-02: Docker volume names are also passed verbatim as the `-v` source to
// `docker run`; a name containing `/` is read by Docker as a host bind path, so
// names are held to Docker's own volume-name character set.
export const COMPOSE_VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export const composeVolumeNameSchema = z.string().regex(COMPOSE_VOLUME_NAME_PATTERN, {
    message: "Must be a Docker volume name: letters, digits, dots, underscores or hyphens, starting with a letter or digit",
});

function hasParentSegment(value: string): boolean {
    return value.split(/[\\/]/).includes("..");
}

function isAbsoluteOrHomePath(value: string): boolean {
    return /^(?:[\\/~]|[A-Za-z]:)/.test(value);
}

const noNulCharacter = (value: string): boolean => !value.includes("\0");

export const composeFilePathSchema = z
    .string()
    .refine((value) => noNulCharacter(value) && COMPOSE_FILE_PATH_PATTERN.test(value) && !hasParentSegment(value), {
        message:
            "Must be an absolute path without .. segments to a docker-compose.yml, docker-compose.yaml, compose.yaml or compose.yml file",
    });

// T-22-02: a converted bind mount is copied to `newPath` inside the new stack, so
// the destination must stay relative to it. A kept mount (convert: false) is not
// copied and may keep an absolute `newPath`, exactly as the client sends it.
export const volumeSelectionSchema = z
    .object({
        originalPath: z.string().refine(noNulCharacter, {message: "Must not contain a NUL character"}),
        newPath: z.string().refine(noNulCharacter, {message: "Must not contain a NUL character"}),
        convert: z.boolean(),
    })
    .superRefine((selection, context) => {
        if (!selection.convert) {
            return;
        }
        const {newPath} = selection;
        if (newPath === "") {
            context.addIssue({code: "custom", path: ["newPath"], message: "The destination of a converted mount must not be empty"});
        } else if (isAbsoluteOrHomePath(newPath)) {
            context.addIssue({code: "custom", path: ["newPath"], message: "The destination of a converted mount must be relative to the new stack"});
        } else if (hasParentSegment(newPath)) {
            context.addIssue({code: "custom", path: ["newPath"], message: "The destination of a converted mount must not contain .. segments"});
        }
    });

// G-18-7: the preview takes the stack name, because the name decides the target
// directory and so whether the migration happens in place.
export const migrationPreviewSchema = z.object({
    composePath: composeFilePathSchema,
    displayName: z.string().min(1),
    volumeSelections: z.array(volumeSelectionSchema),
    namedVolumeSelections: z.record(composeVolumeNameSchema, z.boolean()),
});

export const brownfieldAdoptSchema = z.object({
    composePath: composeFilePathSchema,
    displayName: z.string().min(1),
});

// G-18-7, T-18-33: a single directory-name segment (no separators, no leading
// dot, so never "." or ".."), used to name the sibling directory an in-place
// migration renames the original to.
export const stackDirectoryNameSchema = z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, {
        message:
            "Must be a single directory name of up to 100 letters, digits, dots, underscores or hyphens, starting with a letter or digit",
    });

// D-12: both choices are mandatory and deliberately have no default, so an
// old or buggy client can never let the server decide whether a backup is
// kept or the old stack is stopped on the user's behalf.
export const migrationExecuteSchema = migrationPreviewSchema.extend({
    backup: z.boolean(),
    stopOldStack: z.boolean(),
    // D-05: anonymous volumes are never copied and start empty in the new stack.
    // Mandatory with no default, like the choices above, so no client can skip
    // the acknowledgement; the server refuses `false` while any exist.
    acknowledgeAnonymousVolumes: z.boolean(),
    // G-18-7: only meaningful when the new stack takes the old stack's directory.
    inPlaceAsideName: stackDirectoryNameSchema.optional(),
});

// D-05: a volume Docker names with a random id for a container path that has no
// named volume. Its data is not copied, so the new stack starts it empty.
export const anonymousVolumeSchema = z.object({
    service: z.string(),
    containerPath: z.string(),
});

// D-08: what the migration needs to write per filesystem (the data times 1.1)
// against what the filesystem has free. `ok` is false when any filesystem is short.
export const migrationDiskSpaceSchema = z.object({
    ok: z.boolean(),
    filesystems: z.array(
        z.object({
            label: z.string(),
            requiredBytes: z.number().int().nonnegative(),
            availableBytes: z.number().int().nonnegative(),
        }),
    ),
});

// G-18-22-status: where a Docker Compose project name comes from, in Compose's
// order of precedence for what the migrated files show.
export const composeProjectNameSourceSchema = z.enum(["directory", "compose-file", "env-file"]);

export const sharedProjectNameSchema = z.object({
    name: z.string(),
    source: composeProjectNameSourceSchema,
});

// G-18-7: where the migration builds the new stack. `inPlace` means the target
// is the old stack's own directory, so the original is renamed aside first;
// `suggestedAsideName` is then a free name for it, and null otherwise.
// G-18-22-status: `sharedProjectName` is set when the old and the new stack
// would run under the same compose project name, so the old stack must be
// stopped (the migration is refused otherwise); null when the names differ.
export const migrationTargetSchema = z.object({
    stackId: z.string(),
    directory: z.string(),
    originalDirectory: z.string(),
    inPlace: z.boolean(),
    suggestedAsideName: z.string().nullable(),
    sharedProjectName: sharedProjectNameSchema.nullable(),
});

// Response shapes of the scan endpoints (/api/setup/scan, /api/stacks/import/scan).
// Declared once here so the server scanner and the client agree on one contract.

// G-18-2: the Docktor stack that already manages a scanned compose file's directory.
export const managedStackRefSchema = z.object({
    id: z.string(),
    displayName: z.string(),
});

export const discoveredStackSchema = z.object({
    path: z.string(),
    directory: z.string(),
    compatibility: z.enum(["green", "yellow", "red"]),
    serviceCount: z.number().int().nonnegative(),
    namedVolumes: z.array(z.string()),
    // #101: the named volumes the compose file already declares as external; the
    // migration dialog keeps them as Docker volumes unless the user converts them.
    externalVolumes: z.array(z.string()),
    absolutePaths: z.array(z.string()),
    // Distinct relative bind-mount sources (for example "./data"), so the
    // migration dialog can offer to copy them into the new stack directory.
    relativePaths: z.array(z.string()),
    inlineEnvVars: z.boolean(),
    unsupportedFeatures: z.array(z.string()),
    // G-18-2: set when Docktor already manages this directory; such rows stay
    // listed but cannot be adopted or migrated again. null when unmanaged.
    managedStack: managedStackRefSchema.nullable(),
});

export const skippedDirectoryReasonSchema = z.enum(["not_found", "permission_denied", "system_directory"]);

export const skippedDirectorySchema = z.object({
    directory: z.string(),
    reason: skippedDirectoryReasonSchema,
});

// `skippedDirectories` stays the count and always equals `skipped.length`.
export const scanResultSchema = z.object({
    stacks: z.array(discoveredStackSchema),
    skippedDirectories: z.number().int().nonnegative(),
    skipped: z.array(skippedDirectorySchema),
});

export type VolumeSelectionInput = z.infer<typeof volumeSelectionSchema>;
export type MigrationPreviewInput = z.infer<typeof migrationPreviewSchema>;
export type BrownfieldAdoptInput = z.infer<typeof brownfieldAdoptSchema>;
export type MigrationExecuteInput = z.infer<typeof migrationExecuteSchema>;
export type MigrationTarget = z.infer<typeof migrationTargetSchema>;
export type MigrationDiskSpace = z.infer<typeof migrationDiskSpaceSchema>;
export type AnonymousVolumeInput = z.infer<typeof anonymousVolumeSchema>;
export type ComposeProjectNameSource = z.infer<typeof composeProjectNameSourceSchema>;
export type SharedProjectName = z.infer<typeof sharedProjectNameSchema>;
export type ManagedStackRef = z.infer<typeof managedStackRefSchema>;
export type DiscoveredStack = z.infer<typeof discoveredStackSchema>;
export type SkippedDirectoryReason = z.infer<typeof skippedDirectoryReasonSchema>;
export type SkippedDirectory = z.infer<typeof skippedDirectorySchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
