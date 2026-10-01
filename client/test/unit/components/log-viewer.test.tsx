import {beforeEach, describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {LogViewer} from "../../../src/components/domain/stack/log-viewer.js";
import {useLogStream} from "@/hooks/use-log-stream";

vi.mock("@/hooks/use-log-stream", () => ({
    useLogStream: vi.fn(),
}));

const mockUseLogStream = vi.mocked(useLogStream);

beforeEach(() => {
    mockUseLogStream.mockReset();
    mockUseLogStream.mockReturnValue({lines: [], connected: true, clear: vi.fn()});
});

describe("LogViewer (OBS-07, OBS-09)", () => {
    it("renders a dark terminal container (bg-black or bg-gray-900)", () => {
        render(<LogViewer stackId="my-stack" />);

        // The component root or a child must have a dark background class
        const terminal = screen.getByTestId("log-viewer-terminal");
        const classList = terminal.className;
        expect(classList).toMatch(/bg-black|bg-gray-900/);
    });

    it("renders ANSI colored text without dangerouslySetInnerHTML (OBS-07)", () => {
        mockUseLogStream.mockReturnValue({
            lines: [{type: "log", service: "web", line: "\u001b[31mred\u001b[0m"}],
            connected: true,
            clear: vi.fn(),
        });

        render(<LogViewer stackId="my-stack" />);

        const styled = screen.getByText("red");
        expect(styled.tagName.toLowerCase()).toBe("span");
    });

    it("LogViewer dropdown shows 'All services' + individual service options (OBS-09)", () => {
        render(<LogViewer stackId="my-stack" />);

        // Service selector must include "All services" as an option
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByText(/all services/i)).toBeInTheDocument();
    });

    it("prefixes each line with service name in combined view (OBS-07)", () => {
        mockUseLogStream.mockReturnValue({
            lines: [{type: "log", service: "web", line: "hello"}],
            connected: true,
            clear: vi.fn(),
        });

        // Default selectedService is "all" — the combined view — so the prefix must show.
        render(<LogViewer stackId="my-stack" />);

        expect(screen.getByText("[web]")).toBeInTheDocument();
    });

    it("hides the service prefix once a single service is selected", () => {
        mockUseLogStream.mockReturnValue({
            lines: [{type: "log", service: "web", line: "hello"}],
            connected: true,
            clear: vi.fn(),
        });

        render(<LogViewer stackId="my-stack" initialService="web" />);

        expect(screen.queryByText("[web]")).not.toBeInTheDocument();
    });

    it("shows auto-scroll, timestamps, line-wrap, and clear toolbar buttons (OBS-07)", () => {
        render(<LogViewer stackId="my-stack" />);

        expect(screen.getByRole("button", {name: /auto-scroll/i})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /timestamps/i})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /wrap/i})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /clear/i})).toBeInTheDocument();
    });

    it("exposes aria-pressed on the Auto-scroll/Timestamps/Wrap toggle buttons", () => {
        render(<LogViewer stackId="my-stack" />);

        expect(screen.getByRole("button", {name: /auto-scroll/i})).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", {name: /timestamps/i})).toHaveAttribute(
            "aria-pressed",
            "false",
        );
        expect(screen.getByRole("button", {name: /wrap/i})).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("clicking Timestamps adds an HH:MM:SS timestamp before each line", () => {
        mockUseLogStream.mockReturnValue({
            lines: [{type: "log", service: "web", line: "hello", timestamp: "2026-01-01T12:34:56Z"}],
            connected: true,
            clear: vi.fn(),
        });

        render(<LogViewer stackId="my-stack" />);

        expect(screen.queryByText(/\d{2}:\d{2}:\d{2}/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: /timestamps/i}));

        expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });

    it("clicking Wrap switches the line to wrapped classes", () => {
        mockUseLogStream.mockReturnValue({
            lines: [{type: "log", service: "web", line: "hello"}],
            connected: true,
            clear: vi.fn(),
        });

        render(<LogViewer stackId="my-stack" />);

        const line = () => screen.getByText("hello").closest("div");
        expect(line()?.className).toContain("whitespace-pre");
        expect(line()?.className).not.toContain("break-all");

        fireEvent.click(screen.getByRole("button", {name: /wrap/i}));

        expect(line()?.className).toContain("whitespace-pre-wrap");
        expect(line()?.className).toContain("break-all");
    });
});
