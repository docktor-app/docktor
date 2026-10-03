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
