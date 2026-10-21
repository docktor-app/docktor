import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {DashboardStatCards} from "@/routes/app/dashboard/components/dashboard-stat-cards";
import type {DashboardStats} from "@/lib/dashboard-stats";

const STATS: DashboardStats = {
    total: 5,
    running: 3,
    stopped: 1,
    errors: 1,
    updatesAvailable: 2,
    backupCoverage: 3,
};

function renderCards(overrides: Partial<Parameters<typeof DashboardStatCards>[0]> = {}) {
    return render(
        <DashboardStatCards stats={STATS} loading={false} stacksError={null} defaultsError={null} {...overrides} />,
    );
}

function backupCoverageCard(container: HTMLElement): HTMLElement {
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="stat-card"]'));
    const card = cards.find((el) => el.textContent?.includes("Backup Coverage"));
    if (!card) throw new Error("Backup Coverage card not found");
    return card;
}

describe("DashboardStatCards", () => {
    it("shows Backup Coverage as covered/total and no Backups Configured card", () => {
        const {container} = renderCards();

        expect(backupCoverageCard(container)).toHaveTextContent("3/5");
        expect(screen.queryByText("Backups Configured")).not.toBeInTheDocument();
    });

    it("states what it counts with a hint on success", () => {
        const {container} = renderCards();
        expect(backupCoverageCard(container)).toHaveTextContent("with a schedule or snapshot");
    });

    it("shows an em dash and 'data unavailable' when the stacks request failed", () => {
        const {container} = renderCards({stacksError: "x"});
        const card = backupCoverageCard(container);
        expect(card).toHaveTextContent("—");
        expect(card).toHaveTextContent("data unavailable");
    });

    it("shows an em dash and 'data unavailable' when only the defaults request failed, other cards keep their number", () => {
        const {container} = renderCards({defaultsError: "x"});
        const card = backupCoverageCard(container);
        expect(card).toHaveTextContent("—");
        expect(card).toHaveTextContent("data unavailable");
        const total = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="stat-card"]'))
            .find((el) => el.textContent?.includes("Total Stacks"));
        expect(total).toHaveTextContent("5");
    });

    it("renders 0/0 with no stacks", () => {
        const {container} = renderCards({stats: {...STATS, total: 0, backupCoverage: 0}});
        expect(backupCoverageCard(container)).toHaveTextContent("0/0");
    });
});
