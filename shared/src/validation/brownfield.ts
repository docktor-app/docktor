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

export const migrationPreviewSchema = z.object({
    composePath: composeFilePathSchema,
    volumeSelections: z.array(volumeSelectionSchema),
    namedVolumeSelections: z.record(z.string(), z.boolean()),
});

export const brownfieldAdoptSchema = z.object({
    composePath: composeFilePathSchema,
    displayName: z.string().min(1),
});

export const migrationExecuteSchema = migrationPreviewSchema.extend({
    displayName: z.string().min(1),
});

export type VolumeSelectionInput = z.infer<typeof volumeSelectionSchema>;
export type MigrationPreviewInput = z.infer<typeof migrationPreviewSchema>;
export type BrownfieldAdoptInput = z.infer<typeof brownfieldAdoptSchema>;
export type MigrationExecuteInput = z.infer<typeof migrationExecuteSchema>;
