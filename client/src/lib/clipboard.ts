import {toast} from "sonner";

export const CLIPBOARD_FAILED_MESSAGE = "Couldn't copy. Select the codes and copy them manually.";

/**
 * Writes text to the clipboard. `navigator.clipboard` is undefined on plain-http
 * origins (a supported LAN setup), and the write can be rejected by the
 * browser, so both cases end in a toast instead of an exception. There is no
 * legacy document copy-command fallback: it is deprecated, and the callers
 * keep their content as selectable text.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (!navigator.clipboard?.writeText) {
            throw new Error("Clipboard API unavailable");
        }
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        toast.error(CLIPBOARD_FAILED_MESSAGE);
        return false;
    }
}
