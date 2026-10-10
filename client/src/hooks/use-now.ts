import {useEffect, useState} from "react";

// Returns Date.now() and refreshes it every `intervalMs` while `enabled`, so a
// component showing an elapsed time re-renders on a slow tick. While disabled
// no timer exists at all.
export function useNow(intervalMs: number, enabled: boolean): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!enabled) return;
        // The value may be stale by the time ticking starts (data arrives after mount).
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs, enabled]);

    return now;
}
