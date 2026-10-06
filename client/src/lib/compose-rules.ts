import type {ComposeRuleId} from "@docktor/shared";
import type {Tone} from "@/components/common/tone-badge";

// Issue #20/D-11/UI-SPEC Copywriting Contract: short, scannable, no
// punctuation badge copy, one per compose-check rule id.
export const COMPOSE_RULE_LABELS: Record<ComposeRuleId, string> = {
    privileged: "Privileged container",
    dockerSocket: "Docker socket mounted",
    bindOutsideStack: "Bind mount outside stack directory",
    namedVolume: "Named volume",
    inlineEnv: "Inline environment variable",
    missingEnvFile: ".env not referenced",
};

// Issue #20/D-11/UI-SPEC Copywriting Contract: one sentence each — what it
// means and why it's flagged, mirroring compatibility-badge.tsx's tooltip
// style. The privileged sentence is the UI-SPEC's own example, verbatim.
export const COMPOSE_RULE_EXPLANATIONS: Record<ComposeRuleId, string> = {
    privileged:
        "This service has `privileged: true`, granting it full access to the host. Confirm this is intentional before applying.",
    dockerSocket:
        "This service mounts the Docker socket, giving it the same level of control over the host as root. Confirm this is intentional before applying.",
    bindOutsideStack:
        "This bind mount points outside the stack's own directory, so Docktor's backups and migrations won't capture it. Confirm this is intentional before applying.",
    namedVolume:
        "This service uses a named Docker volume instead of a bind mount — Docktor's convention is bind mounts under ./volumes/, which its backup system covers.",
    inlineEnv:
        "This service has an environment variable value written directly in the compose file instead of the .env file, which is easy to leak through version control or logs.",
    missingEnvFile:
        "This service has no env_file entry, so variables in the stack's .env file are not passed into its container.",
};

/** D-11: "danger" (always-on) renders red; "warning" (configurable) renders yellow. */
export function composeFindingTone(severity: "danger" | "warning"): Tone {
    return severity === "danger" ? "red" : "yellow";
}
