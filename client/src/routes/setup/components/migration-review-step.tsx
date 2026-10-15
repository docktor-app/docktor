import {useState} from "react";
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ToneBadge} from "@/components/common/tone-badge";
import {CodeEditor} from "@/components/common/code-editor";
import {UnifiedDiffView} from "@/components/common/unified-diff-view";
import {envTextHasSecret, maskEnvText} from "@/lib/env-mask";
import type {UnifiedDiff} from "@/lib/stacks-api";

export interface MigrationReviewStepProps {
  readonly diff: UnifiedDiff;
  readonly extractedEnv: string;
}

const noop = (): void => undefined;

// Step 2 of the migration dialog (#72, D-04): the compose changes as the same
// real line diff the stack-edit review uses, plus the extracted .env preview.
export function MigrationReviewStep({diff, extractedEnv}: Readonly<MigrationReviewStepProps>): React.JSX.Element {
  // Local state on purpose: this step unmounts on Back to step 1 and the whole
  // dialog unmounts on close, which resets the mask as the UI-SPEC requires (D-05).
  const [revealSecrets, setRevealSecrets] = useState(false);

  return (
    <div className="flex flex-col gap-8">
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
            <UnifiedDiffView hunks={diff.hunks} ariaLabel="Migration compose diff" />
          </ScrollArea>
        )}
      </section>

      {extractedEnv && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">New .env file</h3>
          {envTextHasSecret(extractedEnv) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setRevealSecrets((prev) => !prev)}
            >
              {revealSecrets ? "Hide secret values" : "Show secret values"}
            </Button>
          )}
          <CodeEditor
            readOnly
            value={maskEnvText(extractedEnv, revealSecrets)}
            onChange={noop}
            height="200px"
            ariaLabel="Extracted .env preview"
          />
        </section>
      )}
    </div>
  );
}
