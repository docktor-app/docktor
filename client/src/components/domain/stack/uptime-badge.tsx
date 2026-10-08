import {ToneBadge} from "@/components/common/tone-badge";
import {formatUptimePercent, getUptimeTone} from "@/lib/uptime-format";

export interface UptimeBadgeProps {
    percent: number | null;
    windowDays: number | null;
}

export function UptimeBadge({percent, windowDays}: Readonly<UptimeBadgeProps>) {
    if (percent === null) {
        return (
            <ToneBadge tone="neutral" aria-label="No uptime data" title="No data in this window">
                —
            </ToneBadge>
        );
    }

    return (
        <ToneBadge
            tone={getUptimeTone(percent)}
            title={windowDays === null ? "Uptime" : `Uptime over the last ${windowDays} days`}
            className="tabular-nums"
        >
            {formatUptimePercent(percent)}
        </ToneBadge>
    );
}
