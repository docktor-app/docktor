import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router";
import {AlertTriangle, Check, ChevronsUpDown} from "lucide-react";
import {toast} from "sonner";
import {Page, PageContent, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,} from "@/components/ui/command";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {getGeneralSettings, updateGeneralSettings} from "@/lib/settings-api";
import {
    getBackupSettings, saveBackupSettings,
    getBackupDefaults, saveBackupDefaults,
    getResticStatus,
    type BackupSettings, type BackupDefaults, type ResticStatus,
} from "@/lib/backups-api";
import {ApiError} from "@/lib/api";
import {cn} from "@/lib/utils";
import {ProxySettingsCard} from "@/routes/app/settings/components/proxy-settings-card";
import {CertificatesCard} from "@/routes/app/settings/components/certificates-card";
import {SmtpCard} from "@/routes/app/settings/components/smtp-card";
import {NotificationTriggersCard} from "@/routes/app/settings/components/notification-triggers-card";
import {NotificationLogCard} from "@/routes/app/settings/components/notification-log-card";

const TIMEZONES = Intl.supportedValuesOf("timeZone");
const VALID_TABS = ["general", "notifications", "backup", "proxy"] as const;
type Tab = typeof VALID_TABS[number];

interface TimezoneComboboxProps {
    value: string;
    onChange: (value: string) => void;
}

function TimezoneCombobox({value, onChange}: TimezoneComboboxProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {value || "Select timezone..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput placeholder="Search timezone..." />
                    <CommandList>
                        <CommandEmpty>No timezone found.</CommandEmpty>
                        <CommandGroup>
                            {TIMEZONES.map((tz) => (
                                <CommandItem
                                    key={tz}
                                    value={tz}
                                    onSelect={(val) => {
                                        onChange(val);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === tz ? "opacity-100" : "opacity-0",
                                        )}
                                    />
                                    {tz}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function BackupRepositoryCard() {
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

function BackupDefaultsCard() {
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

export default function SettingsPage() {
    const {tab} = useParams<{tab: string}>();
    const navigate = useNavigate();
    const activeTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "general";

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
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Settings</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <div>
                    <PageTitle>Settings</PageTitle>
                    <PageDescription>Configure your Docktor instance</PageDescription>
                </div>
            </PageHeader>
            <PageContent>
                <Tabs value={activeTab} onValueChange={(v) => navigate(`/settings/${v}`)}>
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                        <TabsTrigger value="backup">Backup</TabsTrigger>
                        <TabsTrigger value="proxy">Proxy</TabsTrigger>
                    </TabsList>
                    <TabsContent value="general">
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
                    </TabsContent>
                    <TabsContent value="notifications">
                        <div className="space-y-6">
                            <SmtpCard />
                            <NotificationTriggersCard />
                            <NotificationLogCard />
                        </div>
                    </TabsContent>
                    <TabsContent value="backup" className="space-y-6">
                        <BackupRepositoryCard />
                        <BackupDefaultsCard />
                    </TabsContent>
                    <TabsContent value="proxy" className="space-y-6">
                        <ProxySettingsCard />
                        <CertificatesCard />
                    </TabsContent>
                </Tabs>
            </PageContent>
        </Page>
    );
}
