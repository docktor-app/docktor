import {ToneBadge} from "@/components/common/tone-badge";
import type {Service} from "@/lib/stacks-api";

export function hasStackUpdate(services: ReadonlyArray<Pick<Service, "updateAvailable">>): boolean {
    return services.some((service) => service.updateAvailable === true);
}

export interface StackUpdateBadgeProps {
    readonly services: ReadonlyArray<Pick<Service, "updateAvailable">>;
}

/** D-09 (list half): mirrors the "config changed" pill's shell/placement exactly, using a distinct (blue) hue. */
export function StackUpdateBadge({services}: Readonly<StackUpdateBadgeProps>) {
    if (!hasStackUpdate(services)) return null;

    return <ToneBadge tone="blue">update available</ToneBadge>;
}
