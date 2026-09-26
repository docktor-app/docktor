import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";
import {StatusDot} from "@/components/common/status-dot";

describe("StatusDot", () => {
    it("renders an aria-hidden dot with data-slot, data-tone, and data-pulse false by default", () => {
        const {container} = render(<StatusDot tone="green" />);
        const dot = container.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("aria-hidden", "true");
        expect(dot).toHaveAttribute("data-tone", "green");
        expect(dot).toHaveAttribute("data-pulse", "false");
        expect(dot?.querySelector(".animate-ping")).toBeNull();
    });

    it("renders a pulsing ripple layer plus the core when pulse is true", () => {
        const {container} = render(<StatusDot tone="green" pulse />);
        const dot = container.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "true");
        const ripple = dot?.querySelector(".animate-ping");
        expect(ripple).not.toBeNull();
        expect(ripple?.className).toContain("motion-reduce:animate-none");
    });
});
