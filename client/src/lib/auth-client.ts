import {twoFactorClient} from "better-auth/client/plugins";
import {createAuthClient} from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: "",
    plugins: [twoFactorClient()],
});

export const {useSession, signIn, signUp, signOut, twoFactor} = authClient;

// better-auth types `$store.atoms` loosely (any-typed atom values), so the value is narrowed here.
function isRefetchableSessionState(value: unknown): value is {refetch: () => Promise<void>} {
    return typeof value === "object" && value !== null
        && "refetch" in value && typeof value.refetch === "function";
}

/**
 * better-auth refreshes its `useSession` store about 10 ms after a sign-in call resolves, so
 * anything that reads `useSession` right after a sign-in sees the stale signed-out value (G-15-14).
 * Call this and await it before navigating into a protected route. It never rejects: a failed
 * refresh leaves the store signed out and ProtectedRoute's normal /login redirect applies.
 */
export async function refreshSession(): Promise<void> {
    const state: unknown = authClient.$store.atoms.session.get();
    if (isRefetchableSessionState(state)) {
        await state.refetch();
    }
}
