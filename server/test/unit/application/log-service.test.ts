import {beforeEach, describe, expect, it, vi} from "vitest";
import {LogService} from "../../../src/application/log-service.js";
import {NotFoundError} from "../../../src/lib/errors.js";

function createMockDocker() {
    return {
        getLogStream: vi.fn(),
    };
}

function createMockStackRepo() {
    return {
        findByIdWithRelations: vi.fn(),
    };
}

function fakeStream(): any {
    return {on: vi.fn(), destroy: vi.fn()};
}

describe("LogService", () => {
    let service: LogService;
    let docker: ReturnType<typeof createMockDocker>;
    let stackRepo: ReturnType<typeof createMockStackRepo>;

    beforeEach(() => {
        docker = createMockDocker();
        stackRepo = createMockStackRepo();
        service = new LogService(docker as any, stackRepo as any);
    });

    describe("openLogStreams", () => {
        it("raises NotFoundError('Stack not found') for an unknown stack", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue(null);

            await expect(service.openLogStreams("missing", "all")).rejects.toThrow(NotFoundError);
            await expect(service.openLogStreams("missing", "all")).rejects.toThrow("Stack not found");
        });

        it("returns every service that has a container id and skips those that do not, for the 'all' filter", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue({
                services: [
                    {serviceName: "web", containerId: "c1"},
                    {serviceName: "worker", containerId: null},
                    {serviceName: "db", containerId: "c2"},
                ],
            });
            const webStream = fakeStream();
            const dbStream = fakeStream();
            docker.getLogStream.mockImplementation(async (containerId: string) => {
                if (containerId === "c1") return webStream;
                if (containerId === "c2") return dbStream;
                throw new Error(`unexpected containerId ${containerId}`);
            });

            const targets = await service.openLogStreams("my-app", "all");

            expect(targets).toEqual([
                {serviceName: "web", stream: webStream},
                {serviceName: "db", stream: dbStream},
            ]);
            expect(docker.getLogStream).toHaveBeenCalledTimes(2);
            expect(docker.getLogStream).toHaveBeenCalledWith("c1", 100);
            expect(docker.getLogStream).toHaveBeenCalledWith("c2", 100);
        });

        it("returns only the named service for a named-service filter", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue({
                services: [
                    {serviceName: "web", containerId: "c1"},
                    {serviceName: "db", containerId: "c2"},
                ],
            });
            const dbStream = fakeStream();
            docker.getLogStream.mockResolvedValue(dbStream);

            const targets = await service.openLogStreams("my-app", "db");

            expect(targets).toEqual([{serviceName: "db", stream: dbStream}]);
            expect(docker.getLogStream).toHaveBeenCalledTimes(1);
            expect(docker.getLogStream).toHaveBeenCalledWith("c2", 100);
        });

        it("returns an empty array (not a throw) for a named service with no running container", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue({
                services: [{serviceName: "web", containerId: null}],
            });

            const targets = await service.openLogStreams("my-app", "web");

            expect(targets).toEqual([]);
            expect(docker.getLogStream).not.toHaveBeenCalled();
        });

        it("returns an empty array for a service name that does not exist on the stack at all", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue({
                services: [{serviceName: "web", containerId: "c1"}],
            });

            const targets = await service.openLogStreams("my-app", "does-not-exist");

            expect(targets).toEqual([]);
        });

        it("opens exactly one stream per target, pairing it with the correct service name", async () => {
            stackRepo.findByIdWithRelations.mockResolvedValue({
                services: [
                    {serviceName: "web", containerId: "c1"},
                    {serviceName: "db", containerId: "c2"},
                ],
            });
            const webStream = fakeStream();
            const dbStream = fakeStream();
            docker.getLogStream.mockImplementation(async (containerId: string) =>
                containerId === "c1" ? webStream : dbStream,
            );

            const targets = await service.openLogStreams("my-app", "all");

            expect(targets.find((t) => t.serviceName === "web")?.stream).toBe(webStream);
            expect(targets.find((t) => t.serviceName === "db")?.stream).toBe(dbStream);
            expect(docker.getLogStream).toHaveBeenCalledTimes(2);
        });
    });
});
