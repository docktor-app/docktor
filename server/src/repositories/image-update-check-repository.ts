import {buildImageRefFromService} from "../domain/image-update-detection.js"
import {prisma} from "../lib/db.js"

export interface UpsertImageUpdateCheckInput {
    imageRef: string // canonical image ref (primary key)
    lastCheckedAt: Date
    latestTag?: string | null
    latestDigest?: string | null
    currentDigest?: string | null
    hasUpdate: boolean
    checkError?: string | null
    availableTags?: string[] | null
}

export class ImageUpdateCheckRepository {
    async upsert(input: UpsertImageUpdateCheckInput) {
        // JSON-encoding is an implementation detail of persistence — callers
        // pass a real string[] and never see the encoded column value.
        const availableTags = input.availableTags ? JSON.stringify(input.availableTags) : null
        return prisma.imageUpdateCheck.upsert({
            where: {imageRef: input.imageRef},
            create: {
                imageRef: input.imageRef,
                lastCheckedAt: input.lastCheckedAt,
                latestTag: input.latestTag ?? null,
                latestDigest: input.latestDigest ?? null,
                currentDigest: input.currentDigest ?? null,
                hasUpdate: input.hasUpdate,
                checkError: input.checkError ?? null,
                availableTags,
            },
            update: {
                lastCheckedAt: input.lastCheckedAt,
                latestTag: input.latestTag ?? null,
                latestDigest: input.latestDigest ?? null,
                currentDigest: input.currentDigest ?? null,
                hasUpdate: input.hasUpdate,
                checkError: input.checkError ?? null,
                availableTags,
            },
        })
    }

    async findByImageRef(imageRef: string) {
        return prisma.imageUpdateCheck.findUnique({where: {imageRef}})
    }

    async findDueForCheck(cutoff: Date, imageRefs: string[]) {
        return prisma.imageUpdateCheck.findMany({
            where: {
                imageRef: {in: imageRefs},
                OR: [
                    {lastCheckedAt: {lt: cutoff}},
                ],
            },
            orderBy: {lastCheckedAt: "asc"},
        })
    }

    async findByImageRefs(imageRefs: string[]) {
        return prisma.imageUpdateCheck.findMany({
            where: {imageRef: {in: imageRefs}},
        })
    }

    /**
     * The single definition of "the image refs the update checker tracks":
     * every distinct Service image+tag, mapped through
     * buildImageRefFromService. Both UpdateChecker's image scan and the
     * stale-row pruner read this, so the prune set can never drift from
     * what is being checked (Issue #29/D-11).
     */
    async findTrackedImageRefs(): Promise<string[]> {
        const rows = await prisma.service.findMany({
            select: {image: true, imageTag: true},
            distinct: ["image", "imageTag"],
        })
        // Build-only services (no image) reconstruct into a ref of just
        // a colon and a tag if not filtered — buildImageRefFromService
        // returns null for those, which we drop here.
        return rows
            .map((r) => buildImageRefFromService(r.image, r.imageTag))
            .filter((ref): ref is string => ref !== null)
    }

    /** Ids of the stacks that have at least one service running this image+tag. */
    async findStackIdsUsingImage(image: string, imageTag: string | null): Promise<string[]> {
        const services = await prisma.service.findMany({
            where: {image, imageTag},
            select: {stackId: true},
            distinct: ["stackId"],
        })
        return services.map((s) => s.stackId)
    }

    /**
     * Deletes every row whose imageRef is outside the given set and returns
     * the number deleted. An empty set therefore deletes every row — callers
     * must never derive it from a failed read (Issue #29/D-10).
     */
    async deleteAllExcept(imageRefs: readonly string[]): Promise<number> {
        const result = await prisma.imageUpdateCheck.deleteMany({
            where: {imageRef: {notIn: [...imageRefs]}},
        })
        return result.count
    }
}

export const imageUpdateCheckRepository = new ImageUpdateCheckRepository()
