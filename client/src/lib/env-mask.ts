import {isSecretKey} from "./env-file";

// Display-only secret masking for .env text (see the heuristic note on
// isSecretKey in env-file.ts). Shared by both review dialogs — the stack-edit
// diff review and the migration preview — so the mask looks and behaves the
// same everywhere (#72, D-05).
export const SECRET_MASK = "••••••••";

// Mirrors env-file.ts's variable-line pattern (an optional `export ` prefix,
// per the env key rule) — masking only needs to recognize the key to decide
// whether to hide the value, not to round-trip the line losslessly.
const ENV_KEY_VALUE_PATTERN = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/** Mask the value of a `KEY=value` line when KEY looks secret; any other line is returned unchanged. */
export function maskEnvLine(text: string, reveal: boolean): string {
    if (reveal) {
        return text;
    }
    const match = ENV_KEY_VALUE_PATTERN.exec(text);
    if (!match || !isSecretKey(match[2]!)) {
        return text;
    }
    return `${match[1] ?? ""}${match[2]}=${SECRET_MASK}`;
}

export function envLineHasSecret(text: string): boolean {
    const match = ENV_KEY_VALUE_PATTERN.exec(text);
    return !!match && isSecretKey(match[2]!);
}

/** Line-by-line masking of a whole .env document. */
export function maskEnvText(content: string, reveal: boolean): string {
    if (reveal) {
        return content;
    }
    return content
        .split("\n")
        .map((line) => maskEnvLine(line, false))
        .join("\n");
}

export function envTextHasSecret(content: string): boolean {
    return content.split("\n").some(envLineHasSecret);
}
