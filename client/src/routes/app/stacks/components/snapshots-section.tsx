import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router";
import {toast} from "sonner";
import {RefreshCw} from "lucide-react";

import {getSnapshots, triggerRestore, type ResticSnapshot} from "@/lib/backups-api";
import {DataTable, type TableColumn} from "@/components/common/data/table";
import {RestoreConfirmDialog} from "@/components/domain/backup/restore-confirm-dialog";
import {Button} from "@/components/ui/button";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Skeleton} from "@/components/ui/skeleton";

interface SnapshotsSectionProps {
    readonly stackId: string;
    readonly stackName: string;
    readonly stackStatus: string;
}

const TRANSITIONAL_STATES = ["BACKING_UP", "RESTORING"];

export function SnapshotsSection({stackId, stackName, stackStatus}: Readonly<SnapshotsSectionProps>) {
    const navigate = useNavigate();
    const [snapshots, setSnapshots] = useState<ResticSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState<ResticSnapshot | null>(null);

    const prevStatusRef = useRef(stackStatus);

    async function fetchSnapshots() {
        setLoading(true);
        setError(false);
        try {
            const data = await getSnapshots(stackId);
            const sortedData = data.sort((a, b) =>
                new Date(b.time).getTime() - new Date(a.time).getTime()
            );
            setSnapshots(sortedData);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void fetchSnapshots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stackId]);

    // Refresh snapshots when transitioning OUT of a transitional state
    useEffect(() => {
        const prev = prevStatusRef.current;
        const wasTransitional = TRANSITIONAL_STATES.includes(prev);
        const isTransitional = TRANSITIONAL_STATES.includes(stackStatus);
        if (wasTransitional && !isTransitional) {
            void fetchSnapshots();
        }
        prevStatusRef.current = stackStatus;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stackStatus]);

    async function handleConfirmRestore() {
        if (!selectedSnapshot) return;
        try {
            const {backupId} = await triggerRestore(stackId, selectedSnapshot.id);
            toast.success("Restore started", {
                action: {
                    label: "View progress",
                    onClick: () => navigate(`/stacks/${stackId}/backups/${backupId}`),
                },
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Restore failed";
            toast.error(message);
        }
    }

    const isLocked = TRANSITIONAL_STATES.includes(stackStatus);

    const columns: readonly TableColumn<ResticSnapshot>[] = [
        {
            name: "Snapshot ID",
            isKey: true,
            className: "font-mono text-xs",
            render: (snapshot) => snapshot.short_id.slice(0, 8),
        },
        {
            name: "Date",
            className: "text-sm text-muted-foreground",
            render: (snapshot) => new Date(snapshot.time).toLocaleString(),
        },
        {
            name: "Tags",
            className: "text-sm text-muted-foreground",
            render: (snapshot) => (snapshot.tags ? snapshot.tags.join(", ") : "-"),
        },
        {
            name: "Actions",
            hideHeader: true,
            render: (snapshot) => (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setSelectedSnapshot(snapshot);
                        setDialogOpen(true);
                    }}
                >
                    Restore
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Snapshots</h2>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchSnapshots()}
                    aria-label="Refresh snapshots"
                >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                </Button>
            </div>

            {isLocked ? (
                <Alert>
                    <AlertDescription>
                        A backup is in progress. Snapshot list will refresh when complete.
                    </AlertDescription>
                </Alert>
            ) : loading ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : error ? (
                <div className="space-y-3">
                    <Alert variant="destructive">
                        <AlertDescription>
                            Could not load snapshots. The backup repository may be unreachable.
                        </AlertDescription>
                    </Alert>
                    <Button variant="outline" size="sm" onClick={() => void fetchSnapshots()}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={snapshots}
                    columns={columns}
                    getRowKey={(snapshot) => snapshot.id}
                    emptyMessage="No snapshots found"
                    emptyDescription="Run a backup to create the first snapshot in this repository."
                    pagination={false}
                />
            )}

            {selectedSnapshot && (
                <RestoreConfirmDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    stackName={stackName}
                    snapshotId={selectedSnapshot.id}
                    onConfirm={handleConfirmRestore}
                />
            )}
        </div>
    );
}
