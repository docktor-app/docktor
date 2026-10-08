import type {ServiceHealthEventDto, ServiceHealthEventRepository} from "../repositories/service-health-event-repository.js";
import {NotFoundError} from "../lib/errors.js";

export interface ServiceHealthHistoryQuery {
    serviceName?: string;
    limit: number;
}

/** Read side of the per-service health history (#23, D-12). */
export class ServiceHealthHistoryService {
    constructor(
        private readonly stacks: {exists(id: string): Promise<boolean>},
        private readonly events: Pick<ServiceHealthEventRepository, "findLatestByStack" | "findLatestByService">,
    ) {}

    async listHealthEvents(stackId: string, query: ServiceHealthHistoryQuery): Promise<ServiceHealthEventDto[]> {
        if (!(await this.stacks.exists(stackId))) {
            throw new NotFoundError(`Stack "${stackId}" not found`);
        }
        if (query.serviceName !== undefined) {
            return this.events.findLatestByService(stackId, query.serviceName, query.limit);
        }
        return this.events.findLatestByStack(stackId, query.limit);
    }
}
