import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStack = {
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
    // [id].tsx dereferences these unconditionally (Overview tab's
    // Deployments/Status Log cards) — omitting them crashes the whole page.
    deployments: [] as unknown[],
    statusLogs: [] as unknown[],
};

/**
 * Self-sufficient stubs (this spec's tests visit /stacks and a stack detail
 * page): session, setup status (defensive — not actually hit on an
 * authenticated visit), the stacks list, and everything the stack detail
 * page's hooks fetch unconditionally on mount (stack, events, compose, env).
 * A defensive backup-defaults stub guards against any incidental settings
 * prefetch this suite isn't otherwise aware of.
 */
async function mockApiRoutes(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );

    await page.route("**/api/setup/status", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({complete: true})}),
    );

    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([mockStack])});
        }
        return route.continue();
    });

    await page.route("**/api/stacks/my-app", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStack)}),
    );

    await page.route("**/api/stacks/my-app/events", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );

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

    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({defaultSchedule: "0 3 * * *", defaultRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12}}),
        }),
    );
}

test.describe("Dark mode (D-15/D-16)", () => {
    test("follows the OS dark preference on first paint with no stored preference", async ({page}) => {
        await mockApiRoutes(page);
        await page.emulateMedia({colorScheme: "dark"});

        await page.goto("/stacks");

        await expect(page.locator("html")).toHaveClass(/dark/);
    });

    test("follows the OS light preference on first paint with no stored preference", async ({page}) => {
        await mockApiRoutes(page);
        await page.emulateMedia({colorScheme: "light"});

        await page.goto("/stacks");

        await expect(page.locator("html")).not.toHaveClass(/dark/);
    });

    test("a manual Dark override persists across a reload, even against an OS dark preference already set", async ({page}) => {
        await mockApiRoutes(page);
        await page.emulateMedia({colorScheme: "dark"});
        await page.goto("/stacks");

        await page.getByRole("button", {name: "Toggle theme"}).click();
        await page.getByRole("menuitemcheckbox", {name: "Dark"}).click();
        await expect(page.locator("html")).toHaveClass(/dark/);

        await page.reload();

        await expect(page.locator("html")).toHaveClass(/dark/);
    });

    test("a manual Light override persists across a reload, even against an OS dark preference", async ({page}) => {
        await mockApiRoutes(page);
        await page.emulateMedia({colorScheme: "dark"});
        await page.goto("/stacks");

        await page.getByRole("button", {name: "Toggle theme"}).click();
        await page.getByRole("menuitemcheckbox", {name: "Light"}).click();
        await expect(page.locator("html")).not.toHaveClass(/dark/);

        await page.reload();

        await expect(page.locator("html")).not.toHaveClass(/dark/);
    });

    test("the theme menu marks the active option and moves the mark when another is chosen", async ({page}) => {
        await mockApiRoutes(page);
        await page.goto("/stacks");

        await page.getByRole("button", {name: "Toggle theme"}).click();
        await expect(page.getByRole("menuitemcheckbox", {name: "System"})).toBeChecked();
        await page.getByRole("menuitemcheckbox", {name: "Dark"}).click();

        await page.getByRole("button", {name: "Toggle theme"}).click();
        await expect(page.getByRole("menuitemcheckbox", {name: "Dark"})).toBeChecked();
        await expect(page.getByRole("menuitemcheckbox", {name: "System"})).not.toBeChecked();
    });

    test("the 'Toggle theme' button is visible on the stacks list and a stack detail page", async ({page}) => {
        await mockApiRoutes(page);

        await page.goto("/stacks");
        await expect(page.getByRole("button", {name: "Toggle theme"})).toBeVisible();

        await page.goto("/stacks/my-app");
        await expect(page.getByRole("button", {name: "Toggle theme"})).toBeVisible();
    });
});
