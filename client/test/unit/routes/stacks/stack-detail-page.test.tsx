import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import StackDetailPage from "../../../../src/routes/app/stacks/[id]";
import {useStack} from "@/hooks/use-stack";
import {getComposeContent, getEnvContent} from "@/lib/stacks-api";
import type {StackDetail} from "@/lib/stacks-api";
import {SidebarProvider} from "@/components/ui/sidebar";

// D-01/D-02: [id].tsx is now a composition-only orchestrator (CLAUDE.md
// Known Refactoring Target, closed by Task 2 of 11-01-PLAN.md) — this test
// only asserts composition: the correct tab is selected per URL, legacy
// URLs redirect, the loading/error shells render, and the breadcrumb shows
// the active tab's label. Tab *content* (Overview/Config) is covered by
// overview-tab.test.tsx / config-tab.test.tsx / use-stack-config-files.test.ts.

vi.mock("@/hooks/use-stack", () => ({
    useStack: vi.fn(),
}));

vi.mock("@/lib/stacks-api", () => ({
    getComposeContent: vi.fn(),
    getEnvContent: vi.fn(),
    updateStack: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => {})),
    },
}));

// Every child component below fetches its own data or renders unrelated
// concerns; stubbing them keeps this test isolated to the page's own
// tab-resolution/composition wiring.
vi.mock("@/components/domain/stack/stack-status-badge", () => ({
    StackStatusBadge: () => null,
}));
vi.mock("@/components/domain/stack/log-viewer", () => ({
    LogViewer: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/stack-actions", () => ({
    StackActions: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/backups-tab", () => ({
    BackupsTab: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/proxy-tab", () => ({
    ProxyTab: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/overview-tab", () => ({
    OverviewTab: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/config-tab", () => ({
    ConfigTab: () => null,
}));

const mockUseStack = vi.mocked(useStack);
const mockGetComposeContent = vi.mocked(getComposeContent);
const mockGetEnvContent = vi.mocked(getEnvContent);

function makeStack(overrides: Partial<StackDetail> = {}): StackDetail {
    return {
        id: "my-app",
        displayName: "My App",
        description: null,
        hostPath: "/stacks/my-app",
        status: "RUNNING",
        configChanged: false,
        configError: null,
        lastKnownHash: "hash-1",
        isProtected: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        services: [],
        deployments: [],
        statusLogs: [],
        ...overrides,
    };
}

function renderPage(path: string) {
    return render(
        <SidebarProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/stacks/:id/:tab?" element={<StackDetailPage />} />
                </Routes>
            </MemoryRouter>
        </SidebarProvider>,
    );
}

let refetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
    mockUseStack.mockReset();
    mockGetComposeContent.mockReset();
    mockGetEnvContent.mockReset();
    refetch = vi.fn();

    mockGetComposeContent.mockResolvedValue({content: ""});
    mockGetEnvContent.mockResolvedValue({content: ""});

    mockUseStack.mockReturnValue({
        stack: makeStack(),
        loading: false,
        isRefreshing: false,
        error: null,
        refetch,
    });

    // jsdom does not implement matchMedia; SidebarProvider's mobile-detection
    // hook (used by the Page shell this route renders into) requires it.
    if (typeof window.matchMedia !== "function") {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    }
});

describe("StackDetailPage — composition (D-01/D-02)", () => {
    it("selects the Overview tab by default", async () => {
        renderPage("/stacks/my-app");
        await waitFor(() =>
            expect(screen.getByRole("tab", {name: "Overview", selected: true})).toBeInTheDocument(),
        );
    });

    it("selects the Config tab at /stacks/my-app/config", async () => {
        renderPage("/stacks/my-app/config");
        await waitFor(() =>
            expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument(),
        );
    });

    it("selects the Logs tab at /stacks/my-app/logs", async () => {
        renderPage("/stacks/my-app/logs");
        await waitFor(() =>
            expect(screen.getByRole("tab", {name: "Logs", selected: true})).toBeInTheDocument(),
        );
    });

    it("redirects the legacy /compose URL to the Config tab", async () => {
        renderPage("/stacks/my-app/compose");
        await waitFor(() =>
            expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument(),
        );
    });

    it("redirects the legacy /environment URL to the Config tab", async () => {
        renderPage("/stacks/my-app/environment");
        await waitFor(() =>
            expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument(),
        );
    });

    it("shows the loading shell while the stack has not loaded yet", () => {
        mockUseStack.mockReturnValue({
            stack: null,
            loading: true,
            isRefreshing: false,
            error: null,
            refetch,
        });
        renderPage("/stacks/my-app");
        expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    });

    it("shows the error shell when the stack fails to load", () => {
        mockUseStack.mockReturnValue({
            stack: null,
            loading: false,
            isRefreshing: false,
            error: "Not found",
            refetch,
        });
        renderPage("/stacks/my-app");
        expect(screen.getByText("Not found")).toBeInTheDocument();
    });

    it("shows the active tab's label in the breadcrumb", async () => {
        renderPage("/stacks/my-app/logs");
        await waitFor(() =>
            expect(within(screen.getByLabelText("breadcrumb")).getByText("Logs")).toBeInTheDocument(),
        );
    });
});
