import {test, expect} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "admin", email: "admin@example.com"};
const mockAuthSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const greenStack = {
    path: "/home/user/app/docker-compose.yml",
    directory: "/home/user/app",
    compatibility: "green" as const,
    serviceCount: 1,
    namedVolumes: [] as string[],
    absolutePaths: [] as string[],
    relativePaths: [] as string[],
    inlineEnvVars: false,
    unsupportedFeatures: [] as string[],
    managedStack: null,
};

const yellowStack = {
    path: "/home/user/db/docker-compose.yml",
    directory: "/home/user/db",
    compatibility: "yellow" as const,
    serviceCount: 1,
    namedVolumes: ["pgdata"],
    absolutePaths: [] as string[],
    relativePaths: [] as string[],
    inlineEnvVars: false,
    unsupportedFeatures: [] as string[],
    managedStack: null,
};

const redStack = {
    path: "/home/user/legacy/docker-compose.yml",
    directory: "/home/user/legacy",
    compatibility: "red" as const,
    serviceCount: 1,
    namedVolumes: [] as string[],
    absolutePaths: [] as string[],
    relativePaths: [] as string[],
    inlineEnvVars: false,
    unsupportedFeatures: ["configs"],
    managedStack: null,
};

/** GET /api/setup/status — no admin user exists yet, wizard should render. */
async function mockSetupIncomplete(page: Page) {
    await page.route("**/api/setup/status", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({setupComplete: false})}),
    );
}

/** GET /api/setup/status — setup already finished. */
async function mockSetupComplete(page: Page) {
    await page.route("**/api/setup/status", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({setupComplete: true})}),
    );
}

/** Mock the session endpoint to return no active session (unauthenticated). */
async function mockNoSession(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(null)}),
    );
}

/**
 * Mock the dashboard's GET /api/settings/backup-defaults call
 * (useBackupDefaults, D-14) — any test that lands on "/" must stub it, or
 * the fixtures.ts unstubbed-API guard fails the test.
 */
async function mockBackupDefaults(page: Page) {
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({defaultSchedule: null, defaultRetention: null}),
        }),
    );
}

/**
 * POST /api/setup/step1 + the better-auth sign-in call triggered by auto-login, plus the
 * GET /api/auth/get-session the auto-login now awaits to refresh the session store (G-15-14).
 * Returns a getter for the number of get-session requests seen so far.
 */
async function mockStep1(page: Page): Promise<() => number> {
    let getSessionRequests = 0;
    await page.route("**/api/auth/get-session", (route) => {
        getSessionRequests += 1;
        return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockAuthSession)});
    });
    await page.route("**/api/setup/step1", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({user: mockUser, sessionToken: "tok-1"}),
        }),
    );
    await page.route("**/api/auth/sign-in/email", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockAuthSession)}),
    );
    return () => getSessionRequests;
}

async function mockStep2(page: Page) {
    await page.route("**/api/setup/step2", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true})}),
    );
}

/** Drives the wizard from a fresh /setup load through account + instance steps. */
async function completeAccountAndSettingsSteps(page: Page) {
    await mockSetupIncomplete(page);
    await mockStep1(page);
    await mockStep2(page);

    await page.goto("/setup");

    await page.getByLabel(/email/i).fill("admin@example.com");
    await page.getByLabel(/^password$/i).fill("password123");
    await page.getByRole("button", {name: "Next"}).click();
    await expect(page.getByRole("button", {name: /step 2: settings/i})).toHaveAttribute("aria-current", "step");

    // Instance name/timezone come pre-filled with sensible defaults — submit as-is.
    await page.getByRole("button", {name: "Next"}).click();
    await expect(page.getByRole("button", {name: /step 3: backup/i})).toHaveAttribute("aria-current", "step");
}

/** Continues from step 3 (Backup) through step 4 (Notifications) by skipping both. */
async function skipToBrownfieldStep(page: Page) {
    await page.getByRole("button", {name: "Skip"}).click(); // step 3 -> 4
    await expect(page.getByRole("button", {name: /step 4: notifications/i})).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", {name: "Skip"}).click(); // step 4 -> 5
    await expect(page.getByRole("button", {name: /step 5: import/i})).toHaveAttribute("aria-current", "step");
}

