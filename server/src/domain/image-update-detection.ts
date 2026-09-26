/**
 * Pure comparison logic for deciding whether an "Update Images" run actually
 * changed anything, plus the canonical image-ref builder every caller that
 * needs to reconstruct a service's tag-qualified image reference shares.
 * Deliberately has no imports from repositories, infrastructure, jobs or
 * Prisma, and performs no I/O of any kind — the caller
 * (StackService.updateImages()) is responsible for resolving the
 * before/after digests via DockerExecutor.imageDigest() and handing the
 * results here.
 */

/**
 * A single service's image ref plus the local image store digest observed
 * before and after a pull. `before`/`after` are `string | null` because the
 * local image store legitimately has no digest for an image that is absent
 * (never pulled) or was built locally rather than pulled from a registry.
 */
export interface ImageDigestComparison {
    readonly ref: string;
    readonly before: string | null;
    readonly after: string | null;
}

/**
 * Reconstructs the canonical imageRef for a service's stored `image` +
 * `imageTag` columns: strips the implicit docker.io/library/ and docker.io/
 * prefixes, then defaults a missing tag to `latest` — the same
 * normalisation Docker itself applies when resolving a ref against the
 * local image store. This is the single definition; every caller that
 * needs to look up or persist an `ImageUpdateCheck` row for a service
 * (`jobs/update-checker.ts`'s `findAllImageRefs()`/`checkImage()`, and
 * `StackService`'s stack-detail/upgrade-candidate methods) shares this
 * exact spelling, so its output must stay stable.
 *
 * Returns null when there is no non-blank image — a build-only service has
 * no image to compare, so it must be excluded rather than turned into a ref
 * that can never resolve.
 *
 * Moved here from `jobs/update-checker.ts` (10-08 Task 1): it is a pure
 * normalisation rule over an image name and tag, with no I/O, so the domain
 * layer is its correct home. It used to live in the jobs module solely so
 * this file's `toImageRef` (needed by `StackService.updateImages()`) never
 * had to import `jobs/`, which would have dragged node-cron, semver and the
 * registry-client singleton into the application unit-test module graph.
 * Moving the original down removes the reason the second copy existed —
 * the two implementations were byte-identical by inspection (same prefix
 * strip, same default-tag rule), so no caller's output changes.
 */
export function buildImageRefFromService(
    image: string | null | undefined,
    imageTag: string | null | undefined,
): string | null {
    if (!image || !image.trim()) return null;

    let ref = imageTag ? `${image}:${imageTag}` : image;
    ref = ref
        .replace(/^docker\.io\/library\//, "")
        .replace(/^docker\.io\//, "");
    if (!ref.includes(":")) ref = `${ref}:latest`;
    return ref;
}

/**
 * Same reconstruction as `buildImageRefFromService`, taking a service
 * object instead of two positional arguments — the shape
 * `StackService.collectImageRefs()` already has on hand from
 * `ComposeConfig.services`. Delegates to `buildImageRefFromService` so both
 * call shapes share exactly one implementation.
 */
export function toImageRef(service: {image: string | null; imageTag: string | null}): string | null {
    return buildImageRefFromService(service.image, service.imageTag);
}

/**
 * Decides whether nothing changed across an image update run, from
 * before/after local image digests only — never from parsing the pull
 * command's free-text progress output (that vocabulary is not a stable
 * Docker interface; see the debug session that traced this bug).
 *
 * Returns true only on positive evidence: the list is non-empty and every
 * entry has a non-empty `before` digest that strictly equals its `after`
 * digest. Every other shape — an empty list, a null or empty digest on
 * either side, any inequality — returns false.
 *
 * The bias is deliberate: telling a user nothing changed when something
 * did is the failure being fixed here, so an unknown digest must fall back
 * to the generic "images updated" message rather than the confident
 * "already up to date" one.
 */
export function detectNoUpdates(comparisons: readonly ImageDigestComparison[]): boolean {
    if (comparisons.length === 0) return false;
    return comparisons.every((c) => Boolean(c.before) && c.before === c.after);
}
