import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ServicesSection} from "../../../../src/routes/app/stacks/components/services-section";
import {getServiceColor} from "@/lib/service-color";
import type {Service} from "@/lib/stacks-api";
import type {ServiceHealthEvent} from "@/lib/health-api";

// jsdom has no ResizeObserver — Radix's Tooltip content (via
// @radix-ui/react-use-size / positioning internals) requires one, same
// pattern as stack-actions.test.tsx.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("../../../../src/routes/app/stacks/components/service-upgrade-dialog", () => ({
    ServiceUpgradeDialog: ({serviceName}: {serviceName: string}) => (
        <div data-testid="upgrade-dialog">Upgrade dialog for {serviceName}</div>
    ),
}));

function makeService(overrides: Partial<Service> = {}): Service {
    return {
        id: "svc-1",
        stackId: "my-app",
        serviceName: "web",
        image: "nginx",
        imageTag: "1.25",
        ports: null,
        volumes: null,
        containerId: "container-1",
        containerState: "running",
        healthStatus: null,
        updateAvailable: false,
        latestTag: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeHealthEvent(overrides: Partial<ServiceHealthEvent> = {}): ServiceHealthEvent {
    return {
        id: "evt-1",
        serviceName: "web",
        fromStatus: null,
        toStatus: "healthy",
        source: "docker-healthcheck",
        message: null,
        createdAt: "2026-10-08T07:00:00Z",
        ...overrides,
    };
}

function renderSection(overrides: Partial<React.ComponentProps<typeof ServicesSection>> = {}) {
    const onViewLogs = vi.fn();
    const onUpgraded = vi.fn();
    const onRetryHealthEvents = vi.fn();
    const utils = render(
        <ServicesSection
            services={[makeService()]}
            stackId="my-app"
            stackStatus="RUNNING"
            onViewLogs={onViewLogs}
            onUpgraded={onUpgraded}
            healthEventsByService={new Map()}
            healthEventsLoading={false}
            healthEventsError={null}
            onRetryHealthEvents={onRetryHealthEvents}
            {...overrides}
        />,
    );
    return {...utils, onViewLogs, onUpgraded, onRetryHealthEvents};
}

describe("ServicesSection", () => {
    it("renders the 'Services' heading", () => {
        renderSection();
        expect(screen.getByRole("heading", {name: "Services"})).toBeInTheDocument();
    });

    it("renders no Card wrapper", () => {
        const {container} = renderSection();
        expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
    });

    it("shows a color dot matching getServiceColor(serviceName) before the service name", () => {
        const {container} = renderSection({services: [makeService({serviceName: "web"})]});
        const dot = container.querySelector(`.${getServiceColor("web")}`);
        expect(dot).toBeInTheDocument();
        expect(dot).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByText("web")).toBeInTheDocument();
    });

    it("shows a compact status indicator for the service", () => {
        renderSection({services: [makeService({containerState: "running", healthStatus: null})]});
        expect(screen.getByText("running")).toBeInTheDocument();
    });

    it("shows 'Update available -> {tag}' copy when a concrete tag is known", () => {
        renderSection({services: [makeService({updateAvailable: true, latestTag: "1.27"})]});
        expect(screen.getByText("Update available → 1.27")).toBeInTheDocument();
    });

    it("shows 'Content updated' copy when updateAvailable is true but no tag is known", () => {
        renderSection({services: [makeService({updateAvailable: true, latestTag: null})]});
        expect(screen.getByText("Content updated")).toBeInTheDocument();
    });

    it("renders ports via formatPorts", () => {
        renderSection({
            services: [makeService({ports: JSON.stringify([{host: 8080, container: 80}])})],
        });
        expect(screen.getByText("8080:80")).toBeInTheDocument();
    });

    it("renders '-' instead of throwing for a malformed ports string", () => {
        expect(() =>
            renderSection({services: [makeService({ports: "{not valid json"})]}),
        ).not.toThrow();
        expect(screen.getByText("-")).toBeInTheDocument();
    });

    it("renders 'No services defined' for an empty services list", () => {
        renderSection({services: []});
        expect(screen.getByText("No services defined")).toBeInTheDocument();
    });

    it("shows the upgrade button only when updateAvailable is true", () => {
        const {rerender} = renderSection({services: [makeService({updateAvailable: false})]});
        expect(screen.queryByRole("button", {name: /upgrade web/i})).not.toBeInTheDocument();

        rerender(
            <ServicesSection
                services={[makeService({updateAvailable: true, latestTag: "1.27"})]}
                stackId="my-app"
                stackStatus="RUNNING"
                onViewLogs={vi.fn()}
                onUpgraded={vi.fn()}
                healthEventsByService={new Map()}
                healthEventsLoading={false}
                healthEventsError={null}
                onRetryHealthEvents={vi.fn()}
            />,
        );
        expect(screen.getByRole("button", {name: "Upgrade web"})).toBeInTheDocument();
    });

    it("keeps the upgrade button visible and enabled for a moving-tag service with no latestTag (D-03)", () => {
        renderSection({
            services: [makeService({imageTag: "latest", updateAvailable: true, latestTag: null})],
        });
        expect(screen.getByRole("button", {name: "Upgrade web"})).toBeEnabled();
    });

    it("disables the upgrade button with an explanatory label while the stack is deploying", () => {
        renderSection({
            services: [makeService({updateAvailable: true, latestTag: "1.27"})],
            stackStatus: "DEPLOYING",
        });
        const button = screen.getByRole("button", {
            name: "Cannot upgrade while the stack is DEPLOYING",
        });
        expect(button).toBeDisabled();
    });

    it("opens ServiceUpgradeDialog when the upgrade button is clicked", async () => {
        const user = userEvent.setup();
        renderSection({services: [makeService({updateAvailable: true, latestTag: "1.27"})]});

        await user.click(screen.getByRole("button", {name: "Upgrade web"}));

        expect(await screen.findByTestId("upgrade-dialog")).toBeInTheDocument();
    });

    it("calls onViewLogs(serviceName) when 'View logs for {service}' is clicked", async () => {
        const user = userEvent.setup();
        const {onViewLogs} = renderSection({services: [makeService({serviceName: "web"})]});

        await user.click(screen.getByRole("button", {name: "View logs for web"}));

        expect(onViewLogs).toHaveBeenCalledWith("web");
    });

    describe("health history (D-12)", () => {
        const webEvents = new Map([["web", [makeHealthEvent()]]]);

        it("starts collapsed with an aria-expanded=false 'Show health history' button", () => {
            renderSection({healthEventsByService: webEvents});
            const button = screen.getByRole("button", {name: "Show health history for web"});
            expect(button).toHaveAttribute("aria-expanded", "false");
            expect(button).toHaveAttribute("aria-controls", "health-history-web");
            expect(screen.queryByText("Health history")).not.toBeInTheDocument();
        });

        it("opens a panel row with the service's transitions and flips the button to 'Hide'", async () => {
            const user = userEvent.setup();
            renderSection({healthEventsByService: webEvents});

            await user.click(screen.getByRole("button", {name: "Show health history for web"}));

            expect(screen.getByText("Health history")).toBeInTheDocument();
            expect(screen.getByText("unknown → healthy")).toBeInTheDocument();
            const hide = screen.getByRole("button", {name: "Hide health history for web"});
            expect(hide).toHaveAttribute("aria-expanded", "true");
        });

        it("renders the panel inside a full-width cell directly below its row", async () => {
            const user = userEvent.setup();
            const {container} = renderSection({healthEventsByService: webEvents});

            await user.click(screen.getByRole("button", {name: "Show health history for web"}));

            const panelCell = container.querySelector("#health-history-web")?.closest("td");
            expect(panelCell).toHaveAttribute("colspan", "6");
            expect(panelCell).toHaveClass("bg-muted/50");
        });

        it("removes the panel when the button is clicked again", async () => {
            const user = userEvent.setup();
            renderSection({healthEventsByService: webEvents});

            await user.click(screen.getByRole("button", {name: "Show health history for web"}));
            await user.click(screen.getByRole("button", {name: "Hide health history for web"}));

            expect(screen.queryByText("Health history")).not.toBeInTheDocument();
            expect(screen.getByRole("button", {name: "Show health history for web"})).toHaveAttribute(
                "aria-expanded",
                "false",
            );
        });

        it("lets several services be open at once, each with only its own slice", async () => {
            const user = userEvent.setup();
            renderSection({
                services: [
                    makeService({id: "svc-1", serviceName: "web"}),
                    makeService({id: "svc-2", serviceName: "db"}),
                ],
                healthEventsByService: new Map([
                    ["web", [makeHealthEvent({id: "w1", serviceName: "web", toStatus: "healthy"})]],
                    ["db", [makeHealthEvent({id: "d1", serviceName: "db", toStatus: "unhealthy", fromStatus: "healthy"})]],
                ]),
            });

            await user.click(screen.getByRole("button", {name: "Show health history for web"}));
            await user.click(screen.getByRole("button", {name: "Show health history for db"}));

            expect(screen.getAllByText("Health history")).toHaveLength(2);
            expect(screen.getByText("unknown → healthy")).toBeInTheDocument();
            expect(screen.getByText("healthy → unhealthy")).toBeInTheDocument();
        });
    });
});
