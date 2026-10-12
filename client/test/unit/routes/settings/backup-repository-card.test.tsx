import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BackupRepositoryCard} from "@/routes/app/settings/components/backup-repository-card";
import {getBackupSettings, getResticStatus, saveBackupSettings, type BackupSettings} from "@/lib/backups-api";

vi.mock("@/lib/backups-api", () => ({
    getBackupSettings: vi.fn(),
    saveBackupSettings: vi.fn(),
    getResticStatus: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => {})),
    },
}));

// jsdom doesn't implement pointer capture or scrollIntoView, which Radix Select
// needs when opened through userEvent (same shim as proxy-tab.test.tsx).
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
}

vi.setConfig({testTimeout: 15000});

const mockGetBackupSettings = vi.mocked(getBackupSettings);
const mockSaveBackupSettings = vi.mocked(saveBackupSettings);
const mockGetResticStatus = vi.mocked(getResticStatus);

function settings(overrides: Partial<BackupSettings> = {}): BackupSettings {
    return {
        repoType: "local",
        repoPath: null,
        sftpHost: null,
        sftpUser: null,
        s3Endpoint: null,
        s3Bucket: null,
        s3AccessKey: null,
        hasPassword: false,
        hasSftpKey: false,
        hasS3SecretKey: false,
        ...overrides,
    };
}

beforeEach(() => {
    mockGetBackupSettings.mockReset().mockResolvedValue(settings());
    mockSaveBackupSettings.mockReset().mockResolvedValue(settings());
    mockGetResticStatus.mockReset().mockResolvedValue({available: true, version: "0.17.0"});
});

describe("BackupRepositoryCard", () => {
    it("keeps the repository type dropdown but offers only Local", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.click(await screen.findByRole("combobox", {name: "Repository type"}));

        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual(["Local"]);
    });

    it("does not show remote repository fields, even for a previously stored remote type", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({repoType: "sftp", sftpHost: "backup.example.com"}));
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText(/restic password/i)).toBeInTheDocument();
        expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Bucket name")).not.toBeInTheDocument();
    });

    it("saves without remote-repository fields", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.click(await screen.findByRole("button", {name: "Save repository settings"}));

        expect(mockSaveBackupSettings).toHaveBeenCalledWith({
            repoType: "local",
            repoPath: null,
            password: null,
        });
    });
});
