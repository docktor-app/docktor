import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// D-17: phone-width (Pixel 7, 412x915 CSS px via the mobile-chromium
// Playwright project) regression coverage for every core flow. Self-
// sufficient (stubs every outbound **/api/** call this suite's pages
// trigger) and independent of desktop-viewport assumptions — this file is
// matched only by the "mobile-chromium" project (see playwright.config.ts).

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStack = {
    id: "my-app",
    displayName: "My App",
    description: "A test application",
    hostPath: "/stacks/my-app",
    status: "RUNNING",
    configChanged: false,
    configError: null,
    lastKnownHash: "abc123",
    backupSchedule: "0 3 * * *",
    isProtected: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    services: [
        {
            id: "svc-1",
            stackId: "my-app",
            serviceName: "web",
            image: "nginx",
            imageTag: "latest",
            ports: JSON.stringify([{host: 8080, container: 80}]),
            volumes: null,
            containerId: null,
            containerState: "running",
            healthStatus: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        },
    ],
    deployments: [
        {
            id: "dep-1",
            composeHash: "abc123",
            deployedAt: "2026-01-01T12:00:00Z",
            success: true,
            errorMessage: null,
        },
    ],
    statusLogs: [
        {
            id: "log-1",
            fromStatus: null,
            toStatus: "DRAFT",
            message: "Stack created",
            createdAt: "2026-01-01T00:00:00Z",
        },
    ],
};

const mockBackupConfig = {
    useGlobalSchedule: false,
    schedule: "0 2 * * *",
    useGlobalRetention: false,
    retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 6},
    preHook: "",
    postHook: "",
    globalSchedule: "0 3 * * *",
    globalRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
};

const mockBackups = [
    {
        id: "backup-1",
        stackId: "my-app",
        resticSnapshotId: "snap-123",
        trigger: "MANUAL",
        status: "COMPLETED",
        startedAt: "2026-03-19T10:00:00Z",
        completedAt: "2026-03-19T10:05:00Z",
        sizeBytes: "1024000",
        errorMessage: null,
        logLines: ["Backup completed successfully"],
        createdAt: "2026-03-19T10:00:00Z",
    },
];

const mockSnapshots = [
    {
        id: "snap-123",
        short_id: "snap-123",
        time: "2026-03-19T10:00:00Z",
        hostname: "docktor-host",
        paths: ["/stacks/my-app"],
        tags: ["my-app"],
    },
];

function makeProxyConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: "cfg-1",
        stackId: "my-app",
        serviceName: "web",
        domain: "app.example.com",
        internalPort: 80,
        tlsEnabled: true,
        certStatus: "pending",
        certMessage: null,
        certCheckedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

/**
 * Polls the documentElement's scroll/client width delta so a mid-viewport
 * overflow (e.g. a dialog animating open) doesn't produce a false negative —
 * every test calls this after its interactions settle.
 */
async function expectNoHorizontalOverflow(page: Page) {
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
        )
        .toBeLessThanOrEqual(0);
}

/** Mock authenticated session for every test. */
async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

async function mockStacksList(page: Page, stacks: unknown[] = [mockStack]) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(stacks)});
        }
        return route.continue();
    });
}

async function mockBackupDefaults(page: Page) {
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                defaultSchedule: "0 3 * * *",
                defaultRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
            }),
        }),
    );
}

