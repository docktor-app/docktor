import {useState} from "react";
import {useForm, UseFormReturn} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {
    RecoveryChallengeInput,
    recoveryChallengeSchema,
    TotpChallengeInput,
    totpChallengeSchema,
} from "@docktor/shared";
import {twoFactor} from "@/lib/auth-client";
import {AuthErrorLike, classifyAuthError} from "@/lib/auth-errors";
import {docsUrl} from "@/lib/docs-links";
import {formatRetryAfter, readRetryAfterSeconds} from "@/lib/rate-limit";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Card, CardContent, CardDescription, CardHeader, CardTitle,} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

export interface TwoFactorStepProps {
    /** The step keeps its pending state ("Verifying...") until a returned promise settles. */
    onSuccess(): void | Promise<void>;

    onBack(): void;

    onExpired(): void;
}

type Mode = "totp" | "recovery";

// Both challenge forms share the {code, trustDevice} shape, so one input type serves both.
type ChallengeForm = UseFormReturn<TotpChallengeInput>;

interface FetchErrorContext {
    response: Pick<Response, "headers">;
}

interface VerifyFetchOptions {
    onError: (context: FetchErrorContext) => void;
}

interface VerifyResult {
    error: AuthErrorLike | null;
}

interface ModeCopy {
    description: string;
    label: string;
    placeholder: string;
    invalid: string;
    switchLabel: string;
    verify: (values: TotpChallengeInput, fetchOptions: VerifyFetchOptions) => Promise<VerifyResult>;
}

const MODE_COPY: Record<Mode, ModeCopy> = {
    totp: {
        description: "Enter the 6-digit code from your authenticator app.",
        label: "Authentication code",
        placeholder: "000000",
        invalid: "That code didn't work. Check your authenticator app and try again.",
        switchLabel: "Use a recovery code",
        verify: (values, fetchOptions) => twoFactor.verifyTotp({...values, fetchOptions}),
    },
    recovery: {
        description: "Enter one of your recovery codes. Each code works once.",
        label: "Recovery code",
        placeholder: "xxxxx-xxxxx",
        invalid: "That recovery code isn't valid or was already used.",
        switchLabel: "Use authenticator app instead",
        verify: (values, fetchOptions) => twoFactor.verifyBackupCode({...values, fetchOptions}),
    },
};

interface CodeInputProps {
    mode: Mode;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    name: string;
    ref: React.Ref<HTMLInputElement>;
}

function CodeInput({mode, onChange, ...field}: Readonly<CodeInputProps>): React.JSX.Element {
    const copy = MODE_COPY[mode];

    if (mode === "totp") {
        return (
            <Input
                {...field}
                onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
                placeholder={copy.placeholder}
                inputMode="numeric"
                autoComplete="one-time-code"
                spellCheck={false}
                maxLength={6}
                autoFocus
                className="text-center font-mono text-lg tracking-widest"
            />
        );
    }

    return (
        <Input
            {...field}
            onChange={(event) => onChange(event.target.value)}
            placeholder={copy.placeholder}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="font-mono"
        />
    );
}

interface ChallengeFieldsProps {
    form: ChallengeForm;
    mode: Mode;
    onSubmit: (values: TotpChallengeInput) => Promise<void>;
}

function ChallengeFields({form, mode, onSubmit}: Readonly<ChallengeFieldsProps>): React.JSX.Element {
    const pending = form.formState.isSubmitting;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="code"
                    render={({field}) => (
                        <FormItem>
                            <FormLabel>{MODE_COPY[mode].label}</FormLabel>
                            <FormControl>
                                <CodeInput mode={mode} {...field}/>
                            </FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="trustDevice"
                    render={({field}) => (
                        <FormItem>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(checked) => field.onChange(checked === true)}
                                    />
                                </FormControl>
                                <FormLabel>Trust this device for 30 days</FormLabel>
                            </div>
                            <FormDescription>
                                You won't be asked for a code on this browser.
                            </FormDescription>
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full" disabled={pending}>
                    {pending ? "Verifying..." : "Verify"}
                </Button>
            </form>
        </Form>
    );
}

export function TwoFactorStep({onSuccess, onBack, onExpired}: Readonly<TwoFactorStepProps>): React.JSX.Element {
    const [mode, setMode] = useState<Mode>("totp");
    const [error, setError] = useState("");

    const totpForm = useForm<TotpChallengeInput>({
        resolver: standardSchemaResolver(totpChallengeSchema),
        defaultValues: {code: "", trustDevice: false},
    });
    const recoveryForm = useForm<RecoveryChallengeInput>({
        resolver: standardSchemaResolver(recoveryChallengeSchema),
        defaultValues: {code: "", trustDevice: false},
    });
    const forms: Record<Mode, ChallengeForm> = {totp: totpForm, recovery: recoveryForm};

    function switchMode(next: Mode): void {
        // The trust choice survives the switch; a typed code does not.
        forms[next].setValue("trustDevice", forms[mode].getValues("trustDevice"));
        forms[next].setValue("code", "");
        setError("");
        setMode(next);
    }

    async function onSubmit(values: TotpChallengeInput): Promise<void> {
        setError("");

        let retryAfter: number | null = null;
        const {error: verifyError} = await MODE_COPY[mode].verify(values, {
            onError: (context) => {
                retryAfter = readRetryAfterSeconds(context.response.headers);
            },
        });

        if (!verifyError) {
            await onSuccess();
            return;
        }

        switch (classifyAuthError(verifyError)) {
            case "rate-limited":
                // Nothing retries on its own and the typed code is kept for after the wait.
                setError(formatRetryAfter(retryAfter));
                break;
            case "invalid-code":
                setError(MODE_COPY[mode].invalid);
                forms[mode].setValue("code", "");
                forms[mode].setFocus("code");
                break;
            case "expired":
                onExpired();
                break;
            default:
                setError("Something went wrong. Try again.");
        }
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Two-factor authentication</CardTitle>
                <CardDescription>{MODE_COPY[mode].description}</CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <div role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <ChallengeFields key={mode} form={forms[mode]} mode={mode} onSubmit={onSubmit}/>

                <div className="mt-2 flex flex-col gap-2">
                    <Button
                        type="button"
                        variant="link"
                        className="w-full"
                        onClick={() => switchMode(mode === "totp" ? "recovery" : "totp")}
                    >
                        {MODE_COPY[mode].switchLabel}
                    </Button>
                    <Button type="button" variant="link" className="w-full" onClick={onBack}>
                        Back to sign in
                    </Button>
                </div>

                {mode === "recovery" && (
                    <p className="mt-4 text-sm text-muted-foreground">
                        Lost your device and your recovery codes? Ask whoever runs this server to reset
                        two-factor authentication. See{" "}
                        <a
                            href={docsUrl("reference/deployment", "resetting-two-factor-authentication")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                        >
                            Resetting two-factor authentication
                        </a>{" "}
                        in the Docktor documentation.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
