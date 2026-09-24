import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod"
import {z} from "zod"
import {
    backupSettingsSchema,
    backupDefaultsSchema,
    stackBackupConfigSchema,
    restoreSnapshotSchema,
} from "@docktor/shared"
import {requireAuth} from "../lib/auth-middleware.js"
import {backupService, getBackupBroadcaster, getBackupLogBuffer, settingsService} from "../application/index.js"
import {streamLiveBackupLog} from "../lib/sse-backup-log.js"

const stackParamsSchema = z.object({id: z.string()})
const backupParamsSchema = z.object({id: z.string()})

const backupsPlugin: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)

    // ── POST /api/stacks/:id/backup — Trigger manual backup ───────────────────

    app.post(
        "/api/stacks/:id/backup",
        {schema: {params: stackParamsSchema}},
        async (request, reply) => {
            const {id} = request.params
            const backup = await backupService.initiateBackup(id, "MANUAL")

            // Fire-and-forget: fetch required args and run backup asynchronously
            void (async () => {
                try {
                    const {backupRecord, stack, repoConfig} = await backupService.getBackupRunContext(backup.id, id)
                    if (!repoConfig) {
                        await backupService.abortBackup(
                            backup.id,
                            id,
                            "No backup repository is configured. Configure one in Settings > Backup.",
                        )
                        return
                    }
                    await backupService.runBackup(backupRecord, stack, repoConfig)
                } catch (err) {
                    app.log.error({err}, "[backups] fire-and-forget runBackup failed")
                    try {
                        await backupService.abortBackup(
                            backup.id,
                            id,
                            err instanceof Error ? err.message : String(err),
                        )
                    } catch (abortErr) {
                        app.log.error({err: abortErr}, "[backups] abortBackup failed")
                    }
                }
            })()

            return reply.status(202).send({backupId: backup.id})
        },
    )

    // ── POST /api/stacks/:id/restore — Trigger restore from snapshot ──────────

    app.post(
        "/api/stacks/:id/restore",
        {schema: {params: stackParamsSchema, body: restoreSnapshotSchema}},
        async (request, reply) => {
            const {id} = request.params
            const {snapshotId} = request.body
            const backup = await backupService.initiateRestore(id, snapshotId)

            // Fire-and-forget: run the restore asynchronously (mirrors the backup route above)
            void (async () => {
                try {
                    const {backupRecord, stack} = await backupService.getBackupAndStack(backup.id, id)
                    await backupService.runRestoreProcess(backupRecord, stack, snapshotId)
                } catch (err) {
                    app.log.error({err}, "[backups] fire-and-forget runRestoreProcess failed")
                    try {
                        await backupService.abortBackup(
                            backup.id,
                            id,
                            err instanceof Error ? err.message : String(err),
                        )
                    } catch (abortErr) {
                        app.log.error({err: abortErr}, "[backups] abortBackup failed")
                    }
                }
            })()

            return reply.status(202).send({backupId: backup.id})
        },
    )

    // ── GET /api/stacks/:id/backups — List backup history for a stack ─────────

    app.get(
        "/api/stacks/:id/backups",
        {schema: {params: stackParamsSchema}},
        async (request) => {
            const {id} = request.params
            return backupService.listBackups(id)
        },
    )

    // ── GET /api/stacks/:id/snapshots — List restic snapshots for a stack ─────

    app.get(
        "/api/stacks/:id/snapshots",
        {schema: {params: stackParamsSchema}},
        async (request) => {
            const {id} = request.params
            return backupService.getSnapshotsIfIdle(id)
        },
    )

    // ── GET /api/stacks/:id/volume-warnings — Get absolute-path volume warnings

    app.get(
        "/api/stacks/:id/volume-warnings",
        {schema: {params: stackParamsSchema}},
        async (request) => {
            const {id} = request.params
            const warnings = await backupService.getVolumeWarnings(id)
            return {warnings}
        },
    )

    // ── GET /api/backups/:id — Get a single backup record ────────────────────

    app.get(
        "/api/backups/:id",
        {schema: {params: backupParamsSchema}},
        async (request) => {
            const {id} = request.params
            return backupService.getBackupDto(id)
        },
    )

    // ── GET /api/backups/:id/stream — SSE stream for backup progress ──────────

    app.get(
        "/api/backups/:id/stream",
        {schema: {params: backupParamsSchema}},
        async (request, reply) => {
            const {id} = request.params
            const backup = await backupService.getBackupRecordOrThrow(id)

            reply.hijack()

            reply.raw.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            })
            reply.raw.write(": connected\n\n")

            // If backup is already finished, stream stored log lines and close
            if (backup.status !== "IN_PROGRESS") {
                for (const line of backup.logLines) {
                    reply.raw.write(`data: ${JSON.stringify({line})}\n\n`)
                }
                reply.raw.write(`data: ${JSON.stringify({done: true, status: backup.status})}\n\n`)
                reply.raw.end()
                return
            }

            // Backup is in progress — subscribe to live broadcaster
            const emitter = getBackupBroadcaster(id)
            if (!emitter) {
                // No broadcaster registered for an IN_PROGRESS row is only possible
                // when the backup finished between the fetch above and this lookup
                // (or, pre-04-17, before runBackup had registered it at all). Re-read
                // the record rather than trusting the pre-check status, and replay
                // its stored log lines so this client isn't left with an empty pane.
                const refreshed = await backupService.getBackupRecordOrThrow(id)
                for (const line of refreshed.logLines) {
                    reply.raw.write(`data: ${JSON.stringify({line})}\n\n`)
                }
                reply.raw.write(`data: ${JSON.stringify({done: true, status: refreshed.status})}\n\n`)
                reply.raw.end()
                return
            }

            await streamLiveBackupLog({
                emitter,
                buffered: getBackupLogBuffer(id) ?? [],
                fallbackStatus: backup.status,
                port: {
                    write: (frame) => reply.raw.write(frame),
                    end: () => reply.raw.end(),
                    onClientClose: (handler) => request.raw.on("close", handler),
                },
            })
        },
    )

    // ── GET /api/stacks/:id/backup-config — Get per-stack backup config ───────

    app.get(
        "/api/stacks/:id/backup-config",
        {schema: {params: stackParamsSchema}},
        async (request) => {
            const {id} = request.params
            return backupService.getBackupConfig(id)
        },
    )

    // ── PUT /api/stacks/:id/backup-config — Save per-stack backup config ──────

    app.put(
        "/api/stacks/:id/backup-config",
        {schema: {params: stackParamsSchema, body: stackBackupConfigSchema}},
        async (request, reply) => {
            const {id} = request.params
            await backupService.saveBackupConfig(id, request.body)
            return reply.status(200).send({success: true})
        },
    )

    // ── GET /api/settings/backup — Get backup repository settings ─────────────

    app.get("/api/settings/backup", async () => {
        return settingsService.getMaskedBackupRepositorySettings()
    })

    // ── PUT /api/settings/backup — Save backup repository settings ────────────

    app.put(
        "/api/settings/backup",
        {schema: {body: backupSettingsSchema}},
        async (request, reply) => {
            await settingsService.saveBackupRepositorySettings(request.body)
            return reply.status(200).send({success: true})
        },
    )

    // ── GET /api/settings/backup-defaults — Get global default schedule/retention

    app.get("/api/settings/backup-defaults", async () => {
        return settingsService.getBackupDefaults()
    })

    // ── PUT /api/settings/backup-defaults — Save global defaults ─────────────

    app.put(
        "/api/settings/backup-defaults",
        {schema: {body: backupDefaultsSchema}},
        async (request, reply) => {
            await settingsService.updateBackupDefaults(request.body)
            return reply.status(200).send({success: true})
        },
    )

    // ── GET /api/settings/backup/status — Check restic binary availability ────

    app.get("/api/settings/backup/status", async () => {
        return backupService.checkResticStatus()
    })
}

export default backupsPlugin
