import {randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {dockerExecutor} from "../infrastructure/docker-executor.js";
import {externalStackControl} from "../infrastructure/external-stack-control.js";
import {volumeMigrator} from "../infrastructure/volume-migrator.js";
import {composeRewriter, type VolumeSelection} from "../infrastructure/compose-rewriter.js";
import {StackFilesystem} from "../infrastructure/stack-filesystem.js";
import {StackRepository, stackRepository} from "../repositories/stack-repository.js";
import {slugify} from "../lib/slugify.js";
import {createComposeConfig} from "../domain/compose-config.js";
import {
	locateBindSource,
	needsOwnMounts,
	resolveHomeRelativeSources,
	type BindSourceRefusal,
	type DeclaredBindMount,
	type HomeSourceResolution,
	type OwnMountsView,
} from "../domain/bind-mount-sources.js";
import {
	asideNameCandidates,
	BACKUP_DIR_NAME,
	BACKUP_MANIFEST_NAME,
	BACKUP_STACK_DIR,
	classifyMigrationTarget,
	copyDestinationViolations,
	planBackupCopies,
	type MigrationTargetKind,
} from "../domain/migration-target.js";
import {assessDiskSpace, diskShortfallMessage, type FilesystemSpace} from "../domain/disk-space.js";
import {composeProjectName} from "../domain/compose-project-name.js";
import {
	findAnonymousVolumes,
	resolveComposeVolumeNames,
	type AnonymousVolume,
	type ComposeVolumeName,
} from "../domain/compose-volumes.js";
import {
	activeWithoutService,
	composeStopTimeoutMs,
	runningServices,
	stillRunning,
	unsafeServiceNames,
	stopNotVerifiedMessage,
	type ComposeProjectTarget,
	type ResolvedComposeProject,
} from "../domain/compose-project.js";
import {InMemoryMigrationLedger, type MigrationLedger} from "../domain/migration-rollback.js";
import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import {
	COMPOSE_FILE_NAMES,
	COMPOSE_VOLUME_NAME_PATTERN,
	stackDirectoryNameSchema,
	type MigrationDiskSpace,
	type MigrationLedgerEntry,
	type MigrationOperationStep,
	type MigrationPreviewDiskSpace,
	type MigrationRollbackReport,
	type MigrationTarget,
	type SharedProjectName,
} from "@docktor/shared";
import {AppError, BadRequestError, ConflictError, hasErrorCode} from "../lib/errors.js";
import {composeAnalyzer} from "../infrastructure/compose-analyzer.js";
import {composeProjectResolver} from "../infrastructure/compose-project-resolver.js";
import {dockerSelfStack} from "../infrastructure/docker-self-stack.js";
import {assertNotOwnStack} from "./own-stack-guard.js";
import {assertNotManaged} from "./managed-stack-guard.js";
import {MigrationRollbackRunner, type MigrationRollbackOutcome} from "./migration-rollback-runner.js";
import {
	errorMessage,
	reportMigrationProgress,
	type MigrationLogger,
	type MigrationProgressListener,
} from "./migration-progress.js";
import {directoryIdentityResolver} from "../infrastructure/directory-identity-resolver.js";
import {diskSpaceProbe} from "../infrastructure/disk-space-probe.js";
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "./ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";
import type {SelfStackPort} from "./ports/self-stack-port.js";
import type {OwnMountsPort} from "./ports/own-mounts-port.js";
import type {ComposeAnalyzerPort} from "./ports/compose-analyzer-port.js";
import type {ComposeProjectResolverPort} from "./ports/compose-project-resolver-port.js";
import type {DirectoryIdentityPort} from "./ports/directory-identity-port.js";
import type {DiskSpaceProbePort} from "./ports/disk-space-probe-port.js";

/**
 * CR-02: Resolve `target` against `base` and reject the result unless it is
 * `base` itself or a strict descendant of it. Prevents `..` segments (or an
 * absolute path) in attacker-controlled `newPath`/volume-name values from
 * escaping the managed stack/volumes directory.
 */
function assertWithin(base: string, target: string): string {
	const resolvedBase = path.resolve(base);
	const resolved = path.resolve(base, target);
	if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
		throw new BadRequestError(`Path escapes managed directory: ${target}`);
	}
	return resolved;
}

// Owner-only read/write: the new stack's `.env` can hold secrets extracted from the compose file.
const ENV_FILE_MODE = 0o600;

// How many "<id>-pre-migration[-N]" names are tried before giving up (G-18-7).
const ASIDE_NAME_ATTEMPTS = 100;

/**
 * CR-01: only a missing source (ENOENT) counts as "does not exist". Any other
 * access failure (EACCES, EIO, ...) is rethrown so the migration rolls back.
 */
async function sourceExists(srcPath: string): Promise<boolean> {
	try {
		await fs.access(srcPath);
		return true;
	} catch (err: unknown) {
		if (hasErrorCode(err, "ENOENT")) {
			return false;
		}
		throw err;
	}
}

/** CR-03: why a selected bind-mount source cannot be migrated, and what to do about it. */
function refusalMessage(originalPath: string, reason: BindSourceRefusal): string {
	switch (reason) {
		case "not-visible":
			return `Bind mount source ${originalPath} is not visible inside the Docktor container. Mount that host path into Docktor (the default deployment mounts the host root at /host) or keep the mount outside Docktor.`;
		case "mounts-unknown":
			return `Bind mount source ${originalPath} cannot be migrated: Docktor could not determine which host paths it can see. Check that Docktor can reach the Docker daemon, or keep the mount outside Docktor.`;
		case "home-unresolved":
			return homeUnresolvedMessage(originalPath, "no-container");
	}
}

/** #104: why a `~` bind source cannot be migrated, and how to make it possible. */
function homeUnresolvedMessage(originalPath: string, reason: Extract<HomeSourceResolution, {kind: "unresolved"}>["reason"]): string {
	const refused = `Migration refused: bind mount source ${originalPath} starts with ~`;
	switch (reason) {
		case "no-container":
			return `${refused} and no container of the old stack mounts it, so Docktor cannot tell which host directory it is. Start the old stack once so Docktor can read the directory its containers mount, or use an absolute path in the compose file.`;
		case "inconsistent":
			return `${refused}, but the old containers mount different or unexpected host directories for it, so Docktor cannot tell which one is meant. Use an absolute path in the compose file.`;
		case "unsupported":
			return `${refused} in a form Docktor cannot resolve (only ~ and ~/path are supported). Use an absolute path in the compose file.`;
	}
}

/** The host directory of every `~` bind source, or a refusal naming the first one that cannot be resolved. */
function homeSourcesOf(declared: readonly DeclaredBindMount[], oldProject: ResolvedComposeProject): ReadonlyMap<string, string> {
	const resolved = new Map<string, string>();
	for (const [declaredPath, resolution] of resolveHomeRelativeSources(declared, oldProject.containers)) {
		if (resolution.kind === "unresolved") {
			throw new BadRequestError(homeUnresolvedMessage(declaredPath, resolution.reason));
		}
		resolved.set(declaredPath, resolution.hostPath);
	}
	return resolved;
}

