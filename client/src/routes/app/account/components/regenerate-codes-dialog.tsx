import {useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {PasswordConfirmInput, passwordConfirmSchema} from "@docktor/shared";

import {twoFactor} from "@/lib/auth-client";
import {classifyAuthError} from "@/lib/auth-errors";
import {createRetryAfterProbe} from "@/lib/rate-limit";
import {RecoveryCodesPanel} from "@/components/domain/auth/recovery-codes-panel";
import {FormActions, FormStack} from "@/components/common/form-layout";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Form} from "@/components/ui/form";
import {ErrorBanner, FOOTER_BUTTON_CLASS, PasswordField} from "@/routes/app/account/components/dialog-form-parts";

export interface RegenerateCodesDialogProps {
    open: boolean;

    onOpenChange(open: boolean): void;

    onRegenerated(): void;
}

interface PasswordStepProps {
    onGenerated(codes: readonly string[]): void;

    onCancel(): void;
}

function PasswordStep({onGenerated, onCancel}: Readonly<PasswordStepProps>): React.JSX.Element {
    const [error, setError] = useState("");
    const form = useForm<PasswordConfirmInput>({
        resolver: standardSchemaResolver(passwordConfirmSchema),
        defaultValues: {password: ""},
    });
    const pending = form.formState.isSubmitting;

    async function onSubmit({password}: PasswordConfirmInput): Promise<void> {
        setError("");
        const probe = createRetryAfterProbe();
        const {data, error: generateError} = await twoFactor.generateBackupCodes({
            password,
            fetchOptions: probe.fetchOptions,
        });

        if (!generateError && data) {
            onGenerated(data.backupCodes);
            return;
        }
        switch (classifyAuthError(generateError)) {
            case "rate-limited":
                // The typed password is kept; nothing retries on its own.
                setError(probe.message());
                break;
            case "invalid-password":
                form.setError("password", {message: "Incorrect password."});
                break;
            default:
                setError("Something went wrong. Try again.");
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Regenerate recovery codes</DialogTitle>
                <DialogDescription>
                    Your current recovery codes will stop working immediately, and your other signed-in devices will
                    be signed out. Enter your password to continue.
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <FormStack>
                        <ErrorBanner message={error}/>
                        <PasswordField control={form.control}/>
                        <FormActions variant="dialog">
                            <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} onClick={onCancel}>
                                Cancel
                            </Button>
                            <Button type="submit" className={FOOTER_BUTTON_CLASS} disabled={pending}>
                                {pending ? "Regenerating..." : "Regenerate codes"}
                            </Button>
                        </FormActions>
                    </FormStack>
                </form>
            </Form>
        </>
    );
}

interface CodesStepProps {
    codes: readonly string[];

    onDone(): void;
}

function CodesStep({codes, onDone}: Readonly<CodesStepProps>): React.JSX.Element {
    const [saved, setSaved] = useState(false);

    return (
        <>
            <DialogHeader>
                <DialogTitle>Save your new recovery codes</DialogTitle>
                <DialogDescription aria-live="polite">Your old codes no longer work.</DialogDescription>
            </DialogHeader>
            <RecoveryCodesPanel codes={codes} saved={saved} onSavedChange={setSaved}/>
            <DialogFooter>
                <Button type="button" className={FOOTER_BUTTON_CLASS} disabled={!saved} onClick={onDone}>
                    Done
                </Button>
            </DialogFooter>
        </>
    );
}

type BodyProps = Pick<RegenerateCodesDialogProps, "onOpenChange" | "onRegenerated">;

function RegenerateDialogBody({onOpenChange, onRegenerated}: Readonly<BodyProps>): React.JSX.Element {
    // The new codes live only here; the body unmounts on close, which drops them (D-06).
    const [codes, setCodes] = useState<readonly string[] | null>(null);

    // Until the user confirms they saved the codes, only "Done" may close the dialog.
    const holdsSecrets = codes !== null;
    const keepOpen = (event: Event): void => {
        if (holdsSecrets) {
            event.preventDefault();
        }
    };

    function handleDone(): void {
        toast.success("Recovery codes regenerated.");
        onRegenerated();
        onOpenChange(false);
    }

    return (
        <DialogContent
            showCloseButton={!holdsSecrets}
            onInteractOutside={keepOpen}
            onEscapeKeyDown={keepOpen}
            className="max-h-[90vh] overflow-y-auto"
        >
            {codes === null
                ? <PasswordStep onGenerated={setCodes} onCancel={() => onOpenChange(false)}/>
                : <CodesStep codes={codes} onDone={handleDone}/>}
        </DialogContent>
    );
}

/**
 * Replaces the recovery codes (D-06, D-07): password first, then the 10 new
 * codes behind the same "I have saved these" gate as enrollment. The server
 * signs out the other devices (D-10), which the copy says up front.
 */
export function RegenerateCodesDialog({
    open,
    onOpenChange,
    onRegenerated,
}: Readonly<RegenerateCodesDialogProps>): React.JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <RegenerateDialogBody onOpenChange={onOpenChange} onRegenerated={onRegenerated}/>}
        </Dialog>
    );
}
