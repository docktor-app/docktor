import {defineConfig} from "vitest/config";
import react from "@vitejs/plugin-react";
import {readFileSync} from "node:fs";
import * as path from "node:path";

// client/package.json always carries a version field
const {version} = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {version: string};

export default defineConfig({
    // The sidebar shows this version (UI-01, D-02); Phase 21 bumps package.json and the block follows
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./test/setup.ts"],
        include: ["test/unit/**/*.test.{ts,tsx}"],
        coverage: {
            enabled: true,
            provider: "v8",
            reporter: ["lcov", "text"],
            reportsDirectory: ".test/coverage",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/generated/**", "src/components/ui/**"],

        },
    },
});
