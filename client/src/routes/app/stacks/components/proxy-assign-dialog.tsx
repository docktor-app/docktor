import {useEffect, useState} from "react"
import {Link} from "react-router"
import {useForm, type Resolver} from "react-hook-form"
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema"
import {toast} from "sonner"
import {AlertTriangle} from "lucide-react"
import {assignDomainSchema, type AssignDomainInput} from "@docktor/shared"

import {assignDomain, type ProxyConfig} from "@/lib/proxy-api"
import type {Certificate} from "@/lib/certificates-api"
import type {Service} from "@/lib/stacks-api"
import {parsePorts} from "@/lib/service-ports"
import {ApiError} from "@/lib/api"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Switch} from "@/components/ui/switch"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import {Alert, AlertDescription} from "@/components/ui/alert"
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form"

export type ProxyDialogTarget = {mode: "assign"} | {mode: "edit"; config: ProxyConfig}

export interface ProxyAssignDialogProps {
    readonly stackId: string
    readonly services: Service[]
    readonly certificates: Certificate[]
    readonly target: ProxyDialogTarget
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
    readonly onSaved: () => void
}

const EMPTY_DEFAULTS: AssignDomainInput = {
    domain: "",
    internalPort: 80,
    tlsEnabled: true,
    certSource: "acme",
    certificateId: undefined,
}

function defaultsForTarget(target: ProxyDialogTarget): AssignDomainInput {
    if (target.mode === "edit") {
        return {
            domain: target.config.domain,
            internalPort: target.config.internalPort,
            tlsEnabled: target.config.tlsEnabled,
            certSource: target.config.certSource as AssignDomainInput["certSource"],
            certificateId: target.config.certificateId ?? undefined,
        }
    }
    return EMPTY_DEFAULTS
}

const FORM_FIELD_NAMES = new Set<keyof AssignDomainInput>([
    "domain",
    "internalPort",
    "tlsEnabled",
    "certSource",
    "certificateId",
])

/**
 * Assign/Edit domain dialog (D-04) — the Form/FormField block moved verbatim
 * from proxy-tab.tsx's always-visible Card, following the Dialog-with-form
 * shell established by service-upgrade-dialog.tsx. Assign and Edit share
 * this one dialog: Edit locks the domain input and the service Select, and
 * pre-fills every other field from the target config.
 */
export function ProxyAssignDialog({
    stackId,
    services,
    certificates,
    target,
    open,
    onOpenChange,
    onSaved,
}: Readonly<ProxyAssignDialogProps>) {
    const isEdit = target.mode === "edit"
    const [serviceName, setServiceName] = useState(
        isEdit ? target.config.serviceName : (services[0]?.serviceName ?? ""),
    )
    const [submitting, setSubmitting] = useState(false)

    const form = useForm<AssignDomainInput>({
        // Safe: assignDomainSchema's internalPort field uses z.coerce.number(),
        // so the resolver's pre-coercion input type doesn't structurally match
        // AssignDomainInput (the post-coercion output type) at the type level —
        // at runtime the resolver still coerces exactly to AssignDomainInput,
        // matching what the form actually submits. Mirrors notifications-step.tsx.
        resolver: standardSchemaResolver(assignDomainSchema) as Resolver<AssignDomainInput>,
        defaultValues: EMPTY_DEFAULTS,
    })
    const certSource = form.watch("certSource")

    // Reset to the target's values every time the dialog opens — Assign
    // always opens empty, Edit never opens empty (UI-SPEC empty row).
    useEffect(() => {
        if (!open) return
        setServiceName(isEdit ? target.config.serviceName : (services[0]?.serviceName ?? ""))
        form.reset(defaultsForTarget(target))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, target])

    const selectedService = services.find((svc) => svc.serviceName === serviceName)
    const selectedServicePorts = parsePorts(selectedService?.ports)

    function onSubmit(data: AssignDomainInput) {
        if (!serviceName) return
        setSubmitting(true)
        toast.promise(
            (async () => {
                try {
                    await assignDomain(stackId, serviceName, data)
                    onOpenChange(false)
                    onSaved()
                } finally {
                    setSubmitting(false)
                }
            })(),
            {
                loading: "Saving domain…",
                success: isEdit ? "Domain updated" : "Domain assigned",
                error: (err: unknown) => {
                    if (err instanceof ApiError && err.fields) {
                        for (const [key, message] of Object.entries(err.fields)) {
                            if (FORM_FIELD_NAMES.has(key as keyof AssignDomainInput)) {
                                form.setError(key as keyof AssignDomainInput, {message})
                            }
                        }
                    }
                    const message =
                        err instanceof ApiError
                            ? err.message
                            : ((err as Error)?.message ?? "Failed to save domain")
                    return `Couldn't save domain — ${message}. Try again.`
                },
            },
        )
    }

    const title = isEdit ? `Edit ${target.config.domain}` : "Assign Domain"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="proxy-service" className="font-semibold">
                                Service
                            </Label>
                            <Select value={serviceName} onValueChange={setServiceName} disabled={isEdit}>
                                <SelectTrigger id="proxy-service">
                                    <SelectValue placeholder="Select a service..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {services.map((svc) => (
                                        <SelectItem key={svc.id} value={svc.serviceName}>
                                            {svc.serviceName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedServicePorts.length > 0 && (
                            <Alert className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                                    This service already publishes port {selectedServicePorts[0].host} directly
                                    to the host. Enabling the proxy will not remove that binding — both will
                                    remain active.
                                </AlertDescription>
                            </Alert>
                        )}

                        <FormField
                            control={form.control}
                            name="domain"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Domain</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="cloud.example.com" readOnly={isEdit} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="internalPort"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Internal Port</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="tlsEnabled"
                            render={({field}) => (
                                <FormItem className="flex items-center gap-3 space-y-0">
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <FormLabel className="font-semibold">Enable TLS</FormLabel>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="certSource"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Certificate Source</FormLabel>
                                    <Select
                                        value={field.value}
                                        onValueChange={(value) => {
                                            field.onChange(value)
                                            if (value !== "custom") {
                                                form.setValue("certificateId", undefined)
                                            }
                                        }}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="acme">Automatic (Let&apos;s Encrypt)</SelectItem>
                                            <SelectItem value="custom">One of my certificates</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-muted-foreground">
                                        Choosing an uploaded certificate means Docktor will not request one from
                                        the certificate authority for this domain.
                                    </p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {certSource === "custom" &&
                            (certificates.length === 0 ? (
                                <Alert>
                                    <AlertDescription>
                                        You haven&apos;t uploaded any certificates yet. Add one in{" "}
                                        <Link to="/settings/proxy" className="underline">
                                            Settings
                                        </Link>{" "}
                                        before choosing this option.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <FormField
                                    control={form.control}
                                    name="certificateId"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">Certificate</FormLabel>
                                            <Select value={field.value ?? ""} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a certificate..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {certificates.map((cert) => (
                                                        <SelectItem key={cert.id} value={cert.id}>
                                                            {cert.domainPattern}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ))}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting || !serviceName}>
                                Save Domain
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
