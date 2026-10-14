import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import type {SelfStackPort} from "../application/ports/self-stack-port.js";
import {ownComposeFileCandidates, type ContainerMount} from "../domain/self-stack-paths.js";
import {dockerodeClient} from "./dockerode-client.js";
import {createDefaultSelf, type SelfContainer} from "./probe-transport.js";

const CONFIG_FILES_LABEL = "com.docker.compose.project.config_files";
const WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";

// A frozen dockerd must never be able to hang an import scan: past this the
// lookup is abandoned and every stack is listed (D-02).
const SELF_INSPECT_TIMEOUT_MS = 5000;

/**
 * Finds the compose file Docktor's own container was started from by
 * inspecting that container (#13, STK-03, D-01). Fail-open (D-02): any
 * problem, from "not containerized" to a rejected or timed-out inspect,
 * yields an empty list so the scan lists every stack.
 */
export class DockerSelfStack implements SelfStackPort {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "inspectContainer"> = dockerodeClient,
        private readonly self: SelfContainer = createDefaultSelf(),
    ) {}

    async composeFilePaths(): Promise<readonly string[]> {
        try {
            const containerId = await this.self.containerId();
            if (containerId === null) {
                return [];
            }

            const info = await this.docker.inspectContainer(
                containerId,
                AbortSignal.timeout(SELF_INSPECT_TIMEOUT_MS),
            );
            const labels = info.Config?.Labels;
            const mounts: ContainerMount[] = (info.Mounts ?? []).map((mount) => ({
                type: mount.Type,
                source: mount.Source,
                destination: mount.Destination,
            }));

            return ownComposeFileCandidates(labels?.[CONFIG_FILES_LABEL], labels?.[WORKING_DIR_LABEL], mounts);
        } catch (error) {
            // Message only: label values and other inspect data stay out of the log (T-18-01).
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DockerSelfStack] could not identify Docktor's own stack, every stack will be listed: ${message}`);
            return [];
        }
    }
}

export const dockerSelfStack = new DockerSelfStack();
