import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {DeployWarningsAlert} from "@/components/domain/stack/deploy-warnings-alert";
import type {DeployWarnings} from "@/lib/stacks-api";

function renderAlert(warnings: DeployWarnings) {
    return render(
        <MemoryRouter>
            <DeployWarningsAlert warnings={warnings} />
        </MemoryRouter>,
    );
}

function warningLine(text: string): HTMLElement {
    return screen.getByText((_, element) => element?.tagName === "DIV" && element.textContent === text);
}

function expectMono(element: HTMLElement): void {
    expect(element.tagName).toBe("CODE");
    expect(element).toHaveClass("font-mono");
}

describe("DeployWarningsAlert", () => {
    it('renders "Port 8080 is already in use by Blog." with a link to /stacks/blog for a stack holder', () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"}}],
        });

        expect(warningLine("Port 8080 is already in use by Blog.")).toBeInTheDocument();
        expectMono(screen.getByText("8080"));
        const link = screen.getByRole("link", {name: "Blog"});
        expect(link).toHaveAttribute("href", "/stacks/blog");
    });

    it("renders a process holder with its PID", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: 4242}}],
        });

        expect(warningLine("Port 8080 is already in use by nginx (PID 4242).")).toBeInTheDocument();
        expectMono(screen.getByText("8080"));
    });

    it("renders a process holder with a null pid without any PID text", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: null}}],
        });

        expect(warningLine("Port 8080 is already in use by nginx.")).toBeInTheDocument();
        expectMono(screen.getByText("8080"));
    });

    it('renders "another process" for an unknown holder', () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}}],
        });

        expect(warningLine("Port 8080 is already in use by another process.")).toBeInTheDocument();
        expectMono(screen.getByText("8080"));
    });

    it("renders a container holder by name", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "container", containerName: "legacy-nginx"}}],
        });

        expect(warningLine("Port 8080 is already in use by container legacy-nginx.")).toBeInTheDocument();
        expectMono(screen.getByText("8080"));
        expectMono(screen.getByText("legacy-nginx"));
    });

    it("renders a udp port as PORT/udp", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 5353, protocol: "udp", serviceName: "dns", holder: {kind: "unknown"}}],
        });

        expect(warningLine("Port 5353/udp is already in use by another process.")).toBeInTheDocument();
        expectMono(screen.getByText("5353/udp"));
    });

    it("renders a compose finding as a ComposeWarningBadge plus its message", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [{ruleId: "privileged", severity: "danger", message: "Service \"web\" runs privileged", serviceName: "web", path: [], line: 4}],
            portConflicts: [],
        });

        expect(screen.getByText("Privileged container")).toBeInTheDocument();
        expect(screen.getByText('Service "web" runs privileged')).toBeInTheDocument();
    });

    it("always includes the best-effort visibility footnote", () => {
        renderAlert({checkedAt: "x", composeFindings: [], portConflicts: []});

        expect(screen.getByText(/final authority/)).toBeInTheDocument();
    });
});
