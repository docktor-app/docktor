import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TemplateReposCard} from "@/routes/app/settings/components/template-repos-card";
import {addTemplateRepo, listTemplateRepos, syncTemplateRepo} from "@/lib/templates-api";
import {ApiError} from "@/lib/api";
import {toast} from "sonner";

vi.mock("@/lib/templates-api", () => ({
    listTemplateRepos: vi.fn(),
    addTemplateRepo: vi.fn(),
    syncTemplateRepo: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        loading: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.setConfig({testTimeout: 15000});

const mockListTemplateRepos = vi.mocked(listTemplateRepos);
const mockAddTemplateRepo = vi.mocked(addTemplateRepo);
const mockSyncTemplateRepo = vi.mocked(syncTemplateRepo);
const mockToastError = vi.mocked(toast.error);

const OFFICIAL = {
    id: "r1",
    url: "https://example.com/official.git",
    isDefault: true,
    headCommitSha: "abc",
    lastSyncAttemptAt: "2026-01-01T00:00:00Z",
    lastSyncedAt: "2026-01-01T00:00:00Z",
    lastSyncError: null as string | null,
    issues: [] as ReadonlyArray<{path: string; message: string}>,
};

beforeEach(() => {
    mockListTemplateRepos.mockReset();
    mockAddTemplateRepo.mockReset();
    mockSyncTemplateRepo.mockReset();
    mockToastError.mockClear();
});

describe("TemplateReposCard", () => {
    it("shows Skeleton rows while loading, then the repo list with an Official badge", async () => {
        mockListTemplateRepos.mockResolvedValue([OFFICIAL]);
        render(<TemplateReposCard />);

        expect(await screen.findByText(OFFICIAL.url)).toBeInTheDocument();
        expect(screen.getByText("Official")).toBeInTheDocument();
    });

    it("renders the add-repository form", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        render(<TemplateReposCard />);

        expect(await screen.findByLabelText("Repository URL")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Add Repository"})).toBeInTheDocument();
    });

    it("submitting a valid URL calls addTemplateRepo and toasts success", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        mockAddTemplateRepo.mockResolvedValue({
            ...OFFICIAL,
            id: "r2",
            url: "https://example.com/extra.git",
            isDefault: false,
        });
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "https://example.com/extra.git");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        expect(await screen.findByDisplayValue("")).toBeInTheDocument();
        expect(mockAddTemplateRepo).toHaveBeenCalledWith("https://example.com/extra.git");
        expect(toast.success).toHaveBeenCalledWith("Repository added", expect.anything());
    });

    it("toasts the syncing-failed message when the created repo already carries a sync error", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        mockAddTemplateRepo.mockResolvedValue({...OFFICIAL, id: "r2", lastSyncError: "clone failed"});
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "https://example.com/extra.git");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        expect(toast.success).toHaveBeenCalledWith(
            "Repository added, but syncing failed — see the error below.",
            expect.anything(),
        );
    });

    it("a malformed URL is rejected client-side without calling addTemplateRepo", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "ext::sh -c id");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        expect(
            await screen.findByText(/Use an https:\/\/, git:\/\/ or ssh:\/\/ repository URL/),
        ).toBeInTheDocument();
        expect(mockAddTemplateRepo).not.toHaveBeenCalled();
    });

    it("a repo with a sync error shows a red Sync failed badge and the error text", async () => {
        mockListTemplateRepos.mockResolvedValue([
            {...OFFICIAL, lastSyncedAt: null, lastSyncError: "clone failed: network unreachable"},
        ]);

        render(<TemplateReposCard />);

        expect(await screen.findByText("Sync failed")).toBeInTheDocument();
        expect(screen.getByText("clone failed: network unreachable")).toBeInTheDocument();
    });

    it("a synced repo shows a green Synced badge with its last-synced time", async () => {
        mockListTemplateRepos.mockResolvedValue([OFFICIAL]);

        render(<TemplateReposCard />);

        expect(await screen.findByText("Synced")).toBeInTheDocument();
        expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    });

    it("a never-synced repo shows a neutral Not synced yet badge", async () => {
        mockListTemplateRepos.mockResolvedValue([{...OFFICIAL, lastSyncedAt: null, lastSyncError: null}]);

        render(<TemplateReposCard />);

        expect(await screen.findByText("Not synced yet")).toBeInTheDocument();
    });

    it("a repo with issues shows a skipped-count badge and a details list of path: message", async () => {
        mockListTemplateRepos.mockResolvedValue([
            {
                ...OFFICIAL,
                issues: [
                    {path: "templates/bad", message: "template.yml missing"},
                    {path: "templates/bad2", message: "invalid category"},
                ],
            },
        ]);

        render(<TemplateReposCard />);

        expect(await screen.findByText("2 skipped")).toBeInTheDocument();
        expect(screen.getByText("Show skipped templates")).toBeInTheDocument();
        expect(screen.getByText("templates/bad: template.yml missing")).toBeInTheDocument();
        expect(screen.getByText("templates/bad2: invalid category")).toBeInTheDocument();
    });

    it("Sync now calls syncRepo, disables while running, and reflects the new status", async () => {
        mockListTemplateRepos.mockResolvedValueOnce([{...OFFICIAL, lastSyncedAt: null, lastSyncError: null}]);
        let resolveSync!: (value: typeof OFFICIAL) => void;
        mockSyncTemplateRepo.mockReturnValue(
            new Promise((resolve) => {
                resolveSync = resolve;
            }),
        );
        mockListTemplateRepos.mockResolvedValueOnce([OFFICIAL]);
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const syncButton = await screen.findByRole("button", {name: "Sync now"});
        await user.click(syncButton);

        expect(mockSyncTemplateRepo).toHaveBeenCalledWith(OFFICIAL.id);
        expect(await screen.findByRole("button", {name: "Syncing…"})).toBeDisabled();

        resolveSync(OFFICIAL);

        expect(await screen.findByText("Synced")).toBeInTheDocument();
    });

    it("a 409 from addTemplateRepo sets the URL field error with no generic error toast", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        mockAddTemplateRepo.mockRejectedValue(new ApiError("Template repository already added", 409));
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "https://example.com/dup.git");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        expect(await screen.findByText("This repository is already added")).toBeInTheDocument();
        expect(mockToastError).not.toHaveBeenCalled();
    });

    it("a 400 with fields.url maps to the URL field error", async () => {
        mockListTemplateRepos.mockResolvedValue([]);
        mockAddTemplateRepo.mockRejectedValue(
            new ApiError("Invalid input", 400, {url: "Use an https://, git:// or ssh:// repository URL"}),
        );
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "https://example.com/weird.git");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        expect(
            await screen.findByText("Use an https://, git:// or ssh:// repository URL"),
        ).toBeInTheDocument();
    });
});
