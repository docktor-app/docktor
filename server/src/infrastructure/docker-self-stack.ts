import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import type {OwnMountsPort} from "../application/ports/own-mounts-port.js";
import type {SelfStackPort} from "../application/ports/self-stack-port.js";
import type {OwnMountsView} from "../domain/bind-mount-sources.js";
import {ownComposeFileCandidates, type ContainerMount} from "../domain/self-stack-paths.js";
import {dockerodeClient} from "./dockerode-client.js";
import {createDefaultSelf, type SelfContainer} from "./probe-transport.js";

const CONFIG_FILES_LABEL = "com.docker.compose.project.config_files";
const WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";

// A frozen dockerd must never be able to hang an import scan: past this the
// lookup is abandoned and every stack is listed (D-02).
const SELF_INSPECT_TIMEOUT_MS = 5000;

/** What the single self-inspect step yields; `null` when Docktor is not containerized. */
interface SelfInspection {
    readonly labels: Readonly<Record<string, string>> | undefined;
    readonly mounts: readonly ContainerMount[];
}

/**
 * Inspects Docktor's own container (#13, STK-03, D-01; CR-03). Serves two
 * ports from the same inspect:
 * - {@link SelfStackPort}: the compose file Docktor was started from.
 *   Fail-open (D-02): any problem, from "not containerized" to a rejected or
 *   timed-out inspect, yields an empty list so the scan lists every stack.
 * - {@link OwnMountsPort}: which host paths Docktor can read, through its own
 *   bind mounts.
 */
export class DockerSelfStack implements SelfStackPort, OwnMountsPort {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "inspectContainer"> = dockerodeClient,
        private readonly self: SelfContainer = createDefaultSelf(),
    ) {}

    async composeFilePaths(): Promise<readonly string[]> {
        try {
            const inspection = await this.inspectSelf();
            if (inspection === null) {
                return [];
            }
            const {labels, mounts} = inspection;
            return ownComposeFileCandidates(labels?.[CONFIG_FILES_LABEL], labels?.[WORKING_DIR_LABEL], mounts);
        } catch (error) {
            // Message only: label values and other inspect data stay out of the log (T-18-01).
            console.warn(`[DockerSelfStack] could not identify Docktor's own stack, every stack will be listed: ${errorMessage(error)}`);
            return [];
        }
    }

    async ownMounts(): Promise<OwnMountsView> {
        try {
            const inspection = await this.inspectSelf();
            return inspection === null ? {kind: "host"} : {kind: "container", mounts: inspection.mounts};
        } catch (error) {
            // Message only: mount sources and labels stay out of the log (T-18-01).
            console.warn(`[DockerSelfStack] could not read Docktor's own mounts: ${errorMessage(error)}`);
            return {kind: "unknown"};
        }
    }

    private async inspectSelf(): Promise<SelfInspection | null> {
        const containerId = await this.self.containerId();
        if (containerId === null) {
            return null;
        }

        const info = await this.docker.inspectContainer(containerId, AbortSignal.timeout(SELF_INSPECT_TIMEOUT_MS));
        return {
            labels: info.Config?.Labels,
            mounts: (info.Mounts ?? []).map((mount) => ({
                type: mount.Type,
                source: mount.Source,
                destination: mount.Destination,
            })),
        };
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export const dockerSelfStack = new DockerSelfStack();
