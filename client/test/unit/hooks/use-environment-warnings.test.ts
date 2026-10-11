import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
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

const STORAGE_KEY = "docktor.environment-warnings.dismissed";

const databaseSecretWarning: EnvironmentWarning = {
    code: "TEMPLATE_SECRET_IN_PRODUCTION",
    variable: "DATABASE_URL",
    message: "DATABASE_URL still holds the template value.",
};

function storedKeys(): unknown {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
    mockGetEnvironmentReport.mockReset();
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
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

describe("useEnvironmentWarnings dismissal persistence (#7, D-13)", () => {
    it("writes code:variable to localStorage as a JSON string array when dismissing", async () => {
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});
        const {result} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));

        act(() => result.current.dismiss(secretWarning));

        expect(result.current.warnings).toEqual([proxyWarning]);
        expect(storedKeys()).toEqual(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET"]);
    });

    it("hides warnings stored as dismissed on mount and shows the others", async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET"]));
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(mockGetEnvironmentReport).toHaveBeenCalled());
        await waitFor(() => expect(result.current.warnings).toEqual([proxyWarning]));
    });

    it("shows a warning with the same code but a different variable", async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET"]));
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, databaseSecretWarning]});

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.warnings).toEqual([databaseSecretWarning]));
    });

    it("prunes stored keys that are not in the current report", async () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET", "STACKS_HOST_DIR_UNSET:DOCKTOR_STACKS_HOST_DIR"]),
        );
        mockGetEnvironmentReport.mockResolvedValue({warnings: [proxyWarning, secretWarning]});

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.warnings).toEqual([proxyWarning]));
        expect(storedKeys()).toEqual(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET"]);
    });

    it("shows a reintroduced misconfiguration again after its dismissal was pruned", async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(["TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET"]));
        mockGetEnvironmentReport.mockResolvedValueOnce({warnings: [proxyWarning]});
        const first = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(first.result.current.warnings).toEqual([proxyWarning]));
        await waitFor(() => expect(storedKeys()).toEqual([]));
        first.unmount();

        mockGetEnvironmentReport.mockResolvedValueOnce({warnings: [proxyWarning, secretWarning]});
        const second = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(second.result.current.warnings).toHaveLength(2));
    });

    it("dismissAll hides every current warning and stores all their keys", async () => {
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});
        const {result} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));

        act(() => result.current.dismissAll());

        expect(result.current.warnings).toEqual([]);
        expect(storedKeys()).toEqual(
            expect.arrayContaining([
                "TEMPLATE_SECRET_IN_PRODUCTION:BETTER_AUTH_SECRET",
                "TRUST_PROXY_UNSET_BEHIND_HTTPS:TRUST_PROXY",
            ]),
        );
        expect(storedKeys()).toHaveLength(2);
    });

    it.each([
        ["not JSON", "{oops"],
        ["not an array", JSON.stringify({a: 1})],
        ["an array with non-strings", JSON.stringify(["TRUST_PROXY_UNSET_BEHIND_HTTPS:TRUST_PROXY", 7])],
    ])("treats a stored value that is %s as nothing dismissed", async (_label, raw) => {
        localStorage.setItem(STORAGE_KEY, raw);
        mockGetEnvironmentReport.mockResolvedValue({warnings: [proxyWarning]});

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.warnings).toEqual([proxyWarning]));
    });

    it("treats a throwing getItem as nothing dismissed and does not throw", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        mockGetEnvironmentReport.mockResolvedValue({warnings: [proxyWarning]});

        const {result} = renderHook(() => useEnvironmentWarnings());

        await waitFor(() => expect(result.current.warnings).toEqual([proxyWarning]));
    });

    it("keeps the in-memory dismissal when setItem throws", async () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        mockGetEnvironmentReport.mockResolvedValue({warnings: [secretWarning, proxyWarning]});
        const {result} = renderHook(() => useEnvironmentWarnings());
        await waitFor(() => expect(result.current.warnings).toHaveLength(2));

        act(() => result.current.dismiss(secretWarning));

        expect(result.current.warnings).toEqual([proxyWarning]);
    });
});
