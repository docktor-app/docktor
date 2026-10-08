import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

function buildStack(id: string, displayName: string) {
    return {
        id,
        displayName,
        description: null,
        hostPath: `/stacks/${id}`,
        status: "RUNNING",
        configChanged: false,
        lastKnownHash: "abc123",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        services: [],
    };
}

const mockStacks = [buildStack("my-app", "My App"), buildStack("db-stack", "Database Stack")];

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

async function mockStackUptimes(page: Page, body: unknown, status = 200) {
    await page.route("**/api/uptime/stacks", (route) =>
        route.fulfill({status, contentType: "application/json", body: JSON.stringify(body)}),
    );
}

test.describe("Stack list uptime column", () => {
    test("shows each stack's truncated uptime and an em dash for a stack without data", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);
        await mockStackUptimes(page, {
            windowDays: 30,
            stacks: [
                {stackId: "my-app", percent: 99.95},
                {stackId: "db-stack", percent: null},
            ],
        });

        await page.goto("/stacks");

        await expect(page.getByRole("columnheader", {name: "Uptime"})).toBeVisible();
        const healthy = page.getByRole("row", {name: /My App/});
        await expect(healthy.getByText("99.9%")).toBeVisible();
        await expect(healthy.getByText("99.9%")).toHaveAttribute("title", "Uptime over the last 30 days");
        const noData = page.getByRole("row", {name: /Database Stack/});
        await expect(noData.getByLabel("No uptime data")).toHaveText("—");
    });

    test("degrades silently to em dashes when the batch request fails", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);
        await mockStackUptimes(page, {message: "boom"}, 500);

        await page.goto("/stacks");

        await expect(page.getByRole("row", {name: /My App/}).getByLabel("No uptime data")).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
    });

    test("renders Uptime as a labelled row in the phone card layout", async ({page}) => {
        await page.setViewportSize({width: 412, height: 915});
        await mockAuthenticated(page);
        await mockStacksList(page);
        await mockStackUptimes(page, {
            windowDays: 30,
            stacks: [
                {stackId: "my-app", percent: 99.95},
                {stackId: "db-stack", percent: null},
            ],
        });

        await page.goto("/stacks");

        const card = page.locator('[data-slot="card"]').filter({hasText: "My App"});
        const uptimeRow = card.locator("div.flex.justify-between", {hasText: "Uptime"});
        await expect(uptimeRow).toContainText("99.9%");
        const emptyCard = page.locator('[data-slot="card"]').filter({hasText: "Database Stack"});
        await expect(emptyCard.getByLabel("No uptime data")).toHaveText("—");
    });
});

interface HealthRoute {
    puts: string[];
}

/**
 * Stubs GET/PUT /api/settings/health (overriding the fixtures.ts default) and
 * the other two cards on the Stacks settings tab. PUT bodies are recorded.
 */
async function mockSettingsStacksTab(page: Page, retentionDays = 30): Promise<HealthRoute> {
    const health: HealthRoute = {puts: []};
    await mockAuthenticated(page);
    await page.route("**/api/settings/compose-checks", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({skipReview: false, checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true}}),
        }),
    );
    await page.route("**/api/template-repos", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: "[]"}),
    );
    await page.route("**/api/settings/health", (route) => {
        if (route.request().method() === "PUT") {
            const body = route.request().postData() ?? "";
            health.puts.push(body);
            return route.fulfill({status: 200, contentType: "application/json", body});
        }
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({retentionDays}),
        });
    });
    return health;
}

async function enterRetention(page: Page, value: string) {
    const input = page.getByLabel("Retention (days)");
    await input.fill(value);
    await page.getByRole("button", {name: "Save Health Settings"}).click();
}

test.describe("Health retention card", () => {
    test("sits after Template Repositories and shows the saved window", async ({page}) => {
        await mockSettingsStacksTab(page, 45);

        await page.goto("/settings/stacks");

        await expect(page.getByLabel("Retention (days)")).toHaveValue("45");
        const titles = await page.locator('[data-slot="card-title"]').allTextContents();
        expect(titles.indexOf("Health History")).toBeGreaterThan(titles.indexOf("Template Repositories"));
    });

    test("raising the window saves immediately without a dialog", async ({page}) => {
        const health = await mockSettingsStacksTab(page);
        await page.goto("/settings/stacks");
        await expect(page.getByLabel("Retention (days)")).toHaveValue("30");

        await enterRetention(page, "60");

        await expect(page.getByText("Health settings saved")).toBeVisible();
        expect(health.puts).toEqual(['{"retentionDays":60}']);
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("shortening opens the dialog; Keep sends no request, Shorten retention saves", async ({page}) => {
        const health = await mockSettingsStacksTab(page);
        await page.goto("/settings/stacks");
        await expect(page.getByLabel("Retention (days)")).toHaveValue("30");

        await enterRetention(page, "7");
        const dialog = page.getByRole("alertdialog", {name: "Shorten retention to 7 days?"});
        await expect(dialog).toBeVisible();

        await dialog.getByRole("button", {name: "Keep 30 days"}).click();
        await expect(dialog).toBeHidden();
        expect(health.puts).toEqual([]);

        await page.getByRole("button", {name: "Save Health Settings"}).click();
        await page.getByRole("alertdialog").getByRole("button", {name: "Shorten retention"}).click();

        await expect(page.getByText("Health settings saved")).toBeVisible();
        expect(health.puts).toEqual(['{"retentionDays":7}']);
    });

    test("Escape closes the dialog without saving", async ({page}) => {
        const health = await mockSettingsStacksTab(page);
        await page.goto("/settings/stacks");
        await expect(page.getByLabel("Retention (days)")).toHaveValue("30");

        await enterRetention(page, "7");
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await page.keyboard.press("Escape");

        await expect(page.getByRole("alertdialog")).toBeHidden();
        expect(health.puts).toEqual([]);
    });

    test("an out-of-range value shows the validation message and sends nothing", async ({page}) => {
        const health = await mockSettingsStacksTab(page);
        await page.goto("/settings/stacks");
        await expect(page.getByLabel("Retention (days)")).toHaveValue("30");

        await enterRetention(page, "400");

        await expect(page.getByText("Enter a whole number from 1 to 365.")).toBeVisible();
        expect(health.puts).toEqual([]);
    });

    test("a failed load shows the alert instead of the form", async ({page}) => {
        await mockSettingsStacksTab(page);
        await page.route("**/api/settings/health", (route) =>
            route.fulfill({status: 500, contentType: "application/json", body: JSON.stringify({message: "boom"})}),
        );

        await page.goto("/settings/stacks");

        await expect(page.getByText("Couldn't load health settings. Reload the page to try again.")).toBeVisible();
        await expect(page.getByRole("button", {name: "Save Health Settings"})).toHaveCount(0);
    });
});
