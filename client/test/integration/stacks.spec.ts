import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStacks = [
    {
        id: "my-app",
        displayName: "My App",
        description: "A test application",
        hostPath: "/stacks/my-app",
        status: "RUNNING",
        configChanged: false,
        lastKnownHash: "abc123",
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
                containerState: null,
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
            },
        ],
    },
    {
        id: "db-stack",
        displayName: "Database Stack",
        description: null,
        hostPath: "/stacks/db-stack",
        status: "STOPPED",
        configChanged: false,
        lastKnownHash: "def456",
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        services: [],
    },
];

const mockStackDetail = {
    ...mockStacks[0],
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
        {
            id: "log-2",
            fromStatus: "DRAFT",
            toStatus: "RUNNING",
            message: "Deployment started",
            createdAt: "2026-01-01T12:00:00Z",
        },
    ],
};

/** Mock authenticated session for all tests. */
async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

/** Mock the stacks list API. */
async function mockStacksList(page: Page, stacks = mockStacks) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(stacks)});
        }
        return route.continue();
    });
}

/**
 * Mock the dashboard's GET /api/settings/backup-defaults call (useBackupDefaults,
 * D-14) — every dashboard-rendering test must stub it, or the fixtures.ts
 * unstubbed-API guard fails the test.
 */
async function mockBackupDefaults(page: Page, defaultSchedule: string | null = null) {
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({defaultSchedule, defaultRetention: null}),
        }),
    );
}

/**
 * Mock the stack detail page's Overview > Event Log card
 * (GET /api/stacks/:id/events, via useStackEvents). Every test that renders
 * a stack detail page triggers this call.
 */
