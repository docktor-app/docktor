import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {StackList, type StackListUptimes} from "@/components/domain/stack/stack-list";
import type {Service, StackWithServices} from "@/lib/stacks-api";

// jsdom does not implement matchMedia; DataTable's mobile-detection hook
// (useIsMobile, via TableContent) requires it. Mirrors the established
// stub in stack-detail-page.test.tsx / backup-detail-page.test.tsx.
beforeEach(() => {
    if (typeof window.matchMedia !== "function") {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    }
});

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
        containerState: "running",
        healthStatus: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function buildStack(overrides: Partial<StackWithServices> = {}): StackWithServices {
    return {
        id: "stack-1",
        displayName: "My Stack",
        description: null,
        hostPath: "/opt/docktor/stacks/my-stack",
        status: "RUNNING",
        configChanged: false,
        configError: null,
        lastKnownHash: null,
        backupSchedule: null,
        isProtected: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        services: [buildService()],
        ...overrides,
    };
}

function renderList(stacks: StackWithServices[], uptimes?: StackListUptimes) {
    return render(
        <MemoryRouter>
            <StackList stacks={stacks} pagination={false} uptimes={uptimes} />
        </MemoryRouter>,
    );
}

describe("StackList", () => {
    it("renders config error, config changed and update available pills alongside a compact status badge", () => {
        const stack = buildStack({
            configError: "compose file is invalid",
            configChanged: true,
            services: [buildService({updateAvailable: true, latestTag: "1.2.3"})],
        });
        renderList([stack]);

        expect(screen.getByText("Running")).toBeInTheDocument();
        expect(screen.getByText("Running").closest('[data-slot="badge"]')).toBeNull();
        expect(screen.getByText("config error")).toHaveAttribute("data-tone", "red");
        expect(screen.getByText("config changed")).toHaveAttribute("data-tone", "yellow");
        expect(screen.getByText("update available")).toHaveAttribute("data-tone", "blue");
    });

    it("renders no update-available pill when no service has an update", () => {
        const stack = buildStack({services: [buildService({updateAvailable: false})]});
        renderList([stack]);

        expect(screen.queryByText("update available")).not.toBeInTheDocument();
    });

    describe("Uptime column", () => {
        const stackA = buildStack({id: "a", displayName: "Stack A"});
        const stackB = buildStack({id: "b", displayName: "Stack B"});

        function buildUptimes(overrides: Partial<StackListUptimes> = {}): StackListUptimes {
            return {byStackId: new Map([["a", 99.95]]), windowDays: 30, loading: false, ...overrides};
        }

        function headerNames(): string[] {
            return screen.getAllByRole("columnheader").map((header) => header.textContent ?? "");
        }

        it("renders no Uptime column without the uptimes prop", () => {
            renderList([stackA]);

            expect(screen.queryByRole("columnheader", {name: "Uptime"})).not.toBeInTheDocument();
        });

        it("places the Uptime column between Status and Services", () => {
            renderList([stackA], buildUptimes());

            expect(headerNames()).toEqual(["Name", "Status", "Uptime", "Services", "Created"]);
        });

        it("shows the truncated percentage, and an em dash for a stack missing from the batch", () => {
            renderList([stackA, stackB], buildUptimes());

            expect(screen.getByText("99.9%")).toBeInTheDocument();
            expect(screen.getByLabelText("No uptime data")).toHaveTextContent("—");
        });

        it("renders a skeleton in every Uptime cell while loading", () => {
            const {container} = renderList([stackA, stackB], buildUptimes({loading: true}));

            expect(screen.queryByText("99.9%")).not.toBeInTheDocument();
            expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
        });
    });
});
