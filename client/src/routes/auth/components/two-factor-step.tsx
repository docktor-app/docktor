import {useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {TotpChallengeInput, totpChallengeSchema} from "@docktor/shared";
import {twoFactor} from "@/lib/auth-client";
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
    onSuccess(): void;

    onBack(): void;

    onExpired(): void;
}

export function TwoFactorStep({onSuccess, onBack}: Readonly<TwoFactorStepProps>): React.JSX.Element {
    const [error, setError] = useState("");

    const form = useForm<TotpChallengeInput>({
        resolver: standardSchemaResolver(totpChallengeSchema),
        defaultValues: {code: "", trustDevice: false},
    });

    async function onSubmit(values: TotpChallengeInput): Promise<void> {
        setError("");

        const {error: verifyError} = await twoFactor.verifyTotp({
            code: values.code,
            trustDevice: values.trustDevice,
        });

        if (verifyError) {
            setError(verifyError.message ?? "Verification failed");
            return;
        }

        onSuccess();
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Two-factor authentication</CardTitle>
                <CardDescription>
                    Enter the 6-digit code from your authenticator app.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <div role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? "Verifying..." : "Verify"}
                        </Button>
                    </form>
                </Form>

                <Button type="button" variant="link" className="mt-2 w-full" onClick={onBack}>
                    Back to sign in
                </Button>
            </CardContent>
        </Card>
    );
}
