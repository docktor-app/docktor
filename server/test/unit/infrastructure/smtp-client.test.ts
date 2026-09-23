import {beforeEach, describe, expect, it, vi} from "vitest";
import type {SmtpConfig} from "../../../src/application/notification-service.js";

const {mockSendMail, mockCreateTransport} = vi.hoisted(() => {
    const mockSendMail = vi.fn().mockResolvedValue({messageId: "123"});
    const mockCreateTransport = vi.fn().mockReturnValue({sendMail: mockSendMail});
    return {mockSendMail, mockCreateTransport};
});

vi.mock("nodemailer", () => ({
    default: {
        createTransport: mockCreateTransport,
    },
}));

import {SmtpClient} from "../../../src/infrastructure/smtp-client.js";

function baseConfig(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
    return {
        host: "smtp.example.com",
        port: 587,
        encryption: "none",
        username: "",
        password: "",
        from: "noreply@example.com",
        ...overrides,
    };
}

describe("SmtpClient", () => {
    let client: SmtpClient;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSendMail.mockResolvedValue({messageId: "123"});
        mockCreateTransport.mockReturnValue({sendMail: mockSendMail});
        client = new SmtpClient();
    });

    it("forwards to/subject/text unchanged to the transport, sourcing from off the config", async () => {
        const config = baseConfig({from: "sender@example.com"});

        await client.sendMail(config, {to: "recipient@example.com", subject: "Hello", text: "Body text"});

        expect(mockSendMail).toHaveBeenCalledWith({
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: "Hello",
            text: "Body text",
        });
    });

    it("builds an ssl transport (secure: true, no requireTLS) for encryption 'ssl'", async () => {
        const config = baseConfig({encryption: "ssl", port: 465});

        await client.sendMail(config, {to: "a@b.com", subject: "s", text: "t"});

        expect(mockCreateTransport).toHaveBeenCalledWith(
            expect.objectContaining({secure: true, requireTLS: false}),
        );
    });

    it("builds a starttls transport (requireTLS: true, not secure) for encryption 'starttls'", async () => {
        const config = baseConfig({encryption: "starttls", port: 587});

        await client.sendMail(config, {to: "a@b.com", subject: "s", text: "t"});

        expect(mockCreateTransport).toHaveBeenCalledWith(
            expect.objectContaining({secure: false, requireTLS: true}),
        );
    });

    it("omits auth entirely when no username is present", async () => {
        const config = baseConfig({encryption: "none", username: "", password: ""});

        await client.sendMail(config, {to: "a@b.com", subject: "s", text: "t"});

        expect(mockCreateTransport).toHaveBeenCalledWith(
            expect.objectContaining({auth: undefined}),
        );
    });

    it("includes auth with user/pass when a username is present", async () => {
        const config = baseConfig({username: "smtp-user", password: "smtp-pass"});

        await client.sendMail(config, {to: "a@b.com", subject: "s", text: "t"});

        expect(mockCreateTransport).toHaveBeenCalledWith(
            expect.objectContaining({auth: {user: "smtp-user", pass: "smtp-pass"}}),
        );
    });

    it("never lets the decrypted password reach any console method (T-10-01)", async () => {
        const SENTINEL_PASSWORD = "sentinel-password-do-not-log-6f3a9c";
        const config = baseConfig({username: "smtp-user", password: SENTINEL_PASSWORD});

        const consoleSpies = [
            vi.spyOn(console, "log").mockImplementation(() => {}),
            vi.spyOn(console, "info").mockImplementation(() => {}),
            vi.spyOn(console, "warn").mockImplementation(() => {}),
            vi.spyOn(console, "error").mockImplementation(() => {}),
        ];

        try {
            await client.sendMail(config, {to: "a@b.com", subject: "s", text: "t"});

            for (const spy of consoleSpies) {
                for (const call of spy.mock.calls) {
                    for (const arg of call) {
                        const serialized = typeof arg === "string" ? arg : JSON.stringify(arg);
                        expect(serialized ?? "").not.toContain(SENTINEL_PASSWORD);
                    }
                }
            }
        } finally {
            for (const spy of consoleSpies) spy.mockRestore();
        }
    });
});
