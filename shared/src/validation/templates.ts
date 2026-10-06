import {z} from "zod";

// Issue #19/T-12-13: these are the only git transports GitExecutor will ever
// hand to a `git` child process (re-validated there immediately before
// spawning anything, per its own safety contract). `file://` is deliberately
// absent from the default list — it is opt-in only (GitExecutor's own test
// harness enables it explicitly for a local bare-repo fixture) — and
// `ext::`/credential-bearing URLs are never allowed under any configuration.
export const ALLOWED_TEMPLATE_REPO_PROTOCOLS = ["https", "git", "ssh"] as const;

const CONTROL_OR_WHITESPACE_PATTERN = /[\u0000- \u007f]/;

/**
 * True when `url` is safe to pass as a git remote URL argument. Guards
 * against the git-URL-as-argv threat (T-12-13): an `ext::` transport-helper
 * string can execute arbitrary commands, a leading `-` can be interpreted by
 * `git clone` as an option (argument injection), and embedded credentials
 * (`user:pw@host`) should never be accepted from user input. Used both at
 * the schema boundary (`templateRepoUrlSchema`) and again inside
 * `GitExecutor.syncCheckout` immediately before any process is spawned.
 */
export function isAllowedGitRemoteUrl(
    url: string,
    protocols: readonly string[] = ALLOWED_TEMPLATE_REPO_PROTOCOLS,
): boolean {
    const trimmed = url.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.startsWith("-")) return false;
    if (trimmed.includes("::")) return false;
    if (CONTROL_OR_WHITESPACE_PATTERN.test(trimmed)) return false;

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return false;
    }

    const scheme = parsed.protocol.replace(/:$/, "");
    if (!protocols.includes(scheme)) return false;
    // file:// URLs have no hostname component by design; every other
    // transport requires one (rejects something like "https:///repo").
    if (scheme !== "file" && parsed.hostname.length === 0) return false;
    if (parsed.username !== "" || parsed.password !== "") return false;

    return true;
}

export const templateRepoUrlSchema = z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((u) => isAllowedGitRemoteUrl(u), "Use an https://, git:// or ssh:// repository URL without embedded credentials");

export const addTemplateRepoSchema = z.object({
    url: templateRepoUrlSchema,
});

// D-06: template and variant directory names become stable identifiers
// (repoId/templateId/variantId segments) — lowercase alphanumeric with
// internal hyphens only, matching every other slug pattern in this codebase
// (see stackIdSchema in validation/stacks.ts).
export const TEMPLATE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const templateSlugSchema = z
    .string()
    .regex(TEMPLATE_SLUG_PATTERN, "Must be lowercase alphanumeric with hyphens, starting with a letter or digit");

// template.yml — one per template, shared by all of its variants.
// schemaVersion is a literal so the on-disk authoring format can evolve
// later without silently misparsing an old repo's manifest.
export const templateManifestSchema = z.object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    category: z.string().min(1).max(50),
    // Relative filename inside the template folder (never a remote URL) —
    // TemplateSourceReader embeds its contents as a data URI so browsing
    // templates never makes a third-party request.
    icon: z.string().regex(/^[A-Za-z0-9._-]+\.(svg|png)$/).optional(),
});

// variant.yml — one per variant subdirectory.
export const templateVariantManifestSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    usage: z.string().max(5000).optional(),
});

export const templateRepoParamsSchema = z.object({
    repoId: z.string().min(1).max(64),
});

export const templateVariantParamsSchema = z.object({
    variantId: z.string().min(1).max(64),
});

export type AddTemplateRepoInput = z.infer<typeof addTemplateRepoSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;
export type TemplateVariantManifest = z.infer<typeof templateVariantManifestSchema>;
export type TemplateRepoParams = z.infer<typeof templateRepoParamsSchema>;
export type TemplateVariantParams = z.infer<typeof templateVariantParamsSchema>;
