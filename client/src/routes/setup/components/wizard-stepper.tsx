import {cn} from "@/lib/utils";
import {Check} from "lucide-react";

interface WizardStepperProps {
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
}

const STEPS = [
  {number: 1, title: "Account", required: true},
  {number: 2, title: "Settings", required: true},
  {number: 3, title: "Backup", required: false},
  {number: 4, title: "Notifications", required: false},
  {number: 5, title: "Import", required: false},
  {number: 6, title: "Proxy", required: false},
];

export function WizardStepper({currentStep, completedSteps, onStepClick}: Readonly<WizardStepperProps>) {
  return (
    // w-full (D-17): setup.tsx's parent is a `flex flex-col items-center`
    // container — items-center makes a flex item size via fit-content
    // instead of stretching to the available width, so without an explicit
    // width this nav (and the overflow-x-auto div below) would grow to the
    // stepper's full natural width instead of being bounded by the viewport.
    <nav aria-label="Setup wizard progress" className="mb-8 w-full">
      {/* D-17: six steps' circles+labels+connectors don't fit a 390-412px
          viewport without wrapping/scrolling — mirrors the stack detail
          page's/Settings' own -mx-1 overflow-x-auto px-1 tab-list pattern. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <ol className="flex items-center justify-center gap-4 w-max mx-auto">
          {STEPS.map((step, index) => {
            const isCompleted = completedSteps.has(step.number);
            const isCurrent = currentStep === step.number;
            const isClickable = isCompleted || step.number <= currentStep;

            return (
              <li key={step.number} className="flex items-center">
                {index > 0 && (
                  <div
                    className={cn(
                      "w-12 h-0.5 mr-4",
                      isCompleted || step.number < currentStep
                        ? "bg-primary"
                        : "bg-border"
                    )}
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(step.number)}
                  disabled={!isClickable}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-colors",
                    isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Step ${step.number}: ${step.title}${isCompleted ? " (completed)" : ""}${!step.required ? " (optional)" : ""}`}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      step.number
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
