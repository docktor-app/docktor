import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// D-02/GH-15 (11-10): the UI-SPEC "Discard unsaved changes?" confirmation
// for the merged Config tab. Self-sufficient (stubs every **/api/** call
// this page and its navigation target trigger) and independent of plan
// 11-09's compose-editor merge order — it locates the compose control via
// its accessible name rather than assuming a <textarea> or CodeMirror root.

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStackDetail = {
    id: "my-app",
    displayName: "My App",
    description: "A test application",
    hostPath: "/stacks/my-app",
    status: "RUNNING",
    configChanged: false,
    configError: null,
    lastKnownHash: "abc123",
    backupSchedule: null,
    isProtected: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    services: [],
    deployments: [],
    statusLogs: [],
};

/** Mock authenticated session for all tests. */
async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
}

/** Mock the stack detail page's own API surface (detail, compose, env, events). */
async function mockStackDetailPage(page: Page) {
    await page.route("**/api/stacks/my-app", (route) => {
        const url = route.request().url();
        if (url.endsWith("/compose") || url.endsWith("/env")) return route.continue();
        return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
    });
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
    // Issue #18/D-01: this suite drives the unsaved-changes guard, not the
    // review dialog — a save here must apply directly, so stub the preview
    // endpoint reporting no review needed wherever a save is triggered.
    await page.route("**/api/stacks/my-app/preview", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({hasChanges: true, confirmationRequired: false, compose: null, env: null}),
        }),
    );
    await page.route("**/api/stacks/my-app/events", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
    // LogViewer (mounted, though not visible, once the Logs tab is clicked)
    // opens an SSE log stream via useLogStream.
    await page.route("**/api/stacks/my-app/logs**", (route) =>
        route.fulfill({status: 200, contentType: "text/event-stream", body: ""}),
    );
}

/**
 * Mock every API surface the dashboard (the navigation target of the
 * sidebar's "Dashboard" link) renders — stubbed up front so a completed
 * "Discard" navigation never trips the fixtures.ts unstubbed-API guard.
 */
async function mockDashboard(page: Page) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])});
        }
        return route.continue();
    });
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({defaultSchedule: null, defaultRetention: null}),
        }),
    );
}

/**
 * Types into whichever compose control is currently mounted (a plain
 * <textarea> or CodeMirror's contenteditable root) by locating it through
 * its shared accessible name and driving real keystrokes — independent of
 * plan 11-09's merge order per the plan's Task 2 action item 5.
 */
async function typeIntoComposeEditor(page: Page, text: string) {
    const editor = page.getByRole("textbox", {name: /docker compose file/i});
    await editor.click();
    await page.keyboard.type(text);
}

test.describe("Config tab — discard unsaved changes (D-02/GH-15)", () => {
    test("tab switches do not prompt, but navigating away does — Keep editing and Discard both work", async ({
        page,
    }) => {
        await mockAuthenticated(page);
        await mockStackDetailPage(page);
        await mockDashboard(page);

        await page.goto("/stacks/my-app/config");

        await expect(page.getByRole("heading", {name: "Compose File"})).toBeVisible();
        await typeIntoComposeEditor(page, " # unsaved-edit");

        // Switching between the stack's own tabs must never prompt — edits
        // live in page-level state (useStackConfigFiles) and survive it.
        await page.getByRole("tab", {name: "Logs"}).click();
        await expect(page.getByRole("alertdialog")).toHaveCount(0);

        await page.getByRole("tab", {name: "Config"}).click();
        await expect(page.getByRole("textbox", {name: /docker compose file/i})).toContainText("# unsaved-edit");

        // Navigating away via the sidebar prompts — "Keep editing" cancels
        // the navigation and leaves the edit in place.
        await page.getByRole("link", {name: "Dashboard"}).click();

        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Discard unsaved changes?");
        await expect(dialog).toContainText("Your edits to the compose file haven't been saved.");

        await page.getByRole("button", {name: "Keep editing"}).click();
        await expect(dialog).toHaveCount(0);
        await expect(page).toHaveURL(/\/stacks\/my-app\/config$/);
        await expect(page.getByRole("textbox", {name: /docker compose file/i})).toContainText("# unsaved-edit");

        // "Discard" completes the navigation.
        await page.getByRole("link", {name: "Dashboard"}).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await page.getByRole("button", {name: "Discard"}).click();

        await expect(page).toHaveURL("/");
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });
});
