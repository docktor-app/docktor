import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {EnvironmentWarning} from "@docktor/shared";
import {getEnvironmentReport} from "@/lib/settings-api";

export interface UseEnvironmentWarningsResult {
    readonly warnings: readonly EnvironmentWarning[];
    readonly error: string | null;
    readonly dismiss: (warning: EnvironmentWarning) => void;
    readonly dismissAll: () => void;
}

// Per-browser dismissals (D-13): a JSON array of `code:variable` strings, so a
// new or changed misconfiguration is a different key and shows again. There is
// deliberately no server-side model for this.
const DISMISSED_STORAGE_KEY = "docktor.environment-warnings.dismissed";

// Every localStorage access is guarded: storage can be disabled, full or hold a
// value another version wrote, and none of that may break a page.
function readDismissed(): ReadonlySet<string> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_STORAGE_KEY) ?? "[]");
        if (Array.isArray(parsed) && parsed.every((entry): entry is string => typeof entry === "string")) {
            return new Set(parsed);
        }
    } catch {
        // Unreadable storage or invalid JSON: nothing is dismissed.
    }
    return new Set();
}

function writeDismissed(keys: ReadonlySet<string>): void {
    try {
        localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...keys]));
    } catch {
        // Keep the in-memory dismissal for this session.
    }
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
    const [dismissed, setDismissed] = useState<ReadonlySet<string>>(readDismissed);
    const [error, setError] = useState<string | null>(null);
    const persistedSet = useRef<ReadonlySet<string>>(dismissed);

    useEffect(() => {
        let cancelled = false;
        getEnvironmentReport()
            .then((result) => {
                if (cancelled) return;
                setReport(result.warnings);
                // Drop dismissals of warnings that are gone, so a fixed and later
                // reintroduced misconfiguration is shown again.
                const present = new Set(result.warnings.map(warningKey));
                setDismissed((current) => {
                    const kept = new Set([...current].filter((key) => present.has(key)));
                    return kept.size === current.size ? current : kept;
                });
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch environment warnings");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Persist only when the set itself changed, so a mount with nothing to
    // change never writes.
    useEffect(() => {
        if (persistedSet.current === dismissed) return;
        persistedSet.current = dismissed;
        writeDismissed(dismissed);
    }, [dismissed]);

    const dismiss = useCallback((warning: EnvironmentWarning) => {
        setDismissed((current) => new Set(current).add(warningKey(warning)));
    }, []);

    const dismissAll = useCallback(() => {
        setDismissed((current) => new Set([...current, ...report.map(warningKey)]));
    }, [report]);

    const warnings = useMemo(
        () => report.filter((warning) => !dismissed.has(warningKey(warning))),
        [report, dismissed],
    );

    return {warnings, error, dismiss, dismissAll};
}
