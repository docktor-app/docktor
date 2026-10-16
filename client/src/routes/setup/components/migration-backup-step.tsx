import {Info} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";

export interface MigrationBackupStepProps {
  readonly mode: "in-place" | "separate";
  readonly originalDirectory: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly asideName: string;
  readonly onAsideNameChange: (name: string) => void;
  readonly asideNameError: string | null;
}

// Step 3 of the migration dialog (MIG-03, G-18-7). In place, the original
// directory is renamed aside and is the backup, so the user only names it.
// Otherwise the original is untouched and a backup copy is an explicit,
// default-off choice (G-18-7 supersedes D-07's default-on).
export function MigrationBackupStep({
  mode,
  originalDirectory,
  checked,
  onCheckedChange,
  asideName,
  onAsideNameChange,
  asideNameError,
}: Readonly<MigrationBackupStepProps>): React.JSX.Element {
  if (mode === "in-place") {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="aside-name" className="font-semibold">Name for the original directory</Label>
          <Input
            id="aside-name"
            value={asideName}
            onChange={(event) => onAsideNameChange(event.target.value)}
            aria-invalid={asideNameError !== null}
            aria-describedby={asideNameError ? "aside-name-help aside-name-error" : "aside-name-help"}
            autoComplete="off"
            spellCheck={false}
          />
          <p id="aside-name-help" className="text-xs text-muted-foreground break-all">
            {`This stack already lives in Docktor's stacks folder under this name. ${originalDirectory} is renamed to ${asideName} and kept as your backup; the new stack is built in ${originalDirectory}. No extra copy is made.`}
          </p>
          {asideNameError && (
            <p id="aside-name-error" className="text-xs text-red-600 dark:text-red-400">{asideNameError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex min-h-11 items-start gap-3 md:min-h-0">
        <Switch
          id="backup"
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-describedby="backup-help"
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="backup" className="font-semibold">Back up the old stack first</Label>
          <p id="backup-help" className="text-xs text-muted-foreground">
            Copies the old stack's directory (compose file, .env and bind-mount data) to pre-migration-backup/ inside the new stack's directory. It is kept after a successful migration. Named Docker volumes are not included.
          </p>
        </div>
      </div>

      {!checked && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="break-all">
            {`Your original stack stays untouched at ${originalDirectory}, so it remains available as it is. Turn this on to also keep a copy in pre-migration-backup/ inside the new stack directory.`}
          </span>
        </p>
      )}
    </div>
  );
}
