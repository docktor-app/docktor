import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// Entry point + page for the post-setup brownfield import flow (todo item
// M6) — BF-01 through BF-05 already have full wizard coverage in
// setup-wizard.spec.ts; this spec only proves the new authenticated path
// reachable from the Stacks page renders and is wired to the right
// endpoints.
const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

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

const longDirectory = "/host/home/raphael/workspace/docktor/dev-data/docktor/stacks/memos-archive";
const longPathStack = {
    ...greenStack,
    path: `${longDirectory}/docker-compose.yml`,
    directory: longDirectory,
};

async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

async function mockStacksList(page: Page, stacks: unknown[] = []) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(stacks)});
        }
        return route.continue();
    });
}

async function scanLongPath(page: Page) {
    await mockAuthenticated(page);
    await mockStacksList(page);
    await page.route("**/api/stacks/import/scan", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({stacks: [longPathStack], skippedDirectories: 0, skipped: []}),
        }),
    );

    await page.goto("/stacks/import");
    await page.getByLabel(/directories to scan/i).fill("/host/home");
    await page.getByRole("button", {name: /scan/i}).click();
    await expect(page.getByText("Discovered Stacks (1)")).toBeVisible();
}

test.describe("Stacks - Import Existing Stack entry point", () => {
    test("navigates from the Stacks page to /stacks/import and renders the scan form", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);

        await page.goto("/stacks");
        await page.getByRole("link", {name: /import existing stack/i}).click();

        await expect(page).toHaveURL(/\/stacks\/import$/);
        await expect(page.getByRole("heading", {name: "Import Existing Stack"})).toBeVisible();
        await expect(page.getByLabel(/directories to scan/i)).toBeVisible();
        await expect(page.getByRole("button", {name: /scan/i})).toBeVisible();
    });

    test("import page scans /api/stacks/import/scan (not /api/setup/scan) and can adopt a discovered stack", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);

        await page.route("**/api/stacks/import/scan", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({stacks: [greenStack], skippedDirectories: 0, skipped: []}),
            }),
        );
        await page.route("**/api/stacks/import/adopt", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({id: "app"})}),
        );

        await page.goto("/stacks/import");

        await page.getByLabel(/directories to scan/i).fill("/home/user");
        await page.getByRole("button", {name: /scan/i}).click();

        await expect(page.getByText("Discovered Stacks (1)")).toBeVisible();

        await page.getByRole("button", {name: "Adopt"}).click();

        await expect(page.getByText(/adopted successfully/i)).toBeVisible();
        await expect(page.getByText("Imported")).toBeVisible();
    });

    test("import page keeps an already-managed stack listed with disabled actions and a link", async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);

        await page.route("**/api/stacks/import/scan", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    stacks: [{...greenStack, managedStack: {id: "blog", displayName: "Blog"}}],
                    skippedDirectories: 0,
                    skipped: [],
                }),
            }),
        );

        await page.goto("/stacks/import");

        await page.getByLabel(/directories to scan/i).fill("/home/user");
        await page.getByRole("button", {name: /scan/i}).click();

        await expect(page.getByText("Already managed")).toBeVisible();
        await expect(page.getByRole("button", {name: "Migrate"})).toBeDisabled();
        await expect(page.getByRole("button", {name: "Adopt"})).toBeDisabled();
        await expect(page.getByRole("link", {name: "View Blog"})).toHaveAttribute("href", "/stacks/blog");
    });

    test("fits a long scanned path without horizontal scrolling at desktop width", async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await scanLongPath(page);

        const card = page.locator('[data-slot="card"]').filter({hasText: "Discovered Stacks (1)"});
        const tableContainer = card.locator('[data-slot="table-container"]');
        const scroll = await tableContainer.evaluate((el) => ({scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}));
        const box = await card.boundingBox();

        expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
        expect(box?.width ?? 0).toBeGreaterThan(768);
    });

    test("keeps the phone layout at 360px", async ({page}) => {
        await page.setViewportSize({width: 360, height: 740});
        await scanLongPath(page);

        // The page itself never overflows; the table may still scroll inside its own container.
        await expect
            .poll(() =>
                page.evaluate(
                    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                ),
            )
            .toBeLessThanOrEqual(0);

        const row = page.getByRole("row", {name: new RegExp(longPathStack.directory)});
        for (const name of ["Migrate", "Adopt"]) {
            const button = row.getByRole("button", {name});
            await button.scrollIntoViewIfNeeded();
            await expect(button).toBeVisible();
        }
    });
});
