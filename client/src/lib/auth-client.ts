import {twoFactorClient} from "better-auth/client/plugins";
import {createAuthClient} from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: "",
    plugins: [twoFactorClient()],
});

export const {useSession, signIn, signUp, signOut, twoFactor} = authClient;
