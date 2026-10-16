import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import type {BindMountChoice} from "@/lib/migration-volume-paths";

export interface MigrationSelectStepProps {
  readonly displayName: string;
  readonly onDisplayNameChange: (displayName: string) => void;
  readonly namedVolumes: readonly string[];
  readonly namedVolumeSelections: Readonly<Record<string, boolean>>;
  readonly onVolumeToggle: (volume: string, checked: boolean) => void;
  readonly bindMounts: readonly BindMountChoice[];
  readonly onBindMountToggle: (index: number, moveIntoVolumes: boolean) => void;
  readonly inlineEnvVars: boolean;
}

const ROW_CLASS = "flex min-h-11 items-start gap-3 md:min-h-0";

interface RelativeMountNoteProps {
  readonly choice: BindMountChoice;
}

// The helper line under a relative mount row: where it goes, or why the
// checkbox is locked, or the warning shown when the mount is kept.
function RelativeMountNote({choice}: Readonly<RelativeMountNoteProps>): React.JSX.Element {
  if (choice.mustKeep) {
    return (
      <p className="text-xs text-muted-foreground">
        This is the stack directory itself; its files are copied into the new stack directory.
      </p>
    );
  }
  if (choice.mustMove) {
    return (
      <p className="text-xs text-muted-foreground">
        Points outside the stack directory, so it is moved to {choice.volumesPath}.
      </p>
    );
  }
  if (choice.moveIntoVolumes) {
    return <p className="text-xs text-muted-foreground">Moves to {choice.volumesPath}</p>;
  }
  return (
    <p className="flex items-start gap-1 text-xs text-yellow-600 dark:text-yellow-400">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      Stays at {choice.originalPath} in the new stack directory, outside Docktor's managed ./volumes/ layout, so
      Storage does not count it. It is still copied, and stack backups include it.
    </p>
  );
}

// Step 1 of the migration dialog: stack name plus which volumes and bind
// mounts are copied into Docktor's managed directory.
export function MigrationSelectStep({
  displayName,
  onDisplayNameChange,
  namedVolumes,
  namedVolumeSelections,
  onVolumeToggle,
  bindMounts,
  onBindMountToggle,
  inlineEnvVars,
}: Readonly<MigrationSelectStepProps>): React.JSX.Element {
  // Keep each choice's index in the full list: the wizard toggles by that index.
  const indexed = bindMounts.map((choice, index) => ({choice, index}));
  const absoluteMounts = indexed.filter(({choice}) => choice.kind === "absolute");
  const relativeMounts = indexed.filter(({choice}) => choice.kind === "relative");

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

      {absoluteMounts.length > 0 && (
        <div className="space-y-3">
          <Label>Absolute Bind Mounts</Label>
          {absoluteMounts.map(({choice, index}) => (
            <div key={`${index}-${choice.originalPath}`} className={ROW_CLASS}>
              <Checkbox
                id={`bind-${index}`}
                checked={choice.moveIntoVolumes}
                onCheckedChange={(checked) => onBindMountToggle(index, !!checked)}
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`bind-${index}`} className="cursor-pointer break-all font-normal">
                  {choice.originalPath}
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

      {relativeMounts.length > 0 && (
        <div className="space-y-3">
          <Label>Relative Bind Mounts</Label>
          {relativeMounts.map(({choice, index}) => (
            <div key={`${index}-${choice.originalPath}`} className={ROW_CLASS}>
              <Checkbox
                id={`rel-${index}`}
                checked={choice.moveIntoVolumes}
                disabled={choice.mustMove || choice.mustKeep}
                onCheckedChange={(checked) => onBindMountToggle(index, !!checked)}
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor={`rel-${index}`} className="cursor-pointer break-all font-normal">
                  {choice.originalPath}
                </Label>
                <RelativeMountNote choice={choice} />
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
