import {describe, expect, it} from "vitest";
import {BACKUP_TRIGGER_LABELS, formatDuration, formatSize} from "@/lib/backup-format";

describe("formatDuration", () => {
    it("returns 'In progress...' when completedAt is null", () => {
        expect(formatDuration("2026-08-30T10:00:00Z", null)).toBe("In progress...");
    });

    it("returns '< 1s' for sub-second durations", () => {
        expect(formatDuration("2026-08-30T10:00:00.000Z", "2026-08-30T10:00:00.500Z")).toBe("< 1s");
    });

    it("returns seconds only under a minute", () => {
        expect(formatDuration("2026-08-30T10:00:00Z", "2026-08-30T10:00:45Z")).toBe("45s");
    });

    it("returns minutes and seconds over a minute", () => {
        expect(formatDuration("2026-08-30T10:00:00Z", "2026-08-30T10:01:05Z")).toBe("1m 5s");
    });
});

describe("formatSize", () => {
    it("returns '-' for null", () => {
        expect(formatSize(null)).toBe("-");
    });

    it("returns '-' for a non-numeric string", () => {
        expect(formatSize("not-a-number")).toBe("-");
    });

    it("formats bytes under 1KB", () => {
        expect(formatSize("512")).toBe("512 B");
    });

    it("formats kilobytes", () => {
        expect(formatSize("1536")).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
        expect(formatSize(String(2 * 1024 * 1024))).toBe("2.0 MB");
    });

    it("formats gigabytes", () => {
        expect(formatSize(String(2 * 1024 * 1024 * 1024))).toBe("2.00 GB");
    });
});

describe("BACKUP_TRIGGER_LABELS", () => {
    it("maps every trigger to its display label", () => {
        expect(BACKUP_TRIGGER_LABELS.MANUAL).toBe("Manual");
        expect(BACKUP_TRIGGER_LABELS.SCHEDULED).toBe("Scheduled");
        expect(BACKUP_TRIGGER_LABELS.RESTORE).toBe("Restore");
    });
});
