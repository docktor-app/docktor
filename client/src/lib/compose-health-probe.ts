import {isMap, isScalar, parseDocument, type Document, type YAMLMap} from "yaml";

// Pure helpers that read and edit the per-service `x-docktor: health-probe:`
// block (D-01) inside a compose file buffer. Edits go through the yaml
// Document API (never a JSON round-trip) so comments, quoting and unrelated
// keys survive — the same technique server/src/lib/compose-proxy-editor.ts
// uses. Every writer is a no-op (returns the input string untouched) when the
// document cannot be edited safely, so a caller can never corrupt the file.

const X_DOCKTOR_KEY = "x-docktor";
const HEALTH_PROBE_KEY = "health-probe";

export interface HealthProbeValue {
    url: string;
    timeout: number | null;
}

export interface ServiceHealthProbe {
    serviceName: string;
    probe: HealthProbeValue | null;
}

export type HealthProbeRead = {ok: true; services: ServiceHealthProbe[]} | {ok: false};

function xDocktorPath(serviceName: string): string[] {
    return ["services", serviceName, X_DOCKTOR_KEY];
}

function probePath(serviceName: string): string[] {
    return [...xDocktorPath(serviceName), HEALTH_PROBE_KEY];
}

function toProbe(raw: unknown): HealthProbeValue | null {
    if (typeof raw !== "object" || raw === null) {
        return null;
    }
    const {url, timeout} = raw as Record<string, unknown>;
    if (typeof url !== "string") {
        return null;
    }
    return {url, timeout: typeof timeout === "number" ? timeout : null};
}

/**
 * Lists the compose services in document order with their configured probe.
 * `ok: false` means the buffer cannot be edited here: it does not parse, or
 * its `services` key is not a map. A document with no `services` key (or an
 * empty one) is valid and simply has no services yet.
 */
export function readHealthProbes(content: string): HealthProbeRead {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
        return {ok: false};
    }
    if (doc.contents !== null && !isMap(doc.contents)) {
        return {ok: false};
    }

    const servicesNode = doc.get("services", true);
    if (servicesNode === undefined || (isScalar(servicesNode) && servicesNode.value === null)) {
        return {ok: true, services: []};
    }
    if (!isMap(servicesNode)) {
        return {ok: false};
    }

    const services = servicesNode.items.map((pair): ServiceHealthProbe => {
        const serviceName = String(isScalar(pair.key) ? pair.key.value : pair.key);
        const probeNode = doc.getIn(probePath(serviceName), true);
        const probe = isMap(probeNode) ? toProbe(probeNode.toJSON()) : null;
        return {serviceName, probe};
    });
    return {ok: true, services};
}

function isEditableService(doc: Document, serviceName: string): boolean {
    return doc.errors.length === 0 && isMap(doc.getIn(["services", serviceName], true));
}

/** Updates an existing probe map in place so its comments and key order survive. */
function updateProbeMap(probeNode: YAMLMap, probe: HealthProbeValue): void {
    probeNode.set("url", probe.url);
    if (probe.timeout === null) {
        probeNode.delete("timeout");
    } else {
        probeNode.set("timeout", probe.timeout);
    }
}

function getProbeMap(doc: Document, serviceName: string): YAMLMap | null {
    const node = doc.getIn(probePath(serviceName), true);
    return isMap(node) ? node : null;
}

function probeToPlain(probe: HealthProbeValue): Record<string, string | number> {
    return probe.timeout === null ? {url: probe.url} : {url: probe.url, timeout: probe.timeout};
}

/**
 * Writes `services.{serviceName}.x-docktor.health-probe` with the given url
 * and optional timeout. Returns the content unchanged when the YAML does not
 * parse, the service is missing, or `x-docktor` holds something other than a
 * map (writing would have to destroy it).
 */
export function setHealthProbe(content: string, serviceName: string, probe: HealthProbeValue): string {
    const doc = parseDocument(content);
    if (!isEditableService(doc, serviceName)) {
        return content;
    }

    const xNode = doc.getIn(xDocktorPath(serviceName), true);
    const xIsEmpty = xNode === undefined || (isScalar(xNode) && xNode.value === null);
    if (!xIsEmpty && !isMap(xNode)) {
        return content;
    }

    if (xIsEmpty) {
        doc.setIn(xDocktorPath(serviceName), {[HEALTH_PROBE_KEY]: probeToPlain(probe)});
    } else {
        const existing = getProbeMap(doc, serviceName);
        if (existing === null) {
            doc.setIn(probePath(serviceName), probeToPlain(probe));
        } else {
            updateProbeMap(existing, probe);
        }
    }
    return doc.toString({lineWidth: 0});
}

/**
 * Removes the service's `health-probe` key and prunes an `x-docktor` map that
 * the removal left empty. A service without a probe, an unknown service or an
 * unparseable document returns the content unchanged.
 */
export function removeHealthProbe(content: string, serviceName: string): string {
    const doc = parseDocument(content);
    if (doc.errors.length > 0 || !doc.hasIn(probePath(serviceName))) {
        return content;
    }

    doc.deleteIn(probePath(serviceName));

    const xNode = doc.getIn(xDocktorPath(serviceName));
    if (isMap(xNode) && xNode.items.length === 0) {
        doc.deleteIn(xDocktorPath(serviceName));
    }
    return doc.toString({lineWidth: 0});
}
