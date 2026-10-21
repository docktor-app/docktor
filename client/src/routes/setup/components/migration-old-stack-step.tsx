import {AlertTriangle} from "lucide-react";
import type {ComposeProjectNameSource, SharedProjectName} from "@docktor/shared";
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

// Why the old stack must be stopped, so the switch cannot be turned off:
// - in-place (G-18-7): the new stack reuses the old directory and compose project name.
// - shared-project-name (G-18-22-status): the old and the new stack would both
//   run under one compose project name, so the new stack would take over the
//   old stack's containers.
export type StopRequirement =
  | {readonly kind: "in-place"}
  | {readonly kind: "shared-project-name"; readonly projectName: SharedProjectName};

export interface MigrationOldStackStepProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly stopRequirement: StopRequirement | null;
  readonly summary: MigrationSummary;
}

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

const DEFAULT_HELP =
  "Runs docker compose stop on the old stack before its data is copied. Containers are stopped, not removed, so you can start the old stack again.";

const SOURCE_EXPLANATION: Record<ComposeProjectNameSource, string> = {
  directory: "It comes from the directory name. To keep the old stack running, go back and choose a different stack name.",
  "compose-file": "It is set by name: in the compose file, which the new stack keeps.",
  "env-file": "It is set by COMPOSE_PROJECT_NAME in the stack's .env file, which the new stack keeps.",
};

function stopHelp(requirement: StopRequirement | null): string {
  if (requirement === null) return DEFAULT_HELP;
  if (requirement.kind === "in-place") {
    return "Required for an in-place migration: the new stack reuses this directory and its compose project name.";
  }
  const {name, source} = requirement.projectName;
  return `Required: the old and the new stack would both use the Docker Compose project name "${name}", so the new stack would take over the old stack's containers. ${SOURCE_EXPLANATION[source]}`;
}

// Step 4 of the migration dialog (MIG-04, D-10): the explicit, default-on
// choice to stop the old stack, plus a read-only recap of every choice so the
// single Confirm & Migrate action is made with all decisions on one screen.
export function MigrationOldStackStep({checked, onCheckedChange, stopRequirement, summary}: Readonly<MigrationOldStackStepProps>): React.JSX.Element {
  const stopRequired = stopRequirement !== null;
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
            {stopHelp(stopRequirement)}
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
