import {useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {PasswordConfirmInput, passwordConfirmSchema} from "@docktor/shared";

import {twoFactor} from "@/lib/auth-client";
import {classifyAuthError} from "@/lib/auth-errors";
import {createRetryAfterProbe} from "@/lib/rate-limit";
import {FormActions, FormStack} from "@/components/common/form-layout";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Form} from "@/components/ui/form";
import {ErrorBanner, FOOTER_BUTTON_CLASS, PasswordField} from "@/routes/app/account/components/dialog-form-parts";

export interface DisableTwoFactorDialogProps {
    open: boolean;

    onOpenChange(open: boolean): void;

    onDisabled(): void;
}

const FORBIDDEN_STATUS = 403;

type BodyProps = Pick<DisableTwoFactorDialogProps, "onOpenChange" | "onDisabled">;

function DisableDialogBody({onOpenChange, onDisabled}: Readonly<BodyProps>): React.JSX.Element {
    const [error, setError] = useState("");
    const form = useForm<PasswordConfirmInput>({
        resolver: standardSchemaResolver(passwordConfirmSchema),
        defaultValues: {password: ""},
    });
    const pending = form.formState.isSubmitting;

    async function onSubmit({password}: PasswordConfirmInput): Promise<void> {
        setError("");
        const probe = createRetryAfterProbe();
        const {error: disableError} = await twoFactor.disable({password, fetchOptions: probe.fetchOptions});

        if (!disableError) {
            toast.success("Two-factor authentication is off. Your other devices were signed out.");
            onDisabled();
            onOpenChange(false);
            return;
        }
        switch (classifyAuthError(disableError)) {
            case "rate-limited":
                setError(probe.message());
                break;
            case "invalid-password":
                form.setError("password", {message: "Incorrect password."});
                break;
            default:
                // A 403 here is the server's own explanation (e.g. the instance requires 2FA).
                setError(
                    disableError.status === FORBIDDEN_STATUS && disableError.message
                        ? disableError.message
                        : "Something went wrong. Try again.",
                );
        }
    }

    return (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Disable two-factor authentication</DialogTitle>
                <DialogDescription>
                    Your account will be protected by your password only, and your other signed-in devices will be
                    signed out. Enter your password to confirm.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <FormStack>
                        <ErrorBanner message={error}/>
                        <PasswordField control={form.control}/>
                        <FormActions variant="dialog">
                            <Button
                                type="button"
                                variant="outline"
                                className={FOOTER_BUTTON_CLASS}
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" variant="destructive" className={FOOTER_BUTTON_CLASS} disabled={pending}>
                                {pending ? "Disabling..." : "Disable two-factor"}
                            </Button>
                        </FormActions>
                    </FormStack>
                </form>
            </Form>
        </DialogContent>
    );
}

/**
 * Turns 2FA off after the password is re-entered (D-07). The server also
 * refuses while the instance requires 2FA and signs out the other devices
 * (D-10); a refusal is shown as the banner and the dialog stays open.
 */
export function DisableTwoFactorDialog({
    open,
    onOpenChange,
    onDisabled,
}: Readonly<DisableTwoFactorDialogProps>): React.JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <DisableDialogBody onOpenChange={onOpenChange} onDisabled={onDisabled}/>}
        </Dialog>
    );
}
