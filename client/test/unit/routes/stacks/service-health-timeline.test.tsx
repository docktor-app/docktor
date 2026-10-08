import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ServiceHealthTimeline} from "../../../../src/routes/app/stacks/components/service-health-timeline";
import type {ServiceHealthEvent} from "@/lib/health-api";

// jsdom has no ResizeObserver; Radix's ScrollArea requires one.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

function makeEvent(overrides: Partial<ServiceHealthEvent> = {}): ServiceHealthEvent {
    return {
        id: "e1",
        serviceName: "web",
        fromStatus: null,
        toStatus: "healthy",
        source: "docker-healthcheck",
        message: null,
        createdAt: "2026-10-08T07:00:00Z",
        ...overrides,
    };
}

function renderTimeline(overrides: Partial<React.ComponentProps<typeof ServiceHealthTimeline>> = {}) {
    return render(
        <ServiceHealthTimeline
            serviceName="web"
            events={[makeEvent()]}
            loading={false}
            error={null}
            onRetry={vi.fn()}
            {...overrides}
        />,
    );
}

describe("ServiceHealthTimeline", () => {
    it("renders the heading and an id the History button can point aria-controls at", () => {
        const {container} = renderTimeline();
        expect(screen.getByText("Health history")).toBeInTheDocument();
        expect(container.querySelector("#health-history-web")).toBeInTheDocument();
    });

    it("renders from and to with unknown / cleared wording for null sides", () => {
        renderTimeline({
            events: [
                makeEvent({id: "e2", fromStatus: "healthy", toStatus: null}),
                makeEvent({id: "e1", fromStatus: null, toStatus: "healthy"}),
            ],
        });
        expect(screen.getByText("healthy → cleared")).toBeInTheDocument();
        expect(screen.getByText("unknown → healthy")).toBeInTheDocument();
    });

    it("tones the status dot by the destination status", () => {
        const {container} = renderTimeline({
            events: [
                makeEvent({id: "e3", toStatus: "unhealthy"}),
                makeEvent({id: "e2", toStatus: "starting"}),
                makeEvent({id: "e1", toStatus: "healthy"}),
            ],
        });
        const tones = [...container.querySelectorAll('[data-slot="status-dot"]')].map((dot) =>
            dot.getAttribute("data-tone"),
        );
        expect(tones).toEqual(["red", "yellow", "green"]);
        for (const dot of container.querySelectorAll('[data-slot="status-dot"]')) {
            expect(dot).toHaveAttribute("data-pulse", "false");
        }
    });

    it("labels an http-probe event with 'HTTP probe' and a docker event with 'Docker healthcheck'", () => {
        renderTimeline({
            events: [
                makeEvent({id: "e2", source: "http-probe"}),
                makeEvent({id: "e1", source: "docker-healthcheck"}),
            ],
        });
        expect(screen.getByText("HTTP probe")).toHaveAttribute("data-tone", "neutral");
        expect(screen.getByText("Docker healthcheck")).toHaveAttribute("data-tone", "neutral");
    });

    it("renders the message verbatim as text, never as HTML", () => {
        const message = 'Responded with HTTP 503 <img src=x onerror="alert(1)"> after 3 failed checks';
        const {container} = renderTimeline({events: [makeEvent({source: "http-probe", message})]});
        expect(screen.getByText(message)).toBeInTheDocument();
        expect(container.querySelector("img")).not.toBeInTheDocument();
    });

    it("resets inherited nowrap and lets a long message break, so it wraps inside the table cell it renders in", () => {
        const message = "Responded with HTTP 503 ".repeat(9);
        const {container} = renderTimeline({events: [makeEvent({source: "http-probe", message})]});
        // TableCell is whitespace-nowrap; without this reset break-words is inert.
        expect(container.querySelector("#health-history-web")).toHaveClass("whitespace-normal");
        expect(container.querySelector(".break-words")).toHaveClass("min-w-0", "wrap-anywhere");
    });

    it("omits the message element when the message is null", () => {
        const {container} = renderTimeline({events: [makeEvent({message: null})]});
        expect(container.querySelector(".break-words")).not.toBeInTheDocument();
    });

    it("renders the timestamp in the muted 12px style", () => {
        renderTimeline();
        const stamp = screen.getByText(new Date("2026-10-08T07:00:00Z").toLocaleString());
        expect(stamp).toHaveClass("text-xs", "text-muted-foreground");
    });

    describe("states", () => {
        it("shows two skeleton lines and no rows while loading", () => {
            const {container} = renderTimeline({loading: true});
            expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
            expect(container.querySelector('[data-slot="status-dot"]')).not.toBeInTheDocument();
            expect(screen.getByText("Health history")).toBeInTheDocument();
        });

        it("prefers the loading state over a stale error", () => {
            const {container} = renderTimeline({loading: true, error: "boom"});
            expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        });

        it("shows the error copy and a Retry button that calls onRetry once", async () => {
            const user = userEvent.setup();
            const onRetry = vi.fn();
            renderTimeline({error: "boom", events: [], onRetry});

            expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load health history — boom. Try again.");

            await user.click(screen.getByRole("button", {name: "Retry"}));
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        it("shows the empty copy when there are no events", () => {
            renderTimeline({events: []});
            expect(screen.getByText("No health changes recorded for this service yet.")).toBeInTheDocument();
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        });

        it("keeps the container id on every state so aria-controls always resolves", () => {
            const {container, rerender} = renderTimeline({loading: true});
            expect(container.querySelector("#health-history-web")).toBeInTheDocument();
            rerender(
                <ServiceHealthTimeline serviceName="web" events={[]} loading={false} error={null} onRetry={vi.fn()}/>,
            );
            expect(container.querySelector("#health-history-web")).toBeInTheDocument();
        });
    });
});
