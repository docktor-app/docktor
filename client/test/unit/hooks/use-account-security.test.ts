import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import type {AccountSecurityStatus} from "@docktor/shared";
import {
    accountSecurityStore,
    createAccountSecurityStore,
    useAccountSecurity,
} from "@/hooks/use-account-security";
import {getAccountSecurity} from "@/lib/account-api";

vi.mock("@/lib/account-api", () => ({
    getAccountSecurity: vi.fn(),
}));

const NOT_ENROLLED: AccountSecurityStatus = {twoFactorEnabled: false, mandatory: false, enrollmentRequired: false};
const ENROLLED: AccountSecurityStatus = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};

describe("createAccountSecurityStore", () => {
    it("starts loading with no status and no error", () => {
        const store = createAccountSecurityStore(vi.fn());

        expect(store.getSnapshot()).toEqual({status: null, loading: true, error: null});
    });

    it("publishes the status once refresh resolves", async () => {
        const store = createAccountSecurityStore(vi.fn().mockResolvedValue(NOT_ENROLLED));

        await store.refresh();

        expect(store.getSnapshot()).toEqual({status: NOT_ENROLLED, loading: false, error: null});
    });

    it("shares one request between concurrent refresh calls", async () => {
        const fetchStatus = vi.fn().mockResolvedValue(NOT_ENROLLED);
        const store = createAccountSecurityStore(fetchStatus);

        await Promise.all([store.refresh(), store.refresh()]);

        expect(fetchStatus).toHaveBeenCalledTimes(1);
    });

    it("records the failure message and clears the status when the fetch rejects", async () => {
        const store = createAccountSecurityStore(vi.fn().mockRejectedValue(new Error("Network down")));

        await store.refresh();

        expect(store.getSnapshot()).toEqual({status: null, loading: false, error: "Network down"});
    });

    it("falls back to a generic message for non-Error rejections", async () => {
        const store = createAccountSecurityStore(vi.fn().mockRejectedValue("nope"));

        await store.refresh();

        expect(store.getSnapshot().error).toBe("Failed to load security settings");
    });

    it("allows a new request after the previous one settled", async () => {
        const fetchStatus = vi.fn().mockResolvedValue(NOT_ENROLLED);
        const store = createAccountSecurityStore(fetchStatus);

        await store.refresh();
        await store.refresh();

        expect(fetchStatus).toHaveBeenCalledTimes(2);
    });

    it("keeps the known status on screen while refetching", async () => {
        let resolveFetch: (status: AccountSecurityStatus) => void = () => undefined;
        const fetchStatus = vi.fn()
            .mockResolvedValueOnce(NOT_ENROLLED)
            .mockReturnValueOnce(new Promise((resolve) => {
                resolveFetch = resolve;
            }));
        const store = createAccountSecurityStore(fetchStatus);
        await store.refresh();

        const pending = store.refresh();

        expect(store.getSnapshot()).toEqual({status: NOT_ENROLLED, loading: false, error: null});
        resolveFetch(ENROLLED);
        await pending;
        expect(store.getSnapshot().status).toEqual(ENROLLED);
    });

    it("notifies every subscriber on setStatus and stops after unsubscribe", () => {
        const store = createAccountSecurityStore(vi.fn());
        const first = vi.fn();
        const second = vi.fn();
        store.subscribe(first);
        const unsubscribe = store.subscribe(second);

        store.setStatus(ENROLLED);
        unsubscribe();
        store.setStatus(NOT_ENROLLED);

        expect(first).toHaveBeenCalledTimes(2);
        expect(second).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot()).toEqual({status: NOT_ENROLLED, loading: false, error: null});
    });

    it("returns to the initial snapshot on reset", async () => {
        const store = createAccountSecurityStore(vi.fn().mockResolvedValue(ENROLLED));
        await store.refresh();

        store.reset();

        expect(store.getSnapshot()).toEqual({status: null, loading: true, error: null});
    });

    it("drops a response that was still in flight when reset was called", async () => {
        let resolveFetch: (status: AccountSecurityStatus) => void = () => undefined;
        const store = createAccountSecurityStore(
            vi.fn().mockReturnValue(new Promise((resolve) => {
                resolveFetch = resolve;
            })),
        );
        const pending = store.refresh();

        store.reset();
        resolveFetch(ENROLLED);
        await pending;

        expect(store.getSnapshot()).toEqual({status: null, loading: true, error: null});
    });
});

describe("useAccountSecurity", () => {
    beforeEach(() => {
        accountSecurityStore.reset();
        vi.mocked(getAccountSecurity).mockReset().mockResolvedValue(NOT_ENROLLED);
    });

    afterEach(() => {
        accountSecurityStore.reset();
    });

    it("fetches once on mount and exposes the status", async () => {
        const {result} = renderHook(() => useAccountSecurity());

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.status).toEqual(NOT_ENROLLED));
        expect(result.current.loading).toBe(false);
        expect(getAccountSecurity).toHaveBeenCalledTimes(1);
    });

    it("shows the same status in two consumers after one refresh", async () => {
        const {result} = renderHook(() => ({a: useAccountSecurity(), b: useAccountSecurity()}));

        await waitFor(() => expect(result.current.a.status).toEqual(NOT_ENROLLED));

        expect(result.current.b.status).toEqual(NOT_ENROLLED);
        expect(getAccountSecurity).toHaveBeenCalledTimes(1);

        act(() => result.current.a.setStatus(ENROLLED));

        expect(result.current.b.status).toEqual(ENROLLED);
    });

    it("never fetches when disabled", () => {
        const {result} = renderHook(() => useAccountSecurity({enabled: false}));

        expect(result.current.loading).toBe(true);
        expect(getAccountSecurity).not.toHaveBeenCalled();
    });

    it("does not refetch on mount when a status is already known", () => {
        accountSecurityStore.setStatus(ENROLLED);

        const {result} = renderHook(() => useAccountSecurity());

        expect(result.current.status).toEqual(ENROLLED);
        expect(getAccountSecurity).not.toHaveBeenCalled();
    });

    it("surfaces a failed load and refetches on refresh", async () => {
        vi.mocked(getAccountSecurity).mockRejectedValueOnce(new Error("Network down"));
        const {result} = renderHook(() => useAccountSecurity());
        await waitFor(() => expect(result.current.error).toBe("Network down"));

        await act(async () => {
            await result.current.refresh();
        });

        expect(result.current.status).toEqual(NOT_ENROLLED);
        expect(result.current.error).toBeNull();
    });
});
