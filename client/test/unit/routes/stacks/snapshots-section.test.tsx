import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {SnapshotsSection} from "../../../../src/routes/app/stacks/components/snapshots-section";
import {getSnapshots, triggerRestore, type ResticSnapshot} from "@/lib/backups-api";

vi.mock("@/lib/backups-api", () => ({
    getSnapshots: vi.fn(),
    triggerRestore: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const mockGetSnapshots = vi.mocked(getSnapshots);
const mockTriggerRestore = vi.mocked(triggerRestore);

function makeSnapshot(overrides: Partial<ResticSnapshot> = {}): ResticSnapshot {
    return {
        id: "aaaaaaaa11112222",
        short_id: "aaaaaaaa",
        time: "2026-08-01T10:00:00Z",
        hostname: "docktor",
        tags: null,
        paths: ["/data"],
        ...overrides,
    };
}

function renderSection(stackStatus = "RUNNING") {
    return render(
        <MemoryRouter>
            <SnapshotsSection stackId="s1" stackName="My Stack" stackStatus={stackStatus}/>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockGetSnapshots.mockReset();
    mockTriggerRestore.mockReset();
});

describe("SnapshotsSection", () => {
    it("lists snapshots newest first inside the shared frame with a mono short id", async () => {
        mockGetSnapshots.mockResolvedValue([
            makeSnapshot({id: "old0000011112222", short_id: "old00000", time: "2026-08-01T10:00:00Z"}),
            makeSnapshot({id: "new0000011112222", short_id: "new00000", time: "2026-08-02T10:00:00Z", tags: ["daily", "docktor"]}),
        ]);

        const {container} = renderSection();

        const newest = await screen.findByText("new00000");
        expect(container.querySelector('[data-slot="table-frame"] table')).not.toBeNull();
        expect(newest.classList.contains("font-mono")).toBe(true);
        expect(newest.classList.contains("text-xs")).toBe(true);

        const bodyRows = screen.getAllByRole("row").slice(1);
        expect(bodyRows[0]).toHaveTextContent("new00000");
        expect(bodyRows[0]).toHaveTextContent("daily, docktor");
        expect(bodyRows[1]).toHaveTextContent("old00000");
        expect(within(bodyRows[1]).getByText("-")).toBeInTheDocument();
    });

    it("asks for confirmation before restoring a snapshot", async () => {
        const user = userEvent.setup();
        mockGetSnapshots.mockResolvedValue([makeSnapshot()]);
        renderSection();

        await user.click(await screen.findByRole("button", {name: "Restore"}));

        expect(await screen.findByText(/Restore My Stack from snapshot aaaaaaaa\?/)).toBeInTheDocument();
        expect(mockTriggerRestore).not.toHaveBeenCalled();
    });

    it("explains an empty repository without rendering a table", async () => {
        mockGetSnapshots.mockResolvedValue([]);
        renderSection();

        expect(await screen.findByText("No snapshots found")).toBeInTheDocument();
        expect(screen.getByText("Run a backup to create the first snapshot in this repository.")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows the unreachable-repository error with a Retry button", async () => {
        mockGetSnapshots.mockRejectedValue(new Error("boom"));
        renderSection();

        expect(
            await screen.findByText("Could not load snapshots. The backup repository may be unreachable."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows the in-progress alert instead of the table while a backup runs", async () => {
        mockGetSnapshots.mockResolvedValue([makeSnapshot()]);
        renderSection("BACKING_UP");

        expect(
            screen.getByText("A backup is in progress. Snapshot list will refresh when complete."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});
