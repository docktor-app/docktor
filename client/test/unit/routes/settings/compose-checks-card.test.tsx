import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ComposeChecksCard} from "@/routes/app/settings/components/compose-checks-card";
import {getComposeCheckSettings, saveComposeCheckSettings} from "@/lib/settings-api";
import {toast} from "sonner";
import type {ComposeCheckSettings} from "@docktor/shared";

// jsdom has no ResizeObserver — Radix's Switch (via @radix-ui/react-use-size)
// requires one to measure the thumb on mount (mirrors proxy-settings-card.test.tsx).
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/settings-api", () => ({
    getComposeCheckSettings: vi.fn(),
    saveComposeCheckSettings: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => {
                    if (typeof opts.success === "function") opts.success(result);
                },
                (err) => {
                    if (typeof opts.error === "function") opts.error(err);
                },
            );
            return promise.catch(() => {});
        }),
    },
}));

// Bumped from the 5s default: CPU-bound Form/Switch render + userEvent
// interactions flake under this host's full-parallel-suite resource
// contention — same documented class of flake as proxy-settings-card.test.tsx.
vi.setConfig({testTimeout: 15000});

const mockGetComposeCheckSettings = vi.mocked(getComposeCheckSettings);
const mockSaveComposeCheckSettings = vi.mocked(saveComposeCheckSettings);
const mockToastPromise = vi.mocked(toast.promise);

function makeSettings(overrides: Partial<ComposeCheckSettings> = {}): ComposeCheckSettings {
    return {
        skipReview: false,
        checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true},
        ...overrides,
    };
}

beforeEach(() => {
    mockGetComposeCheckSettings.mockReset();
    mockSaveComposeCheckSettings.mockReset();
});

describe("ComposeChecksCard", () => {
    it("shows Skeleton rows while loading, then the loaded switches", async () => {
        mockGetComposeCheckSettings.mockResolvedValue(makeSettings());
        render(<ComposeChecksCard />);

        expect(await screen.findByRole("button", {name: "Save Compose Checks"})).toBeInTheDocument();
        expect(screen.getByRole("switch", {name: "Flag named volumes"})).toBeChecked();
        expect(screen.getByRole("switch", {name: "Flag inline environment variables"})).toBeChecked();
        expect(
            screen.getByRole("switch", {name: "Flag .env files with no env_file reference"}),
        ).toBeChecked();
        expect(
            screen.getByRole("switch", {name: "Skip the review step before applying compose/.env changes"}),
        ).not.toBeChecked();
    });

    it("lists the always-on checks as badges with no switch", async () => {
        mockGetComposeCheckSettings.mockResolvedValue(makeSettings());
        render(<ComposeChecksCard />);
        await screen.findByRole("button", {name: "Save Compose Checks"});

        expect(screen.getByText("Privileged container")).toBeInTheDocument();
        expect(screen.getByText("Docker socket mounted")).toBeInTheDocument();
        expect(screen.getByText("Bind mount outside stack directory")).toBeInTheDocument();

        // D-11: always-on checks are badges, never switches.
        expect(screen.queryByRole("switch", {name: /privileged/i})).not.toBeInTheDocument();
        expect(screen.queryByRole("switch", {name: /docker socket/i})).not.toBeInTheDocument();
        expect(screen.queryByRole("switch", {name: /bind mount outside/i})).not.toBeInTheDocument();

        // Exactly four switches total: the three configurable checks + skip-review.
        expect(screen.getAllByRole("switch")).toHaveLength(4);
    });

    it("toggling a configurable check off and saving sends it false and toasts success", async () => {
        mockGetComposeCheckSettings.mockResolvedValue(makeSettings());
        mockSaveComposeCheckSettings.mockResolvedValue(makeSettings({checks: {namedVolume: true, inlineEnv: false, missingEnvFile: true}}));
        const user = userEvent.setup();

        render(<ComposeChecksCard />);
        await user.click(await screen.findByRole("switch", {name: "Flag inline environment variables"}));
        await user.click(screen.getByRole("button", {name: "Save Compose Checks"}));

        await waitFor(() =>
            expect(mockSaveComposeCheckSettings).toHaveBeenCalledWith(
                expect.objectContaining({checks: expect.objectContaining({inlineEnv: false})}),
            ),
        );
        await waitFor(() =>
            expect(mockToastPromise).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({loading: "Saving compose checks…", success: "Compose checks saved"}),
            ),
        );
    });

    it("keeps the edited form values and toasts an error on a failed save", async () => {
        mockGetComposeCheckSettings.mockResolvedValue(makeSettings());
        mockSaveComposeCheckSettings.mockRejectedValue(new Error("network error"));
        const user = userEvent.setup();

        render(<ComposeChecksCard />);
        const inlineEnvSwitch = await screen.findByRole("switch", {name: "Flag inline environment variables"});
        await user.click(inlineEnvSwitch);
        await user.click(screen.getByRole("button", {name: "Save Compose Checks"}));

        await waitFor(() => expect(mockToastPromise).toHaveBeenCalled());
        const opts = mockToastPromise.mock.calls[0]![1] as {error: (err: Error) => string};
        expect(opts.error(new Error("network error"))).toBe(
            "Couldn't save compose checks — network error. Try again.",
        );
        // The edited switch value is never reverted on a failed save.
        expect(inlineEnvSwitch).not.toBeChecked();
    });

    it("the skip-review switch reflects skipReview and its helper mentions findings still open the review", async () => {
        mockGetComposeCheckSettings.mockResolvedValue(makeSettings({skipReview: true}));
        render(<ComposeChecksCard />);

        expect(
            await screen.findByRole("switch", {name: "Skip the review step before applying compose/.env changes"}),
        ).toBeChecked();
        expect(
            screen.getByText(/edits that introduce a compose-check warning still open the review/i),
        ).toBeInTheDocument();
    });
});
