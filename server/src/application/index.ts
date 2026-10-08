import {StackFilesystem} from "../infrastructure/stack-filesystem.js";
import {DockerExecutor} from "../infrastructure/docker-executor.js";
import {composeRuleEngine} from "../infrastructure/compose-rule-engine.js";
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
    templateRepository,
    serviceHealthEventRepository,
    stackDiskUsageRepository,
    statusLogRepository,
    stackIncidentRepository,
} from "../repositories/index.js";
import {StackService} from "./stack-service.js";
import {ComposeReviewService} from "./compose-review-service.js";
import {PortConflictService} from "./port-conflict-service.js";
import {DeployPreflightService} from "./deploy-preflight-service.js";
import {SettingsService} from "./settings-service.js";
import {NotificationService} from "./notification-service.js";
import {ResticExecutor} from "../infrastructure/restic-executor.js";
import {BackupService} from "./backup-service.js";
import {ProxyService} from "./proxy-service.js";
import {CertificateService} from "./certificate-service.js";
import {LogService, type LogServiceStackReadPort} from "./log-service.js";
import {TemplateService} from "./template-service.js";
import {TemplateUpdateService} from "./template-update-service.js";
import {ServiceHealthHistoryService} from "./service-health-history-service.js";
import {StorageService} from "./storage-service.js";
import {UptimeService} from "./uptime-service.js";
import {certificateFilesystem} from "../infrastructure/certificate-filesystem.js";
import {stateEventBroadcaster} from "../lib/state-broadcaster.js";
import {dockerodeClient} from "../infrastructure/dockerode-client.js";
import {socketInspector} from "../infrastructure/socket-inspector.js";
import {smtpClient} from "../infrastructure/smtp-client.js";
import {gitExecutor} from "../infrastructure/git-executor.js";
import {templateSourceReader} from "../infrastructure/template-source-reader.js";
import {getDefaultTemplateRepoUrl, getTemplateCacheDir} from "../lib/template-config.js";
import {backupScheduler} from "../jobs/backup-scheduler.js";
import {NotFoundError} from "../lib/errors.js";
import type {BackupStackRepo} from "./backup-service.js";
import type {StackStatus} from "../generated/prisma/enums.js";
import {domainEventBus} from "../infrastructure/event-bus.js";
import {registerDomainSubscribers} from "./subscribers/register.js";
import {ContainerStateCatchUp} from "./container-state-catch-up.js";

const repo = stackRepository;
const fs = new StackFilesystem();
const docker = new DockerExecutor();

export {settingsRepository};
export const settingsService = new SettingsService(settingsRepository);

// Issue #18/D-01: constructed before stackService since it's one of
// stackService's constructor dependencies (the pre-write confirmation
// check). Never constructed a second time elsewhere in the codebase.
// composeRuleEngine/settingsService (Issue #20/D-04/D-10, plan 12-05) feed
// the rule-findings-aware preview — settingsService is already constructed
// above this line.
export const composeReviewService = new ComposeReviewService(repo, fs, composeRuleEngine, settingsService);

// Issue #21/D-13/D-14/D-15: constructed before stackService since it's one
// of deployPreflightService's constructor dependencies below. dockerodeClient
// (the Docker Engine API client), not `docker` (the `docker compose` CLI
// wrapper) — the container-listing tier of the port-conflict check needs
// the former.
export const portConflictService = new PortConflictService(repo, fs, dockerodeClient, socketInspector);

// Issue #21/D-09/D-14: the single pre-deploy check StackService runs before
// every deploy/restart/update/upgrade — composeReviewService/portConflictService
// are both already constructed above this line.
export const deployPreflightService = new DeployPreflightService(composeReviewService, portConflictService);

// Issue #34: refreshes real container states right after a deploy-family
// operation finishes, so open views do not wait for the 60s reconcile —
// constructed before stackService since it is its 10th dependency.
export const containerStateCatchUp = new ContainerStateCatchUp(dockerodeClient, repo, domainEventBus);

export const stackService = new StackService(repo, fs, docker, stackEventRepository, domainEventBus, settingsService, imageUpdateCheckRepository, composeReviewService, deployPreflightService, containerStateCatchUp);

// Issue #19: stackService (above) is TemplateService's TemplateStackCreator
// dependency — the single create path (StackService.createStack) that
// createStackFromVariant reuses, so template-created stacks get the same
// compose checks and 428 confirmation as any other new stack for free.
export const templateService = new TemplateService(
    templateRepository,
    gitExecutor,
    templateSourceReader,
    stackService,
    {defaultRepoUrl: getDefaultTemplateRepoUrl, cacheDir: getTemplateCacheDir},
);

// Issue #19/D-08: the background refresh TemplateRepoSync (12-11) calls on
// its own cadence — repo/templateRepository are both already constructed
// above this line.
export const templateUpdateService = new TemplateUpdateService(repo, templateRepository);

export const notificationService = new NotificationService(
    notificationRepository,
    settingsService,
    domainEventBus,
    userRepository,
    smtpClient,
);

// #23/D-12: read side of the retained per-service health history — the
// stack repository answers "does this stack exist", the event repository
// serves the rows the history subscriber below writes.
export const serviceHealthHistoryService = new ServiceHealthHistoryService(repo, serviceHealthEventRepository);

// #27/D-15: read side of the disk usage figures DiskUsageJob stores — serves
// GET /api/storage.
export const storageService = new StorageService(stackDiskUsageRepository);

// #24/D-09/D-10/D-16: read side of the per-stack uptime view — the uptime
// percentage comes from StatusLog intervals over the global retention window
// (settingsService), the incident list from StackIncident rows.
export const uptimeService = new UptimeService(
    {
        exists: (id) => repo.exists(id),
        listStackIds: async () => (await repo.findAll()).map((stack) => stack.id),
    },
    statusLogRepository,
    stackIncidentRepository,
    settingsService,
);

// D-15: registers all subscriber categories (audit trail, plan 10-13;
// notifications, plan 10-12; live-state bridge, plan 10-11; service health
// history, #23) from one place in the fixed, documented order
// subscribers/register.ts explains. Exported so a test can tear it down.
export const disposeDomainSubscribers = registerDomainSubscribers(domainEventBus, {
    stackEventRepo: stackEventRepository,
    notificationService,
    broadcaster: stateEventBroadcaster,
    serviceHealthEventRepo: serviceHealthEventRepository,
});

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
    fs,
    docker,
    domainEventBus,
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
