import {useEffect, useState} from "react";
import {toast} from "sonner";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {getBackupDefaults, saveBackupDefaults, type BackupDefaults} from "@/lib/backups-api";

export function BackupDefaultsCard() {
    const [defaultSchedule, setDefaultSchedule] = useState("");
    const [keepDaily, setKeepDaily] = useState("7");
    const [keepWeekly, setKeepWeekly] = useState("4");
    const [keepMonthly, setKeepMonthly] = useState("12");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getBackupDefaults()
            .then((data: BackupDefaults) => {
                setDefaultSchedule(data.defaultSchedule ?? "");
                if (data.defaultRetention) {
                    setKeepDaily(String(data.defaultRetention.keepDaily));
                    setKeepWeekly(String(data.defaultRetention.keepWeekly));
                    setKeepMonthly(String(data.defaultRetention.keepMonthly));
                }
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    const handleSave = () => {
        setSaving(true);
        const data = {
            defaultSchedule: defaultSchedule || null,
            defaultRetention: {
                keepDaily: Number(keepDaily),
                keepWeekly: Number(keepWeekly),
                keepMonthly: Number(keepMonthly),
            },
        };
        toast.promise(saveBackupDefaults(data).finally(() => setSaving(false)), {
            loading: "Saving...",
            success: "Default backup settings saved",
            error: "Failed to save",
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Default Backup Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <>
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {Array.from({length: 3}).map((_, i) => (
                                <div key={i} className="space-y-1">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-9 w-full" />
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="space-y-1">
                            <Label htmlFor="defaultSchedule">Default schedule</Label>
                            <Input
                                id="defaultSchedule"
                                value={defaultSchedule}
                                onChange={(e) => setDefaultSchedule(e.target.value)}
                                placeholder="0 3 * * *"
                            />
                            <p className="text-xs text-muted-foreground">
                                5-field cron format (minute hour day month weekday)
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="keepDaily">Keep daily</Label>
                                <Input
                                    id="keepDaily"
                                    type="number"
                                    value={keepDaily}
                                    onChange={(e) => setKeepDaily(e.target.value)}
                                    placeholder="7"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="keepWeekly">Keep weekly</Label>
                                <Input
                                    id="keepWeekly"
                                    type="number"
                                    value={keepWeekly}
                                    onChange={(e) => setKeepWeekly(e.target.value)}
                                    placeholder="4"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="keepMonthly">Keep monthly</Label>
                                <Input
                                    id="keepMonthly"
                                    type="number"
                                    value={keepMonthly}
                                    onChange={(e) => setKeepMonthly(e.target.value)}
                                    placeholder="12"
                                />
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={saving || loading}>
                    {saving ? "Saving..." : "Save defaults"}
                </Button>
            </CardFooter>
        </Card>
    );
}
