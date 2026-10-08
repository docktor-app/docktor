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
