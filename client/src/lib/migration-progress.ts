import {toast} from "sonner";
import type {MigrationOperation, MigrationOperationStep, MigrationRollbackReport} from "@docktor/shared";

// Claims no outcome: without a rollback report Docktor cannot say what state the old stack is in (D-07).
export const MIGRATION_ERROR_FALLBACK = "Migration failed. Check the error and the old stack, then try again.";

// Exhaustive on purpose: a new step in the shared contract fails the type
// check here until it has a label.
const STEP_LABELS: Record<MigrationOperationStep, string> = {
  starting: "Starting",
  stopping_old_stack: "Stopping the old stack",
  verifying_stop: "Checking that the old stack is stopped",
  moving_original_aside: "Renaming the original directory",
  creating_directory: "Creating the stack directory",
  backing_up: "Backing up the old stack",
  copying_named_volume: "Copying volume",
  copying_bind_mount: "Copying",
  writing_compose: "Writing the compose file",
  recording_stack: "Saving the stack",
  deploying: "Deploying",
  rolling_back: "Rolling back",
  restarting_old_stack: "Restart of the original stack requested",
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

const ORIGINAL_RESTORED = "Original stack restored and running.";
const ORIGINAL_UNCHANGED = "Your original stack was not changed.";
const ORIGINAL_NOT_RUNNING = "Rolled back, but the original stack is not running — check it manually.";

/**
 * One sentence on the old stack, stated only as far as the rollback report
 * verified it (D-07): "restored and running" only for restored-running, never
 * "restarted" for a restart that was merely requested.
 */
function rollbackOutcome(report: MigrationRollbackReport, originalPath: string): string {
  if (report.original === "left-aside") {
    const location = report.keptOriginalAt ?? originalPath;
    return `The original stack directory is still at ${location}; move it back and start it by hand.`;
  }
  switch (report.oldStack) {
    case "restored-running":
      return ORIGINAL_RESTORED;
    case "not-stopped":
      return ORIGINAL_UNCHANGED;
    case "restart-unverified":
    case "restart-failed":
      return ORIGINAL_NOT_RUNNING;
    case "left-stopped":
      return `The original stack is stopped; start it by hand from ${originalPath}.`;
  }
}

function cleanupNote(report: MigrationRollbackReport): string | null {
  return report.cleanupErrors.length > 0 ? `Could not clean up: ${report.cleanupErrors.join("; ")}` : null;
}

/**
 * Wording of a migration that did not succeed: a title naming the state, and a
 * description made of the server's error text plus the verified outcome of the
 * rollback. Without a rollback report no outcome is claimed at all.
 */
export function migrationOutcomeMessage(operation: MigrationOperation): {title: string; description?: string} {
  const {result} = operation;
  const rolledBack = operation.status === "rolled_back";
  const title = rolledBack
    ? `Migration of ${operation.displayName} rolled back`
    : `Migration of ${operation.displayName} failed`;
  const report = result?.rollback;
  const parts = [
    result?.error || (report ? null : MIGRATION_ERROR_FALLBACK),
    result && report ? rollbackOutcome(report, result.originalPath) : null,
    report ? cleanupNote(report) : null,
  ].filter((part): part is string => part !== null && part !== "");
  return parts.length > 0 ? {title, description: parts.join(" ")} : {title};
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

  if (operation.status === "succeeded") {
    // The server always sets result.stackId on success; should it be missing, the migration
    // still succeeded, so show the success without the link instead of calling it a failure.
    const stackId = operation.result?.stackId;
    const description = successDescription(operation);
    toast.success(`Migration complete! ${operation.displayName} is now managed by Docktor`, {
      id,
      ...(description && {description}),
      ...(stackId && {action: {label: "View stack", onClick: () => navigate(`/stacks/${stackId}`)}}),
    });
    return;
  }

  const {title, description} = migrationOutcomeMessage(operation);
  const show = operation.status === "rolled_back" ? toast.warning : toast.error;
  show(title, {id, ...(description && {description})});
}
