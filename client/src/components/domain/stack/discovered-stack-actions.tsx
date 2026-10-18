import {Link} from "react-router";
import type {MigrationOperation} from "@docktor/shared";
import {Button} from "@/components/ui/button";
import {migrationStepLabel} from "@/lib/migration-progress";
import type {DiscoveredStack} from "@/lib/brownfield-types";

interface DiscoveredStackActionsProps {
  stack: DiscoveredStack;
  isAdopted: boolean;
  isAdopting: boolean;
  /** The background migration of this stack, while one runs. */
  runningOperation: MigrationOperation | undefined;
  onMigrate: () => void;
  onAdopt: () => void;
}

/**
 * Action cell of a scan result row. A stack Docktor already manages, or one
 * whose migration is running, keeps its buttons but disabled (the managed one
 * with a link to the managing stack; its "Already managed" badge lives in the Status column); the server refuses the request
 * regardless, so this is convenience only.
 */
export function DiscoveredStackActions({
  stack,
  isAdopted,
  isAdopting,
  runningOperation,
  onMigrate,
  onAdopt,
}: Readonly<DiscoveredStackActionsProps>) {
  if (isAdopted) {
    return <span className="text-sm text-green-600 dark:text-green-400">Imported</span>;
  }

  const {managedStack} = stack;
  const migrating = runningOperation !== undefined;
  const disabled = isAdopting || migrating || managedStack !== null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {runningOperation && (
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {migrationStepLabel(runningOperation)}
        </span>
      )}
      {managedStack && (
        <Link
          to={`/stacks/${managedStack.id}`}
          className="mr-1 text-sm whitespace-nowrap underline-offset-4 hover:underline"
        >
          View {managedStack.displayName}
        </Link>
      )}
      <Button size="sm" variant="outline" onClick={onMigrate} disabled={disabled}>
        {migrating ? "Migrating..." : "Migrate"}
      </Button>
      <Button size="sm" onClick={onAdopt} disabled={disabled}>
        {isAdopting ? "Adopting..." : "Adopt"}
      </Button>
    </div>
  );
}
