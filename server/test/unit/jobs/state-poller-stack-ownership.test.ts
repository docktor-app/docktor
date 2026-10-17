import {beforeEach, describe, expect, it, vi} from "vitest";

import {StackContainerMatcher} from "../../../src/application/stack-container-matcher.js";
import {StatePoller, type DockerEvent, type StatePollerRepo} from "../../../src/jobs/state-poller.js";
import {hostViewDirectories} from "../../helpers/host-directory-identity.js";

// G-18-22-status: a container of the same compose project that runs from
// another directory (the old copy of a migrated stack) must not change the
// new stack's service rows or status.

const STACK_DIR = "/opt/docktor/stacks/memos";
const OLD_DIR = "/home/u/memos";

function createRepo() {
    return {
        findByComposeProject: vi.fn().mockResolvedValue({
            id: "memos",
            status: "STOPPED",
            hostPath: STACK_DIR,
            services: [{serviceName: "web", containerId: null, containerState: "exited", healthStatus: null}],
        }),
        findAll: vi.fn().mockResolvedValue([]),
        updateServiceState: vi.fn().mockResolvedValue(undefined),
        updateStackStatus: vi.fn().mockResolvedValue(null),
    };
}

function startEvent(containerId: string, extra: Record<string, string>): DockerEvent {
    return {
        Type: "container",
        Action: "start",
        Actor: {
            ID: containerId,
            Attributes: {
                "com.docker.compose.project": "memos",
                "com.docker.compose.service": "web",
                ...extra,
            },
        },
    };
}

describe("StatePoller container ownership (G-18-22-status)", () => {
    let repo: ReturnType<typeof createRepo>;
    let docker: {
        getEventStream: ReturnType<typeof vi.fn>
        inspectContainer: ReturnType<typeof vi.fn>
        listContainers: ReturnType<typeof vi.fn>
    };
    let bus: {emit: ReturnType<typeof vi.fn>};
    let poller: StatePoller;

    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        repo = createRepo();
        docker = {
            getEventStream: vi.fn(),
            inspectContainer: vi.fn().mockResolvedValue({State: {Status: "running"}}),
            listContainers: vi.fn().mockResolvedValue([]),
        };
        bus = {emit: vi.fn()};
        poller = new StatePoller(
            docker,
            repo as unknown as StatePollerRepo,
            bus,
            undefined,
            new StackContainerMatcher(hostViewDirectories()),
        );
    });

    describe("live events", () => {
        it("ignores an event from a container whose working_dir is another directory", async () => {
            await poller.handleEvent(startEvent("old-1", {"com.docker.compose.project.working_dir": OLD_DIR}));

            expect(docker.inspectContainer).not.toHaveBeenCalled();
            expect(repo.updateServiceState).not.toHaveBeenCalled();
            expect(repo.updateStackStatus).not.toHaveBeenCalled();
            expect(bus.emit).not.toHaveBeenCalled();
        });

        it("handles an event from a container whose working_dir is the stack's directory", async () => {
            await poller.handleEvent(startEvent("new-1", {"com.docker.compose.project.working_dir": STACK_DIR}));

            expect(docker.inspectContainer).toHaveBeenCalledWith("new-1");
            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({stackId: "memos", serviceName: "web", containerState: "running"}),
            );
            expect(bus.emit).toHaveBeenCalledWith(
                "stack.container_state_changed",
                expect.objectContaining({stackId: "memos", serviceName: "web"}),
            );
        });

        it("falls back to the config_files directory when working_dir is absent", async () => {
            await poller.handleEvent(startEvent("new-1", {
                "com.docker.compose.project.config_files": `${STACK_DIR}/docker-compose.yml`,
            }));
            expect(repo.updateServiceState).toHaveBeenCalledTimes(1);

            repo.updateServiceState.mockClear();
            await poller.handleEvent(startEvent("old-1", {
                "com.docker.compose.project.config_files": `${OLD_DIR}/docker-compose.yml`,
            }));
            expect(repo.updateServiceState).not.toHaveBeenCalled();
        });

        it("handles a legacy container that carries no location label", async () => {
            await poller.handleEvent(startEvent("legacy-1", {}));

            expect(repo.updateServiceState).toHaveBeenCalledTimes(1);
            expect(bus.emit).toHaveBeenCalledTimes(1);
        });
    });
});
