import {Link, useParams} from "react-router";

import {type BackupRecord} from "@/lib/backups-api";
import {useBackupDetail} from "@/hooks/use-backup-detail";
import {BackupStatusBadge} from "@/components/domain/backup/backup-status-badge";
import {LogTerminal} from "@/components/domain/stack/log-terminal";
import {LogConnectionStatus} from "@/components/domain/stack/log-connection-status";
import {Page, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Card, CardContent} from "@/components/ui/card";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {BACKUP_TRIGGER_LABELS, formatDuration, formatSize} from "@/lib/backup-format";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function getOutputEmptyMessage(status: BackupRecord["status"] | undefined): string {
    return status === "IN_PROGRESS"
        ? "Waiting for output…"
        : "No log output was captured for this backup.";
}

export default function BackupDetailPage() {
    const {id = "", backupId = ""} = useParams<{id: string; backupId: string}>();
    const {backup, loading, error, displayLines, isStreaming, isStillStreaming, streamStatus} =
        useBackupDetail(backupId);

    // initiateBackup persists resticSnapshotId as "" on every new row, and that
    // empty string lasts for the whole time a backup is IN_PROGRESS — precisely
    // when a user most often opens this page. Nullish coalescing alone doesn't
    // catch it, so the fallback must be an OR, not a `??`.
    const shortId = (backup?.resticSnapshotId || backupId).slice(0, 8);
    const titlePrefix = backup?.trigger === "RESTORE" ? "Restore" : "Backup";
    const pageTitle = `${titlePrefix} #${shortId}`;

    if (loading) {
        return (
            <Page>
                <PageHeader
                    breadcrumbs={
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbLink asChild>
                                        <Link to="/stacks">Stacks</Link>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbLink asChild>
                                        <Link to={`/stacks/${id}`}>Stack</Link>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Loading...</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    }
                >
                    <PageTitle>Loading...</PageTitle>
                </PageHeader>
                <PageContent>
                    <p className="text-muted-foreground">Loading backup details...</p>
                </PageContent>
            </Page>
        );
    }

    if (error || !backup) {
        return (
            <Page>
                <PageHeader
                    breadcrumbs={
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbLink asChild>
                                        <Link to="/stacks">Stacks</Link>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbLink asChild>
                                        <Link to={`/stacks/${id}`}>Stack</Link>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Error</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    }
                >
                    <PageTitle>Error</PageTitle>
                </PageHeader>
                <PageContent>
                    <Alert variant="destructive">
                        <AlertDescription>{error ?? "Backup not found"}</AlertDescription>
                    </Alert>
                </PageContent>
            </Page>
        );
    }

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link to="/stacks">Stacks</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link to={`/stacks/${id}`}>{backup.stackId}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link to={`/stacks/${id}/backups`}>Backups</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{shortId}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>{pageTitle}</PageTitle>
            </PageHeader>

            <PageContent className="space-y-4">
                {/* Metadata card */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                            <BackupStatusBadge status={backup.status} />
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                {BACKUP_TRIGGER_LABELS[backup.trigger]}
                            </span>
                            <span className="text-muted-foreground">
                                Started: {new Date(backup.startedAt).toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">
                                Duration: {formatDuration(backup.startedAt, backup.completedAt)}
                            </span>
                            <span className="text-muted-foreground">
                                Size: {formatSize(backup.sizeBytes)}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Log output */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Output</SectionTitle>
                        <SectionActions>
                            {isStreaming && streamStatus === "disconnected" && (
                                <LogConnectionStatus connected={false} />
                            )}
                        </SectionActions>
                    </SectionHeader>
                    <LogTerminal
                        testId="backup-log-terminal"
                        lines={displayLines.map((line) => ({line}))}
                        autoScroll={isStillStreaming}
                        lineWrap
                        showServicePrefix={false}
                        emptyMessage={getOutputEmptyMessage(backup.status)}
                    />
                </Section>

                {/* Error alert */}
                {backup.status === "FAILED" && backup.errorMessage && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {backup.trigger === "RESTORE"
                                ? `Restore failed: ${backup.errorMessage}. The stack is in ERROR state. You can retry from the Backups tab.`
                                : `Backup failed: ${backup.errorMessage}`}
                        </AlertDescription>
                    </Alert>
                )}
            </PageContent>
        </Page>
    );
}
