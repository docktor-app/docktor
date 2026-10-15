import {useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {MigrationSelectStep} from "./migration-select-step";
import {MigrationReviewStep} from "./migration-review-step";
import {MigrationStepIndicator, MIGRATION_STEP_LABELS} from "./migration-step-indicator";
import {MigrationBackupStep} from "./migration-backup-step";
import {MigrationOldStackStep} from "./migration-old-stack-step";
import {directoryDisplayName} from "@/lib/path-display";
import type {DiscoveredStack, MigrationPreview, VolumeSelection} from "@/lib/brownfield-types";

const PREVIEW_ERROR_FALLBACK = "Failed to generate preview. Check that the compose file is still readable and try again.";

export interface ConfirmMigrateParams {
  stack: DiscoveredStack;
  displayName: string;
  volumeSelections: VolumeSelection[];
  namedVolumeSelections: Record<string, boolean>;
  backup: boolean;
  stopOldStack: boolean;
}

type MigrationStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<MigrationStep, string> = {
  1: "Select Data to Migrate",
  2: "Review Changes",
  3: "Back Up Before Migrating",
  4: "Old Stack",
};

const STEP_DESCRIPTIONS: Record<MigrationStep, string> = {
  1: "Choose which volumes and bind mounts to copy into Docktor's managed directory. Unchecked items will remain at their current location (not backed up).",
  2: "Review the changes to your compose file and environment variables before migration.",
  3: "Choose whether to keep a copy of the old stack's files before anything is migrated.",
  4: "Choose what happens to the old stack while its data is copied.",
};

const PREVIOUS_STEP: Record<Exclude<MigrationStep, 1>, MigrationStep> = {2: 1, 3: 2, 4: 3};
const NEXT_STEP: Record<Exclude<MigrationStep, 4>, MigrationStep> = {1: 2, 2: 3, 3: 4};

const NEXT_LABELS: Partial<Record<MigrationStep, string>> = {
  2: "Choose Backup",
  3: "Choose Old Stack Action",
};

interface MigrationWizardProps {
  stack: DiscoveredStack;
  open: boolean;
  onClose: () => void;
  // WR-09: migration execution (the async fetch + its toasts) now runs in
  // the parent (BrownfieldStep/BrownfieldImport), which stays mounted for
  // the whole background migration — the dialog itself closes immediately
  // on confirm and must never update its own state afterward.
  onConfirmMigrate: (params: ConfirmMigrateParams) => void;
  // Injected rather than imported directly, so this component is agnostic
  // about whether it's driven by the wizard's setup-api or the post-setup
  // page's import-api.
  previewMigration: (
    composePath: string,
    volumeSelections: VolumeSelection[],
    namedVolumeSelections: Record<string, boolean>,
  ) => Promise<MigrationPreview>;
}

export function MigrationWizard({stack, open, onClose, onConfirmMigrate, previewMigration}: Readonly<MigrationWizardProps>) {
  const [step, setStep] = useState<MigrationStep>(1);
  const [displayName, setDisplayName] = useState(directoryDisplayName(stack.directory) || "");
  const [loading, setLoading] = useState(false);

  // Volume selections state
  const [namedVolumeSelections, setNamedVolumeSelections] = useState<Record<string, boolean>>(() => {
    const selections: Record<string, boolean> = {};
    for (const vol of stack.namedVolumes) {
      selections[vol] = true; // Default: convert all named volumes
    }
    return selections;
  });

  const [bindMountSelections, setBindMountSelections] = useState<VolumeSelection[]>(() => {
    // For absolute paths, default to convert
    return stack.absolutePaths.map((path) => ({
      originalPath: path,
      newPath: `./volumes/${directoryDisplayName(path) || "data"}`,
      convert: true,
    }));
  });

  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [backup, setBackup] = useState(true);
  const [stopOldStack, setStopOldStack] = useState(true);

  // RESEARCH Pitfall 7: a preview response that arrives after the dialog was
  // cancelled or closed must not advance (or toast into) a dead session.
  const previewRequestId = useRef(0);
  useEffect(() => {
    if (!open) previewRequestId.current += 1;
  }, [open]);
  useEffect(() => () => {
    previewRequestId.current += 1;
  }, []);

  // UI-SPEC focus rule: the step body takes focus on every step change.
  const stepBodyRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      stepBodyRef.current?.focus();
    }
  }, [step]);

  const volumesToCopy =
    Object.values(namedVolumeSelections).filter(Boolean).length +
    bindMountSelections.filter((sel) => sel.convert).length;

  const handleVolumeToggle = (volName: string, checked: boolean) => {
    setNamedVolumeSelections((prev) => ({...prev, [volName]: checked}));
  };

  const handleBindMountToggle = (index: number, checked: boolean) => {
    setBindMountSelections((prev) => {
      const updated = [...prev];
      updated[index] = {...updated[index], convert: checked};
      return updated;
    });
  };

  const handleNextToPreview = async () => {
    previewRequestId.current += 1;
    const requestId = previewRequestId.current;
    setLoading(true);
    try {
      const result = await previewMigration(
        stack.path,
        bindMountSelections,
        namedVolumeSelections,
      );
      if (requestId !== previewRequestId.current) return;
      setPreview(result);
      setStep(2);
    } catch (err: unknown) {
      if (requestId !== previewRequestId.current) return;
      toast.error(err instanceof Error && err.message ? err.message : PREVIEW_ERROR_FALLBACK);
    } finally {
      if (requestId === previewRequestId.current) setLoading(false);
    }
  };

  const handleMigrate = () => {
    // WR-09: hand off to the parent and close immediately — this component
    // is about to unmount, so it must not perform (or await) any work that
    // would try to update its own state afterward. The parent stays mounted
    // for the whole background migration and owns the loading/toast UX.
    onConfirmMigrate({
      stack,
      displayName,
      volumeSelections: bindMountSelections,
      namedVolumeSelections,
      backup,
      stopOldStack,
    });
    handleClose();
  };

  const handleClose = () => {
    previewRequestId.current += 1;
    setLoading(false);
    setStep(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col gap-4 p-4 sm:p-6 max-h-[90dvh] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>{STEP_DESCRIPTIONS[step]}</DialogDescription>
        </DialogHeader>

        <MigrationStepIndicator step={step} />

        <div
          ref={stepBodyRef}
          role="group"
          aria-label={MIGRATION_STEP_LABELS[step - 1]}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {step === 1 && (
            <MigrationSelectStep
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              namedVolumes={stack.namedVolumes}
              namedVolumeSelections={namedVolumeSelections}
              onVolumeToggle={handleVolumeToggle}
              bindMountSelections={bindMountSelections}
              onBindMountToggle={handleBindMountToggle}
              inlineEnvVars={stack.inlineEnvVars}
            />
          )}

          {step === 2 && preview && (
            <div className="py-4">
              <MigrationReviewStep diff={preview.diff} extractedEnv={preview.extractedEnv} />
            </div>
          )}

          {step === 3 && <MigrationBackupStep checked={backup} onCheckedChange={setBackup} />}

          {step === 4 && (
            <MigrationOldStackStep
              checked={stopOldStack}
              onCheckedChange={setStopOldStack}
              summary={{displayName, volumesToCopy, backup}}
            />
          )}
        </div>

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={handleClose}>Cancel Migration</Button>
              <Button className="w-full sm:w-auto" onClick={handleNextToPreview} disabled={loading || !displayName}>
                {loading ? "Generating preview\u2026" : "Preview Changes"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep(PREVIOUS_STEP[step])}>Back</Button>
              {step === 4 ? (
                <Button className="w-full sm:w-auto" onClick={handleMigrate}>Confirm & Migrate</Button>
              ) : (
                <Button className="w-full sm:w-auto" onClick={() => setStep(NEXT_STEP[step])}>
                  {NEXT_LABELS[step]}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
