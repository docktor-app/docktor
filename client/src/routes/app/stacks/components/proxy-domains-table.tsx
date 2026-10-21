import type {ReactNode} from "react"
import {Pencil, Trash2} from "lucide-react"

import {Button} from "@/components/ui/button"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip"
import {DataTable, type TableColumn} from "@/components/common/data/table"
import {CertStatusBadge} from "@/components/domain/stack/cert-status-badge"
import type {ProxyConfig} from "@/lib/proxy-api"
import type {ProxyStatusMap} from "@/hooks/use-proxy-status"
import {TOUCH_TARGET} from "@/lib/touch-target"

export interface ProxyDomainsTableProps {
    readonly configs: ProxyConfig[]
    readonly statuses: ProxyStatusMap
    readonly onEdit: (config: ProxyConfig) => void
    readonly onRemove: (config: ProxyConfig) => void
}

interface ServiceDomains {
    readonly serviceName: string
    readonly rows: readonly ProxyConfig[]
}

function groupByService(configs: readonly ProxyConfig[]): ServiceDomains[] {
    const groups = new Map<string, ProxyConfig[]>()
    for (const config of configs) {
        const rows = groups.get(config.serviceName) ?? []
        rows.push(config)
        groups.set(config.serviceName, rows)
    }
    return Array.from(groups.entries(), ([serviceName, rows]) => ({serviceName, rows}))
}

/** One stacked value per domain of a service, so the columns line up row by row. */
function Stacked({children}: Readonly<{children: ReactNode}>) {
    return <div className="flex flex-col gap-1">{children}</div>
}

interface DomainActionProps {
    readonly label: string
    readonly icon: ReactNode
    readonly onClick: () => void
}

function DomainAction({label, icon, onClick}: Readonly<DomainActionProps>) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={TOUCH_TARGET} aria-label={label} onClick={onClick}>
                    {icon}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    )
}

/**
 * Domains table on the shared DataTable (D-07), one row per service. The
 * aggregation stays here because DataTable has no row grouping; per-domain
 * values are stacked inside the service's cells. Domain, service and internal
 * port are technical values and render in mono (D-06). Domain cells keep their
 * `max-w-xs truncate` clamp but reveal the full value through a Tooltip instead
 * of the native `title` attribute (UI-SPEC long-text row). DataTable owns the
 * empty state.
 */
export function ProxyDomainsTable({configs, statuses, onEdit, onRemove}: Readonly<ProxyDomainsTableProps>) {
    const columns: TableColumn<ServiceDomains>[] = [
        {
            name: "Domains",
            isKey: true,
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => (
                        <Tooltip key={row.id}>
                            <TooltipTrigger asChild>
                                <span className="max-w-xs truncate font-mono text-xs">{row.domain}</span>
                            </TooltipTrigger>
                            <TooltipContent>{row.domain}</TooltipContent>
                        </Tooltip>
                    ))}
                </Stacked>
            ),
        },
        {
            name: "Service",
            render: ({serviceName}) => <span className="font-mono text-xs">{serviceName}</span>,
        },
        {
            name: "Internal Port",
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => (
                        <span key={row.id} className="font-mono text-xs">{row.internalPort}</span>
                    ))}
                </Stacked>
            ),
        },
        {
            name: "TLS",
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => (
                        <span key={row.id}>{row.tlsEnabled ? "On" : "Off"}</span>
                    ))}
                </Stacked>
            ),
        },
        {
            name: "Certificate",
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => {
                        const live = statuses[row.id]
                        return (
                            <CertStatusBadge
                                key={row.id}
                                status={live?.status ?? row.certStatus}
                                message={live?.message ?? row.certMessage}
                            />
                        )
                    })}
                </Stacked>
            ),
        },
        {
            name: "Source",
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => (
                        <span key={row.id} className="text-sm">
                            {row.certSource === "custom" ? "Custom certificate" : "Automatic"}
                        </span>
                    ))}
                </Stacked>
            ),
        },
        {
            name: "Actions",
            hideHeader: true,
            render: ({rows}) => (
                <Stacked>
                    {rows.map((row) => (
                        <div key={row.id} className="flex items-center gap-1">
                            <DomainAction
                                label={`Edit ${row.domain}`}
                                icon={<Pencil className="h-4 w-4" />}
                                onClick={() => onEdit(row)}
                            />
                            <DomainAction
                                label={`Remove ${row.domain}`}
                                icon={<Trash2 className="h-4 w-4" />}
                                onClick={() => onRemove(row)}
                            />
                        </div>
                    ))}
                </Stacked>
            ),
        },
    ]

    return (
        <TooltipProvider>
            <DataTable
                data={groupByService(configs)}
                columns={columns}
                getRowKey={(group) => group.serviceName}
                pagination={false}
                emptyMessage="No domains configured"
                emptyDescription="Assign a domain to a service to make it available at a custom URL with automatic HTTPS."
            />
        </TooltipProvider>
    )
}
