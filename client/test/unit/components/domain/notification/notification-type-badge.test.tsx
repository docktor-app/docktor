import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {
    NotificationTypeBadge,
    describeNotificationType,
} from "@/components/domain/notification/notification-type-badge";

describe("describeNotificationType", () => {
    it('maps "stack_error" to the Error label in the red tone', () => {
        expect(describeNotificationType("stack_error")).toEqual({label: "Error", tone: "red"});
    });

    it('maps "stack_unhealthy" to the Unhealthy label in the yellow tone', () => {
        expect(describeNotificationType("stack_unhealthy")).toEqual({label: "Unhealthy", tone: "yellow"});
    });

    it('maps "disk_warning" to the Disk label in the orange tone', () => {
        expect(describeNotificationType("disk_warning")).toEqual({label: "Disk", tone: "orange"});
    });

    it("falls back to the raw value in the neutral tone for an unknown type", () => {
        expect(describeNotificationType("something_new")).toEqual({label: "something_new", tone: "neutral"});
    });
});

describe("NotificationTypeBadge", () => {
    it("renders the Error label with the red tone for stack_error", () => {
        render(<NotificationTypeBadge type="stack_error" />);
        expect(screen.getByText("Error")).toHaveAttribute("data-tone", "red");
    });

    it("renders the raw type value with the neutral tone for an unknown type", () => {
        render(<NotificationTypeBadge type="something_new" />);
        expect(screen.getByText("something_new")).toHaveAttribute("data-tone", "neutral");
    });
});