/** #101: the refusal for a converted volume Docker does not have, with the two ways out. */
function missingVolumeMessage(key: string, volumeName: string): string {
	return `Migration refused: the volume "${key}" is selected for conversion, but the Docker volume ${volumeName} does not exist, so there is no data to copy. Docker would only create an empty one. Either untick it to keep it as a Docker volume, or start the old stack once so Docker creates the volume.`;
}

/** D-05: the refusal for anonymous volumes that start empty in the new stack when the user has not acknowledged it. */
function anonymousVolumesMessage(anonymous: readonly AnonymousVolume[]): string {
	const listed = anonymous.map(({service, containerPath}) => `${service}: ${containerPath}`).join(", ");
	return `Migration refused: the old stack has anonymous volumes (${listed}). They are not copied and start empty in the new stack. Acknowledge this to continue.`;
}

/** D-08: a size Docktor cannot measure blocks the migration, because skipping the check could fill the disk while the old stack is down. */
function unmeasurableSizeMessage(what: string): string {
    return `Migration refused: the size of ${what} could not be measured, so Docktor cannot tell whether there is enough free disk space.`;
}

/**
 * WR-01/T-18-52: a converted `originalPath` must be a bind source the compose
 * file declares, so a request cannot make Docktor copy an arbitrary host path
 * into a stack directory.
 */
function assertDeclared(declared: readonly DeclaredBindMount[], converted: readonly VolumeSelection[]): void {
	const paths = new Set(declared.map((mount) => mount.path));
	for (const {originalPath} of converted) {
		if (!paths.has(originalPath)) {
			throw new BadRequestError(`Bind mount source ${originalPath} is not declared by the compose file`);
		}
	}
}

/** The first of `candidates` that exists, or `null` when none does. */
async function firstExisting(candidates: readonly string[]): Promise<string | null> {
	for (const candidate of candidates) {
		if (await sourceExists(candidate)) {
			return candidate;
		}
	}
	return null;
}

/**
 * True when anything (even a dangling symlink) occupies `target`. Only ENOENT
 * means free; any other failure is rethrown rather than guessed at.
 */
async function pathIsTaken(target: string): Promise<boolean> {
	try {
		await fs.lstat(target);
		return true;
	} catch (err: unknown) {
		if (hasErrorCode(err, "ENOENT")) {
			return false;
		}
		throw err;
	}
}

/**
 * G-18-7: after an in-place rename, an absolute bind-mount source that pointed
 * into the original directory now lives in the renamed directory. Anything
 * outside the original directory is left alone.
 */
function relocateIntoSource(srcPath: string, dirs: {originalDir: string; sourceDir: string}): string {
	const relative = path.relative(dirs.originalDir, srcPath);
	const insideOriginal = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
	return insideOriginal ? path.join(dirs.sourceDir, relative) : srcPath;
}

/** G-18-22-status: why leaving the old stack running under a shared project name is refused, per source. */
function sharedProjectNameRefusal({name, source}: SharedProjectName): string {
	const refused = `Migration refused: the old stack keeps running and would share the Docker Compose project name "${name}" with the new stack`;
	const takeover = "so deploying the new stack would take over the old stack's containers. Stop the old stack during the migration";
	switch (source) {
		case "directory":
			return `${refused} (the new stack takes it from its directory name), ${takeover}, or choose a different stack name.`;
		case "compose-file":
			return `${refused} (set by name: in the compose file, which the new stack keeps), ${takeover}, or remove name: from the old compose file first.`;
		case "env-file":
			return `${refused} (set by COMPOSE_PROJECT_NAME in the old stack's .env file, which the new stack keeps), ${takeover}, or remove COMPOSE_PROJECT_NAME from the old .env file first.`;
	}
}

/** What the preview needs to know about a migration request (G-18-7). */
export type MigrationPreviewRequest = Pick<
	MigrationInput,
	"composePath" | "displayName" | "volumeSelections" | "namedVolumeSelections"
>;

export interface MigrationPreview {
	diff: UnifiedDiff;
	extractedEnv: string;
	target: MigrationTarget;
	/** CR-03: originalPaths of selected bind mounts whose source does not exist; each becomes an empty directory. */
	emptySources: string[];
	/** D-05: volumes that are never copied and start empty in the new stack; the migration needs the user's acknowledgement. */
	anonymousVolumes: AnonymousVolume[];
	/** D-08: needed versus available space per filesystem, for each backup choice (`withBackup` is null in place). */
	diskSpace: MigrationPreviewDiskSpace;
}

interface TargetAssessment {
	readonly stackId: string;
	/** The old compose file, addressed through the same spelling as `originalDir`. */
	readonly composePath: string;
	readonly originalDir: string;
	readonly targetDir: string;
	readonly kind: MigrationTargetKind;
}

export interface MigrationInput {
	composePath: string;
	displayName: string;
	volumeSelections: VolumeSelection[];
	namedVolumeSelections: Map<string, boolean>;
	/** D-07, D-03: keep a backup of the old stack directory and the selected bind sources at pre-migration-backup/ in the new stack, taken after the verified stop and before any data is copied. */
	backup: boolean;
	/** D-10: run `docker compose stop` on the old stack before anything is copied. */
	stopOldStack: boolean;
	/** D-05: the user knows the old stack's anonymous volumes start empty in the new stack. Mandatory, never defaulted. */
	acknowledgeAnonymousVolumes: boolean;
	/**
	 * G-18-7: only for an in-place migration (the new stack takes the old stack's
	 * directory): the directory name, next to the original, the original is
	 * renamed to. Defaults to the first free `<id>-pre-migration[-N]`.
	 */
	inPlaceAsideName?: string;
}

export type {MigrationProgressListener};

/** What a run is given besides the plan: a progress listener and, for a durable journal, its own ledger. */
export interface MigrationExecuteOptions {
	readonly onProgress?: MigrationProgressListener;
	/** Where the run records what it did; defaults to an in-memory ledger that lives as long as the run. */
	readonly ledger?: MigrationLedger;
}

/**
 * The outcome of a successful {@link MigrationService.preflight}: every
 * refusal has been ruled out, nothing has been stopped or created yet.
 */
export interface MigrationPlan {
	readonly stackId: string;
	readonly displayName: string;
	readonly composePath: string;
	readonly originalDir: string;
	readonly targetDir: string;
	/** #102: the compose project Docker runs for the old stack; every stop and check addresses it. */
	readonly oldProject: ResolvedComposeProject;
	readonly volumeSelections: VolumeSelection[];
	readonly namedVolumeSelections: Map<string, boolean>;
	readonly backup: boolean;
	readonly stopOldStack: boolean;
	/** CR-03: where every converted bind-mount source is read from, decided before anything happens. */
	readonly bindCopies: readonly PlannedBindCopy[];
	/** #104: the host directory behind every `~` bind source, as the compose file spells it. */
	readonly homeSources: ReadonlyMap<string, string>;
	/** #101: every top-level compose volume by key, with the Docker volume it really refers to. */
	readonly volumes: ReadonlyMap<string, PlannedVolume>;
	/** G-18-7: set when the target directory is the original directory; the original moves to `asideDir`. */
	readonly inPlace: {readonly asideDir: string} | null;
	/**
	 * #100: the new stack runs under the old stack's compose project (in place, or
	 * the same project name). A rollback that tore the new project down has then
	 * removed the old containers too, so it brings the old stack back from its
	 * restored files instead of starting containers that no longer exist.
	 */
	readonly sharesProjectWithNewStack: boolean;
}

