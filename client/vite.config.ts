import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import istanbul from "vite-plugin-istanbul";
import {readFileSync} from "node:fs";
import * as path from "node:path";

// client/package.json always carries a version field
const {version} = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {version: string};

export default defineConfig({
    // The sidebar shows this version (UI-01, D-02); Phase 21 bumps package.json and the block follows
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [
        react(),
        tailwindcss(),
        // Instrument source with Istanbul counters when running Playwright tests
        process.env.VITE_COVERAGE === "true" &&
            istanbul({
                include: "src/**",
                exclude: ["node_modules", "src/components/ui/**"],
                extension: [".ts", ".tsx"],
                requireEnv: false,
            }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: {
            "/api": "http://localhost:3000",
        },
    },
    build: {
        outDir: "dist",
    },
});
