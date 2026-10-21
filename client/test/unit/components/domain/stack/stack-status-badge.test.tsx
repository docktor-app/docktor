import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StackStatusBadge, getStackStatusPresentation} from "@/components/domain/stack/stack-status-badge";

const LABELS: Record<string, string> = {
    DRAFT: "draft",
    DEPLOYING: "deploying",
    RUNNING: "running",
    HEALTHY: "healthy",
    UNHEALTHY: "unhealthy",
    STOPPED: "stopped",
    ERROR: "error",
    UPDATING: "updating",
    BACKING_UP: "backing up",
    RESTORING: "restoring",
    MIGRATING: "migrating",
};

describe("StackStatusBadge", () => {
    it.each(Object.entries(LABELS))("renders status %s as label %s", (status, label) => {
        render(<StackStatusBadge status={status} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("renders the Badge element itself for the default display", () => {
        render(<StackStatusBadge status="BACKING_UP" />);
        const badge = screen.getByText("backing up");
        expect(badge).toHaveAttribute("data-slot", "badge");
    });

    it.each([
        ["RUNNING", "running"],
        ["HEALTHY", "healthy"],
    ])("renders %s green with a pulsing status dot", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge).toHaveAttribute("data-tone", "green");
        expect(badge.className).not.toContain("animate-pulse");
        const dot = badge.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "true");
        expect(dot).toHaveAttribute("data-tone", "green");
    });

    it.each([
        ["DEPLOYING", "deploying"],
        ["UPDATING", "updating"],
        ["BACKING_UP", "backing up"],
    ])("keeps %s blue with the pulsing badge treatment (G-08-7 regression lock)", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge).toHaveAttribute("data-tone", "blue");
        expect(badge.className).toContain("animate-pulse");
        const dot = badge.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "false");
    });

    it.each([
        ["RESTORING", "restoring"],
        ["MIGRATING", "migrating"],
    ])("pulses %s without promoting it to the blue tone (G-08-7)", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge).toHaveAttribute("data-tone", "neutral");
        expect(badge.className).toContain("animate-pulse");
    });

    it.each([
        ["ERROR", "error"],
        ["UNHEALTHY", "unhealthy"],
    ])("renders %s red with no motion", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge).toHaveAttribute("data-tone", "red");
        expect(badge.className).not.toContain("animate-pulse");
    });

    it.each([
        ["STOPPED", "stopped"],
        ["DRAFT", "draft"],
    ])("renders %s neutral with no motion", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge).toHaveAttribute("data-tone", "neutral");
        expect(badge.className).not.toContain("animate-pulse");
    });

    it("renders the lowercased status string for an unrecognized status, neutral and static", () => {
        render(<StackStatusBadge status="WEIRD" />);
        const badge = screen.getByText("weird");
        expect(badge).toHaveAttribute("data-tone", "neutral");
        expect(badge.className).not.toContain("animate-pulse");
    });

    it("renders display=compact as a dot + label without the Badge element", () => {
        render(<StackStatusBadge status="RUNNING" display="compact" />);
        const label = screen.getByText("running");
        expect(label.closest('[data-slot="badge"]')).toBeNull();
        const dot = document.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "true");
    });

    it("getStackStatusPresentation returns the fallback shape for an unknown status", () => {
        expect(getStackStatusPresentation("WEIRD")).toEqual({
            label: "weird",
            tone: "neutral",
            dotPulse: false,
            badgePulse: false,
        });
    });
});
