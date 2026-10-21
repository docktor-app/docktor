import {toast} from "sonner";
import type {MigrationOperation, MigrationOperationStep} from "@docktor/shared";

export const MIGRATION_ERROR_FALLBACK =
  "Migration failed. Your original stack directory was not modified. Check the error and try again.";

// Exhaustive on purpose: a new step in the shared contract fails the type
// check here until it has a label.
const STEP_LABELS: Record<MigrationOperationStep, string> = {
  starting: "Starting",
  stopping_old_stack: "Stopping the old stack",
  moving_original_aside: "Renaming the original directory",
  creating_directory: "Creating the stack directory",
  backing_up: "Backing up the old stack",
  copying_named_volume: "Copying volume",
  copying_bind_mount: "Copying",
  writing_compose: "Writing the compose file",
  recording_stack: "Saving the stack",
  deploying: "Deploying",
  rolling_back: "Rolling back",
  finished: "Finished",
};

/** Human-readable label of the step an operation is currently in. */
export function migrationStepLabel(operation: Pick<MigrationOperation, "step" | "stepDetail">): string {
  const label = STEP_LABELS[operation.step];
  return operation.stepDetail ? `${label} ${operation.stepDetail}` : label;
}

function successDescription(operation: MigrationOperation): string | undefined {
  const notes = [
    operation.result?.keptOriginalAt ? `The original directory is kept at ${operation.result.keptOriginalAt}.` : null,
    operation.backup ? "Backup saved to pre-migration-backup/ in the new stack directory." : null,
    operation.stopOldStack ? "The old stack was stopped." : null,
  ].filter((note): note is string => note !== null);
  return notes.length > 0 ? notes.join(" ") : undefined;
}

/**
 * Renders an operation snapshot as ONE toast: every snapshot of the same
 * operation reuses the operation id, so progress, success and failure replace
 * each other instead of stacking.
 */
export function showMigrationToast(operation: MigrationOperation, navigate: (to: string) => void): void {
  const id = operation.id;
  if (operation.status === "running") {
    toast.loading(`Migrating ${operation.displayName}: ${migrationStepLabel(operation)}…`, {id});
    return;
  }

  const {result} = operation;
  if (operation.status === "succeeded" && result?.stackId) {
    const {stackId} = result;
    const description = successDescription(operation);
    toast.success(`Migration complete! ${operation.displayName} is now managed by Docktor`, {
      id,
      ...(description && {description}),
      action: {label: "View stack", onClick: () => navigate(`/stacks/${stackId}`)},
    });
    return;
  }

  toast.error(result?.error || MIGRATION_ERROR_FALLBACK, {id});
}
