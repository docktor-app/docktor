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
    const [repoType, setRepoType] = useState<"local" | "">("");
    const [repoPath, setRepoPath] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resticStatus, setResticStatus] = useState<ResticStatus | null>(null);
    const [settings, setSettings] = useState<BackupSettings | null>(null);

    useEffect(() => {
        Promise.all([getBackupSettings(), getResticStatus()])
            .then(([s, rs]) => {
                setSettings(s);
                // Only local repositories are supported in v0.1.0; remote targets are planned.
                setRepoType(s.repoType === "local" ? "local" : "");
                setRepoPath(s.repoPath ?? "");
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
                                onValueChange={(v) => setRepoType(v as "local")}
                            >
                                <SelectTrigger id="repoType">
                                    <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="local">Local</SelectItem>
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
