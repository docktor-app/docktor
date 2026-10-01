import {ToneBadge} from "@/components/common/tone-badge";
import {ScrollArea} from "@/components/ui/scroll-area";

interface CertStatusBadgeProps {
    readonly status?: string | null;
    readonly message?: string | null;
}

// D-05: the ProxyConfig schema default is literally "pending" — a domain the
// cert poller hasn't reported on yet is indistinguishable from one it has
// classified pending, so both "no status yet" and an explicit "pending"
// render the same badge (no separate "Checking..." state, per the UI-SPEC's
// resolved D-04 assumption).
export function CertStatusBadge({status, message}: Readonly<CertStatusBadgeProps>) {
    if (status === "issued") {
        return <ToneBadge tone="green">Secured</ToneBadge>;
    }

    // D-13: an approaching-expiry certificate is still serving traffic —
    // colouring it as a failure would flatten the distinction the poller
    // works to make between "broken" and "working, but renew soon". Placed
    // before the final fallback so an unrecognised status still lands on the
    // pending branch below.
    if (status === "expiring") {
        return (
            <div className="space-y-1">
                <ToneBadge tone="orange">Expiring soon</ToneBadge>
                {message && (
                    <ScrollArea className="h-16 w-full max-w-xs rounded border">
                        <pre className="whitespace-pre-wrap p-2 text-xs font-mono">{message}</pre>
                    </ScrollArea>
                )}
            </div>
        );
    }

    if (status === "failed") {
        return (
            <div className="space-y-1">
                <ToneBadge tone="red">Cert failed</ToneBadge>
                {message && (
                    <ScrollArea className="h-16 w-full max-w-xs rounded border">
                        <pre className="whitespace-pre-wrap p-2 text-xs font-mono">{message}</pre>
                    </ScrollArea>
                )}
            </div>
        );
    }

    return <ToneBadge tone="neutral">Cert pending</ToneBadge>;
}
