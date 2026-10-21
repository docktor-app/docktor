import {expect, test} from "./fixtures";
import type {Page} from "@playwright/test";

// Phase 20 browser proof for the CSS-dependent promises jsdom cannot check:
// one status vocabulary across surfaces (UI-02), the self-hosted mono font
// (UI-03), the scrollbar-free tab bar (UI-04), the table frame (UI-08) and the
// compact icon-control sizes at md and up (A11Y-01; the 44px phone half lives
// in mobile.spec.ts). Computed styles and bounding boxes only, no screenshot
// baselines. Self-sufficient: every outbound **/api/** call is stubbed here.

const mockUser = {id: "1", name: "E2E Tester", email: "test@example.com"};
const mockSession = {session: {id: "sess-1", userId: "1"}, user: mockUser};

const mockStack = {
    id: "my-app",
    displayName: "My App",
    description: "A test application",
    hostPath: "/stacks/my-app",
    status: "RUNNING",
    configChanged: false,
    configError: null,
    lastKnownHash: "abc123",
    backupSchedule: "0 3 * * *",
    isProtected: false,
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
            containerState: "running",
            healthStatus: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        },
    ],
};

const mockStackDetail = {
    ...mockStack,
    deployments: [
        {
            id: "dep-1",
            composeHash: "abc123",
            deployedAt: "2026-01-01T12:00:00Z",
            success: true,
            errorMessage: null,
        },
    ],
    statusLogs: [
        {
            id: "log-1",
            fromStatus: null,
            toStatus: "DRAFT",
            message: "Stack created",
            createdAt: "2026-01-01T00:00:00Z",
        },
        {
            id: "log-2",
            fromStatus: "DEPLOYING",
            toStatus: "RUNNING",
            message: "Deployment finished",
            createdAt: "2026-01-01T12:00:00Z",
        },
    ],
};

const mockStoppedStack = {
    ...mockStack,
    id: "db-stack",
    displayName: "Database Stack",
    description: null,
    hostPath: "/stacks/db-stack",
    status: "STOPPED",
    services: [],
};

const mockBackupConfig = {
    useGlobalSchedule: false,
    schedule: "0 2 * * *",
    useGlobalRetention: false,
    retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 6},
    preHook: "",
    postHook: "",
    globalSchedule: "0 3 * * *",
    globalRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
};

const mockProxyConfig = {
    id: "cfg-1",
    stackId: "my-app",
    serviceName: "web",
    domain: "app.example.com",
    internalPort: 80,
    tlsEnabled: true,
    certStatus: "pending",
    certMessage: null,
    certCheckedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
};

function fulfillJson(body: unknown) {
    return {status: 200, contentType: "application/json", body: JSON.stringify(body)};
}

async function mockAuthenticated(page: Page) {
    await page.route("**/api/auth/get-session", (route) => route.fulfill(fulfillJson(mockSession)));
}

async function mockStacksList(page: Page, stacks: readonly unknown[] = [mockStack, mockStoppedStack]) {
    await page.route("**/api/stacks", (route) => {
        if (route.request().method() === "GET") return route.fulfill(fulfillJson(stacks));
        return route.continue();
    });
}

async function mockBackupDefaults(page: Page) {
    await page.route("**/api/settings/backup-defaults", (route) =>
        route.fulfill(
            fulfillJson({
                defaultSchedule: "0 3 * * *",
                defaultRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
            }),
        ),
    );
}

/** Full stub surface for every "/stacks/my-app*" page; every tab's fetches fire on mount. */
async function mockStackDetailSurface(page: Page) {
    await page.route("**/api/stacks/my-app", (route) => route.fulfill(fulfillJson(mockStackDetail)));
    await page.route("**/api/stacks/my-app/compose", (route) =>
        route.fulfill(fulfillJson({content: "services:\n  web:\n    image: nginx:latest"})),
    );
    await page.route("**/api/stacks/my-app/env", (route) => route.fulfill(fulfillJson({content: "FOO=bar"})));
    await page.route("**/api/stacks/my-app/events", (route) => route.fulfill(fulfillJson([])));
    await page.route("**/api/stacks/my-app/logs**", (route) =>
        route.fulfill({status: 200, contentType: "text/event-stream", body: ""}),
    );
    await page.route("**/api/stacks/my-app/volume-warnings", (route) => route.fulfill(fulfillJson({warnings: []})));
    await page.route("**/api/stacks/my-app/backup-config", (route) => route.fulfill(fulfillJson(mockBackupConfig)));
    await page.route("**/api/stacks/my-app/backups", (route) => route.fulfill(fulfillJson([])));
    await page.route("**/api/stacks/my-app/snapshots", (route) => route.fulfill(fulfillJson([])));
    await page.route("**/api/stacks/my-app/proxy-configs", (route) => route.fulfill(fulfillJson([mockProxyConfig])));
    await page.route("**/api/settings/proxy", (route) =>
        route.fulfill(fulfillJson({deployed: true, status: "RUNNING", acmeEmail: "", showInDashboard: false})),
    );
    await page.route("**/api/certificates", (route) => route.fulfill(fulfillJson([])));
}

