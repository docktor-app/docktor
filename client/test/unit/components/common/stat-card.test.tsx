import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StatCard} from "@/components/common/stat-card";

describe("StatCard", () => {
    it("renders a Skeleton and no value while loading", () => {
        const {container} = render(
            <StatCard label="Total Stacks" value={4} icon={<span data-testid="icon" />} loading />,
        );

        expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
        expect(screen.queryByText("4")).not.toBeInTheDocument();
    });

    it("renders the label and value when not loading", () => {
        render(<StatCard label="Total Stacks" value={4} icon={<span data-testid="icon" />} />);

        expect(screen.getByText("Total Stacks")).toBeInTheDocument();
        expect(screen.getByText("4")).toBeInTheDocument();
        expect(screen.getByTestId("icon")).toBeInTheDocument();
    });

    it("UI-SPEC long-text backstop: a large value truncates and exposes the full number via title", () => {
        render(<StatCard label="Total Stacks" value={1234567} icon={<span />} />);

        const value = screen.getByText("1234567");
        expect(value).toHaveAttribute("title", "1234567");
        expect(value.className).toContain("truncate");
        expect(value.className).toContain("font-semibold");
    });

    it("never uses font-bold on the value", () => {
        render(<StatCard label="Errors" value={0} icon={<span />} />);
        expect(screen.getByText("0").className).not.toContain("font-bold");
    });

    it("applies a custom valueClassName alongside the base classes", () => {
        render(<StatCard label="Running" value={2} icon={<span />} valueClassName="text-green-600" />);
        const value = screen.getByText("2");
        expect(value.className).toContain("text-green-600");
        expect(value.className).toContain("font-semibold");
    });

    it("carries data-slot=stat-card on the outer element", () => {
        const {container} = render(<StatCard label="Total Stacks" value={0} icon={<span />} />);
        expect(container.querySelector('[data-slot="stat-card"]')).toBeInTheDocument();
    });

    it("renders a hint under the value in muted xs text when provided", () => {
        render(<StatCard label="Coverage" value="3/5" icon={<span />} hint="with a schedule or snapshot" />);

        const hint = screen.getByText("with a schedule or snapshot");
        expect(hint.className).toContain("text-xs");
        expect(hint.className).toContain("text-muted-foreground");
    });

    it("renders no hint element without a hint", () => {
        const {container} = render(<StatCard label="Coverage" value="3/5" icon={<span />} />);
        expect(container.querySelector("p")).not.toBeInTheDocument();
    });

    it("renders no hint while loading", () => {
        render(<StatCard label="Coverage" value="3/5" icon={<span />} hint="a hint" loading />);
        expect(screen.queryByText("a hint")).not.toBeInTheDocument();
    });

    it("renders the value in mono with tabular figures (D-06)", () => {
        render(<StatCard label="Total Stacks" value={7} icon={<span />} />);
        const value = screen.getByText("7");
        for (const token of ["font-mono", "tabular-nums", "font-semibold", "truncate"]) {
            expect(value.className).toContain(token);
        }
        expect(value.className).not.toContain("font-bold");
    });

    it("renders the label in mono text-xs and lets it wrap instead of truncating", () => {
        render(<StatCard label="Updates Available" value={1} icon={<span />} />);
        const label = screen.getByText("Updates Available");
        expect(label.className).toContain("font-mono");
        expect(label.className).toContain("text-xs");
        expect(label.className).not.toContain("truncate");
    });

    it("keeps the icon from shrinking next to a wrapping label", () => {
        render(<StatCard label="Updates Available" value={1} icon={<span data-testid="icon" />} />);
        expect(screen.getByTestId("icon").parentElement?.className).toContain("shrink-0");
    });

    it("sizes the loading skeleton to fit an n/total value", () => {
        const {container} = render(<StatCard label="Coverage" value="3/5" icon={<span />} loading />);
        expect(container.querySelector('[data-slot="skeleton"]')?.className).toContain("w-16");
    });
});
