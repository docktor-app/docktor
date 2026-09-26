import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {ProxyAssignDialog, type ProxyDialogTarget} from "@/routes/app/stacks/components/proxy-assign-dialog";
import {assignDomain, type ProxyConfig} from "@/lib/proxy-api";
import {ApiError} from "@/lib/api";
import type {Certificate} from "@/lib/certificates-api";
import type {Service} from "@/lib/stacks-api";

if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
}
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/proxy-api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/proxy-api")>("@/lib/proxy-api");
    return {...actual, assignDomain: vi.fn()};
});

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => opts.success && (typeof opts.success === "function" ? opts.success(result) : opts.success),
                (err) => opts.error?.(err),
            );
            return promise.catch(() => {});
        }),
    },
}));

const mockAssignDomain = vi.mocked(assignDomain);

function makeService(overrides: Partial<Service> = {}): Service {
    return {
        id: "svc-1",
        stackId: "my-app",
        serviceName: "web",
        image: "nginx",
        imageTag: "latest",
        ports: null,
        volumes: null,
        containerId: null,
        containerState: "running",
        healthStatus: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

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

const certificates: Certificate[] = [];

function renderDialog(target: ProxyDialogTarget, services: Service[] = [makeService()]) {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const utils = render(
        <MemoryRouter>
            <ProxyAssignDialog
                stackId="my-app"
                services={services}
                certificates={certificates}
                target={target}
                open
                onOpenChange={onOpenChange}
                onSaved={onSaved}
            />
        </MemoryRouter>,
    );
    return {...utils, onOpenChange, onSaved};
}

beforeEach(() => {
    mockAssignDomain.mockReset();
});

describe("ProxyAssignDialog", () => {
    it("opens the assign flow with every field empty", () => {
        renderDialog({mode: "assign"});

        expect(screen.getByRole("heading", {name: "Assign Domain"})).toBeInTheDocument();
        expect(screen.getByLabelText(/^domain$/i)).toHaveValue("");
        expect(screen.getByLabelText(/^domain$/i)).not.toHaveAttribute("readonly");
        expect(screen.getByRole("combobox", {name: "Service"})).not.toBeDisabled();
    });

    it("opens the edit flow pre-filled with the target config, domain and service locked", () => {
        const config = makeConfig({domain: "app.example.com", internalPort: 8080, tlsEnabled: false});
        renderDialog({mode: "edit", config});

        expect(screen.getByRole("heading", {name: "Edit app.example.com"})).toBeInTheDocument();
        expect(screen.getByLabelText(/^domain$/i)).toHaveValue("app.example.com");
        expect(screen.getByLabelText(/^domain$/i)).toHaveAttribute("readonly");
        expect(screen.getByLabelText(/internal port/i)).toHaveValue(8080);
        expect(screen.getByRole("combobox", {name: "Service"})).toBeDisabled();
    });

    it("calls assignDomain with the locked domain and service on an edit save", async () => {
        const config = makeConfig({domain: "app.example.com", internalPort: 80});
        mockAssignDomain.mockResolvedValue(makeConfig({domain: "app.example.com", internalPort: 9090}));
        const user = userEvent.setup();

        renderDialog({mode: "edit", config});

        const portInput = screen.getByLabelText(/internal port/i);
        await user.clear(portInput);
        await user.type(portInput, "9090");
        await user.click(screen.getByRole("button", {name: "Save Domain"}));

        await waitFor(() =>
            expect(mockAssignDomain).toHaveBeenCalledWith(
                "my-app",
                "web",
                expect.objectContaining({domain: "app.example.com", internalPort: 9090}),
            ),
        );
    });

    it("keeps the dialog open, maps ApiError.fields onto the domain field, and returns the UI-SPEC error copy on failure", async () => {
        const apiError = new ApiError("Domain already assigned", 409, {domain: "taken"});
        mockAssignDomain.mockRejectedValue(apiError);
        const user = userEvent.setup();

        const {onOpenChange} = renderDialog({mode: "assign"});

        await user.type(screen.getByLabelText(/^domain$/i), "taken.example.com");
        await user.click(screen.getByRole("button", {name: "Save Domain"}));

        expect(await screen.findByText("taken")).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);

        const {toast} = await import("sonner");
        const promiseCall = vi.mocked(toast.promise).mock.calls.at(-1)!;
        const errorMessage = (promiseCall[1] as any).error(apiError);
        expect(errorMessage).toBe("Couldn't save domain — Domain already assigned. Try again.");
    });

    it("closes and calls onSaved after a successful assign", async () => {
        mockAssignDomain.mockResolvedValue(makeConfig({domain: "new.example.com"}));
        const user = userEvent.setup();

        const {onOpenChange, onSaved} = renderDialog({mode: "assign"});

        await user.type(screen.getByLabelText(/^domain$/i), "new.example.com");
        await user.click(screen.getByRole("button", {name: "Save Domain"}));

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });
});
