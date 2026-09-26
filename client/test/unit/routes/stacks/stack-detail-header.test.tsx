import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {ThemeProvider} from "@/components/common/theme-provider";
import {SidebarProvider} from "@/components/ui/sidebar";
import {StackDetailHeader} from "../../../../src/routes/app/stacks/components/stack-detail-header";
import type {StackDetail} from "@/lib/stacks-api";

// jsdom has no ResizeObserver — Radix's DropdownMenu.Content (rendered by
// ThemeToggle inside PageHeader) positioning internals require one (same
// pattern as page-header.test.tsx).
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("../../../../src/routes/app/stacks/components/stack-actions", () => ({
    StackActions: () => null,
}));

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

function renderHeader(overrides: Partial<React.ComponentProps<typeof StackDetailHeader>> = {}) {
    return render(
        <MemoryRouter>
            <ThemeProvider>
                <SidebarProvider>
                    <StackDetailHeader
                        stack={makeStack()}
                        activeTab="overview"
                        isRefreshing={false}
                        onAction={vi.fn()}
                        {...overrides}
                    />
                </SidebarProvider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

describe("StackDetailHeader (D-09)", () => {
    it("shows the 'update available' pill next to the status badge when a service has updateAvailable true", () => {
        renderHeader({
            stack: makeStack({
                services: [
                    {
                        id: "svc-1",
                        stackId: "my-app",
                        serviceName: "web",
                        image: "nginx",
                        imageTag: "1.25",
                        ports: null,
                        volumes: null,
                        containerId: null,
                        containerState: null,
                        healthStatus: null,
                        updateAvailable: true,
                        latestTag: "1.27",
                        createdAt: "2026-01-01T00:00:00Z",
                        updatedAt: "2026-01-01T00:00:00Z",
                    },
                ],
            }),
        });

        expect(screen.getByText("update available")).toBeInTheDocument();
    });

    it("does not show the pill when no service has an update available", () => {
        renderHeader({stack: makeStack({services: []})});

        expect(screen.queryByText("update available")).not.toBeInTheDocument();
    });
});