async function mockStackEvents(page: Page, stackId: string) {
    await page.route(`**/api/stacks/${stackId}/events`, (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
}

/**
 * Replace a CodeMirror-backed editor's full content (11-09, D-18). `.fill()`
 * doesn't work on CodeMirror's contenteditable root, and `.type()` fires
 * real keystrokes that trip the YAML language extension's auto-indent on
 * Enter — `keyboard.insertText()` dispatches a single input event instead,
 * bypassing that and matching exactly what a paste/autofill would produce.
 */
async function replaceCodeEditorContent(page: Page, name: RegExp | string, text: string) {
    const editor = page.getByRole("textbox", {name});
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);
}

/**
 * Reads a CodeMirror-backed editor's current content (11-09/11-12). CodeMirror
 * renders each line as its own `.cm-line` element with no literal `"\n"` in
 * the DOM, so `toHaveValue` (input/textarea only) doesn't apply — join the
 * per-line text content instead.
 */
async function getCodeEditorContent(page: Page, name: RegExp | string): Promise<string> {
    const editor = page.getByRole("textbox", {name});
    const lines = await editor.locator(".cm-line").allTextContents();
    return lines.join("\n");
}

test.describe("Stacks", () => {
    test("stacks list page shows all stacks", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);

        await page.goto("/stacks");

        await expect(page.getByRole("heading", {name: "Stacks"})).toBeVisible();
        await expect(page.getByText("My App")).toBeVisible();
        await expect(page.getByText("Database Stack")).toBeVisible();
        await expect(page.getByText("Running")).toBeVisible();
        await expect(page.getByText("Stopped")).toBeVisible();
    });

    test("stacks list page shows empty state", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page, []);

        await page.goto("/stacks");

        await expect(page.getByText("No stacks yet")).toBeVisible();
    });

    test("stacks list has create stack button that navigates", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);

        await page.goto("/stacks");
        await page.getByRole("link", {name: /create stack/i}).click();

        await expect(page).toHaveURL("/stacks/create");
    });

    test("create stack page renders form", async ({page}) => {
        await mockAuthenticated(page);

        await page.goto("/stacks/create");

        await expect(page.getByRole("heading", {name: "Create Stack"})).toBeVisible();
        await expect(page.getByLabel(/name/i)).toBeVisible();
        await expect(page.getByLabel(/description/i)).toBeVisible();
        await expect(page.getByLabel(/docker compose file/i)).toBeVisible();
        await expect(page.getByRole("button", {name: /create stack/i})).toBeVisible();
        await expect(page.getByRole("button", {name: /cancel/i})).toBeVisible();
    });

    test("create stack submits and redirects to detail page", async ({page}) => {
        await mockAuthenticated(page);

        // Mock POST /api/stacks
        await page.route("**/api/stacks", (route) => {
            if (route.request().method() === "POST") {
                return route.fulfill({
                    status: 201,
                    contentType: "application/json",
                    body: JSON.stringify({id: "new-stack", displayName: "New Stack", services: []}),
                });
            }
            return route.continue();
        });

        // Mock the detail page APIs for redirect target
        await page.route("**/api/stacks/new-stack", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({...mockStackDetail, id: "new-stack", displayName: "New Stack", status: "DRAFT"}),
            }),
        );
        await page.route("**/api/stacks/new-stack/compose", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: "services:"})}),
        );
        await page.route("**/api/stacks/new-stack/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "new-stack");

        await page.goto("/stacks/create");

        await page.getByLabel(/name/i).fill("New Stack");
        await replaceCodeEditorContent(page, /docker compose file/i, "services:\n  web:\n    image: nginx");
        await page.getByRole("button", {name: /create stack/i}).click();

        await expect(page).toHaveURL("/stacks/new-stack", {timeout: 10_000});
    });

    test("stack detail page shows stack info and services", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            if (route.request().url().endsWith("/compose")) return route.continue();
            if (route.request().url().endsWith("/env")) return route.continue();
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockStackDetail),
            });
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({content: "services:\n  web:\n    image: nginx:latest"}),
            }),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app");

        await expect(page.getByRole("heading", {name: "My App"})).toBeVisible();
        await expect(page.getByText("A test application")).toBeVisible();
        // Scoped to the header: the Overview tab's activity timeline (11-06) also renders a
        // compact "Running" status badge for the seeded DRAFT->RUNNING status-log entry, so an
        // unscoped page-wide match hits both and trips Playwright's strict-mode violation.
        await expect(page.locator("header").getByText("Running", {exact: true})).toBeVisible();

        // Services table
        await expect(page.getByText("web")).toBeVisible();
        await expect(page.getByText("nginx")).toBeVisible();

        // Tabs (D-01/D-02: Overview, Config, Logs, Backups, Proxy)
        await expect(page.getByRole("tab", {name: "Overview"})).toBeVisible();
        await expect(page.getByRole("tab", {name: "Config"})).toBeVisible();
        await expect(page.getByRole("tab", {name: "Logs"})).toBeVisible();
        await expect(page.getByRole("tab", {name: "Backups"})).toBeVisible();
        await expect(page.getByRole("tab", {name: "Proxy"})).toBeVisible();
    });

    test("stack detail page shows deploy button and stop/restart in the actions menu for a running stack", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            if (route.request().url().endsWith("/compose") || route.request().url().endsWith("/env")) {
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app");

        // Deploy primary + ellipsis dropdown for the rest (04-CONTEXT locked
        // decision) — Stop/Restart live inside the "Stack actions" menu, not
        // as standalone visible buttons.
        await expect(page.getByRole("button", {name: /deploy/i})).toBeVisible();

        await page.getByRole("button", {name: "Stack actions"}).click();
        await expect(page.getByRole("menuitem", {name: /stop/i})).toBeVisible();
        await expect(page.getByRole("menuitem", {name: /restart/i})).toBeVisible();
    });

    test("stack detail config tab: edit and save the compose file shows a review dialog, Confirm & Apply writes (Issue #18/D-01/D-02/D-03)", async ({page}) => {
        await mockAuthenticated(page);
        let putBody: unknown = null;
        let previewCalled = false;
        await page.route("**/api/stacks/my-app", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env") || url.endsWith("/preview")) {
                return route.continue();
            }
            if (route.request().method() === "PUT") {
                putBody = route.request().postDataJSON();
                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(mockStackDetail),
                });
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
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
        await page.route("**/api/stacks/my-app/preview", (route) => {
            previewCalled = true;
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    hasChanges: true,
                    confirmationRequired: true,
                    compose: {
                        hunks: [
                            {
                                oldStart: 1,
                                oldLines: 2,
                                newStart: 1,
                                newLines: 2,
                                lines: [
                                    {kind: "context", text: "services:", oldLine: 1, newLine: 1},
                                    {kind: "removed", text: "  web:", oldLine: 2, newLine: null},
                                    {kind: "added", text: "  web2:", oldLine: null, newLine: 2},
                                ],
                            },
                        ],
                        added: 1,
                        removed: 1,
                    },
                    env: null,
                }),
            });
        });
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/config");

        await expect(page.getByRole("heading", {name: "Compose File"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Environment Variables"})).toBeVisible();

        await replaceCodeEditorContent(page, "Docker Compose File", "services:\n  web2:\n    image: nginx:1.27\n");

        await page.getByRole("button", {name: "Save compose file"}).click();

        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Review changes to My App");
        await expect(dialog.locator('[data-diff-kind="added"]')).toBeVisible();
        expect(previewCalled).toBe(true);
        expect(putBody).toBeNull();

        await page.getByRole("button", {name: "Confirm & Apply"}).click();

        await expect.poll(() => putBody).toEqual(
            expect.objectContaining({
                composeContent: "services:\n  web2:\n    image: nginx:1.27\n",
                confirmed: true,
            }),
        );
    });

    test("stack detail config tab: Keep Editing on the review dialog sends no PUT and the Save button stays enabled", async ({page}) => {
        await mockAuthenticated(page);
        let putCount = 0;
        await page.route("**/api/stacks/my-app", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env") || url.endsWith("/preview")) {
                return route.continue();
            }
            if (route.request().method() === "PUT") {
                putCount += 1;
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
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
        await page.route("**/api/stacks/my-app/preview", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    hasChanges: true,
                    confirmationRequired: true,
                    compose: {
                        hunks: [
                            {
                                oldStart: 1,
                                oldLines: 1,
                                newStart: 1,
                                newLines: 1,
                                lines: [{kind: "added", text: "  web2:", oldLine: null, newLine: 1}],
                            },
                        ],
                        added: 1,
                        removed: 0,
                    },
                    env: null,
                }),
            }),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/config");

        await replaceCodeEditorContent(page, "Docker Compose File", "services:\n  web2:\n    image: nginx:1.27\n");
        await page.getByRole("button", {name: "Save compose file"}).click();

        await expect(page.getByRole("alertdialog")).toBeVisible();
        await page.getByRole("button", {name: "Keep Editing"}).click();

        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        expect(putCount).toBe(0);
        await expect(page.getByRole("button", {name: "Save compose file"})).toBeEnabled();
    });

    test("stack detail config tab: EnvEditor table mode add + save, raw mode reflects the same edit (D-20/D-21)", async ({page}) => {
        await mockAuthenticated(page);
        let putBody: unknown = null;
        await page.route("**/api/stacks/my-app", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env")) {
                return route.continue();
            }
            if (route.request().method() === "PUT") {
                putBody = route.request().postDataJSON();
                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(mockStackDetail),
                });
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
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
        // This test adds a non-secret variable and expects the save to apply
        // directly — stub the preview endpoint reporting no review needed,
        // so the D-20/D-21 table-edit behaviour under test isn't coupled to
        // Issue #18/D-01's review-before-apply gate (covered separately by
        // the env-save review test).
        await page.route("**/api/stacks/my-app/preview", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({hasChanges: true, confirmationRequired: false, compose: null, env: null}),
            }),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/config");

        // Table mode shows the FOO row by default (D-21).
        await expect(page.getByRole("textbox", {name: "Variable name 1"})).toHaveValue("FOO");
        await expect(page.getByLabel("Value for FOO", {exact: true})).toHaveValue("bar");

        await page.getByRole("button", {name: "Add Variable"}).click();
        await page.getByRole("textbox", {name: "Variable name 2"}).fill("NEW_KEY");
        // NEW_KEY matches D-22's intentionally broad secret heuristic (it
        // contains "KEY"), so its value input is masked — {exact: true}
        // disambiguates it from the "Show value for NEW_KEY" reveal button,
        // whose accessible name is a case-insensitive superstring match.
        await page.getByLabel("Value for NEW_KEY", {exact: true}).fill("42");

        // Lossless mode switch (D-06/D-21 "no dialog"): raw mode reflects the
        // table edit before it's ever saved.
        await page.getByRole("switch", {name: "Raw text mode"}).click();
        await expect
            .poll(() => getCodeEditorContent(page, "Environment Variables"))
            .toBe("FOO=bar\nNEW_KEY=42");
        await page.getByRole("switch", {name: "Raw text mode"}).click();

        await page.getByRole("button", {name: "Save environment variables"}).click();

        await expect.poll(() => putBody).toEqual(expect.objectContaining({envContent: "FOO=bar\nNEW_KEY=42"}));
    });

    test("stack detail config tab: invalid YAML shows a CodeMirror lint marker, fixing it clears it (D-19)", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env")) {
                return route.continue();
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({content: "services:\n  web:\n    image: nginx:latest\n"}),
            }),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/config");

        // Duplicate mapping keys (rather than an unclosed quote) so the
        // parser's error range lands on a real character ("w" of the second
        // "web:") — CodeMirror renders a zero-width/line-break-only range as
        // a point marker (`cm-lintPoint`) instead of a `cm-lintRange`.
        await replaceCodeEditorContent(
            page,
            "Docker Compose File",
            "services:\n  web:\n    image: nginx\n  web:\n    image: redis\n",
        );

        await expect(page.locator(".cm-lintRange-error")).toBeVisible();

        await replaceCodeEditorContent(page, "Docker Compose File", "services:\n  web:\n    image: nginx:latest\n");

        await expect(page.locator(".cm-lintRange-error")).toHaveCount(0);
    });

    test("legacy /compose URL redirects to /config (D-02)", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            if (route.request().url().endsWith("/compose") || route.request().url().endsWith("/env")) {
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/compose");

        await expect(page).toHaveURL(/\/stacks\/my-app\/config$/);
    });

    test("dashboard shows stack stats and recent stacks", async ({page}) => {
        await mockAuthenticated(page);
        // D-14: give one stack a service with an update and a backup
        // schedule, so both new stat cards report a non-zero count.
        const dashboardStacks = [
            {
                ...mockStacks[0],
                backupSchedule: "0 3 * * *",
                services: [{...mockStacks[0].services[0], updateAvailable: true}],
            },
            mockStacks[1],
        ];
        await mockStacksList(page, dashboardStacks);
        await mockBackupDefaults(page);

        await page.goto("/");

        await expect(page.getByRole("heading", {name: "Dashboard"})).toBeVisible();
        await expect(page.getByText("Total Stacks")).toBeVisible();
        await expect(page.getByText("Running").first()).toBeVisible();
        await expect(page.getByText("My App")).toBeVisible();

        // D-14: the two new stat cards, both showing a value of 1.
        const updatesCard = page.locator('[data-slot="stat-card"]', {hasText: "Updates Available"});
        await expect(updatesCard).toBeVisible();
        await expect(updatesCard.getByText("1", {exact: true})).toBeVisible();

        const backupsCard = page.locator('[data-slot="stat-card"]', {hasText: "Backups Configured"});
        await expect(backupsCard).toBeVisible();
        await expect(backupsCard.getByText("1", {exact: true})).toBeVisible();
    });

    test("breadcrumbs show correct navigation on detail page", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            if (route.request().url().endsWith("/compose") || route.request().url().endsWith("/env")) {
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app");

        // Breadcrumb preserves tab context (04-CONTEXT locked decision):
        // "Stacks" and the stack name are links, the active tab label
        // ("Overview" here, the default tab) is the current page.
        await expect(page.getByLabel("breadcrumb").getByRole("link", {name: "Stacks"})).toBeVisible();
        await expect(page.getByLabel("breadcrumb").getByRole("link", {name: "My App"})).toBeVisible();
        await expect(page.locator("[aria-current='page']", {hasText: "Overview"})).toBeVisible();
    });

    test("breadcrumb stack-name link preserves tab context when clicked from a non-Overview tab (WR-01 regression)", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/my-app", (route) => {
            if (route.request().url().endsWith("/compose") || route.request().url().endsWith("/env")) {
                return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})});
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/my-app/compose", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await page.route("**/api/stacks/my-app/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "my-app");

        await page.goto("/stacks/my-app/config");
        await expect(page.locator("[aria-current='page']", {hasText: "Config"})).toBeVisible();

        // The breadcrumb stack-name link must navigate to the path form
        // (/stacks/:id/:tab), not a query string the router doesn't consume —
        // otherwise clicking it silently drops back to Overview.
        const breadcrumbLink = page.getByLabel("breadcrumb").getByRole("link", {name: "My App"});
        await expect(breadcrumbLink).toHaveAttribute("href", "/stacks/my-app/config");

        await breadcrumbLink.click();
        await expect(page.locator("[aria-current='page']", {hasText: "Config"})).toBeVisible();
        await expect(page).toHaveURL(/\/stacks\/my-app\/config$/);
    });

    test("stack detail shows 404 for non-existent stack", async ({page}) => {
        await mockAuthenticated(page);
        await page.route("**/api/stacks/non-existent", (route) => {
            if (route.request().url().endsWith("/compose") || route.request().url().endsWith("/env")) {
                return route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({error: "Not found"})});
            }
            return route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({error: "Not found"})});
        });
        await page.route("**/api/stacks/non-existent/compose", (route) =>
            route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({error: "Not found"})}),
        );
        await page.route("**/api/stacks/non-existent/env", (route) =>
            route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({error: "Not found"})}),
        );

        await page.goto("/stacks/non-existent");

        await expect(page.getByText(/not found/i)).toBeVisible();
    });
});
