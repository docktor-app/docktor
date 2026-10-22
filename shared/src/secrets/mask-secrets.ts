// Single secret masker shared by client and server. Stub for the RED commit.
export const SECRET_MASK = "••••••••";

export function isSecretKey(_key: string): boolean {
    return false;
}

export function maskSecretLine(line: string): string {
    return line;
}

export function maskSecrets(text: string): string {
    return text;
}

export function lineHasSecret(line: string): boolean {
    return maskSecretLine(line) !== line;
}

export function textHasSecret(text: string): boolean {
    return maskSecrets(text) !== text;
}
