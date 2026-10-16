/**
 * Rules for writing a `.env` line that docker compose's dotenv parser reads back unchanged.
 * An unquoted value runs to the end of the line (a ` #` starts a comment) and `$` is
 * interpolated; a double-quoted value expands escapes; only a single-quoted value is literal.
 * Anything outside these rules is left inline in the compose file, where its meaning is unchanged.
 */

const INTERPOLATION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLAIN_VALUE = /^[A-Za-z0-9_./:@%+,=-]*$/;
// Characters that change meaning in a dotenv value or cannot sit inside a single-quoted one.
const UNSAFE_VALUE = /[$\\'"\r\n\0]/;

/** True when `${name}` is a valid compose interpolation reference. */
export function isInterpolationName(name: string): boolean {
    return INTERPOLATION_NAME.test(name);
}

/** True when `value` can be written to `.env` (plain or single-quoted) and read back identically. */
export function isDotenvSafeValue(value: string): boolean {
    return !UNSAFE_VALUE.test(value);
}

/** One `.env` line; the value must satisfy {@link isDotenvSafeValue}. Plain values stay unquoted. */
export function formatDotenvLine(name: string, value: string): string {
    return PLAIN_VALUE.test(value) ? `${name}=${value}` : `${name}='${value}'`;
}