/** Full stub surface for every "/stacks/my-app*" page — every tab's fetches fire unconditionally on mount. */
async function mockStackDetailSurface(page: Page) {
    await page.route("**/api/stacks/my-app", (route) => {
        const url = route.request().url();
        if (url.endsWith("/compose") || url.endsWith("/env")) return route.continue();
        if (route.request().method() === "PUT") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)});
        }
        return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)});
    });
    await page.route("**/api/stacks/my-app/compose", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({content: "services:\n  web:\n    image: nginx:latest"}),
        }),
    );
    await page.route("**/api/stacks/my-app/env", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: "FOO=bar"})}),
    );
    await page.route("**/api/stacks/my-app/events", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
    await page.route("**/api/stacks/my-app/logs**", (route) =>
        route.fulfill({status: 200, contentType: "text/event-stream", body: ""}),
    );
    await page.route("**/api/stacks/my-app/volume-warnings", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({warnings: []})}),
    );
    await page.route("**/api/stacks/my-app/backup-config", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockBackupConfig)});
        }
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({...mockBackupConfig, ...JSON.parse(route.request().postData() || "{}")}),
        });
    });
    await page.route("**/api/stacks/my-app/backup", (route) => {
        if (route.request().method() === "POST") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({backupId: "backup-1"})});
        }
        return route.continue();
    });
    await page.route("**/api/stacks/my-app/backups", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockBackups)}),
    );
    await page.route("**/api/backups/backup-1", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockBackups[0])}),
    );
    await page.route("**/api/stacks/my-app/snapshots", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSnapshots)}),
    );
    await page.route("**/api/stacks/my-app/proxy-configs", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([makeProxyConfig()])}),
    );
    await page.route("**/api/settings/proxy", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({deployed: true, status: "RUNNING", acmeEmail: "", showInDashboard: false}),
            });
        }
        return route.continue();
    });
    await page.route("**/api/certificates", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
    await page.route("**/api/stacks/my-app/deploy", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)}),
    );
}

/**
 * Replace a CodeMirror-backed editor's full content (matches stacks.spec.ts's
 * replaceCodeEditorContent — `.fill()` doesn't work on CodeMirror's
 * contenteditable root, `.type()`'s per-keystroke Enter trips YAML
 * auto-indent).
 */
async function replaceCodeEditorContent(page: Page, name: RegExp | string, text: string) {
    const editor = page.getByRole("textbox", {name});
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);
}

