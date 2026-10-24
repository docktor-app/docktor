import {useState} from "react";
import {AlertTriangle} from "lucide-react";
import {textHasSecret, type AnonymousVolumeInput} from "@docktor/shared";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ToneBadge} from "@/components/common/tone-badge";
import {CodeEditor} from "@/components/common/code-editor";
import {UnifiedDiffView} from "@/components/common/unified-diff-view";
import {displaySecretText, hunksHaveSecret, maskDiffHunks} from "@/lib/secret-mask";
import type {UnifiedDiff} from "@/lib/stacks-api";

export interface MigrationReviewStepProps {
  readonly diff: UnifiedDiff;
  readonly extractedEnv: string;
  readonly emptySources: readonly string[];
  // D-05: volumes that are not copied and start empty in the new stack.
  readonly anonymousVolumes: readonly AnonymousVolumeInput[];
  readonly anonymousAcknowledged: boolean;
  readonly onAnonymousAcknowledgedChange: (acknowledged: boolean) => void;
}

const noop = (): void => undefined;

// Step 2 of the migration dialog (#72, D-04): the compose changes as the same
// real line diff the stack-edit review uses, plus the extracted .env preview.
export function MigrationReviewStep({
  diff,
  extractedEnv,
  emptySources,
  anonymousVolumes,
  anonymousAcknowledged,
  onAnonymousAcknowledgedChange,
}: Readonly<MigrationReviewStepProps>): React.JSX.Element {
  // Local state on purpose: this step unmounts on Back to step 1 and the whole
  // dialog unmounts on close, which resets the mask as the UI-SPEC requires (D-05).
  const [revealSecrets, setRevealSecrets] = useState(false);
  // D-09 / #103: one toggle covers the compose diff and the .env preview.
  const hasSecret = hunksHaveSecret(diff.hunks) || textHasSecret(extractedEnv);

  return (
    <div className="flex flex-col gap-8">
      {hasSecret && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          aria-pressed={revealSecrets}
          onClick={() => setRevealSecrets((prev) => !prev)}
        >
          {revealSecrets ? "Hide secrets" : "Show secrets"}
        </Button>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Compose file changes</h3>
          <ToneBadge tone="green">+{diff.added}</ToneBadge>
          <ToneBadge tone="red">{"−"}{diff.removed}</ToneBadge>
        </div>
        {diff.hunks.length === 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">No changes to your compose file.</p>
            <p className="text-sm text-muted-foreground">
              The compose file is migrated as-is. Continue to choose a backup.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] rounded-md border">
            <UnifiedDiffView hunks={maskDiffHunks(diff.hunks, revealSecrets)} ariaLabel="Migration compose diff" />
          </ScrollArea>
        )}
      </section>

      {emptySources.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="flex flex-col gap-2">
            <p>These sources do not exist yet. The new stack starts with an empty folder for each:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {emptySources.map((source) => (
                <li key={source}>
                  <code className="break-all font-mono text-xs">{source}</code>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {anonymousVolumes.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="flex flex-col gap-3">
            <p>These anonymous volumes are not copied and start empty in the new stack:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {anonymousVolumes.map(({service, containerPath}) => (
                <li key={`${service}:${containerPath}`}>
                  <code className="break-all font-mono text-xs">{service}: {containerPath}</code>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Checkbox
                id="anonymous-volumes-ack"
                checked={anonymousAcknowledged}
                onCheckedChange={(checked) => onAnonymousAcknowledgedChange(checked === true)}
              />
              <Label htmlFor="anonymous-volumes-ack">I understand these volumes start empty in the new stack</Label>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {extractedEnv && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">New .env file</h3>
          <CodeEditor
            readOnly
            value={displaySecretText(extractedEnv, revealSecrets)}
            onChange={noop}
            height="200px"
            ariaLabel="Extracted .env preview"
          />
        </section>
      )}
    </div>
  );
}
