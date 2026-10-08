import type {Tone} from "@/components/common/tone-badge";
import type {StackUptime} from "@/lib/uptime-api";

const NO_VALUE = "—";
const GREEN_THRESHOLD = 99.9;
const YELLOW_THRESHOLD = 99;
// Absorbs binary floating point so 99.9 does not truncate to 99.8.
const TRUNCATION_EPSILON = 1e-9;

// UI-SPEC C: null reads as an em dash, exactly 100 as "100%", anything else is
// truncated (never rounded up) to one decimal, so measured downtime can never
// display as 100%.
export function formatUptimePercent(percent: number | null): string {
    if (percent === null) return NO_VALUE;
    if (percent === 100) return "100%";
    const truncated = Math.floor(percent * 10 + TRUNCATION_EPSILON) / 10;
    return `${truncated.toFixed(1)}%`;
}

export function getUptimeTone(percent: number | null): Tone {
    if (percent === null) return "neutral";
    if (percent >= GREEN_THRESHOLD) return "green";
    if (percent >= YELLOW_THRESHOLD) return "yellow";
    return "red";
}

// StatCard values take a class string, so the tone is mapped to the same
// light/dark pair dashboard-stat-cards.tsx uses.
export function uptimeValueClassName(tone: Tone): string | undefined {
    switch (tone) {
        case "green":
            return "text-green-600 dark:text-green-400";
        case "yellow":
            return "text-yellow-600 dark:text-yellow-400";
        case "red":
            return "text-red-600 dark:text-red-400";
        default:
            return undefined;
    }
}

// The label switches to "since {date}" only when the observed period starts
// after the window does, i.e. the stack is younger than the window.
export function formatUptimeWindowLabel(
    uptime: Pick<StackUptime, "windowDays" | "windowStart" | "since"> | null,
): string {
    if (uptime === null) return "Uptime";
    const {windowDays, windowStart, since} = uptime;
    if (since !== null && new Date(since).getTime() > new Date(windowStart).getTime()) {
        return `Uptime (since ${new Date(since).toLocaleDateString()})`;
    }
    return `Uptime (last ${windowDays} days)`;
}
