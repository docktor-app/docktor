import type {SmtpConfig} from "../notification-service.js";

/**
 * Port for the mail transport dependency (D-07). Declared here rather than
 * `NotificationService` importing the transport library directly, so the
 * application layer stays free of infrastructure imports and unit-testable
 * with a plain fake. A single operation covers both current callers
 * (`notify` and `testSmtp`) so they cannot diverge onto two transport
 * paths.
 */
export interface SmtpClientPort {
    sendMail(
        config: SmtpConfig,
        message: {to: string; subject: string; text: string},
    ): Promise<void>;
}

export type {SmtpConfig};
