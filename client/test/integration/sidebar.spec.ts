import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const CATALOG_ONE_VARIANT = {
    repos: [
        {
            id: "r1",
            url: "https://example.com/templates.git",
            isDefault: true,
            headCommitSha: "abc123",
            lastSyncAttemptAt: "2026-01-01T00:00:00Z",
            lastSyncedAt: "2026-01-01T00:00:00Z",
            lastSyncError: null,
            issues: [],
        },
    ],
    templates: [
        {
            id: "t1",
            repoId: "r1",
            slug: "whoami",
            name: "Whoami",
            description: "A minimal whoami service",
            category: "utility",
            iconDataUri: null,
            variants: [{id: "v1", slug: "default", name: "Default", description: "A minimal whoami service"}],
        },
    ],
};

async function mockSidebarSurface(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
    await page.route("**/api/templates", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(CATALOG_ONE_VARIANT)}),
    );
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])});
        }
        return route.continue();
    });
}

test.describe("Sidebar (UI-06)", () => {
    test.beforeEach(async ({page}) => {
        await mockSidebarSurface(page);
    });

    test("sections are labelled and Stacks stays highlighted on a nested route", async ({page}) => {
        await page.goto("/stacks/create/templates");
        const sidebar = page.locator('[data-sidebar="sidebar"]');

        await expect(sidebar.getByText("Platform", {exact: true})).toBeVisible();
        await expect(sidebar.getByText("System", {exact: true})).toBeVisible();
        await expect(sidebar.getByRole("link", {name: "Stacks", exact: true})).toHaveAttribute(
            "aria-current",
            "page",
        );
        await expect(sidebar.getByRole("link", {name: "Templates", exact: true})).not.toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    test("collapsed to icons the nav stays usable with tooltips", async ({page}) => {
        await page.goto("/stacks/create/templates");
        const sidebar = page.locator('[data-sidebar="sidebar"]');

        await page.getByRole("button", {name: "Toggle Sidebar"}).click();

        await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-collapsible", "icon");
        // The container width animates over 200 ms, so poll until it reaches the 3rem rail.
        await expect
            .poll(async () => (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width ?? Infinity)
            .toBeLessThanOrEqual(50);

        await sidebar.getByRole("link", {name: "Stacks", exact: true}).hover();
        await expect(page.locator('[data-slot="tooltip-content"]').filter({hasText: "Stacks"})).toBeVisible();

        await sidebar.getByRole("link", {name: "Storage", exact: true}).focus();
        await expect(page.locator('[data-slot="tooltip-content"]').filter({hasText: "Storage"})).toBeVisible();

        await sidebar.getByRole("link", {name: "Stacks", exact: true}).click();
        await expect(page).toHaveURL("/stacks");
    });
});
