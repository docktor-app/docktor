import {beforeAll, describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ActivityTimeline} from "../../../../src/routes/app/stacks/components/activity-timeline";
import {buildTimeline} from "@/hooks/use-stack-timeline";
import type {StackDetail, StackEvent} from "@/lib/stacks-api";

// jsdom doesn't implement pointer capture — required for Radix Select
// (same stub as proxy-tab.test.tsx's established pattern).
beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
        Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    }
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

function makeDeployment(overrides: Partial<StackDetail["deployments"][number]> = {}) {
    return {
        id: "dep-1",
        composeHash: "hash-1",
        deployedAt: "2026-01-01T00:00:00Z",
        success: true,
        errorMessage: null,
        ...overrides,
    };
}

function makeStatusLog(overrides: Partial<StackDetail["statusLogs"][number]> = {}) {
    return {
        id: "log-1",
        fromStatus: "DEPLOYING",
        toStatus: "RUNNING",
        message: null,
        createdAt: "2026-01-01T00:00:03Z",
        ...overrides,
    };
}

function makeEvent(overrides: Partial<StackEvent> = {}): StackEvent {
    return {
        id: "event-1",
        type: "config_changed",
        message: null,
        payload: null,
        createdAt: "2026-01-01T00:00:02Z",
        ...overrides,
    };
}

describe("ActivityTimeline", () => {
    it("shows the empty state when there is no activity at all", () => {
        render(
            <ActivityTimeline
                entries={[]}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByText("No activity yet")).toBeInTheDocument();
        expect(
            screen.getByText("Deploys, status changes, and events for this stack will appear here."),
        ).toBeInTheDocument();
    });

    it("shows skeleton rows while events are loading", () => {
        render(
            <ActivityTimeline
                entries={[]}
                eventsLoading={true}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByRole("status", {name: /loading activity/i})).toBeInTheDocument();
        expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
    });

    it("shows a destructive alert and retry button on error while still rendering deployment/status entries", async () => {
        const entries = buildTimeline([makeDeployment()], [makeStatusLog()], null);
        const onRetryEvents = vi.fn();
        const user = userEvent.setup();

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError="Failed to fetch stack events"
                onRetryEvents={onRetryEvents}
            />,
        );

        expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch stack events");
        expect(screen.getByText("Deploy succeeded")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /retry/i}));
        expect(onRetryEvents).toHaveBeenCalledTimes(1);
    });

    it("renders a deployment entry as succeeded (green) or failed (red) plus its error message", () => {
        const entries = buildTimeline(
            [makeDeployment({id: "dep-1", success: false, errorMessage: "compose up failed"})],
            [],
            null,
        );

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByText("Deploy failed")).toBeInTheDocument();
        expect(screen.getByText("compose up failed")).toBeInTheDocument();
    });

    it("renders a status entry as {from} -> {to} with a compact status badge and its message", () => {
        const entries = buildTimeline(
            [],
            [makeStatusLog({fromStatus: "DEPLOYING", toStatus: "RUNNING", message: "container healthy"})],
            null,
        );

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByText("DEPLOYING → RUNNING")).toBeInTheDocument();
        expect(screen.getByText("container healthy")).toBeInTheDocument();
        expect(screen.getByText("Running")).toBeInTheDocument();
    });

    it("filters entries by type via the 'Filter activity by type' select", async () => {
        const entries = buildTimeline(
            [makeDeployment({id: "dep-1"})],
            [makeStatusLog({id: "log-1"})],
            [makeEvent({id: "event-1"})],
        );
        const user = userEvent.setup();

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByText("Deploy succeeded")).toBeInTheDocument();

        const trigger = screen.getByRole("combobox", {name: "Filter activity by type"});
        await user.click(trigger);
        const listbox = await screen.findByRole("listbox");
        await user.click(within(listbox).getByRole("option", {name: "Deployments"}));

        expect(screen.getByText("Deploy succeeded")).toBeInTheDocument();
        expect(screen.queryByText("DEPLOYING → RUNNING")).not.toBeInTheDocument();
        expect(screen.queryByText("Config Changed")).not.toBeInTheDocument();
    });

    it("shows 'No matching activity.' when a filter empties the list", async () => {
        const entries = buildTimeline([makeDeployment()], [], null);
        const user = userEvent.setup();

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("combobox", {name: "Filter activity by type"});
        await user.click(trigger);
        const listbox = await screen.findByRole("listbox");
        await user.click(within(listbox).getByRole("option", {name: "Events"}));

        expect(screen.getByText("No matching activity.")).toBeInTheDocument();
    });

    it("renders an event entry through describeStackEvent's label/description/tone", () => {
        const entries = buildTimeline([], [], [makeEvent({type: "config_error", message: "bad yaml"})]);

        render(
            <ActivityTimeline
                entries={entries}
                eventsLoading={false}
                eventsError={null}
                onRetryEvents={vi.fn()}
            />,
        );

        expect(screen.getByText("Config Error")).toBeInTheDocument();
        expect(screen.getByText("bad yaml")).toBeInTheDocument();
    });
});
