import {ToneBadge} from "@/components/common/tone-badge";

/**
 * D-10: a service with a concrete `latestTag` gets a copy naming it; a
 * moving/untagged image ("latest") only tells us the digest changed, so the
 * copy says "Content updated" instead of promising a version that doesn't
 * exist. No update at all renders nothing.
 */
export function describeServiceUpdate(
    updateAvailable: boolean | undefined,
    latestTag: string | null | undefined,
): string | null {
    if (!updateAvailable) return null;
    return latestTag ? `Update available → ${latestTag}` : "Content updated";
}

export interface ServiceUpdateBadgeProps {
    readonly updateAvailable: boolean | undefined;
    readonly latestTag: string | null | undefined;
}

export function ServiceUpdateBadge({updateAvailable, latestTag}: Readonly<ServiceUpdateBadgeProps>) {
    const text = describeServiceUpdate(updateAvailable, latestTag);
    if (!text) return null;

    if (!latestTag) return <ToneBadge tone="blue">{text}</ToneBadge>;

    // The tag is a technical value (D-06): same copy as describeServiceUpdate, tag in mono.
    return (
        <ToneBadge tone="blue">
            Update available → <span className="font-mono">{latestTag}</span>
        </ToneBadge>
    );
}
