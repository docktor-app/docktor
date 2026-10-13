import type {EnvironmentReport} from "@docktor/shared"

// Module store for the boot-time environment report (#7, D-13). index.ts sets
// it right after the check, before app.js is loaded; the status service reads
// it on every request. Tests that build the app without running index.ts
// (integration suites, Playwright) therefore see the empty default.
let report: EnvironmentReport = {warnings: []}

// Copies on the way in and out keep the stored report immutable for callers.
export function setEnvironmentReport(next: EnvironmentReport): void {
    report = structuredClone(next)
}

export function getEnvironmentReport(): EnvironmentReport {
    return structuredClone(report)
}
