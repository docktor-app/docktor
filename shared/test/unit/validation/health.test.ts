import {describe, expect, it} from "vitest";
import {serviceHealthEventsQuerySchema} from "../../../src/validation/health.js";

describe("serviceHealthEventsQuerySchema", () => {
    it("defaults limit to 50 when nothing is supplied", () => {
        expect(serviceHealthEventsQuerySchema.parse({})).toEqual({limit: 50});
    });

    it("coerces a numeric string limit", () => {
        expect(serviceHealthEventsQuerySchema.parse({limit: "10"}).limit).toBe(10);
    });

    it.each(["0", "201", "abc", "1.5"])("rejects limit %s", (limit) => {
        expect(serviceHealthEventsQuerySchema.safeParse({limit}).success).toBe(false);
    });

    it("accepts the bounds 1 and 200", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({limit: "1"}).success).toBe(true);
        expect(serviceHealthEventsQuerySchema.safeParse({limit: "200"}).success).toBe(true);
    });

    it("rejects an empty serviceName", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({serviceName: ""}).success).toBe(false);
    });

    it("rejects a serviceName longer than 255 characters", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({serviceName: "a".repeat(256)}).success).toBe(false);
    });

    it("accepts a serviceName", () => {
        expect(serviceHealthEventsQuerySchema.parse({serviceName: "web"})).toEqual({serviceName: "web", limit: 50});
    });
});
