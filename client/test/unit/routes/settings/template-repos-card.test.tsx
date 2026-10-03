import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
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
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => {
                    if (typeof opts.success === "function") opts.success(result);
                },
                (err) => {
                    if (typeof opts.error === "function") opts.error(err);
                },
            );
            return promise.catch(() => {});
        }),
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
const mockToastPromise = vi.mocked(toast.promise);

const OFFICIAL = {
    id: "r1",
    url: "https://example.com/official.git",
    isDefault: true,
    headCommitSha: "abc",
    lastSyncAttemptAt: "2026-01-01T00:00:00Z",
    lastSyncedAt: "2026-01-01T00:00:00Z",
    lastSyncError: null,
    issues: [],
};

beforeEach(() => {
    mockListTemplateRepos.mockReset();
    mockAddTemplateRepo.mockReset();
    mockSyncTemplateRepo.mockReset();
    mockToastPromise.mockClear();
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
        mockAddTemplateRepo.mockResolvedValue({...OFFICIAL, id: "r2", url: "https://example.com/extra.git", isDefault: false});
        const user = userEvent.setup();

        render(<TemplateReposCard />);
        const input = await screen.findByLabelText("Repository URL");
        await user.type(input, "https://example.com/extra.git");
        await user.click(screen.getByRole("button", {name: "Add Repository"}));

        await waitFor(() => expect(mockAddTemplateRepo).toHaveBeenCalledWith("https://example.com/extra.git"));
        await waitFor(() =>
            expect(mockToastPromise).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({loading: "Adding repository…"}),
            ),
        );
        const opts = mockToastPromise.mock.calls[0]![1] as {success: (r: unknown) => string};
        expect(opts.success({...OFFICIAL, lastSyncError: null})).toBe("Repository added");
        expect(opts.success({...OFFICIAL, lastSyncError: "clone failed"})).toBe(
            "Repository added, but syncing failed — see the error below.",
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
});
