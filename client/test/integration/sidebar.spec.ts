import {readFileSync} from "node:fs";
import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// client/package.json always carries a version field
const {version: appVersion} = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
};

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

test.describe("Sidebar version block (UI-01)", () => {
    test.beforeEach(async ({page}) => {
        await mockSidebarSurface(page);
    });

    test("the expanded sidebar shows the client/package.json version and both project links above the account menu", async ({
        page,
    }) => {
        await page.goto("/stacks/create/templates");
        const sidebar = page.locator('[data-sidebar="sidebar"]');
        const about = sidebar.getByRole("group", {name: "About Docktor"});

        await expect(about).toContainText(`v${appVersion}`);
        const github = about.getByRole("link", {name: "Docktor on GitHub (opens in a new tab)"});
        const docs = about.getByRole("link", {name: "Docktor documentation (opens in a new tab)"});
        await expect(github).toBeVisible();
        await expect(docs).toBeVisible();
        await expect(github).toHaveAttribute("href", "https://github.com/docktor-app/docktor");
        await expect(docs).toHaveAttribute("href", "https://getdocktor.dev");
        for (const link of [github, docs]) {
            await expect(link).toHaveAttribute("target", "_blank");
            await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        }

        const aboutBox = await about.boundingBox();
        const accountBox = await sidebar.getByRole("button", {name: /E2E Tester/}).boundingBox();
        expect(aboutBox?.y ?? Infinity).toBeLessThan(accountBox?.y ?? 0);
    });

    test("collapsed to icons the version menu button opens the version and both links by click and by Enter", async ({
        page,
    }) => {
        await page.goto("/stacks/create/templates");
        const sidebar = page.locator('[data-sidebar="sidebar"]');

        await page.getByRole("button", {name: "Toggle Sidebar"}).click();

        const about = sidebar.locator('[role="group"][aria-label="About Docktor"]');
        await expect(about).toHaveCount(1);
        await expect(about).toBeHidden();

        const trigger = page.getByRole("button", {name: `Docktor v${appVersion} links`});
        await expect(trigger).toBeVisible();
        await trigger.hover();
        await expect(
            page.locator('[data-slot="tooltip-content"]').filter({hasText: `Docktor v${appVersion}`}),
        ).toBeVisible();

        await trigger.click();
        const github = page.getByRole("menuitem", {name: "Docktor on GitHub (opens in a new tab)"});
        const docs = page.getByRole("menuitem", {name: "Docktor documentation (opens in a new tab)"});
        await expect(github).toHaveAttribute("href", "https://github.com/docktor-app/docktor");
        await expect(docs).toHaveAttribute("href", "https://getdocktor.dev");

        await page.keyboard.press("Escape");
        await expect(github).toBeHidden();

        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(github).toBeVisible();
    });
});
