import {Link} from "react-router";
import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {ComposeWarningBadge} from "@/components/domain/stack/compose-warning-badge";
import type {DeployWarnings, PortConflict, PortHolder} from "@/lib/stacks-api";

export interface DeployWarningsAlertProps {
    readonly warnings: DeployWarnings;
}

function formatPortLabel(conflict: PortConflict): string {
    return conflict.protocol === "udp" ? `${conflict.port}/udp` : `${conflict.port}`;
}

function describeHolder(holder: PortHolder, portLabel: string) {
    if (holder.kind === "stack") {
        return (
            <>
                Port {portLabel} is already in use by{" "}
                <Link to={`/stacks/${holder.stackId}`} className="font-semibold underline underline-offset-2">
                    {holder.stackDisplayName}
                </Link>
                .
            </>
        );
    }
    if (holder.kind === "container") {
        return <>Port {portLabel} is already in use by container {holder.containerName}.</>;
    }
    if (holder.kind === "process") {
        return (
            <>
                Port {portLabel} is already in use by {holder.processName}
                {holder.pid != null ? ` (PID ${holder.pid})` : ""}.
            </>
        );
    }
    return <>Port {portLabel} is already in use by another process.</>;
}

/**
 * Issue #21/D-14/D-15: the single persistent pre-deploy warnings banner —
 * one line per port conflict (D-15 copy contract) followed by any
 * compose-check findings re-evaluated at deploy time (D-09), styled
 * identically to stack-alerts.tsx's existing yellow configChanged banner
 * per UI-SPEC — an ephemeral notification is deliberately not used here.
 */
export function DeployWarningsAlert({warnings}: Readonly<DeployWarningsAlertProps>) {
    return (
        <Alert className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-200">Pre-deploy warnings</AlertTitle>
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <div className="space-y-1">
                    {warnings.portConflicts.map((conflict, index) => (
                        <div key={`${conflict.port}-${conflict.protocol}-${index}`}>
                            {describeHolder(conflict.holder, formatPortLabel(conflict))}
                        </div>
                    ))}
                    {warnings.composeFindings.map((finding, index) => (
                        <div key={`${finding.ruleId}-${finding.serviceName ?? ""}-${index}`} className="flex items-center gap-2">
                            <ComposeWarningBadge finding={finding} />
                            <span>{finding.message}</span>
                        </div>
                    ))}
                    <p className="text-xs opacity-80">
                        Docktor checks other stacks, running containers and — where it can see them — listening processes. Deploys are never blocked; Docker&apos;s own port binding is the final authority.
                    </p>
                </div>
            </AlertDescription>
        </Alert>
    );
}
