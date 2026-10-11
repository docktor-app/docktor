import {useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {
    PasswordConfirmInput,
    passwordConfirmSchema,
    TotpCodeInput,
    totpCodeSchema,
} from "@docktor/shared";

import {twoFactor} from "@/lib/auth-client";
import {classifyAuthError} from "@/lib/auth-errors";
import {RecoveryCodesPanel} from "@/components/domain/auth/recovery-codes-panel";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";

export interface EnrollDialogProps {
    open: boolean;

    onOpenChange(open: boolean): void;

    onEnrolled(): void;
}

type Step = 1 | 2 | 3;

// The server's one-time secrets; they live only in this dialog's state and are
// dropped when the dialog unmounts on close (D-06: shown once, never persisted).
interface Enrollment {
    totpURI: string;
    backupCodes: readonly string[];
}

const FOOTER_BUTTON_CLASS = "w-full sm:w-auto";

/** The TOTP shared secret, read from the `secret` parameter of the otpauth URI. */
function parseSetupKey(totpURI: string): string | null {
    try {
        return new URL(totpURI).searchParams.get("secret");
    } catch {
        return null;
    }
}

function ErrorBanner({message}: Readonly<{ message: string }>): React.JSX.Element | null {
    if (!message) {
        return null;
    }
    return (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {message}
        </div>
    );
}

interface StepHeaderProps {
    title: string;
    step: Step;
    children?: React.ReactNode;
}

function StepHeader({title, step, children}: Readonly<StepHeaderProps>): React.JSX.Element {
    return (
        <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription aria-live="polite">Step {step} of 3</DialogDescription>
            {children && <p className="text-sm">{children}</p>}
        </DialogHeader>
    );
}

interface PasswordStepProps {
    onEnabled(enrollment: Enrollment): void;

    onCancel(): void;
}

function PasswordStep({onEnabled, onCancel}: Readonly<PasswordStepProps>): React.JSX.Element {
    const [error, setError] = useState("");
    const form = useForm<PasswordConfirmInput>({
        resolver: standardSchemaResolver(passwordConfirmSchema),
        defaultValues: {password: ""},
    });
    const pending = form.formState.isSubmitting;

    async function onSubmit({password}: PasswordConfirmInput): Promise<void> {
        setError("");
        const {data, error: enableError} = await twoFactor.enable({password});

        if (!enableError && data) {
            onEnabled({totpURI: data.totpURI, backupCodes: data.backupCodes});
            return;
        }
        if (classifyAuthError(enableError) === "invalid-password") {
            form.setError("password", {message: "Incorrect password."});
            return;
        }
        setError("Something went wrong. Try again.");
    }

    return (
        <>
            <StepHeader title="Set up two-factor authentication" step={1}>
                Enter your password to continue.
            </StepHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <ErrorBanner message={error}/>
                    <FormField
                        control={form.control}
                        name="password"
                        render={({field}) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input type="password" autoComplete="current-password" autoFocus {...field}/>
                                </FormControl>
                                <FormMessage/>
                            </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" className={FOOTER_BUTTON_CLASS} disabled={pending}>
                            {pending ? "Checking..." : "Continue"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </>
    );
}

interface CodesStepProps {
    codes: readonly string[];

    onContinue(): void;

    onCancel(): void;
}

function CodesStep({codes, onContinue, onCancel}: Readonly<CodesStepProps>): React.JSX.Element {
    const [saved, setSaved] = useState(false);

    return (
        <>
            <StepHeader title="Save your recovery codes" step={2}/>
            <RecoveryCodesPanel codes={codes} saved={saved} onSavedChange={setSaved}/>
            <DialogFooter>
                <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} onClick={onCancel}>
                    Cancel setup
                </Button>
                <Button type="button" className={FOOTER_BUTTON_CLASS} disabled={!saved} onClick={onContinue}>
                    Continue
                </Button>
            </DialogFooter>
        </>
    );
}

interface VerifyStepProps {
    totpURI: string;

    onVerified(): void;

    onCancel(): void;
}

function VerifyStep({totpURI, onVerified, onCancel}: Readonly<VerifyStepProps>): React.JSX.Element {
    const [error, setError] = useState("");
    const setupKey = parseSetupKey(totpURI);
    const form = useForm<TotpCodeInput>({
        resolver: standardSchemaResolver(totpCodeSchema),
        defaultValues: {code: ""},
    });
    const pending = form.formState.isSubmitting;

    async function onSubmit({code}: TotpCodeInput): Promise<void> {
        setError("");
        const {error: verifyError} = await twoFactor.verifyTotp({code});

        if (!verifyError) {
            toast.success("Two-factor authentication is on. Your other devices were signed out.");
            onVerified();
            return;
        }
        if (classifyAuthError(verifyError) === "invalid-code") {
            setError("That code didn't work. Check your authenticator app and try again.");
            form.setValue("code", "");
            form.setFocus("code");
            return;
        }
        setError("Something went wrong. Try again.");
    }

    return (
        <>
            <StepHeader title="Scan the QR code" step={3}>
                Scan this code with your authenticator app, then enter the 6-digit code it shows.
            </StepHeader>
            {setupKey && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Can't scan? Enter this key instead</p>
                    <p className="rounded-md bg-muted p-2 font-mono text-sm break-all">{setupKey}</p>
                </div>
            )}
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <ErrorBanner message={error}/>
                    <FormField
                        control={form.control}
                        name="code"
                        render={({field}) => (
                            <FormItem>
                                <FormLabel>Authentication code</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                                        placeholder="000000"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        spellCheck={false}
                                        maxLength={6}
                                        autoFocus
                                        className="text-center font-mono text-lg tracking-widest"
                                    />
                                </FormControl>
                                <FormMessage/>
                            </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" className={FOOTER_BUTTON_CLASS} onClick={onCancel}>
                            Cancel setup
                        </Button>
                        <Button type="submit" className={FOOTER_BUTTON_CLASS} disabled={pending}>
                            {pending ? "Verifying..." : "Verify and enable"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </>
    );
}

type EnrollBodyProps = Pick<EnrollDialogProps, "onOpenChange" | "onEnrolled">;

function EnrollDialogBody({onOpenChange, onEnrolled}: Readonly<EnrollBodyProps>): React.JSX.Element {
    const [step, setStep] = useState<Step>(1);
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

    // Steps 2-3 hold secrets the user has not secured yet: only "Cancel setup" closes them.
    const holdsSecrets = step > 1;
    const close = (): void => onOpenChange(false);
    const keepOpen = (event: Event): void => {
        if (holdsSecrets) {
            event.preventDefault();
        }
    };

    function handleEnabled(next: Enrollment): void {
        setEnrollment(next);
        setStep(2);
    }

    function handleVerified(): void {
        onEnrolled();
        close();
    }

    return (
        <DialogContent
            showCloseButton={!holdsSecrets}
            onInteractOutside={keepOpen}
            onEscapeKeyDown={keepOpen}
            className="max-h-[90vh] overflow-y-auto"
        >
            {step === 1 && <PasswordStep onEnabled={handleEnabled} onCancel={close}/>}
            {step === 2 && enrollment && (
                <CodesStep codes={enrollment.backupCodes} onContinue={() => setStep(3)} onCancel={close}/>
            )}
            {step === 3 && enrollment && (
                <VerifyStep totpURI={enrollment.totpURI} onVerified={handleVerified} onCancel={close}/>
            )}
        </DialogContent>
    );
}

/**
 * Three-step 2FA enrollment (D-06, D-07): password, recovery codes, then the
 * first authenticator code. 2FA only turns on once that code verifies, so
 * closing earlier leaves the account unenrolled. The body is mounted only
 * while open, which drops the totpURI, codes and form values on every close.
 */
export function EnrollDialog({open, onOpenChange, onEnrolled}: Readonly<EnrollDialogProps>): React.JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <EnrollDialogBody onOpenChange={onOpenChange} onEnrolled={onEnrolled}/>}
        </Dialog>
    );
}