/** Minimal stack factory; only the fields the stack list renders are needed. */
function makeStack(i: number) {
    return {
        ...mockStoppedStack,
        id: `stack-${i}`,
        displayName: `Stack ${i}`,
        hostPath: `/stacks/stack-${i}`,
    };
}

/** The Settings Proxy tab hosts ProxySettingsCard and CertificatesCard. */
async function mockSettingsProxyTab(page: Page) {
    await page.route("**/api/settings/proxy", (route) =>
        route.fulfill(fulfillJson({deployed: false, status: null, acmeEmail: "", showInDashboard: false})),
    );
    await page.route("**/api/certificates", (route) =>
        route.fulfill(
            fulfillJson([
                {
                    id: "cert-1",
                    domainPattern: "*.example.com",
                    expiresAt: "2027-01-01T00:00:00Z",
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-01T00:00:00Z",
                },
            ]),
        ),
    );
}

const TAB_BAR_VIEWPORTS = [
    {width: 1280, height: 900},
    {width: 768, height: 1024},
    {width: 375, height: 812},
] as const;

interface TabBarMetrics {
    readonly scrollHeight: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollbarWidth: string;
}

/** Reads the overflow metrics of the element wrapping the stack tab list. */
function readTabBarMetrics(page: Page): Promise<TabBarMetrics> {
    return page
        .getByRole("tablist")
        .locator("..")
        .evaluate((el) => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            scrollbarWidth: getComputedStyle(el).getPropertyValue("scrollbar-width"),
        }));
}

interface TableFrameStyle {
    readonly borderWidth: string;
    readonly borderRadius: string;
    readonly borderColor: string;
    readonly headerBackground: string;
}

/** Computed look of the first data table frame on the page. */
async function readTableFrameStyle(page: Page): Promise<TableFrameStyle> {
    const frame = page.locator('[data-slot="table-frame"]').first();
    await expect(frame).toBeVisible();
    return frame.evaluate((el) => {
        const style = getComputedStyle(el);
        const header = el.querySelector("thead");
        return {
            borderWidth: style.borderTopWidth,
            borderRadius: style.borderTopLeftRadius,
            borderColor: style.borderTopColor,
            headerBackground: header ? getComputedStyle(header).backgroundColor : "missing",
        };
    });
}

function expectFramedTable(style: TableFrameStyle) {
    expect(style.borderWidth).toBe("1px");
    expect(style.borderRadius).not.toBe("0px");
    expect(style.headerBackground).not.toBe("missing");
    expect(style.headerBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.headerBackground).not.toBe("transparent");
}

