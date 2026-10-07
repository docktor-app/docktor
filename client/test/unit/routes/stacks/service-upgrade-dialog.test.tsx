import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ServiceUpgradeDialog} from "../../../../src/routes/app/stacks/components/service-upgrade-dialog";
import {getServiceTags, updateImages, upgradeService} from "@/lib/stacks-api";
import {ApiError} from "@/lib/api";
import {toast} from "sonner";

vi.mock("@/lib/stacks-api", () => ({
    getServiceTags: vi.fn(),
    upgradeService: vi.fn(),
    updateImages: vi.fn(),
}));

// Capture the loading/success/error callbacks toast.promise is invoked with,
// so assertions can read the exact message text without needing a mounted
// <Toaster/> or relying on sonner's internal rendering.
vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => opts.success?.(result),
                (err) => opts.error?.(err),
            );
            return promise;
        }),
    },
}));

// Radix Select needs these in jsdom; jsdom itself doesn't implement them.
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
}

const mockGetServiceTags = vi.mocked(getServiceTags);
const mockUpgradeService = vi.mocked(upgradeService);
const mockUpdateImages = vi.mocked(updateImages);

function renderDialog(overrides?: Partial<React.ComponentProps<typeof ServiceUpgradeDialog>>) {
    const onOpenChange = vi.fn();
    const onUpgraded = vi.fn();
    const utils = render(
        <ServiceUpgradeDialog
            stackId="my-stack"
            serviceName="web"
            currentTag="1.25"
            open
            onOpenChange={onOpenChange}
            onUpgraded={onUpgraded}
            {...overrides}
        />,
    );
    return {...utils, onOpenChange, onUpgraded};
}

beforeEach(() => {
    mockGetServiceTags.mockReset();
    mockUpgradeService.mockReset();
    mockUpdateImages.mockReset();
    // toast.promise call history must not leak between tests: the no-change
    // test reads the options of the first call it made itself.
    vi.mocked(toast.promise).mockClear();
});

