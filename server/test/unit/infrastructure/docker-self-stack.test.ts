import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type Dockerode from "dockerode";
import {DockerSelfStack} from "../../../src/infrastructure/docker-self-stack.js";

const CONFIG_FILES_LABEL = "com.docker.compose.project.config_files";
const WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";

const ROOT_MOUNT = {Type: "bind", Source: "/", Destination: "/host", Mode: "ro", RW: false, Propagation: "rslave"};

// The fakes are partial ContainerInspectInfo values: DockerSelfStack only reads Config.Labels and Mounts.
function inspectInfo(partial: {Config?: {Labels?: Record<string, string>}; Mounts?: unknown[]}): Dockerode.ContainerInspectInfo {
    return partial as unknown as Dockerode.ContainerInspectInfo;
}

describe("DockerSelfStack", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it("returns nothing and never inspects when Docktor is not containerized", async () => {
        const docker = {inspectContainer: vi.fn()};
        const selfStack = new DockerSelfStack(docker, {containerId: async () => null});

        await expect(selfStack.composeFilePaths()).resolves.toEqual([]);
        expect(docker.inspectContainer).not.toHaveBeenCalled();
    });

    it("fails open and logs once when inspect rejects", async () => {
        const docker = {inspectContainer: vi.fn().mockRejectedValue(new Error("docker unreachable"))};
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await expect(selfStack.composeFilePaths()).resolves.toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("fails open when the container id lookup rejects", async () => {
        const docker = {inspectContainer: vi.fn()};
        const selfStack = new DockerSelfStack(docker, {
            containerId: vi.fn().mockRejectedValue(new Error("no hostname")),
        });

        await expect(selfStack.composeFilePaths()).resolves.toEqual([]);
        expect(docker.inspectContainer).not.toHaveBeenCalled();
    });

    it("does not log label values when it fails open", async () => {
        const docker = {inspectContainer: vi.fn().mockRejectedValue(new Error("boom"))};
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await selfStack.composeFilePaths();

        expect(String(warn.mock.calls[0]?.[0])).not.toContain("/opt/");
    });

    it("returns nothing when the compose config_files label is missing", async () => {
        const docker = {
            inspectContainer: vi.fn().mockResolvedValue(inspectInfo({Config: {Labels: {}}, Mounts: [ROOT_MOUNT]})),
        };
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await expect(selfStack.composeFilePaths()).resolves.toEqual([]);
    });

    it("does not throw when Config is undefined", async () => {
        const docker = {inspectContainer: vi.fn().mockResolvedValue(inspectInfo({Mounts: [ROOT_MOUNT]}))};
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await expect(selfStack.composeFilePaths()).resolves.toEqual([]);
    });

    it("returns identity-only candidates when Mounts is undefined", async () => {
        const docker = {
            inspectContainer: vi.fn().mockResolvedValue(
                inspectInfo({Config: {Labels: {[CONFIG_FILES_LABEL]: "/opt/docktor/docker-compose.yml"}}}),
            ),
        };
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await expect(selfStack.composeFilePaths()).resolves.toEqual(["/opt/docktor/docker-compose.yml"]);
    });

    it("returns the identity and the /host candidates and passes an abort signal to inspect", async () => {
        const docker = {
            inspectContainer: vi.fn().mockResolvedValue(
                inspectInfo({
                    Config: {
                        Labels: {
                            [CONFIG_FILES_LABEL]: "/opt/docktor/docker-compose.yml",
                            [WORKING_DIR_LABEL]: "/opt/docktor",
                        },
                    },
                    Mounts: [ROOT_MOUNT],
                }),
            ),
        };
        const selfStack = new DockerSelfStack(docker, {containerId: async () => "abc123"});

        await expect(selfStack.composeFilePaths()).resolves.toEqual([
            "/opt/docktor/docker-compose.yml",
            "/host/opt/docktor/docker-compose.yml",
        ]);
        expect(docker.inspectContainer).toHaveBeenCalledWith("abc123", expect.any(AbortSignal));
    });
});
