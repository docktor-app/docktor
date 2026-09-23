import nodemailer from "nodemailer";
import type {SmtpClientPort} from "../application/ports/smtp-client-port.js";
import type {SmtpConfig} from "../application/notification-service.js";

export class SmtpClient implements SmtpClientPort {
    async sendMail(
        config: SmtpConfig,
        message: {to: string; subject: string; text: string},
    ): Promise<void> {
        // Never log `config` — it carries the decrypted SMTP password.
        // Only the destination and subject are safe to log.
        console.log(`[SmtpClient] Sending mail to ${message.to}: ${message.subject}`);
        const transport = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.encryption === "ssl",
            requireTLS: config.encryption === "starttls",
            auth: config.username
                ? {user: config.username, pass: config.password}
                : undefined,
        });
        await transport.sendMail({
            from: config.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
        });
    }
}

export const smtpClient = new SmtpClient();
