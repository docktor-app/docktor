import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {ProxyDomainsTable} from "@/routes/app/stacks/components/proxy-domains-table";
import type {ProxyConfig} from "@/lib/proxy-api";

function makeConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
    return {
        id: "cfg-1",
        stackId: "my-app",
        serviceName: "web",
        domain: "app.example.com",
        internalPort: 80,
        tlsEnabled: true,
        certStatus: "pending",
        certMessage: null,
        certCheckedAt: null,
        certSource: "acme",
        certificateId: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("ProxyDomainsTable", () => {
    // Regression for WR-01: internalPort is a per-domain (ProxyConfig) field,
    // not a per-service field — a service with two domains on different
    // internal ports must show each domain's own port, not rows[0]'s port
    // repeated for every row in the group.
    it("shows each domain's own internal port when a service has multiple domains on different ports", async () => {
        const configs = [
            makeConfig({id: "cfg-1", serviceName: "web", domain: "admin.example.com", internalPort: 8080}),
            makeConfig({id: "cfg-2", serviceName: "web", domain: "app.example.com", internalPort: 80}),
        ];

        render(
            <ProxyDomainsTable
                configs={configs}
                statuses={{}}
                onEdit={vi.fn()}
                onRemove={vi.fn()}
            />,
        );

        await screen.findByText("admin.example.com");
        const row = screen.getByText("web").closest("tr");
        expect(row).not.toBeNull();
        expect(screen.getByText("8080")).toBeInTheDocument();
        expect(screen.getByText("80")).toBeInTheDocument();
    });
});
