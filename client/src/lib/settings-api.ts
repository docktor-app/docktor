import {apiFetch} from "./api";
import type {ComposeCheckSettings, GeneralSettings, GeneralSettingsUpdate, HealthSettings} from "@docktor/shared";

export type {GeneralSettings, GeneralSettingsUpdate};

export async function getGeneralSettings(): Promise<GeneralSettings> {
    return apiFetch<GeneralSettings>("/api/settings/general");
}

export async function updateGeneralSettings(data: GeneralSettingsUpdate): Promise<GeneralSettings> {
    return apiFetch<GeneralSettings>("/api/settings/general", {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

// D-04/D-10: the skip-review toggle plus each configurable compose-check's
// enable flag — backed by server/src/routes/settings.ts's
// GET/PUT /api/settings/compose-checks (12-05).
export async function getComposeCheckSettings(): Promise<ComposeCheckSettings> {
    return apiFetch<ComposeCheckSettings>("/api/settings/compose-checks");
}

export async function saveComposeCheckSettings(data: ComposeCheckSettings): Promise<ComposeCheckSettings> {
    return apiFetch<ComposeCheckSettings>("/api/settings/compose-checks", {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

// D-10: the global health-history retention window (1-365 days, default 30) —
// backed by GET/PUT /api/settings/health (14-04). PUT returns the saved value.
export async function getHealthSettings(): Promise<HealthSettings> {
    return apiFetch<HealthSettings>("/api/settings/health");
}

export async function saveHealthSettings(data: HealthSettings): Promise<HealthSettings> {
    return apiFetch<HealthSettings>("/api/settings/health", {
        method: "PUT",
        body: JSON.stringify(data),
    });
}
