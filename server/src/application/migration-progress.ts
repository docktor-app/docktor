import type {MigrationOperationStep} from "@docktor/shared";

/** Told which step of a migration starts; `detail` names the volume or path being copied. */
export type MigrationProgressListener = (progress: {step: MigrationOperationStep; detail: string | null}) => void;

/**
 * The logging seam of the migration code (#108). There is no app-wide logger
 * yet and structured logging (#70) is deferred, so an injected `Console`-shaped
 * logger is the convention; tests substitute a spy, production uses `console`.
 */
export type MigrationLogger = Pick<Console, "info" | "warn" | "error">;

/**
 * Tells the listener which step starts. A listener is not part of the
 * migration: whatever it throws is logged and never changes the outcome or the
 * rollback (T-18-45).
 */
export function reportMigrationProgress(
    logger: MigrationLogger,
    onProgress: MigrationProgressListener | undefined,
    step: MigrationOperationStep,
    detail: string | null = null,
): void {
    if (!onProgress) {
        return;
    }
    try {
        onProgress({step, detail});
    } catch (listenerError: unknown) {
        logger.error(`[MigrationService] Progress listener failed at step "${step}":`, listenerError);
    }
}

/** The message of whatever was thrown. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
