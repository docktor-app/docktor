import {useEffect, useRef, useState} from "react";
import type {AccountSecurityStatus} from "@docktor/shared";

import {ToneBadge} from "@/components/common/tone-badge";
import {Button} from "@/components/ui/button";
import {EnrollDialog} from "@/routes/app/account/components/enroll-dialog";

export interface TwoFactorSectionProps {
    status: AccountSecurityStatus;

    onChanged(): void;

    /** Opens the enrollment dialog by itself, once per mount (forced enrollment, D-01). */
    autoOpenEnroll?: boolean;
}

const NOT_ENABLED_BODY =
    "Add a second step to sign-in using an authenticator app such as 1Password, Aegis, or Google Authenticator.";
const ENABLED_BODY = "Your account asks for a code from your authenticator app when you sign in.";

/** The 2FA row of the Security section: status pill, explanation and the enroll entry point. */
export function TwoFactorSection({
    status,
    onChanged,
    autoOpenEnroll = false,
}: Readonly<TwoFactorSectionProps>): React.JSX.Element {
    const [enrollOpen, setEnrollOpen] = useState(false);
    const autoOpened = useRef(false);
    const enabled = status.twoFactorEnabled;

    // The ref keeps a rerender or a later status change from reopening a dialog the user closed.
    useEffect(() => {
        if (autoOpenEnroll && !autoOpened.current) {
            autoOpened.current = true;
            setEnrollOpen(true);
        }
    }, [autoOpenEnroll]);

    return (
        <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Two-factor authentication</h3>
                    <ToneBadge tone={enabled ? "green" : "neutral"}>{enabled ? "Enabled" : "Not enabled"}</ToneBadge>
                </div>
                <p className="text-sm text-muted-foreground">{enabled ? ENABLED_BODY : NOT_ENABLED_BODY}</p>
            </div>
            {!enabled && (
                <>
                    <Button type="button" onClick={() => setEnrollOpen(true)}>
                        Set up two-factor authentication
                    </Button>
                    <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} onEnrolled={onChanged}/>
                </>
            )}
        </div>
    );
}
