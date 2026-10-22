import fs from "node:fs/promises";
import path from "node:path";
import type Dockerode from "dockerode";
import type {ComposeProjectResolverPort} from "../application/ports/compose-project-resolver-port.js";
import type {DirectoryIdentityPort} from "../application/ports/directory-identity-port.js";
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import {
    COMPOSE_CONFIG_FILES_LABEL,
    COMPOSE_PROJECT_LABEL,
    COMPOSE_SERVICE_LABEL,
    composeProjectDirectory,
} from "../domain/compose-labels.js";
import {composeProjectName} from "../domain/compose-project-name.js";
import type {ComposeProjectResolution, ProjectContainer} from "../domain/compose-project.js";
import {relateDirectories} from "../domain/directory-identity.js";
import {hasErrorCode} from "../lib/errors.js";
import {dockerodeClient} from "./dockerode-client.js";
import {directoryIdentityResolver} from "./directory-identity-resolver.js";

type Labels = Readonly<Record<string, string>>;

/** How the compose file's directory relates to a container: it does, it does not, or Docktor cannot tell. */
type Membership = "member" | "foreign" | "unknown";

/** The file's text, or null when it does not exist; any other failure propagates. */
async function readTextOrNull(file: string): Promise<string | null> {
    try {
        return await fs.readFile(file, "utf-8");
    } catch (error: unknown) {
        if (hasErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The basenames of the compose files a container's project was started with (`config_files` label). */
function configFileNames(labels: Labels): string[] | null {
    const raw = labels[COMPOSE_CONFIG_FILES_LABEL];
    if (raw === undefined || raw.trim() === "") {
        return null;
    }
    return raw
        .split(",")
        .map((entry) => path.posix.basename(entry.trim().replaceAll("\\", "/")))
        .filter((name) => name !== "");
}

function toProjectContainer(info: Dockerode.ContainerInfo): ProjectContainer {
    const name = info.Names?.[0]?.replace(/^\//, "") ?? info.Id;
    return {
        id: info.Id,
        name,
        service: info.Labels?.[COMPOSE_SERVICE_LABEL] ?? null,
        running: info.State === "running",
        mounts: (info.Mounts ?? []).map((mount) => ({
            type: mount.Type,
            name: mount.Name,
            source: mount.Source,
            destination: mount.Destination,
        })),
    };
}

/**
 * Finds the compose project Docker actually runs for an external compose file
 * (#102) from the labels of its containers, matched by directory identity (the
 * same rule as {@link StackContainerMatcher}). Without a container the name is
 * predicted from the files. Nothing here throws for a Docker or mount problem
 * on `resolve`: it answers `unresolved` with the reason.
 */
export class ComposeProjectResolver implements ComposeProjectResolverPort {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "listContainers"> = dockerodeClient,
        private readonly directories: Pick<DirectoryIdentityPort, "identifyLocal" | "identifyLabel"> = directoryIdentityResolver,
        private readonly readText: (file: string) => Promise<string | null> = readTextOrNull,
    ) {}

    async resolve(composePath: string): Promise<ComposeProjectResolution> {
        let all: Dockerode.ContainerInfo[];
        try {
            all = await this.docker.listContainers(true);
        } catch (error: unknown) {
            return {kind: "unresolved", reason: `Docker could not be queried: ${errorMessage(error)}`};
        }
        const candidates = all.filter((info) => info.Labels?.[COMPOSE_PROJECT_LABEL] && composeProjectDirectory(info.Labels) !== null);
        const memberships = await Promise.all(candidates.map((info) => this.membership(composePath, info.Labels, true)));
        if (memberships.includes("unknown")) {
            return {
                kind: "unresolved",
                reason: "Docktor could not determine which host directories its own mounts cover, so it cannot match the running containers to this compose file",
            };
        }
        const members = candidates.filter((_info, index) => memberships[index] === "member");
        const names = [...new Set(members.map((info) => info.Labels[COMPOSE_PROJECT_LABEL] ?? ""))];
        if (names.length > 1) {
            return {
                kind: "unresolved",
                reason: `containers of several compose projects (${names.map((name) => `"${name}"`).join(", ")}) run this compose file`,
            };
        }
        const [name] = names;
        if (name !== undefined) {
            return {kind: "resolved", project: {name, source: "containers", containers: members.map(toProjectContainer)}};
        }
        return this.predictFromFiles(composePath);
    }

    async listContainers(project: string, composePath: string): Promise<readonly ProjectContainer[]> {
        const all = await this.docker.listContainers(true);
        const ofProject = all.filter((info) => info.Labels?.[COMPOSE_PROJECT_LABEL] === project);
        const memberships = await Promise.all(ofProject.map((info) => this.membership(composePath, info.Labels, false)));
        return ofProject.filter((_info, index) => memberships[index] !== "foreign").map(toProjectContainer);
    }

    /**
     * Whether the container was started from `composePath`'s directory. Without a
     * directory label the project rule applies (member) unless the caller needs
     * proof (`requireLabel`); unknown mounts cannot prove anything.
     */
    private async membership(composePath: string, labels: Labels, requireLabel: boolean): Promise<Membership> {
        const directory = composeProjectDirectory(labels);
        if (directory === null) {
            return requireLabel ? "foreign" : "member";
        }
        const [own, theirs] = await Promise.all([
            this.directories.identifyLocal(path.dirname(composePath)),
            this.directories.identifyLabel(directory),
        ]);
        if (!own.mountsKnown || !theirs.mountsKnown) {
            return "unknown";
        }
        if (relateDirectories(own, theirs) !== "same") {
            return "foreign";
        }
        const names = configFileNames(labels);
        return names === null || names.includes(path.basename(composePath)) ? "member" : "foreign";
    }

    private async predictFromFiles(composePath: string): Promise<ComposeProjectResolution> {
        const directory = path.dirname(composePath);
        let composeContent: string | null;
        let envContent: string | null;
        try {
            composeContent = await this.readText(composePath);
            envContent = await this.readText(path.join(directory, ".env"));
        } catch (error: unknown) {
            return {kind: "unresolved", reason: `the compose files could not be read: ${errorMessage(error)}`};
        }
        if (composeContent === null) {
            return {kind: "unresolved", reason: "the compose file could not be read"};
        }
        const {name} = composeProjectName({composeContent, envContent, directoryName: path.basename(directory)});
        if (name === "") {
            return {kind: "unresolved", reason: "no compose project name can be derived from the compose file or its directory"};
        }
        return {kind: "resolved", project: {name, source: "files", containers: []}};
    }
}

export const composeProjectResolver = new ComposeProjectResolver();
