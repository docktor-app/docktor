import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BackupRepositoryCard} from "@/routes/app/settings/components/backup-repository-card";
import {
    getBackupSettings, getResticStatus, saveBackupSettings, testBackupConnection,
    type BackupSettings,
} from "@/lib/backups-api";

vi.mock("@/lib/backups-api", () => ({
    getBackupSettings: vi.fn(),
    saveBackupSettings: vi.fn(),
    getResticStatus: vi.fn(),
    testBackupConnection: vi.fn(),
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
const mockTestBackupConnection = vi.mocked(testBackupConnection);

function settings(overrides: Partial<BackupSettings> = {}): BackupSettings {
    return {
        repoType: "local",
        repoPath: null,
        sftpHost: null,
        sftpUser: null,
        sftpPort: null,
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
    mockTestBackupConnection.mockReset().mockResolvedValue({ok: true, message: "Connection successful."});
});

async function chooseType(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
    await user.click(await screen.findByRole("combobox", {name: "Repository type"}));
    await user.click(await screen.findByRole("option", {name}));
}

describe("BackupRepositoryCard", () => {
    it("offers Local, SFTP and S3 as repository types", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.click(await screen.findByRole("combobox", {name: "Repository type"}));

        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual(["Local", "SFTP", "S3"]);
    });

    it("shows no remote fields for the local type", async () => {
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText(/restic password/i)).toBeInTheDocument();
        expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Bucket name")).not.toBeInTheDocument();
    });

    it("saves local settings without remote fields", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.click(await screen.findByRole("button", {name: "Save repository settings"}));

        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenCalledWith({
            repoType: "local",
            password: null,
        }));
    });

    it("populates the SFTP fields from stored settings and flags a saved key", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({
            repoType: "sftp", sftpHost: "backup.example.com", sftpUser: "backup", repoPath: "/upload/restic", hasSftpKey: true,
        }));
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText("Host")).toHaveValue("backup.example.com");
        expect(screen.getByLabelText("Username")).toHaveValue("backup");
        expect(screen.getByLabelText("Remote path")).toHaveValue("/upload/restic");
        expect(screen.getByText("(key saved)")).toBeInTheDocument();
    });

    it("saves SFTP settings including the private key", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await chooseType(user, "SFTP");
        await user.type(await screen.findByLabelText("Host"), "sftp");
        await user.type(screen.getByLabelText("Username"), "backup");
        await user.type(screen.getByLabelText("Remote path"), "/upload/restic");
        await user.click(screen.getByLabelText("Private key"));
        await user.paste("KEY-PEM");
        await user.click(screen.getByRole("button", {name: "Save repository settings"}));

        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenCalledWith({
            repoType: "sftp",
            sftpHost: "sftp",
            sftpUser: "backup",
            sftpPort: null,
            sftpKey: "KEY-PEM",
            repoPath: "/upload/restic",
            password: null,
        }));
    });

    it("blocks an SFTP save without host and username and shows field errors", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await chooseType(user, "SFTP");
        await user.click(await screen.findByRole("button", {name: "Save repository settings"}));

        expect(await screen.findByText("SFTP host is required")).toBeInTheDocument();
        expect(screen.getByText("SFTP username is required")).toBeInTheDocument();
        expect(mockSaveBackupSettings).not.toHaveBeenCalled();
    });

    it("saves S3 settings; a blank secret key keeps the stored one", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({
            repoType: "s3", s3Bucket: "docktor", s3AccessKey: "AKIA", s3Endpoint: "minio:9000", hasS3SecretKey: true,
        }));
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText("Bucket name")).toHaveValue("docktor");
        expect(screen.getByLabelText("Endpoint")).toHaveValue("minio:9000");
        expect(screen.getByText("(secret saved)")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Save repository settings"}));

        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenCalledWith({
            repoType: "s3",
            s3Endpoint: "minio:9000",
            s3Bucket: "docktor",
            s3AccessKey: "AKIA",
            s3SecretKey: null,
            password: null,
        }));
    });

    it("sends a blank optional field as an empty string so a stored value can be cleared", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({
            repoType: "s3", s3Bucket: "docktor", s3AccessKey: "AKIA", s3Endpoint: "minio:9000", hasS3SecretKey: true,
        }));
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.clear(await screen.findByLabelText("Endpoint"));
        await user.click(screen.getByRole("button", {name: "Save repository settings"}));

        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenCalledWith(
            expect.objectContaining({repoType: "s3", s3Endpoint: ""}),
        ));
    });

    it("disables the save button while the request is in flight", async () => {
        let finishSave: () => void = () => undefined;
        mockSaveBackupSettings.mockReturnValue(new Promise<void>((resolve) => {
            finishSave = resolve;
        }));
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        const save = await screen.findByRole("button", {name: "Save repository settings"});
        await user.click(save);

        await waitFor(() => expect(save).toBeDisabled());
        finishSave();
        await waitFor(() => expect(save).toBeEnabled());
    });

    it("keeps the browser from autofilling the restic password with the login password", async () => {
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText(/restic password/i)).toHaveAttribute("autocomplete", "new-password");
    });

    it("does not let the browser autofill the S3 secret key either", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({repoType: "s3"}));
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText("Secret key")).toHaveAttribute("autocomplete", "new-password");
    });

    it("populates the SFTP port from stored settings", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({repoType: "sftp", sftpHost: "nas", sftpUser: "backup", sftpPort: 2222}));
        render(<BackupRepositoryCard/>);

        expect(await screen.findByLabelText("Port")).toHaveValue(2222);
    });

    it("sends the SFTP port as a number, and null when it is left blank", async () => {
        mockGetBackupSettings.mockResolvedValue(settings({
            repoType: "sftp", sftpHost: "nas", sftpUser: "backup", sftpPort: 2222, hasSftpKey: true,
        }));
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await user.click(await screen.findByRole("button", {name: "Save repository settings"}));
        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenLastCalledWith(expect.objectContaining({sftpPort: 2222})));

        await user.clear(screen.getByLabelText("Port"));
        await user.click(screen.getByRole("button", {name: "Save repository settings"}));
        await waitFor(() => expect(mockSaveBackupSettings).toHaveBeenLastCalledWith(expect.objectContaining({sftpPort: null})));
    });

    it("shows an inline error for a host the server would reject", async () => {
        const user = userEvent.setup();
        render(<BackupRepositoryCard/>);

        await chooseType(user, "SFTP");
        await user.type(await screen.findByLabelText("Host"), "nas.example.com:22");
        await user.type(screen.getByLabelText("Username"), "backup");
        await user.click(screen.getByRole("button", {name: "Save repository settings"}));

        expect(await screen.findByText(/not a valid host name/i)).toBeInTheDocument();
        expect(mockSaveBackupSettings).not.toHaveBeenCalled();
    });

    describe("when the stored settings cannot be loaded (IN-08)", () => {
        beforeEach(() => {
            mockGetBackupSettings.mockRejectedValue(new Error("Network down"));
        });

        it("says so and refuses to save a blank form over the stored repository", async () => {
            render(<BackupRepositoryCard/>);

            expect(await screen.findByText(/could not load the current backup settings/i)).toBeInTheDocument();
            expect(screen.getByRole("button", {name: "Save repository settings"})).toBeDisabled();
        });
    });

    describe("test connection", () => {
        const storedSftp = () => settings({repoType: "sftp", sftpHost: "sftp", sftpUser: "backup", hasSftpKey: true});

        it("is not offered for a local repository", async () => {
            render(<BackupRepositoryCard/>);

            await screen.findByLabelText(/restic password/i);
            expect(screen.queryByRole("button", {name: "Test connection"})).not.toBeInTheDocument();
        });

        it("shows the success message after testing the saved repository", async () => {
            mockGetBackupSettings.mockResolvedValue(storedSftp());
            const user = userEvent.setup();
            render(<BackupRepositoryCard/>);

            await user.click(await screen.findByRole("button", {name: "Test connection"}));

            expect(await screen.findByText("Connection successful.")).toBeInTheDocument();
            expect(mockTestBackupConnection).toHaveBeenCalledTimes(1);
        });

        it("shows the failure message from the server", async () => {
            mockGetBackupSettings.mockResolvedValue(storedSftp());
            mockTestBackupConnection.mockResolvedValue({ok: false, message: "Permission denied (publickey)"});
            const user = userEvent.setup();
            render(<BackupRepositoryCard/>);

            await user.click(await screen.findByRole("button", {name: "Test connection"}));

            expect(await screen.findByText("Permission denied (publickey)")).toBeInTheDocument();
        });

        it("shows a request failure as an error", async () => {
            mockGetBackupSettings.mockResolvedValue(storedSftp());
            mockTestBackupConnection.mockRejectedValue(new Error("Network down"));
            const user = userEvent.setup();
            render(<BackupRepositoryCard/>);

            await user.click(await screen.findByRole("button", {name: "Test connection"}));

            expect(await screen.findByText("Network down")).toBeInTheDocument();
        });

        it("tests the saved settings only, so unsaved edits disable it", async () => {
            mockGetBackupSettings.mockResolvedValue(storedSftp());
            const user = userEvent.setup();
            render(<BackupRepositoryCard/>);

            const button = await screen.findByRole("button", {name: "Test connection"});
            expect(button).toBeEnabled();
            await user.type(screen.getByLabelText("Host"), "x");

            expect(button).toBeDisabled();
            expect(screen.getByText(/save your changes to test/i)).toBeInTheDocument();
        });

        it("drops a stale result as soon as the form is edited", async () => {
            mockGetBackupSettings.mockResolvedValue(storedSftp());
            const user = userEvent.setup();
            render(<BackupRepositoryCard/>);

            await user.click(await screen.findByRole("button", {name: "Test connection"}));
            expect(await screen.findByText("Connection successful.")).toBeInTheDocument();
            await user.type(screen.getByLabelText("Host"), "x");

            expect(screen.queryByText("Connection successful.")).not.toBeInTheDocument();
        });
    });
});
