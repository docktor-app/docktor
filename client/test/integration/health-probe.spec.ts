import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// Phase 14 (#23) / D-01: the HTTP Health Probes section on the Config tab
// writes `x-docktor.health-probe` into the compose buffer, and the existing
// Compose File Save routes it through the diff review. Self-sufficient: every
// **/api/** call this page triggers is stubbed.

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

const COMPOSE = "services:\n  web:\n    image: nginx:latest # pinned\n";

const sampleDiff = {
    added: 4,
    removed: 0,
    hunks: [
        {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [{kind: "added", text: "x-docktor:", oldLine: null, newLine: 1}],
        },
    ],
};

async function mockStackConfigPage(page: Page) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
    await page.route("**/api/stacks/my-app", (route) => {
        const url = route.request().url();
        if (url.endsWith("/compose") || url.endsWith("/env")) return route.continue();
        return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockStackDetail)});
    });
    await page.route("**/api/stacks/my-app/compose", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: COMPOSE})}),
    );
    await page.route("**/api/stacks/my-app/env", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({content: ""})}),
    );
    await page.route("**/api/stacks/my-app/preview", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({hasChanges: true, confirmationRequired: true, compose: sampleDiff, env: null}),
        }),
    );
    await page.route("**/api/stacks/my-app/events", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify([])}),
    );
    await page.route("**/api/stacks/my-app/logs**", (route) =>
        route.fulfill({status: 200, contentType: "text/event-stream", body: ""}),
    );
}

test.describe("Config tab — HTTP health probes (#23, D-01)", () => {
    test("enabling a probe writes x-docktor.health-probe into the compose buffer and Save opens the diff review", async ({
        page,
    }) => {
        await mockStackConfigPage(page);
        await page.goto("/stacks/my-app/config");

        const headings = page.getByRole("heading", {level: 2});
        await expect(headings).toHaveText(["Compose File", "HTTP Health Probes", "Environment Variables"]);

        await page.getByRole("switch", {name: "Probe web over HTTP"}).click();
        const urlInput = page.getByLabel("Probe URL");
        await urlInput.fill("http://localhost:8080/health");
        await urlInput.blur();

        await expect(page.getByRole("textbox", {name: /docker compose file/i})).toContainText("health-probe");
        await expect(page.getByRole("textbox", {name: /docker compose file/i})).toContainText("# pinned");

        const previewRequest = page.waitForRequest(
            (request) => request.url().endsWith("/api/stacks/my-app/preview") && request.method() === "POST",
        );
        await page.getByRole("button", {name: "Save compose file"}).click();

        const body = (await previewRequest).postDataJSON() as {composeContent: string};
        expect(body.composeContent).toContain("x-docktor");
        expect(body.composeContent).toContain("health-probe");
        expect(body.composeContent).toContain("http://localhost:8080/health");
        expect(body.composeContent).toContain("# pinned");

        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Review changes to My App");
    });

    test("a non-container host shows the inline error and never reaches the compose buffer", async ({page}) => {
        await mockStackConfigPage(page);
        await page.goto("/stacks/my-app/config");

        await page.getByRole("switch", {name: "Probe web over HTTP"}).click();
        const urlInput = page.getByLabel("Probe URL");
        await urlInput.fill("http://169.254.169.254/latest/meta-data");
        await urlInput.blur();

        await expect(
            page.getByText(
                "The host must be localhost, 127.0.0.1, or [::1]. Docktor sends the request to this service's container.",
            ),
        ).toBeVisible();
        await expect(page.getByRole("textbox", {name: /docker compose file/i})).not.toContainText("health-probe");
        await expect(page.getByRole("button", {name: "Save compose file"})).toBeDisabled();
    });

    test("a long probe URL scrolls inside its input at phone width instead of wrapping or overflowing the page", async ({
        page,
    }) => {
        await page.setViewportSize({width: 412, height: 915});
        await mockStackConfigPage(page);
        await page.goto("/stacks/my-app/config");

        await page.getByRole("switch", {name: "Probe web over HTTP"}).click();
        const urlInput = page.getByLabel("Probe URL");
        await urlInput.fill(`http://localhost:8080/${"health-check-segment/".repeat(12)}`);

        const metrics = await urlInput.evaluate((element) => ({
            inputScrollable: element.scrollWidth > element.clientWidth,
            inputHeight: element.getBoundingClientRect().height,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }));
        expect(metrics.inputScrollable).toBe(true);
        expect(metrics.inputHeight).toBeLessThan(48);
        expect(metrics.pageOverflow).toBe(false);
    });
});
