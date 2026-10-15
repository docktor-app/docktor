import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ToneBadge} from "@/components/common/tone-badge";
import {UnifiedDiffView} from "@/components/common/unified-diff-view";
import type {UnifiedDiff} from "@/lib/stacks-api";

export interface MigrationReviewStepProps {
  readonly diff: UnifiedDiff;
  readonly extractedEnv: string;
}

// Step 2 of the migration dialog (#72, D-04): the compose changes as the same
// real line diff the stack-edit review uses, plus the extracted .env preview.
export function MigrationReviewStep({diff, extractedEnv}: Readonly<MigrationReviewStepProps>): React.JSX.Element {
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
        <section className="flex flex-col gap-2">
          <Label>New .env File</Label>
          <div className="rounded-md border bg-muted/50 p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap">{extractedEnv}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
