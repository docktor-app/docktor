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

// scheme://[user]:password@ — the user may be empty (redis://:password@host) and
// the password runs up to the LAST "@" of the token, because a password may
// itself contain "/" or "@" and the host boundary is ambiguous. Over-masking a
// trailing path that contains an "@" is the safe side of that ambiguity.
const URL_CREDENTIAL_PATTERN = /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]*:)(\S+)(@)/g;

// `[indent][- ]["][export ]KEY=value` (.env lines and compose list items).
const ENV_ASSIGNMENT_PATTERN = /^(\s*(?:-\s+)?)(["']?)((?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$/;

// `[indent]["]KEY["]: value` (compose map form).
const MAP_ENTRY_PATTERN = /^(\s*)(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\2(:\s+)(.*)$/;

// YAML values that are not a plain/quoted scalar: block scalars, flow
// collections, anchors, aliases and comments.
const NON_SCALAR_START = /^[|>{[&*#]/;

// `|`, `>`, `|-`, `>+`, `|2` ... : the header of a YAML block scalar.
const BLOCK_SCALAR_HEADER = /^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/;

// One `key: value` pair inside a flow-style map (`{A: b, "C": "d"}`).
const FLOW_PAIR_PATTERN = /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)("[^"]*"|'[^']*'|[^,}\s][^,}]*?)(?=\s*[,}])/g;

// `KEY=value` anywhere in a line (error text), and a quoted JSON `"KEY": "value"` pair.
const INLINE_ASSIGNMENT_PATTERN =
    /(?<![A-Za-z0-9_.-])((?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s"',;]+)/g;
const INLINE_JSON_PAIR_PATTERN = /(["'])([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)("[^"]*"|'[^']*')/g;

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

/** Mask the secret pairs of a flow-style map value (`environment: {DB_PASSWORD: x}`). */
function maskFlowMap(line: string): string | undefined {
    const match = MAP_ENTRY_PATTERN.exec(line);
    const value = match?.[5] ?? "";
    if (!value.startsWith("{")) {
        return undefined;
    }
    const maskedValue = value.replace(
        FLOW_PAIR_PATTERN,
        (pair, quote: string, key: string, separator: string, pairValue: string) => {
            const masked = isSecretKey(key) ? maskValue(pairValue) : undefined;
            return masked === undefined ? pair : `${quote}${key}${quote}${separator}${masked}`;
        },
    );
    return maskedValue === value ? undefined : `${line.slice(0, line.length - value.length)}${maskedValue}`;
}

/** Mask the secret value on one line (.env, compose map, flow map or list form, URL credentials); other lines are returned unchanged. */
export function maskSecretLine(line: string): string {
    const carriageReturn = line.endsWith("\r") ? "\r" : "";
    const body = carriageReturn ? line.slice(0, -1) : line;
    const withoutUrlSecrets = maskUrlCredentials(body);
    const masked =
        maskEnvAssignment(withoutUrlSecrets) ??
        maskMapEntry(withoutUrlSecrets) ??
        maskFlowMap(withoutUrlSecrets) ??
        withoutUrlSecrets;
    return `${masked}${carriageReturn}`;
}

/** The indent of a secret-keyed block scalar header (`  PRIVATE_KEY: |`), or undefined for any other line. */
function secretBlockIndent(body: string): number | undefined {
    const match = MAP_ENTRY_PATTERN.exec(body);
    if (!match) {
        return undefined;
    }
    const [, indent = "", , key = "", , value = ""] = match;
    return isSecretKey(key) && BLOCK_SCALAR_HEADER.test(value.trim()) ? indent.length : undefined;
}

/**
 * Line-by-line masking of a whole document (.env file or compose file). The
 * continuation lines of a block scalar owned by a secret key are masked too,
 * which a single line cannot know.
 */
export function maskSecrets(text: string): string {
    let blockIndent: number | undefined;
    return text
        .split("\n")
        .map((line) => {
            const carriageReturn = line.endsWith("\r") ? "\r" : "";
            const body = carriageReturn ? line.slice(0, -1) : line;
            if (blockIndent !== undefined) {
                const indent = /^\s*/.exec(body)?.[0] ?? "";
                if (body.trim() === "") {
                    return line;
                }
                if (indent.length > blockIndent) {
                    return `${indent}${SECRET_MASK}${carriageReturn}`;
                }
                blockIndent = undefined;
            }
            blockIndent = secretBlockIndent(body);
            return maskSecretLine(line);
        })
        .join("\n");
}

/**
 * Masking for free-form text such as compose/docker stderr, which echoes
 * assignments in the middle of a line or inside JSON fragments. Applies the
 * document rules first, then masks `KEY=value` and `"KEY": "value"` pairs
 * wherever they appear.
 */
export function maskErrorText(text: string): string {
    return maskSecrets(text)
        .replace(INLINE_ASSIGNMENT_PATTERN, (match, exportPrefix: string, key: string, value: string) => {
            const masked = isSecretKey(key) ? maskValue(value) : undefined;
            return masked === undefined ? match : `${exportPrefix}${key}=${masked}`;
        })
        .replace(INLINE_JSON_PAIR_PATTERN, (match, quote: string, key: string, separator: string, value: string) => {
            const masked = isSecretKey(key) ? maskValue(value) : undefined;
            return masked === undefined ? match : `${quote}${key}${quote}${separator}${masked}`;
        });
}

export function lineHasSecret(line: string): boolean {
    return maskSecretLine(line) !== line;
}

export function textHasSecret(text: string): boolean {
    return maskSecrets(text) !== text;
}
