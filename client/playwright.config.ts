import {defineConfig, devices} from "@playwright/test";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "..");

// Parallel executors (later phase-11 waves running in separate worktrees)
// each pass a distinct PLAYWRIGHT_PORT so reuseExistingServer can never
// attach to another worktree's dev server.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? "5173");

export default defineConfig({
    testDir: "test/integration",
    globalTeardown: "./test/playwright-teardown.ts",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // Unbounded local parallelism (Playwright's default of ~half the CPU
    // cores) launches enough concurrent Chromium instances to starve a
    // memory-constrained host and produce spurious per-test timeouts that
    // have nothing to do with the app or the specs — verified repeatedly by
    // re-running the same failing tests serially, where every one of them
    // passes in a few seconds. Matching CI's workers:1 locally trades some
    // wall-clock time for a suite that is actually reliable to run by hand.
    workers: 1,
    reporter: [["list"], ["html", {outputFolder: ".test/integration/report"}]],
    outputDir: ".test/integration/tests",
    snapshotDir: ".test/integration/snapshots",
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: {...devices["Desktop Chrome"]},
        },
    ],
    webServer: {
        command: `yarn workspace @docktor/client exec vite --port ${PORT} --strictPort`,
        cwd: monorepoRoot,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
    },
});
