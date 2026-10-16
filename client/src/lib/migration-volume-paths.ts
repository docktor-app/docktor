import {directoryDisplayName} from "@/lib/path-display";
import type {DiscoveredStack, VolumeSelection} from "@/lib/brownfield-types";

// Path rules for the bind mounts offered in step 1 of the migration dialog.
// Pure: no React, no I/O. The wizard builds its choices from the scan row,
// then derives the request selections and the "Volumes to copy" count from
// the same choices so the preview and the final migrate request cannot drift.

export interface BindMountChoice {
  readonly kind: "absolute" | "relative";
  readonly originalPath: string;
  // Default Docktor-managed target, ./volumes/<name>.
  readonly volumesPath: string;
  readonly moveIntoVolumes: boolean;
  // Keeping the mount is not possible (it points outside the stack directory).
  readonly mustMove: boolean;
  // Moving the mount is not possible (it is the stack directory itself).
  readonly mustKeep: boolean;
}

type ScanMounts = Pick<DiscoveredStack, "namedVolumes" | "absolutePaths" | "relativePaths">;

function volumesPathFor(originalPath: string): string {
  return `./volumes/${directoryDisplayName(originalPath) || "data"}`;
}

function toChoice(kind: BindMountChoice["kind"], originalPath: string): BindMountChoice {
  return {
    kind,
    originalPath,
    volumesPath: volumesPathFor(originalPath),
    moveIntoVolumes: true,
    mustMove: false,
    mustKeep: false,
  };
}

export function buildBindMountChoices(stack: ScanMounts): BindMountChoice[] {
  return [
    ...stack.absolutePaths.map((path) => toChoice("absolute", path)),
    ...stack.relativePaths.map((path) => toChoice("relative", path)),
  ];
}

export function toVolumeSelections(choices: readonly BindMountChoice[]): VolumeSelection[] {
  return choices.map((choice) => {
    if (choice.kind === "absolute") {
      return {originalPath: choice.originalPath, newPath: choice.volumesPath, convert: choice.moveIntoVolumes};
    }
    // A relative mount is always copied into the new stack; "keep" only means
    // it stays at its relative path instead of moving into ./volumes/.
    return {
      originalPath: choice.originalPath,
      newPath: choice.moveIntoVolumes ? choice.volumesPath : choice.originalPath,
      convert: true,
    };
  });
}

export function countVolumesToCopy(
  namedVolumeSelections: Readonly<Record<string, boolean>>,
  choices: readonly BindMountChoice[],
): number {
  const named = Object.values(namedVolumeSelections).filter(Boolean).length;
  const bound = choices.filter((choice) => choice.kind === "relative" || choice.moveIntoVolumes).length;
  return named + bound;
}
