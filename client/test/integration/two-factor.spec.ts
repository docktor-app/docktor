import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// Issue #45 (Phase 15): the two-factor UI end to end. Every outbound /api/**
// call is stubbed with page.route (see fixtures.ts), so nothing reaches a real
// server. The desktop journeys run in the "chromium" project; the phone-width
// dialog backstop runs only in "mobile-chromium" (playwright.config.ts routes
// this file to both projects, and each describe skips the other's device).

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const NOT_ENABLED = {twoFactorEnabled: false, mandatory: false, enrollmentRequired: false};
const ENABLED = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};
const MUST_ENROL = {twoFactorEnabled: false, mandatory: true, enrollmentRequired: true};

const SETUP_KEY = "JBSWY3DPEHPK3PXP";
const TOTP_URI = `otpauth://totp/Docktor:test%40example.com?secret=${SETUP_KEY}&issuer=Docktor`;
const RECOVERY_CODES = Array.from({length: 10}, (_, index) => `code${index}-abcde`);

function json(body: unknown) {
    return {status: 200, contentType: "application/json", body: JSON.stringify(body)} as const;
}

async function mockSetupComplete(page: Page) {
    await page.route("**/api/setup/status", (route) => route.fulfill(json({setupComplete: true})));
}

async function mockSignedIn(page: Page) {
    await page.route("**/api/auth/get-session", (route) => route.fulfill(json(mockSession)));
}

/** The dashboard's own calls, for specs that land on "/". */
async function mockDashboardData(page: Page) {
    await page.route("**/api/stacks", (route) => route.fulfill(json([])));
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill(json({defaultSchedule: null, defaultRetention: null})),
    );
}

/** Serves the account security status; the returned setter changes it for later requests. */
async function mockSecurityStatus(page: Page, initial: Record<string, boolean>) {
    let current = initial;
    await page.route("**/api/account/security", (route) => route.fulfill(json(current)));
    return (next: Record<string, boolean>): void => {
        current = next;
    };
}

async function mockEnrollmentEndpoints(page: Page) {
    await page.route("**/api/auth/two-factor/enable", (route) =>
        route.fulfill(json({totpURI: TOTP_URI, backupCodes: RECOVERY_CODES})),
    );
    await page.route("**/api/auth/two-factor/verify-totp", (route) => route.fulfill(json({token: "t", user: mockUser})));
}

/** Runs the enrollment dialog from its first step up to (and including) the recovery-codes step. */
async function reachRecoveryCodesStep(page: Page) {
    await page.getByRole("button", {name: "Set up two-factor authentication"}).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password").fill("TestPassword123!");
    await dialog.getByRole("button", {name: "Continue"}).click();
    await expect(dialog.getByText("Step 2 of 3")).toBeVisible();
    return dialog;
}

