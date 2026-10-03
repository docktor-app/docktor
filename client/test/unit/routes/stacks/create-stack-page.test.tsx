import {beforeEach, describe, expect, it, vi} from "vitest";
import {useEffect} from "react";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import CreateStackPage from "@/routes/app/stacks/create";
import {SidebarProvider} from "@/components/ui/sidebar";
import {createStack, previewNewStack} from "@/lib/stacks-api";
import {createStackFromTemplate, getTemplateVariant} from "@/lib/templates-api";

vi.mock("@/lib/stacks-api", () => ({
    createStack: vi.fn(),
    previewNewStack: vi.fn(),
}));
vi.mock("@/lib/templates-api", () => ({
    createStackFromTemplate: vi.fn(),
    getTemplateVariant: vi.fn(),
}));

// jsdom has no ResizeObserver — the AlertDialog content renders a Tooltip
// (via ComposeWarningBadge) that doesn't need it, but Radix's own primitives
// elsewhere in this tree do; mirrors settings-page.test.tsx/
// proxy-settings-card.test.tsx's identical stub.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

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
const mockPreviewNewStack = vi.mocked(previewNewStack);
const mockCreateStackFromTemplate = vi.mocked(createStackFromTemplate);
const mockGetTemplateVariant = vi.mocked(getTemplateVariant);

const CLEAN_PREVIEW = {confirmationRequired: false, findings: [], composeParseError: null};

const VARIANT = {
    id: "v1",
    slug: "default",
    name: "Default",
    description: "The default variant",
    usage: "Run it.",
    composeContent: "services:\n  web:\n    image: nginx",
    envContent: "FOO=bar",
    contentHash: "hash1",
    template: {id: "t1", slug: "whoami", name: "Whoami"},
    repo: {id: "r1", url: "https://example.com/repo.git", headCommitSha: "abc"},
};

function dangerPreview() {
    return {
        confirmationRequired: true,
        findings: [
            {
                ruleId: "privileged" as const,
                severity: "danger" as const,
                message: "Service web has privileged: true",
                serviceName: "web",
                path: [],
                line: 4,
                introduced: true,
            },
        ],
        composeParseError: null,
    };
}

function renderPage(initialPath = "/stacks/create") {
    return render(
        <SidebarProvider>
            <MemoryRouter initialEntries={[initialPath]}>
                <CreateStackPage />
            </MemoryRouter>
        </SidebarProvider>,
    );
}

describe("CreateStackPage", () => {
    beforeEach(() => {
        mockCreateStack.mockReset();
        mockPreviewNewStack.mockReset();
        mockCreateStackFromTemplate.mockReset();
        mockGetTemplateVariant.mockReset();
        mockPreviewNewStack.mockResolvedValue(CLEAN_PREVIEW);
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

    // Issue #20 AC1: a compose that triggers a finding opens the findings-only
    // review dialog instead of creating the stack immediately.
    it("opens the findings-only review dialog and does not create the stack for a privileged compose", async () => {
        mockPreviewNewStack.mockResolvedValue(dangerPreview());
        const user = userEvent.setup();

        renderPage();
        await user.type(screen.getByLabelText("Name"), "My Stack");
        await user.type(
            screen.getByLabelText("Docker Compose File"),
            "services:\n  web:\n    image: nginx\n    privileged: true\n",
        );
        await user.click(screen.getByRole("button", {name: "Create Stack"}));

        expect(await screen.findByText("Review My Stack before creating")).toBeInTheDocument();
        expect(screen.getByText("Privileged container")).toBeInTheDocument();
        expect(mockCreateStack).not.toHaveBeenCalled();
    });

    // Issue #20 AC1: "Confirm & Apply" sends confirmed: true and the
    // resulting stack still navigates away (verified via createStack's call
    // args here; the Playwright test covers the actual navigation).
    it("sends confirmed: true when the review is confirmed", async () => {
        mockPreviewNewStack.mockResolvedValue(dangerPreview());
        mockCreateStack.mockResolvedValue({id: "new-stack"} as never);
        const user = userEvent.setup();

        renderPage();
        await user.type(screen.getByLabelText("Name"), "My Stack");
        await user.type(
            screen.getByLabelText("Docker Compose File"),
            "services:\n  web:\n    image: nginx\n    privileged: true\n",
        );
        await user.click(screen.getByRole("button", {name: "Create Stack"}));
        await screen.findByText("Review My Stack before creating");

        await user.click(screen.getByRole("button", {name: "Confirm & Apply"}));

        await waitFor(() =>
            expect(mockCreateStack).toHaveBeenCalledWith(
                expect.objectContaining({displayName: "My Stack", confirmed: true}),
            ),
        );
    });

    // Issue #19/D-07: the blank-slate path stays the default, with a
    // secondary entry point into the template browser.
    it("without a variant, shows a Start from Template link to the template browser", () => {
        renderPage();

        const link = screen.getByRole("link", {name: "Start from Template"});
        expect(link).toHaveAttribute("href", "/stacks/create/templates");
    });

    // Issue #19/D-06: ?variant=v1 loads the variant and renders the form only
    // once it has loaded, prefilled from it; submitting posts through the
    // template create path.
    it("with ?variant=v1, renders the form prefilled only after the variant loads and submits via createStackFromTemplate", async () => {
        mockGetTemplateVariant.mockResolvedValue(VARIANT);
        mockCreateStackFromTemplate.mockResolvedValue({id: "whoami"});
        const user = userEvent.setup();

        renderPage("/stacks/create?variant=v1");

        await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Whoami"));
        expect(screen.getByLabelText("Docker Compose File")).toHaveValue(VARIANT.composeContent);
        expect(screen.queryByRole("link", {name: "Start from Template"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Create Stack"}));

        await waitFor(() =>
            expect(mockCreateStackFromTemplate).toHaveBeenCalledWith(
                "v1",
                expect.objectContaining({displayName: "Whoami"}),
            ),
        );
        expect(mockCreateStack).not.toHaveBeenCalled();
    });

    // Issue #19/D-06: the page states which template/variant it starts from
    // and shows the variant's usage notes as plain text with line breaks
    // preserved.
    it("with ?variant=v1, shows the Starting from note and the variant's usage text", async () => {
        mockGetTemplateVariant.mockResolvedValue({...VARIANT, usage: "Step one.\nStep two."});

        renderPage("/stacks/create?variant=v1");

        expect(await screen.findByText("Starting from Whoami — Default")).toBeInTheDocument();
        const usage = document.querySelector(".whitespace-pre-wrap");
        expect(usage).not.toBeNull();
        expect(usage?.textContent).toBe("Step one.\nStep two.");
    });
});
