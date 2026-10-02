import type {
    ComposeRuleId,
    CreateStackInput,
    CreateStackPreviewInput,
    StackChangePreviewInput,
    UpdateStackInput,
} from "@docktor/shared";
import {apiFetch} from "./api";

export interface Stack {
    id: string;
    displayName: string;
    description: string | null;
    hostPath: string;
    status: string;
    configChanged: boolean;
    configError: string | null;
    lastKnownHash: string | null;
    backupSchedule: string | null;
    isProtected: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Service {
    id: string;
    stackId: string;
    serviceName: string;
    image: string;
    imageTag: string | null;
    ports: string | null;
    volumes: string | null;
    containerId: string | null;
    containerState: string | null;
    healthStatus: string | null;
    updateAvailable?: boolean;
    latestTag?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface StackWithServices extends Stack {
    services: Service[];
}

export interface StackDetail extends StackWithServices {
    deployments: {
        id: string;
        composeHash: string;
        deployedAt: string;
        success: boolean;
        errorMessage: string | null;
    }[];
    statusLogs: {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        message: string | null;
        createdAt: string;
    }[];
}

export type StackEventType = "config_changed" | "config_error" | "update_available";

export interface StackEvent {
    id: string;
    type: StackEventType;
    message: string | null;
    payload: string | null;
    createdAt: string;
}

export function listStacks() {
    return apiFetch<StackWithServices[]>("/api/stacks");
}

export function getStack(id: string) {
    return apiFetch<StackDetail>(`/api/stacks/${id}`);
}

export function createStack(input: CreateStackInput) {
    return apiFetch<StackWithServices>("/api/stacks", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function updateStack(id: string, input: UpdateStackInput) {
    return apiFetch<StackDetail>(`/api/stacks/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

// Issue #18/D-01: mirrors server/src/lib/unified-diff.ts's exported shapes —
// kept as a separate client-side declaration (not an @docktor/shared import)
// since these are plain data shapes, not validated input, and the server
// module isn't part of the shared package.
export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
    readonly kind: DiffLineKind;
    readonly text: string;
    readonly oldLine: number | null;
    readonly newLine: number | null;
}

export interface DiffHunk {
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: readonly DiffLine[];
}

export interface UnifiedDiff {
    readonly hunks: readonly DiffHunk[];
    readonly added: number;
    readonly removed: number;
}

// Issue #20/D-03/D-11: mirrors server/src/application/ports/compose-rule-engine-port.ts's
// ComposeFinding — kept as a separate client-side declaration for the same
// reason as the diff shapes above (plain data, not validated input).
export interface ComposeFinding {
    readonly ruleId: ComposeRuleId;
    readonly severity: "danger" | "warning";
    readonly message: string;
    readonly serviceName: string | null;
    readonly path: ReadonlyArray<string | number>;
    readonly line: number | null;
}

// Mirrors compose-review-service.ts's ReviewFinding — a finding plus
// whether this specific edit/create introduced it.
export interface ReviewFinding extends ComposeFinding {
    readonly introduced: boolean;
}

export interface StackChangePreview {
    readonly hasChanges: boolean;
    readonly confirmationRequired: boolean;
    readonly compose: UnifiedDiff | null;
    readonly env: UnifiedDiff | null;
    // Optional on the client type (unlike the server's always-present
    // response field) so a test/mock literal written before plan 12-05
    // still type-checks without needing every new field — DiffConfirmDialog
    // treats an absent findings/composeParseError the same as an empty one.
    readonly findings?: ReadonlyArray<ReviewFinding>;
    readonly composeParseError?: string | null;
}

// Issue #18/D-01/D-03: read-only preview of a compose/env edit against
// what's currently on disk — never writes anything. The only write path
// remains updateStack() above, which the server rejects with a 428
// (ConfirmationRequiredError) unless `confirmed: true` is sent after review.
export function previewStackChange(id: string, change: StackChangePreviewInput) {
    return apiFetch<StackChangePreview>(`/api/stacks/${id}/preview`, {
        method: "POST",
        body: JSON.stringify(change),
    });
}

// Issue #20/D-02: the create-flow analog of StackChangePreview — no diff
// (nothing on disk to diff against yet).
export interface NewStackPreview {
    readonly confirmationRequired: boolean;
    readonly findings: ReadonlyArray<ReviewFinding>;
    readonly composeParseError: string | null;
}

// Issue #20/D-02: read-only findings-only preview for the create flow —
// never writes anything. The only write path remains createStack() above,
// which the server rejects with a 428 unless `confirmed: true` is sent.
export function previewNewStack(input: CreateStackPreviewInput) {
    return apiFetch<NewStackPreview>("/api/stacks/preview", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function deleteStack(id: string) {
    return apiFetch<void>(`/api/stacks/${id}`, {method: "DELETE"});
}

export function deployStack(id: string) {
    return apiFetch<{success: boolean; errorMessage?: string}>(
        `/api/stacks/${id}/deploy`,
        {method: "POST"},
    );
}

export function stopStack(id: string) {
    return apiFetch<{success: boolean}>(`/api/stacks/${id}/stop`, {
        method: "POST",
    });
}

export function restartStack(id: string) {
    return apiFetch<{success: boolean}>(`/api/stacks/${id}/restart`, {
        method: "POST",
    });
}

export function getComposeContent(id: string) {
    return apiFetch<{content: string}>(`/api/stacks/${id}/compose`);
}

export function getEnvContent(id: string) {
    return apiFetch<{content: string}>(`/api/stacks/${id}/env`);
}

export function updateImages(id: string) {
    return apiFetch<{success: boolean; noUpdates: boolean}>(`/api/stacks/${id}/update`, {
        method: "POST",
    });
}

export interface ServiceTagsResponse {
    currentTag: string;
    latestTag: string | null;
    candidates: string[];
}

export interface UpgradeServiceResponse {
    success: boolean;
    changed: boolean;
    previousTag: string | null;
    newTag: string;
}

export function getServiceTags(stackId: string, serviceName: string) {
    return apiFetch<ServiceTagsResponse>(
        `/api/stacks/${encodeURIComponent(stackId)}/services/${encodeURIComponent(serviceName)}/tags`,
    );
}

export function upgradeService(stackId: string, serviceName: string, targetTag: string) {
    return apiFetch<UpgradeServiceResponse>(
        `/api/stacks/${encodeURIComponent(stackId)}/services/${encodeURIComponent(serviceName)}/upgrade`,
        {
            method: "POST",
            body: JSON.stringify({targetTag}),
        },
    );
}

// getStackEvents forwards limit as a query parameter only when supplied, so
// the server's own default (20) governs when the caller omits it.
export function getStackEvents(stackId: string, limit?: number) {
    const query = limit !== undefined ? `?limit=${limit}` : "";
    return apiFetch<StackEvent[]>(
        `/api/stacks/${encodeURIComponent(stackId)}/events${query}`,
    );
}
