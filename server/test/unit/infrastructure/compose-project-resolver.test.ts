import type Dockerode from "dockerode";
import {describe, expect, it, vi} from "vitest";
import type {DirectoryIdentity} from "../../../src/domain/directory-identity.js";
import {ComposeProjectResolver} from "../../../src/infrastructure/compose-project-resolver.js";

const COMPOSE_PATH = "/srv/app/docker-compose.yml";
const PLAIN_COMPOSE = "services:\n  web:\n    image: nginx\n";

type ContainerLabels = Record<string, string>;

function labelled(project: string, extra: ContainerLabels = {}): ContainerLabels {
    return {
        "com.docker.compose.project": project,
        "com.docker.compose.service": "web",
        "com.docker.compose.project.working_dir": "/srv/app",
        "com.docker.compose.project.config_files": "/srv/app/docker-compose.yml",
        ...extra,
    };
}

function info(name: string, labels: ContainerLabels, overrides: Partial<Dockerode.ContainerInfo> = {}): Dockerode.ContainerInfo {
    // Only the fields the resolver reads are filled in; the rest of ContainerInfo is irrelevant here.
    return {
        Id: `id-${name}`,
        Names: [`/${name}`],
        Labels: labels,
        State: "running",
        Mounts: [],
        ...overrides,
    } as Dockerode.ContainerInfo;
}

/** A directories fake: an identity per spelling; spellings mapped to the same key are the same directory. */
function directoriesFake(options: {mountsKnown?: boolean; sameAs?: ReadonlyMap<string, string>} = {}) {
    const identity = (directory: string): DirectoryIdentity => ({
        keys: [`host:${options.sameAs?.get(directory) ?? directory}`],
        mountsKnown: options.mountsKnown ?? true,
    });
    return {
        identifyLocal: vi.fn((directory: string) => Promise.resolve(identity(directory))),
        identifyLabel: vi.fn((directory: string) => Promise.resolve(identity(directory))),
    };
}

function build(
    containers: readonly Dockerode.ContainerInfo[] | Error,
    directories = directoriesFake(),
    files: Record<string, string> = {[COMPOSE_PATH]: PLAIN_COMPOSE},
) {
    const docker = {
        listContainers: vi.fn(() =>
            containers instanceof Error ? Promise.reject(containers) : Promise.resolve([...containers]),
        ),
    };
    const readText = vi.fn((file: string) => Promise.resolve(files[file] ?? null));
    return {resolver: new ComposeProjectResolver(docker, directories, readText), docker, directories};
}

