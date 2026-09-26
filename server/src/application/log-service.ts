import {NotFoundError} from "../lib/errors.js";
import type {DockerodeClientPort} from "./ports/dockerode-client-port.js";

/**
 * Narrow read port for the stack repository, declared here rather than
 * importing the concrete StackRepository — the same "read port declared in
 * the consuming layer" style the rest of the application layer uses (see
 * StackService's StackEventReadRepo/ImageUpdateCheckReadRepo). Resolves to
 * `null` for an unknown stack id rather than throwing; the composition root
 * adapts the concrete repository's own NotFoundError into `null` so this
 * service is free to raise its own NotFoundError with the exact literal
 * message text the log route always sent.
 */
export interface LogServiceStackReadPort {
    findByIdWithRelations(id: string): Promise<{
        services: Array<{serviceName: string; containerId: string | null}>;
    } | null>;
}

export interface LogStreamTarget {
    serviceName: string;
    stream: NodeJS.ReadableStream;
}

/**
 * Resolves which of a stack's services currently have a running container,
 * applies the log route's "all"-vs-named-service filter, and opens a
 * Docker log stream for each matching service — moved in from the log SSE
 * route's direct database query and dockerode reach (10-08 Task 3,
 * D-01/D-10; the same defect class D-10 names in the application layer).
 *
 * What stays in the route: the SSE headers, the chunk parsing through
 * lib/docker-log-parser.ts, the per-line write framing, and — critically —
 * the disconnect handler that destroys every opened stream. That handler
 * is the fix for the leak recorded in project state (STATE.md "Phase 1:
 * dockerode log stream on SSE client disconnect — RESOLVED in P06") and is
 * untouched by this move: it still runs in the route, over the same stream
 * set, registered on the same request event.
 */
export class LogService {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "getLogStream">,
        private readonly stackRepo: LogServiceStackReadPort,
    ) {}

    /**
     * Raises NotFoundError("Stack not found") for an unknown stack — the
     * exact literal message the route it replaces always sent.
     *
     * Returns an empty array (rather than throwing) when the filter
     * matches no service with a running container: the route turns that
     * into the same 400 response, with the same interpolated message, it
     * always has. Keeping the bad-request response construction in the
     * route (rather than raising a typed BadRequestError here) keeps the
     * HTTP-shaped message text — which interpolates the raw query-string
     * service filter — out of the application layer.
     */
    async openLogStreams(stackId: string, serviceFilter: string): Promise<LogStreamTarget[]> {
        const stack = await this.stackRepo.findByIdWithRelations(stackId);
        if (!stack) throw new NotFoundError("Stack not found");

        const servicesWithContainer = stack.services.filter((s) => s.containerId !== null);
        const targets = serviceFilter === "all"
            ? servicesWithContainer
            : servicesWithContainer.filter((s) => s.serviceName === serviceFilter);

        return Promise.all(
            targets.map(async (svc) => ({
                serviceName: svc.serviceName,
                stream: await this.docker.getLogStream(svc.containerId as string, 100),
            })),
        );
    }
}
