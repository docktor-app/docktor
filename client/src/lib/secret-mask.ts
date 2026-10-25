import {lineHasSecret, maskSecretLine, maskSecrets, SECRET_MASK} from "@docktor/shared";

// Reveal-aware display helpers over the shared secret masker (see
// @docktor/shared mask-secrets). One implementation backs the migration review
// and the stack-edit review, so the mask looks and behaves the same everywhere.
export {SECRET_MASK};

/** Structural hunk shape: any diff renderer's hunks work as long as their lines carry `text`. */
interface MaskableHunk {
    readonly lines: ReadonlyArray<{readonly text: string}>;
}

/** Mask the secret value on one line unless `reveal` is set. */
export function displaySecretLine(text: string, reveal: boolean): string {
    return reveal ? text : maskSecretLine(text);
}

/** Mask the secret values of a whole document unless `reveal` is set. */
export function displaySecretText(text: string, reveal: boolean): string {
    return reveal ? text : maskSecrets(text);
}

/** Hunks with every secret line (removed, added and context) masked; untouched line objects are reused as they are. */
export function maskDiffHunks<H extends MaskableHunk>(hunks: ReadonlyArray<H>, reveal: boolean): ReadonlyArray<H> {
    if (reveal) {
        return hunks;
    }
    return hunks.map((hunk) => ({
        ...hunk,
        lines: hunk.lines.map((line) => {
            const text = maskSecretLine(line.text);
            return text === line.text ? line : {...line, text};
        }),
    }));
}

export function hunksHaveSecret(hunks: ReadonlyArray<MaskableHunk>): boolean {
    return hunks.some((hunk) => hunk.lines.some((line) => lineHasSecret(line.text)));
}