/** D-08: bytes the migration writes into the new stack directory, and bytes more when a backup is taken. */
interface MigrationSizes {
	readonly copyBytes: number;
	readonly backupBytes: number;
}

/** One top-level compose volume: its real Docker name, whether the file declares it external, and whether Docker has it. */
export interface PlannedVolume extends ComposeVolumeName {
	readonly exists: boolean;
}

/**
 * CR-03: one converted bind mount. `sourcePath` is the path Docktor reads the
 * data from (as seen before an in-place rename); `null` means the source does
 * not exist and an empty directory is created instead.
 */
export interface PlannedBindCopy {
	readonly originalPath: string;
	readonly newPath: string;
	readonly sourcePath: string | null;
}

export interface MigrationResult {
	success: boolean;
	stackId?: string;
	error?: string;
	originalPath: string;
	/** G-18-7: where the renamed original directory of an in-place migration was kept. */
	keptOriginalAt?: string;
	/** Present on a failed migration: what the rollback did and verified. */
	rollback?: MigrationRollbackReport;
}

/**
 * Every collaborator of {@link MigrationService}. All are optional in the constructor and fall
 * back to the production singletons, so a test names only the ports a scenario touches.
 */
export interface MigrationServiceDependencies {
	docker: DockerExecutorPort;
	migrator: VolumeMigratorPort;
	rewriter: ComposeRewriterPort;
	stackFs: StackFilesystemPort;
	stackRepo: StackRepository;
	oldStack: ExternalStackControlPort;
	/** WR-09/STK-03: lets preflight refuse Docktor's own compose file. */
	selfStack: SelfStackPort;
	/** #102: which compose project Docker runs for the old stack and which containers belong to it. */
	projects: ComposeProjectResolverPort;
	/** CR-03: which host paths Docktor can read through its own bind mounts. */
	ownMounts: OwnMountsPort;
	/** WR-01: which bind sources the compose file declares. */
	analyzer: Pick<ComposeAnalyzerPort, "analyzeCompatibility">;
	/** G-18-22-inplace: which directory a path names, whatever its spelling. */
	directories: DirectoryIdentityPort;
	/** #107: free space per filesystem and the sizes of what a migration writes. */
	diskSpace: DiskSpaceProbePort;
	/**
	 * #108: where the migration logs. No app-wide logger exists yet and structured
	 * logging (#70) is deferred, so this injected seam is the convention.
	 */
	logger: MigrationLogger;
	/** D-07: how the rollback waits between looks at the restarted services. */
	sleep: (ms: number) => Promise<void>;
	/** D-07: the clock the rollback's restart verification times itself with, in milliseconds. */
	now: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MigrationService {
	private readonly docker: DockerExecutorPort;
	private readonly migrator: VolumeMigratorPort;
	private readonly rewriter: ComposeRewriterPort;
	private readonly stackFs: StackFilesystemPort;
	private readonly stackRepo: StackRepository;
	private readonly oldStack: ExternalStackControlPort;
	private readonly projects: ComposeProjectResolverPort;
	private readonly selfStack: SelfStackPort;
	private readonly ownMounts: OwnMountsPort;
	private readonly analyzer: Pick<ComposeAnalyzerPort, "analyzeCompatibility">;
	private readonly directories: DirectoryIdentityPort;
	private readonly diskSpace: DiskSpaceProbePort;
	private readonly logger: MigrationLogger;
	private readonly rollback: MigrationRollbackRunner;

	constructor(deps: Partial<MigrationServiceDependencies> = {}) {
		this.docker = deps.docker ?? dockerExecutor;
		this.migrator = deps.migrator ?? volumeMigrator;
		this.rewriter = deps.rewriter ?? composeRewriter;
		this.stackFs = deps.stackFs ?? new StackFilesystem();
		this.stackRepo = deps.stackRepo ?? stackRepository;
		this.oldStack = deps.oldStack ?? externalStackControl;
		this.projects = deps.projects ?? composeProjectResolver;
		this.selfStack = deps.selfStack ?? dockerSelfStack;
		this.ownMounts = deps.ownMounts ?? dockerSelfStack;
		this.analyzer = deps.analyzer ?? composeAnalyzer;
		this.directories = deps.directories ?? directoryIdentityResolver;
		this.diskSpace = deps.diskSpace ?? diskSpaceProbe;
		this.logger = deps.logger ?? console;
		this.rollback = new MigrationRollbackRunner({
			stackFs: this.stackFs,
			stackRepo: this.stackRepo,
			migrator: this.migrator,
			docker: this.docker,
			oldStack: this.oldStack,
			projects: this.projects,
			pathTaken: pathIsTaken,
			logger: this.logger,
			sleep: deps.sleep ?? defaultSleep,
			now: deps.now ?? Date.now,
		});
	}

	/**
	 * Preview migration changes without executing. The diff is a real line diff
	 * (D-04, MIG-02) in the same UnifiedDiff shape the stack-edit review renders.
	 * The target (G-18-7) tells the dialog whether the stack is migrated in place
	 * and, if so, which free name the original can be renamed to. The request is
	 * refused exactly like {@link migrate} refuses it, except for the in-place
	 * stop and aside-name checks, which depend on choices made later.
	 */
	async previewMigration(request: MigrationPreviewRequest): Promise<MigrationPreview> {
		const {composePath, displayName, volumeSelections, namedVolumeSelections} = request;
		const assessment = await this.assessTarget(composePath, displayName);
		const oldProject = await this.resolveOldProject(assessment.composePath);
		const {bindCopies, homeSources, volumes} = await this.planCopies(assessment, oldProject, volumeSelections, namedVolumeSelections);
		const originalCompose = await fs.readFile(assessment.composePath, "utf-8");
		const existingEnv = await this.readOldEnv(assessment.originalDir);
		const result = this.rewriter.rewrite(
			originalCompose,
			volumeSelections,
			namedVolumeSelections,
			existingEnv ?? undefined,
			{homeSources, volumes},
		);
		const diff = computeUnifiedDiff(originalCompose, result.rewrittenCompose);
		const inPlace = assessment.kind === "in-place";
		const suggestedAsideName = inPlace
			? path.basename(await this.firstFreeAsideDir(assessment.originalDir, assessment.stackId))
			: null;
		const target: MigrationTarget = {
			stackId: assessment.stackId,
			directory: path.resolve(assessment.targetDir),
			originalDirectory: path.resolve(assessment.originalDir),
			inPlace,
			suggestedAsideName,
			sharedProjectName: await this.sharedProjectName(assessment, oldProject),
		};
		const emptySources = bindCopies.filter((copy) => copy.sourcePath === null).map((copy) => copy.originalPath);
		const anonymousVolumes = findAnonymousVolumes({composeContent: originalCompose, containers: oldProject.containers});
		const diskSpace = await this.previewDiskSpace(assessment, {bindCopies, namedVolumeSelections, volumes});
		return {diff, extractedEnv: result.extractedEnv, target, emptySources, anonymousVolumes, diskSpace};
	}

	/**
	 * Execute full migration: preflight, then stop and verify the stop (optional)
	 * -> create the directory -> backup (optional) -> copy -> rewrite -> record ->
	 * deploy. The backup comes after the verified stop, so it holds a consistent
	 * old stack, and before any data is copied or changed, so nothing is touched
	 * without a backup (D-01, D-02).
	 * BF-04: Full migration wizard
	 * BF-05: Rollback on failure
	 *
	 * Refusals (including Docktor's own stack, WR-09) reject with 400/409 typed
	 * errors before any side effect; step failures resolve with
	 * `success: false` after the rollback.
	 */
	async migrate(input: MigrationInput, onProgress?: MigrationProgressListener): Promise<MigrationResult> {
		return this.execute(await this.preflight(input), {onProgress});
	}

	/**
	 * Decides every refusal that needs no side effect: an empty slug, Docktor's
	 * own compose file (WR-09, STK-03: never stop or re-home Docktor itself;
	 * fail-open when the own stack is unknown, D-02), a compose file in the
	 * directory of a stack Docktor already manages (G-18-2, ConflictError), an
	 * existing stack record, and a target directory that exists or is nested
	 * with the old directory (D-09, RESEARCH Pitfall 4: rollback removes the
	 * target directory, so it must be one Docktor creates in this run). A target
	 * equal to the old directory is the in-place case (G-18-7): it needs the
	 * stop, and a free, valid aside name for the original. Preflight owns every
	 * request-path refusal (WR-01): a converted source the compose file does not
	 * declare, a bad or colliding destination or volume name, and a selected
	 * bind-mount source Docktor cannot read (CR-03). Nothing is stopped,
	 * created, copied or written.
	 * Advisory by design: the exclusive mkdir and the unique record id stay
	 * the authoritative backstops inside {@link execute}.
	 */
	async preflight(input: MigrationInput): Promise<MigrationPlan> {
		const {composePath, displayName, volumeSelections, namedVolumeSelections, backup, stopOldStack, acknowledgeAnonymousVolumes} = input;
		const assessment = await this.assessTarget(composePath, displayName);
		const {stackId, originalDir, targetDir, kind} = assessment;
		const oldProject = await this.resolveOldProject(assessment.composePath);
		const {bindCopies, homeSources, volumes} = await this.planCopies(assessment, oldProject, volumeSelections, namedVolumeSelections);
		await this.assertAnonymousVolumesAcknowledged(assessment, oldProject, acknowledgeAnonymousVolumes);
		const inPlace = kind === "in-place" ? {asideDir: await this.planInPlace(originalDir, stackId, input)} : null;
		const shared = await this.sharedProjectName(assessment, oldProject);
		if (!stopOldStack && shared) {
			throw new BadRequestError(sharedProjectNameRefusal(shared));
		}
		// In place, the renamed original is the backup: no second copy is made or counted.
		const includeBackup = backup && inPlace === null;
		const sizes = await this.measureMigration({assessment, bindCopies, namedVolumeSelections, volumes}, includeBackup);
		const disk = this.assessDisk(await this.diskSpace.filesystemOf(targetDir), sizes, includeBackup);
		if (!disk.ok) {
			throw new BadRequestError(diskShortfallMessage(disk));
		}

		return {
			stackId,
			displayName,
			composePath: assessment.composePath,
			originalDir,
			targetDir,
			oldProject,
			volumeSelections,
			namedVolumeSelections,
			backup,
			stopOldStack,
			bindCopies,
			homeSources,
			volumes,
			inPlace,
			sharesProjectWithNewStack: kind === "in-place" || shared !== null,
		};
	}

	/**
	 * D-05: anonymous volumes are never copied, so the new stack starts them
	 * empty. That is only accepted when the user said they know; the schema makes
	 * the flag mandatory, this is where it is enforced.
	 */
	private async assertAnonymousVolumesAcknowledged(
		assessment: TargetAssessment,
		oldProject: ResolvedComposeProject,
		acknowledged: boolean,
	): Promise<void> {
		if (acknowledged) {
			return;
		}
		const composeContent = await fs.readFile(assessment.composePath, "utf-8");
		const anonymous = findAnonymousVolumes({composeContent, containers: oldProject.containers});
		if (anonymous.length > 0) {
			throw new BadRequestError(anonymousVolumesMessage(anonymous));
		}
	}

	/**
	 * #102: the compose project Docker runs for the old stack. Every stop,
	 * start and check addresses this project, never a name guessed from the
	 * directory. When it cannot be told, nothing is safe to stop: refuse.
	 */
	private async resolveOldProject(composePath: string): Promise<ResolvedComposeProject> {
		const resolution = await this.projects.resolve(composePath);
		if (resolution.kind === "unresolved") {
			throw new BadRequestError(
				`Migration refused: Docktor cannot tell which compose project runs ${composePath}: ${resolution.reason}.`,
			);
		}
		return resolution.project;
	}

	/**
	 * G-18-22-status: the compose project name the old and the new stack would
	 * both run under, or null when they differ or the target is in place (which
	 * stops the old stack anyway). The old name is the project Docker runs (#102);
	 * the new stack keeps the compose file's name: and the old .env, and Docktor
	 * runs compose in `<stacks>/<stackId>`, so its name is predicted over the same
	 * files with the stack id as the directory, and the match reports where the
	 * new stack's name comes from.
	 */
	private async sharedProjectName(
		assessment: TargetAssessment,
		oldProject: ResolvedComposeProject,
	): Promise<SharedProjectName | null> {
		if (assessment.kind !== "separate") {
			return null;
		}
		const composeContent = await fs.readFile(assessment.composePath, "utf-8");
		const envContent = await this.readOldEnv(assessment.originalDir);
		const next = composeProjectName({composeContent, envContent, directoryName: assessment.stackId});
		return oldProject.name !== "" && oldProject.name === next.name ? next : null;
	}

	/**
	 * The request-path refusals preview and preflight share (WR-01, CR-03, #104),
	 * all before any side effect: a converted source must be declared by the
	 * compose file, every destination must be valid, every `~` source must be
	 * resolved to the host directory the old containers mount, and every
	 * converted source must be readable by Docktor. Returns where each converted
	 * bind mount is read from and what each `~` source stands for.
	 */
	private async planCopies(
		assessment: TargetAssessment,
		oldProject: ResolvedComposeProject,
		volumeSelections: readonly VolumeSelection[],
		namedVolumeSelections: ReadonlyMap<string, boolean>,
	): Promise<{bindCopies: PlannedBindCopy[]; homeSources: ReadonlyMap<string, string>; volumes: ReadonlyMap<string, PlannedVolume>}> {
		const converted = volumeSelections.filter((selection) => selection.convert);
		const declared = await this.declaredBindMounts(assessment.composePath);
		assertDeclared(declared, converted);
		const violations = copyDestinationViolations({
			targetDir: assessment.targetDir,
			composeDir: assessment.originalDir,
			bindCopies: converted,
			namedVolumes: [...namedVolumeSelections].filter(([, convert]) => convert).map(([name]) => name),
		});
		if (violations.length > 0) {
			throw new BadRequestError(`Migration refused: ${violations.join("; ")}`);
		}
		const volumes = await this.planVolumes(assessment, oldProject, namedVolumeSelections);
		const homeSources = homeSourcesOf(declared, oldProject);
		return {
			bindCopies: await this.planBindCopies(volumeSelections, assessment.originalDir, homeSources),
			homeSources,
			volumes,
		};
	}

	/**
	 * D-08: the assessment for both backup choices from one set of measurements,
	 * so the dialog can switch the backup on and off without asking again. A
	 * shortfall is reported, not thrown: the dialog shows it and blocks the
	 * step; the start refuses it in {@link preflight}.
	 */
	private async previewDiskSpace(
		assessment: TargetAssessment,
		planned: {
			bindCopies: readonly PlannedBindCopy[];
			namedVolumeSelections: ReadonlyMap<string, boolean>;
			volumes: ReadonlyMap<string, PlannedVolume>;
		},
	): Promise<MigrationPreviewDiskSpace> {
		const inPlace = assessment.kind === "in-place";
		const sizes = await this.measureMigration({assessment, ...planned}, !inPlace);
		const space = await this.diskSpace.filesystemOf(assessment.targetDir);
		return {
			withoutBackup: this.assessDisk(space, sizes, false),
			withBackup: inPlace ? null : this.assessDisk(space, sizes, true),
		};
	}

	/**
	 * D-08: sizes what the migration writes, each item measured once. The copy
	 * set is every converted bind source that exists and every converted named
	 * volume; the backup set (only when asked for) is the old stack directory and
	 * the selected bind sources outside it. A size that cannot be measured
	 * refuses the request, naming the item.
	 */
	private async measureMigration(
		scope: {
			assessment: TargetAssessment;
			bindCopies: readonly PlannedBindCopy[];
			namedVolumeSelections: ReadonlyMap<string, boolean>;
			volumes: ReadonlyMap<string, PlannedVolume>;
		},
		includeBackup: boolean,
	): Promise<MigrationSizes> {
		const {assessment, bindCopies, namedVolumeSelections, volumes} = scope;
		let copyBytes = 0;
		for (const {originalPath, sourcePath} of bindCopies) {
			if (sourcePath !== null) {
				copyBytes += await this.directorySize(sourcePath, `the bind mount source ${originalPath} (${sourcePath})`);
			}
		}
		for (const [key, convert] of namedVolumeSelections) {
			const volume = convert ? volumes.get(key) : undefined;
			if (volume !== undefined) {
				copyBytes += await this.volumeSize(volume.name);
			}
		}
		if (!includeBackup) {
			return {copyBytes, backupBytes: 0};
		}
		let backupBytes = await this.directorySize(assessment.originalDir, `the old stack directory ${assessment.originalDir}`);
		for (const {originalPath, sourcePath} of planBackupCopies(bindCopies, assessment.originalDir)) {
			backupBytes += await this.directorySize(sourcePath, `the bind mount source ${originalPath} (${sourcePath})`);
		}
		return {copyBytes, backupBytes};
	}

	private async directorySize(target: string, what: string): Promise<number> {
		const bytes = await this.diskSpace.measureDirectoryBytes(target);
		if (bytes === null) {
			throw new BadRequestError(unmeasurableSizeMessage(what));
		}
		return bytes;
	}

	private async volumeSize(volumeName: string): Promise<number> {
		const bytes = await this.diskSpace.measureVolumeBytes(volumeName);
		if (bytes === null) {
			throw new BadRequestError(unmeasurableSizeMessage(`the Docker volume ${volumeName}`));
		}
		return bytes;
	}

	/**
	 * D-08: every write of this migration lands under the new stack directory, so
	 * one requirement on the filesystem that holds it covers the copies and, with
	 * a backup, the backup. Grouping by filesystem id stays correct should a
	 * destination ever live elsewhere.
	 */
	private assessDisk(space: FilesystemSpace, sizes: MigrationSizes, includeBackup: boolean): MigrationDiskSpace {
		const bytes = sizes.copyBytes + (includeBackup ? sizes.backupBytes : 0);
		return assessDiskSpace([{filesystemId: space.filesystemId, label: space.label, bytes}], new Map([[space.filesystemId, space]]));
	}

	/**
	 * #101: the Docker volume every top-level compose volume really refers to
	 * (the `name:`, else `<resolved project>_<key>`, external ones by their literal
	 * name), checked with Docker. A converted volume must be declared, must have a
	 * valid name (T-22-15) and must exist: Docker would otherwise create an empty
	 * volume in its place and the user's data would never be copied. A kept volume
	 * Docker has not created yet is only recorded, so the rewrite can name it.
	 */
	private async planVolumes(
		assessment: TargetAssessment,
		oldProject: ResolvedComposeProject,
		namedVolumeSelections: ReadonlyMap<string, boolean>,
	): Promise<ReadonlyMap<string, PlannedVolume>> {
		const composeContent = await fs.readFile(assessment.composePath, "utf-8");
		const envContent = await this.readOldEnv(assessment.originalDir);
		const resolved = resolveComposeVolumeNames({composeContent, envContent, projectName: oldProject.name});
		const converted = new Set([...namedVolumeSelections].filter(([, convert]) => convert).map(([key]) => key));
		for (const key of converted) {
			if (!resolved.has(key)) {
				throw new BadRequestError(`Migration refused: the volume "${key}" is not declared by the compose file`);
			}
		}

		const planned = new Map<string, PlannedVolume>();
		for (const [key, {name, external}] of resolved) {
			const isConverted = converted.has(key);
			if (!COMPOSE_VOLUME_NAME_PATTERN.test(name)) {
				if (isConverted) {
					throw new BadRequestError(`Migration refused: the Docker volume "${name}" of "${key}" is not a valid Docker volume name`);
				}
				continue; // a kept volume with a name the rewrite cannot state keeps its entry as it is
			}
			// A kept external volume is declared as it is and is not Docker's to create: nothing to ask.
			const exists = isConverted || !external ? await this.migrator.volumeExists(name) : true;
			if (isConverted && !exists) {
				throw new BadRequestError(missingVolumeMessage(key, name));
			}
			planned.set(key, {name, external, exists});
		}
		return planned;
	}

	/** The bind mounts the compose file declares, as the analyzer reports them (the very strings the scanner offers). */
	private async declaredBindMounts(composePath: string): Promise<DeclaredBindMount[]> {
		const content = await fs.readFile(composePath, "utf-8");
		try {
			return this.analyzer.analyzeCompatibility(content).bindMounts;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new BadRequestError(`The compose file could not be read to check the bind mounts: ${message}`);
		}
	}

	/**
	 * CR-03: decides, for every converted bind mount, the path its data is read
	 * from. A source Docktor cannot read at all is refused with a 400 naming it
	 * (nothing has happened yet). Of the readable candidates the first that
	 * exists wins; none existing means the source is genuinely absent and an
	 * empty directory will be created. Only a missing path (ENOENT) counts as
	 * absent: any other access failure rejects the preflight. A `~` source is
	 * read from the host directory it was resolved to (#104).
	 */
	private async planBindCopies(
		selections: readonly VolumeSelection[],
		originalDir: string,
		homeSources: ReadonlyMap<string, string>,
	): Promise<PlannedBindCopy[]> {
		let view: OwnMountsView | undefined;
		const copies: PlannedBindCopy[] = [];
		for (const {originalPath, newPath, convert} of selections) {
			if (!convert) {
				continue;
			}
			const declaredPath = homeSources.get(originalPath) ?? originalPath;
			if (view === undefined && needsOwnMounts(declaredPath, originalDir)) {
				view = await this.ownMounts.ownMounts();
			}
			const located = locateBindSource(declaredPath, originalDir, view ?? {kind: "host"});
			if (located.kind === "refused") {
				throw new BadRequestError(refusalMessage(originalPath, located.reason));
			}
			copies.push({originalPath, newPath, sourcePath: await firstExisting(located.paths)});
		}
		return copies;
	}

	/**
	 * The refusals preview and migrate share, so the two cannot drift: an empty
	 * slug, Docktor's own compose file (WR-09), an already-managed directory
	 * (G-18-2), an existing stack record, a target nested with the old directory
	 * and a separate target that already exists. Returns where the new stack
	 * goes and how that relates to the old directory.
	 */
	private async assessTarget(composePath: string, displayName: string): Promise<TargetAssessment> {
		await this.assertRealComposeFile(composePath);
		const originalDir = path.dirname(composePath);
		const stackId = slugify(displayName);

		if (!stackId) {
			throw new BadRequestError("Display name produces an empty slug");
		}

		await assertNotOwnStack(this.selfStack, composePath, "MigrationService");
		await assertNotManaged(this.stackRepo, this.directories, composePath);

		if (await this.stackRepo.exists(stackId)) {
			throw new ConflictError(`Stack "${stackId}" already exists`);
		}

		const targetDir = this.stackFs.getStackDirectory(stackId);
		const [targetIdentity, originalIdentity] = await Promise.all([
			this.directories.identifyLocal(targetDir),
			this.directories.identifyLocal(originalDir),
		]);
		const kind = classifyMigrationTarget(targetIdentity, originalIdentity);
		if (kind === "nested") {
			throw new ConflictError(
				`Migration refused: the new stack directory ${path.resolve(targetDir)} and the old stack directory ${path.resolve(originalDir)} overlap.`,
			);
		}
		if (kind === "separate" && (await pathIsTaken(targetDir))) {
			throw new ConflictError(`Migration refused: the new stack directory ${path.resolve(targetDir)} already exists.`);
		}
		if (kind === "in-place") {
			// The scan may have reached the stack through the read-only /host view
			// (`/:/host:ro`). The stop, the rename aside, the copies and the rollback
			// must go through the writable stacks-folder spelling of the same directory.
			return {stackId, composePath: path.join(targetDir, path.basename(composePath)), originalDir: targetDir, targetDir, kind};
		}
		return {stackId, composePath, originalDir, targetDir, kind};
	}

	/**
	 * Runs the side-effecting steps of a preflighted plan, in this order: stop
	 * and verify the stop, rename aside (in place), create the directory, take
	 * the backup (when chosen), then copy the data, rewrite, record, deploy. No
	 * data is copied or changed before the backup exists. Every side effect is
	 * recorded in the ledger, and on any step failure the rollback undoes exactly
	 * those entries in reverse (#100): it removes only the directory and the stack
	 * record this run created (CR-02, D-09), brings the original directory back
	 * (G-18-7) and restarts the old stack iff Docktor stopped it (D-11), then
	 * reports only what it verified. Nothing in the original directory is ever
	 * deleted (D-09 spirit) and no volume is ever removed. Never rejects for a
	 * step failure (returns `success: false` with the rollback report). Only call
	 * it with a plan from {@link preflight}; concurrent same-slug starts are
	 * refused by the background operation start (plan 18-14). Every request-path
	 * refusal already happened in preflight (WR-01); execute only fails for step
	 * failures, including a planned bind-mount source that vanished since (CR-03).
	 */
	async execute(plan: MigrationPlan, options: MigrationExecuteOptions = {}): Promise<MigrationResult> {
		const {onProgress, ledger = new InMemoryMigrationLedger()} = options;
		try {
			return await this.runSteps(plan, ledger, onProgress);
		} catch (err: unknown) {
			return await this.rollBack(plan, ledger, err, onProgress);
		}
	}

	/**
	 * D-06: undoes what an interrupted run did, from the ledger its journal kept
	 * across a Docktor restart. It is the same runner a failed step uses (ROADMAP
	 * SC#3), so the old stack is only started, never recreated, no volume is
	 * deleted, and the outcome is only what was verified.
	 */
	rollbackInterrupted(
		entries: readonly MigrationLedgerEntry[],
		options: {readonly onProgress?: MigrationProgressListener} = {},
	): Promise<MigrationRollbackOutcome> {
		return this.rollback.run(entries, options);
	}

	/** The failure path: undo the ledger and describe what happened without claiming more than was verified. */
	private async rollBack(
		plan: MigrationPlan,
		ledger: MigrationLedger,
		cause: unknown,
		onProgress: MigrationProgressListener | undefined,
	): Promise<MigrationResult> {
		this.report(onProgress, "rolling_back");
		const message = errorMessage(cause);
		this.logger.error(`[MigrationService] Migration failed, rolling back: ${message}`);
		const outcome = await this.rollback.run(ledger.entries(), {onProgress});
		const failure = `Migration failed: ${message}`;
		return {
			success: false,
			error:
				outcome.restartError === undefined
					? failure
					: `${failure.replace(/\.$/, "")}. Restarting the old stack failed: ${outcome.restartError}.`,
			originalPath: plan.originalDir,
			rollback: outcome.report,
		};
	}

	private async runSteps(
		plan: MigrationPlan,
		ledger: MigrationLedger,
		onProgress: MigrationProgressListener | undefined,
	): Promise<MigrationResult> {
		const {stackId, displayName, composePath, originalDir, oldProject, volumeSelections, namedVolumeSelections, backup, stopOldStack, bindCopies, homeSources, volumes, inPlace} = plan;
		// Where the old stack's files are read from: the original directory, or
		// (in place) the directory it was renamed to.
		const sourceDir = inPlace?.asideDir ?? originalDir;
		const sourceComposePath = inPlace ? path.join(sourceDir, path.basename(composePath)) : composePath;

		// Step 1: Stop the old stack first (D-10) and prove it is down (D-04).
		if (stopOldStack) {
			await this.stopOldStack(plan, ledger, onProgress);
		}

		// Step 1b (G-18-7): in place, the original is renamed aside so the new
		// stack can take its directory; the renamed original is the backup.
		if (inPlace) {
			this.report(onProgress, "moving_original_aside");
			// Write-ahead (WR-01): recorded before the rename, so a restart in between still finds the
			// intent. The rollback only moves the directory back when it finds it under the aside name.
			await ledger.record({kind: "moved_aside", originalDir, asideDir: inPlace.asideDir});
			await this.migrator.moveDirectory(originalDir, inPlace.asideDir);
		}

		// Step 2: Create the new stack directory exclusively. Write-ahead (WR-01): the entry is recorded
		// before the mkdir, and the rollback only removes a directory carrying this run's marker (CR-01,
		// CR-02), so an EEXIST rejection never leads to the removal of a foreign directory.
		this.report(onProgress, "creating_directory");
		const ownerId = randomUUID();
		await ledger.record({kind: "created_directory", stackId, ownerId});
		const newStackPath = await this.stackFs.createDirectoryExclusive(stackId);
		await this.stackFs.claimDirectory(stackId, ownerId);

		// Step 3 (D-01, D-02, D-03): the backup, when opted in (D-07). The old stack
		// is down and verified, and nothing has been copied or changed yet. In place,
		// the renamed original already is the backup, so no second copy is made.
		if (backup && !inPlace) {
			this.report(onProgress, "backing_up");
			await this.takeBackup(bindCopies, originalDir, newStackPath);
		}

		const volumesDir = path.join(newStackPath, "volumes");
		await fs.mkdir(volumesDir, {recursive: true});

		// Step 4: Copy named volumes to bind mounts
		for (const [volName, shouldConvert] of namedVolumeSelections) {
			if (shouldConvert) {
				// CR-02: the name was validated in preflight (WR-01); confining
				// destPath to volumesDir stays as a backstop.
				const destPath = assertWithin(volumesDir, volName);
				// #101: copy from the Docker volume the compose file really refers to, never the bare key.
				const volume = volumes.get(volName);
				if (volume === undefined) {
					throw new AppError(`The volume "${volName}" was not planned; nothing was copied from it`);
				}
				this.report(onProgress, "copying_named_volume", volName);
				await this.migrator.copyVolumeToBindMount(volume.name, destPath);
			}
		}

		// Step 5: Copy bind mount data
		await this.copyBindMounts(bindCopies, {originalDir, sourceDir}, newStackPath, onProgress);
		await this.removeCopiedComposeFiles(newStackPath);

		// Step 6: Rewrite compose file
		this.report(onProgress, "writing_compose");
		const originalCompose = await fs.readFile(sourceComposePath, "utf-8");
		const existingEnv = await this.readOldEnv(sourceDir);
		const rewriteResult = this.rewriter.rewrite(
			originalCompose,
			volumeSelections,
			namedVolumeSelections,
			existingEnv ?? undefined,
			{homeSources, volumes},
		);

		// Write new compose file
		await fs.writeFile(
			path.join(newStackPath, "docker-compose.yml"),
			rewriteResult.rewrittenCompose,
			"utf-8",
		);

		await this.writeNewEnv(sourceDir, newStackPath, existingEnv, rewriteResult.extractedEnv);

		// Step 7: Create stack record
		this.report(onProgress, "recording_stack");
		await ledger.record({kind: "created_record", stackId, ownerId});
		const composeConfig = createComposeConfig(rewriteResult.rewrittenCompose);
		await this.stackRepo.create({
			id: stackId,
			displayName,
			description: inPlace
				? `Migrated in place; original kept at ${inPlace.asideDir}`
				: `Migrated from ${originalDir}`,
			hostPath: newStackPath,
			composeConfig,
		});

		// Step 8: Deploy new stack. Recorded before the call, so a deploy that fails halfway is taken
		// down on rollback. Without orphan removal: in place, the project is the old stack's, and
		// removing orphans could delete containers of services the rewritten file no longer lists.
		this.report(onProgress, "deploying");
		await ledger.record({kind: "deploy_started", stackId, ownerId});
		await this.docker.up(stackId, {removeOrphans: false});
		// The stack is up and in use from here on: it is no longer a migration artefact a rollback may remove.
		await this.releaseOwnership(stackId, ownerId);

		return inPlace
			? {success: true, stackId, originalPath: originalDir, keptOriginalAt: inPlace.asideDir}
			: {success: true, stackId, originalPath: originalDir};
	}

	/** A marker that cannot be removed is harmless to the stack and is only logged: the migration itself succeeded. */
	private async releaseOwnership(stackId: string, ownerId: string): Promise<void> {
		try {
			await this.stackFs.releaseDirectory(stackId, ownerId);
		} catch (error: unknown) {
			this.logger.warn(`[MigrationService] Could not remove the ownership marker of "${stackId}": ${errorMessage(error)}`);
		}
	}

	/**
	 * Step 1: stops the old project and proves it is down (D-04). The ledger entry
	 * is recorded before the call, so a partial stop is still undone; a rejection
	 * or a container still running is fail-closed and aborts before anything is
	 * created. Nothing to stop (nothing ran) records nothing.
	 */
	private async stopOldStack(
		plan: MigrationPlan,
		ledger: MigrationLedger,
		onProgress: MigrationProgressListener | undefined,
	): Promise<void> {
		const {composePath, oldProject, sharesProjectWithNewStack} = plan;
		// #102: every stop and start addresses the project Docker runs, never a directory-derived name.
		const target: ComposeProjectTarget = {composePath, project: oldProject.name};
		const containers = await this.projects.listContainers(oldProject.name, composePath);
		const running = stillRunning(containers);
		this.report(onProgress, "stopping_old_stack", running.length === 0 ? "(nothing was running)" : null);
		if (running.length === 0) {
			return;
		}
		// WR-05: a rollback starts services by name. An active container without a service label could
		// not be started again, so the stop is refused while nothing has been stopped yet.
		const unmapped = activeWithoutService(containers);
		if (unmapped.length > 0) {
			throw new ConflictError(
				`Migration refused: ${unmapped.join(", ")} in the Docker Compose project "${oldProject.name}" has no compose service label, so Docktor could not start it again if the migration had to be rolled back. Nothing was stopped.`,
			);
		}
		// The services of the old project that ran before the stop: what a rollback starts again (#100).
		const runningBefore = runningServices(containers);
		// WR-06: the names come from container labels and end up as compose arguments.
		const unsafe = unsafeServiceNames(runningBefore);
		if (unsafe.length > 0) {
			throw new ConflictError(
				`Migration refused: the service name(s) ${unsafe.map((name) => JSON.stringify(name)).join(", ")} in the Docker Compose project "${oldProject.name}" are not valid compose service names. Nothing was stopped.`,
			);
		}
		await ledger.record({
			kind: "stopped_old_stack",
			project: oldProject.name,
			composePath,
			runningBefore,
			sharesProjectWithNewStack,
		});
		await this.oldStack.stop(target, {timeoutMs: composeStopTimeoutMs(running.length)});
		await this.verifyStopped(plan, onProgress);
	}

	/**
	 * D-03: the backup holds the old stack directory (`stack/`), every selected
	 * bind source outside it (`bind-mounts/<n>-<name>/`) and a manifest saying
	 * where each came from. Named Docker volumes are not duplicated: they are only
	 * ever read, and they stay where they are. A source that existed at preflight
	 * and vanished since fails the step, like in {@link copyBindMounts}.
	 */
	private async takeBackup(bindCopies: readonly PlannedBindCopy[], originalDir: string, newStackPath: string): Promise<void> {
		const backupDir = path.join(newStackPath, BACKUP_DIR_NAME);
		await fs.mkdir(backupDir, {recursive: true});
		await this.migrator.copyDirectory(originalDir, path.join(backupDir, BACKUP_STACK_DIR));
		const copies = planBackupCopies(bindCopies, originalDir);
		for (const {originalPath, sourcePath, backupPath} of copies) {
			if (!(await sourceExists(sourcePath))) {
				throw new AppError(`Bind mount source ${originalPath} (${sourcePath}) no longer exists; nothing was copied from it`);
			}
			await this.migrator.copyDirectory(sourcePath, path.join(backupDir, ...backupPath.split("/")));
		}
		const manifest = {
			createdAt: new Date().toISOString(),
			stackDirectory: {source: originalDir, backup: BACKUP_STACK_DIR},
			bindMounts: copies.map(({originalPath, sourcePath, backupPath}) => ({originalPath, source: sourcePath, backup: backupPath})),
		};
		await fs.writeFile(path.join(backupDir, BACKUP_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
	}

	/**
	 * D-04: after the stop, no container of the old project may still run. There
	 * is no override: copying live data under a running stack corrupts it.
	 */
	private async verifyStopped(plan: MigrationPlan, onProgress: MigrationProgressListener | undefined): Promise<void> {
		this.report(onProgress, "verifying_stop");
		const {name} = plan.oldProject;
		const remaining = stillRunning(await this.projects.listContainers(name, plan.composePath));
		if (remaining.length > 0) {
			throw new ConflictError(stopNotVerifiedMessage(name, remaining));
		}
	}

	private report(onProgress: MigrationProgressListener | undefined, step: MigrationOperationStep, detail: string | null = null): void {
		reportMigrationProgress(this.logger, onProgress, step, detail);
	}

	/**
	 * T-22-03: the preview echoes the compose file's content, so a `compose.yml` that is a symlink
	 * must not lead to an arbitrary readable file. The real file behind the requested path has to be
	 * a regular file with a compose file name; every later step keeps using the requested path.
	 */
	private async assertRealComposeFile(composePath: string): Promise<void> {
		let realPath: string;
		try {
			realPath = await fs.realpath(composePath);
		} catch (error: unknown) {
			if (hasErrorCode(error, "ENOENT")) {
				throw new BadRequestError(`Compose file not found: ${composePath}`, {cause: error});
			}
			throw error;
		}
		const realName = path.basename(realPath);
		const isComposeName = COMPOSE_FILE_NAMES.some((name) => name === realName);
		if (!isComposeName || !(await fs.stat(realPath)).isFile()) {
			throw new BadRequestError(
				`Compose file ${composePath} resolves to ${realPath}, which is not a docker-compose or compose file`,
			);
		}
	}

	/**
	 * The old stack's `.env` text, or null when it has none. Only ENOENT means "none": any other
	 * error (EACCES, EISDIR, ...) propagates, so an unreadable `.env` fails the migration (and
	 * rolls it back) instead of silently dropping its content.
	 */
	private async readOldEnv(dir: string): Promise<string | null> {
		try {
			return await fs.readFile(path.join(dir, ".env"), "utf-8");
		} catch (error: unknown) {
			if (hasErrorCode(error, "ENOENT")) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Step 6b: the new stack's `.env`. The old content is kept as it is and the extracted block
	 * is appended (every extracted name is new, so no key appears twice); with nothing extracted
	 * the old file is copied byte for byte.
	 */
	private async writeNewEnv(
		sourceDir: string,
		newStackPath: string,
		existingEnv: string | null,
		extractedEnv: string,
	): Promise<void> {
		const target = path.join(newStackPath, ".env");
		if (extractedEnv) {
			const merged = existingEnv
				? `${existingEnv}\n\n# Extracted from docker-compose.yml\n${extractedEnv}`
				: extractedEnv;
			// IN-02: extracted secrets must not land in a world-readable file; the mode only
			// applies when the file is created, so a file the bind copy already brought is
			// tightened explicitly (a verbatim `copyFile` below keeps the old file's mode).
			await fs.writeFile(target, merged, {encoding: "utf-8", mode: ENV_FILE_MODE});
			await fs.chmod(target, ENV_FILE_MODE);
		} else if (existingEnv !== null) {
			await fs.copyFile(path.join(sourceDir, ".env"), target);
		}
	}

	/**
	 * WR-04: the stack-directory mount (`./:/app`) copies the whole old directory into the
	 * new stack root, including the old compose file. The rewritten file is always written as
	 * `docker-compose.yml`, and Compose prefers `compose.yaml` and the other names over it, so a
	 * copied one would deploy the unrewritten file. Only the copies in the NEW directory are
	 * removed (nothing has written a compose file there yet); the original is never touched.
	 */
	private async removeCopiedComposeFiles(newStackPath: string): Promise<void> {
		for (const name of COMPOSE_FILE_NAMES) {
			await fs.rm(path.join(newStackPath, name), {force: true});
		}
	}

	/**
	 * Step 5: copy bind-mount data into the new stack directory from the paths
	 * preflight planned (CR-03). A planned source is relocated if an in-place
	 * rename moved it; a source planned as absent becomes an empty directory.
	 * Any failure rolls back, because the old stack may already be stopped.
	 */
	private async copyBindMounts(
		bindCopies: readonly PlannedBindCopy[],
		dirs: {originalDir: string; sourceDir: string},
		newStackPath: string,
		onProgress?: MigrationProgressListener,
	): Promise<void> {
		for (const copy of bindCopies) {
			this.report(onProgress, "copying_bind_mount", copy.originalPath);
			// CR-02: copy.newPath is fully attacker-controlled — confine the
			// resolved destination to be a strict descendant of newStackPath.
			const destPath = assertWithin(newStackPath, copy.newPath);

			if (copy.sourcePath === null) {
				await fs.mkdir(destPath, {recursive: true});
				continue;
			}
			// A source that existed at preflight must still exist: silently
			// creating an empty directory here would lose the user's data.
			const sourcePath = relocateIntoSource(copy.sourcePath, dirs);
			if (!(await sourceExists(sourcePath))) {
				throw new AppError(`Bind mount source ${copy.originalPath} (${sourcePath}) no longer exists; nothing was copied from it`);
			}
			await this.migrator.copyDirectory(sourcePath, destPath);
		}
	}

	/**
	 * G-18-7: the in-place refusals, in order, before any side effect: the old
	 * stack must be stopped (the new stack reuses its directory and compose
	 * project name, T-18-35), and the sibling name the original is renamed to
	 * must be a single valid directory name that is free (T-18-33). Returns the
	 * aside directory.
	 */
	private async planInPlace(originalDir: string, stackId: string, input: MigrationInput): Promise<string> {
		if (!input.stopOldStack) {
			throw new BadRequestError(
				"An in-place migration must stop the old stack first: the new stack reuses its directory and compose project name.",
			);
		}
		const parent = path.dirname(path.resolve(originalDir));
		const requestedName = input.inPlaceAsideName;
		if (requestedName === undefined) {
			return this.firstFreeAsideDir(originalDir, stackId);
		}
		if (!stackDirectoryNameSchema.safeParse(requestedName).success || requestedName === path.basename(originalDir)) {
			throw new BadRequestError(
				`"${requestedName}" cannot be used as the new name of the original directory. Use a single directory name that differs from "${path.basename(originalDir)}".`,
			);
		}
		const asideDir = path.join(parent, requestedName);
		if (await pathIsTaken(asideDir)) {
			throw new ConflictError(`${asideDir} already exists. Choose another name for the original directory.`);
		}
		return asideDir;
	}

	/** The first free `<id>-pre-migration[-N]` sibling of the original directory. */
	private async firstFreeAsideDir(originalDir: string, stackId: string): Promise<string> {
		const parent = path.dirname(path.resolve(originalDir));
		for (const name of asideNameCandidates(stackId, ASIDE_NAME_ATTEMPTS)) {
			const candidate = path.join(parent, name);
			if (!(await pathIsTaken(candidate))) {
				return candidate;
			}
		}
		throw new ConflictError(`No free name for the original directory next to ${originalDir}. Choose one explicitly.`);
	}
}

export const migrationService = new MigrationService();
