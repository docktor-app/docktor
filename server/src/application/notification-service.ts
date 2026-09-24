import type {NotificationRepository} from "../repositories/notification-repository.js"
import type {EventBusPort} from "./ports/event-bus-port.js"
import type {SmtpClientPort} from "./ports/smtp-client-port.js"

export interface SmtpConfig {
    host: string
    port: number
    encryption: "none" | "starttls" | "ssl"
    username: string
    password: string
    from: string
}

interface SmtpTestConfig extends SmtpConfig {
    recipient: string
}

export interface NotificationEvent {
    type: "stack_error" | "stack_unhealthy" | "disk_warning" | "backup_failure"
    stackId?: string | null
    subject: string
    message: string
}

interface NotificationSettings {
    getSetting(key: string): Promise<string | null>
    getSmtpConfig(): Promise<SmtpConfig | null>
}

/**
 * Read port for recipient-email resolution. Declared here rather than
 * importing the concrete UserRepository, so this service stays
 * unit-testable with a plain object and the dependency arrow keeps
 * pointing inward (application depends on a port, not on repositories/).
 */
export interface UserReadPort {
    findAllEmails(): Promise<string[]>
}

export class NotificationService {
    constructor(
        private readonly repo: NotificationRepository,
        private readonly settings: NotificationSettings,
        private readonly bus: Pick<EventBusPort, "emit">,
        private readonly users: UserReadPort,
        private readonly smtpClient: SmtpClientPort,
    ) {}

    async notify(event: NotificationEvent): Promise<void> {
        console.log("[NotificationService] notify() called with:", {type: event.type, stackId: event.stackId, subject: event.subject})

        const toggleKey =
            event.type === "disk_warning"
                ? "notify.diskWarning"
                : event.type === "backup_failure"
                    ? "notify.backupFailure"
                    : "notify.stackError"
        const enabled = await this.settings.getSetting(toggleKey)
        console.log(`[NotificationService] Toggle ${toggleKey} = ${enabled}`)
        if (enabled === "false") {
            console.log(`[NotificationService] Notification disabled by toggle, skipping`)
            return
        }

        console.log("[NotificationService] Creating notification record...")
        const notification = await this.repo.create({
            type: event.type,
            stackId: event.stackId ?? null,
            message: event.message,
            emailSent: false,
        })
        console.log(`[NotificationService] Notification record created: ${notification.id}`)

        // Emit the notification-created domain event (D-15 item 1, last
        // inline publish in the server) — the state-broadcast bridge
        // subscriber (plan 10-11) delivers it to connected SSE clients in
        // the same shape at the same point. Defence-in-depth try/catch
        // alongside the bus's own per-subscriber isolation (D-17), matching
        // every other emit site added in this phase.
        try {
            this.bus.emit("notification.created", {notificationId: notification.id})
        } catch (err) {
            console.error("[NotificationService] bus emit failed", err)
        }

        const smtpConfig = await this.settings.getSmtpConfig()
        if (!smtpConfig) {
            console.log("[NotificationService] No SMTP config, skipping email")
            return
        }

        const emails = await this.users.findAllEmails()
        if (emails.length === 0) {
            console.log("[NotificationService] No users found, skipping email")
            return
        }

        try {
            await this.smtpClient.sendMail(smtpConfig, {
                to: emails.join(", "),
                subject: event.subject,
                text: event.message,
            })
            await this.repo.markEmailSent(notification.id)
            console.log(`[NotificationService] Email sent successfully for notification ${notification.id}`)
        } catch (err) {
            console.error("[NotificationService] email send failed:", err)
        }
    }

    async testSmtp(config: SmtpTestConfig): Promise<void> {
        await this.smtpClient.sendMail(config, {
            to: config.recipient,
            subject: "Docktor — SMTP test",
            text: "SMTP configuration is working correctly.",
        })
    }

    async getSmtpConfig(): Promise<SmtpConfig | null> {
        return this.settings.getSmtpConfig()
    }

    async getRecent(limit: number = 100): Promise<Awaited<ReturnType<NotificationRepository["findRecent"]>>> {
        return this.repo.findRecent(limit)
    }
}
