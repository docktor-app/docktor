import {cn} from "@/lib/utils";

export const MIGRATION_STEP_LABELS = ["Select data", "Review changes", "Backup", "Old stack"] as const;

export interface MigrationStepIndicatorProps {
  readonly step: 1 | 2 | 3 | 4;
}

// Compact, non-interactive progress indicator for the migration dialog:
// a "Step n of 4" line plus a four-segment list for assistive technology.
export function MigrationStepIndicator({step}: Readonly<MigrationStepIndicatorProps>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="text-muted-foreground">Step {step} of {MIGRATION_STEP_LABELS.length}: </span>
        <span className="font-semibold">{MIGRATION_STEP_LABELS[step - 1]}</span>
      </p>
      <ol aria-label="Migration progress" className="flex gap-1">
        {MIGRATION_STEP_LABELS.map((label, index) => (
          <li key={label} className="flex-1" aria-current={index + 1 === step ? "step" : undefined}>
            <span className="sr-only">{label}</span>
            <div aria-hidden="true" className={cn("h-1 rounded-full", index + 1 <= step ? "bg-primary" : "bg-muted")} />
          </li>
        ))}
      </ol>
    </div>
  );
}
