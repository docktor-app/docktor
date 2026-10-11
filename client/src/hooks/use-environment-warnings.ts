import {useCallback, useEffect, useMemo, useState} from "react";
import type {EnvironmentWarning} from "@docktor/shared";
import {getEnvironmentReport} from "@/lib/settings-api";

export interface UseEnvironmentWarningsResult {
    readonly warnings: readonly EnvironmentWarning[];
    readonly error: string | null;
    readonly dismiss: (warning: EnvironmentWarning) => void;
    readonly dismissAll: () => void;
}

// A warning is identified by what is misconfigured, not by its position.
function warningKey(warning: EnvironmentWarning): string {
    return `${warning.code}:${warning.variable}`;
}

// No SSE subscription and no polling: the report is computed once when the
// server boots and is fixed for the server's lifetime, so one fetch per mount
// is enough.
export function useEnvironmentWarnings(): UseEnvironmentWarningsResult {
    const [report, setReport] = useState<readonly EnvironmentWarning[]>([]);
    const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getEnvironmentReport()
            .then((result) => {
                if (!cancelled) setReport(result.warnings);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch environment warnings");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const dismiss = useCallback((warning: EnvironmentWarning) => {
        setDismissed((current) => new Set(current).add(warningKey(warning)));
    }, []);

    const dismissAll = useCallback(() => {
        setDismissed(new Set(report.map(warningKey)));
    }, [report]);

    const warnings = useMemo(
        () => report.filter((warning) => !dismissed.has(warningKey(warning))),
        [report, dismissed],
    );

    return {warnings, error, dismiss, dismissAll};
}
