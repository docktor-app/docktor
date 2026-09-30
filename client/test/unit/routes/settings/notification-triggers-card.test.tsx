import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {NotificationTriggersCard} from "@/routes/app/settings/components/notification-triggers-card";
import {getNotificationTriggers, updateNotificationTriggers} from "@/lib/notifications-api";

vi.mock("@/lib/notifications-api", () => ({
    getNotificationTriggers: vi.fn(),
    updateNotificationTriggers: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const mockGetNotificationTriggers = vi.mocked(getNotificationTriggers);
const mockUpdateNotificationTriggers = vi.mocked(updateNotificationTriggers);

describe("NotificationTriggersCard", () => {
    beforeEach(() => {
        mockGetNotificationTriggers.mockReset();
        mockUpdateNotificationTriggers.mockReset();
        mockUpdateNotificationTriggers.mockResolvedValue(undefined);
        mockGetNotificationTriggers.mockResolvedValue({
            stackError: false,
            diskWarning: true,
            diskThresholdPercent: 10,
            diskThresholdBytes: 2147483648,
            backupFailure: false,
        });
    });

    // Regression for WR-02: the percent input's onChange only called the
    // setter when the parsed value was in range, so typing an out-of-range
    // number left the DOM showing the raw typed value while React's state
    // (and whatever gets saved onBlur) silently stayed at the last valid
    // value — a stale DOM/state mismatch.
    it("clamps an out-of-range percent value instead of leaving the input showing an unsaved value", async () => {
        const user = userEvent.setup();
        render(<NotificationTriggersCard />);

        const percentInput = await screen.findByLabelText("Threshold (%)");
        await user.clear(percentInput);
        await user.type(percentInput, "150");

        // The DOM must always reflect the clamped state value — never a raw
        // out-of-range value the component silently declined to store.
        expect(percentInput).toHaveValue(99);
    });

    it("clamps a zero/invalid bytes threshold to a minimum instead of leaving the input unsynced", async () => {
        const user = userEvent.setup();
        render(<NotificationTriggersCard />);

        const bytesInput = await screen.findByLabelText("Threshold (bytes)");
        await user.clear(bytesInput);
        await user.type(bytesInput, "0");

        // parseBytes("0") returns 0, which must still resync the controlled
        // input (formatted via formatBytes) rather than leaving the raw "0"
        // in the DOM disconnected from component state.
        expect(bytesInput).toHaveValue("1 B");
    });
});
