import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import StackDetailPage from "../../../../src/routes/app/stacks/[id]";
import {useStack} from "@/hooks/use-stack";
import {getComposeContent, getEnvContent} from "@/lib/stacks-api";
import type {StackDetail} from "@/lib/stacks-api";
import {SidebarProvider} from "@/components/ui/sidebar";

// D-01/D-02: the Compose/Environment tabs are merged into a single Config
// tab, driven by lib/stack-tabs.ts's resolveStackTab(). The save-triggered
// refetch behaviour that used to live here moved to
// use-stack-config-files.test.ts, alongside the rest of the file-loading/
// dirty-guard/save logic it now owns.

vi.mock("@/hooks/use-stack", () => ({
    useStack: vi.fn(),
}));

vi.mock("@/lib/stacks-api", () => ({
    getComposeContent: vi.fn(),
    getEnvContent: vi.fn(),
    updateStack: vi.fn(),
}));

// Mirrors the pattern in service-upgrade-dialog.test.tsx: resolve/reject the
// underlying promise directly, without needing a mounted <Toaster/>.
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
vi.mock("../../../../src/routes/app/stacks/components/services-tab", () => ({
    ServicesTab: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/event-log-card", () => ({
    EventLogCard: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/status-log-card", () => ({
    StatusLogCard: () => null,
}));
vi.mock("../../../../src/routes/app/stacks/components/proxy-tab", () => ({
    ProxyTab: () => null,
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

    mockGetComposeContent.mockResolvedValue({content: "services:\n  web:\n    image: nginx\n"});
    mockGetEnvContent.mockResolvedValue({content: "FOO=bar"});

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

describe("StackDetailPage — tabs (D-01/D-02)", () => {
    it("shows the Config tab selected with both headings at /stacks/my-app/config", async () => {
        renderPage("/stacks/my-app/config");

        await waitFor(() => expect(screen.getByRole("heading", {name: "Compose File"})).toBeVisible());
        expect(screen.getByRole("heading", {name: "Environment Variables"})).toBeVisible();
        expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument();
    });

    it("redirects the legacy /compose URL to the Config tab", async () => {
        renderPage("/stacks/my-app/compose");
        await waitFor(() => expect(screen.getByRole("heading", {name: "Compose File"})).toBeVisible());
        expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument();
    });

    it("redirects the legacy /environment URL to the Config tab", async () => {
        renderPage("/stacks/my-app/environment");
        await waitFor(() => expect(screen.getByRole("heading", {name: "Environment Variables"})).toBeVisible());
        expect(screen.getByRole("tab", {name: "Config", selected: true})).toBeInTheDocument();
    });
});
