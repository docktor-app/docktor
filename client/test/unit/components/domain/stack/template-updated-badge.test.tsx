import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TemplateUpdatedBadge} from "@/components/domain/stack/template-updated-badge";

// jsdom has no ResizeObserver — Radix's Tooltip.Content positioning
// internals require one (same pattern as compatibility-badge's consumers).
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

describe("TemplateUpdatedBadge (Issue #19/D-08)", () => {
    it("renders nothing when templateUpdateAvailable is false", () => {
        render(<TemplateUpdatedBadge stack={{templateUpdateAvailable: false, templatePath: "nextcloud/default"}}/>);
        expect(screen.queryByText("template updated")).not.toBeInTheDocument();
    });

    it("renders nothing when templateUpdateAvailable is undefined", () => {
        render(<TemplateUpdatedBadge stack={{templateUpdateAvailable: undefined, templatePath: "nextcloud/default"}}/>);
        expect(screen.queryByText("template updated")).not.toBeInTheDocument();
    });

    it("renders a blue ToneBadge with 'template updated' when templateUpdateAvailable is true", () => {
        render(<TemplateUpdatedBadge stack={{templateUpdateAvailable: true, templatePath: "nextcloud/default"}}/>);
        const badge = screen.getByText("template updated");
        expect(badge).toBeInTheDocument();
        expect(badge.closest("[data-tone]")).toHaveAttribute("data-tone", "blue");
    });

    it("shows a tooltip mentioning the template path and that the stack is unchanged", async () => {
        const user = userEvent.setup();
        render(<TemplateUpdatedBadge stack={{templateUpdateAvailable: true, templatePath: "nextcloud/default"}}/>);

        await user.hover(screen.getByText("template updated"));

        const tooltipText = await screen.findAllByText(/nextcloud\/default/);
        expect(tooltipText.length).toBeGreaterThan(0);
        const unchangedText = await screen.findAllByText(/unchanged/i);
        expect(unchangedText.length).toBeGreaterThan(0);
    });
});
