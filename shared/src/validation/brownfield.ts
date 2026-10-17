import {z} from "zod";

// Request bodies for the brownfield adopt/preview/migrate routes. Shared by
// server/src/routes/setup.ts and server/src/routes/imports.ts so both route
// families validate identically (#72, D-12).

// T-18-05: preview and adopt read `composePath` from disk and echo the content
// back to the caller, so it must point at a compose file, never at an
// arbitrary readable path. The file names are the ones the brownfield scanner
// recognises. No node:path here: shared code also runs in the browser.
const COMPOSE_FILE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/])(?:.*[\\/])?(?:docker-compose\.ya?ml|compose\.ya?ml)$/;

export const composeFilePathSchema = z
    .string()
    .refine((value) => !value.includes("\0") && COMPOSE_FILE_PATH_PATTERN.test(value), {
        message: "Must be an absolute path to a docker-compose.yml, docker-compose.yaml, compose.yaml or compose.yml file",
    });

export const volumeSelectionSchema = z.object({
    originalPath: z.string(),
    newPath: z.string(),
    convert: z.boolean(),
});

// G-18-7: the preview takes the stack name, because the name decides the target
// directory and so whether the migration happens in place.
export const migrationPreviewSchema = z.object({
    composePath: composeFilePathSchema,
    displayName: z.string().min(1),
    volumeSelections: z.array(volumeSelectionSchema),
    namedVolumeSelections: z.record(z.string(), z.boolean()),
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
    // G-18-7: only meaningful when the new stack takes the old stack's directory.
    inPlaceAsideName: stackDirectoryNameSchema.optional(),
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
export type ComposeProjectNameSource = z.infer<typeof composeProjectNameSourceSchema>;
export type SharedProjectName = z.infer<typeof sharedProjectNameSchema>;
export type ManagedStackRef = z.infer<typeof managedStackRefSchema>;
export type DiscoveredStack = z.infer<typeof discoveredStackSchema>;
export type SkippedDirectoryReason = z.infer<typeof skippedDirectoryReasonSchema>;
export type SkippedDirectory = z.infer<typeof skippedDirectorySchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
