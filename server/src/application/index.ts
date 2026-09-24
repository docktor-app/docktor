import {StackFilesystem} from "../infrastructure/stack-filesystem.js";
import {DockerExecutor} from "../infrastructure/docker-executor.js";
import {
    stackRepository,
    stackEventRepository,
    settingsRepository,
    notificationRepository,
    backupRepository,
    proxyRepository,
    certificateRepository,
    userRepository,
    imageUpdateCheckRepository,
} from "../repositories/index.js";
import {StackService} from "./stack-service.js";
import {SettingsService} from "./settings-service.js";
import {NotificationService} from "./notification-service.js";
import {ResticExecutor} from "../infrastructure/restic-executor.js";
import {BackupService} from "./backup-service.js";
import {ProxyService} from "./proxy-service.js";
import {CertificateService} from "./certificate-service.js";
import {LogService, type LogServiceStackReadPort} from "./log-service.js";
import {certificateFilesystem} from "../infrastructure/certificate-filesystem.js";
import {stateEventBroadcaster} from "../lib/state-broadcaster.js";
import {dockerodeClient} from "../infrastructure/dockerode-client.js";
import {smtpClient} from "../infrastructure/smtp-client.js";
import {backupScheduler} from "../jobs/backup-scheduler.js";
import {NotFoundError} from "../lib/errors.js";
import type {BackupStackRepo} from "./backup-service.js";
import type {StackStatus} from "../generated/prisma/enums.js";

const repo = stackRepository;
const fs = new StackFilesystem();
const docker = new DockerExecutor();

export {settingsRepository};
export const settingsService = new SettingsService(settingsRepository);

export const stackService = new StackService(repo, fs, docker, stackEventRepository, stateEventBroadcaster, settingsService, imageUpdateCheckRepository);
export const notificationService = new NotificationService(
    notificationRepository,
    settingsService,
    stateEventBroadcaster,
    userRepository,
    smtpClient,
);

// Adapter: StackRepository -> BackupStackRepo interface
const backupStackRepo: BackupStackRepo = {
    findByIdOrThrow: (id: string) => repo.findByIdOrThrow(id),
    update: (id: string, data: Record<string, unknown>) => {
        // `data` is BackupService's `Record<string, unknown> & {status: StackStatus}`
        // (writeStackStatus's parameter type) — narrowed to the exact shape
        // StackRepository accepts. This is a runtime narrowing, not just a
        // compile-time cast: only `status`/`previousStatus` are read off
        // `data`, so any extra keys the caller's wider type would allow
        // through are dropped rather than passed to Prisma unchecked.
        const {status, previousStatus} = data as {status: StackStatus; previousStatus?: StackStatus | null}
        return repo.updateStatusFields(id, {status, previousStatus})
    },
    clearConfigChanged: (id: string) => repo.clearConfigChanged(id),
    updateStackHash: (args: {stackId: string; hash: string}) => repo.updateStackHash(args),
    replaceServices: (stackId: string, composeConfig: any) => repo.replaceServices(stackId, composeConfig),
    updateBackupConfig: (
        id: string,
        data: {
            backupSchedule: string | null
            backupRetention: string | null
            backupPreHook: string | null
            backupPostHook: string | null
        },
    ) => repo.updateBackupConfig(id, data),
}

export const backupService = new BackupService(
    new ResticExecutor(),
    backupRepository,
    backupStackRepo,
    settingsService,
    notificationService,
    fs,
    docker,
    stateEventBroadcaster,
    backupScheduler,
);

export {getBackupBroadcaster, getBackupLogBuffer} from "./backup-service.js";

const certificateRepositoryInstance = certificateRepository;

export const proxyService = new ProxyService(
    proxyRepository,
    repo,
    fs,
    stackService,
    settingsService,
    dockerodeClient,
    certificateRepositoryInstance,
);

export const certificateService = new CertificateService(certificateRepositoryInstance, certificateFilesystem);

// Adapter: StackRepository.findByIdWithRelations() throws NotFoundError for
// an unknown stack; LogService's port resolves to null instead, so the
// service is free to raise its own NotFoundError with the exact literal
// message text the log route always sent, rather than the repository's
// id-interpolated one.
const logServiceStackRepo: LogServiceStackReadPort = {
    findByIdWithRelations: async (id: string) => {
        try {
            return await repo.findByIdWithRelations(id);
        } catch (err) {
            if (err instanceof NotFoundError) return null;
            throw err;
        }
    },
};

export const logService = new LogService(dockerodeClient, logServiceStackRepo);
