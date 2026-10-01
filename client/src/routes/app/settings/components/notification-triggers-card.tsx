import {useEffect, useState} from "react";
import {toast} from "sonner";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Switch} from "@/components/ui/switch";
import {getNotificationTriggers, updateNotificationTriggers} from "@/lib/notifications-api";

export function NotificationTriggersCard() {
    const [stackError, setStackError] = useState(false);
    const [diskWarning, setDiskWarning] = useState(false);
    const [diskThresholdPercent, setDiskThresholdPercent] = useState(10);
    const [diskThresholdBytes, setDiskThresholdBytes] = useState(2147483648);
    const [backupFailure, setBackupFailure] = useState(false);
    const [triggersLoading, setTriggersLoading] = useState(true);

    useEffect(() => {
        getNotificationTriggers()
            .then((data) => {
                setStackError(data.stackError);
                setDiskWarning(data.diskWarning);
                setDiskThresholdPercent(data.diskThresholdPercent);
                setDiskThresholdBytes(data.diskThresholdBytes);
                setBackupFailure(data.backupFailure);
                setTriggersLoading(false);
            })
            .catch(() => {
                setTriggersLoading(false);
            });
    }, []);

    const handleToggle = async (
        key: "stackError" | "diskWarning" | "backupFailure",
        value: boolean,
    ) => {
        const prev =
            key === "stackError" ? stackError
            : key === "diskWarning" ? diskWarning
            : backupFailure;
        if (key === "stackError") setStackError(value);
        else if (key === "diskWarning") setDiskWarning(value);
        else setBackupFailure(value);
        try {
            await updateNotificationTriggers({[key]: value});
            toast.success("Notification settings saved");
        } catch {
            if (key === "stackError") setStackError(prev);
            else if (key === "diskWarning") setDiskWarning(prev);
            else setBackupFailure(prev);
            toast.error("Failed to update notification settings");
        }
    };

    const handleThresholdUpdate = async (
        key: "diskThresholdPercent" | "diskThresholdBytes",
        value: number,
    ) => {
        const prev = key === "diskThresholdPercent" ? diskThresholdPercent : diskThresholdBytes;
        if (key === "diskThresholdPercent") setDiskThresholdPercent(value);
        else setDiskThresholdBytes(value);
        try {
            await updateNotificationTriggers({[key]: value});
            toast.success("Threshold updated");
        } catch {
            if (key === "diskThresholdPercent") setDiskThresholdPercent(prev);
            else setDiskThresholdBytes(prev);
            toast.error("Failed to update threshold");
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const k = 1024;
        let i = 0;
        let value = bytes;
        while (value >= k && i < units.length - 1) {
            value /= k;
            i++;
        }
        return `${Math.round(value)} ${units[i]}`;
    };

    const parseBytes = (input: string): number => {
        const match = input.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
        if (!match) return 0;
        const value = Number.parseFloat(match[1]);
        const unit = (match[2] || "B").toUpperCase();
        const multipliers: Record<string, number> = {
            B: 1,
            KB: 1024,
            MB: 1024 ** 2,
            GB: 1024 ** 3,
            TB: 1024 ** 4,
        };
        return Math.round(value * (multipliers[unit] || 1));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notification Triggers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {triggersLoading ? (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-4 w-64" />
                            </div>
                            <Skeleton className="h-6 w-11" />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-72" />
                            </div>
                            <Skeleton className="h-6 w-11" />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-44" />
                                <Skeleton className="h-4 w-68" />
                            </div>
                            <Skeleton className="h-6 w-11" />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Label className="font-normal">Stack Error / Unhealthy</Label>
                                <p className="text-sm text-muted-foreground">Send an alert when a stack enters ERROR or UNHEALTHY state</p>
                            </div>
                            <Switch checked={stackError} onCheckedChange={(v) => handleToggle("stackError", v)} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Label className="font-normal">Disk Space Warning</Label>
                                <p className="text-sm text-muted-foreground">Send an alert when disk space drops below configured thresholds</p>
                            </div>
                            <Switch checked={diskWarning} onCheckedChange={(v) => handleToggle("diskWarning", v)} />
                        </div>
                        {diskWarning && (
                            <div className="ml-4 grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-1">
                                    <Label htmlFor="diskThresholdPercent">Threshold (%)</Label>
                                    <Input
                                        id="diskThresholdPercent"
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={diskThresholdPercent}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (Number.isNaN(val)) return;
                                            setDiskThresholdPercent(Math.min(99, Math.max(1, val)));
                                        }}
                                        onBlur={() => handleThresholdUpdate("diskThresholdPercent", diskThresholdPercent)}
                                        placeholder="10"
                                    />
                                    <p className="text-xs text-muted-foreground">Alert when free space drops below this percentage</p>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="diskThresholdBytes">Threshold (bytes)</Label>
                                    <Input
                                        id="diskThresholdBytes"
                                        type="text"
                                        value={formatBytes(diskThresholdBytes)}
                                        onChange={(e) => {
                                            const bytes = parseBytes(e.target.value);
                                            setDiskThresholdBytes(Math.max(1, bytes));
                                        }}
                                        onBlur={() => handleThresholdUpdate("diskThresholdBytes", diskThresholdBytes)}
                                        placeholder="2 GB"
                                    />
                                    <p className="text-xs text-muted-foreground">Alert when free space drops below this amount (e.g., 2 GB)</p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <Label className="font-normal">Backup Failure</Label>
                                <p className="text-sm text-muted-foreground">Send an alert when a scheduled or manual backup fails</p>
                            </div>
                            <Switch checked={backupFailure} onCheckedChange={(v) => handleToggle("backupFailure", v)} />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
