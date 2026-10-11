import {PostgreSqlContainer, type StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {execFileSync} from "node:child_process";
import {buildApp} from "../../src/app.js";
import type {FastifyInstance} from "fastify";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../src/generated/prisma/client.js";
import {resolvePrismaCliEntrypoint} from "../../src/lib/prisma-cli.js";
import {buildTrustedOrigins} from "../../src/lib/auth.js";
import {totpFromUri} from "../helpers/totp.js";

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

/** The origin better-auth trusts in tests; cookie-bearing /api/auth requests must carry it. */
export const TEST_ORIGIN = buildTrustedOrigins(process.env.BETTER_AUTH_URL, null)[0];

/** Cookie names better-auth 1.4.18 uses over plain http (no `__Secure-` prefix). */
export const SESSION_COOKIE_NAME = "better-auth.session_token";
export const TWO_FACTOR_COOKIE_NAME = "better-auth.two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "better-auth.trust_device";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaConfigPath = path.resolve(__dirname, "../../prisma/prisma.config.ts");

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;
let prismaClient: PrismaClient;

export async function startContainer(): Promise<void> {
    container = await new PostgreSqlContainer("postgres:17")
        .withDatabase("docktor_test")
        .withUsername("docktor")
        .withPassword("docktor")
        .start();

    const connectionString = container.getConnectionUri();

    // Set env vars before building the app (lazy db.ts will pick these up)
    process.env.DATABASE_URL = connectionString;
    process.env.NODE_ENV = "test";
    process.env.BETTER_AUTH_SECRET = "test-secret";

    // Push schema to the test database.
    // Launches the CLI through Node's own binary (process.execPath) with a
    // module-resolved entrypoint, so the invocation is identical on every
    // platform — no OS-shaped `.bin` shim path involved. Keeps the
    // argv-array form (not a shell-interpolated string) so a path
    // containing shell metacharacters can never be interpreted (T-05.1-02).
    try {
        execFileSync(process.execPath, [resolvePrismaCliEntrypoint(), "db", "push", `--config=${prismaConfigPath}`], {
            env: {...process.env, DATABASE_URL: connectionString},
            stdio: "pipe",
        });
    } catch (err) {
        const execErr = err as NodeJS.ErrnoException & {stdout?: Buffer | string; stderr?: Buffer | string};
        const stdout = execErr.stdout?.toString() ?? "";
        const stderr = execErr.stderr?.toString() ?? "";
        throw new Error(
            `startContainer(): \`prisma db push\` failed while applying the schema to the test database.\n` +
                `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
            {cause: err},
        );
    }

    // Create a Prisma client for test helpers (cleanup, etc.)
    const adapter = new PrismaPg({connectionString});
    prismaClient = new PrismaClient({adapter});
}

export async function stopContainer(): Promise<void> {
    // Tolerant of partial initialisation: startContainer() may have thrown
    // after assigning `container` but before `app`/`prismaClient` were set
    // (e.g. the schema-push step failed). Every resource that WAS acquired
    // must still be released, and a failure releasing one resource must
    // never prevent the other two from being released.
    const errors: unknown[] = [];

    if (prismaClient) {
        try {
            await prismaClient.$disconnect();
        } catch (err) {
            errors.push(err);
        }
    }

    if (app) {
        try {
            await app.close();
        } catch (err) {
            errors.push(err);
        }
    }

    if (container) {
        try {
            await container.stop();
        } catch (err) {
            errors.push(err);
        }
    }

    if (errors.length > 0) {
        throw new AggregateError(errors, "stopContainer(): one or more teardown steps failed");
    }
}

export async function getApp(): Promise<FastifyInstance> {
    if (!app) {
        app = await buildApp();
        await app.ready();
    }
    return app;
}

export function getPrisma(): PrismaClient {
    if (!prismaClient) {
        throw new Error(
            "getPrisma(): prismaClient is not initialised — startContainer() must have failed or " +
                "never completed. Check the preceding error for the real cause (do not treat this as the root cause).",
        );
    }
    return prismaClient;
}

export async function cleanDatabase(): Promise<void> {
    if (!prismaClient) {
        throw new Error(
            "cleanDatabase(): prismaClient is not initialised — startContainer() must have failed or " +
                "never completed. Check the preceding error for the real cause (do not treat this as the root cause).",
        );
    }
    const p = prismaClient;
    await p.statusLog.deleteMany();
    await p.deployment.deleteMany();
    await p.proxyConfig.deleteMany();
    await p.backup.deleteMany();
    await p.service.deleteMany();
    await p.templateVariant.deleteMany();
    await p.template.deleteMany();
    await p.templateRepo.deleteMany();
    await p.stack.deleteMany();
    await p.session.deleteMany();
    await p.account.deleteMany();
    await p.verification.deleteMany();
    await p.setting.deleteMany();
    await p.twoFactor.deleteMany();
    await p.rateLimit.deleteMany();
    await p.user.deleteMany();
}

export async function createTestUser(): Promise<{cookie: string; email: string; password: string}> {
    const email = `test-${Date.now()}@example.com`;
    const password = "TestPassword123!";

    // Sign up via better-auth API
    const signupRes = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        payload: {
            name: "Test User",
            email,
            password,
        },
    });

    // Extract session cookie from the sign-up response
    const sessionCookie = extractCookie(signupRes, SESSION_COOKIE_NAME);

    if (!sessionCookie) {
        throw new Error(`Failed to create test user (status: ${signupRes.statusCode}): ${signupRes.body}`);
    }

    return {cookie: sessionCookie, email, password};
}

/** Every raw `Set-Cookie` header value of a response (attributes included). */
export function getSetCookies(res: Pick<InjectResponse, "headers">): string[] {
    const raw = res.headers["set-cookie"];
    if (Array.isArray(raw)) return raw;
    return raw ? [raw] : [];
}

/**
 * Returns the `name=value` pair a response set for the cookie `name`, or null
 * when it did not set it or cleared it (empty value). When the same cookie
 * appears more than once the last one wins, as in a browser.
 */
export function extractCookie(res: Pick<InjectResponse, "headers">, name: string): string | null {
    let found: string | null = null;
    for (const entry of getSetCookies(res)) {
        const pair = entry.split(";")[0];
        if (pair.startsWith(`${name}=`)) found = pair;
    }
    return found === null || found === `${name}=` ? null : found;
}

/** POST /api/auth/sign-in/email as a browser on the trusted origin would. */
export function signIn(email: string, password: string, extraCookies: string[] = []): Promise<InjectResponse> {
    return app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: {
            origin: TEST_ORIGIN,
            ...(extraCookies.length > 0 ? {cookie: extraCookies.join("; ")} : {}),
        },
        payload: {email, password},
    });
}

/**
 * Enrolls the signed-in user in TOTP the way the Account page does: enable
 * with the password, then confirm with the first code. Follows the re-issued
 * session cookie (the confirming verify-totp swaps the session). Never log
 * the returned URI or recovery codes.
 */
export async function enrollTwoFactor(
    cookie: string,
    password: string,
): Promise<{cookie: string; totpURI: string; backupCodes: string[]}> {
    const headers = {origin: TEST_ORIGIN};

    const enableRes = await app.inject({
        method: "POST",
        url: "/api/auth/two-factor/enable",
        headers: {...headers, cookie},
        payload: {password},
    });
    if (enableRes.statusCode !== 200) {
        throw new Error(`enrollTwoFactor(): enable failed with status ${enableRes.statusCode}`);
    }
    const {totpURI, backupCodes} = enableRes.json<{totpURI: string; backupCodes: string[]}>();
    const afterEnable = extractCookie(enableRes, SESSION_COOKIE_NAME) ?? cookie;

    const verifyRes = await app.inject({
        method: "POST",
        url: "/api/auth/two-factor/verify-totp",
        headers: {...headers, cookie: afterEnable},
        payload: {code: totpFromUri(totpURI)},
    });
    if (verifyRes.statusCode !== 200) {
        throw new Error(`enrollTwoFactor(): verify-totp failed with status ${verifyRes.statusCode}`);
    }

    return {cookie: extractCookie(verifyRes, SESSION_COOKIE_NAME) ?? afterEnable, totpURI, backupCodes};
}
