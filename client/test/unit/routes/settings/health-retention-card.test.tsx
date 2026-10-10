import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {HealthRetentionCard} from "@/routes/app/settings/components/health-retention-card";
import {getHealthSettings, saveHealthSettings} from "@/lib/settings-api";

vi.mock("@/lib/settings-api", () => ({
    getHealthSettings: vi.fn(),
    saveHealthSettings: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => {})),
    },
}));

// Same CPU-bound Form render + userEvent flake class documented in
// compose-checks-card.test.tsx.
vi.setConfig({testTimeout: 15000});

const mockGetHealthSettings = vi.mocked(getHealthSettings);
const mockSaveHealthSettings = vi.mocked(saveHealthSettings);
const mockToastPromise = vi.mocked(toast.promise);

const VALIDATION_MESSAGE = "Enter a whole number from 1 to 365.";

beforeEach(() => {
    mockGetHealthSettings.mockReset();
    mockSaveHealthSettings.mockReset();
    mockToastPromise.mockClear();
    mockGetHealthSettings.mockResolvedValue({retentionDays: 30});
    mockSaveHealthSettings.mockImplementation((data) => Promise.resolve(data));
});

async function renderLoaded() {
    const user = userEvent.setup();
    render(<HealthRetentionCard />);
    const input = await screen.findByLabelText("Retention (days)");
    return {user, input};
}

async function enterDays(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) {
    await user.clear(input);
    if (value !== "") await user.type(input, value);
}

describe("HealthRetentionCard", () => {
    it("shows skeletons and no input while the setting loads", () => {
        mockGetHealthSettings.mockReturnValue(new Promise(() => {}));
        const {container} = render(<HealthRetentionCard />);

        expect(screen.getByText("Health History")).toBeInTheDocument();
        expect(screen.queryByLabelText("Retention (days)")).not.toBeInTheDocument();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });

    it("seeds the field from the loaded setting and shows the description", async () => {
        const {input} = await renderLoaded();

        expect(input).toHaveValue(30);
        expect(
            screen.getByText(
                "Uptime, incidents, and health history are kept and calculated over this window. " +
                    "Records older than the window are deleted daily. 1 to 365; the default is 30.",
            ),
        ).toBeInTheDocument();
    });

    it.each(["0", "366", ""])("rejects %j with the validation message and does not save", async (value) => {
        const {user, input} = await renderLoaded();

        await enterDays(user, input, value);
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));

        expect(await screen.findByText(VALIDATION_MESSAGE)).toBeInTheDocument();
        expect(mockSaveHealthSettings).not.toHaveBeenCalled();
    });

    it("saves a raised value without a dialog and toasts the documented copy", async () => {
        const {user, input} = await renderLoaded();

        await enterDays(user, input, "60");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));

        await waitFor(() => expect(mockSaveHealthSettings).toHaveBeenCalledWith({retentionDays: 60}));
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(mockToastPromise).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({loading: "Saving health settings…", success: "Health settings saved"}),
        );
    });

    it("asks for confirmation before shortening, and Keep cancels without saving", async () => {
        const {user, input} = await renderLoaded();

        await enterDays(user, input, "7");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));

        const dialog = await screen.findByRole("alertdialog", {name: "Shorten retention to 7 days?"});
        expect(dialog).toHaveTextContent(
            "Records older than 7 days will be permanently deleted during the next daily cleanup, " +
                "and uptime will be calculated over the shorter window.",
        );

        await user.click(screen.getByRole("button", {name: "Keep 30 days"}));

        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(mockSaveHealthSettings).not.toHaveBeenCalled();
    });

    it("saves the shortened value once the user confirms", async () => {
        const {user, input} = await renderLoaded();

        await enterDays(user, input, "7");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));
        await screen.findByRole("alertdialog");
        await user.click(screen.getByRole("button", {name: "Shorten retention"}));

        await waitFor(() => expect(mockSaveHealthSettings).toHaveBeenCalledTimes(1));
        expect(mockSaveHealthSettings).toHaveBeenCalledWith({retentionDays: 7});
    });

    it("compares against the newly saved value on the next save", async () => {
        const {user, input} = await renderLoaded();

        await enterDays(user, input, "60");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));
        await waitFor(() => expect(mockSaveHealthSettings).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(input).toHaveValue(60));

        await enterDays(user, input, "45");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));

        expect(await screen.findByRole("button", {name: "Keep 60 days"})).toBeInTheDocument();
    });

    it("renders the load-error alert and no form when the setting cannot be loaded", async () => {
        mockGetHealthSettings.mockRejectedValue(new Error("boom"));
        render(<HealthRetentionCard />);

        expect(
            await screen.findByText("Couldn't load health settings. Reload the page to try again."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Save Health Settings"})).not.toBeInTheDocument();
    });

    it("reports a failed save through the documented error toast", async () => {
        mockSaveHealthSettings.mockRejectedValue(new Error("boom"));
        const {user, input} = await renderLoaded();

        await enterDays(user, input, "60");
        await user.click(screen.getByRole("button", {name: "Save Health Settings"}));

        await waitFor(() => expect(mockToastPromise).toHaveBeenCalled());
        const options = mockToastPromise.mock.calls[0]![1] as {error: (err: unknown) => string};
        expect(options.error(new Error("boom"))).toBe("Couldn't save health settings — boom. Try again.");
    });
});