test.describe("Two-factor UI (desktop)", () => {
    test.skip(({isMobile}) => isMobile, "Desktop journeys; the phone-width backstop is the mobile describe below.");

    test.beforeEach(async ({page}) => {
        await mockSetupComplete(page);
    });

    test("signs in with an authenticator code", async ({page}) => {
        await mockDashboardData(page);
        let hasSession = false;
        await page.route("**/api/auth/get-session", (route) =>
            route.fulfill(json(hasSession ? mockSession : null)),
        );
        await page.route("**/api/auth/sign-in/email", (route) => route.fulfill(json({twoFactorRedirect: true})));
        let verifyBody: unknown = null;
        await page.route("**/api/auth/two-factor/verify-totp", (route) => {
            verifyBody = route.request().postDataJSON();
            hasSession = true;
            return route.fulfill(json({token: "t", user: mockUser}));
        });

        await page.goto("/login");
        await page.getByLabel(/email/i).fill("test@example.com");
        await page.getByLabel(/password/i).fill("TestPassword123!");
        await page.getByRole("button", {name: /sign in/i}).click();

        await expect(page.getByText("Two-factor authentication", {exact: true})).toBeVisible();
        await page.getByLabel("Authentication code").fill("123456");
        // "Trust this device" stays unchecked: D-05 makes it opt-in.
        await page.getByRole("button", {name: "Verify", exact: true}).click();

        await expect(page).toHaveURL("/", {timeout: 10_000});
        expect(verifyBody).toEqual(expect.objectContaining({code: "123456", trustDevice: false}));
    });

    test("signs in once with an authenticator code after a signed-out visit to / (G-15-14)", async ({page}) => {
        await mockDashboardData(page);
        let hasSession = false;
        let signInCalls = 0;
        let verifyCalls = 0;
        await page.route("**/api/auth/get-session", (route) =>
            route.fulfill(json(hasSession ? mockSession : null)),
        );
        await page.route("**/api/auth/sign-in/email", (route) => {
            signInCalls += 1;
            return route.fulfill(json({twoFactorRedirect: true}));
        });
        await page.route("**/api/auth/two-factor/verify-totp", (route) => {
            verifyCalls += 1;
            hasSession = true;
            return route.fulfill(json({token: "t", user: mockUser}));
        });

        // The signed-out visit to / primes the stale signed-out session store.
        await page.goto("/");
        await expect(page).toHaveURL(/\/login$/);
        await page.getByLabel(/email/i).fill("test@example.com");
        await page.getByLabel(/password/i).fill("TestPassword123!");
        await page.getByRole("button", {name: /sign in/i}).click();

        await expect(page.getByText("Two-factor authentication", {exact: true})).toBeVisible();
        await page.getByLabel("Authentication code").fill("123456");
        await page.getByRole("button", {name: "Verify", exact: true}).click();

        await expect(page.getByRole("heading", {name: "Dashboard", level: 1})).toBeVisible({timeout: 10_000});
        await expect(page).toHaveURL("/");
        await expect(page.getByText("Sign in to Docktor")).toHaveCount(0);
        expect(signInCalls).toBe(1);
        expect(verifyCalls).toBe(1);
    });

    test("shows the rate-limit message with the wait from X-Retry-After", async ({page}) => {
        await page.route("**/api/auth/get-session", (route) => route.fulfill(json(null)));
        await page.route("**/api/auth/sign-in/email", (route) =>
            route.fulfill({
                status: 429,
                contentType: "application/json",
                headers: {"X-Retry-After": "600"},
                body: JSON.stringify({message: "Too many requests. Please try again later."}),
            }),
        );

        await page.goto("/login");
        await page.getByLabel(/email/i).fill("test@example.com");
        await page.getByLabel(/password/i).fill("TestPassword123!");
        await page.getByRole("button", {name: /sign in/i}).click();

        await expect(page.getByText("Too many attempts. Try again in 10 minutes.")).toBeVisible();
    });

    test("enrolls from the Account page", async ({page}) => {
        await mockSignedIn(page);
        const setStatus = await mockSecurityStatus(page, NOT_ENABLED);
        await mockEnrollmentEndpoints(page);

        await page.goto("/storage");
        await page.getByRole("button", {name: /E2E Tester/}).click();
        await page.getByRole("menuitem", {name: "Account"}).click();
        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByText("Not enabled", {exact: true})).toBeVisible();

        const dialog = await reachRecoveryCodesStep(page);
        await expect(dialog.getByRole("listitem")).toHaveCount(10);
        const continueButton = dialog.getByRole("button", {name: "Continue"});
        await expect(continueButton).toBeDisabled();
        await dialog.getByRole("checkbox", {name: "I have saved these recovery codes"}).check();
        await expect(continueButton).toBeEnabled();
        await continueButton.click();

        await expect(dialog.getByText("Step 3 of 3")).toBeVisible();
        await expect(dialog.getByRole("img", {name: "QR code for your authenticator app"})).toBeVisible();
        await expect(dialog.getByText(SETUP_KEY)).toBeVisible();

        setStatus(ENABLED);
        await dialog.getByLabel("Authentication code").fill("123456");
        await dialog.getByRole("button", {name: "Verify and enable"}).click();

        await expect(page.getByText("Enabled", {exact: true})).toBeVisible();
        await expect(page.getByRole("button", {name: "Regenerate recovery codes"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Set up two-factor authentication"})).toHaveCount(0);
    });

    test("forces enrollment when two-factor is required", async ({page}) => {
        await mockSignedIn(page);
        await mockSecurityStatus(page, MUST_ENROL);

        await page.goto("/");

        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByText("Two-factor authentication is required")).toBeVisible();
        await expect(page.getByText("Setup required", {exact: true})).toBeVisible();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("Step 1 of 3")).toBeVisible();

        // Leaving through the sidebar bounces straight back to /account.
        await dialog.getByRole("button", {name: "Cancel"}).click();
        await expect(dialog).toHaveCount(0);
        await page.getByRole("link", {name: "Stacks"}).first().click();
        await expect(page).toHaveURL(/\/account$/);
        // The page remounts, so the enrollment dialog opens again.
        await expect(page.getByRole("dialog").getByText("Step 1 of 3")).toBeVisible();
    });
});

test.describe("Two-factor UI (phone width backstop)", () => {
    test.skip(({isMobile}) => !isMobile, "Phone-width check; runs only in the mobile-chromium project.");

    /** UI-SPEC backstop: no horizontal scroll, and the step's primary button is reachable. */
    async function expectDialogFitsPhone(page: Page, primaryName: string) {
        const dialog = page.getByRole("dialog");
        const primary = dialog.getByRole("button", {name: primaryName});
        await primary.scrollIntoViewIfNeeded();
        await expect(primary).toBeInViewport();

        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
            .toBe(true);
        // The dialog scrolls vertically on its own; it must never scroll sideways.
        await expect
            .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
            .toBe(true);
    }

    test("enrollment steps 2 and 3 have no horizontal scroll and a reachable primary button", async ({page}) => {
        await mockSetupComplete(page);
        await mockSignedIn(page);
        await mockSecurityStatus(page, NOT_ENABLED);
        await mockEnrollmentEndpoints(page);

        await page.goto("/account");
        const dialog = await reachRecoveryCodesStep(page);
        await expectDialogFitsPhone(page, "Continue");

        await dialog.getByRole("checkbox", {name: "I have saved these recovery codes"}).check();
        await dialog.getByRole("button", {name: "Continue"}).click();
        await expect(dialog.getByText("Step 3 of 3")).toBeVisible();
        await expect(dialog.getByRole("img", {name: "QR code for your authenticator app"})).toBeVisible();
        await expectDialogFitsPhone(page, "Verify and enable");
    });
});