describe("ComposeProjectResolver.resolve (#102)", () => {
    it("resolves the project label of containers that run from the compose file's directory", async () => {
        const {resolver} = build([
            info("other-web-1", labelled("other")),
            info("other-db-1", labelled("other", {"com.docker.compose.service": "db"}), {State: "exited"}),
        ]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind).toBe("resolved");
        if (resolution.kind !== "resolved") {
            return;
        }
        expect(resolution.project.name).toBe("other");
        expect(resolution.project.source).toBe("containers");
        expect(resolution.project.containers.map((container) => [container.name, container.service, container.running])).toEqual([
            ["other-web-1", "web", true],
            ["other-db-1", "db", false],
        ]);
    });

    it("marks restarting and paused containers as active although they do not count as running (WR-02)", async () => {
        const {resolver} = build([
            info("other-web-1", labelled("other"), {State: "restarting"}),
            info("other-db-1", labelled("other", {"com.docker.compose.service": "db"}), {State: "paused"}),
            info("other-job-1", labelled("other", {"com.docker.compose.service": "job"}), {State: "exited"}),
        ]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        if (resolution.kind !== "resolved") {
            throw new Error("expected a resolved project");
        }
        expect(
            resolution.project.containers.map((container) => [container.name, container.running, container.restartingOrPaused]),
        ).toEqual([
            ["other-web-1", false, true],
            ["other-db-1", false, true],
            ["other-job-1", false, false],
        ]);
    });

    it("lists all containers, including stopped ones", async () => {
        const {resolver, docker} = build([]);

        await resolver.resolve(COMPOSE_PATH);

        expect(docker.listContainers).toHaveBeenCalledWith(true);
    });

    it("maps the recorded mounts of a container", async () => {
        const mount = {Type: "bind", Source: "/home/alice/data", Destination: "/var/lib/data"};
        const {resolver} = build([info("other-web-1", labelled("other"), {Mounts: [mount] as Dockerode.ContainerInfo["Mounts"]})]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.containers[0]?.mounts).toEqual([
            {type: "bind", name: undefined, source: "/home/alice/data", destination: "/var/lib/data"},
        ]);
    });

    it("recognises the directory by identity, not by string comparison", async () => {
        const sameAs = new Map([["/host/srv/app", "/srv/app"]]);
        const {resolver} = build(
            [info("other-web-1", labelled("other", {"com.docker.compose.project.working_dir": "/host/srv/app"}))],
            directoriesFake({sameAs}),
        );

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.name).toBe("other");
    });

    it("ignores containers of another directory with the same project name", async () => {
        const {resolver} = build([
            info("app-web-1", labelled("app", {"com.docker.compose.project.working_dir": "/srv/elsewhere"})),
        ]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.source).toBe("files");
    });

    it("ignores containers of another compose file in the same directory", async () => {
        const {resolver} = build([
            info("prod-web-1", labelled("prod", {"com.docker.compose.project.config_files": "/srv/app/compose.prod.yml"})),
        ]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.source).toBe("files");
    });

    it("accepts a container that lists the compose file among several config files", async () => {
        const {resolver} = build([
            info(
                "other-web-1",
                labelled("other", {
                    "com.docker.compose.project.config_files": "/srv/app/compose.override.yml,/srv/app/docker-compose.yml",
                }),
            ),
        ]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.name).toBe("other");
    });

    it("predicts the name from the files when no container belongs to the compose file", async () => {
        const {resolver} = build([], directoriesFake(), {
            [COMPOSE_PATH]: PLAIN_COMPOSE,
            "/srv/app/.env": "COMPOSE_PROJECT_NAME=From_Env\n",
        });

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution).toEqual({
            kind: "resolved",
            project: {name: "from_env", source: "files", containers: []},
        });
    });

    it("falls back to the directory name without a name in the files", async () => {
        const {resolver} = build([]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind === "resolved" && resolution.project.name).toBe("app");
    });

    it("is unresolved when containers of two projects run the same compose file", async () => {
        const {resolver} = build([info("a-web-1", labelled("alpha")), info("b-web-1", labelled("beta"))]);

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind).toBe("unresolved");
        expect(resolution.kind === "unresolved" && resolution.reason).toContain('"alpha"');
        expect(resolution.kind === "unresolved" && resolution.reason).toContain('"beta"');
    });

    it("is unresolved when Docktor's mounts are unknown and a container could be the stack's", async () => {
        const {resolver} = build([info("other-web-1", labelled("other"))], directoriesFake({mountsKnown: false}));

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind).toBe("unresolved");
        expect(resolution.kind === "unresolved" && resolution.reason).toContain("mounts");
    });

    it("is unresolved with Docker's message when Docker cannot be queried", async () => {
        const {resolver} = build(new Error("connect ENOENT /var/run/docker.sock"));

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind).toBe("unresolved");
        expect(resolution.kind === "unresolved" && resolution.reason).toContain("connect ENOENT /var/run/docker.sock");
    });

    it("is unresolved when the compose file cannot be read for the files fallback", async () => {
        const {resolver} = build([], directoriesFake(), {});

        const resolution = await resolver.resolve(COMPOSE_PATH);

        expect(resolution.kind).toBe("unresolved");
    });
});

describe("ComposeProjectResolver.listContainers", () => {
    it("returns the project's containers of the compose file's directory, running or not", async () => {
        const {resolver} = build([
            info("other-web-1", labelled("other")),
            info("other-db-1", labelled("other"), {State: "exited"}),
            info("other-web-9", labelled("other", {"com.docker.compose.project.working_dir": "/srv/elsewhere"})),
            info("unrelated-web-1", labelled("unrelated")),
        ]);

        const containers = await resolver.listContainers("other", COMPOSE_PATH);

        expect(containers.map((container) => [container.name, container.running])).toEqual([
            ["other-web-1", true],
            ["other-db-1", false],
        ]);
    });

    it("keeps a container that carries no directory label", async () => {
        const legacy = labelled("other");
        delete legacy["com.docker.compose.project.working_dir"];
        delete legacy["com.docker.compose.project.config_files"];
        const {resolver} = build([info("other-web-1", legacy)]);

        const containers = await resolver.listContainers("other", COMPOSE_PATH);

        expect(containers.map((container) => container.name)).toEqual(["other-web-1"]);
    });

    it("rejects with Docker's error when Docker cannot be queried", async () => {
        const {resolver} = build(new Error("daemon unreachable"));

        await expect(resolver.listContainers("other", COMPOSE_PATH)).rejects.toThrow("daemon unreachable");
    });
});
