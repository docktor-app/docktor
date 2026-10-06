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

describe("DeployWarningsAlert", () => {
    it('renders "Port 8080 is already in use by Blog." with a link to /stacks/blog for a stack holder', () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"}}],
        });

        expect(screen.getByText(/Port 8080 is already in use by/)).toBeInTheDocument();
        const link = screen.getByRole("link", {name: "Blog"});
        expect(link).toHaveAttribute("href", "/stacks/blog");
    });

    it("renders a process holder with its PID", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: 4242}}],
        });

        expect(screen.getByText("Port 8080 is already in use by nginx (PID 4242).")).toBeInTheDocument();
    });

    it("renders a process holder with a null pid without any PID text", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: null}}],
        });

        expect(screen.getByText("Port 8080 is already in use by nginx.")).toBeInTheDocument();
    });

    it('renders "another process" for an unknown holder', () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}}],
        });

        expect(screen.getByText("Port 8080 is already in use by another process.")).toBeInTheDocument();
    });

    it("renders a container holder by name", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "container", containerName: "legacy-nginx"}}],
        });

        expect(screen.getByText("Port 8080 is already in use by container legacy-nginx.")).toBeInTheDocument();
    });

    it("renders a udp port as PORT/udp", () => {
        renderAlert({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 5353, protocol: "udp", serviceName: "dns", holder: {kind: "unknown"}}],
        });

        expect(screen.getByText("Port 5353/udp is already in use by another process.")).toBeInTheDocument();
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
