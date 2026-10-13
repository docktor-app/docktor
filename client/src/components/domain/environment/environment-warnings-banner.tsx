import {AlertTriangle, X} from "lucide-react";
import type {EnvironmentWarning} from "@docktor/shared";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {ToneBadge} from "@/components/common/tone-badge";

export interface EnvironmentWarningsBannerProps {
    readonly warnings: readonly EnvironmentWarning[];
    readonly onDismiss: (warning: EnvironmentWarning) => void;
    readonly onDismissAll: () => void;
    readonly docsHref: string;
}

/**
 * #7/D-13: the boot-time environment warnings as one yellow banner, styled like
 * stack-alerts.tsx's configChanged alert. Messages come from the server and are
 * rendered as React text nodes only (T-16-10).
 */
export function EnvironmentWarningsBanner({
    warnings,
    onDismiss,
    onDismissAll,
    docsHref,
}: Readonly<EnvironmentWarningsBannerProps>) {
    if (warnings.length === 0) return null;

    return (
        <Alert className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4"/>
            <AlertTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                Configuration warnings
                <ToneBadge tone="yellow">{warnings.length}</ToneBadge>
            </AlertTitle>
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <ul className="space-y-1">
                    {warnings.map((warning) => (
                        <li key={`${warning.code}:${warning.variable}`} className="flex items-start gap-2">
                            <div className="flex-1">
                                <code className="font-mono font-semibold">{warning.variable}</code>{" "}
                                <span>{warning.message}</span>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                                aria-label={`Dismiss warning about ${warning.variable}`}
                                onClick={() => onDismiss(warning)}
                            >
                                <X className="size-4"/>
                            </Button>
                        </li>
                    ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <a
                        href={docsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline underline-offset-2"
                    >
                        How to fix these
                    </a>
                    {warnings.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={onDismissAll}>
                            Dismiss all
                        </Button>
                    )}
                </div>
            </AlertDescription>
        </Alert>
    );
}
