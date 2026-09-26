import {describe, expect, it} from "vitest";
import {computeDashboardStats} from "@/lib/dashboard-stats";
import type {Service, StackWithServices} from "@/lib/stacks-api";

function buildService(overrides: Partial<Service> = {}): Service {
    return {
        id: "svc-1",
        stackId: "stack-1",
        serviceName: "web",
        image: "nginx",
        imageTag: "latest",
        ports: null,
        volumes: null,
        containerId: null,
        containerState: null,
        healthStatus: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function buildStack(overrides: Partial<StackWithServices> = {}): StackWithServices {
    return {
        id: "stack-1",
        displayName: "Stack",
        description: null,
        hostPath: "/opt/docktor/stacks/stack-1",
        status: "RUNNING",
        configChanged: false,
        configError: null,
        lastKnownHash: null,
        backupSchedule: null,
        isProtected: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        services: [],
        ...overrides,
    };
}

describe("computeDashboardStats", () => {
    it("returns all-zero counts for an empty stack list", () => {
        expect(computeDashboardStats([], null)).toEqual({
            total: 0,
            running: 0,
            stopped: 0,
            errors: 0,
            updatesAvailable: 0,
            backupsConfigured: 0,
        });
    });

    it("counts RUNNING and HEALTHY as running, STOPPED as stopped, ERROR and UNHEALTHY as errors, and totals all stacks", () => {
        const stacks = [
            buildStack({id: "a", status: "RUNNING"}),
            buildStack({id: "b", status: "HEALTHY"}),
            buildStack({id: "c", status: "STOPPED"}),
            buildStack({id: "d", status: "ERROR"}),
            buildStack({id: "e", status: "UNHEALTHY"}),
            buildStack({id: "f", status: "DRAFT"}),
        ];

        const stats = computeDashboardStats(stacks, null);

        expect(stats.total).toBe(6);
        expect(stats.running).toBe(2);
        expect(stats.stopped).toBe(1);
        expect(stats.errors).toBe(2);
    });

    it("counts a stack once toward updatesAvailable even when multiple services have updates", () => {
        const stack = buildStack({
            services: [
                buildService({serviceName: "web", updateAvailable: true}),
                buildService({serviceName: "worker", updateAvailable: true}),
                buildService({serviceName: "db", updateAvailable: true}),
            ],
        });

        expect(computeDashboardStats([stack], null).updatesAvailable).toBe(1);
    });

    it("treats a service with updateAvailable undefined as having no update", () => {
        const stack = buildStack({services: [buildService({updateAvailable: undefined})]});

        expect(computeDashboardStats([stack], null).updatesAvailable).toBe(0);
    });

    it("counts every stack toward backupsConfigured when a non-empty global default schedule is set", () => {
        const stacks = [
            buildStack({id: "a", backupSchedule: null}),
            buildStack({id: "b", backupSchedule: "0 4 * * *"}),
        ];

        expect(computeDashboardStats(stacks, "0 3 * * *").backupsConfigured).toBe(2);
    });

    it("with no global default, counts only stacks with a non-empty backupSchedule", () => {
        const stacks = [
            buildStack({id: "a", backupSchedule: null}),
            buildStack({id: "b", backupSchedule: ""}),
            buildStack({id: "c", backupSchedule: "0 4 * * *"}),
        ];

        expect(computeDashboardStats(stacks, null).backupsConfigured).toBe(1);
    });
});
