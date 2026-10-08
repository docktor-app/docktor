import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const GB = 1073741824;
const MB = 1048576;

const mockStacks = [
    {
        id: "my-app",
        displayName: "My App",
        description: null,
        hostPath: "/stacks/my-app",
        status: "RUNNING",
        configChanged: false,
        lastKnownHash: "abc123",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        services: [],
    },
];

function buildOverview() {
    const measuredAt = new Date().toISOString();
    return {
        measuredAt,
        totals: {volumesBytes: 3 * GB, backupsBytes: GB, totalBytes: 4 * GB},
        stacks: [
            {stackId: "small", displayName: "Small", volumeSizeBytes: MB, measuredAt, volumes: []},
            {
                stackId: "big-app",
                displayName: "Big App",
                volumeSizeBytes: 2 * GB,
                measuredAt,
                volumes: [
                    {name: "postgres-data", sizeBytes: 2 * GB - 512 * MB},
                    {name: "uploads", sizeBytes: 512 * MB},
                ],
            },
            {stackId: "mid", displayName: "Mid", volumeSizeBytes: GB, measuredAt, volumes: [{name: "cache", sizeBytes: GB}]},
            {stackId: "ghost", displayName: "Ghost", volumeSizeBytes: null, measuredAt: null, volumes: []},
        ],
        backups: [
            {stackId: "mid", displayName: "Mid", sizeBytes: GB / 4},
            {stackId: "big-app", displayName: "Big App", sizeBytes: (3 * GB) / 4},
        ],
    };
}

async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

async function mockStacksList(page: Page) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStacks)});
        }
        return route.continue();
    });
}

async function mockBackupDefaults(page: Page) {
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({defaultSchedule: null, defaultRetention: null}),
        }),
    );
}

async function mockStorage(page: Page, overview: unknown = buildOverview()) {
    await page.route("**/api/storage", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(overview)}),
    );
}

async function openStorage(page: Page, overview?: unknown) {
    await mockAuthenticated(page);
    await mockStorage(page, overview);
    await page.goto("/storage");
    await expect(page.getByRole("heading", {level: 1, name: "Storage"})).toBeVisible();
}

const stackNames = (page: Page) => page.getByRole("row").getByRole("link");

