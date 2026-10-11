import {useState} from "react";
import {toast} from "sonner";
import type {AccountSecurityStatus} from "@docktor/shared";

import {ToneBadge} from "@/components/common/tone-badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {setMandatoryTwoFactor} from "@/lib/account-api";
import {ApiError} from "@/lib/api";

export interface MandatoryTwoFactorRowProps {
    status: AccountSecurityStatus;

    onStatusChange(status: AccountSecurityStatus): void;
}

const BODY = "Anyone without two-factor authentication must set it up before they can use Docktor.";
const LOCKOUT_HELPER = "Turn on two-factor for your own account first. This keeps you from locking yourself out.";
const FAILURE = "Couldn't update the setting. Try again.";

function failureMessage(error: unknown): string {
    // Only 4xx messages are written for the user; a 5xx message is an internal detail.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.message) {
        return `${FAILURE} ${error.message}`;
    }
    return FAILURE;
}

function ConfirmRequireDialog({open, onOpenChange, onConfirm}: Readonly<{
    open: boolean;

    onOpenChange(open: boolean): void;

    onConfirm(): void;
}>): React.JSX.Element {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Require two-factor authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Every user without two-factor authentication will be asked to set it up the next time they
                        sign in or load Docktor. You keep access because yours is already enabled.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Require two-factor</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/**
 * The instance-wide "Require two-factor for all users" row (D-02, D-03). The
 * Switch is pessimistic: it always mirrors the server-confirmed status, so a
 * failed request needs no rollback. The server guard is authoritative; the UI
 * mirrors it by disabling the Switch for a caller who has no 2FA themselves.
 */
export function MandatoryTwoFactorRow({status, onStatusChange}: Readonly<MandatoryTwoFactorRowProps>): React.JSX.Element {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const lacksTwoFactor = !status.twoFactorEnabled;

    async function apply(enabled: boolean): Promise<void> {
        setPending(true);
        try {
            const result = await setMandatoryTwoFactor(enabled);
            onStatusChange(result);
            toast.success(enabled ? "Two-factor is now required for all users." : "Two-factor is no longer required.");
        } catch (error: unknown) {
            toast.error(failureMessage(error));
        } finally {
            setPending(false);
        }
    }

    function handleToggle(next: boolean): void {
        if (next) {
            // Turning it on affects every user, so it is confirmed first.
            setConfirmOpen(true);
            return;
        }
        void apply(false);
    }

    return (
        <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <Label htmlFor="mandatory-two-factor" className="text-sm font-semibold">
                        Require two-factor for all users
                    </Label>
                    {status.mandatory && <ToneBadge tone="blue">Required for all users</ToneBadge>}
                </div>
                <p id="mandatory-two-factor-body" className="text-sm text-muted-foreground">{BODY}</p>
                {lacksTwoFactor && (
                    <p id="mandatory-two-factor-helper" className="text-sm text-muted-foreground">{LOCKOUT_HELPER}</p>
                )}
            </div>
            <Switch
                id="mandatory-two-factor"
                checked={status.mandatory}
                disabled={lacksTwoFactor || pending}
                aria-describedby={
                    lacksTwoFactor ? "mandatory-two-factor-body mandatory-two-factor-helper" : "mandatory-two-factor-body"
                }
                onCheckedChange={handleToggle}
            />
            <ConfirmRequireDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                onConfirm={() => void apply(true)}
            />
        </div>
    );
}
