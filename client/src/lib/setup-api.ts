import {apiFetch} from "./api";
import type {
  MigrationExecuteInput,
  MigrationPreviewInput,
  WizardStep1Input,
  WizardStep2Input,
  WizardStep3Input,
  WizardStep4Input,
  WizardStep6Input,
} from "@docktor/shared";
import type {
  MigrationOperation,
  MigrationOperationList,
  MigrationPreview,
  ScanResult,
} from "./brownfield-types";

export interface SetupStatus {
  setupComplete: boolean;
}

export interface Step1Result {
  user: {id: string; email: string; name: string | null};
  sessionToken: string;
}

export function checkSetupStatus() {
  return apiFetch<SetupStatus>("/api/setup/status");
}

// T-05-09: marks the wizard as fully complete so the server can permanently
// close /api/setup/* (beyond /status) again. Must be called once, at the
// very end of the wizard — see handleFinish/handleSkip(5) in setup.tsx.
export function completeSetup() {
  return apiFetch<{success: boolean}>("/api/setup/complete", {
    method: "POST",
  });
}

export function submitStep1(input: WizardStep1Input) {
  return apiFetch<Step1Result>("/api/setup/step1", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitStep2(input: WizardStep2Input) {
  return apiFetch<{success: boolean}>("/api/setup/step2", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitStep3(input: WizardStep3Input) {
  return apiFetch<{success: boolean}>("/api/setup/step3", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitStep4(input: WizardStep4Input) {
  return apiFetch<{success: boolean}>("/api/setup/step4", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitStep6(input: WizardStep6Input) {
  return apiFetch<{success: boolean}>("/api/setup/step6", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function scanDirectories(directories: string[]) {
  return apiFetch<ScanResult>("/api/setup/scan", {
    method: "POST",
    body: JSON.stringify({directories}),
  });
}

export function adoptStack(composePath: string, displayName: string) {
  return apiFetch<{id: string}>("/api/setup/adopt", {
    method: "POST",
    body: JSON.stringify({composePath, displayName}),
  });
}

export function previewMigration(input: MigrationPreviewInput) {
  return apiFetch<MigrationPreview>("/api/setup/migrate/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// G-18-job: answers 202 with the background operation; progress and outcome
// arrive through useMigrationOperations.
export function executeMigration(input: MigrationExecuteInput) {
  return apiFetch<MigrationOperation>("/api/setup/migrate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMigrationOperations() {
  return apiFetch<MigrationOperationList>("/api/setup/migrations");
}
