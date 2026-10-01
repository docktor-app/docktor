import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {ToneBadge} from "@/components/common/tone-badge";

describe("ToneBadge", () => {
    it("renders a Badge element carrying data-tone", () => {
        render(<ToneBadge tone="green">Healthy</ToneBadge>);
        const badge = screen.getByText("Healthy");
        expect(badge).toHaveAttribute("data-slot", "badge");
        expect(badge).toHaveAttribute("data-tone", "green");
    });

    it("defaults to the neutral tone when none is given", () => {
        render(<ToneBadge>Unknown</ToneBadge>);
        expect(screen.getByText("Unknown")).toHaveAttribute("data-tone", "neutral");
    });

    it("adds animate-pulse plus the motion-reduce override when pulse is true", () => {
        render(<ToneBadge tone="blue" pulse>Deploying</ToneBadge>);
        const badge = screen.getByText("Deploying");
        expect(badge.className).toContain("animate-pulse");
        expect(badge.className).toContain("motion-reduce:animate-none");
    });

    it("does not pulse by default", () => {
        render(<ToneBadge tone="blue">Deploying</ToneBadge>);
        expect(screen.getByText("Deploying").className).not.toContain("animate-pulse");
    });

    it.each(["green", "red", "yellow", "blue", "orange"] as const)(
        "applies a dark-mode-aware class for the %s tone",
        (tone) => {
            render(<ToneBadge tone={tone}>Label</ToneBadge>);
            expect(screen.getByText("Label").className).toContain("dark:");
        },
    );
});