test.describe("Storage", () => {
    test("the sidebar Storage link opens the page with totals and stacks, largest first", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);
        await mockBackupDefaults(page);
        await mockStorage(page);

        await page.goto("/stacks");
        await page.getByRole("link", {name: "Storage"}).click();

        await expect(page).toHaveURL(/\/storage$/);
        await expect(page.getByRole("heading", {level: 1, name: "Storage"})).toBeVisible();
        const card = (label: string) => page.locator('[data-slot="stat-card"]').filter({hasText: label});
        await expect(card("Total Disk Used")).toContainText("4.00 GB");
        await expect(card("Stack Volumes")).toContainText("3.00 GB");
        await expect(card("Local Backups")).toContainText("1.00 GB");
        await expect(page.getByText(/^Last measured/)).toBeVisible();

        await expect(stackNames(page)).toHaveText(["Big App", "Mid", "Small", "Ghost"]);
    });

    test("the Size header reverses the order and the unmeasured stack stays last", async ({page}) => {
        await openStorage(page);

        const stacksTable = page.locator("section").filter({has: page.getByRole("heading", {name: "Stacks"})});
        const sizeHeader = stacksTable.getByRole("columnheader", {name: /size/i});
        await expect(sizeHeader).toHaveAttribute("aria-sort", "descending");

        await stacksTable.getByRole("button", {name: "Size", exact: true}).click();
        await expect(sizeHeader).toHaveAttribute("aria-sort", "ascending");
        await expect(stackNames(page)).toHaveText(["Small", "Mid", "Big App", "Ghost"]);

        await stacksTable.getByRole("button", {name: "Stack", exact: true}).click();
        await expect(stacksTable.getByRole("columnheader", {name: /stack/i})).toHaveAttribute("aria-sort", "ascending");
        await expect(stackNames(page)).toHaveText(["Big App", "Mid", "Small", "Ghost"]);
    });

    test("expanding a stack reveals its volumes", async ({page}) => {
        await openStorage(page);

        await expect(page.getByText("postgres-data")).toHaveCount(0);
        await page.getByRole("button", {name: "Show volumes for Big App"}).click();

        await expect(page.getByText("postgres-data")).toBeVisible();
        await expect(page.getByText("uploads")).toBeVisible();
        await expect(page.getByRole("button", {name: "Hide volumes for Big App"})).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });

    test("the Backups section lists local repositories, largest first, with a subtotal", async ({page}) => {
        await openStorage(page);

        const backups = page.locator("section").filter({has: page.getByRole("heading", {name: "Backups"})});
        const rows = backups.getByRole("row");
        await expect(rows.nth(1)).toContainText("Big App");
        await expect(rows.nth(2)).toContainText("Mid");
        await expect(backups.getByText("Backups subtotal")).toBeVisible();
        await expect(rows.last()).toContainText("1.00 GB");
    });

    test("an install that has never measured explains itself", async ({page}) => {
        const overview = buildOverview();
        await openStorage(page, {
            ...overview,
            measuredAt: null,
            totals: {volumesBytes: null, backupsBytes: null, totalBytes: null},
            backups: [],
        });

        await expect(page.getByText("Disk usage hasn't been measured yet")).toBeVisible();
        await expect(page.getByText("No local backups")).toBeVisible();
    });

    test("a measurement older than 48 hours shows the out-of-date warning", async ({page}) => {
        const overview = buildOverview();
        const old = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
        await openStorage(page, {...overview, measuredAt: old});

        await expect(page.getByText("Disk usage is out of date")).toBeVisible();
        await expect(page.getByText(/The last measurement was 3 days ago/)).toBeVisible();
    });

    test("a failed load shows the error alert and Retry recovers", async ({page}) => {
        await mockAuthenticated(page);
        let attempts = 0;
        await page.route("**/api/storage", (route) => {
            attempts += 1;
            if (attempts === 1) {
                return route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({message: "disk exploded"}),
                });
            }
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(buildOverview())});
        });
        await page.goto("/storage");

        await expect(page.getByText(/Couldn't load disk usage/)).toBeVisible();
        await page.getByRole("button", {name: "Retry"}).click();
        await expect(page.getByRole("link", {name: "Big App"})).toBeVisible();
        await expect(page.getByText(/Couldn't load disk usage/)).toHaveCount(0);
    });
});

test.describe("Storage at phone width (UI-SPEC overflow backstop)", () => {
    test.use({viewport: {width: 412, height: 915}});

    test("long stack and volume names truncate and nothing scrolls horizontally", async ({page}) => {
        const longName = "a-remarkably-long-name-".repeat(5);
        const measuredAt = new Date().toISOString();
        await openStorage(page, {
            measuredAt,
            totals: {volumesBytes: GB, backupsBytes: GB, totalBytes: 2 * GB},
            stacks: [
                {
                    stackId: "long",
                    displayName: longName,
                    volumeSizeBytes: GB,
                    measuredAt,
                    volumes: [{name: longName, sizeBytes: GB}],
                },
            ],
            backups: [{stackId: "long", displayName: longName, sizeBytes: GB}],
        });

        await page.getByRole("button", {name: `Show volumes for ${longName}`}).click();
        await expect(page.getByTitle(longName)).toHaveCount(3);

        const overflow = await page.evaluate(() => ({
            documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            tablesFit: Array.from(document.querySelectorAll('[data-slot="table-container"]')).every(
                (container) => container.scrollWidth <= container.clientWidth,
            ),
        }));
        expect(overflow).toEqual({documentFits: true, tablesFit: true});
    });
});
