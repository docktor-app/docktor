import {useEffect, useState} from "react";
import {toast} from "sonner";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {getGeneralSettings, updateGeneralSettings} from "@/lib/settings-api";
import {ApiError} from "@/lib/api";
import {TimezoneCombobox} from "@/routes/app/settings/components/timezone-combobox";

export function GeneralSettingsCard() {
    const [instanceName, setInstanceName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [timezone, setTimezone] = useState("UTC");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        getGeneralSettings()
            .then((data) => {
                setInstanceName(data.instanceName);
                setBaseUrl(data.baseUrl);
                setTimezone(data.timezone);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    const handleSaveGeneral = async () => {
        setErrors({});
        setSaving(true);
        try {
            const updated = await updateGeneralSettings({
                instanceName,
                baseUrl: baseUrl || undefined,
                timezone,
            });
            setInstanceName(updated.instanceName);
            setBaseUrl(updated.baseUrl);
            setTimezone(updated.timezone);
            toast.success("Settings saved");
        } catch (err) {
            if (err instanceof ApiError && err.status === 400) {
                const msg = err.message;
                if (msg.toLowerCase().includes("instance name")) {
                    setErrors({instanceName: msg});
                } else if (msg.toLowerCase().includes("base url") || msg.toLowerCase().includes("url")) {
                    setErrors({baseUrl: msg});
                } else if (msg.toLowerCase().includes("timezone")) {
                    setErrors({timezone: msg});
                } else {
                    setErrors({general: msg});
                }
            } else {
                toast.error("Failed to save settings");
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <>
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    </>
                ) : (
                    <>
                        {errors.general && (
                            <p className="text-sm text-destructive">{errors.general}</p>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="instanceName">Instance Name</Label>
                            <Input
                                id="instanceName"
                                value={instanceName}
                                onChange={(e) => setInstanceName(e.target.value)}
                                placeholder="Docktor"
                            />
                            {errors.instanceName && (
                                <p className="text-sm text-destructive">{errors.instanceName}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="baseUrl">Base URL</Label>
                            <Input
                                id="baseUrl"
                                type="url"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://docktor.example.com"
                            />
                            {errors.baseUrl && (
                                <p className="text-sm text-destructive">{errors.baseUrl}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label>Timezone</Label>
                            <TimezoneCombobox value={timezone} onChange={setTimezone} />
                            {errors.timezone && (
                                <p className="text-sm text-destructive">{errors.timezone}</p>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleSaveGeneral} disabled={saving || loading}>
                    {saving ? "Saving..." : "Save"}
                </Button>
            </CardFooter>
        </Card>
    );
}
