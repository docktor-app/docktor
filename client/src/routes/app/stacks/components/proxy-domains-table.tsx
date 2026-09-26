import {Pencil, Trash2} from "lucide-react"

import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Button} from "@/components/ui/button"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip"
import {CertStatusBadge} from "@/components/domain/stack/cert-status-badge"
import type {ProxyConfig} from "@/lib/proxy-api"
import type {ProxyStatusMap} from "@/hooks/use-proxy-status"

export interface ProxyDomainsTableProps {
    readonly configs: ProxyConfig[]
    readonly statuses: ProxyStatusMap
    readonly onEdit: (config: ProxyConfig) => void
    readonly onRemove: (config: ProxyConfig) => void
}

/**
 * Flat, grouped-by-service domains table (moved as-is from proxy-tab.tsx)
 * plus a per-domain Edit/Remove actions column (D-04). Domain cells keep
 * their `max-w-xs truncate` clamp but reveal the full value through a
 * Tooltip instead of the native `title` attribute (UI-SPEC long-text row).
 */
export function ProxyDomainsTable({configs, statuses, onEdit, onRemove}: Readonly<ProxyDomainsTableProps>) {
    const configsByService = new Map<string, ProxyConfig[]>()
    for (const config of configs) {
        const rows = configsByService.get(config.serviceName) ?? []
        rows.push(config)
        configsByService.set(config.serviceName, rows)
    }

    return (
        <TooltipProvider>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Domains</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Internal Port</TableHead>
                        <TableHead>TLS</TableHead>
                        <TableHead>Certificate</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from(configsByService.entries()).map(([svcName, rows]) => (
                        <TableRow key={svcName}>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    {rows.map((row) => (
                                        <Tooltip key={row.id}>
                                            <TooltipTrigger asChild>
                                                <span className="max-w-xs truncate">{row.domain}</span>
                                            </TooltipTrigger>
                                            <TooltipContent>{row.domain}</TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell>{svcName}</TableCell>
                            <TableCell>{rows[0].internalPort}</TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    {rows.map((row) => (
                                        <span key={row.id}>{row.tlsEnabled ? "On" : "Off"}</span>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
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
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    {rows.map((row) => (
                                        <span key={row.id} className="text-sm">
                                            {row.certSource === "custom" ? "Custom certificate" : "Automatic"}
                                        </span>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    {rows.map((row) => (
                                        <div key={row.id} className="flex items-center gap-1">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                                                        aria-label={`Edit ${row.domain}`}
                                                        onClick={() => onEdit(row)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>{`Edit ${row.domain}`}</TooltipContent>
                                            </Tooltip>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                                                        aria-label={`Remove ${row.domain}`}
                                                        onClick={() => onRemove(row)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>{`Remove ${row.domain}`}</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    ))}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TooltipProvider>
    )
}
