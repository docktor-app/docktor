import type {CreateStackInput} from "@docktor/shared";
import {apiFetch} from "./api";

// Issue #19/D-06/D-07: mirrors server/src/application/template-service.ts's
// TemplateRepoView/TemplateSummaryView/TemplateVariantSummaryView/
// TemplateCatalog/TemplateVariantView response shapes (12-07) — kept as a
// separate client-side declaration (not an @docktor/shared import) since
// these are plain response data, not validated request input; Date fields
// serialize to ISO strings over JSON.

export interface TemplateIssue {
    readonly path: string;
    readonly message: string;
}

export interface TemplateRepoStatus {
    readonly id: string;
    readonly url: string;
    readonly isDefault: boolean;
    readonly headCommitSha: string | null;
    readonly lastSyncAttemptAt: string | null;
    readonly lastSyncedAt: string | null;
    readonly lastSyncError: string | null;
    readonly issues: ReadonlyArray<TemplateIssue>;
}

export interface TemplateVariantSummary {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string;
}

export interface TemplateSummary {
    readonly id: string;
    readonly repoId: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string;
    readonly category: string;
    readonly iconDataUri: string | null;
    readonly variants: ReadonlyArray<TemplateVariantSummary>;
}

export interface TemplateCatalog {
    readonly repos: ReadonlyArray<TemplateRepoStatus>;
    readonly templates: ReadonlyArray<TemplateSummary>;
}

export interface TemplateVariantDetail {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string;
    readonly usage: string | null;
    readonly composeContent: string;
    readonly envContent: string | null;
    readonly contentHash: string;
    readonly template: {readonly id: string; readonly slug: string; readonly name: string};
    readonly repo: {readonly id: string; readonly url: string; readonly headCommitSha: string | null};
}

export function listTemplates() {
    return apiFetch<TemplateCatalog>("/api/templates");
}

export function getTemplateVariant(variantId: string) {
    return apiFetch<TemplateVariantDetail>(`/api/templates/variants/${encodeURIComponent(variantId)}`);
}

// Issue #19/D-08/threat #2: forwards to the single create path
// (TemplateService.createStackFromVariant -> StackService.createStack), so a
// template-sourced compose gets the exact same compose-check/428-confirmation
// gate as a pasted one.
export function createStackFromTemplate(variantId: string, input: CreateStackInput) {
    return apiFetch<{id: string}>(`/api/templates/variants/${encodeURIComponent(variantId)}/stacks`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function syncTemplateRepo(repoId: string) {
    return apiFetch<TemplateRepoStatus>(`/api/template-repos/${encodeURIComponent(repoId)}/sync`, {
        method: "POST",
    });
}
