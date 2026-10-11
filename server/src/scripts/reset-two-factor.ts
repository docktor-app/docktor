import {pathToFileURL} from "node:url";
import {AppError} from "../lib/errors.js";

// D-09: on-box two-factor reset for a user who lost both their authenticator
// and their recovery codes. Run it inside the container:
//
//   docker compose exec docktor node dist/server/scripts/reset-two-factor.js <email>
//
// Shell access to the host is the authorisation: there is no HTTP route, no
// email flow and no override for another user. See docs/deployment.md,
// "Resetting two-factor authentication".

const USAGE = "Usage: node dist/server/scripts/reset-two-factor.js <email>";

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

export interface ResetTwoFactorDeps {
    resetTwoFactor(email: string): Promise<{userId: string}>;
    out: Pick<Console, "log" | "error">;
}

function describeFailure(error: unknown): string {
    if (error instanceof AppError) return error.message;
    const detail = error instanceof Error ? error.message : String(error);
    return `Could not reset two-factor authentication: ${detail}`;
}

/** Runs the reset for `args` (the arguments after the script name) and returns the process exit code. */
export async function runResetTwoFactor(args: readonly string[], deps: ResetTwoFactorDeps): Promise<number> {
    if (args.length !== 1) {
        deps.out.error(USAGE);
        return EXIT_USAGE;
    }
    const email = args[0];
    try {
        await deps.resetTwoFactor(email);
    } catch (error) {
        deps.out.error(describeFailure(error));
        return EXIT_FAILED;
    }
    deps.out.log(`Two-factor authentication was reset for ${email}. All of their sessions were signed out.`);
    return EXIT_OK;
}

/**
 * Composition root for the direct run. Imported lazily so that importing this
 * module (tests) never opens a database connection.
 */
async function main(): Promise<number> {
    const [{AccountSecurityService}, {settingsRepository, accountSecurityRepository}] = await Promise.all([
        import("../application/account-security-service.js"),
        import("../repositories/index.js"),
    ]);
    const service = new AccountSecurityService(settingsRepository, accountSecurityRepository);
    return runResetTwoFactor(process.argv.slice(2), {
        resetTwoFactor: (email) => service.resetTwoFactor(email),
        out: console,
    });
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
    // process.exit: the database pool would otherwise keep the process alive.
    main().then(
        (code) => process.exit(code),
        (error: unknown) => {
            console.error(describeFailure(error));
            process.exit(EXIT_FAILED);
        },
    );
}
