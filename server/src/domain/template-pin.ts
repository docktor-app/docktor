/**
 * The version pin written onto a stack created from a template variant
 * (D-08). Stores the repo URL (not a foreign key) so removing a
 * TemplateRepo row never touches stacks created from it, and the content
 * hash is pinned forever — never rewritten by a later template update.
 */
export interface TemplatePin {
    repoUrl: string;
    /** "<template-slug>/<variant-slug>" */
    path: string;
    commitSha: string | null;
    contentHash: string;
}

/**
 * Issue #19/D-08: true only when the synced index has a content hash for the
 * stack's pinned variant AND that hash differs from the one pinned at
 * creation time. A removed variant (currentHash undefined) is deliberately
 * never "updated" — re-pinning is never automatic.
 */
export function isTemplateUpdated(pinnedHash: string, currentHash: string | undefined): boolean {
    return currentHash !== undefined && currentHash !== pinnedHash;
}
