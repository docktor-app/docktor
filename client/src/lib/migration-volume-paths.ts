import type {DiscoveredStack, VolumeSelection} from "@/lib/brownfield-types";

// RED skeleton (18-10 Task 1): signatures only, behaviour arrives with the feat commit.
export interface BindMountChoice {
  readonly kind: "absolute" | "relative";
  readonly originalPath: string;
  readonly volumesPath: string;
  readonly moveIntoVolumes: boolean;
  readonly mustMove: boolean;
  readonly mustKeep: boolean;
}

export function buildBindMountChoices(
  _stack: Pick<DiscoveredStack, "namedVolumes" | "absolutePaths" | "relativePaths">,
): BindMountChoice[] {
  return [];
}

export function toVolumeSelections(_choices: readonly BindMountChoice[]): VolumeSelection[] {
  return [];
}

export function countVolumesToCopy(
  _namedVolumeSelections: Readonly<Record<string, boolean>>,
  _choices: readonly BindMountChoice[],
): number {
  return 0;
}
