import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StackAlerts} from "@/routes/app/stacks/components/stack-alerts";
import type {StackDetail} from "@/lib/stacks-api";

function makeStack(overrides: Partial<StackDetail> = {}): StackDetail {
    return {
        id: "my-app",
        displayName: "My App",
        description: null,
        hostPath: "/stacks/my-app",
        status: "RUNNING",
        configChanged: false,
        configError: null,
        lastKnownHash: "hash-1",
        backupSchedule: null,
        isProtected: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        services: [],
        deployments: [],
        statusLogs: [],
        ...overrides,
    };
}

describe("StackAlerts", () => {
    it("shows the config changed banner for a deployed stack", () => {
        render(<StackAlerts stack={makeStack({configChanged: true})}/>);

        expect(screen.getByText(/Configuration has changed since last deployment/)).toBeInTheDocument();
    });

    it("suppresses the config changed banner while the stack is a DRAFT", () => {
        render(<StackAlerts stack={makeStack({status: "DRAFT", configChanged: true})}/>);

        expect(screen.queryByText(/Configuration has changed/)).not.toBeInTheDocument();
    });

    it("still shows config errors for a DRAFT stack", () => {
        render(<StackAlerts stack={makeStack({status: "DRAFT", configError: "bad yaml"})}/>);

        expect(screen.getByText(/bad yaml/)).toBeInTheDocument();
    });
});