describe("ServiceUpgradeDialog", () => {
    it("shows a loading state while the tags request is pending", () => {
        mockGetServiceTags.mockReturnValue(new Promise(() => {}));

        renderDialog();

        expect(screen.getByRole("status", {name: /loading available versions/i})).toBeInTheDocument();
    });

    it("renders one option per candidate with the latest preselected", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.25",
            latestTag: "1.27",
            candidates: ["1.27", "1.26"],
            isMovingTag: false,
        });

        renderDialog();

        const trigger = await screen.findByRole("combobox", {name: /target version/i});
        expect(trigger).toHaveTextContent("1.27");

        await userEvent.click(trigger);
        const listbox = await screen.findByRole("listbox");
        const options = within(listbox).getAllByRole("option");
        expect(options).toHaveLength(2);
        expect(options.map((o) => o.textContent)).toEqual(["1.27", "1.26"]);
    });

    it("renders a distinct message when the service is already on the newest version", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.27",
            latestTag: "1.27",
            candidates: [],
            isMovingTag: false,
        });

        renderDialog();

        expect(
            await screen.findByText(/already on the newest known version/i),
        ).toBeInTheDocument();
    });

    it("renders a distinct message when the image has never been checked", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.25",
            latestTag: null,
            candidates: [],
            isMovingTag: false,
        });

        renderDialog();

        expect(
            await screen.findByText(/has not been checked for this image yet/i),
        ).toBeInTheDocument();
    });

    describe("moving-tag state", () => {
        const movingTagResponse = {
            currentTag: "latest",
            latestTag: null,
            candidates: [] as string[],
            isMovingTag: true,
        };

        it("explains that the tag is moving and never claims the image is unchecked", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);

            renderDialog({currentTag: "latest"});

            expect(await screen.findByText(/is a moving tag/i)).toBeInTheDocument();
            expect(screen.getByText(/every service in this stack/i)).toBeInTheDocument();
            expect(screen.queryByText(/has not been checked for this image yet/i)).not.toBeInTheDocument();
        });

        it("renders no version picker and a disabled Upgrade button", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);

            renderDialog({currentTag: "latest"});

            await screen.findByText(/is a moving tag/i);
            expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
            expect(screen.getByRole("button", {name: /^upgrade$/i})).toBeDisabled();
        });

        it("requests the tags exactly once per open", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);

            renderDialog({currentTag: "latest"});

            await screen.findByText(/is a moving tag/i);
            expect(mockGetServiceTags).toHaveBeenCalledTimes(1);
        });

        it("offers an Update Images button that closes the dialog and runs the stack-wide update", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);
            mockUpdateImages.mockResolvedValue({success: true, noUpdates: false});

            const {onOpenChange, onUpgraded} = renderDialog({currentTag: "latest"});

            await userEvent.click(await screen.findByRole("button", {name: /update images/i}));

            expect(onOpenChange).toHaveBeenCalledWith(false);
            await waitFor(() => expect(mockUpdateImages).toHaveBeenCalledTimes(1));
            expect(mockUpdateImages).toHaveBeenCalledWith("my-stack");
            await waitFor(() => expect(onUpgraded).toHaveBeenCalledTimes(1));
            expect(mockUpgradeService).not.toHaveBeenCalled();
        });

        it("does not call onUpgraded when the stack-wide update is rejected", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);
            mockUpdateImages.mockRejectedValue(new Error("Cannot UPDATE stack in UPDATING status"));

            const {onUpgraded} = renderDialog({currentTag: "latest"});

            await userEvent.click(await screen.findByRole("button", {name: /update images/i}));

            await waitFor(() => expect(mockUpdateImages).toHaveBeenCalledTimes(1));
            expect(onUpgraded).not.toHaveBeenCalled();
        });

        it("renders the Update Images button exactly once", async () => {
            mockGetServiceTags.mockResolvedValue(movingTagResponse);

            renderDialog({currentTag: "latest"});

            await screen.findByText(/is a moving tag/i);
            expect(screen.getAllByRole("button", {name: /update images/i})).toHaveLength(1);
        });
    });

    describe("non-moving tag (pinned / semver)", () => {
        const waitForReady = () =>
            waitFor(() =>
                expect(screen.queryByRole("status", {name: /loading available versions/i})).not.toBeInTheDocument(),
            );

        it.each([
            ["select", {currentTag: "1.25", latestTag: "1.27", candidates: ["1.27"], isMovingTag: false}],
            ["up-to-date", {currentTag: "0.31", latestTag: "0.31", candidates: [], isMovingTag: false}],
            ["unchecked", {currentTag: "0.31", latestTag: null, candidates: [], isMovingTag: false}],
        ])("offers an enabled Update Images button without the moving-tag Alert in the %s state", async (_name, response) => {
            mockGetServiceTags.mockResolvedValue(response);

            renderDialog();

            await waitForReady();
            expect(await screen.findByRole("button", {name: /update images/i})).toBeEnabled();
            expect(screen.getAllByRole("button", {name: /update images/i})).toHaveLength(1);
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
            expect(screen.queryByText(/every service in this stack/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/is a moving tag/i)).not.toBeInTheDocument();
        });

        it("closes the dialog and runs the stack-wide update for a pinned semver tag", async () => {
            mockGetServiceTags.mockResolvedValue({
                currentTag: "0.31",
                latestTag: "0.31",
                candidates: [],
                isMovingTag: false,
            });
            mockUpdateImages.mockResolvedValue({success: true, noUpdates: false});

            const {onOpenChange, onUpgraded} = renderDialog({serviceName: "memos", currentTag: "0.31"});

            await userEvent.click(await screen.findByRole("button", {name: /update images/i}));

            expect(onOpenChange).toHaveBeenCalledWith(false);
            await waitFor(() => expect(mockUpdateImages).toHaveBeenCalledTimes(1));
            expect(mockUpdateImages).toHaveBeenCalledWith("my-stack");
            await waitFor(() => expect(onUpgraded).toHaveBeenCalledTimes(1));
            expect(mockUpgradeService).not.toHaveBeenCalled();
        });

        it("keeps the version picker and an enabled Upgrade alongside Update Images", async () => {
            mockGetServiceTags.mockResolvedValue({
                currentTag: "1.25",
                latestTag: "1.27",
                candidates: ["1.27"],
                isMovingTag: false,
            });

            renderDialog();

            expect(await screen.findByRole("combobox", {name: /target version/i})).toHaveTextContent("1.27");
            expect(screen.getByRole("button", {name: /^upgrade$/i})).toBeEnabled();
            expect(screen.getByRole("button", {name: /update images/i})).toBeInTheDocument();
        });

        it("keeps the generic description for a pinned tag with no stored check", async () => {
            mockGetServiceTags.mockResolvedValue({
                currentTag: "1.25",
                latestTag: null,
                candidates: [],
                isMovingTag: false,
            });

            renderDialog();

            expect(await screen.findByText(/has not been checked for this image yet/i)).toBeInTheDocument();
            expect(screen.queryByText(/is a moving tag/i)).not.toBeInTheDocument();
        });

        it("renders no Update Images button while loading", () => {
            mockGetServiceTags.mockReturnValue(new Promise(() => {}));

            renderDialog();

            expect(screen.queryByRole("button", {name: /update images/i})).not.toBeInTheDocument();
        });

        it("renders no Update Images button in the error state", async () => {
            mockGetServiceTags.mockRejectedValue(new ApiError("Registry unreachable", 502));

            renderDialog();

            expect(await screen.findByText("Registry unreachable")).toBeInTheDocument();
            expect(screen.queryByRole("button", {name: /update images/i})).not.toBeInTheDocument();
        });
    });

    it("asserts the two empty-state messages are distinct strings", async () => {
        mockGetServiceTags.mockResolvedValueOnce({
            currentTag: "1.27",
            latestTag: "1.27",
            candidates: [],
            isMovingTag: false,
        });
        const {unmount} = renderDialog();
        const upToDateMessage = await screen.findByText(/already on the newest known version/i);
        const upToDateText = upToDateMessage.textContent;
        unmount();

        mockGetServiceTags.mockResolvedValueOnce({
            currentTag: "1.25",
            latestTag: null,
            candidates: [],
            isMovingTag: false,
        });
        renderDialog();
        const neverCheckedMessage = await screen.findByText(/has not been checked for this image yet/i);

        expect(neverCheckedMessage.textContent).not.toEqual(upToDateText);
    });

    it("renders the error message and a working retry on a failed request", async () => {
        mockGetServiceTags.mockRejectedValueOnce(new ApiError("Registry unreachable", 502));

        renderDialog();

        expect(await screen.findByText("Registry unreachable")).toBeInTheDocument();

        mockGetServiceTags.mockResolvedValueOnce({
            currentTag: "1.25",
            latestTag: "1.27",
            candidates: ["1.27"],
            isMovingTag: false,
        });
        await userEvent.click(screen.getByRole("button", {name: /retry/i}));

        await screen.findByRole("combobox", {name: /target version/i});
        expect(mockGetServiceTags).toHaveBeenCalledTimes(2);
    });

    it("calls upgradeService with the stack id, service name and selected tag exactly once on confirm", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.25",
            latestTag: "1.27",
            candidates: ["1.27", "1.26"],
            isMovingTag: false,
        });
        mockUpgradeService.mockResolvedValue({
            success: true,
            changed: true,
            previousTag: "1.25",
            newTag: "1.27",
        });

        const {onUpgraded} = renderDialog();

        await screen.findByRole("combobox", {name: /target version/i});
        await userEvent.click(screen.getByRole("button", {name: /^upgrade$/i}));

        await waitFor(() => expect(mockUpgradeService).toHaveBeenCalledTimes(1));
        expect(mockUpgradeService).toHaveBeenCalledWith("my-stack", "web", "1.27");
        await waitFor(() => expect(onUpgraded).toHaveBeenCalledTimes(1));
    });

    it("shows the no-change message (not the applied-upgrade message) when changed is false", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.25",
            latestTag: "1.26",
            candidates: ["1.26"],
            isMovingTag: false,
        });
        mockUpgradeService.mockResolvedValue({
            success: true,
            changed: false,
            previousTag: "1.26",
            newTag: "1.26",
        });

        renderDialog();

        await screen.findByRole("combobox", {name: /target version/i});
        await userEvent.click(screen.getByRole("button", {name: /^upgrade$/i}));

        await waitFor(() => expect(mockUpgradeService).toHaveBeenCalledTimes(1));

        const promiseCall = vi.mocked(toast.promise).mock.calls[0];
        const successMessage = promiseCall[1].success({
            success: true,
            changed: false,
            previousTag: "1.26",
            newTag: "1.26",
        });
        expect(successMessage).toMatch(/already on 1\.26/i);
        expect(successMessage).not.toMatch(/upgraded to/i);
    });

    it("fires onUpgraded after a successful confirm", async () => {
        mockGetServiceTags.mockResolvedValue({
            currentTag: "1.25",
            latestTag: "1.27",
            candidates: ["1.27"],
            isMovingTag: false,
        });
        mockUpgradeService.mockResolvedValue({
            success: true,
            changed: true,
            previousTag: "1.25",
            newTag: "1.27",
        });

        const {onUpgraded} = renderDialog();

        await screen.findByRole("combobox", {name: /target version/i});
        await userEvent.click(screen.getByRole("button", {name: /^upgrade$/i}));

        await waitFor(() => expect(onUpgraded).toHaveBeenCalledTimes(1));
    });
});
