import { beforeEach, describe, expect, it, vi } from "vitest"
import { DiskChecker } from "../../../src/jobs/disk-checker.js"

vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }))

import { statfs } from "node:fs/promises"

const mockStatfs = vi.mocked(statfs)

function createMockBus() {
    return {
        emit: vi.fn(),
    }
}

function createMockSettings() {
    return {
        getMany: vi.fn(),
        findLastDiskAlert: vi.fn(),
        setDiskAlertActive: vi.fn(),
    }
}

// Helper to build statfs return value from percent free
function makeStatfs(freePercent: number, totalBytes: bigint = 100n * 1024n * 1024n * 1024n) {
    const bsize = 4096
    const blocks = Number(totalBytes / BigInt(bsize))
    const bavail = Math.floor((blocks * freePercent) / 100)
    return { bsize, blocks, bavail, bfree: bavail, files: 0, ffree: 0 }
}

// Helper to build statfs return value from free bytes
function makeStatfsFromBytes(freeBytes: bigint, totalBytes: bigint = 100n * 1024n * 1024n * 1024n) {
    const bsize = 4096
    const blocks = Number(totalBytes / BigInt(bsize))
    const bavail = Number(freeBytes / BigInt(bsize))
    return { bsize, blocks, bavail, bfree: bavail, files: 0, ffree: 0 }
}

describe("DiskChecker", () => {
    let checker: DiskChecker
    let bus: ReturnType<typeof createMockBus>
    let settings: ReturnType<typeof createMockSettings>

    beforeEach(() => {
        vi.clearAllMocks()
        bus = createMockBus()
        settings = createMockSettings()
        checker = new DiskChecker(bus as any, settings as any)

        // Default settings: disk warning enabled, thresholds at defaults
        settings.getMany.mockResolvedValue({
            "notify.diskWarning": "true",
            "disk.thresholdPercent": "10",
            "disk.thresholdBytes": "2147483648",
        })
        settings.findLastDiskAlert.mockResolvedValue(null)
    })

    it("emits disk.threshold_crossed when free percent below threshold", async () => {
        // 5% free — below 10% threshold
        mockStatfs.mockResolvedValue(makeStatfs(5) as any)
        settings.findLastDiskAlert.mockResolvedValue({ active: false })

        await checker.check()

        expect(bus.emit).toHaveBeenCalledWith(
            "disk.threshold_crossed",
            expect.objectContaining({ monitorPath: "/var/lib/docker", thresholdDescription: "below 10%" }),
        )
    })

    it("emits disk.threshold_crossed when free bytes below threshold", async () => {
        // 1GB free — below 2GB threshold
        const oneGB = 1n * 1024n * 1024n * 1024n
        mockStatfs.mockResolvedValue(makeStatfsFromBytes(oneGB) as any)
        settings.findLastDiskAlert.mockResolvedValue({ active: false })

        await checker.check()

        expect(bus.emit).toHaveBeenCalledWith("disk.threshold_crossed", expect.any(Object))
    })

    it("suppresses duplicate when alert already active", async () => {
        mockStatfs.mockResolvedValue(makeStatfs(5) as any)
        settings.findLastDiskAlert.mockResolvedValue({ active: true })

        await checker.check()

        expect(bus.emit).not.toHaveBeenCalled()
    })

    it("clears alert when disk recovers above thresholds", async () => {
        // 50% free — above both thresholds
        mockStatfs.mockResolvedValue(makeStatfs(50) as any)
        settings.findLastDiskAlert.mockResolvedValue({ active: true })

        await checker.check()

        expect(settings.setDiskAlertActive).toHaveBeenCalledWith(false)
        expect(bus.emit).not.toHaveBeenCalled()
    })

    it("skips check when toggle is disabled", async () => {
        settings.getMany.mockResolvedValue({
            "notify.diskWarning": "false",
            "disk.thresholdPercent": "10",
            "disk.thresholdBytes": "2147483648",
        })

        await checker.check()

        expect(mockStatfs).not.toHaveBeenCalled()
        expect(bus.emit).not.toHaveBeenCalled()
    })

    it("accepts custom monitor path via constructor", async () => {
        const customChecker = new DiskChecker(
            bus as any,
            settings as any,
            "/custom/path"
        )
        mockStatfs.mockResolvedValue(makeStatfs(50) as any)
        settings.findLastDiskAlert.mockResolvedValue(null)

        await customChecker.check()

        expect(mockStatfs).toHaveBeenCalledWith("/custom/path")
    })

    it("completes normally when the bus emit throws — a failing notification subscriber can't strand the check", async () => {
        mockStatfs.mockResolvedValue(makeStatfs(5) as any)
        settings.findLastDiskAlert.mockResolvedValue({ active: false })
        bus.emit.mockImplementation(() => {
            throw new Error("subscriber exploded")
        })
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        await expect(checker.check()).resolves.toBeUndefined()

        expect(settings.setDiskAlertActive).toHaveBeenCalledWith(true)
        consoleError.mockRestore()
    })

    it("defaults to /var/lib/docker when no path provided", async () => {
        mockStatfs.mockResolvedValue(makeStatfs(50) as any)
        settings.findLastDiskAlert.mockResolvedValue(null)

        await checker.check()

        expect(mockStatfs).toHaveBeenCalledWith("/var/lib/docker")
    })

    it("does not throw when settings.getMany rejects — fault isolation (fire-and-forget void this.check() would otherwise crash the whole process)", async () => {
        settings.getMany.mockRejectedValue(new Error("relation \"public.Setting\" does not exist"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        await expect(checker.check()).resolves.toBeUndefined()

        expect(consoleError).toHaveBeenCalledWith("[DiskChecker] check failed:", expect.any(Error))
        expect(mockStatfs).not.toHaveBeenCalled()

        consoleError.mockRestore()
    })
})
