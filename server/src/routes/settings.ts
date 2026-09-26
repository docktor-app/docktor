import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod"
import {z} from "zod"
import {requireAuth} from "../lib/auth-middleware.js"
import {settingsService, notificationService} from "../application/index.js"

const updateGeneralSettingsSchema = z.object({
    instanceName: z.string().optional(),
    baseUrl: z.string().optional(),
    timezone: z.string().optional(),
})

// Accepts plain email (user@example.com) or display name format (Name <user@example.com>)
const emailOrDisplayName = z
    .string()
    .min(1)
    .refine(
        (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(val),
        "Must be a valid email or 'Name <email>' format",
    )

const smtpConfigSchema = z.object({
    host: z.string().min(1, "SMTP host is required"),
    port: z.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
    encryption: z.enum(["none", "starttls", "ssl"]).default("starttls"),
    username: z.string().optional().default(""),
    password: z.string().optional().default(""),
    from: emailOrDisplayName,
})

const smtpTestSchema = z.object({
    host: z.string().min(1, "SMTP host is required"),
    port: z.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
    encryption: z.enum(["none", "starttls", "ssl"]).default("starttls"),
    username: z.string().optional().default(""),
    password: z.string().min(1, "Password is required for test"),
    from: emailOrDisplayName,
    recipient: z.string().email("Recipient email is required for test"),
})

const notificationTriggersSchema = z.object({
    stackError: z.boolean().optional(),
    diskWarning: z.boolean().optional(),
    diskThresholdPercent: z.number().min(1).max(99).optional(),
    diskThresholdBytes: z.number().min(0).optional(),
})

const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)

    app.get("/api/settings/general", async () => {
        return settingsService.getGeneralSettings()
    })

    app.put(
        "/api/settings/general",
        {schema: {body: updateGeneralSettingsSchema}},
        async (request) => {
            return settingsService.updateGeneralSettings(request.body)
        },
    )

    // GET /api/settings/smtp — Returns SMTP config with password masked
    app.get("/api/settings/smtp", async () => {
        return settingsService.getMaskedSmtpConfig()
    })

    // PUT /api/settings/smtp — Saves SMTP config, encrypts password
    app.put(
        "/api/settings/smtp",
        {schema: {body: smtpConfigSchema}},
        async (request) => {
            await settingsService.saveSmtpConfig(request.body)
            return {success: true}
        },
    )

    // POST /api/settings/smtp/test — Test SMTP connection
    app.post(
        "/api/settings/smtp/test",
        {schema: {body: smtpTestSchema}},
        async (request) => {
            const {host, port, encryption, username, password, from, recipient} = request.body
            await notificationService.testSmtp({host, port, encryption, username, password, from, recipient})
            return {success: true}
        },
    )

    // GET /api/settings/notification-triggers — Returns trigger toggle values
    app.get("/api/settings/notification-triggers", async () => {
        return settingsService.getNotificationTriggers()
    })

    // PUT /api/settings/notification-triggers — Updates toggle values
    app.put(
        "/api/settings/notification-triggers",
        {schema: {body: notificationTriggersSchema}},
        async (request) => {
            await settingsService.updateNotificationTriggers(request.body)
            return {success: true}
        },
    )
}

export default settingsRoutes
