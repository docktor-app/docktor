import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import type {EnvironmentWarning} from "@docktor/shared";
import {AppLayout} from "@/components/app-layout";
import {useEnvironmentWarnings} from "@/hooks/use-environment-warnings";

vi.mock("@/hooks/use-environment-warnings", () => ({
    useEnvironmentWarnings: vi.fn(),
}));
vi.mock("@/components/app-sidebar", () => ({
    AppSidebar: () => <nav aria-label="Sidebar stub"/>,
}));

const mockUseEnvironmentWarnings = vi.mocked(useEnvironmentWarnings);

const warning: EnvironmentWarning = {
    code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    variable: "TRUST_PROXY",
    message: "TRUST_PROXY is not set.",
};

function renderLayout() {
    return render(
        <MemoryRouter initialEntries={["/page"]}>
            <Routes>
                <Route element={<AppLayout/>}>
                    <Route path="/page" element={<p>Routed page content</p>}/>
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockUseEnvironmentWarnings.mockReset();
});

describe("AppLayout environment warnings (#7, D-13)", () => {
    it("renders the banner together with the routed page", () => {
        mockUseEnvironmentWarnings.mockReturnValue({
            warnings: [warning],
            error: null,
            dismiss: vi.fn(),
            dismissAll: vi.fn(),
        });

        renderLayout();

        expect(screen.getByText("Configuration warnings")).toBeInTheDocument();
        expect(screen.getByText("TRUST_PROXY")).toBeInTheDocument();
        expect(screen.getByText("Routed page content")).toBeInTheDocument();
    });

    it("renders only the routed page when there are no warnings", () => {
        mockUseEnvironmentWarnings.mockReturnValue({
            warnings: [],
            error: null,
            dismiss: vi.fn(),
            dismissAll: vi.fn(),
        });

        renderLayout();

        expect(screen.queryByText("Configuration warnings")).not.toBeInTheDocument();
        expect(screen.getByText("Routed page content")).toBeInTheDocument();
    });
});
