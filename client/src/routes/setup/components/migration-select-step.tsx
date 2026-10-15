import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import type {VolumeSelection} from "@/lib/brownfield-types";

export interface MigrationSelectStepProps {
  readonly displayName: string;
  readonly onDisplayNameChange: (displayName: string) => void;
  readonly namedVolumes: readonly string[];
  readonly namedVolumeSelections: Readonly<Record<string, boolean>>;
  readonly onVolumeToggle: (volume: string, checked: boolean) => void;
  readonly bindMountSelections: readonly VolumeSelection[];
  readonly onBindMountToggle: (index: number, checked: boolean) => void;
  readonly inlineEnvVars: boolean;
}

const ROW_CLASS = "flex min-h-11 items-start gap-3 md:min-h-0";

// Step 1 of the migration dialog: stack name plus which volumes and bind
// mounts are copied into Docktor's managed directory.
export function MigrationSelectStep({
  displayName,
  onDisplayNameChange,
  namedVolumes,
  namedVolumeSelections,
  onVolumeToggle,
  bindMountSelections,
  onBindMountToggle,
  inlineEnvVars,
}: Readonly<MigrationSelectStepProps>): React.JSX.Element {
  return (
    <div className="space-y-6 py-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Stack Name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="my-stack"
        />
      </div>

      {namedVolumes.length > 0 && (
        <div className="space-y-3">
          <Label>Named Volumes</Label>
          {namedVolumes.map((vol) => (
            <div key={vol} className={ROW_CLASS}>
              <Checkbox
                id={`vol-${vol}`}
                checked={namedVolumeSelections[vol] ?? true}
                onCheckedChange={(checked) => onVolumeToggle(vol, !!checked)}
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`vol-${vol}`} className="cursor-pointer break-all font-normal">
                  {vol}
                </Label>
                {!namedVolumeSelections[vol] && (
                  <p className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-3 w-3" />
                    This volume will remain a Docker volume (not backed up)
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {bindMountSelections.length > 0 && (
        <div className="space-y-3">
          <Label>Absolute Bind Mounts</Label>
          {bindMountSelections.map((sel, i) => (
            <div key={sel.originalPath} className={ROW_CLASS}>
              <Checkbox
                id={`bind-${i}`}
                checked={sel.convert}
                onCheckedChange={(checked) => onBindMountToggle(i, !!checked)}
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`bind-${i}`} className="cursor-pointer break-all font-normal">
                  {sel.originalPath}
                </Label>
                <Alert className="px-2 py-1">
                  <AlertDescription className="flex items-center gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
                    Absolute path - not recommended for Docktor
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          ))}
        </div>
      )}

      {inlineEnvVars && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This compose file has inline environment variables that will be extracted to a .env file.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
