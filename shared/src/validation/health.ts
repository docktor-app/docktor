import {z} from "zod";

// Health and uptime schemas for Phase 14 (#23). This module holds every
// Phase 14 health/uptime validation schema, so client and server share one
// definition of each query and body.

// GET /api/stacks/:id/health-events — without serviceName the server returns
// the latest `limit` transitions per service; with it, only that service's.
export const serviceHealthEventsQuerySchema = z.object({
    serviceName: z.string().trim().min(1).max(255).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type ServiceHealthEventsQuery = z.infer<typeof serviceHealthEventsQuerySchema>;
