// Shared DTOs for the brownfield scan/adopt/migrate flow. Both the setup
// wizard (client/src/lib/setup-api.ts, driving /api/setup/*) and the
// post-setup import page (client/src/lib/import-api.ts, driving
// /api/stacks/import/*) depend on these — this module has no opinion about
// which endpoints produced them. The scan result shapes come from the shared
// workspace contract; the migration shapes below are client-only.

import type {UnifiedDiff} from "./stacks-api";

export type {DiscoveredStack, ScanResult, SkippedDirectory} from "@docktor/shared";

export interface VolumeSelection {
  originalPath: string;
  newPath: string;
  convert: boolean;
}

// The compose diff is the same UnifiedDiff the stack-edit review renders
// (#72) — one diff shape and one renderer across the client.
export interface MigrationPreview {
  diff: UnifiedDiff;
  extractedEnv: string;
}

export interface MigrationResult {
  success: boolean;
  stackId?: string;
  error?: string;
  originalPath: string;
}
