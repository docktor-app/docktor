/**
 * The running client version, injected at build time from client/package.json
 * by the `define` in vite.config.ts and vitest.config.ts (UI-01, CONTEXT D-02).
 * This module is the only reader of the `__APP_VERSION__` global.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
