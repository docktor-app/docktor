// Single secret masker shared by client and server (reused by the migration
// review, the stack-edit review and server-side error text). Pure string
// functions: shared code also runs in the browser, so no node imports.
//
// The key-name rule is a deliberately broad display heuristic, not a security
// boundary: a value is masked when its KEY merely looks secret, and URL
// credentials (scheme://user:password@host) are masked whatever the key is.
export const SECRET_MASK = "••••••••";

const SECRET_KEY_PATTERN = /password|passwd|secret|key|token|credential/i;

// A whole-value variable reference ("${VAR}", "$VAR", "${VAR:-default}") is a
// pass-through, not a literal secret. Same rule as the server's compose
// analyzer; re-implemented because shared cannot import server code.
const VARIABLE_REFERENCE_PATTERN = /^\$(\{[A-Za-z_][A-Za-z0-9_]*(:?[-?+][^}]*)?\}|[A-Za-z_][A-Za-z0-9_]*)$/;

// scheme://user:password@ — the password runs up to the first "@".
const URL_CREDENTIAL_PATTERN = /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]+:)([^@\s/]+)(@)/g;

// `[indent][- ]["][export ]KEY=value` (.env lines and compose list items).
const ENV_ASSIGNMENT_PATTERN = /^(\s*(?:-\s+)?)(["']?)((?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$/;

// `[indent]["]KEY["]: value` (compose map form).
const MAP_ENTRY_PATTERN = /^(\s*)(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\2(:\s+)(.*)$/;

// YAML values that are not a plain/quoted scalar: block scalars, flow
// collections, anchors, aliases and comments.
const NON_SCALAR_START = /^[|>{[&*#]/;

export function isSecretKey(key: string): boolean {
    return SECRET_KEY_PATTERN.test(key);
}

function isVariableReference(value: string): boolean {
    return VARIABLE_REFERENCE_PATTERN.test(value.trim());
}

function maskUrlCredentials(line: string): string {
    return line.replace(URL_CREDENTIAL_PATTERN, (match, head: string, password: string, at: string) =>
        isVariableReference(password) ? match : `${head}${SECRET_MASK}${at}`,
    );
}

/** The masked form of a value, or undefined when there is nothing to hide. Wrapping quotes are kept. */
function maskValue(value: string): string | undefined {
    const quoted = /^(["'])(.*)\1$/.exec(value);
    const inner = quoted?.[2] ?? value;
    if (inner.trim() === "" || isVariableReference(inner) || inner === SECRET_MASK) {
        return undefined;
    }
    const quote = quoted?.[1] ?? "";
    return `${quote}${SECRET_MASK}${quote}`;
}

function maskEnvAssignment(line: string): string | undefined {
    const match = ENV_ASSIGNMENT_PATTERN.exec(line);
    if (!match) {
        return undefined;
    }
    const [, head = "", openQuote = "", exportPrefix = "", key = "", rest = ""] = match;
    if (!isSecretKey(key)) {
        return undefined;
    }
    // `- "KEY=value"`: the quote opened before the key closes after the value.
    const closeQuote = openQuote !== "" && rest.endsWith(openQuote) ? openQuote : "";
    const value = closeQuote === "" ? rest : rest.slice(0, -1);
    const masked = maskValue(value);
    return masked === undefined ? undefined : `${head}${openQuote}${exportPrefix}${key}=${masked}${closeQuote}`;
}

function maskMapEntry(line: string): string | undefined {
    const match = MAP_ENTRY_PATTERN.exec(line);
    if (!match) {
        return undefined;
    }
    const [, indent = "", quote = "", key = "", separator = "", value = ""] = match;
    if (!isSecretKey(key) || NON_SCALAR_START.test(value)) {
        return undefined;
    }
    const masked = maskValue(value);
    return masked === undefined ? undefined : `${indent}${quote}${key}${quote}${separator}${masked}`;
}

/** Mask the secret value on one line (.env, compose map or list form, URL credentials); other lines are returned unchanged. */
export function maskSecretLine(line: string): string {
    const carriageReturn = line.endsWith("\r") ? "\r" : "";
    const body = carriageReturn ? line.slice(0, -1) : line;
    const withoutUrlSecrets = maskUrlCredentials(body);
    const masked = maskEnvAssignment(withoutUrlSecrets) ?? maskMapEntry(withoutUrlSecrets) ?? withoutUrlSecrets;
    return `${masked}${carriageReturn}`;
}

/** Line-by-line masking of a whole document (.env file, compose file or error text). */
export function maskSecrets(text: string): string {
    return text.split("\n").map(maskSecretLine).join("\n");
}

export function lineHasSecret(line: string): boolean {
    return maskSecretLine(line) !== line;
}

export function textHasSecret(text: string): boolean {
    return maskSecrets(text) !== text;
}
