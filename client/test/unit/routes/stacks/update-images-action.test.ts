import {beforeEach, describe, expect, it, vi} from "vitest";
import {toast} from "sonner";
import {updateImages} from "@/lib/stacks-api";
import {runUpdateImages} from "../../../../src/routes/app/stacks/components/update-images-action";

vi.mock("@/lib/stacks-api", () => ({
    updateImages: vi.fn(),
}));

// Run the callbacks toast.promise is invoked with so assertions can read the
// exact message text without a mounted <Toaster/>.
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

const mockUpdateImages = vi.mocked(updateImages);
const mockToastPromise = vi.mocked(toast.promise);

interface CapturedToastOptions {
    loading: string;
    success: (result: {noUpdates: boolean}) => string;
    error: (err: Error) => string;
}

function toastOptions(): CapturedToastOptions {
    const call = mockToastPromise.mock.calls[0];
    if (!call) throw new Error("toast.promise was not called");
    // The mock above treats the options as an untyped bag; narrow it here.
    return call[1] as unknown as CapturedToastOptions;
}

beforeEach(() => {
    mockUpdateImages.mockReset();
    mockToastPromise.mockClear();
});

describe("runUpdateImages", () => {
    it("calls updateImages for the stack exactly once and then onSuccess", async () => {
        mockUpdateImages.mockResolvedValue({success: true, noUpdates: false});
        const onSuccess = vi.fn();

        runUpdateImages("my-stack", onSuccess);

        await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(mockUpdateImages).toHaveBeenCalledTimes(1);
        expect(mockUpdateImages).toHaveBeenCalledWith("my-stack");
    });

    it("uses the loading copy 'Updating images...'", () => {
        mockUpdateImages.mockReturnValue(new Promise(() => {}));

        runUpdateImages("my-stack", vi.fn());

        expect(toastOptions().loading).toBe("Updating images...");
    });

    it("reports 'Images are already up to date' when nothing changed", () => {
        mockUpdateImages.mockReturnValue(new Promise(() => {}));

        runUpdateImages("my-stack", vi.fn());

        expect(toastOptions().success({noUpdates: true})).toBe("Images are already up to date");
    });

    it("reports 'Images updated successfully' when something changed", () => {
        mockUpdateImages.mockReturnValue(new Promise(() => {}));

        runUpdateImages("my-stack", vi.fn());

        expect(toastOptions().success({noUpdates: false})).toBe("Images updated successfully");
    });

    it("surfaces the server's message on rejection and never calls onSuccess", async () => {
        mockUpdateImages.mockRejectedValue(new Error("Cannot UPDATE stack in UPDATING status"));
        const onSuccess = vi.fn();

        runUpdateImages("my-stack", onSuccess);

        await vi.waitFor(() => expect(mockUpdateImages).toHaveBeenCalledTimes(1));
        expect(toastOptions().error(new Error("Cannot UPDATE stack in UPDATING status"))).toBe(
            "Cannot UPDATE stack in UPDATING status",
        );
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("falls back to 'Update images failed' when the error has no message", () => {
        mockUpdateImages.mockReturnValue(new Promise(() => {}));

        runUpdateImages("my-stack", vi.fn());

        expect(toastOptions().error(undefined as unknown as Error)).toBe("Update images failed");
    });
});
