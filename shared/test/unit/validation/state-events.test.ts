import {describe, expect, it} from "vitest";
import {STATE_EVENT_TYPES, stateEventSchema} from "../../../src/validation/state-events.js";

const OPERATION = {
    id: "op-1",
    stackId: "my-app",
    displayName: "My App",
    composePath: "/opt/app/docker-compose.yml",
    backup: true,
    stopOldStack: false,
    status: "running",
    step: "starting",
    stepDetail: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    finishedAt: null,
    result: null,
};

// One valid frame per type, field for field what the server publishes.
const VALID_FRAMES = {
    container_state: {
        type: "container_state",
        stackId: "s1",
        serviceName: "web",
        containerState: "running",
        healthStatus: null,
        stackStatus: "RUNNING",
    },
    stack_status: {type: "stack_status", stackId: "s1", stackStatus: "RUNNING"},
    config_changed: {type: "config_changed", stackId: "s1", newHash: "abc123", source: "external"},
    config_error: {type: "config_error", stackId: "s1", message: "invalid yaml"},
    update_available: {type: "update_available", stackId: "s1", imageRef: "nginx", latestTag: null, hasUpdate: false},
    notification_created: {type: "notification_created", notificationId: "n1"},
    proxy_cert_status: {
        type: "proxy_cert_status",
        proxyConfigId: "p1",
        stackId: "s1",
        domain: "example.com",
        status: "expiring",
    },
    migration_progress: {type: "migration_progress", operation: OPERATION},
} as const;

describe("stateEventSchema", () => {
    it.each(Object.entries(VALID_FRAMES))("accepts a %s frame", (_type, frame) => {
        expect(stateEventSchema.safeParse(frame).success).toBe(true);
    });

    it("lists the eight event types, each covered by a valid frame", () => {
        expect([...STATE_EVENT_TYPES].sort()).toEqual(Object.keys(VALID_FRAMES).sort());
        expect(STATE_EVENT_TYPES).toHaveLength(8);
    });

    it("keeps STATE_EVENT_TYPES in step with the union", () => {
        const unionTypes = stateEventSchema.options.map((option) => option.shape.type.value);

        expect([...STATE_EVENT_TYPES]).toEqual(unionTypes);
    });

    describe("container_state", () => {
        it("accepts a statusLog and a health status", () => {
            const frame = {
                ...VALID_FRAMES.container_state,
                healthStatus: "healthy",
                statusLog: {id: "l1", fromStatus: null, toStatus: "RUNNING", message: null, createdAt: "2026-01-01T10:00:00.000Z"},
            };

            expect(stateEventSchema.safeParse(frame).success).toBe(true);
        });

        it("rejects a statusLog with a missing field", () => {
            const frame = {...VALID_FRAMES.container_state, statusLog: {id: "l1", toStatus: "RUNNING"}};

            expect(stateEventSchema.safeParse(frame).success).toBe(false);
        });
    });

    describe("config_changed", () => {
        it("accepts source app", () => {
            expect(stateEventSchema.safeParse({...VALID_FRAMES.config_changed, source: "app"}).success).toBe(true);
        });

        it("requires newHash", () => {
            const {newHash: _omitted, ...frame} = VALID_FRAMES.config_changed;

            expect(stateEventSchema.safeParse(frame).success).toBe(false);
        });

        it("rejects an unknown source", () => {
            expect(stateEventSchema.safeParse({...VALID_FRAMES.config_changed, source: "cron"}).success).toBe(false);
        });
    });

    describe("proxy_cert_status", () => {
        it.each(["pending", "issued", "failed", "expiring"])("accepts status %s", (status) => {
            expect(stateEventSchema.safeParse({...VALID_FRAMES.proxy_cert_status, status}).success).toBe(true);
        });

        it("accepts an optional message and rejects an unknown status", () => {
            expect(stateEventSchema.safeParse({...VALID_FRAMES.proxy_cert_status, message: "boom"}).success).toBe(true);
            expect(stateEventSchema.safeParse({...VALID_FRAMES.proxy_cert_status, status: "revoked"}).success).toBe(false);
        });
    });

    describe("migration_progress", () => {
        it("rejects an operation with an unknown step", () => {
            const frame = {type: "migration_progress", operation: {...OPERATION, step: "teleporting"}};

            expect(stateEventSchema.safeParse(frame).success).toBe(false);
        });
    });

    describe("invalid frames", () => {
        it("rejects an unknown type", () => {
            expect(stateEventSchema.safeParse({type: "stack_deleted", stackId: "s1"}).success).toBe(false);
        });

        it("rejects a missing required field", () => {
            expect(stateEventSchema.safeParse({type: "stack_status", stackId: "s1"}).success).toBe(false);
        });

        it("rejects a wrong field type", () => {
            expect(stateEventSchema.safeParse({type: "stack_status", stackId: 7, stackStatus: "RUNNING"}).success).toBe(false);
        });

        it.each([null, "frame", 42, [], {}])("rejects %j", (value) => {
            expect(stateEventSchema.safeParse(value).success).toBe(false);
        });
    });
});
