import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {UptimeBadge} from "@/components/domain/stack/uptime-badge";

describe("UptimeBadge", () => {
    it("truncates the percentage and tones it green with the window title", () => {
        render(<UptimeBadge percent={99.95} windowDays={30} />);

        const badge = screen.getByText("99.9%");
        expect(badge).toHaveAttribute("data-tone", "green");
        expect(badge).toHaveAttribute("title", "Uptime over the last 30 days");
    });

    it("tones a low percentage red", () => {
        render(<UptimeBadge percent={98.5} windowDays={30} />);

        expect(screen.getByText("98.5%")).toHaveAttribute("data-tone", "red");
    });

    it("tones a percentage between 99 and 99.9 yellow", () => {
        render(<UptimeBadge percent={99.5} windowDays={7} />);

        const badge = screen.getByText("99.5%");
        expect(badge).toHaveAttribute("data-tone", "yellow");
        expect(badge).toHaveAttribute("title", "Uptime over the last 7 days");
    });

    it("renders an em dash with an accessible name when there is no data", () => {
        render(<UptimeBadge percent={null} windowDays={30} />);

        const badge = screen.getByLabelText("No uptime data");
        expect(badge).toHaveTextContent("—");
        expect(badge).toHaveAttribute("data-tone", "neutral");
        expect(badge).toHaveAttribute("title", "No data in this window");
    });

    it("falls back to a plain title when the window is unknown", () => {
        render(<UptimeBadge percent={100} windowDays={null} />);

        expect(screen.getByText("100%")).toHaveAttribute("title", "Uptime");
    });
});
