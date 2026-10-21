import {DataTable, type TableColumn} from "@/components/common/data/table";
import {Section, SectionDescription, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageBackup} from "@/lib/storage-api";

export interface StorageBackupsSectionProps {
    readonly backups: readonly StorageBackup[];
    readonly loading: boolean;
}

const COLUMNS: readonly TableColumn<StorageBackup>[] = [
    {
        name: "Stack",
        isKey: true,
        className: "font-medium",
        tableClassName: "w-full max-w-0",
        render: (backup) => (
            <span className="block truncate" title={backup.displayName}>
                {backup.displayName}
            </span>
        ),
    },
    {
        name: "Size",
        align: "right",
        className: "tabular-nums",
        render: (backup) => formatBytes(backup.sizeBytes),
    },
];

function bySizeDescending(a: StorageBackup, b: StorageBackup): number {
    return b.sizeBytes - a.sizeBytes || a.displayName.localeCompare(b.displayName);
}

// D-14 (amended): one row per stack with a local restic repository. No sort
// controls — it is a secondary list, always largest first.
export function StorageBackupsSection({backups, loading}: Readonly<StorageBackupsSectionProps>) {
    const rows = [...backups].sort(bySizeDescending);
    const subtotal = rows.reduce((sum, backup) => sum + backup.sizeBytes, 0);

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Backups</SectionTitle>
            </SectionHeader>
            <SectionDescription>
                Local restic repositories stored inside each stack folder.
            </SectionDescription>

            <DataTable
                data={rows}
                columns={COLUMNS}
                getRowKey={(backup) => backup.stackId}
                loading={loading}
                emptyMessage="No local backups"
                emptyDescription="Stacks without a local backup repository don't appear here."
                footer={["Backups subtotal", formatBytes(subtotal)]}
                pagination={false}
            />
        </Section>
    );
}
