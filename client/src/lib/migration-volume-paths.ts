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

const FALLBACK_NAME = "data";

interface ResolvedRelativePath {
  // The path leaves the stack directory, so the new stack could not find it.
  readonly escapes: boolean;
  // The path is the stack directory itself.
  readonly isStackRoot: boolean;
  readonly name: string;
}

// Resolves "." and ".." segments lexically (no node:path in the browser);
// backslash and slash separators are treated alike.
function resolveRelativePath(path: string): ResolvedRelativePath {
  const kept: string[] = [];
  let escapes = false;
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      kept.push(segment);
    } else if (kept.length > 0) {
      kept.pop();
    } else {
      escapes = true;
    }
  }
  return {escapes, isStackRoot: !escapes && kept.length === 0, name: kept.at(-1) ?? FALLBACK_NAME};
}

function volumesPathFor(name: string, taken: Set<string>): string {
  let candidate = `./volumes/${name}`;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    candidate = `./volumes/${name}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

function toAbsoluteChoice(originalPath: string, taken: Set<string>): BindMountChoice {
  return {
    kind: "absolute",
    originalPath,
    volumesPath: volumesPathFor(directoryDisplayName(originalPath) || FALLBACK_NAME, taken),
    moveIntoVolumes: true,
    mustMove: false,
    mustKeep: false,
  };
}

function toRelativeChoice(originalPath: string, taken: Set<string>): BindMountChoice {
  const resolved = resolveRelativePath(originalPath);
  if (resolved.isStackRoot) {
    // The stack directory cannot move into ./volumes/ and consumes no target name.
    return {kind: "relative", originalPath, volumesPath: originalPath, moveIntoVolumes: false, mustMove: false, mustKeep: true};
  }
  return {
    kind: "relative",
    originalPath,
    volumesPath: volumesPathFor(resolved.name, taken),
    moveIntoVolumes: true,
    mustMove: resolved.escapes,
    mustKeep: false,
  };
}

export function buildBindMountChoices(stack: ScanMounts): BindMountChoice[] {
  // Named volumes are converted to ./volumes/<name> too, so their names are taken first.
  const taken = new Set(stack.namedVolumes.map((name) => `./volumes/${name}`));
  return [
    ...stack.absolutePaths.map((path) => toAbsoluteChoice(path, taken)),
    ...stack.relativePaths.map((path) => toRelativeChoice(path, taken)),
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
