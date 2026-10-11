import {useState} from "react";
import {Link, useNavigate} from "react-router";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {LoginInput, loginSchema} from "@docktor/shared";
import {refreshSession, signIn} from "@/lib/auth-client";
import {classifyAuthError} from "@/lib/auth-errors";
import {formatRetryAfter, readRetryAfterSeconds} from "@/lib/rate-limit";
import {TwoFactorStep} from "@/routes/auth/components/two-factor-step";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent, CardDescription, CardHeader, CardTitle,} from "@/components/ui/card";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form";

type LoginStep = "password" | "two-factor";

/** True when the sign-in result asks for a second factor instead of opening a session. */
function requiresTwoFactor(data: unknown): boolean {
    return typeof data === "object" && data !== null
        && "twoFactorRedirect" in data && data.twoFactorRedirect === true;
}

export function LoginForm(): React.JSX.Element {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<LoginStep>("password");

    const form = useForm<LoginInput>({
        resolver: standardSchemaResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    // G-15-14: the session store must hold the new session before the protected route reads it.
    async function completeSignIn(): Promise<void> {
        await refreshSession();
        navigate("/");
    }

    async function onSubmit(values: LoginInput) {
        setError("");
        setLoading(true);

        let retryAfter: number | null = null;
        const {data, error: signInError} = await signIn.email({
            email: values.email,
            password: values.password,
            fetchOptions: {
                onError: (context) => {
                    retryAfter = readRetryAfterSeconds(context.response.headers);
                },
            },
        });

        if (signInError) {
            setError(
                classifyAuthError(signInError) === "rate-limited"
                    ? formatRetryAfter(retryAfter)
                    : (signInError.message ?? "Sign in failed"),
            );
            setLoading(false);
            return;
        }

        if (requiresTwoFactor(data)) {
            // The typed credentials are not kept once the second screen is shown.
            form.reset();
            setLoading(false);
            setStep("two-factor");
            return;
        }

        await completeSignIn();
    }

    if (step === "two-factor") {
        return (
            <TwoFactorStep
                onSuccess={completeSignIn}
                onBack={() => {
                    setError("");
                    setStep("password");
                }}
                onExpired={() => {
                    setError("Your sign-in timed out. Sign in again.");
                    setStep("password");
                }}
            />
        );
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Sign in to Docktor</CardTitle>
                <CardDescription>
                    Enter your credentials to access your account
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
                            name="email"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder="you@example.com"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <Input type="password" {...field} />
                                    </FormControl>
                                    <FormMessage/>
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Signing in..." : "Sign in"}
                        </Button>
                    </form>
                </Form>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-primary hover:underline">
                        Sign up
                    </Link>
                </p>
            </CardContent>
        </Card>
    );
}
