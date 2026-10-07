import {toast} from "sonner";

import {updateImages} from "@/lib/stacks-api";

/**
 * The stack-level "Update Images" action, shared by the header menu item and
 * the per-service upgrade dialog's moving-tag shortcut so the loading /
 * success / error toast copy has exactly one home. A rejected request (for
 * example the server's guardTransition refusing while another operation holds
 * the stack) surfaces as the error toast and never calls `onSuccess`.
 */
export function runUpdateImages(stackId: string, onSuccess: () => void): void {
    toast.promise(
        (async () => {
            const result = await updateImages(stackId);
            onSuccess();
            return result;
        })(),
        {
            loading: "Updating images...",
            success: (result) =>
                result.noUpdates ? "Images are already up to date" : "Images updated successfully",
            error: (err: Error) => err?.message ?? "Update images failed",
        },
    );
}
