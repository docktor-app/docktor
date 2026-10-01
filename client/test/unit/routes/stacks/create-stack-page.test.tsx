import {beforeEach, describe, expect, it, vi} from "vitest";
import {useEffect} from "react";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import CreateStackPage from "@/routes/app/stacks/create";
import {SidebarProvider} from "@/components/ui/sidebar";
import {createStack} from "@/lib/stacks-api";

vi.mock("@/lib/stacks-api", () => ({
    createStack: vi.fn(),
}));

// CodeMirror internals aren't under test here — swap ComposeEditor/EnvEditor
// for plain controlled textareas, mirroring env-editor.test.tsx's own mock
// of CodeEditor.
vi.mock("@/components/domain/stack/compose-editor", () => ({
    ComposeEditor: ({value, onChange}: {value: string; onChange: (v: string) => void}) => (
        <textarea aria-label="Docker Compose File" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock("@/components/domain/stack/env-editor", () => ({
    EnvEditor: ({value, onChange, onValidityChange}: {
        value: string;
        onChange: (v: string) => void;
        onValidityChange: (valid: boolean) => void;
    }) => {
        useEffect(() => onValidityChange(true), [onValidityChange]);
        return <textarea aria-label="Environment Variables" value={value} onChange={(e) => onChange(e.target.value)} />;
    },
}));

// Bumped from the 5s default: userEvent interactions + full CreateStackPage
// render (Form/Sidebar) are CPU-bound and flake under this host's
// full-parallel-suite resource contention — the same documented class of
// flake as proxy-tab.test.tsx/stack-detail-page.test.tsx; every test here
// passes reliably in isolation or in small groups.
vi.setConfig({testTimeout: 15000});

const mockCreateStack = vi.mocked(createStack);

function renderPage() {
    return render(
        <SidebarProvider>
            <MemoryRouter>
                <CreateStackPage />
            </MemoryRouter>
        </SidebarProvider>,
    );
}

describe("CreateStackPage", () => {
    beforeEach(() => {
        mockCreateStack.mockReset();
        // jsdom does not implement matchMedia; SidebarProvider's mobile-detection
        // hook requires it (mirrors settings-page.test.tsx).
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

    // Regression for WR-05: the submit handler used `catch (err: any)` and
    // accessed `err.message` unsafely. A non-Error rejection (e.g. a plain
    // string, which some fetch failures or aborted requests can throw) must
    // still surface the fallback message instead of the handler blowing up
    // or displaying "undefined".
    it("shows the fallback error message when createStack rejects with a non-Error value", async () => {
        mockCreateStack.mockRejectedValue("network exploded");
        const user = userEvent.setup();

        renderPage();
        await user.type(screen.getByLabelText("Name"), "My Stack");
        await user.type(screen.getByLabelText("Docker Compose File"), "services:\n  web:\n    image: nginx\n");
        await user.click(screen.getByRole("button", {name: "Create Stack"}));

        expect(await screen.findByText("Failed to create stack")).toBeInTheDocument();
    });

    it("shows the thrown Error's message when createStack rejects with an Error", async () => {
        mockCreateStack.mockRejectedValue(new Error("Stack name already in use"));
        const user = userEvent.setup();

        renderPage();
        await user.type(screen.getByLabelText("Name"), "My Stack");
        await user.type(screen.getByLabelText("Docker Compose File"), "services:\n  web:\n    image: nginx\n");
        await user.click(screen.getByRole("button", {name: "Create Stack"}));

        expect(await screen.findByText("Stack name already in use")).toBeInTheDocument();
    });
});
