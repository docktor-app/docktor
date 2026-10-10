import {beforeEach, describe, expect, it, vi} from "vitest";

const {create} = vi.hoisted(() => ({create: vi.fn()}));

vi.mock("../../../src/lib/db.js", () => ({
    prisma: {serviceHealthEvent: {create}},
}));

import {ServiceHealthEventRepository} from "../../../src/repositories/service-health-event-repository.js";

describe("ServiceHealthEventRepository.record", () => {
    beforeEach(() => {
        create.mockReset();
        create.mockResolvedValue(undefined);
    });

    const base = {
        stackId: "app",
        serviceName: "web",
        fromStatus: "healthy",
        toStatus: "unhealthy",
        source: "http-probe" as const,
        message: "Responded with HTTP 503 after 3 failed checks",
    };

    it("passes createdAt to the insert when the input has one", async () => {
        const createdAt = new Date("2026-10-08T12:00:00.000Z");

        await new ServiceHealthEventRepository().record({...base, createdAt});

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0]?.[0].data).toMatchObject({stackId: "app", serviceName: "web", createdAt});
    });

    it("leaves createdAt out of the data when the input has none", async () => {
        await new ServiceHealthEventRepository().record(base);

        const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
        expect(data).not.toHaveProperty("createdAt");
        expect(data).toMatchObject({stackId: "app", message: "Responded with HTTP 503 after 3 failed checks"});
    });
});
