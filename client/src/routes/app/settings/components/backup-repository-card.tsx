import {useEffect, useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {AlertTriangle, CheckCircle2} from "lucide-react";
import {backupSettingsSchema, type BackupSettingsInput} from "@docktor/shared";

import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {
    getBackupSettings, saveBackupSettings,
    getResticStatus, testBackupConnection,
    type BackupConnectionResult, type BackupSettings, type ResticStatus,
} from "@/lib/backups-api";
import {S3Fields, SftpFields} from "./backup-repository-fields";

const EMPTY_VALUES: BackupSettingsInput = {
    repoType: "local",
    repoPath: "",
    sftpHost: "",
    sftpUser: "",
    sftpPort: null,
    sftpKey: "",
    s3Endpoint: "",
    s3Bucket: "",
    s3AccessKey: "",
    s3SecretKey: "",
    password: "",
};

/** Plain fields are always sent, blank as "", so the server can clear a previously stored value. */
function plain(value: string | null | undefined): string {
    return value?.trim() ?? "";
}

/** Secrets are sent verbatim (never trimmed); blank becomes null so the server keeps the stored one. */
function secretOrNull(value: string | null | undefined): string | null {
    return value?.trim() ? value : null;
}

/** Only the fields that belong to the selected repository type are sent. */
function buildPayload(values: BackupSettingsInput): BackupSettingsInput {
    const password = secretOrNull(values.password);
    switch (values.repoType) {
        case "sftp":
            return {
                repoType: "sftp",
                sftpHost: plain(values.sftpHost),
                sftpUser: plain(values.sftpUser),
                sftpPort: values.sftpPort ?? null,
                sftpKey: secretOrNull(values.sftpKey),
                repoPath: plain(values.repoPath),
                password,
            };
        case "s3":
            return {
                repoType: "s3",
                s3Endpoint: plain(values.s3Endpoint),
                s3Bucket: plain(values.s3Bucket),
                s3AccessKey: plain(values.s3AccessKey),
                s3SecretKey: secretOrNull(values.s3SecretKey),
                password,
            };
        default:
            return {repoType: "local", password};
    }
}

function toFormValues(settings: BackupSettings): BackupSettingsInput {
    return {
        ...EMPTY_VALUES,
        repoType: settings.repoType ?? "local",
        repoPath: settings.repoPath ?? "",
        sftpHost: settings.sftpHost ?? "",
        sftpUser: settings.sftpUser ?? "",
        sftpPort: settings.sftpPort,
        s3Endpoint: settings.s3Endpoint ?? "",
        s3Bucket: settings.s3Bucket ?? "",
        s3AccessKey: settings.s3AccessKey ?? "",
    };
}

export function BackupRepositoryCard() {
    const [loading, setLoading] = useState(true);
    const [resticStatus, setResticStatus] = useState<ResticStatus | null>(null);
    const [settings, setSettings] = useState<BackupSettings | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<BackupConnectionResult | null>(null);

    const form = useForm<BackupSettingsInput>({
        resolver: standardSchemaResolver(backupSettingsSchema),
        defaultValues: EMPTY_VALUES,
    });
    const repoType = form.watch("repoType");

    const loadSettings = async () => {
        const s = await getBackupSettings();
        setSettings(s);
        form.reset(toFormValues(s));
    };

    useEffect(() => {
        // The restic status is only a hint; the stored settings are what Save must not overwrite blind.
        Promise.all([loadSettings(), getResticStatus().catch(() => null)])
            .then(([, rs]) => setResticStatus(rs))
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A result describes the settings it was run against; any edit makes it stale.
    useEffect(() => {
        const subscription = form.watch(() => setTestResult(null));
        return () => subscription.unsubscribe();
    }, [form]);

    // Returning the promise keeps the form "submitting" (Save disabled) until the request settles.
    const handleSave = async (values: BackupSettingsInput) => {
        setTestResult(null);
        // Reloading resets the form's dirty state and refreshes the "saved" secret hints.
        const saved = saveBackupSettings(buildPayload(values)).then(loadSettings);
        toast.promise(saved, {
            loading: "Saving...",
            success: "Repository settings saved",
            error: (err: Error) => err?.message ?? "Failed to save",
        });
        await saved.catch(() => undefined);
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            setTestResult(await testBackupConnection());
        } catch (err) {
            setTestResult({ok: false, message: err instanceof Error ? err.message : "Connection test failed"});
        } finally {
            setTesting(false);
        }
    };

    const isDirty = form.formState.isDirty;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Backup Repository</CardTitle>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSave)}>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <>
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-9 w-full" />
                                </div>
                                <div className="space-y-1">
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-9 w-full" />
                                </div>
                            </>
                        ) : (
                            <>
                                {loadError && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            Could not load the current backup settings. Reload the page before changing them;
                                            saving now would overwrite what is stored.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {resticStatus && !resticStatus.available && (
                                    <Alert>
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            restic is not installed on this host. Install restic &gt;= 0.17.0 to enable backups.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <FormField
                                    control={form.control}
                                    name="repoType"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Repository type</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select type..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="local">Local</SelectItem>
                                                    <SelectItem value="sftp">SFTP</SelectItem>
                                                    <SelectItem value="s3">S3</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {repoType === "local" && (
                                    <Alert>
                                        <AlertDescription>
                                            Backups are stored in a <code className="text-sm">backups/</code> subdirectory within each stack's directory. No separate repository path is needed.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {repoType === "sftp" && (
                                    <SftpFields control={form.control} hasSecret={settings?.hasSftpKey ?? false} />
                                )}
                                {repoType === "s3" && (
                                    <S3Fields control={form.control} hasSecret={settings?.hasS3SecretKey ?? false} />
                                )}
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>
                                                Restic password
                                                {settings?.hasPassword && (
                                                    <span className="ml-2 text-xs text-muted-foreground">(password saved)</span>
                                                )}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    value={field.value ?? ""}
                                                    type="password"
                                                    autoComplete="new-password"
                                                    placeholder="Enter encryption password"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {testResult && (
                                    <Alert variant={testResult.ok ? "default" : "destructive"}>
                                        {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                        <AlertDescription>{testResult.message}</AlertDescription>
                                    </Alert>
                                )}
                            </>
                        )}
                    </CardContent>
                    <CardFooter className="flex items-center gap-4">
                        <Button type="submit" disabled={form.formState.isSubmitting || loading || loadError}>
                            Save repository settings
                        </Button>
                        {!loading && !loadError && repoType !== "local" && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTestConnection}
                                    disabled={isDirty || testing}
                                >
                                    {testing ? "Testing..." : "Test connection"}
                                </Button>
                                {isDirty && (
                                    <span className="text-xs text-muted-foreground">Save your changes to test them.</span>
                                )}
                            </>
                        )}
                        {resticStatus?.available && resticStatus.version && (
                            <Badge variant="secondary">restic {resticStatus.version}</Badge>
                        )}
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
