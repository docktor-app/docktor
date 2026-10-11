import {useEffect, useRef, useState} from "react";
import type {AccountSecurityStatus} from "@docktor/shared";

import {ToneBadge} from "@/components/common/tone-badge";
import {Button} from "@/components/ui/button";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {DisableTwoFactorDialog} from "@/routes/app/account/components/disable-two-factor-dialog";
import {EnrollDialog} from "@/routes/app/account/components/enroll-dialog";
import {RegenerateCodesDialog} from "@/routes/app/account/components/regenerate-codes-dialog";

export interface TwoFactorSectionProps {
    status: AccountSecurityStatus;

    onChanged(): void;

    /** Opens the enrollment dialog by itself, once per mount (forced enrollment, D-01). */
    autoOpenEnroll?: boolean;
}

const NOT_ENABLED_BODY =
    "Add a second step to sign-in using an authenticator app such as 1Password, Aegis, or Google Authenticator.";
const ENABLED_BODY = "Your account asks for a code from your authenticator app when you sign in.";
const DISABLE_BLOCKED_REASON =
    "Turn off the instance-wide requirement before disabling two-factor on your account.";
const DISABLE_BLOCKED_REASON_ID = "disable-two-factor-blocked-reason";

interface EnabledActionsProps {
    /** True while the instance requires 2FA: the server refuses to disable it then. */
    mandatory: boolean;

    onChanged(): void;
}

/** "Regenerate recovery codes" and "Disable two-factor", each behind a password dialog (D-07). */
function EnabledActions({mandatory, onChanged}: Readonly<EnabledActionsProps>): React.JSX.Element {
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);

    const disableButton = (
        <Button
            type="button"
            variant="outline"
            className="text-destructive"
            disabled={mandatory}
            aria-disabled={mandatory || undefined}
            aria-describedby={mandatory ? DISABLE_BLOCKED_REASON_ID : undefined}
            onClick={() => setDisableOpen(true)}
        >
            Disable two-factor
        </Button>
    );

    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" onClick={() => setRegenerateOpen(true)}>
                Regenerate recovery codes
            </Button>
            {mandatory ? (
                <TooltipProvider>
                    <Tooltip>
                        {/* A disabled button swallows pointer and focus events; the wrapper keeps the tooltip reachable. */}
                        <TooltipTrigger asChild>
                            <span tabIndex={0} className="inline-flex">{disableButton}</span>
                        </TooltipTrigger>
                        <TooltipContent>{DISABLE_BLOCKED_REASON}</TooltipContent>
                    </Tooltip>
                    {/* Touch and keyboard users get the reason without hovering. */}
                    <span id={DISABLE_BLOCKED_REASON_ID} className="sr-only">{DISABLE_BLOCKED_REASON}</span>
                </TooltipProvider>
            ) : disableButton}
            <RegenerateCodesDialog open={regenerateOpen} onOpenChange={setRegenerateOpen} onRegenerated={onChanged}/>
            <DisableTwoFactorDialog open={disableOpen} onOpenChange={setDisableOpen} onDisabled={onChanged}/>
        </div>
    );
}

/** The 2FA row of the Security section: status pill, explanation and the enroll or manage actions. */
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
            {enabled ? (
                <EnabledActions mandatory={status.mandatory} onChanged={onChanged}/>
            ) : (
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
