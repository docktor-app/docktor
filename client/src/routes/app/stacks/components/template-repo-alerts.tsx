import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import type {TemplateRepoStatus} from "@/lib/templates-api";

export interface TemplateRepoAlertsProps {
    readonly repos: ReadonlyArray<TemplateRepoStatus>;
    readonly onRetry: (repoId: string) => void;
    readonly retryingRepoId?: string | null;
}

// Issue #19/D-07/UI-SPEC sync-error copy: one destructive Alert per repo that
// failed to sync, each with its own Retry — a repo-sync failure never blocks
// the rest of the catalog from rendering (T-12-xx: one bad repo, one alert).
export function TemplateRepoAlerts({
    repos,
    onRetry,
    retryingRepoId,
}: Readonly<TemplateRepoAlertsProps>) {
    const failed = repos.filter((repo) => repo.lastSyncError);
    if (failed.length === 0) return null;

    return (
        <div className="space-y-2">
            {failed.map((repo) => (
                <Alert key={repo.id} variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            Couldn't load templates from {repo.url} — check the repository URL and try again.
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={retryingRepoId === repo.id}
                            onClick={() => onRetry(repo.id)}
                        >
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ))}
        </div>
    );
}
