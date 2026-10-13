import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

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

interface Warning {
    code: string;
    variable: string;
    message: string;
}

const proxyWarning: Warning = {
    code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    variable: "TRUST_PROXY",
    message: "BETTER_AUTH_URL is https but TRUST_PROXY is not set.",
};
const secretWarning: Warning = {
    code: "TEMPLATE_SECRET_IN_PRODUCTION",
    variable: "BETTER_AUTH_SECRET",
    message: "BETTER_AUTH_SECRET still holds the .env.example template value.",
};
const hostDirWarning: Warning = {
    code: "STACKS_HOST_DIR_UNSET",
    variable: "DOCKTOR_STACKS_HOST_DIR",
    message: "DOCKTOR_STACKS_HOST_DIR is not set.",
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

// One handler reads a mutable list, so a step can change what the server
// reports between reloads without registering a second route.
async function mockEnvironment(page: Page, initial: Warning[]) {
    const state = {warnings: initial};
    await page.route("**/api/settings/environment", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({warnings: state.warnings}),
        }),
    );
    return state;
}

test.describe("Environment warnings banner (#7, D-13)", () => {
    test.beforeEach(async ({page}) => {
        await mockAuthenticated(page);
        await mockStacksList(page);
        await mockBackupDefaults(page);
    });

    test("shows nothing when the server reports no warnings", async ({page}) => {
        await page.goto("/stacks");

        await expect(page.getByRole("heading", {level: 1, name: "Stacks"})).toBeVisible();
        await expect(page.getByText("Configuration warnings")).toHaveCount(0);
    });

    test("shows every warning, keeps a dismissal across reload and shows a new warning again", async ({page}) => {
        const environment = await mockEnvironment(page, [proxyWarning, secretWarning]);

        await page.goto("/stacks");
        await expect(page.getByText("Configuration warnings")).toBeVisible();
        await expect(page.getByText(proxyWarning.message)).toBeVisible();
        await expect(page.getByText(secretWarning.message)).toBeVisible();

        await page.getByRole("button", {name: "Dismiss warning about TRUST_PROXY"}).click();
        await expect(page.getByText(proxyWarning.message)).toHaveCount(0);
        await expect(page.getByText(secretWarning.message)).toBeVisible();

        await page.reload();
        await expect(page.getByText(secretWarning.message)).toBeVisible();
        await expect(page.getByText(proxyWarning.message)).toHaveCount(0);

        environment.warnings = [proxyWarning, secretWarning, hostDirWarning];
        await page.reload();
        await expect(page.getByText(hostDirWarning.message)).toBeVisible();
        await expect(page.getByText(secretWarning.message)).toBeVisible();
        await expect(page.getByText(proxyWarning.message)).toHaveCount(0);
    });

    test("Dismiss all removes the banner and it stays gone after reload", async ({page}) => {
        await mockEnvironment(page, [proxyWarning, secretWarning]);

        await page.goto("/stacks");
        await page.getByRole("button", {name: "Dismiss all"}).click();
        await expect(page.getByText("Configuration warnings")).toHaveCount(0);

        await page.reload();
        await expect(page.getByRole("heading", {level: 1, name: "Stacks"})).toBeVisible();
        await expect(page.getByText("Configuration warnings")).toHaveCount(0);
    });

    test("the banner links to the docs Startup checks section in a new tab", async ({page}) => {
        await mockEnvironment(page, [proxyWarning]);

        await page.goto("/stacks");

        const link = page.getByRole("link", {name: "How to fix these"});
        await expect(link).toHaveAttribute("href", /reference\/deployment(\.md)?#startup-checks$/);
        await expect(link).toHaveAttribute("target", "_blank");
    });
});
