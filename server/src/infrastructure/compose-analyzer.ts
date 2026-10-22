import {parse as parseYaml} from "yaml";
import type {ComposeAnalyzerPort} from "../application/ports/compose-analyzer-port.js";
import {BadRequestError} from "../lib/errors.js";

// Matches a whole-value shell-style variable reference: "${VAR}" or "$VAR",
// optionally with a default ("${VAR:-default}"). A value that IS one of these
// is a pass-through from the host/.env, not a hardcoded inline literal.
const VARIABLE_REFERENCE_PATTERN = /^\$(\{[A-Za-z_][A-Za-z0-9_]*(:?[-?+][^}]*)?\}|[A-Za-z_][A-Za-z0-9_]*)$/;

/** Shared with ComposeRewriter so both agree on what counts as an inline literal. */
export function isVariableReference(value: string): boolean {
    return VARIABLE_REFERENCE_PATTERN.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `services` mapping of a compose document; anything that is not a mapping counts as no services. */
function servicesOf(doc: unknown): Record<string, unknown> {
    return isRecord(doc) && isRecord(doc.services) ? doc.services : {};
}

export type CompatibilityLevel = "green" | "yellow" | "red";

export interface BindMountInfo {
    path: string;
    type: "relative" | "absolute";
    serviceName: string;
    containerPath: string;
    // Position of this entry within the service's own volumes[] list (Issue
    // #20/D-12) — lets a compose-rule finding point the review dialog at the
    // exact list item, not just the service.
    index: number;
}

export interface AnalysisResult {
    compatibility: CompatibilityLevel;
    namedVolumes: string[];
    bindMounts: BindMountInfo[];
    inlineEnvVars: {serviceName: string; vars: Record<string, string>}[];
    unsupportedFeatures: string[];
    serviceCount: number;
}

export class ComposeAnalyzer implements ComposeAnalyzerPort {
    analyzeCompatibility(content: string): AnalysisResult {
        const doc = this.parse(content);

        const namedVolumes = this.extractNamedVolumes(doc);
        const bindMounts = this.extractBindMounts(doc);
        const inlineEnvVars = this.extractInlineEnvVars(doc);
        const unsupportedFeatures = this.detectUnsupportedFeatures(doc);
        const serviceCount = Object.keys(servicesOf(doc)).length;

        let compatibility: CompatibilityLevel = "green";

        // Red: unsupported features (configs, secrets, depends_on conditions)
        if (unsupportedFeatures.length > 0) {
            compatibility = "red";
        }
        // Yellow: named volumes, absolute paths, or inline env vars
        else if (
            namedVolumes.length > 0 ||
            bindMounts.some((m) => m.type === "absolute") ||
            inlineEnvVars.length > 0
        ) {
            compatibility = "yellow";
        }

        return {
            compatibility,
            namedVolumes,
            bindMounts,
            inlineEnvVars,
            unsupportedFeatures,
            serviceCount,
        };
    }

    /** A document that does not parse is a client error, not a crash. */
    private parse(content: string): unknown {
        try {
            return parseYaml(content);
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new BadRequestError(`The compose file is not valid YAML: ${reason}`, {cause: error});
        }
    }

    extractNamedVolumes(doc: unknown): string[] {
        if (!isRecord(doc) || !isRecord(doc.volumes)) return [];
        return Object.keys(doc.volumes);
    }

    extractBindMounts(doc: unknown): BindMountInfo[] {
        const results: BindMountInfo[] = [];

        for (const [serviceName, service] of Object.entries(servicesOf(doc))) {
            if (!isRecord(service) || !Array.isArray(service.volumes)) continue;

            service.volumes.forEach((vol: unknown, index: number) => {
                const mount = this.parseVolumeEntry(vol, serviceName, index);
                if (mount) results.push(mount);
            });
        }

        return results;
    }

    /**
     * Parses a single volumes[] entry, in either short form ("host:container")
     * or long form ({type, source, target}). Returns null for entries that
     * aren't host bind mounts (named-volume references in either form).
     * `index` is this entry's position in the service's own volumes[] list
     * (Issue #20/D-12), preserved on the result even though some entries in
     * that same list are skipped (named-volume references).
     */
    private parseVolumeEntry(vol: unknown, serviceName: string, index: number): BindMountInfo | null {
        if (typeof vol === "string") {
            if (!vol.includes(":")) return null;
            const [hostPath, containerPath] = vol.split(":");
            // Skip named volume references (no /, . or ~ prefix)
            if (!hostPath.startsWith(".") && !hostPath.startsWith("/") && !hostPath.startsWith("~")) return null;
            return {
                path: hostPath,
                // "~"-prefixed (home-relative) paths are outside any stack
                // directory by definition, same bucket as an absolute path.
                type: hostPath.startsWith("/") || hostPath.startsWith("~") ? "absolute" : "relative",
                serviceName,
                containerPath,
                index,
            };
        }

        if (isRecord(vol)) {
            const source = vol.source;
            if (vol.type !== "bind" || typeof source !== "string") return null;
            return {
                path: source,
                type: source.startsWith("/") || source.startsWith("~") ? "absolute" : "relative",
                serviceName,
                containerPath: typeof vol.target === "string" ? vol.target : "",
                index,
            };
        }

        return null;
    }

    extractInlineEnvVars(doc: unknown): {serviceName: string; vars: Record<string, string>}[] {
        const results: {serviceName: string; vars: Record<string, string>}[] = [];

        for (const [serviceName, service] of Object.entries(servicesOf(doc))) {
            const env = isRecord(service) ? service.environment : undefined;

            // List form: "KEY=value" entries. A bare "KEY" (no "=") is a
            // pass-through of the host's own env var, not inline; "KEY=${VAR}"
            // is likewise a pass-through. Only "KEY=literal" counts as inline
            // — this is new in Issue #20/D-12 (the compose-rule engine's
            // inlineEnv check); the brownfield-adopt flow (BF-02) now also
            // classifies these cases as yellow, matching its own "inline env"
            // rule rather than silently skipping list-form env entirely.
            if (Array.isArray(env)) {
                const vars: Record<string, string> = {};
                for (const entry of env) {
                    if (typeof entry !== "string") continue;
                    const eqIndex = entry.indexOf("=");
                    if (eqIndex === -1) continue;
                    const key = entry.slice(0, eqIndex);
                    const value = entry.slice(eqIndex + 1);
                    if (isVariableReference(value)) continue;
                    vars[key] = value;
                }
                if (Object.keys(vars).length > 0) {
                    results.push({serviceName, vars});
                }
                continue;
            }

            // Object form is inline, except when a value is itself a variable
            // reference (${VAR} or $VAR) rather than a literal — that's a
            // pass-through from the host/.env, not a hardcoded inline value.
            if (isRecord(env)) {
                const vars: Record<string, string> = {};
                for (const [key, value] of Object.entries(env)) {
                    const strValue = String(value);
                    if (isVariableReference(strValue)) continue;
                    vars[key] = strValue;
                }
                if (Object.keys(vars).length > 0) {
                    results.push({serviceName, vars});
                }
            }
        }

        return results;
    }

    private detectUnsupportedFeatures(doc: unknown): string[] {
        const features: string[] = [];

        if (isRecord(doc) && doc.configs) features.push("configs");
        if (isRecord(doc) && doc.secrets) features.push("secrets");

        for (const [serviceName, service] of Object.entries(servicesOf(doc))) {
            const deps = isRecord(service) ? service.depends_on : undefined;

            // Object form with conditions is unsupported
            if (isRecord(deps)) {
                for (const [depName, depConfig] of Object.entries(deps)) {
                    if (isRecord(depConfig) && depConfig.condition) {
                        features.push(`depends_on condition (${serviceName} -> ${depName})`);
                    }
                }
            }
        }

        return features;
    }
}

export const composeAnalyzer = new ComposeAnalyzer();
