import type {DeployWarnings} from "./stacks-api";

/**
 * Issue #21/D-14: parses Stack.deployWarnings' JSON-encoded content back
 * into a DeployWarnings object. Never throws — a missing value, malformed
 * JSON, or a shape that doesn't carry both arrays all resolve to null
 * (treated the same as "no warnings yet" by hasDeployWarnings below).
 */
export function parseDeployWarnings(raw: string | null | undefined): DeployWarnings | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== "object" ||
            !Array.isArray((parsed as {composeFindings?: unknown}).composeFindings) ||
            !Array.isArray((parsed as {portConflicts?: unknown}).portConflicts)
        ) {
            return null;
        }
        return parsed as DeployWarnings;
    } catch {
        return null;
    }
}

/** True when there is at least one compose-check finding or port conflict to show. */
export function hasDeployWarnings(warnings: DeployWarnings | null): warnings is DeployWarnings {
    if (!warnings) return false;
    return warnings.composeFindings.length > 0 || warnings.portConflicts.length > 0;
}
