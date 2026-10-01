import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {ServiceStatusBadge, getServiceStatusPresentation} from "@/components/domain/stack/service-status-badge";

describe("ServiceStatusBadge", () => {
    it("renders running+healthy as a pulsing green dot", () => {
        render(<ServiceStatusBadge containerState="running" healthStatus="healthy" />);
        const badge = screen.getByText("healthy");
        expect(badge).toHaveAttribute("data-tone", "green");
        const dot = badge.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "true");
    });

    it("renders running+unhealthy as a static red dot", () => {
        render(<ServiceStatusBadge containerState="running" healthStatus="unhealthy" />);
        const badge = screen.getByText("unhealthy");
        expect(badge).toHaveAttribute("data-tone", "red");
        const dot = badge.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "false");
    });

    it("renders running with no health info as a pulsing green dot (matches the healthy running tone)", () => {
        render(<ServiceStatusBadge containerState="running" healthStatus={null} />);
        const badge = screen.getByText("running");
        expect(badge).toHaveAttribute("data-tone", "green");
        const dot = badge.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute("data-pulse", "true");
    });

    it("renders exited as a static neutral dot", () => {
        render(<ServiceStatusBadge containerState="exited" healthStatus={null} />);
        const badge = screen.getByText("exited");
        expect(badge).toHaveAttribute("data-tone", "neutral");
    });

    it("renders restarting as a static yellow dot", () => {
        render(<ServiceStatusBadge containerState="restarting" healthStatus={null} />);
        const badge = screen.getByText("restarting");
        expect(badge).toHaveAttribute("data-tone", "yellow");
    });

    it("renders unknown when containerState is null", () => {
        render(<ServiceStatusBadge containerState={null} healthStatus={null} />);
        const badge = screen.getByText("unknown");
        expect(badge).toHaveAttribute("data-tone", "neutral");
    });

    it("renders the raw state for an unrecognized containerState as a neutral static dot", () => {
        render(<ServiceStatusBadge containerState="paused" healthStatus={null} />);
        const badge = screen.getByText("paused");
        expect(badge).toHaveAttribute("data-tone", "neutral");
    });

    it("getServiceStatusPresentation returns the expected presentation for each state", () => {
        expect(getServiceStatusPresentation(null, null)).toEqual({label: "unknown", tone: "neutral", dotPulse: false});
        expect(getServiceStatusPresentation("running", "healthy")).toEqual({label: "healthy", tone: "green", dotPulse: true});
        expect(getServiceStatusPresentation("running", "unhealthy")).toEqual({label: "unhealthy", tone: "red", dotPulse: false});
        expect(getServiceStatusPresentation("running", null)).toEqual({label: "running", tone: "green", dotPulse: true});
        expect(getServiceStatusPresentation("exited", null)).toEqual({label: "exited", tone: "neutral", dotPulse: false});
        expect(getServiceStatusPresentation("restarting", null)).toEqual({label: "restarting", tone: "yellow", dotPulse: false});
        expect(getServiceStatusPresentation("paused", null)).toEqual({label: "paused", tone: "neutral", dotPulse: false});
    });
});
