import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import StoragePage from "../../../../src/routes/app/storage";
import {useStorage} from "@/hooks/use-storage";
import type {StorageOverview} from "@/lib/storage-api";
import {SidebarProvider} from "@/components/ui/sidebar";

vi.mock("@/hooks/use-storage", () => ({
    useStorage: vi.fn(),
}));

const mockUseStorage = vi.mocked(useStorage);

const overview: StorageOverview = {
    measuredAt: "2026-10-08T03:00:00Z",
    totals: {volumesBytes: 3 * 1073741824, backupsBytes: 1073741824, totalBytes: 4 * 1073741824},
    stacks: [
        {stackId: "small", displayName: "Small", volumeSizeBytes: 1048576, measuredAt: "2026-10-08T03:00:00Z", volumes: []},
        {stackId: "big-app", displayName: "Big App", volumeSizeBytes: 2 * 1073741824, measuredAt: "2026-10-08T03:00:00Z", volumes: []},
    ],
    backups: [],
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
        renderPage();
        expect(screen.getByText("Total Disk Used")).toBeInTheDocument();
        expect(screen.getByText("Stack Volumes")).toBeInTheDocument();
        expect(screen.getByText("Local Backups")).toBeInTheDocument();
        expect(screen.getByText("4.00 GB")).toBeInTheDocument();
        expect(screen.getByText("3.00 GB")).toBeInTheDocument();
        expect(screen.getByText("1.00 GB")).toBeInTheDocument();
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
});
