import {useEffect, useState} from "react";
import {toast} from "sonner";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {getSmtpSettings, saveSmtpSettings, testSmtp} from "@/lib/notifications-api";
import {ApiError} from "@/lib/api";

export function SmtpCard() {
    const [smtpHost, setSmtpHost] = useState("");
    const [smtpPort, setSmtpPort] = useState(587);
    const [smtpEncryption, setSmtpEncryption] = useState<"none" | "starttls" | "ssl">("starttls");
    const [smtpUsername, setSmtpUsername] = useState("");
    const [smtpPassword, setSmtpPassword] = useState("");
    const [hasExistingPassword, setHasExistingPassword] = useState(false);
    // true while showing the "saved password" dots — cleared as soon as user focuses the field
    const [passwordLocked, setPasswordLocked] = useState(false);
    const [smtpFrom, setSmtpFrom] = useState("");
    const [testRecipient, setTestRecipient] = useState("");
    const [smtpLoading, setSmtpLoading] = useState(true);
    const [smtpSaving, setSmtpSaving] = useState(false);
    const [smtpTesting, setSmtpTesting] = useState(false);
    const [smtpErrors, setSmtpErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        getSmtpSettings()
            .then((data) => {
                setSmtpHost(data.host);
                setSmtpPort(data.port);
                setSmtpEncryption(data.encryption);
                setSmtpUsername(data.username);
                setSmtpFrom(data.from);
                setTestRecipient("");
                setHasExistingPassword(data.hasPassword);
                setPasswordLocked(data.hasPassword);
                setSmtpLoading(false);
            })
            .catch(() => {
                setSmtpLoading(false);
            });
    }, []);

    const handleSaveSmtp = async () => {
        setSmtpErrors({});
        setSmtpSaving(true);
        try {
            await saveSmtpSettings({
                host: smtpHost,
                port: smtpPort,
                encryption: smtpEncryption,
                username: smtpUsername,
                password: passwordLocked ? "" : smtpPassword,
                from: smtpFrom,
            });
            if (!passwordLocked && smtpPassword) {
                setHasExistingPassword(true);
                setPasswordLocked(true);
                setSmtpPassword("");
            }
            toast.success("SMTP settings saved");
        } catch (err) {
            if (err instanceof ApiError && err.status === 400) {
                if (err.fields && Object.keys(err.fields).length > 0) {
                    setSmtpErrors(err.fields);
                } else {
                    setSmtpErrors({general: err.message});
                }
            } else {
                toast.error("Failed to save SMTP settings");
            }
        } finally {
            setSmtpSaving(false);
        }
    };

    const handleTestSmtp = async () => {
        if (!testRecipient) {
            setSmtpErrors({testRecipient: "Recipient is required to send a test email"});
            return;
        }
        setSmtpErrors({});
        setSmtpTesting(true);
        try {
            await testSmtp({
                host: smtpHost,
                port: smtpPort,
                encryption: smtpEncryption,
                username: smtpUsername,
                password: passwordLocked ? "" : smtpPassword,
                from: smtpFrom,
                recipient: testRecipient,
            });
            toast.success("Test email sent successfully");
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            toast.error("Test email failed: " + errMsg);
        } finally {
            setSmtpTesting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>SMTP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {smtpLoading ? (
                    <div className="grid grid-cols-2 gap-4">
                        {Array.from({length: 6}).map((_, i) => (
                            <div key={i} className="space-y-1">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-9 w-full" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {smtpErrors.general && (
                            <p className="text-sm text-destructive">{smtpErrors.general}</p>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="smtpHost">SMTP Host</Label>
                                <Input
                                    id="smtpHost"
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    placeholder="smtp.gmail.com"
                                />
                                {smtpErrors.host && <p className="text-sm text-destructive">{smtpErrors.host}</p>}
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="smtpPort">Port</Label>
                                <Input
                                    id="smtpPort"
                                    type="number"
                                    value={smtpPort}
                                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                                    placeholder="587"
                                />
                                {smtpErrors.port && <p className="text-sm text-destructive">{smtpErrors.port}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="smtpEncryption">Encryption</Label>
                                <Select value={smtpEncryption} onValueChange={(v) => setSmtpEncryption(v as "none" | "starttls" | "ssl")}>
                                    <SelectTrigger id="smtpEncryption">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        <SelectItem value="starttls">STARTTLS (port 587)</SelectItem>
                                        <SelectItem value="ssl">SSL/TLS (port 465)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {smtpErrors.encryption && <p className="text-sm text-destructive">{smtpErrors.encryption}</p>}
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="smtpFrom">From Address</Label>
                                <Input
                                    id="smtpFrom"
                                    value={smtpFrom}
                                    onChange={(e) => setSmtpFrom(e.target.value)}
                                    placeholder="Docktor <noreply@example.com>"
                                />
                                {smtpErrors.from && <p className="text-sm text-destructive">{smtpErrors.from}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="smtpUsername">Username</Label>
                                <Input
                                    id="smtpUsername"
                                    value={smtpUsername}
                                    onChange={(e) => setSmtpUsername(e.target.value)}
                                    placeholder="user@example.com"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="smtpPassword">Password</Label>
                                <Input
                                    id="smtpPassword"
                                    type="password"
                                    value={passwordLocked ? "locked" : smtpPassword}
                                    onFocus={() => {
                                        if (passwordLocked) {
                                            setPasswordLocked(false);
                                            setSmtpPassword("");
                                        }
                                    }}
                                    onChange={(e) => {
                                        setPasswordLocked(false);
                                        setSmtpPassword(e.target.value);
                                    }}
                                    placeholder="Enter password"
                                />
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-3">
                <Button onClick={handleSaveSmtp} disabled={smtpSaving || smtpLoading}>
                    {smtpSaving ? "Saving..." : "Save SMTP Settings"}
                </Button>
                <div className="flex items-start gap-2 w-full">
                    <div className="flex-1 space-y-1">
                        <Input
                            type="email"
                            value={testRecipient}
                            onChange={(e) => setTestRecipient(e.target.value)}
                            placeholder="Send test to..."
                            disabled={smtpTesting || smtpLoading}
                        />
                        {smtpErrors.testRecipient && <p className="text-sm text-destructive">{smtpErrors.testRecipient}</p>}
                    </div>
                    <Button variant="outline" onClick={handleTestSmtp} disabled={smtpTesting || smtpLoading}>
                        {smtpTesting ? "Sending..." : "Send Test Email"}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
