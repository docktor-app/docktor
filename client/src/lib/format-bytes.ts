const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const BASE = 1024;

// Null renders an em dash, matching every other "no value" cell on the
// Storage page. UI-SPEC section B says "en dash" in one line, but each
// copywriting row for an unmeasured size or total uses the em dash, so that
// wins for consistency.
export function formatBytes(bytes: number | null): string {
    if (bytes === null) return "—";
    if (bytes < BASE) return `${bytes} B`;

    let unitIndex = 0;
    let value = bytes;
    while (value >= BASE && unitIndex < UNITS.length - 1) {
        value /= BASE;
        unitIndex += 1;
    }

    // One decimal for KB and MB, two for GB and TB.
    const decimals = unitIndex >= 3 ? 2 : 1;
    return `${value.toFixed(decimals)} ${UNITS[unitIndex]}`;
}
