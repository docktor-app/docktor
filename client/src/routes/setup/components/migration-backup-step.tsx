import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";

export interface MigrationBackupStepProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

// Step 3 of the migration dialog (MIG-03, D-07): an explicit, default-on,
// opt-out backup of the old stack's directory.
export function MigrationBackupStep({checked, onCheckedChange}: Readonly<MigrationBackupStepProps>): React.JSX.Element {
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
        <Alert>
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription>
            No backup will be created. Your original directory is never modified, but the new stack will not contain a copy of the original files.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
