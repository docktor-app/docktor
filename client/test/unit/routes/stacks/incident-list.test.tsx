import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, fireEvent, render, screen, within} from "@testing-library/react";
import {IncidentList} from "../../../../src/routes/app/stacks/components/incident-list";
import type {Incident} from "@/lib/uptime-api";

const NOW = new Date("2026-10-08T12:00:00.000Z");

function makeIncident(overrides: Partial<Incident> = {}): Incident {
    return {
        id: "i1",
        cause: "UNHEALTHY",
        startedAt: "2026-10-08T10:30:00.000Z",
        endedAt: null,
        durationMs: null,
        ...overrides,
    };
}

const ongoing = makeIncident({id: "ongoing"});
const closed = makeIncident({
    id: "closed",
    cause: "ERROR",
    startedAt: "2026-10-01T09:00:00.000Z",
    endedAt: "2026-10-01T09:02:05.000Z",
    durationMs: 125_000,
});

function renderList(overrides: Partial<React.ComponentProps<typeof IncidentList>> = {}) {
    return render(
        <IncidentList
            incidents={[ongoing, closed]}
            windowDays={30}
            loading={false}
            error={null}
            onRetry={vi.fn()}
            {...overrides}
        />,
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("IncidentList", () => {
    it("renders the title, the window description and the four column headers", () => {
        renderList();

        expect(screen.getByRole("heading", {name: "Incidents"})).toBeInTheDocument();
        expect(
            screen.getByText("Periods when this stack was unhealthy or in error during the last 30 days."),
        ).toBeInTheDocument();
        for (const header of ["Started", "Ended", "Duration", "Cause"]) {
            expect(screen.getByRole("columnheader", {name: header})).toBeInTheDocument();
        }
    });

    it("shows an ongoing incident with an Ongoing badge and elapsed time, and a closed one with its duration", () => {
        renderList();

        const [, ongoingRow, closedRow] = screen.getAllByRole("row");
        expect(within(ongoingRow).getByText("Ongoing")).toBeInTheDocument();
        expect(within(ongoingRow).getByText("1h 30m")).toBeInTheDocument();
        expect(within(ongoingRow).getByText("Unhealthy")).toBeInTheDocument();
        expect(within(closedRow).queryByText("Ongoing")).not.toBeInTheDocument();
        expect(within(closedRow).getByText("2m 5s")).toBeInTheDocument();
        expect(within(closedRow).getByText("Error")).toBeInTheDocument();
    });

    it("keeps start and end times on one line", () => {
        renderList();

        const closedRow = screen.getAllByRole("row")[2];
        const [started, ended] = within(closedRow).getAllByRole("cell");
        expect(started.className).toContain("whitespace-nowrap");
        expect(ended.className).toContain("whitespace-nowrap");
        expect(started).toHaveTextContent(new Date(closed.startedAt).toLocaleString());
        expect(ended).toHaveTextContent(new Date(closed.endedAt!).toLocaleString());
    });

    it("wraps the table in a vertically scrolling container", () => {
        const {container} = renderList();

        expect(container.querySelector(".max-h-96.overflow-y-auto")).not.toBeNull();
    });

    it("re-renders the ongoing duration after a 60-second tick", () => {
        renderList();
        expect(screen.getByText("1h 30m")).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(60_000);
        });

        expect(screen.getByText("1h 31m")).toBeInTheDocument();
    });

    it("starts no timer when every incident is closed", () => {
        renderList({incidents: [closed]});

        expect(vi.getTimerCount()).toBe(0);
    });

    it("renders the empty copy for zero incidents", () => {
        renderList({incidents: []});

        expect(screen.getByText("No incidents")).toBeInTheDocument();
        expect(
            screen.getByText("This stack hasn't been unhealthy or in error during the last 30 days."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders three skeleton lines while loading", () => {
        const {container} = renderList({incidents: [], loading: true});

        expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
        expect(screen.queryByText("No incidents")).not.toBeInTheDocument();
    });

    it("renders the error alert with a Retry button that calls onRetry once", () => {
        const onRetry = vi.fn();
        renderList({incidents: [], error: "boom", onRetry});

        expect(screen.getByText("Couldn't load uptime — boom. Try again.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Retry"}));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("renders cause and times as text, never as markup", () => {
        // Cast is safe in a test: it simulates a hostile server payload outside the declared union.
        const hostileCause = "<img src=x onerror=alert(1)>" as unknown as Incident["cause"];
        renderList({incidents: [makeIncident({cause: hostileCause})]});

        expect(document.querySelector("img")).toBeNull();
    });
});
