import {z} from "zod";

import {migrationOperationSchema} from "./migration-operation.js";
import {certStatusSchema} from "./proxy.js";

// One definition of every frame /api/events carries. The server types its
// StateBroadcaster with the inferred types and the client guards `onmessage`
// with `stateEventSchema.safeParse`, so a malformed or unknown frame is
// dropped instead of reaching a handler. Phase 25 keys EVENT_PERMISSIONS on
// STATE_EVENT_TYPES.

export const containerStateEventSchema = z.object({
    type: z.literal("container_state"),
    stackId: z.string(),
    serviceName: z.string(),
    containerState: z.string(),
    healthStatus: z.string().nullable(),
    stackStatus: z.string(),
    statusLog: z
        .object({
            id: z.string(),
            fromStatus: z.string().nullable(),
            toStatus: z.string(),
            message: z.string().nullable(),
            createdAt: z.string(),
        })
        .optional(),
});

export const stackStatusEventSchema = z.object({
    type: z.literal("stack_status"),
    stackId: z.string(),
    stackStatus: z.string(),
});

export const configChangedEventSchema = z.object({
    type: z.literal("config_changed"),
    stackId: z.string(),
    newHash: z.string(),
    // "app" is an app-initiated save, "external" a genuine edit on disk; the
    // client gates its "changed externally" toast on this field.
    source: z.enum(["app", "external"]),
});

export const configErrorEventSchema = z.object({
    type: z.literal("config_error"),
    stackId: z.string(),
    message: z.string(),
});

export const updateAvailableEventSchema = z.object({
    type: z.literal("update_available"),
    stackId: z.string(),
    imageRef: z.string(),
    latestTag: z.string().nullable(),
    hasUpdate: z.boolean(),
});

export const notificationCreatedEventSchema = z.object({
    type: z.literal("notification_created"),
    notificationId: z.string(),
});

export const proxyCertStatusEventSchema = z.object({
    type: z.literal("proxy_cert_status"),
    proxyConfigId: z.string(),
    stackId: z.string(),
    domain: z.string(),
    status: certStatusSchema,
    message: z.string().optional(),
});

// G-18-job: the operation is the shared MigrationOperation snapshot, so the
// event cannot drift from the REST shape.
export const migrationProgressEventSchema = z.object({
    type: z.literal("migration_progress"),
    operation: migrationOperationSchema,
});

export const stateEventSchema = z.discriminatedUnion("type", [
    containerStateEventSchema,
    stackStatusEventSchema,
    configChangedEventSchema,
    configErrorEventSchema,
    updateAvailableEventSchema,
    notificationCreatedEventSchema,
    proxyCertStatusEventSchema,
    migrationProgressEventSchema,
]);

export const STATE_EVENT_TYPES = [
    "container_state",
    "stack_status",
    "config_changed",
    "config_error",
    "update_available",
    "notification_created",
    "proxy_cert_status",
    "migration_progress",
] as const;

export type StateEvent = z.infer<typeof stateEventSchema>;
export type StateEventType = (typeof STATE_EVENT_TYPES)[number];
export type ContainerStateEvent = z.infer<typeof containerStateEventSchema>;
export type StackStatusEvent = z.infer<typeof stackStatusEventSchema>;
export type ConfigChangedEvent = z.infer<typeof configChangedEventSchema>;
export type ConfigErrorEvent = z.infer<typeof configErrorEventSchema>;
export type UpdateAvailableEvent = z.infer<typeof updateAvailableEventSchema>;
export type NotificationCreatedEvent = z.infer<typeof notificationCreatedEventSchema>;
export type ProxyCertStatusEvent = z.infer<typeof proxyCertStatusEventSchema>;
export type MigrationProgressEvent = z.infer<typeof migrationProgressEventSchema>;
