// Shared DTOs for the brownfield scan/adopt/migrate flow. Both the setup
// wizard (client/src/lib/setup-api.ts, driving /api/setup/*) and the
// post-setup import page (client/src/lib/import-api.ts, driving
// /api/stacks/import/*) depend on these — this module has no opinion about
// which endpoints produced them. The scan result and migration operation
// shapes come from the shared workspace contract; the preview/volume shapes
// below are client-only.

import type {MigrationTarget} from "@docktor/shared";
import type {UnifiedDiff} from "./stacks-api";

export type {
    DiscoveredStack,
    MigrationOperation,
    MigrationOperationList,
    ScanResult,
    SkippedDirectory,
} from "@docktor/shared";

export interface VolumeSelection {
  originalPath: string;
  newPath: string;
  convert: boolean;
}

// The compose diff is the same UnifiedDiff the stack-edit review renders
// (#72) — one diff shape and one renderer across the client.
// G-18-7: `target` says whether the new stack takes the old stack's own
// directory (in place) and, if so, which name the original is renamed to.
export interface MigrationPreview {
  diff: UnifiedDiff;
  extractedEnv: string;
  // Selected bind-mount sources that do not exist; the new stack gets an empty folder for each.
  emptySources: string[];
  target: MigrationTarget;
}
