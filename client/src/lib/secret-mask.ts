import {SECRET_MASK} from "@docktor/shared";

// Stub for the RED commit.
export {SECRET_MASK};

export function displaySecretLine(text: string, _reveal: boolean): string {
    return text;
}

export function displaySecretText(text: string, _reveal: boolean): string {
    return text;
}

interface MaskableHunk {
    readonly lines: ReadonlyArray<{readonly text: string}>;
}

export function maskDiffHunks<H extends MaskableHunk>(hunks: ReadonlyArray<H>, _reveal: boolean): ReadonlyArray<H> {
    return hunks;
}

export function hunksHaveSecret(_hunks: ReadonlyArray<MaskableHunk>): boolean {
    return false;
}
