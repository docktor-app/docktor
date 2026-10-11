import type {AccountSecurityStatus} from "@docktor/shared";

import {apiFetch} from "./api";

export type {AccountSecurityStatus};

// Backed by server/src/routes/account.ts (15-02).
export async function getAccountSecurity(): Promise<AccountSecurityStatus> {
    return apiFetch<AccountSecurityStatus>("/api/account/security");
}

export async function setMandatoryTwoFactor(enabled: boolean): Promise<AccountSecurityStatus> {
    return apiFetch<AccountSecurityStatus>("/api/account/security/mandatory-2fa", {
        method: "PUT",
        body: JSON.stringify({enabled}),
    });
}
