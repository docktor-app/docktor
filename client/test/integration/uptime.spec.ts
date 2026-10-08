import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStackDetail = {
    id: "my-app",
    displayName: "My App",
    description: "A test application",
    hostPath: "/stacks/my-app",
    status: "RUNNING",
    configChanged: false,
    lastKnownHash: "abc123",
    volumeSizeBytes: 1_073_741_824,
    backupSizeBytes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    services: [
        {
            id: "svc-1",
            stackId: "my-app",
            serviceName: "web",
            image: "nginx",
            imageTag: "latest",
            ports: null,
            volumes: null,
            containerId: "container-1",
            containerState: "running",
            healthStatus: "healthy",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        },
    ],
    deployments: [],
    statusLogs: [],
};

const uptimeSummary = {
    stackId: "my-app",
    windowDays: 30,
    windowStart: "2026-09-08T00:00:00.000Z",
    since: "2026-09-08T00:00:00.000Z",
    percent: 99.95,
    upMs: 2_591_000_000,
    downMs: 1_000_000,
    incidents: [] as unknown[],
};

async function mockStackPage(page: Page, uptime: unknown, stack: unknown = mockStackDetail) {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(mockSession)}),
    );
    await page.route("**/api/stacks/my-app", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(stack)}),
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
    await page.route("**/api/stacks/my-app/events", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: "[]"}),
    );
    // Overrides the default empty summary registered by fixtures.ts.
    await page.route("**/api/stacks/my-app/uptime", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(uptime)}),
    );
}

test.describe("Stack uptime (#24, #27)", () => {
    test("the Overview shows the truncated uptime percentage and the volumes' disk usage", async ({page}) => {
        await mockStackPage(page, uptimeSummary);

        await page.goto("/stacks/my-app");

        await expect(page.getByText("Uptime (last 30 days)")).toBeVisible();
        await expect(page.getByText("99.9%", {exact: true})).toBeVisible();
        await expect(page.getByText("Incidents (last 30 days)")).toBeVisible();
        await expect(page.getByText("Disk Used (volumes)")).toBeVisible();
        await expect(page.getByText("1.00 GB", {exact: true})).toBeVisible();
    });

    test("the uptime row sits above the Services section", async ({page}) => {
        await mockStackPage(page, uptimeSummary);

        await page.goto("/stacks/my-app");

        const uptimeBox = await page.getByText("Uptime (last 30 days)").boundingBox();
        const servicesBox = await page.getByRole("heading", {name: "Services"}).boundingBox();
        expect(uptimeBox).not.toBeNull();
        expect(servicesBox).not.toBeNull();
        expect(uptimeBox!.y).toBeLessThan(servicesBox!.y);
    });
});
