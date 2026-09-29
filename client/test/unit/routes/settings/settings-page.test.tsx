import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import SettingsPage from "@/routes/app/settings";
import {SidebarProvider} from "@/components/ui/sidebar";
import {getGeneralSettings} from "@/lib/settings-api";
import {
    getSmtpSettings,
    getNotificationTriggers,
    getNotifications,
} from "@/lib/notifications-api";
import {
    getBackupSettings,
    getBackupDefaults,
    getResticStatus,
} from "@/lib/backups-api";
import {getProxySettings} from "@/lib/proxy-api";
import {getCertificates} from "@/lib/certificates-api";

vi.mock("@/lib/settings-api", () => ({
    getGeneralSettings: vi.fn(),
    updateGeneralSettings: vi.fn(),
}));

vi.mock("@/lib/notifications-api", () => ({
    getSmtpSettings: vi.fn(),
    saveSmtpSettings: vi.fn(),
    testSmtp: vi.fn(),
    getNotificationTriggers: vi.fn(),
    updateNotificationTriggers: vi.fn(),
    getNotifications: vi.fn(),
}));

vi.mock("@/lib/backups-api", () => ({
    getBackupSettings: vi.fn(),
    saveBackupSettings: vi.fn(),
    getBackupDefaults: vi.fn(),
    saveBackupDefaults: vi.fn(),
    getResticStatus: vi.fn(),
}));

vi.mock("@/lib/proxy-api", () => ({
    getProxySettings: vi.fn(),
    saveProxySettings: vi.fn(),
    deployProxyStack: vi.fn(),
}));

vi.mock("@/lib/certificates-api", () => ({
    getCertificates: vi.fn(),
    uploadCertificate: vi.fn(),
    deleteCertificate: vi.fn(),
}));

vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn(),
}));

const mockGetGeneralSettings = vi.mocked(getGeneralSettings);
const mockGetSmtpSettings = vi.mocked(getSmtpSettings);
const mockGetNotificationTriggers = vi.mocked(getNotificationTriggers);
const mockGetNotifications = vi.mocked(getNotifications);
const mockGetBackupSettings = vi.mocked(getBackupSettings);
const mockGetBackupDefaults = vi.mocked(getBackupDefaults);
const mockGetResticStatus = vi.mocked(getResticStatus);
const mockGetProxySettings = vi.mocked(getProxySettings);
const mockGetCertificates = vi.mocked(getCertificates);

function renderSettingsAt(path: string) {
    return render(
        <SidebarProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/settings/:tab" element={<SettingsPage />} />
                </Routes>
            </MemoryRouter>
        </SidebarProvider>,
    );
}

describe("SettingsPage", () => {
    beforeEach(() => {
        mockGetGeneralSettings.mockResolvedValue({instanceName: "Docktor", baseUrl: "", timezone: "UTC"});
        mockGetSmtpSettings.mockResolvedValue({
            host: "",
            port: 587,
            encryption: "starttls",
            username: "",
            hasPassword: false,
            from: "",
        });
        mockGetNotificationTriggers.mockResolvedValue({
            stackError: false,
            diskWarning: false,
            diskThresholdPercent: 10,
            diskThresholdBytes: 2147483648,
            backupFailure: false,
        });
        mockGetNotifications.mockResolvedValue([]);
        mockGetBackupSettings.mockResolvedValue({
            repoType: null,
            repoPath: null,
            sftpHost: null,
            sftpUser: null,
            s3Endpoint: null,
            s3Bucket: null,
            s3AccessKey: null,
            hasPassword: false,
            hasSftpKey: false,
            hasS3SecretKey: false,
        });
        mockGetBackupDefaults.mockResolvedValue({defaultSchedule: null, defaultRetention: null});
        mockGetResticStatus.mockResolvedValue({available: true, version: "0.17.0"});
        mockGetProxySettings.mockResolvedValue({
            deployed: false,
            status: null,
            acmeEmail: "",
            showInDashboard: false,
        });
        mockGetCertificates.mockResolvedValue([]);

        // jsdom does not implement matchMedia; SidebarProvider's mobile-detection
        // hook (used by the Page shell this route renders into) requires it.
        if (typeof window.matchMedia !== "function") {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }));
        }
    });

    it("renders the SMTP, Notification Triggers and Notification Log headings on the Notifications tab", async () => {
        renderSettingsAt("/settings/notifications");

        expect(await screen.findByText("SMTP")).toBeInTheDocument();
        expect(screen.getByText("Notification Triggers")).toBeInTheDocument();
        expect(screen.getByText("Notification Log")).toBeInTheDocument();
    });
});
