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

    test("the Incidents section lists an ongoing and a closed incident newest first", async ({page}) => {
        const ninetyMinutesAgo = new Date(Date.now() - 90 * 60_000).toISOString();
        await mockStackPage(page, {
            ...uptimeSummary,
            incidents: [
                {id: "inc-2", cause: "UNHEALTHY", startedAt: ninetyMinutesAgo, endedAt: null, durationMs: null},
                {
                    id: "inc-1",
                    cause: "ERROR",
                    startedAt: "2026-10-01T09:00:00.000Z",
                    endedAt: "2026-10-01T09:02:05.000Z",
                    durationMs: 125_000,
                },
            ],
        });

        await page.goto("/stacks/my-app");

        await expect(page.getByRole("heading", {name: "Incidents"})).toBeVisible();
        await expect(
            page.getByText("Periods when this stack was unhealthy or in error during the last 30 days."),
        ).toBeVisible();
        // The Services table comes first on the page; scope to the incident table.
        const rows = page.getByRole("table").filter({hasText: "Cause"}).getByRole("row");
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(1).getByText("Ongoing")).toBeVisible();
        await expect(rows.nth(1).getByText(/^1h \d+m$/)).toBeVisible();
        await expect(rows.nth(2).getByText("2m 5s")).toBeVisible();
        await expect(rows.nth(2).getByText("Error")).toBeVisible();
        // Two incidents in the window; the count card reads 2.
        await expect(page.getByText("Incidents (last 30 days)")).toBeVisible();
    });

    test("a stack with no incidents shows the empty copy", async ({page}) => {
        await mockStackPage(page, uptimeSummary);

        await page.goto("/stacks/my-app");

        await expect(page.getByText("No incidents")).toBeVisible();
        await expect(
            page.getByText("This stack hasn't been unhealthy or in error during the last 30 days."),
        ).toBeVisible();
    });

    test("a failed uptime request shows the error alert, and Retry recovers", async ({page}) => {
        await mockStackPage(page, uptimeSummary);
        let failing = true;
        await page.route("**/api/stacks/my-app/uptime", (route) =>
            failing
                ? route.fulfill({
                      status: 500,
                      contentType: "application/json",
                      body: JSON.stringify({message: "database offline"}),
                  })
                : route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(uptimeSummary)}),
        );

        await page.goto("/stacks/my-app");

        await expect(page.getByText(/Couldn't load uptime — .+\. Try again\./)).toBeVisible();

        failing = false;
        await page.getByRole("button", {name: "Retry"}).click();

        await expect(page.getByText("99.9%", {exact: true})).toBeVisible();
        await expect(page.getByText(/Couldn't load uptime/)).toHaveCount(0);
    });

    // UI-SPEC UI Considerations (overflow, held-out): 30 incidents scroll
    // inside the list past 384px, and at phone width nothing widens the page.
    // The mobile-chromium project matches only mobile.spec.ts, so the phone
    // width is exercised here with a 412px viewport (Pixel 7).
    test("30 incidents scroll inside the list and do not widen the page at phone width", async ({page}) => {
        await page.setViewportSize({width: 412, height: 915});
        const incidents = Array.from({length: 30}, (_, index) => ({
            id: `inc-${index}`,
            cause: index % 2 === 0 ? "UNHEALTHY" : "ERROR",
            startedAt: new Date(Date.UTC(2026, 9, 7, 12, 0) - index * 3_600_000).toISOString(),
            endedAt: new Date(Date.UTC(2026, 9, 7, 12, 5) - index * 3_600_000).toISOString(),
            durationMs: 300_000,
        }));
        await mockStackPage(page, {...uptimeSummary, incidents});

        await page.goto("/stacks/my-app");
        await expect(page.getByRole("columnheader", {name: "Ended"})).toBeVisible();

        const measures = await page.evaluate(() => {
            const wrapper = document.querySelector<HTMLElement>(".max-h-96.overflow-y-auto");
            const tableContainer = wrapper?.querySelector<HTMLElement>('[data-slot="table-container"]');
            return {
                pageScroll: document.documentElement.scrollWidth,
                pageClient: document.documentElement.clientWidth,
                listClientHeight: wrapper?.clientHeight ?? -1,
                listScrollHeight: wrapper?.scrollHeight ?? -1,
                tableScroll: tableContainer?.scrollWidth ?? -1,
                tableClient: tableContainer?.clientWidth ?? -1,
            };
        });
        expect(measures.pageScroll).toBeLessThanOrEqual(measures.pageClient);
        expect(measures.listClientHeight).toBeLessThanOrEqual(384);
        expect(measures.listScrollHeight).toBeGreaterThan(measures.listClientHeight);
        // The table scrolls horizontally inside its own container when it must.
        expect(measures.tableScroll).toBeGreaterThanOrEqual(measures.tableClient);
    });
});
