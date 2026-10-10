import {describe, expect, it, vi} from "vitest";
import {ServiceHealthHistoryService} from "../../../src/application/service-health-history-service.js";
import {NotFoundError} from "../../../src/lib/errors.js";

function createDeps(stackExists = true) {
    return {
        stacks: {exists: vi.fn().mockResolvedValue(stackExists)},
        events: {
            findLatestByStack: vi.fn().mockResolvedValue([]),
            findLatestByService: vi.fn().mockResolvedValue([]),
        },
    };
}

describe("ServiceHealthHistoryService.listHealthEvents", () => {
    it("reads the latest events per service for the whole stack when no serviceName is given", async () => {
        const {stacks, events} = createDeps();
        const service = new ServiceHealthHistoryService(stacks, events);

        await service.listHealthEvents("app", {limit: 50});

        expect(events.findLatestByStack).toHaveBeenCalledWith("app", 50);
        expect(events.findLatestByService).not.toHaveBeenCalled();
    });

    it("reads only the named service's events when serviceName is given", async () => {
        const {stacks, events} = createDeps();
        const service = new ServiceHealthHistoryService(stacks, events);

        await service.listHealthEvents("app", {serviceName: "web", limit: 50});

        expect(events.findLatestByService).toHaveBeenCalledWith("app", "web", 50);
        expect(events.findLatestByStack).not.toHaveBeenCalled();
    });

    it("returns whatever the repository returned", async () => {
        const {stacks, events} = createDeps();
        const row = {
            id: "e1",
            serviceName: "web",
            fromStatus: null,
            toStatus: "healthy",
            source: "docker-healthcheck" as const,
            message: null,
            createdAt: new Date(),
        };
        events.findLatestByStack.mockResolvedValue([row]);
        const service = new ServiceHealthHistoryService(stacks, events);

        await expect(service.listHealthEvents("app", {limit: 5})).resolves.toEqual([row]);
    });

    it("rejects with NotFoundError and reads nothing when the stack does not exist", async () => {
        const {stacks, events} = createDeps(false);
        const service = new ServiceHealthHistoryService(stacks, events);

        await expect(service.listHealthEvents("ghost", {limit: 50})).rejects.toBeInstanceOf(NotFoundError);
        expect(events.findLatestByStack).not.toHaveBeenCalled();
        expect(events.findLatestByService).not.toHaveBeenCalled();
    });
});