async function reachBrownfieldStep(page: Page) {
    await completeAccountAndSettingsSteps(page);
    await skipToBrownfieldStep(page);
}

/** Continues from step 5 (Import) to step 6 (Proxy) — Import is no longer terminal. */
async function reachProxyStep(page: Page) {
    await reachBrownfieldStep(page);
    await page.getByRole("button", {name: "Next"}).click(); // step 5 -> 6
    await expect(page.getByRole("button", {name: /step 6: proxy/i})).toHaveAttribute("aria-current", "step");
}

test.describe("Setup Wizard", () => {
    test.describe("First-run wizard flow", () => {
        // WIZ-01: first boot lands on the wizard, not the login form.
        test("should redirect to /setup when no users exist", async ({page}) => {
            await mockNoSession(page);
            await mockSetupIncomplete(page);
            await page.goto("/");

            await expect(page).toHaveURL(/\/setup$/);
            await expect(page.getByRole("button", {name: /step 1: account/i})).toHaveAttribute("aria-current", "step");
        });

        test("should redirect /login to /setup when no users exist", async ({page}) => {
            await mockNoSession(page);
            await mockSetupIncomplete(page);
            await page.goto("/login");

            await expect(page).toHaveURL(/\/setup$/);
        });

        // CR-01: /signup must be gated the same way / and /login are, so a
        // zero-user instance can't be claimed via the generic sign-up form.
        test("should redirect /signup to /setup when no users exist", async ({page}) => {
            await mockNoSession(page);
            await mockSetupIncomplete(page);
            await page.goto("/signup");

            await expect(page).toHaveURL(/\/setup$/);
        });

        test("should keep /login on an instance that already has users", async ({page}) => {
            await mockNoSession(page);
            await mockSetupComplete(page);
            await page.goto("/login");

            await expect(page.getByRole("button", {name: /sign in/i})).toBeVisible();
            await expect(page).toHaveURL(/\/login$/);
        });

        test("should show 6-step stepper with Account as first step and Proxy as sixth", async ({page}) => {
            // WIZ-07 / D-10: Wizard UI, Proxy appended as the new terminal step
            await mockSetupIncomplete(page);
            await page.goto("/setup");

            await expect(page.getByRole("button", {name: /step 1: account/i})).toHaveAttribute("aria-current", "step");
            await expect(page.getByRole("button", {name: /step 2: settings/i})).toBeVisible();
            await expect(page.getByRole("button", {name: /step 3: backup/i})).toBeVisible();
            await expect(page.getByRole("button", {name: /step 4: notifications/i})).toBeVisible();
            await expect(page.getByRole("button", {name: /step 5: import/i})).toBeVisible();
            await expect(page.getByRole("button", {name: /step 6: proxy/i})).toBeVisible();
        });

        test("should create admin account and auto-login on step 1 submit", async ({page}) => {
            // WIZ-02: Account creation
            await mockSetupIncomplete(page);
            const getSessionRequests = await mockStep1(page);
            await page.goto("/setup");

            await page.getByLabel(/email/i).fill("admin@example.com");
            await page.getByLabel(/^password$/i).fill("password123");
            await page.getByRole("button", {name: "Next"}).click();

            await expect(page.getByRole("button", {name: /step 2: settings/i})).toHaveAttribute("aria-current", "step");
            expect(getSessionRequests()).toBeGreaterThan(0);
            await expect(page.getByText("Account created successfully")).toBeVisible();
        });

        test("should save instance settings on step 2 submit", async ({page}) => {
            // WIZ-03: Instance settings
            await mockSetupIncomplete(page);
            await mockStep1(page);
            await mockStep2(page);
            await page.goto("/setup");

            await page.getByLabel(/email/i).fill("admin@example.com");
            await page.getByLabel(/^password$/i).fill("password123");
            await page.getByRole("button", {name: "Next"}).click();
            await expect(page.getByRole("button", {name: /step 2: settings/i})).toHaveAttribute("aria-current", "step");

            await page.getByRole("button", {name: "Next"}).click();

            await expect(page.getByRole("button", {name: /step 3: backup/i})).toHaveAttribute("aria-current", "step");
            await expect(page.getByText("Settings saved")).toBeVisible();
        });

        test("should allow skipping optional steps 3-5", async ({page}) => {
            // WIZ-04, WIZ-05, WIZ-06: Optional steps
            await completeAccountAndSettingsSteps(page);
            await skipToBrownfieldStep(page);

            await expect(page.getByText("Import Existing Stacks")).toBeVisible();
        });

        test("should advance from Import to the Proxy step instead of finishing (D-10)", async ({page}) => {
            // Import (step 5) is no longer the wizard's terminal step — Proxy
            // (step 6) is, per D-10.
            await reachBrownfieldStep(page);

            await page.getByRole("button", {name: "Next"}).click();

            await expect(page.getByRole("button", {name: /step 6: proxy/i})).toHaveAttribute("aria-current", "step");
            await expect(page.getByRole("button", {name: "Deploy Proxy Stack"})).toBeVisible();
        });

        test("should skip the proxy step and reach the dashboard with nothing deployed", async ({page}) => {
            // PRXY-02: skipping the terminal step deploys nothing and still
            // completes the wizard.
            await reachProxyStep(page);

            await page.route("**/api/setup/complete", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true})}),
            );

            // Dashboard requires an authenticated session once navigated to.
            await page.route("**/api/auth/get-session", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockAuthSession)}),
            );
            await page.route("**/api/stacks", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
            );
            await mockBackupDefaults(page);

            await page.getByRole("button", {name: "Skip"}).click();
            await expect(page).toHaveURL("/");
        });

        test("should submit the proxy step and reach the dashboard after deploying", async ({page}) => {
            // D-09/D-10: submitting (with or without an ACME email) deploys the
            // proxy stack and finishes the wizard.
            await reachProxyStep(page);

            await page.route("**/api/setup/step6", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true})}),
            );
            await page.route("**/api/setup/complete", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true})}),
            );
            await page.route("**/api/auth/get-session", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockAuthSession)}),
            );
            await page.route("**/api/stacks", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
            );
            await mockBackupDefaults(page);

            await page.getByRole("button", {name: "Deploy Proxy Stack"}).click();
            await expect(page).toHaveURL("/");
        });

        test("should keep the user on the proxy step and show the raw error on a failed deploy (D-11)", async ({page}) => {
            await reachProxyStep(page);

            await page.route("**/api/setup/step6", (route) =>
                route.fulfill({
                    status: 409,
                    contentType: "application/json",
                    body: JSON.stringify({
                        error: 'Host port 80 is already published by container "web-1". Free the port and try again.',
                    }),
                }),
            );

            await page.getByRole("button", {name: "Deploy Proxy Stack"}).click();

            await expect(page.getByText(/could not deploy the proxy stack — ports 80\/443 are already in use/i)).toBeVisible();
            await expect(page.getByText(/host port 80 is already published by container "web-1"/i)).toBeVisible();
            await expect(page.getByRole("button", {name: /step 6: proxy/i})).toHaveAttribute("aria-current", "step");
        });

        test("should show 'Setup Complete' if visiting /setup after completion", async ({page}) => {
            // WIZ-07: Re-visit prevention
            await mockSetupComplete(page);
            await page.goto("/setup");

            await expect(page.getByText("Setup has already been completed.")).toBeVisible();
            await expect(page.getByRole("link", {name: /go to dashboard/i})).toBeVisible();
        });
    });

    test.describe("Brownfield scan flow", () => {
        test("should scan directories and display discovered stacks", async ({page}) => {
            // BF-01: Scan filesystem
            await reachBrownfieldStep(page);

            await page.route("**/api/setup/scan", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({stacks: [greenStack], skippedDirectories: 0}),
                }),
            );

            await page.getByLabel(/directories to scan/i).fill("/home/user");
            await page.getByRole("button", {name: /scan/i}).click();

            await expect(page.getByText("Discovered Stacks (1)")).toBeVisible();
            await expect(page.getByText(greenStack.directory)).toBeVisible();
        });

        test("should display compatibility badges (green/yellow/red)", async ({page}) => {
            // BF-02: Compatibility assessment
            await reachBrownfieldStep(page);

            await page.route("**/api/setup/scan", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({stacks: [greenStack, yellowStack, redStack], skippedDirectories: 0}),
                }),
            );

            await page.getByLabel(/directories to scan/i).fill("/home/user");
            await page.getByRole("button", {name: /scan/i}).click();

            await expect(page.getByText("Ready")).toBeVisible();
            await expect(page.getByText("Migration Recommended")).toBeVisible();
            await expect(page.getByText("Unsupported")).toBeVisible();
        });

        test("should show skipped directories count when permission errors occur", async ({page}) => {
            // BF-01: Permission handling
            await reachBrownfieldStep(page);

            await page.route("**/api/setup/scan", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({stacks: [greenStack], skippedDirectories: 2}),
                }),
            );

            await page.getByLabel(/directories to scan/i).fill("/home/user, /root");
            await page.getByRole("button", {name: /scan/i}).click();

            await expect(page.getByText(/2 directories skipped \(permission denied\)/i)).toBeVisible();
        });
    });

    test.describe("Adopt in-place flow", () => {
        async function scanForGreenStack(page: Page) {
            await reachBrownfieldStep(page);
            await page.route("**/api/setup/scan", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({stacks: [greenStack], skippedDirectories: 0}),
                }),
            );
            await page.getByLabel(/directories to scan/i).fill("/home/user");
            await page.getByRole("button", {name: /scan/i}).click();
            await expect(page.getByText("Discovered Stacks (1)")).toBeVisible();
        }

        test("should adopt green stack with zero downtime", async ({page}) => {
            // BF-03: Adopt in-place
            await scanForGreenStack(page);

            await page.route("**/api/setup/adopt", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({id: "app"})}),
            );

            await page.getByRole("button", {name: "Adopt"}).click();

            await expect(page.getByText(/adopted successfully/i)).toBeVisible();
            await expect(page.getByText("Imported")).toBeVisible();
        });

        test("should navigate to the adopted stack via the success toast action", async ({page}) => {
            // BF-03: Post-adopt navigation (the shipped UI links to the stack
            // detail page directly via the toast action, not the dashboard list —
            // adapted from the original "post-adopt dashboard" description)
            await scanForGreenStack(page);

            await page.route("**/api/setup/adopt", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({id: "app"})}),
            );

            // Navigating to the adopted stack's detail page renders the full
            // stack detail view — stub what it fetches.
            await page.route("**/api/auth/get-session", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockAuthSession)}),
            );
            await page.route("**/api/stacks/app", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        id: "app",
                        displayName: "app",
                        description: null,
                        hostPath: greenStack.directory,
                        status: "RUNNING",
                        configChanged: false,
                        lastKnownHash: "abc123",
                        createdAt: "2026-01-01T00:00:00Z",
                        updatedAt: "2026-01-01T00:00:00Z",
                        services: [],
                        deployments: [],
                        statusLogs: [],
                    }),
                }),
            );
            await page.route("**/api/stacks/app/compose", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: "services:"})}),
            );
            await page.route("**/api/stacks/app/env", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
            );
            await page.route("**/api/stacks/app/events", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
            );

            await page.getByRole("button", {name: "Adopt"}).click();
            await page.getByRole("button", {name: /view stack/i}).click();

            await expect(page).toHaveURL(/\/stacks\/app/);
        });
    });

    test.describe("Migration wizard flow", () => {
        const emptyPreview = {diff: {hunks: [], added: 0, removed: 0}, extractedEnv: ""};
        const diffPreview = {
            diff: {
                added: 1,
                removed: 1,
                hunks: [
                    {
                        oldStart: 1,
                        oldLines: 3,
                        newStart: 1,
                        newLines: 3,
                        lines: [
                            {kind: "context", text: "services:", oldLine: 1, newLine: 1},
                            {kind: "removed", text: "      - pgdata:/var/lib/postgresql/data", oldLine: 2, newLine: null},
                            {kind: "added", text: "      - ./volumes/pgdata:/var/lib/postgresql/data", oldLine: null, newLine: 2},
                        ],
                    },
                ],
            },
            extractedEnv: "",
        };

        async function scanForYellowStack(page: Page, stack: typeof yellowStack = yellowStack) {
            await reachBrownfieldStep(page);
            await page.route("**/api/setup/scan", (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({stacks: [stack], skippedDirectories: 0}),
                }),
            );
            await page.getByLabel(/directories to scan/i).fill("/home/user");
            await page.getByRole("button", {name: /scan/i}).click();
            await expect(page.getByText("Discovered Stacks (1)")).toBeVisible();
        }

        async function mockPreview(page: Page, body: unknown = emptyPreview) {
            await page.route("**/api/setup/migrate/preview", (route) =>
                route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)}),
            );
        }

        /** Mocks POST /api/setup/migrate and records the JSON bodies it receives. */
        async function mockMigrate(page: Page, response: unknown): Promise<unknown[]> {
            const bodies: unknown[] = [];
            await page.route("**/api/setup/migrate", (route) => {
                bodies.push(route.request().postDataJSON());
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(response)});
            });
            return bodies;
        }

        const migrateOk = {success: true, stackId: "db", originalPath: yellowStack.directory};

        /** From the scan result: open the dialog and step through to step 4. */
        async function openAndWalkToStep4(page: Page) {
            await page.getByRole("button", {name: "Migrate"}).click();
            await page.getByRole("button", {name: "Preview Changes"}).click();
            await expect(page.getByRole("heading", {name: "Review Changes"})).toBeVisible();
            await page.getByRole("button", {name: "Choose Backup"}).click();
            await expect(page.getByRole("heading", {name: "Back Up Before Migrating"})).toBeVisible();
            await page.getByRole("button", {name: "Choose Old Stack Action"}).click();
            await expect(page.getByRole("heading", {name: "Old Stack"})).toBeVisible();
        }

        test("should open migration wizard when clicking Migrate button", async ({page}) => {
            // BF-04: Migration wizard entry
            await scanForYellowStack(page);

            await page.getByRole("button", {name: "Migrate"}).click();

            await expect(page.getByRole("dialog")).toBeVisible();
            await expect(page.getByRole("heading", {name: "Select Data to Migrate"})).toBeVisible();
            await expect(page.getByText("Step 1 of 4")).toBeVisible();
        });

        test("should display volume selection checkboxes in step 1", async ({page}) => {
            // BF-04: Volume selection
            await scanForYellowStack(page);
            await page.getByRole("button", {name: "Migrate"}).click();

            await expect(page.getByRole("checkbox", {name: "pgdata"})).toBeChecked();
        });

        test("should show diff preview in step 2", async ({page}) => {
            // BF-04: Diff preview
            await scanForYellowStack(page);
            await page.getByRole("button", {name: "Migrate"}).click();
            await mockPreview(page, diffPreview);

            await page.getByRole("button", {name: "Preview Changes"}).click();

            await expect(page.getByRole("heading", {name: "Review Changes"})).toBeVisible();
            await expect(page.getByRole("region", {name: "Migration compose diff"})).toBeVisible();
            await expect(page.getByText("./volumes/pgdata")).toBeVisible();
            await expect(page.getByText("Compose file changes")).toBeVisible();
        });

        test("should start background migration on confirm", async ({page}) => {
            // BF-04: Background migration; MIG-03/MIG-04 default-on choices are sent
            await scanForYellowStack(page);
            await mockPreview(page);
            const bodies = await mockMigrate(page, migrateOk);
            await openAndWalkToStep4(page);

            await page.getByRole("button", {name: "Confirm & Migrate"}).click();

            await expect(page.getByText(/migrating db/i)).toBeVisible();
            await expect.poll(() => bodies.length).toBe(1);
            expect(bodies[0]).toMatchObject({
                composePath: yellowStack.path,
                displayName: "db",
                namedVolumeSelections: {pgdata: true},
                backup: true,
                stopOldStack: true,
            });
        });

        test("should send backup and stopOldStack as false when both switches are turned off", async ({page}) => {
            // MIG-03 / MIG-04: the user's opt-outs reach the server and the summary recaps them
            await scanForYellowStack(page);
            await mockPreview(page);
            const bodies = await mockMigrate(page, migrateOk);
            await page.getByRole("button", {name: "Migrate"}).click();
            await page.getByRole("button", {name: "Preview Changes"}).click();
            await page.getByRole("button", {name: "Choose Backup"}).click();
            await page.getByRole("switch", {name: "Back up the old stack first"}).click();
            await expect(page.getByText(/No backup will be created\./)).toBeVisible();
            await page.getByRole("button", {name: "Choose Old Stack Action"}).click();
            await page.getByRole("switch", {name: "Stop the old stack before migrating"}).click();
            await expect(page.getByText(/The old stack keeps running\./)).toBeVisible();

            const summary = page.getByRole("region", {name: "Migration summary"});
            await expect(summary).toContainText("Backup: No");
            await expect(summary).toContainText("Stop old stack: No");

            await page.getByRole("button", {name: "Confirm & Migrate"}).click();

            await expect.poll(() => bodies.length).toBe(1);
            expect(bodies[0]).toMatchObject({backup: false, stopOldStack: false});
        });

        test("should offer a relative bind mount, send it as ./volumes/ and warn when it is kept", async ({page}) => {
            // G-18-4: relative bind mounts are listed, counted, sent, and a kept one warns
            const memosStack = {...yellowStack, namedVolumes: [] as string[], relativePaths: ["./data"]};
            await scanForYellowStack(page, memosStack);
            const previewBodies: unknown[] = [];
            await page.route("**/api/setup/migrate/preview", (route) => {
                previewBodies.push(route.request().postDataJSON());
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(emptyPreview)});
            });
            await page.getByRole("button", {name: "Migrate"}).click();

            await expect(page.getByText("Relative Bind Mounts")).toBeVisible();
            await expect(page.getByRole("checkbox", {name: "./data"})).toBeChecked();

            await page.getByRole("button", {name: "Preview Changes"}).click();
            await expect(page.getByRole("heading", {name: "Review Changes"})).toBeVisible();
            expect(previewBodies[0]).toMatchObject({
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            });

            await page.getByRole("button", {name: "Choose Backup"}).click();
            await page.getByRole("button", {name: "Choose Old Stack Action"}).click();
            await expect(page.getByRole("region", {name: "Migration summary"})).toContainText("Volumes to copy: 1");

            await page.getByRole("button", {name: "Back"}).click();
            await page.getByRole("button", {name: "Back"}).click();
            await page.getByRole("button", {name: "Back"}).click();
            await page.getByRole("checkbox", {name: "./data"}).click();
            await expect(page.getByText(/outside Docktor's managed \.\/volumes\/ layout/)).toBeVisible();
        });

        test("should show success toast with link to stack on completion", async ({page}) => {
            // BF-04: Migration feedback
            await scanForYellowStack(page);
            await mockPreview(page);
            await mockMigrate(page, migrateOk);
            await openAndWalkToStep4(page);

            await page.getByRole("button", {name: "Confirm & Migrate"}).click();

            await expect(page.getByText(/migration complete/i)).toBeVisible();
            await expect(page.getByText(/backup saved to pre-migration-backup/i)).toBeVisible();
            await expect(page.getByRole("button", {name: /view stack/i})).toBeVisible();
        });

        test("should show error toast on migration failure", async ({page}) => {
            // BF-05: Rollback on failure — the service performs the rollback
            // server-side and reports it in `result.error`; the client surfaces
            // that message via a toast rather than a separate "Rollback complete"
            // element (adapted to the actual MigrationResult contract).
            await scanForYellowStack(page);
            await mockPreview(page);
            await mockMigrate(page, {
                success: false,
                error: "Migration failed: disk full. Your original stack directory was not modified. The old stack was restarted.",
                originalPath: yellowStack.directory,
            });
            await openAndWalkToStep4(page);

            await page.getByRole("button", {name: "Confirm & Migrate"}).click();

            await expect(page.getByText(/old stack was restarted/i)).toBeVisible();
        });

        test("should fit a 360px viewport with the diff and the final action reachable", async ({page}) => {
            // MIG-01 / D-06: the dialog is usable at phone width
            await page.setViewportSize({width: 360, height: 740});
            await scanForYellowStack(page);
            await mockPreview(page, diffPreview);
            await page.getByRole("button", {name: "Migrate"}).click();
            await page.getByRole("button", {name: "Preview Changes"}).click();

            await expect(page.getByRole("heading", {name: "Review Changes"})).toBeVisible();
            await expect(page.getByRole("region", {name: "Migration compose diff"})).toBeVisible();
            const box = await page.getByRole("dialog").boundingBox();
            if (!box) throw new Error("dialog has no bounding box");
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(360);

            await page.getByRole("button", {name: "Choose Backup"}).click();
            await page.getByRole("button", {name: "Choose Old Stack Action"}).click();
            await expect(page.getByRole("button", {name: "Confirm & Migrate"})).toBeInViewport();
        });
    });
});
