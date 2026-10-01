// Deterministic per-service color attribution (D-11). Moved verbatim from
// log-viewer.tsx: same 10-entry palette, same hash arithmetic. This is a
// separate concern from the semantic status-color layer (ToneBadge/Tone) —
// do not conflate the two.
const SERVICE_COLORS = [
    "text-cyan-400",
    "text-yellow-400",
    "text-pink-400",
    "text-purple-400",
    "text-orange-400",
    "text-lime-400",
    "text-sky-400",
    "text-rose-400",
    "text-indigo-400",
    "text-emerald-400",
];

export function getServiceColor(serviceName: string): string {
    let hash = 0;
    for (let i = 0; i < serviceName.length; i++) {
        hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}
