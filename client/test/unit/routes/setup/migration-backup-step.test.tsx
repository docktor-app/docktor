import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {MigrationDiskSpace} from "@docktor/shared";

import {MigrationBackupStep, type MigrationBackupStepProps} from "@/routes/setup/components/migration-backup-step";

const GIB = 1024 ** 3;

const roomy: MigrationDiskSpace = {
    ok: true,
    filesystems: [{label: "/opt/docktor/stacks", requiredBytes: 2 * GIB, availableBytes: 10 * GIB}],
};

const short: MigrationDiskSpace = {
    ok: false,
    filesystems: [
        {label: "/opt/docktor/stacks", requiredBytes: 12 * GIB, availableBytes: 10 * GIB},
        {label: "/mnt/data", requiredBytes: GIB, availableBytes: 4 * GIB},
    ],
};

function renderStep(overrides: Partial<MigrationBackupStepProps> = {}) {
    const props: MigrationBackupStepProps = {
        mode: "separate",
        originalDirectory: "/host/opt/db",
        checked: false,
        onCheckedChange: vi.fn(),
        asideName: "db-pre-migration",
        onAsideNameChange: vi.fn(),
        asideNameError: null,
        diskSpace: roomy,
        ...overrides,
    };
    render(<MigrationBackupStep {...props} />);
    return props;
}

describe("MigrationBackupStep disk space (#107, D-08)", () => {
    it("lists each filesystem with what the migration needs and what is available", () => {
        renderStep({diskSpace: roomy});

        expect(screen.getByText("/opt/docktor/stacks: needs 2.00 GB, 10.00 GB available")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("lists every filesystem, the ones with room too", () => {
        renderStep({diskSpace: short});

        expect(screen.getByText("/opt/docktor/stacks: needs 12.00 GB, 10.00 GB available")).toBeInTheDocument();
        expect(screen.getByText("/mnt/data: needs 1.00 GB, 4.00 GB available")).toBeInTheDocument();
    });

    it("alerts on each short filesystem with how much to free up or to turn the backup off", () => {
        renderStep({diskSpace: short});

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("Not enough free space on /opt/docktor/stacks: free up 2.00 GB or turn off the backup.");
        expect(alert).not.toHaveTextContent("/mnt/data");
        expect(alert.className).toContain("text-red-600");
        expect(alert.className).toContain("dark:text-red-400");
    });

    it("renders no space lines before the assessment is known", () => {
        renderStep({diskSpace: null});

        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByText(/needs .* available/)).toBeNull();
    });

    it("keeps the space lines for an in-place migration and drops the backup sentence from the alert", () => {
        renderStep({mode: "in-place", diskSpace: short});

        expect(screen.getByText("/mnt/data: needs 1.00 GB, 4.00 GB available")).toBeInTheDocument();
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("Not enough free space on /opt/docktor/stacks: free up 2.00 GB.");
        expect(alert).not.toHaveTextContent("turn off the backup");
        expect(screen.queryByRole("switch", {name: "Back up the old stack first"})).toBeNull();
    });
});

describe("MigrationBackupStep backup description (D-02, D-03)", () => {
    it("says the backup is taken after the old stack stopped and before any data is copied", () => {
        renderStep();

        expect(screen.getByText(/taken after the old stack is stopped and before any data is copied/)).toBeInTheDocument();
    });

    it("names the old stack directory and the selected bind-mount sources, and excludes named volumes", () => {
        renderStep();

        const help = screen.getByText(/taken after the old stack is stopped/);
        expect(help).toHaveTextContent(/old stack's directory/);
        expect(help).toHaveTextContent(/bind-mount sources you selected/);
        expect(help).toHaveTextContent(/Named Docker volumes are not included.*untouched/);
    });

    it("still reports the switch choice", async () => {
        const props = renderStep();

        await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));

        expect(props.onCheckedChange).toHaveBeenCalledWith(true);
    });
});
