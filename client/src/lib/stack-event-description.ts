import type {Tone} from "@/components/common/tone-badge";
import type {StackEvent, StackEventType} from "@/lib/stacks-api";

export interface EventDescription {
    label: string;
    description: string;
    tone: Tone;
}

const LABELS: Record<StackEventType, string> = {
    config_changed: "Config Changed",
    config_error: "Config Error",
    update_available: "Update Available",
};

const TONES: Record<StackEventType, Tone> = {
    config_changed: "yellow",
    config_error: "red",
    update_available: "blue",
};

// The pure entry-description helper: maps a StackEvent to its display label,
// description text, and ToneBadge tone. config_error and update_available
// both carry what they need in `message`; config_changed has no message,
// only a hash payload, so its text is fixed with the hashes appended when
// the payload parses cleanly. A malformed, empty or absent payload must
// never throw — it just falls back to the fixed text. Moved unchanged
// (behaviourally) from the deleted event-log-card.tsx (Phase 2 contract).
export function describeStackEvent(entry: StackEvent): EventDescription {
    const label = LABELS[entry.type];
    const tone = TONES[entry.type];

    if (entry.type === "config_error") {
        return {label, tone, description: entry.message ?? "Configuration validation failed"};
    }

    if (entry.type === "update_available") {
        return {label, tone, description: entry.message ?? "A newer image is available"};
    }

    let description = "The compose file changed on disk";
    if (entry.payload) {
        try {
            const parsed = JSON.parse(entry.payload) as {oldHash?: string; newHash?: string};
            if (parsed.oldHash && parsed.newHash) {
                description += ` (${parsed.oldHash.slice(0, 7)} → ${parsed.newHash.slice(0, 7)})`;
            }
        } catch {
            // Malformed payload — keep the fixed text, never throw.
        }
    }
    return {label, tone, description};
}
