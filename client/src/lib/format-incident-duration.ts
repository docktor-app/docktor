const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

// UI-SPEC C: under 60s "{s}s", under 1h "{m}m {s}s", under 24h "{h}h {m}m",
// otherwise "{d}d {h}h". Each unit is floored; a negative span (clock skew
// between server and browser) reads as zero rather than a negative duration.
export function formatIncidentDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));

    if (totalSeconds < SECONDS_PER_MINUTE) return `${totalSeconds}s`;

    if (totalSeconds < SECONDS_PER_HOUR) {
        const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
        return `${minutes}m ${totalSeconds % SECONDS_PER_MINUTE}s`;
    }

    if (totalSeconds < SECONDS_PER_DAY) {
        const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
        const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
        return `${hours}h ${minutes}m`;
    }

    const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
    const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    return `${days}d ${hours}h`;
}
