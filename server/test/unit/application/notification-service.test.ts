import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationService } from "../../../src/application/notification-service.js"

function createMockUsers(emails: string[] = ["user@example.com"]) {
    return {
        findAllEmails: vi.fn().mockResolvedValue(emails),
    }
}

function createMockRepo() {
    return {
        create: vi.fn(),
        markEmailSent: vi.fn(),
        findLastDiskAlert: vi.fn(),
        setDiskAlertActive: vi.fn(),
        findRecent: vi.fn(),
    }
}

function createMockSettings() {
    return {
        getSetting: vi.fn(),
        upsertSetting: vi.fn(),
        getSmtpConfig: vi.fn(),
    }
}

function createMockBus() {
    return {
        emit: vi.fn(),
    }
}

function createMockSmtpClient() {
    return {
        sendMail: vi.fn().mockResolvedValue(undefined),
    }
}

describe("NotificationService", () => {
    let service: NotificationService
    let repo: ReturnType<typeof createMockRepo>
    let settings: ReturnType<typeof createMockSettings>
    let bus: ReturnType<typeof createMockBus>
    let users: ReturnType<typeof createMockUsers>
    let smtpClient: ReturnType<typeof createMockSmtpClient>

    beforeEach(() => {
        vi.clearAllMocks()
        repo = createMockRepo()
        settings = createMockSettings()
        bus = createMockBus()
        // Default: two-address recipient list, derived solely from the injected UserReadPort stub
        users = createMockUsers(["user1@example.com", "user2@example.com"])
        smtpClient = createMockSmtpClient()
        service = new NotificationService(repo as any, settings as any, bus as any, users as any, smtpClient as any)
    })

    describe("notify", () => {
        it("writes notification to DB when trigger is enabled", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue(null)
            repo.create.mockResolvedValue({ id: "notif-1" })

            await service.notify({
                type: "stack_error",
                stackId: "my-stack",
                subject: "Stack Error",
                message: "Stack my-stack entered ERROR state",
            })

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "stack_error",
                    stackId: "my-stack",
                    message: "Stack my-stack entered ERROR state",
                    emailSent: false,
                }),
            )
        })

        it("emits notification.created with the new record's id", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue(null)
            repo.create.mockResolvedValue({ id: "notif-1" })

            await service.notify({
                type: "stack_error",
                stackId: "my-stack",
                subject: "Stack Error",
                message: "Stack my-stack entered ERROR state",
            })

            expect(bus.emit).toHaveBeenCalledWith("notification.created", { notificationId: "notif-1" })
        })

        it("emits notification.created after the record is created, not before", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue(null)
            const order: string[] = []
            repo.create.mockImplementation(async () => {
                order.push("repo.create")
                return { id: "notif-1" }
            })
            bus.emit.mockImplementation(() => {
                order.push("bus.emit")
            })

            await service.notify({
                type: "stack_error",
                stackId: "my-stack",
                subject: "Stack Error",
                message: "Stack my-stack entered ERROR state",
            })

            expect(order).toEqual(["repo.create", "bus.emit"])
        })

        it("completes normally when the bus emit throws — a failing subscriber can't strand notify()", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue(null)
            repo.create.mockResolvedValue({ id: "notif-1" })
            bus.emit.mockImplementation(() => {
                throw new Error("subscriber exploded")
            })
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

            await expect(
                service.notify({
                    type: "stack_error",
                    stackId: "my-stack",
                    subject: "Stack Error",
                    message: "Stack my-stack entered ERROR state",
                }),
            ).resolves.toBeUndefined()

            consoleError.mockRestore()
        })

        it("skips notification when trigger is disabled", async () => {
            settings.getSetting.mockResolvedValue("false")

            await service.notify({
                type: "stack_error",
                stackId: "my-stack",
                subject: "Stack Error",
                message: "Stack my-stack entered ERROR state",
            })

            expect(repo.create).not.toHaveBeenCalled()
        })

        it("sends email when SMTP is configured", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue({
                host: "smtp.example.com",
                port: 587,
                username: "user@example.com",
                password: "secret",
                from: "noreply@example.com",
                recipient: "admin@example.com",
            })
            repo.create.mockResolvedValue({ id: "notif-2" })

            await service.notify({
                type: "stack_error",
                stackId: "my-stack",
                subject: "Stack Error",
                message: "Stack my-stack entered ERROR state",
            })

            expect(repo.markEmailSent).toHaveBeenCalledWith("notif-2")
            // Recipient list must come from the injected UserReadPort stub, not a Prisma query
            expect(users.findAllEmails).toHaveBeenCalled()
            expect(smtpClient.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({ host: "smtp.example.com" }),
                expect.objectContaining({
                    to: "user1@example.com, user2@example.com",
                    subject: "Stack Error",
                    text: "Stack my-stack entered ERROR state",
                }),
            )
        })

        it("logs to DB but does not send email when SMTP is not configured", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue(null)
            repo.create.mockResolvedValue({ id: "notif-3" })

            await service.notify({
                type: "disk_warning",
                stackId: null,
                subject: "Disk Warning",
                message: "Disk space below threshold",
            })

            expect(repo.create).toHaveBeenCalled()
            expect(repo.markEmailSent).not.toHaveBeenCalled()
        })

        it("does not throw when email send fails", async () => {
            settings.getSetting.mockResolvedValue("true")
            settings.getSmtpConfig.mockResolvedValue({
                host: "smtp.example.com",
                port: 587,
                username: "user",
                password: "pass",
                from: "from@example.com",
                recipient: "to@example.com",
            })
            repo.create.mockResolvedValue({ id: "notif-4" })
            smtpClient.sendMail.mockRejectedValue(new Error("SMTP connection refused"))

            // Should not throw even when sendMail fails
            await expect(
                service.notify({
                    type: "stack_error",
                    stackId: "my-stack",
                    subject: "Stack Error",
                    message: "error message",
                }),
            ).resolves.not.toThrow()

            expect(repo.create).toHaveBeenCalled()
        })
    })

    describe("testSmtp", () => {
        it("sends test email", async () => {
            const smtpConfig = {
                host: "smtp.example.com",
                port: 587,
                username: "user@example.com",
                password: "secret",
                from: "noreply@example.com",
                recipient: "admin@example.com",
            }

            // For valid config, testSmtp should not throw
            await expect(service.testSmtp(smtpConfig)).resolves.not.toThrow()
            expect(smtpClient.sendMail).toHaveBeenCalledWith(smtpConfig, {
                to: "admin@example.com",
                subject: "Docktor — SMTP test",
                text: "SMTP configuration is working correctly.",
            })
        })
    })

    describe("getRecent", () => {
        it("delegates to repo.findRecent with a default limit of 100", async () => {
            const rows = [{id: "notif-1", type: "stack_error", stack: {id: "s1", displayName: "Stack 1"}}]
            repo.findRecent.mockResolvedValue(rows)

            const result = await service.getRecent()

            expect(repo.findRecent).toHaveBeenCalledWith(100)
            expect(result).toBe(rows)
        })

        it("forwards an explicit limit through to repo.findRecent", async () => {
            repo.findRecent.mockResolvedValue([])

            await service.getRecent(25)

            expect(repo.findRecent).toHaveBeenCalledWith(25)
        })
    })
})
