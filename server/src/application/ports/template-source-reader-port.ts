/**
 * Port for walking a synced git checkout (produced by `GitExecutorPort`) and
 * returning a validated, deterministic template index (#19 "schema
 * validated on load", D-06 folder layout). A malformed template or variant
 * never throws — it is excluded and reported in `issues` by relative path;
 * valid siblings still load.
 */
export interface TemplateSourceIssue {
    /** Path relative to the checkout root, forward slashes, naming the offending folder/file. */
    path: string;
    message: string;
}

export interface ParsedTemplateVariant {
    slug: string;
    name: string;
    description: string;
    usage: string | null;
    composeContent: string;
    envContent: string | null;
    /** sha256 hex of the variant's manifest + compose + env content — D-08's version pin. */
    contentHash: string;
}

export interface ParsedTemplate {
    slug: string;
    name: string;
    description: string;
    category: string;
    /** Inline data URI (svg/png), or null when no icon was configured or it failed validation. */
    iconDataUri: string | null;
    variants: ParsedTemplateVariant[];
}

export interface TemplateSourceIndex {
    templates: ParsedTemplate[];
    issues: TemplateSourceIssue[];
}

export interface TemplateSourceReaderPort {
    readCheckout(checkoutDir: string): Promise<TemplateSourceIndex>;
}
