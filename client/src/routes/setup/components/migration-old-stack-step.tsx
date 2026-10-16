import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";

export interface MigrationSummary {
  readonly displayName: string;
  readonly volumesToCopy: number;
  readonly backup: boolean;
  // G-18-7: set for an in-place migration; the renamed original is the backup.
  readonly keptOriginalAs: string | null;
}

export interface MigrationOldStackStepProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  // G-18-7: an in-place migration reuses the old directory and compose project
  // name, so the old stack must be stopped and the switch cannot be turned off.
  readonly stopRequired: boolean;
  readonly summary: MigrationSummary;
}

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

// Step 4 of the migration dialog (MIG-04, D-10): the explicit, default-on
// choice to stop the old stack, plus a read-only recap of every choice so the
// single Confirm & Migrate action is made with all decisions on one screen.
export function MigrationOldStackStep({checked, onCheckedChange, stopRequired, summary}: Readonly<MigrationOldStackStepProps>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex min-h-11 items-start gap-3 md:min-h-0">
        <Switch
          id="stop-old-stack"
          checked={stopRequired || checked}
          onCheckedChange={onCheckedChange}
          disabled={stopRequired}
          aria-describedby="stop-old-stack-help"
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="stop-old-stack" className="font-semibold">Stop the old stack before migrating</Label>
          <p id="stop-old-stack-help" className="text-xs text-muted-foreground">
            {stopRequired
              ? "Required for an in-place migration: the new stack reuses this directory and its compose project name."
              : "Runs docker compose stop on the old stack before its data is copied. Containers are stopped, not removed, so you can start the old stack again."}
          </p>
        </div>
      </div>

      {!stopRequired && !checked && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription>
            The old stack keeps running. Ports used by both stacks can conflict when you deploy the new stack, and files may change while they are copied.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Migration summary" className="rounded-md border bg-muted/50 p-4">
        <dl className="flex flex-col gap-1 text-sm">
          <div className="break-all">
            <dt className="inline text-muted-foreground">Stack name:</dt>{" "}
            <dd className="inline font-semibold">{summary.displayName}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Volumes to copy:</dt>{" "}
            <dd className="inline font-semibold">{summary.volumesToCopy}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Backup:</dt>{" "}
            <dd className="inline font-semibold">
              {summary.keptOriginalAs === null ? yesNo(summary.backup) : `Original kept as ${summary.keptOriginalAs}`}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Stop old stack:</dt>{" "}
            <dd className="inline font-semibold">{yesNo(stopRequired || checked)}</dd>
          </div>
        </dl>
        {summary.volumesToCopy === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing to copy. Only the compose file and .env are migrated.
          </p>
        )}
      </section>
    </div>
  );
}
