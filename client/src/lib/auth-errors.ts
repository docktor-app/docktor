export type AuthErrorKind = "rate-limited" | "invalid-code" | "invalid-password" | "expired" | "unknown";

/** The subset of a better-auth client error the classifier looks at. */
export interface AuthErrorLike {
    status?: number;
    code?: string;
    message?: string;
}

// better-auth 1.4.18 always sets `message`; `code` is matched as well in case a
// future version stops doing so. Strings are from the plugin's error-code table
// (INVALID_CODE, INVALID_BACKUP_CODE, INVALID_TWO_FACTOR_COOKIE) and core's
// INVALID_PASSWORD. 15-01's integration tests were written against these but had
// not been executed when this was written; CI is the first real confirmation.
const INVALID_CODE_CODES = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE"]);
const INVALID_CODE_MESSAGES = new Set(["Invalid code", "Invalid backup code"]);

/** Maps a better-auth client error to the user-facing outcome the forms care about. */
export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthErrorKind {
    if (!error) {
        return "unknown";
    }
    if (error.status === 429) {
        return "rate-limited";
    }
    if (error.code === "INVALID_TWO_FACTOR_COOKIE" || error.message === "Invalid two factor cookie") {
        return "expired";
    }
    if ((error.code && INVALID_CODE_CODES.has(error.code)) || (error.message && INVALID_CODE_MESSAGES.has(error.message))) {
        return "invalid-code";
    }
    if (error.code === "INVALID_PASSWORD" || error.message === "Invalid password") {
        return "invalid-password";
    }
    return "unknown";
}
