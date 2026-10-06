import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {ComposeWarningBadge} from "@/components/domain/stack/compose-warning-badge";

describe("ComposeWarningBadge", () => {
    it('renders "Privileged container" with data-tone="red" for a danger finding', () => {
        render(<ComposeWarningBadge finding={{ruleId: "privileged", severity: "danger"}} />);
        const badge = screen.getByText("Privileged container");
        expect(badge).toHaveAttribute("data-tone", "red");
    });

    it('renders "Named volume" with data-tone="yellow" for a warning finding', () => {
        render(<ComposeWarningBadge finding={{ruleId: "namedVolume", severity: "warning"}} />);
        const badge = screen.getByText("Named volume");
        expect(badge).toHaveAttribute("data-tone", "yellow");
    });

    it("renders every always-on rule id in red", () => {
        for (const ruleId of ["privileged", "dockerSocket", "bindOutsideStack"] as const) {
            const {unmount} = render(<ComposeWarningBadge finding={{ruleId, severity: "danger"}} />);
            const badges = screen.getAllByText(/./).filter((el) => el.hasAttribute("data-tone"));
            expect(badges.some((el) => el.getAttribute("data-tone") === "red")).toBe(true);
            unmount();
        }
    });

    it("renders every configurable rule id in yellow", () => {
        for (const ruleId of ["namedVolume", "inlineEnv", "missingEnvFile"] as const) {
            const {unmount} = render(<ComposeWarningBadge finding={{ruleId, severity: "warning"}} />);
            const badges = screen.getAllByText(/./).filter((el) => el.hasAttribute("data-tone"));
            expect(badges.some((el) => el.getAttribute("data-tone") === "yellow")).toBe(true);
            unmount();
        }
    });
});
