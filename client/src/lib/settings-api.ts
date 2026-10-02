import {apiFetch} from "./api";
import type {ComposeCheckSettings, GeneralSettings, GeneralSettingsUpdate} from "@docktor/shared";

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
