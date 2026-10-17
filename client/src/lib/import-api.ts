import {apiFetch} from "./api";
import type {MigrationExecuteInput, MigrationPreviewInput} from "@docktor/shared";
import type {
  MigrationOperation,
  MigrationOperationList,
  MigrationPreview,
  ScanResult,
} from "./brownfield-types";

// Authenticated, post-setup counterpart of setup-api.ts's brownfield
// functions — drives /api/stacks/import/* (server/src/routes/imports.ts)
// instead of /api/setup/* (which 410s once the wizard is complete).

export function scanDirectories(directories: string[]) {
  return apiFetch<ScanResult>("/api/stacks/import/scan", {
    method: "POST",
    body: JSON.stringify({directories}),
  });
}

export function adoptStack(composePath: string, displayName: string) {
  return apiFetch<{id: string}>("/api/stacks/import/adopt", {
    method: "POST",
    body: JSON.stringify({composePath, displayName}),
  });
}

export function previewMigration(input: MigrationPreviewInput) {
  return apiFetch<MigrationPreview>("/api/stacks/import/migrate/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// G-18-job: answers 202 with the background operation; progress and outcome
// arrive through useMigrationOperations.
export function executeMigration(input: MigrationExecuteInput) {
  return apiFetch<MigrationOperation>("/api/stacks/import/migrate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMigrationOperations() {
  return apiFetch<MigrationOperationList>("/api/stacks/import/migrations");
}
