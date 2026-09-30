import {ENV_VARIABLE_KEY_PATTERN} from "@docktor/shared";

/**
 * A single line of a `.env` file, in its original position (`lineIndex`).
 * A line is a "variable" only when it matches `^KEY=value$` exactly
 * (`KEY` per `ENV_VARIABLE_KEY_PATTERN`); everything else — comments,
 * blank lines, `export KEY=value` lines, malformed lines, and the trailing
 * empty line produced by a file that ends with a newline — is kept as an
 * opaque "passthrough" line, verbatim.
 *
 * This is what makes `serializeEnvFile(parseEnvFile(s)) === s` hold for
 * every string (RESEARCH Pitfall 4): a passthrough line is never
 * reinterpreted, only ever echoed back.
 */
export type EnvLine =
    | {readonly kind: "variable"; readonly key: string; readonly value: string; readonly lineIndex: number}
    | {readonly kind: "passthrough"; readonly raw: string; readonly lineIndex: number};

/** One row of the EnvEditor's table mode. `lineIndex: null` means "not yet in the document" (a newly added row). */
export interface EnvTableRow {
    readonly key: string;
    readonly value: string;
    readonly lineIndex: number | null;
}

// Anchors stripped so it can be embedded inside the line-level pattern below.
const KEY_PATTERN_SOURCE = ENV_VARIABLE_KEY_PATTERN.source.slice(1, -1);
const VARIABLE_LINE_PATTERN = new RegExp(`^(${KEY_PATTERN_SOURCE})=(.*)$`);

/**
 * Parses raw `.env` content into a lossless line model. Splitting on `"\n"`
 * only (never `"\r\n"`) keeps a trailing `"\r"` inside the line itself, so a
 * CRLF-terminated line that doesn't otherwise match the variable pattern
 * round-trips byte-for-byte as a passthrough line.
 */
export function parseEnvFile(content: string): EnvLine[] {
    return content.split("\n").map((raw, lineIndex) => {
        const match = VARIABLE_LINE_PATTERN.exec(raw);
        if (match) {
            return {kind: "variable", key: match[1], value: match[2], lineIndex} as const;
        }
        return {kind: "passthrough", raw, lineIndex} as const;
    });
}

/** The exact inverse of `parseEnvFile` when no rows have been edited — this identity is what Pitfall 4 requires. */
export function serializeEnvFile(lines: EnvLine[]): string {
    return lines.map((line) => (line.kind === "variable" ? `${line.key}=${line.value}` : line.raw)).join("\n");
}

/** Projects only the variable lines of a parsed document into table rows, in original order. */
export function toTableRows(lines: EnvLine[]): EnvTableRow[] {
    return lines
        .filter((line): line is Extract<EnvLine, {kind: "variable"}> => line.kind === "variable")
        .map((line) => ({key: line.key, value: line.value, lineIndex: line.lineIndex}));
}

/**
 * Re-serializes `lines` with `rows` applied: a variable line whose
 * `lineIndex` no longer has a matching row is dropped (removed row); a
 * variable line whose `lineIndex` still has a row is rewritten from that
 * row (possibly unchanged); passthrough lines are always kept verbatim in
 * their original position. Rows with `lineIndex: null` (new rows) are
 * appended at the end, but before a trailing empty passthrough line if the
 * original document ended with a newline — otherwise appending would
 * insert the new content after that trailing newline instead of before it.
 */
export function applyTableRows(lines: EnvLine[], rows: readonly EnvTableRow[]): string {
    const rowsByLineIndex = new Map<number, EnvTableRow>();
    const newRows: EnvTableRow[] = [];
    for (const row of rows) {
        if (row.lineIndex === null) {
            newRows.push(row);
        } else {
            rowsByLineIndex.set(row.lineIndex, row);
        }
    }

    const output: string[] = [];
    for (const line of lines) {
        if (line.kind === "passthrough") {
            output.push(line.raw);
            continue;
        }
        const row = rowsByLineIndex.get(line.lineIndex);
        if (row) {
            output.push(`${row.key}=${row.value}`);
        }
        // else: the row for this line was removed — drop the line entirely.
    }

    if (newRows.length > 0) {
        const newLines = newRows.map((row) => `${row.key}=${row.value}`);
        const lastLine = lines[lines.length - 1];
        const endedWithTrailingNewline = lastLine?.kind === "passthrough" && lastLine.raw === "";
        if (endedWithTrailingNewline && output[output.length - 1] === "") {
            output.splice(output.length - 1, 0, ...newLines);
        } else {
            output.push(...newLines);
        }
    }

    return output.join("\n");
}

// D-22: a deliberately broad, display-only heuristic — not a security
// control. A value is masked on screen when its key name merely *looks*
// like it holds a secret; the underlying .env file is always plain text.
export function isSecretKey(key: string): boolean {
    return /password|secret|key|token/i.test(key);
}

/** Non-blank passthrough lines — the count shown in the "kept as-is, switch to raw text mode" note. */
export function countPassthroughLines(lines: EnvLine[]): number {
    return lines.filter((line) => line.kind === "passthrough" && line.raw.trim() !== "").length;
}
