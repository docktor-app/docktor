import {useState} from "react"
import {Link} from "react-router"
import {toast} from "sonner"

import {useStackProxy} from "@/hooks/use-stack-proxy"
import {useProxyStatus} from "@/hooks/use-proxy-status"
import {removeDomain, type ProxyConfig} from "@/lib/proxy-api"
import type {Service} from "@/lib/stacks-api"
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section"
import {Button} from "@/components/ui/button"
import {Skeleton} from "@/components/ui/skeleton"
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {ProxyDomainsTable} from "@/routes/app/stacks/components/proxy-domains-table"
import {ProxyAssignDialog, type ProxyDialogTarget} from "@/routes/app/stacks/components/proxy-assign-dialog"

interface ProxyTabProps {
    readonly stackId: string
    readonly services: Service[]
}

export function ProxyTab({stackId, services}: Readonly<ProxyTabProps>) {
    const {configs, deployed, certificates, loading, reload} = useStackProxy(stackId)
    const {statuses} = useProxyStatus(stackId)
    const [removeTarget, setRemoveTarget] = useState<ProxyConfig | null>(null)
    const [dialogTarget, setDialogTarget] = useState<ProxyDialogTarget | null>(null)

    function handleRemove(target: ProxyConfig) {
        toast.promise(removeDomain(target.id).then(() => reload()), {
            loading: "Removing domain...",
            success: "Domain removed",
            error: (err: Error) => err?.message ?? "Remove domain failed",
        })
        setRemoveTarget(null)
    }

    if (loading || configs === null || deployed === null) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-9 w-full" />
            </div>
        )
    }

    if (!deployed) {
        return (
            <Alert>
                <AlertTitle>Proxy stack not deployed</AlertTitle>
                <AlertDescription className="space-y-2">
                    <p>Deploy the managed proxy stack in Settings before assigning domains to services.</p>
                    <Button asChild variant="link" className="px-0">
                        <Link to="/settings/proxy">Go to Settings</Link>
                    </Button>
                </AlertDescription>
            </Alert>
        )
    }

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Domains</SectionTitle>
                <SectionActions>
                    <Button
                        disabled={services.length === 0}
                        onClick={() => setDialogTarget({mode: "assign"})}
                    >
                        Assign Domain
                    </Button>
                </SectionActions>
            </SectionHeader>

            {configs.length === 0 ? (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">No domains configured</p>
                    <p className="text-sm text-muted-foreground">
                        Assign a domain to a service to make it available at a custom URL with automatic HTTPS.
                    </p>
                </div>
            ) : (
                <ProxyDomainsTable
                    configs={configs}
                    statuses={statuses}
                    onEdit={(config) => setDialogTarget({mode: "edit", config})}
                    onRemove={setRemoveTarget}
                />
            )}

            {dialogTarget && (
                <ProxyAssignDialog
                    stackId={stackId}
                    services={services}
                    certificates={certificates}
                    target={dialogTarget}
                    open={dialogTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) setDialogTarget(null)
                    }}
                    onSaved={reload}
                />
            )}

            <AlertDialog
                open={removeTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setRemoveTarget(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {removeTarget && `Remove domain ${removeTarget.domain}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This deletes the routing and TLS configuration for this domain and redeploys the service.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => removeTarget && handleRemove(removeTarget)}
                        >
                            Remove domain
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Section>
    )
}
