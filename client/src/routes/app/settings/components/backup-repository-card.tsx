import {useEffect, useState} from "react";
import {toast} from "sonner";
import {AlertTriangle} from "lucide-react";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
    getBackupSettings, saveBackupSettings,
    getResticStatus,
    type BackupSettings, type ResticStatus,
} from "@/lib/backups-api";

export function BackupRepositoryCard() {
    const [repoType, setRepoType] = useState<"local" | "sftp" | "s3" | "">("");
    const [repoPath, setRepoPath] = useState("");
    const [sftpHost, setSftpHost] = useState("");
    const [sftpUser, setSftpUser] = useState("");
    const [sftpKey, setSftpKey] = useState("");
    const [s3Endpoint, setS3Endpoint] = useState("");
    const [s3Bucket, setS3Bucket] = useState("");
    const [s3AccessKey, setS3AccessKey] = useState("");
    const [s3SecretKey, setS3SecretKey] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resticStatus, setResticStatus] = useState<ResticStatus | null>(null);
    const [settings, setSettings] = useState<BackupSettings | null>(null);

    useEffect(() => {
        Promise.all([getBackupSettings(), getResticStatus()])
            .then(([s, rs]) => {
                setSettings(s);
                setRepoType(s.repoType ?? "");
                setRepoPath(s.repoPath ?? "");
                setSftpHost(s.sftpHost ?? "");
                setSftpUser(s.sftpUser ?? "");
                setS3Endpoint(s.s3Endpoint ?? "");
                setS3Bucket(s.s3Bucket ?? "");
                setS3AccessKey(s.s3AccessKey ?? "");
                setResticStatus(rs);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    const handleSave = () => {
        setSaving(true);
        const data: Record<string, unknown> = {
            repoType: repoType || null,
            repoPath: repoPath || null,
            sftpHost: sftpHost || null,
            sftpUser: sftpUser || null,
            sftpKey: sftpKey || null,
            s3Endpoint: s3Endpoint || null,
            s3Bucket: s3Bucket || null,
            s3AccessKey: s3AccessKey || null,
            s3SecretKey: s3SecretKey || null,
            password: password || null,
        };
        toast.promise(saveBackupSettings(data).finally(() => setSaving(false)), {
            loading: "Saving...",
            success: "Repository settings saved",
            error: "Failed to save",
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Backup Repository</CardTitle>
            </CardHeader>
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
                        <div className="space-y-1">
                            <Label htmlFor="repoType">Repository type</Label>
                            <Select
                                value={repoType}
                                onValueChange={(v) => setRepoType(v as "local" | "sftp" | "s3")}
                            >
                                <SelectTrigger id="repoType">
                                    <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="local">Local</SelectItem>
                                    <SelectItem value="sftp">SFTP</SelectItem>
                                    <SelectItem value="s3">S3-compatible</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {repoType === "local" && (
                            <Alert>
                                <AlertDescription>
                                    Backups are stored in a <code className="text-sm">backups/</code> subdirectory within each stack's directory. No separate repository path is needed.
                                </AlertDescription>
                            </Alert>
                        )}
                        {repoType === "sftp" && (
                            <>
                                <div className="space-y-1">
                                    <Label htmlFor="repoPath">Repository path</Label>
                                    <Input
                                        id="repoPath"
                                        value={repoPath}
                                        onChange={(e) => setRepoPath(e.target.value)}
                                        placeholder="/backups"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="sftpHost">Host</Label>
                                    <Input
                                        id="sftpHost"
                                        value={sftpHost}
                                        onChange={(e) => setSftpHost(e.target.value)}
                                        placeholder="backup.example.com"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="sftpUser">Username</Label>
                                    <Input
                                        id="sftpUser"
                                        value={sftpUser}
                                        onChange={(e) => setSftpUser(e.target.value)}
                                        placeholder="backup-user"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="sftpKey">
                                        Private key (PEM)
                                        {settings?.hasSftpKey && (
                                            <span className="ml-2 text-xs text-muted-foreground">(key saved)</span>
                                        )}
                                    </Label>
                                    <textarea
                                        id="sftpKey"
                                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={sftpKey}
                                        onChange={(e) => setSftpKey(e.target.value)}
                                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                    />
                                </div>
                            </>
                        )}
                        {repoType === "s3" && (
                            <>
                                <div className="space-y-1">
                                    <Label htmlFor="s3Endpoint">Endpoint URL</Label>
                                    <Input
                                        id="s3Endpoint"
                                        value={s3Endpoint}
                                        onChange={(e) => setS3Endpoint(e.target.value)}
                                        placeholder="https://s3.amazonaws.com"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="s3Bucket">Bucket name</Label>
                                    <Input
                                        id="s3Bucket"
                                        value={s3Bucket}
                                        onChange={(e) => setS3Bucket(e.target.value)}
                                        placeholder="my-backup-bucket"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="s3AccessKey">Access key ID</Label>
                                    <Input
                                        id="s3AccessKey"
                                        value={s3AccessKey}
                                        onChange={(e) => setS3AccessKey(e.target.value)}
                                        placeholder="AKIAIOSFODNN7EXAMPLE"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="s3SecretKey">
                                        Secret access key
                                        {settings?.hasS3SecretKey && (
                                            <span className="ml-2 text-xs text-muted-foreground">(key saved)</span>
                                        )}
                                    </Label>
                                    <Input
                                        id="s3SecretKey"
                                        type="password"
                                        value={s3SecretKey}
                                        onChange={(e) => setS3SecretKey(e.target.value)}
                                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                    />
                                </div>
                            </>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="resticPassword">
                                Restic password
                                {settings?.hasPassword && (
                                    <span className="ml-2 text-xs text-muted-foreground">(password saved)</span>
                                )}
                            </Label>
                            <Input
                                id="resticPassword"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter encryption password"
                            />
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter className="flex items-center gap-4">
                <Button onClick={handleSave} disabled={saving || loading}>
                    {saving ? "Saving..." : "Save repository settings"}
                </Button>
                {resticStatus?.available && resticStatus.version && (
                    <Badge variant="secondary">restic {resticStatus.version}</Badge>
                )}
            </CardFooter>
        </Card>
    );
}
