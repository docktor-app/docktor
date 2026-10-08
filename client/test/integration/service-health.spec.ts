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
            healthStatus: "unhealthy",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        },
    ],
    deployments: [],
    statusLogs: [],
};

const webHealthEvents = [
    {
        id: "evt-2",
        serviceName: "web",
        fromStatus: "healthy",
        toStatus: "unhealthy",
        source: "http-probe",
        message: "Responded with HTTP 503 after 3 failed checks",
        createdAt: "2026-10-08T08:00:00Z",
    },
    {
        id: "evt-1",
        serviceName: "web",
        fromStatus: null,
        toStatus: "healthy",
        source: "docker-healthcheck",
        message: null,
        createdAt: "2026-10-08T07:00:00Z",
    },
];

async function mockStackPage(page: Page, healthEvents: unknown, stack: unknown = mockStackDetail) {
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
    // Overrides the default empty stub registered by fixtures.ts.
    await page.route("**/api/stacks/my-app/health-events**", (route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(healthEvents)}),
    );
}

test.describe("Service health history (#23)", () => {
    test("History button expands the service's transitions and collapses again", async ({page}) => {
        await mockStackPage(page, webHealthEvents);

        await page.goto("/stacks/my-app");

        const toggle = page.getByRole("button", {name: "Show health history for web"});
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");

        await toggle.click();

        await expect(page.getByRole("button", {name: "Hide health history for web"})).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        await expect(page.getByText("Health history", {exact: true})).toBeVisible();
        await expect(page.getByText("healthy → unhealthy")).toBeVisible();
        await expect(page.getByText("unknown → healthy")).toBeVisible();
        // "HTTP probe" also labels the Status cell (probed service), so scope to the panel.
        const panel = page.locator("#health-history-web");
        await expect(panel.getByText("HTTP probe", {exact: true})).toBeVisible();
        await expect(panel.getByText("Docker healthcheck", {exact: true})).toBeVisible();
        await expect(page.getByRole("row", {name: /web/}).first().getByText("HTTP probe", {exact: true})).toBeVisible();
        await expect(page.getByText("Responded with HTTP 503 after 3 failed checks")).toBeVisible();

        await page.getByRole("button", {name: "Hide health history for web"}).click();
        await expect(page.getByText("Health history", {exact: true})).toHaveCount(0);
    });

    // UI-SPEC UI Considerations (long-text): the table cell is whitespace-nowrap,
    // so a 200-character probe message used to run ~1600px wide and scroll the page.
    test("a 200-character probe message wraps inside the panel without horizontal page overflow", async ({page}) => {
        const longMessage = `${"Responded with HTTP 503 ".repeat(8).slice(0, 190)} after 3 failed checks`;
        const unbroken = `http://localhost:8080/health?${"x".repeat(170)}`;
        await mockStackPage(page, [
            {...webHealthEvents[0], id: "evt-long", message: longMessage},
            {...webHealthEvents[1], id: "evt-unbroken", message: unbroken},
        ]);

        await page.goto("/stacks/my-app");
        await page.getByRole("button", {name: "Show health history for web"}).click();
        const panel = page.locator("#health-history-web");
        await expect(panel.getByText(longMessage)).toBeVisible();
        await expect(panel.getByText(unbroken)).toBeVisible();

        const overflow = await page.evaluate(() => {
            const viewport = document.querySelector<HTMLElement>(
                '#health-history-web [data-slot="scroll-area-viewport"]',
            );
            return {
                pageScroll: document.documentElement.scrollWidth,
                pageClient: document.documentElement.clientWidth,
                panelScroll: viewport?.scrollWidth ?? -1,
                panelClient: viewport?.clientWidth ?? -2,
            };
        });
        expect(overflow.pageScroll).toBeLessThanOrEqual(overflow.pageClient);
        expect(overflow.panelScroll).toBeLessThanOrEqual(overflow.panelClient);
    });

    test("serves every service from one stack-wide fetch; opening panels sends no further request", async ({page}) => {
        const twoServiceStack = {
            ...mockStackDetail,
            services: [
                ...mockStackDetail.services,
                {...mockStackDetail.services[0], id: "svc-2", serviceName: "db", image: "postgres"},
            ],
        };
        const dbEvent = {
            id: "evt-3",
            serviceName: "db",
            fromStatus: "starting",
            toStatus: "healthy",
            source: "docker-healthcheck",
            message: null,
            createdAt: "2026-10-08T07:30:00Z",
        };
        const healthRequestUrls: string[] = [];
        await mockStackPage(page, [], twoServiceStack);
        await page.route("**/api/stacks/my-app/health-events**", (route) => {
            healthRequestUrls.push(route.request().url());
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([...webHealthEvents, dbEvent]),
            });
        });

        await page.goto("/stacks/my-app");
        await page.getByRole("button", {name: "Show health history for web"}).click();
        await expect(page.getByText("healthy → unhealthy")).toBeVisible();

        // The events are loaded at this point. React StrictMode double-invokes
        // mount effects in the dev server (as for every other hook), so the
        // count is not asserted as 1 — what matters is that opening panels
        // adds no request and that no request is scoped to a single service.
        const requestsAfterFirstPanel = healthRequestUrls.length;

        await page.getByRole("button", {name: "Show health history for db"}).click();
        await expect(page.getByText("starting → healthy")).toBeVisible();

        expect(healthRequestUrls).toHaveLength(requestsAfterFirstPanel);
        expect(healthRequestUrls.every((url) => !url.includes("serviceName="))).toBe(true);
    });
});