test.describe("Mobile (D-17, 390-412px viewport)", () => {
    test.beforeEach(async ({page}) => {
        await mockAuthenticated(page);
    });

    test("dashboard: stat cards, recent stacks and the theme toggle are visible with no page overflow", async ({
        page,
    }) => {
        await mockStacksList(page);
        await mockBackupDefaults(page);

        await page.goto("/");

        await expect(page.getByRole("heading", {name: "Dashboard"})).toBeVisible();
        await expect(page.locator('[data-slot="stat-card"]')).toHaveCount(6);
        await expect(page.getByText("My App")).toBeVisible();
        await expect(page.getByRole("button", {name: "Toggle theme"})).toBeVisible();

        await expectNoHorizontalOverflow(page);
    });

    test("sidebar: the trigger opens the mobile navigation and Stacks navigates", async ({page}) => {
        await mockStacksList(page);
        await mockBackupDefaults(page);

        await page.goto("/");
        await expectNoHorizontalOverflow(page);

        await page.getByRole("button", {name: "Toggle Sidebar"}).click();
        const nav = page.getByRole("dialog");
        await expect(nav.getByRole("link", {name: "Stacks"})).toBeVisible();
        await expectNoHorizontalOverflow(page);

        await nav.getByRole("link", {name: "Stacks"}).click();
        await expect(page).toHaveURL("/stacks");
        await expectNoHorizontalOverflow(page);
    });

    test("stacks list page shows all stacks with no page overflow", async ({page}) => {
        await mockStacksList(page);

        await page.goto("/stacks");

        await expect(page.getByRole("heading", {name: "Stacks"})).toBeVisible();
        await expect(page.getByText("My App")).toBeVisible();
        await expectNoHorizontalOverflow(page);
    });

    test("setup wizard: the six-step stepper scrolls horizontally instead of widening the page (D-17 fix)", async ({
        page,
    }) => {
        await page.route("**/api/setup/status", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({setupComplete: false})}),
        );
        await page.route("**/api/auth/get-session", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(null)}),
        );

        await page.goto("/setup");

        await expect(page.getByText("Create Admin Account")).toBeVisible();
        await expect(page.getByRole("button", {name: /step 6: proxy/i})).toBeVisible();
        await expectNoHorizontalOverflow(page);
    });

    test("stack detail Overview: tabs reachable, Deploy clickable, status badge visible, timeline filter works", async ({
        page,
    }) => {
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app");
        await expectNoHorizontalOverflow(page);

        // Deploy button is present and enabled at phone width.
        const deployButton = page.getByRole("button", {name: /deploy/i});
        await expect(deployButton).toBeVisible();
        await expect(deployButton).toBeEnabled();

        // Status badge (header) visible.
        await expect(page.getByText("Running", {exact: true}).first()).toBeVisible();

        // Timeline filter changes to "Deployments".
        await page.getByRole("combobox", {name: "Filter activity by type"}).click();
        await page.getByRole("option", {name: "Deployments"}).click();
        await expect(page.getByRole("combobox", {name: "Filter activity by type"})).toHaveText("Deployments");
        await expectNoHorizontalOverflow(page);

        // All five tabs reachable — scroll the horizontally-scrolling tab list
        // container and click each one.
        const tabNames = ["Overview", "Config", "Logs", "Backups", "Proxy"] as const;
        for (const name of tabNames) {
            const tab = page.getByRole("tab", {name});
            await tab.scrollIntoViewIfNeeded();
            await tab.click();
            await expect(tab).toHaveAttribute("aria-selected", "true");
            await expectNoHorizontalOverflow(page);
        }
    });

    test("Config tab: edit and save the compose file, add and save an env variable", async ({page}) => {
        await mockStackDetailSurface(page);
        let composePutBody: unknown = null;
        let envPutBody: unknown = null;
        await page.route("**/api/stacks/my-app", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env")) return route.continue();
            if (route.request().method() === "PUT") {
                const body = route.request().postDataJSON() as Record<string, unknown>;
                if ("composeContent" in body) composePutBody = body;
                if ("envContent" in body) envPutBody = body;
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)});
        });

        // Issue #18: saves preview first; no confirmation required, so the save applies directly.
        await page.route("**/api/stacks/my-app/preview", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({hasChanges: true, confirmationRequired: false, compose: null, env: null}),
            }),
        );
        await page.goto("/stacks/my-app/config");

        await expect(page.getByRole("heading", {name: "Compose File"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Environment Variables"})).toBeVisible();
        await expectNoHorizontalOverflow(page);

        await replaceCodeEditorContent(page, "Docker Compose File", "services:\n  web:\n    image: nginx:1.27\n");
        await page.getByRole("button", {name: "Save compose file"}).click();
        await expect.poll(() => composePutBody).toEqual(
            expect.objectContaining({composeContent: "services:\n  web:\n    image: nginx:1.27\n"}),
        );

        await page.getByRole("button", {name: "Add Variable"}).click();
        await page.getByRole("textbox", {name: "Variable name 2"}).fill("PORT");
        await page.getByLabel("Value for PORT", {exact: true}).fill("8080");
        await page.getByRole("button", {name: "Save environment variables"}).click();
        await expect.poll(() => envPutBody).toEqual(expect.objectContaining({envContent: "FOO=bar\nPORT=8080"}));

        await expectNoHorizontalOverflow(page);
    });

    test("Logs tab: service select and the terminal are visible", async ({page}) => {
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app/logs");

        await expect(page.getByRole("combobox", {name: "Select service"})).toBeVisible();
        await expect(page.getByTestId("log-viewer-terminal")).toBeVisible();
        await expectNoHorizontalOverflow(page);
    });

    test("Backups tab: Edit Schedule dialog fits the viewport; Backup Now is visible", async ({page}) => {
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app/backups");

        const backupNowButton = page.getByRole("button", {name: "Backup Now"});
        await expect(backupNowButton).toBeVisible();
        await expectNoHorizontalOverflow(page);

        await page.getByRole("button", {name: "Edit Schedule"}).click();
        const dialog = page.getByRole("dialog", {name: "Edit Backup Schedule"});
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        const viewport = page.viewportSize();
        expect(viewport).not.toBeNull();
        if (box && viewport) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        await expectNoHorizontalOverflow(page);
    });

    test("Proxy tab: Assign Domain dialog fits the viewport", async ({page}) => {
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app/proxy");

        await expect(page.getByText("app.example.com")).toBeVisible();
        await expectNoHorizontalOverflow(page);

        await page.getByRole("button", {name: "Assign Domain"}).click();
        const dialog = page.getByRole("dialog", {name: "Assign Domain"});
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        const viewport = page.viewportSize();
        expect(viewport).not.toBeNull();
        if (box && viewport) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        await expectNoHorizontalOverflow(page);
    });

    test("backup detail page: metadata and output are visible", async ({page}) => {
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app/backups/backup-1");

        await expect(page.getByRole("heading", {name: /Backup #/})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Output"})).toBeVisible();
        await expectNoHorizontalOverflow(page);
    });

    test("settings: each of the four tabs is reachable", async ({page}) => {
        await page.route("**/api/settings/general", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({instanceName: "Docktor", baseUrl: "", timezone: "UTC"}),
            }),
        );
        await page.route("**/api/settings/smtp", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    host: "",
                    port: 587,
                    encryption: "starttls",
                    username: "",
                    hasPassword: false,
                    from: "",
                }),
            }),
        );
        await page.route("**/api/settings/notification-triggers", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    stackError: true,
                    diskWarning: true,
                    diskThresholdPercent: 90,
                    diskThresholdBytes: 0,
                    backupFailure: true,
                }),
            }),
        );
        await page.route("**/api/notifications", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
        );
        await page.route("**/api/settings/backup", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    repoType: "local",
                    repoPath: null,
                    sftpHost: null,
                    sftpUser: null,
                    s3Endpoint: null,
                    s3Bucket: null,
                    s3AccessKey: null,
                    hasPassword: true,
                    hasSftpKey: false,
                    hasS3SecretKey: false,
                }),
            }),
        );
        await page.route("**/api/settings/backup/status", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({available: true, version: "0.17.0"})}),
        );
        await mockBackupDefaults(page);
        await page.route("**/api/settings/proxy", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({deployed: false, status: null, acmeEmail: "", showInDashboard: false}),
            }),
        );
        await page.route("**/api/certificates", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
        );

        await page.goto("/settings");
        await expectNoHorizontalOverflow(page);

        const tabNames = ["General", "Notifications", "Backup", "Proxy"] as const;
        for (const name of tabNames) {
            const tab = page.getByRole("tab", {name});
            await tab.scrollIntoViewIfNeeded();
            await tab.click();
            await expect(tab).toHaveAttribute("aria-selected", "true");
            await expectNoHorizontalOverflow(page);
        }
    });

    test("create stack: compose editor and env editor are usable, Create Stack is visible", async ({page}) => {
        await page.goto("/stacks/create");

        await expect(page.getByRole("heading", {name: "Create Stack"})).toBeVisible();
        await expect(page.getByRole("button", {name: /create stack/i})).toBeVisible();
        await expectNoHorizontalOverflow(page);

        await page.getByLabel(/name/i).fill("New Stack");
        await replaceCodeEditorContent(page, /docker compose file/i, "services:\n  web:\n    image: nginx");

        await page.getByRole("button", {name: "Add Variable"}).click();
        await page.getByRole("textbox", {name: "Variable name 1"}).fill("PORT");
        await page.getByLabel("Value for PORT", {exact: true}).fill("8080");

        await expectNoHorizontalOverflow(page);
    });
});
