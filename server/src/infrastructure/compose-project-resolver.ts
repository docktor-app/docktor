import type {ComposeProjectResolverPort} from "../application/ports/compose-project-resolver-port.js";
import type {ComposeProjectResolution, ProjectContainer} from "../domain/compose-project.js";

export class ComposeProjectResolver implements ComposeProjectResolverPort {
    resolve(_composePath: string): Promise<ComposeProjectResolution> {
        return Promise.resolve({kind: "unresolved", reason: "not implemented"});
    }

    listContainers(_project: string, _composePath: string): Promise<readonly ProjectContainer[]> {
        return Promise.resolve([]);
    }
}

export const composeProjectResolver = new ComposeProjectResolver();
