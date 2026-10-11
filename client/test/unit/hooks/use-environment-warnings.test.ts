import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import type {EnvironmentWarning} from "@docktor/shared";
import {useEnvironmentWarnings} from "@/hooks/use-environment-warnings";
import {getEnvironmentReport} from "@/lib/settings-api";

vi.mock("@/lib/settings-api", () => ({
    getEnvironmentReport: vi.fn(),
}));

const mockGetEnvironmentReport = vi.mocked(getEnvironmentReport);

const secretWarning: EnvironmentWarning = {
    code: "TEMPLATE_SECRET_IN_PRODUCTION",
    variable: "BETTER_AUTH_SECRET",
    message: "BETTER_AUTH_SECRET still holds the template value.",
};
const proxyWarning: EnvironmentWarning = {
    code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    variable: "TRUST_PROXY",
    message: "TRUST_PROXY is not set.",
};

beforeEach(() => {
    mockGetEnvironmentReport.mockReset();
});

describe("useEnvironmentWarnings (#7, D-13)", () => {
    it("fetches the report exactly once on mount and exposes its warnings", async () => {
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});

        const {result, rerender} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));
        rerender();

        expect(result.current.warnings).toEqual([secretWarning, proxyWarning]);
        expect(result.current.error).toBeNull();
        expect(mockGetEnvironmentReport).toHaveBeenCalledTimes(1);
    });

    it("exposes no warnings and the message when the request fails, without retrying", async () => {
        mockGetEnvironmentReport.mockRejectedValue(new Error("Unauthorized"));

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.error).toBe("Unauthorized"));
        expect(result.current.warnings).toEqual([]);
        expect(mockGetEnvironmentReport).toHaveBeenCalledTimes(1);
    });

    it("falls back to a generic message for a non-Error rejection", async () => {
        mockGetEnvironmentReport.mockRejectedValue("nope");

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.error).toBe("Failed to fetch environment warnings"));
    });

    it("dismiss hides that warning and keeps the others", async () => {
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});
        const {result} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));

        act(() => result.current.dismiss(secretWarning));

        expect(result.current.warnings).toEqual([proxyWarning]);
    });

    it("dismissAll hides every warning", async () => {
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});
        const {result} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));

        act(() => result.current.dismissAll());

        expect(result.current.warnings).toEqual([]);
    });
});
