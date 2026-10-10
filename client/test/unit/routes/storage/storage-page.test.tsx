import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import StoragePage from "../../../../src/routes/app/storage";
import {useStorage} from "@/hooks/use-storage";
import type {StorageOverview} from "@/lib/storage-api";
import {SidebarProvider} from "@/components/ui/sidebar";

vi.mock("@/hooks/use-storage", () => ({
    useStorage: vi.fn(),
}));

const mockUseStorage = vi.mocked(useStorage);

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

const overview: StorageOverview = {
    measuredAt: hoursAgo(1),
    totals: {volumesBytes: 3 * 1073741824, backupsBytes: 1073741824, totalBytes: 4 * 1073741824},
    stacks: [
        {stackId: "small", displayName: "Small", volumeSizeBytes: 1048576, measuredAt: hoursAgo(1), volumes: []},
        {stackId: "big-app", displayName: "Big App", volumeSizeBytes: 2 * 1073741824, measuredAt: hoursAgo(1), volumes: []},
    ],
    backups: [{stackId: "big-app", displayName: "Big App", sizeBytes: 1073741824}],
};

function renderPage(state: Partial<ReturnType<typeof useStorage>> = {}) {
    mockUseStorage.mockReturnValue({overview, loading: false, error: null, retry: vi.fn(), ...state});
    return render(
        <MemoryRouter>
            <SidebarProvider>
                <StoragePage/>
            </SidebarProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockUseStorage.mockReset();
});

describe("StoragePage", () => {
    it("renders the title, description and breadcrumb", () => {
        renderPage();
        expect(screen.getByRole("heading", {level: 1, name: "Storage"})).toBeInTheDocument();
        expect(
            screen.getByText("Disk used by stack volumes and local backups, measured once a day."),
        ).toBeInTheDocument();
        expect(screen.getByRole("navigation", {name: "breadcrumb"})).toHaveTextContent("Storage");
    });

    it("shows the three totals from the server", () => {
        const {container} = renderPage();
        const [total, volumes, local] = Array.from(container.querySelectorAll('[data-slot="stat-card"]'));
        expect(total).toHaveTextContent("Total Disk Used");
        expect(total).toHaveTextContent("4.00 GB");
        expect(volumes).toHaveTextContent("Stack Volumes");
        expect(volumes).toHaveTextContent("3.00 GB");
        expect(local).toHaveTextContent("Local Backups");
        expect(local).toHaveTextContent("1.00 GB");
    });

    it("renders one row per stack, largest first, each linking to the stack", () => {
        renderPage();
        const bigLink = screen.getByRole("link", {name: "Big App"});
        const smallLink = screen.getByRole("link", {name: "Small"});
        expect(bigLink).toHaveAttribute("href", "/stacks/big-app");
        expect(smallLink).toHaveAttribute("href", "/stacks/small");

        const rows = screen.getAllByRole("row");
        expect(within(rows[1]).getByRole("link")).toHaveTextContent("Big App");
        expect(within(rows[2]).getByRole("link")).toHaveTextContent("Small");
    });

    it("shows the last measured stamp when measuredAt is set", () => {
        renderPage();
        expect(screen.getByText(/^Last measured/)).toBeInTheDocument();
    });

    it("omits the stamp when nothing has been measured", () => {
        renderPage({overview: {...overview, measuredAt: null}});
        expect(screen.queryByText(/^Last measured/)).not.toBeInTheDocument();
    });

    it("composes the stacks and backups sections", () => {
        renderPage();
        expect(screen.getByRole("heading", {name: "Stacks"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Backups"})).toBeInTheDocument();
        expect(screen.getByText("Backups subtotal")).toBeInTheDocument();
    });
});

describe("StoragePage states", () => {
    it("shows skeletons instead of rows while loading", () => {
        const {container} = renderPage({overview: null, loading: true});
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(9);
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows the error alert with a working Retry and dash totals", async () => {
        const retry = vi.fn();
        renderPage({overview: null, error: "boom", retry});

        expect(screen.getByText("Couldn't load disk usage — boom. Try again.")).toBeInTheDocument();
        expect(screen.getAllByText("—")).toHaveLength(3);
        expect(screen.queryByText("No stacks to measure")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", {name: "Retry"}));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("ignores a previously loaded overview once a reload has failed", () => {
        renderPage({error: "boom"});
        expect(screen.getAllByText("—")).toHaveLength(3);
        expect(screen.queryByRole("link", {name: "Big App"})).not.toBeInTheDocument();
    });

    it("renders the empty install state", () => {
        renderPage({
            overview: {
                measuredAt: null,
                totals: {volumesBytes: null, backupsBytes: null, totalBytes: null},
                stacks: [],
                backups: [],
            },
        });
        expect(screen.getByText("No stacks to measure")).toBeInTheDocument();
        expect(screen.getByText("No local backups")).toBeInTheDocument();
    });

    it("explains that stacks exist but nothing is measured yet", () => {
        renderPage({
            overview: {...overview, measuredAt: null, totals: {volumesBytes: null, backupsBytes: null, totalBytes: null}},
        });
        expect(screen.getByText("Disk usage hasn't been measured yet")).toBeInTheDocument();
        expect(screen.getAllByText("—")).toHaveLength(3);
    });

    it("warns when the measurement is older than 48 hours", () => {
        renderPage({overview: {...overview, measuredAt: hoursAgo(49)}});
        expect(screen.getByText("Disk usage is out of date")).toBeInTheDocument();
        expect(
            screen.getByText("The last measurement was 2 days ago. Check the server logs if this keeps happening."),
        ).toBeInTheDocument();
    });

    it("does not warn when the measurement is recent", () => {
        renderPage();
        expect(screen.queryByText("Disk usage is out of date")).not.toBeInTheDocument();
    });
});
