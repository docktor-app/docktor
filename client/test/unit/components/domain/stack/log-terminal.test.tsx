import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {LogTerminal, formatLogTimestamp} from "@/components/domain/stack/log-terminal";
import {getServiceColor} from "@/lib/service-color";

describe("LogTerminal", () => {
    it("renders the empty message in muted text when there are no lines", () => {
        render(<LogTerminal lines={[]} autoScroll={false} />);

        const empty = screen.getByText("No log output yet...");
        expect(empty.className).toContain("text-gray-500");
    });

    it("renders a custom emptyMessage when provided", () => {
        render(<LogTerminal lines={[]} autoScroll={false} emptyMessage="Waiting for output…" />);

        expect(screen.getByText("Waiting for output…")).toBeInTheDocument();
    });

    it("renders a service prefix colored by getServiceColor when showServicePrefix is true", () => {
        render(
            <LogTerminal
                lines={[{line: "hello", service: "web"}]}
                autoScroll={false}
                showServicePrefix
            />,
        );

        const prefix = screen.getByText("[web]");
        expect(prefix.className).toBe(getServiceColor("web"));
    });

    it("renders no prefix when showServicePrefix is false", () => {
        render(
            <LogTerminal
                lines={[{line: "hello", service: "web"}]}
                autoScroll={false}
                showServicePrefix={false}
            />,
        );

        expect(screen.queryByText("[web]")).not.toBeInTheDocument();
    });

    it("renders no prefix when the line has no service, even with showServicePrefix true", () => {
        render(
            <LogTerminal lines={[{line: "hello"}]} autoScroll={false} showServicePrefix />,
        );

        expect(screen.queryByText(/^\[.*]$/)).not.toBeInTheDocument();
    });

    it("renders the HH:MM:SS timestamp before the line when showTimestamps is true", () => {
        render(
            <LogTerminal
                lines={[{line: "hello", timestamp: "2026-01-01T12:34:56Z"}]}
                autoScroll={false}
                showTimestamps
            />,
        );

        expect(screen.getByText(formatLogTimestamp("2026-01-01T12:34:56Z"))).toBeInTheDocument();
    });

    it("renders nothing extra when there is no timestamp on the line", () => {
        const {container} = render(
            <LogTerminal lines={[{line: "hello"}]} autoScroll={false} showTimestamps />,
        );

        expect(container.querySelector(".text-gray-400")).not.toBeInTheDocument();
    });

    it("applies wrap classes when lineWrap is true", () => {
        render(<LogTerminal lines={[{line: "hello"}]} autoScroll={false} lineWrap />);

        const line = screen.getByText("hello").closest("div");
        expect(line?.className).toContain("whitespace-pre-wrap");
        expect(line?.className).toContain("break-all");
    });

    it("applies the non-wrap class when lineWrap is false", () => {
        render(<LogTerminal lines={[{line: "hello"}]} autoScroll={false} lineWrap={false} />);

        const line = screen.getByText("hello").closest("div");
        expect(line?.className).toContain("whitespace-pre");
        expect(line?.className).not.toContain("whitespace-pre-wrap");
    });

    it("renders ANSI escape sequences as styled spans, not raw text", () => {
        render(<LogTerminal lines={[{line: "\u001b[31mred\u001b[0m"}]} autoScroll={false} />);

        const styled = screen.getByText("red");
        expect(styled.tagName.toLowerCase()).toBe("span");
    });

    it("uses the provided testId on the container", () => {
        render(<LogTerminal lines={[]} autoScroll={false} testId="custom-terminal" />);

        expect(screen.getByTestId("custom-terminal")).toBeInTheDocument();
    });

    it("sets aria-live to polite while autoScroll is true and off otherwise", () => {
        const {rerender} = render(<LogTerminal lines={[]} autoScroll={true} />);
        expect(screen.getByTestId("log-terminal")).toHaveAttribute("aria-live", "polite");

        rerender(<LogTerminal lines={[]} autoScroll={false} />);
        expect(screen.getByTestId("log-terminal")).toHaveAttribute("aria-live", "off");
    });

    it("has a black terminal background by default", () => {
        render(<LogTerminal lines={[]} autoScroll={false} />);
        expect(screen.getByTestId("log-terminal").className).toContain("bg-black");
    });
});
