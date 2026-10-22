import {describe, expect, it} from "vitest";
import type {MigrationLedgerEntry} from "@docktor/shared";
import type {ProjectContainer} from "../../../src/domain/compose-project.js";
import {
    allServicesRunning,
    compensationOrder,
    InMemoryMigrationLedger,
    RESTART_VERIFY_INTERVAL_MS,
    RESTART_VERIFY_TIMEOUT_MS,
} from "../../../src/domain/migration-rollback.js";

const STOPPED: MigrationLedgerEntry = {
    kind: "stopped_old_stack",
    project: "memos",
    composePath: "/opt/memos/docker-compose.yml",
    runningBefore: ["web"],
    sharesProjectWithNewStack: false,
};
const DIRECTORY: MigrationLedgerEntry = {kind: "created_directory", stackId: "memos-new"};
const RECORD: MigrationLedgerEntry = {kind: "created_record", stackId: "memos-new"};

function container(service: string | null, running: boolean): ProjectContainer {
    return {id: `${service}-1`, name: `memos-${service}-1`, service, running, mounts: []};
}

describe("InMemoryMigrationLedger", () => {
    it("starts empty", () => {
        expect(new InMemoryMigrationLedger().entries()).toEqual([]);
    });

    it("keeps the entries in the order they were recorded", async () => {
        const ledger = new InMemoryMigrationLedger();

        await ledger.record(STOPPED);
        await ledger.record(DIRECTORY);
        await ledger.record(RECORD);

        expect(ledger.entries()).toEqual([STOPPED, DIRECTORY, RECORD]);
    });
});

describe("compensationOrder", () => {
    it("undoes the entries in reverse without changing the input", () => {
        const entries = [STOPPED, DIRECTORY, RECORD];

        expect(compensationOrder(entries)).toEqual([RECORD, DIRECTORY, STOPPED]);
        expect(entries).toEqual([STOPPED, DIRECTORY, RECORD]);
    });

    it("returns nothing for an empty ledger", () => {
        expect(compensationOrder([])).toEqual([]);
    });
});

describe("allServicesRunning", () => {
    it("is true when every service has a running container", () => {
        expect(allServicesRunning(["db", "web"], [container("web", true), container("db", true)])).toBe(true);
    });

    it("is false when a service has only a stopped container", () => {
        expect(allServicesRunning(["db", "web"], [container("web", true), container("db", false)])).toBe(false);
    });

    it("is false when a service has no container at all", () => {
        expect(allServicesRunning(["db", "web"], [container("web", true)])).toBe(false);
    });

    it("is true when one replica of a scaled service runs", () => {
        expect(allServicesRunning(["web"], [container("web", false), container("web", true)])).toBe(true);
    });

    it("ignores containers of other services and containers without a service label", () => {
        expect(allServicesRunning(["web"], [container(null, true), container("job", true)])).toBe(false);
    });

    it("is false for no services, because nothing was verified", () => {
        expect(allServicesRunning([], [container("web", true)])).toBe(false);
    });
});

describe("restart verification timing", () => {
    it("waits up to 90 seconds, checking every 2 seconds", () => {
        expect(RESTART_VERIFY_TIMEOUT_MS).toBe(90_000);
        expect(RESTART_VERIFY_INTERVAL_MS).toBe(2_000);
    });
});
