import os from "node:os";
import path from "node:path";
import {isAllowedGitRemoteUrl} from "@docktor/shared";

// D-05: the default template source Docktor ships configured with out of the
// box (#19 "default repo configured out of the box") — seeded as an ordinary
// isDefault TemplateRepo row on first browse/sync, never a special-cased URL
// read from a setting (assumption-delta Signal 1).
export const OFFICIAL_TEMPLATE_REPO_URL = "https://github.com/docktor-app/templates";

/**
 * Resolves the default template repository URL. Unset env var -> the
 * official repo. Empty string -> null (disables the default repo entirely,
 * e.g. for air-gapped installs or tests). Any other value is validated
 * against the same allowlist GitExecutor re-checks before spawning a
 * process; an invalid override is logged and treated as "no default repo"
 * rather than silently falling back to the official URL (a misconfigured
 * override must not pretend to succeed).
 */
export function getDefaultTemplateRepoUrl(): string | null {
    const raw = process.env.DOCKTOR_DEFAULT_TEMPLATE_REPO_URL;
    if (raw === undefined) return OFFICIAL_TEMPLATE_REPO_URL;
    if (raw === "") return null;
    if (isAllowedGitRemoteUrl(raw)) return raw;
    console.warn(
        `[template-config] DOCKTOR_DEFAULT_TEMPLATE_REPO_URL is not a usable git remote URL (${raw}) — no default template repo will be configured`,
    );
    return null;
}

/**
 * Disposable clone-cache root: the parsed template index lives in the
 * database, so a lost/cleared cache directory is simply re-cloned on the
 * next sync.
 */
export function getTemplateCacheDir(): string {
    return process.env.DOCKTOR_TEMPLATE_CACHE_DIR ?? path.join(os.tmpdir(), "docktor-template-cache");
}
