import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const GB = 1073741824;

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

const mockOverview = {
    measuredAt: new Date().toISOString(),
    totals: {volumesBytes: 3 * GB, backupsBytes: GB, totalBytes: 4 * GB},
    stacks: [
        {stackId: "small", displayName: "Small", volumeSizeBytes: 1048576, measuredAt: new Date().toISOString(), volumes: []},
        {stackId: "big-app", displayName: "Big App", volumeSizeBytes: 2 * GB, measuredAt: new Date().toISOString(), volumes: []},
        {stackId: "mid", displayName: "Mid", volumeSizeBytes: GB, measuredAt: new Date().toISOString(), volumes: []},
    ],
    backups: [],
};

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

async function mockStorage(page: Page, overview: unknown = mockOverview) {
    await page.route("**/api/storage", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(overview)}),
    );
}

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
        await expect(page.getByText("Total Disk Used")).toBeVisible();
        await expect(page.getByText("4.00 GB")).toBeVisible();
        await expect(page.getByText("3.00 GB")).toBeVisible();
        await expect(page.getByText(/^Last measured/)).toBeVisible();

        const links = page.getByRole("row").getByRole("link");
        await expect(links).toHaveText(["Big App", "Mid", "Small"]);
    });
});
