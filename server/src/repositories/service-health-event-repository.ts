import type {HealthSourceName} from "../domain/service-health.js"
import {HealthSource} from "../generated/prisma/enums.js"
import {prisma} from "../lib/db.js"

export interface ServiceHealthEventDto {
    id: string
    serviceName: string
    fromStatus: string | null
    toStatus: string | null
    source: HealthSourceName
    message: string | null
    createdAt: Date
}

export interface RecordServiceHealthEventInput {
    stackId: string
    serviceName: string
    fromStatus: string | null
    toStatus: string | null
    source: HealthSourceName
    message?: string | null
}

const SOURCE_TO_ENUM: Record<HealthSourceName, HealthSource> = {
    "docker-healthcheck": HealthSource.DOCKER_HEALTHCHECK,
    "http-probe": HealthSource.HTTP_PROBE,
}

const ENUM_TO_SOURCE: Record<HealthSource, HealthSourceName> = {
    [HealthSource.DOCKER_HEALTHCHECK]: "docker-healthcheck",
    [HealthSource.HTTP_PROBE]: "http-probe",
}

/**
 * The only Prisma touchpoint for ServiceHealthEvent. Rows are keyed by
 * (stackId, serviceName), never Service.id, so they survive the
 * delete-and-recreate of Service rows on every deploy (D-12 amended).
 */
export class ServiceHealthEventRepository {
    async record(input: RecordServiceHealthEventInput): Promise<void> {
        await prisma.serviceHealthEvent.create({
            data: {
                stackId: input.stackId,
                serviceName: input.serviceName,
                fromStatus: input.fromStatus,
                toStatus: input.toStatus,
                source: SOURCE_TO_ENUM[input.source],
                message: input.message ?? null,
            },
        })
    }

    async findLatestByService(stackId: string, serviceName: string, limit: number): Promise<ServiceHealthEventDto[]> {
        const rows = await prisma.serviceHealthEvent.findMany({
            where: {stackId, serviceName},
            orderBy: {createdAt: "desc"},
            take: limit,
        })
        return rows.map((row) => ({
            id: row.id,
            serviceName: row.serviceName,
            fromStatus: row.fromStatus,
            toStatus: row.toStatus,
            source: ENUM_TO_SOURCE[row.source],
            message: row.message,
            createdAt: row.createdAt,
        }))
    }

    /** The latest `perServiceLimit` events of every service in the stack, merged newest first. */
    async findLatestByStack(stackId: string, perServiceLimit: number): Promise<ServiceHealthEventDto[]> {
        const services = await prisma.serviceHealthEvent.groupBy({
            by: ["serviceName"],
            where: {stackId},
        })
        const perService = await Promise.all(
            services.map((s) => this.findLatestByService(stackId, s.serviceName, perServiceLimit)),
        )
        return perService.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }

    /** Retention prune (D-10): removes events created before `cutoff`, served by the createdAt index. */
    async deleteCreatedBefore(cutoff: Date): Promise<number> {
        const {count} = await prisma.serviceHealthEvent.deleteMany({where: {createdAt: {lt: cutoff}}})
        return count
    }
}

export const serviceHealthEventRepository = new ServiceHealthEventRepository()