test.describe("Visual consistency (Phase 20)", () => {
    test.beforeEach(async ({page}) => {
        await mockAuthenticated(page);
    });

    test("the same stack status reads 'running' on every surface (UI-02)", async ({page}) => {
        await mockStacksList(page);
        await mockBackupDefaults(page);
        await mockStackDetailSurface(page);

        await page.goto("/");
        await expect(page.getByRole("heading", {name: "Dashboard"})).toBeVisible();
        await expect(
            page.getByRole("row").filter({hasText: "My App"}).getByText("running", {exact: true}),
        ).toBeVisible();

        await page.goto("/stacks");
        await expect(
            page.getByRole("row").filter({hasText: "My App"}).getByText("running", {exact: true}),
        ).toBeVisible();

        await page.goto("/stacks/my-app");
        await expect(page.locator('[data-slot="page-header"]').getByText("running", {exact: true})).toBeVisible();
        await expect(
            page.getByRole("row").filter({hasText: "nginx"}).getByText("running", {exact: true}),
        ).toBeVisible();
        await expect(page.getByText("deploying → running", {exact: true})).toBeVisible();
    });

    test("the dashboard loads Geist Mono from the app origin only (UI-03)", async ({page}) => {
        await mockStacksList(page);
        await mockBackupDefaults(page);

        const requestUrls: string[] = [];
        page.on("request", (request) => requestUrls.push(request.url()));

        await page.goto("/");
        const kpiValue = page.locator('[data-slot="stat-card"]').first().locator(".font-mono.text-2xl");
        await expect(kpiValue).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const appOrigin = new URL(page.url()).origin;
        // The dev client addresses its stubbed API on :3000 (client/src/lib/api.ts),
        // so the "no third-party host" check compares hostnames and holds the font
        // file itself to the exact app origin.
        const appHostname = new URL(appOrigin).hostname;
        const networkUrls = requestUrls
            .map((url) => new URL(url))
            .filter((url) => url.protocol === "http:" || url.protocol === "https:");
        expect(networkUrls.length).toBeGreaterThan(0);
        for (const url of networkUrls) {
            expect(url.hostname, `unexpected host for ${url.href}`).toBe(appHostname);
        }

        const fontUrls = requestUrls.filter((url) => url.includes("geist-mono") && new URL(url).pathname.endsWith(".woff2"));
        expect(fontUrls.length).toBeGreaterThanOrEqual(1);
        for (const url of fontUrls) {
            expect(new URL(url).origin).toBe(appOrigin);
        }

        const fontFamily = await kpiValue.evaluate((el) => getComputedStyle(el).fontFamily);
        expect(fontFamily).toMatch(/^"?Geist Mono Variable"?/);
        expect(await page.evaluate(() => document.fonts.check('16px "Geist Mono Variable"'))).toBe(true);
    });

    test("the stack tab bar shows no scrollbar at 1280, 768 and 375px (UI-04)", async ({page}) => {
        await mockStackDetailSurface(page);

        for (const viewport of TAB_BAR_VIEWPORTS) {
            const {width} = viewport;
            await page.setViewportSize(viewport);
            await page.goto("/stacks/my-app");
            await expect(page.getByRole("tablist")).toBeVisible();

            const metrics = await readTabBarMetrics(page);
            expect(metrics.scrollHeight, `vertical overflow at ${width}px`).toBeLessThanOrEqual(metrics.clientHeight);
            expect(metrics.scrollbarWidth).toBe("none");
            if (width >= 768) {
                expect(metrics.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(metrics.clientWidth);
            }

            if (width === 375) {
                await page.getByRole("tab", {name: "Proxy"}).click();
                const proxyTab = page.getByRole("tab", {name: "Proxy"});
                await expect(proxyTab).toHaveAttribute("aria-selected", "true");
                const wrapperBox = await page.getByRole("tablist").locator("..").boundingBox();
                await expect
                    .poll(async () => {
                        const tabBox = await proxyTab.boundingBox();
                        if (!tabBox || !wrapperBox) return false;
                        return tabBox.x >= wrapperBox.x - 1 && tabBox.x + tabBox.width <= wrapperBox.x + wrapperBox.width + 1;
                    })
                    .toBe(true);
            }

            await page.locator('[role="tab"][aria-selected="true"]').focus();
            for (let press = 0; press < 4; press += 1) {
                const scrollYBefore = await page.evaluate(() => window.scrollY);
                await page.keyboard.press("ArrowRight");
                const afterPress = await readTabBarMetrics(page);
                expect(afterPress.scrollHeight, `vertical overflow after arrow ${press + 1} at ${width}px`).toBeLessThanOrEqual(
                    afterPress.clientHeight,
                );
                expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);
            }
        }
    });

    test("data tables share the bordered frame in light and dark mode (UI-08)", async ({page}) => {
        await mockStacksList(page);

        await page.emulateMedia({colorScheme: "light"});
        await page.goto("/stacks");
        await expect(page.locator("html")).not.toHaveClass(/dark/);
        const light = await readTableFrameStyle(page);
        expectFramedTable(light);

        await page.emulateMedia({colorScheme: "dark"});
        await page.reload();
        await expect(page.locator("html")).toHaveClass(/dark/);
        const dark = await readTableFrameStyle(page);
        expectFramedTable(dark);
        expect(dark.borderColor).not.toBe(light.borderColor);
    });

    test("icon controls keep their compact size at md and up (A11Y-01)", async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await mockStackDetailSurface(page);

        await page.goto("/stacks/my-app");
        for (const name of ["Stack actions", "Toggle theme"]) {
            const box = await page.getByRole("button", {name}).boundingBox();
            expect(box?.width ?? 0, `${name} width`).toBeLessThanOrEqual(36);
            expect(box?.height ?? 0, `${name} height`).toBeLessThanOrEqual(36);
        }

        await mockStacksList(page, Array.from({length: 12}, (_, i) => makeStack(i + 1)));
        await page.goto("/stacks");
        for (const name of ["First page", "Previous page", "Next page", "Last page"]) {
            const box = await page.getByRole("button", {name}).boundingBox();
            expect(box?.width ?? 0, `${name} width`).toBeLessThanOrEqual(32);
            expect(box?.height ?? 0, `${name} height`).toBeLessThanOrEqual(32);
        }

        await mockSettingsProxyTab(page);
        await page.goto("/settings/proxy");
        const deleteBox = await page.getByRole("button", {name: "Delete *.example.com"}).boundingBox();
        expect(deleteBox?.width ?? 0).toBeLessThanOrEqual(36);
        expect(deleteBox?.height ?? 0).toBeLessThanOrEqual(36);
    });
});
