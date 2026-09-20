import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";

const LABELS: Record<string, string> = {
    DRAFT: "Draft",
    DEPLOYING: "Deploying",
    RUNNING: "Running",
    HEALTHY: "Healthy",
    UNHEALTHY: "Unhealthy",
    STOPPED: "Stopped",
    ERROR: "Error",
    UPDATING: "Updating",
    BACKING_UP: "Backing Up",
    RESTORING: "Restoring",
    MIGRATING: "Migrating",
};

describe("StackStatusBadge", () => {
    it.each(Object.entries(LABELS))("renders status %s as label %s", (status, label) => {
        render(<StackStatusBadge status={status} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("resolves the Backing Up query to the Badge element itself", () => {
        render(<StackStatusBadge status="BACKING_UP" />);
        const badge = screen.getByText("Backing Up");
        expect(badge).toHaveAttribute("data-slot", "badge");
    });

    it("applies the blue action treatment to BACKING_UP, matching DEPLOYING (G-08-7)", () => {
        render(<StackStatusBadge status="BACKING_UP" />);
        const badge = screen.getByText("Backing Up");
        expect(badge.className).toContain("bg-blue-500/15");
        expect(badge.className).toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "default");
    });

    it("applies animate-pulse to RESTORING without promoting it to the blue action color", () => {
        render(<StackStatusBadge status="RESTORING" />);
        const badge = screen.getByText("Restoring");
        expect(badge.className).toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "outline");
        expect(badge.className).not.toContain("bg-blue-500");
        expect(badge.className).not.toContain("text-blue-700");
    });

    it("applies animate-pulse to MIGRATING without promoting it to the blue action color", () => {
        render(<StackStatusBadge status="MIGRATING" />);
        const badge = screen.getByText("Migrating");
        expect(badge.className).toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "outline");
        expect(badge.className).not.toContain("bg-blue-500");
        expect(badge.className).not.toContain("text-blue-700");
    });

    it("keeps DEPLOYING blue and pulsing (regression lock)", () => {
        render(<StackStatusBadge status="DEPLOYING" />);
        const badge = screen.getByText("Deploying");
        expect(badge.className).toContain("bg-blue-500/15");
        expect(badge.className).toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "default");
    });

    it("keeps UPDATING blue and pulsing (regression lock)", () => {
        render(<StackStatusBadge status="UPDATING" />);
        const badge = screen.getByText("Updating");
        expect(badge.className).toContain("bg-blue-500/15");
        expect(badge.className).toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "default");
    });

    it.each([
        ["RUNNING", "Running"],
        ["HEALTHY", "Healthy"],
    ])("renders %s green with no motion", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge.className).toContain("bg-green-500/15");
        expect(badge.className).not.toContain("animate-pulse");
    });

    it.each([
        ["ERROR", "Error"],
        ["UNHEALTHY", "Unhealthy"],
    ])("renders %s red with no motion and the destructive variant", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge.className).toContain("bg-red-500/15");
        expect(badge.className).not.toContain("animate-pulse");
        expect(badge).toHaveAttribute("data-variant", "destructive");
    });

    it.each([
        ["STOPPED", "Stopped"],
        ["DRAFT", "Draft"],
    ])("renders %s gray with no motion", (status, label) => {
        render(<StackStatusBadge status={status} />);
        const badge = screen.getByText(label);
        expect(badge.className).toContain("bg-gray-500/15");
        expect(badge.className).not.toContain("animate-pulse");
    });

    it("renders the raw status string for an unrecognized status with no color or motion", () => {
        render(<StackStatusBadge status="SOME_FUTURE_STATUS" />);
        const badge = screen.getByText("SOME_FUTURE_STATUS");
        expect(badge).toHaveAttribute("data-variant", "outline");
        expect(badge.className).not.toContain("animate-pulse");
    });
});
