import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Route, Routes} from "react-router";
import SettingsPage from "@/routes/app/settings";
import {SidebarProvider} from "@/components/ui/sidebar";
import {getGeneralSettings, updateGeneralSettings} from "@/lib/settings-api";
import {ApiError} from "@/lib/api";

// jsdom has no ResizeObserver — Radix's Switch (via @radix-ui/react-use-size)
// requires one to measure the thumb on mount; ProxySettingsCard's dashboard
// toggle switch renders on the Proxy tab.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}
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
import {getComposeCheckSettings, getHealthSettings, saveComposeCheckSettings} from "@/lib/settings-api";
import {listTemplateRepos} from "@/lib/templates-api";

vi.mock("@/lib/settings-api", () => ({
    getGeneralSettings: vi.fn(),
    updateGeneralSettings: vi.fn(),
    getComposeCheckSettings: vi.fn(),
    saveComposeCheckSettings: vi.fn(),
    getHealthSettings: vi.fn(),
    saveHealthSettings: vi.fn(),
}));

vi.mock("@/lib/templates-api", () => ({
    listTemplateRepos: vi.fn(),
    addTemplateRepo: vi.fn(),
    syncTemplateRepo: vi.fn(),
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
const mockUpdateGeneralSettings = vi.mocked(updateGeneralSettings);
const mockGetSmtpSettings = vi.mocked(getSmtpSettings);
const mockGetNotificationTriggers = vi.mocked(getNotificationTriggers);
const mockGetNotifications = vi.mocked(getNotifications);
const mockGetBackupSettings = vi.mocked(getBackupSettings);
const mockGetBackupDefaults = vi.mocked(getBackupDefaults);
const mockGetResticStatus = vi.mocked(getResticStatus);
const mockGetProxySettings = vi.mocked(getProxySettings);
const mockGetCertificates = vi.mocked(getCertificates);
const mockGetComposeCheckSettings = vi.mocked(getComposeCheckSettings);
const mockSaveComposeCheckSettings = vi.mocked(saveComposeCheckSettings);
const mockGetHealthSettings = vi.mocked(getHealthSettings);
const mockListTemplateRepos = vi.mocked(listTemplateRepos);

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
        mockGetComposeCheckSettings.mockResolvedValue({
            skipReview: false,
            checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true},
        });
        mockSaveComposeCheckSettings.mockReset();
        mockGetHealthSettings.mockResolvedValue({retentionDays: 30});
        mockListTemplateRepos.mockResolvedValue([]);

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

    it("renders the General card populated from getGeneralSettings on the General tab", async () => {
        mockGetGeneralSettings.mockResolvedValue({
            instanceName: "My Docktor",
            baseUrl: "https://docktor.example.com",
            timezone: "Europe/Berlin",
        });

        renderSettingsAt("/settings/general");

        expect(await screen.findByDisplayValue("My Docktor")).toBeInTheDocument();
        expect(screen.getByDisplayValue("https://docktor.example.com")).toBeInTheDocument();
        expect(screen.getByText("Europe/Berlin")).toBeInTheDocument();
    });

    it("shows a 400 ApiError mentioning instance name under the Instance name field", async () => {
        mockUpdateGeneralSettings.mockRejectedValue(
            new ApiError("Instance name is already taken", 400),
        );
        const user = userEvent.setup();

        renderSettingsAt("/settings/general");
        await screen.findByDisplayValue("Docktor");

        await user.click(screen.getByRole("button", {name: "Save"}));

        expect(await screen.findByText("Instance name is already taken")).toBeInTheDocument();
    });

    it("renders Backup Repository and Default Backup Settings on the Backup tab", async () => {
        renderSettingsAt("/settings/backup");

        expect(await screen.findByText("Backup Repository")).toBeInTheDocument();
        expect(screen.getByText("Default Backup Settings")).toBeInTheDocument();
    });

    it("renders the proxy settings and certificates cards on the Proxy tab", async () => {
        renderSettingsAt("/settings/proxy");

        expect(await screen.findByText("ACME Email")).toBeInTheDocument();
        expect(await screen.findByText(/no certificates uploaded yet/i)).toBeInTheDocument();
    });

    it("renders the Compose Checks, Template Repositories and Health History cards on the Stacks tab", async () => {
        renderSettingsAt("/settings/stacks");

        expect(await screen.findByText("Compose Checks")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Save Compose Checks"})).toBeInTheDocument();
        expect(await screen.findByText("Template Repositories")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Add Repository"})).toBeInTheDocument();
        expect(await screen.findByText("Health History")).toBeInTheDocument();
        expect(await screen.findByLabelText("Retention (days)")).toHaveValue(30);
    });

    it("renders the Health History card after the Template Repositories card", async () => {
        renderSettingsAt("/settings/stacks");

        const templates = await screen.findByText("Template Repositories");
        const health = await screen.findByText("Health History");
        expect(templates.compareDocumentPosition(health) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("falls back to the General tab for an unknown tab value", async () => {
        renderSettingsAt("/settings/does-not-exist");

        expect(await screen.findByLabelText("Instance Name")).toBeInTheDocument();
    });

    it("scrolls the tab list horizontally instead of widening the page on narrow screens", async () => {
        renderSettingsAt("/settings/general");
        await screen.findByLabelText("Instance Name");

        const tabsList = screen.getByRole("tablist");
        expect(tabsList.parentElement).toHaveClass("overflow-x-auto");
        expect(tabsList).toHaveClass("w-max");
    });
});
