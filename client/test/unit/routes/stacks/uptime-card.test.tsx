import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {UptimeCard} from "../../../../src/routes/app/stacks/components/uptime-card";
import type {Incident, StackUptime} from "@/lib/uptime-api";

function makeIncident(overrides: Partial<Incident> = {}): Incident {
    return {
        id: "i1",
        cause: "UNHEALTHY",
        startedAt: "2026-10-01T10:00:00.000Z",
        endedAt: "2026-10-01T10:02:05.000Z",
        durationMs: 125_000,
        ...overrides,
    };
}

function makeUptime(overrides: Partial<StackUptime> = {}): StackUptime {
    return {
        stackId: "app",
        windowDays: 30,
        windowStart: "2026-09-08T00:00:00.000Z",
        since: "2026-09-08T00:00:00.000Z",
        percent: 99.95,
        upMs: 1000,
        downMs: 1,
        incidents: [makeIncident({id: "i1"}), makeIncident({id: "i2"})],
        ...overrides,
    };
}

function renderCard(overrides: Partial<React.ComponentProps<typeof UptimeCard>> = {}) {
    return render(
        <UptimeCard
            uptime={makeUptime()}
            loading={false}
            error={null}
            volumeSizeBytes={1_073_741_824}
            {...overrides}
        />,
    );
}

describe("UptimeCard", () => {
    it("renders the three figures with their labels", () => {
        renderCard();

        expect(screen.getByText("Uptime (last 30 days)")).toBeInTheDocument();
        expect(screen.getByText("99.9%")).toBeInTheDocument();
        expect(screen.getByText("Incidents (last 30 days)")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("Disk Used (volumes)")).toBeInTheDocument();
        expect(screen.getByText("1.00 GB")).toBeInTheDocument();
    });

    it("tints the incident count red only when above zero", () => {
        const {unmount} = renderCard();
        expect(screen.getByText("2").className).toContain("text-red-600");
        expect(screen.getByText("2").className).toContain("dark:text-red-400");
        unmount();

        renderCard({uptime: makeUptime({incidents: []})});
        expect(screen.getByText("0").className).not.toContain("text-red-600");
    });

    it("tones the uptime value by threshold", () => {
        const {unmount} = renderCard({uptime: makeUptime({percent: 99.95})});
        expect(screen.getByText("99.9%").className).toContain("text-green-600");
        unmount();

        const second = renderCard({uptime: makeUptime({percent: 99.5})});
        expect(screen.getByText("99.5%").className).toContain("text-yellow-600");
        second.unmount();

        renderCard({uptime: makeUptime({percent: 90})});
        expect(screen.getByText("90.0%").className).toContain("text-red-600");
    });

    it("shows an em dash under Disk Used when the size is unmeasured", () => {
        renderCard({volumeSizeBytes: null});

        const label = screen.getByText("Disk Used (volumes)");
        const card = label.closest('[data-slot="stat-card"]') as HTMLElement;
        expect(card).toHaveTextContent("—");
    });

    it("shows skeletons instead of the uptime figures while loading, but not for disk", () => {
        renderCard({uptime: null, loading: true});

        expect(screen.queryByText("99.9%")).not.toBeInTheDocument();
        expect(screen.getByText("1.00 GB")).toBeInTheDocument();
    });
});
