import {StatusDot} from "@/components/common/status-dot";
import {cn} from "@/lib/utils";

export interface LogConnectionStatusProps {
    connected: boolean;
    className?: string;
}

/**
 * Shared "Connected"/"Disconnected" indicator for the stack log viewer and
 * the backup detail page's Output section (UI-SPEC error row).
 */
export function LogConnectionStatus({connected, className}: Readonly<LogConnectionStatusProps>) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
            <StatusDot tone={connected ? "green" : "neutral"} />
            {connected ? "Connected" : "Disconnected"}
        </span>
    );
}
