import {useParams} from "react-router";

import {useBackupDetail} from "@/hooks/use-backup-detail";
import {LogTerminal} from "@/components/domain/stack/log-terminal";
import {LogConnectionStatus} from "@/components/domain/stack/log-connection-status";
import {BackupDetailHeader} from "@/routes/app/stacks/backups/components/backup-detail-header";
import {BackupMetadata} from "@/routes/app/stacks/backups/components/backup-metadata";
import {Page, PageContent} from "@/components/common/layout/page";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {getBackupOutputEmptyMessage} from "@/lib/backup-format";

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
                <BackupDetailHeader stackId={id} stackLabel="Stack" crumb="Loading..." title="Loading..." />
                <PageContent>
                    <p className="text-muted-foreground">Loading backup details...</p>
                </PageContent>
            </Page>
        );
    }

    if (error || !backup) {
        return (
            <Page>
                <BackupDetailHeader stackId={id} stackLabel="Stack" crumb="Error" title="Error" />
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
            <BackupDetailHeader stackId={id} stackLabel={backup.stackId} crumb={shortId} title={pageTitle} />

            <PageContent className="space-y-4">
                <BackupMetadata backup={backup} />

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
                        emptyMessage={getBackupOutputEmptyMessage(backup.status)}
                    />
                </Section>

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
