import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const WHOAMI_VARIANT = {
    id: "v1",
    slug: "default",
    name: "Default",
    description: "A minimal whoami service",
    usage: "Visit the stack once deployed to see request headers.",
    composeContent: "services:\n  whoami:\n    image: traefik/whoami",
    envContent: "",
    contentHash: "hash1",
    template: {id: "t1", slug: "whoami", name: "Whoami"},
    repo: {id: "r1", url: "https://example.com/templates.git", headCommitSha: "abc123"},
};

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

const mockStackDetail = {
    id: "whoami",
    displayName: "Whoami",
    description: null,
    hostPath: "/stacks/whoami",
    status: "DRAFT",
    configChanged: false,
    lastKnownHash: null,
    backupSchedule: null,
    isProtected: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    services: [],
    deployments: [],
    statusLogs: [],
};

async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

async function mockStackEvents(page: Page, stackId: string) {
    await page.route(`**/api/stacks/${stackId}/events`, (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
}

/**
 * Replace a CodeMirror-backed editor's full content (11-09, D-18), mirroring
 * stacks.spec.ts's identical helper.
 */
async function replaceCodeEditorContent(page: Page, name: RegExp | string, text: string) {
    const editor = page.getByRole("textbox", {name});
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);
}

async function getCodeEditorContent(page: Page, name: RegExp | string): Promise<string> {
    const editor = page.getByRole("textbox", {name});
    const lines = await editor.locator(".cm-line").allTextContents();
    return lines.join("\n");
}

test.describe("Templates", () => {
    // Issue #19/D-06/D-07 tracer: browse -> single-variant card -> prefilled
    // create form -> checked create -> land on the new stack.
    test("creates a stack end to end from a single-variant template", async ({page}) => {
        await mockAuthenticated(page);

        await page.route("**/api/templates", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(CATALOG_ONE_VARIANT)}),
        );
        await page.route("**/api/templates/variants/v1", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(WHOAMI_VARIANT)}),
        );
        await page.route("**/api/stacks/preview", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({confirmationRequired: false, findings: [], composeParseError: null}),
            }),
        );

        let postBody: unknown = null;
        await page.route("**/api/templates/variants/v1/stacks", (route) => {
            if (route.request().method() === "POST") {
                postBody = route.request().postDataJSON();
                return route.fulfill({
                    status: 201,
                    contentType: "application/json",
                    body: JSON.stringify({id: "whoami"}),
                });
            }
            return route.continue();
        });

        await page.route("**/api/stacks/whoami", (route) => {
            const url = route.request().url();
            if (url.endsWith("/compose") || url.endsWith("/env")) return route.continue();
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
        });
        await page.route("**/api/stacks/whoami/compose", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({content: WHOAMI_VARIANT.composeContent}),
            }),
        );
        await page.route("**/api/stacks/whoami/env", (route) =>
            route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
        );
        await mockStackEvents(page, "whoami");

        await page.goto("/stacks/create");

        await page.getByRole("link", {name: "Start from Template"}).click();
        await expect(page).toHaveURL("/stacks/create/templates");
        await expect(page.getByRole("heading", {name: "Start from a Template"})).toBeVisible();
        await expect(page.getByText("Whoami")).toBeVisible();

        await page.getByRole("button", {name: "Use Template"}).click();

        await expect(page).toHaveURL("/stacks/create?variant=v1");
        await expect
            .poll(() => getCodeEditorContent(page, /docker compose file/i))
            .toBe(WHOAMI_VARIANT.composeContent);
        await expect(page.getByLabel(/name/i)).toHaveValue("Whoami");

        await page.getByRole("button", {name: /create stack/i}).click();

        await expect.poll(() => postBody).toEqual(
            expect.objectContaining({displayName: "Whoami", composeContent: WHOAMI_VARIANT.composeContent}),
        );
        await expect(page).toHaveURL("/stacks/whoami", {timeout: 10_000});
    });
});
