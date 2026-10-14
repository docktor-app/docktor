import {useEffect, useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {AlertTriangle} from "lucide-react";
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
    getResticStatus,
    type BackupSettings, type ResticStatus,
} from "@/lib/backups-api";
import {S3Fields, SftpFields} from "./backup-repository-fields";

const EMPTY_VALUES: BackupSettingsInput = {
    repoType: "local",
    repoPath: "",
    sftpHost: "",
    sftpUser: "",
    sftpKey: "",
    s3Endpoint: "",
    s3Bucket: "",
    s3AccessKey: "",
    s3SecretKey: "",
    password: "",
};

/** Blank inputs are sent as null so the server leaves the stored value (notably secrets) untouched. */
function orNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

/** Secrets are sent verbatim (never trimmed) unless blank. */
function secretOrNull(value: string | null | undefined): string | null {
    return value?.trim() ? value : null;
}

/** Only the fields that belong to the selected repository type are sent. */
function buildPayload(values: BackupSettingsInput): Record<string, string | null> {
    const password = secretOrNull(values.password);
    switch (values.repoType) {
        case "sftp":
            return {
                repoType: "sftp",
                sftpHost: orNull(values.sftpHost),
                sftpUser: orNull(values.sftpUser),
                sftpKey: secretOrNull(values.sftpKey),
                repoPath: orNull(values.repoPath),
                password,
            };
        case "s3":
            return {
                repoType: "s3",
                s3Endpoint: orNull(values.s3Endpoint),
                s3Bucket: orNull(values.s3Bucket),
                s3AccessKey: orNull(values.s3AccessKey),
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
        s3Endpoint: settings.s3Endpoint ?? "",
        s3Bucket: settings.s3Bucket ?? "",
        s3AccessKey: settings.s3AccessKey ?? "",
    };
}

export function BackupRepositoryCard() {
    const [loading, setLoading] = useState(true);
    const [resticStatus, setResticStatus] = useState<ResticStatus | null>(null);
    const [settings, setSettings] = useState<BackupSettings | null>(null);

    const form = useForm<BackupSettingsInput>({
        resolver: standardSchemaResolver(backupSettingsSchema),
        defaultValues: EMPTY_VALUES,
    });
    const repoType = form.watch("repoType");

    useEffect(() => {
        Promise.all([getBackupSettings(), getResticStatus()])
            .then(([s, rs]) => {
                setSettings(s);
                form.reset(toFormValues(s));
                setResticStatus(rs);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = (values: BackupSettingsInput) => {
        toast.promise(saveBackupSettings(buildPayload(values)), {
            loading: "Saving...",
            success: "Repository settings saved",
            error: (err: Error) => err?.message ?? "Failed to save",
        });
    };

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
                                                    placeholder="Enter encryption password"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}
                    </CardContent>
                    <CardFooter className="flex items-center gap-4">
                        <Button type="submit" disabled={form.formState.isSubmitting || loading}>
                            Save repository settings
                        </Button>
                        {resticStatus?.available && resticStatus.version && (
                            <Badge variant="secondary">restic {resticStatus.version}</Badge>
                        )}
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
