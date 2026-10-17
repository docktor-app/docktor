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
import {locateBindSource, needsOwnMounts, type BindSourceRefusal, type OwnMountsView} from "../domain/bind-mount-sources.js";
import {
	asideNameCandidates,
	BACKUP_DIR_NAME,
	classifyMigrationTarget,
	copyDestinationViolations,
	type MigrationTargetKind,
} from "../domain/migration-target.js";
import {composeProjectName} from "../domain/compose-project-name.js";
import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import {
	stackDirectoryNameSchema,
	type MigrationOperationStep,
	type MigrationTarget,
	type SharedProjectName,
} from "@docktor/shared";
import {AppError, BadRequestError, ConflictError, hasErrorCode} from "../lib/errors.js";
import {composeAnalyzer} from "../infrastructure/compose-analyzer.js";
import {dockerSelfStack} from "../infrastructure/docker-self-stack.js";
import {assertNotOwnStack} from "./own-stack-guard.js";
import {assertNotManaged} from "./managed-stack-guard.js";
import {directoryIdentityResolver} from "../infrastructure/directory-identity-resolver.js";
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "./ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";
import type {SelfStackPort} from "./ports/self-stack-port.js";
import type {OwnMountsPort} from "./ports/own-mounts-port.js";
import type {ComposeAnalyzerPort} from "./ports/compose-analyzer-port.js";
import type {DirectoryIdentityPort} from "./ports/directory-identity-port.js";

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
		case "home-relative":
			return `Bind mount source ${originalPath} starts with ~ and cannot be migrated. Use an absolute path in the compose file, or keep the mount outside Docktor.`;
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
			return `${refused} (both take it from their directory name), ${takeover}, or choose a different stack name.`;
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
	/** D-07: keep a copy of the old stack directory at pre-migration-backup/ in the new stack. */
	backup: boolean;
	/** D-10: run `docker compose stop` on the old stack before anything is copied. */
	stopOldStack: boolean;
	/**
	 * G-18-7: only for an in-place migration (the new stack takes the old stack's
	 * directory): the directory name, next to the original, the original is
	 * renamed to. Defaults to the first free `<id>-pre-migration[-N]`.
	 */
	inPlaceAsideName?: string;
}

/** Told which step of a migration starts; `detail` names the volume or path being copied. */
export type MigrationProgressListener = (progress: {step: MigrationOperationStep; detail: string | null}) => void;

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
	readonly volumeSelections: VolumeSelection[];
	readonly namedVolumeSelections: Map<string, boolean>;
	readonly backup: boolean;
	readonly stopOldStack: boolean;
	/** CR-03: where every converted bind-mount source is read from, decided before anything happens. */
	readonly bindCopies: readonly PlannedBindCopy[];
	/** G-18-7: set when the target directory is the original directory; the original moves to `asideDir`. */
	readonly inPlace: {readonly asideDir: string} | null;
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
}

export class MigrationService {
	constructor(
		private readonly docker: DockerExecutorPort = dockerExecutor,
		private readonly migrator: VolumeMigratorPort = volumeMigrator,
		private readonly rewriter: ComposeRewriterPort = composeRewriter,
		private readonly stackFs: StackFilesystemPort = new StackFilesystem(),
		private readonly stackRepo: StackRepository = stackRepository,
		private readonly oldStack: ExternalStackControlPort = externalStackControl,
		// WR-09/STK-03: last position so every existing positional call keeps
		// compiling. Lets preflight refuse Docktor's own compose file.
		private readonly selfStack: SelfStackPort = dockerSelfStack,
		// CR-03: which host paths Docktor can read through its own bind mounts.
		private readonly ownMounts: OwnMountsPort = dockerSelfStack,
		// WR-01: which bind sources the compose file declares.
		private readonly analyzer: Pick<ComposeAnalyzerPort, "analyzeCompatibility"> = composeAnalyzer,
		// G-18-22-inplace: which directory a path names, whatever its spelling.
		private readonly directories: DirectoryIdentityPort = directoryIdentityResolver,
	) {}

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
		const bindCopies = await this.planCopies(assessment, volumeSelections, namedVolumeSelections);
		const originalCompose = await fs.readFile(assessment.composePath, "utf-8");
		const existingEnv = await this.readOldEnv(assessment.originalDir);
		const result = this.rewriter.rewrite(
			originalCompose,
			volumeSelections,
			namedVolumeSelections,
			existingEnv ?? undefined,
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
			sharedProjectName: await this.sharedProjectName(assessment),
		};
		const emptySources = bindCopies.filter((copy) => copy.sourcePath === null).map((copy) => copy.originalPath);
		return {diff, extractedEnv: result.extractedEnv, target, emptySources};
	}

	/**
	 * Execute full migration: preflight, then stop (optional) -> create ->
	 * backup (optional) -> copy -> rewrite -> record -> deploy.
	 * BF-04: Full migration wizard
	 * BF-05: Rollback on failure
	 *
	 * Refusals (including Docktor's own stack, WR-09) reject with 400/409 typed
	 * errors before any side effect; step failures resolve with
	 * `success: false` after the rollback.
	 */
	async migrate(input: MigrationInput, onProgress?: MigrationProgressListener): Promise<MigrationResult> {
		return this.execute(await this.preflight(input), onProgress);
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
		const {composePath, displayName, volumeSelections, namedVolumeSelections, backup, stopOldStack} = input;
		const assessment = await this.assessTarget(composePath, displayName);
		const {stackId, originalDir, targetDir, kind} = assessment;
		const bindCopies = await this.planCopies(assessment, volumeSelections, namedVolumeSelections);
		const inPlace = kind === "in-place" ? {asideDir: await this.planInPlace(originalDir, stackId, input)} : null;
		if (!stopOldStack) {
			const shared = await this.sharedProjectName(assessment);
			if (shared) {
				throw new BadRequestError(sharedProjectNameRefusal(shared));
			}
		}

		return {
			stackId,
			displayName,
			composePath: assessment.composePath,
			originalDir,
			targetDir,
			volumeSelections,
			namedVolumeSelections,
			backup,
			stopOldStack,
			bindCopies,
			inPlace,
		};
	}

	/**
	 * G-18-22-status: the compose project name the old and the new stack would
	 * both run under, or null when they differ or the target is in place (which
	 * stops the old stack anyway). The new stack keeps the compose file's name:
	 * and the old .env, and Docktor runs compose in `<stacks>/<stackId>`, so its
	 * name is predicted over the same files with the stack id as the directory.
	 */
	private async sharedProjectName(assessment: TargetAssessment): Promise<SharedProjectName | null> {
		if (assessment.kind !== "separate") {
			return null;
		}
		const composeContent = await fs.readFile(assessment.composePath, "utf-8");
		const envContent = await this.readOldEnv(assessment.originalDir);
		const old = composeProjectName({composeContent, envContent, directoryName: path.basename(assessment.originalDir)});
		const next = composeProjectName({composeContent, envContent, directoryName: assessment.stackId});
		return old.name !== "" && old.name === next.name ? old : null;
	}

	/**
	 * The request-path refusals preview and preflight share (WR-01, CR-03), all
	 * before any side effect: a converted source must be declared by the compose
	 * file, every destination must be valid, and every converted source must be
	 * readable by Docktor. Returns where each converted bind mount is read from.
	 */
	private async planCopies(
		assessment: TargetAssessment,
		volumeSelections: readonly VolumeSelection[],
		namedVolumeSelections: ReadonlyMap<string, boolean>,
	): Promise<PlannedBindCopy[]> {
		const converted = volumeSelections.filter((selection) => selection.convert);
		if (converted.length > 0) {
			await this.assertDeclaredSources(assessment.composePath, converted);
		}
		const violations = copyDestinationViolations({
			targetDir: assessment.targetDir,
			composeDir: assessment.originalDir,
			bindCopies: converted,
			namedVolumes: [...namedVolumeSelections].filter(([, convert]) => convert).map(([name]) => name),
		});
		if (violations.length > 0) {
			throw new BadRequestError(`Migration refused: ${violations.join("; ")}`);
		}
		return this.planBindCopies(volumeSelections, assessment.originalDir);
	}

	/**
	 * WR-01/T-18-52: a converted `originalPath` must be a bind source the
	 * compose file declares (the very strings the scanner offers), so a request
	 * cannot make Docktor copy an arbitrary host path into a stack directory.
	 */
	private async assertDeclaredSources(composePath: string, converted: readonly VolumeSelection[]): Promise<void> {
		const content = await fs.readFile(composePath, "utf-8");
		let declared: Set<string>;
		try {
			declared = new Set(this.analyzer.analyzeCompatibility(content).bindMounts.map((mount) => mount.path));
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new BadRequestError(`The compose file could not be read to check the bind mounts: ${message}`);
		}
		for (const {originalPath} of converted) {
			if (!declared.has(originalPath)) {
				throw new BadRequestError(`Bind mount source ${originalPath} is not declared by the compose file`);
			}
		}
	}

	/**
	 * CR-03: decides, for every converted bind mount, the path its data is read
	 * from. A source Docktor cannot read at all is refused with a 400 naming it
	 * (nothing has happened yet). Of the readable candidates the first that
	 * exists wins; none existing means the source is genuinely absent and an
	 * empty directory will be created. Only a missing path (ENOENT) counts as
	 * absent: any other access failure rejects the preflight.
	 */
	private async planBindCopies(selections: readonly VolumeSelection[], originalDir: string): Promise<PlannedBindCopy[]> {
		let view: OwnMountsView | undefined;
		const copies: PlannedBindCopy[] = [];
		for (const {originalPath, newPath, convert} of selections) {
			if (!convert) {
				continue;
			}
			if (view === undefined && needsOwnMounts(originalPath, originalDir)) {
				view = await this.ownMounts.ownMounts();
			}
			const located = locateBindSource(originalPath, originalDir, view ?? {kind: "host"});
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
	 * Runs the side-effecting steps of a preflighted plan and, on any step
	 * failure, the rollback: it removes only the directory and the stack record
	 * this run created (CR-02, D-09) and restarts the old stack iff Docktor
	 * stopped it (D-11). The original directory is only ever read, with one
	 * exception (G-18-7): in an in-place migration it is renamed aside, kept as
	 * the backup on success, and renamed back on failure. Nothing in it is ever
	 * deleted (D-09 spirit). Never rejects for a step failure (returns
	 * `success: false`). Only call it with a plan from {@link preflight};
	 * concurrent same-slug starts are refused by the background operation start
	 * (plan 18-14). Every request-path refusal already happened in preflight
	 * (WR-01); execute only fails for step failures, including a planned
	 * bind-mount source that vanished since (CR-03).
	 */
	async execute(plan: MigrationPlan, onProgress?: MigrationProgressListener): Promise<MigrationResult> {
		const {stackId, displayName, composePath, originalDir, volumeSelections, namedVolumeSelections, backup, stopOldStack, bindCopies, inPlace} = plan;
		// Where the old stack's files are read from: the original directory, or
		// (in place) the directory it was renamed to.
		const sourceDir = inPlace?.asideDir ?? originalDir;
		const sourceComposePath = inPlace ? path.join(sourceDir, path.basename(composePath)) : composePath;

		let oldStackStopped = false;
		let movedAside = false;
		let createdStackDir = false;
		let recordCreated = false;

		try {
			// Step 1: Stop the old stack first (D-10). The flag is set before the
			// call so a partial stop is still undone; a rejection is fail-closed
			// and aborts before anything is created.
			if (stopOldStack) {
				this.report(onProgress, "stopping_old_stack");
				oldStackStopped = true;
				await this.oldStack.stop(composePath);
			}

			// Step 1b (G-18-7): in place, the original is renamed aside so the new
			// stack can take its directory; the renamed original is the backup.
			if (inPlace) {
				this.report(onProgress, "moving_original_aside");
				await this.migrator.moveDirectory(originalDir, inPlace.asideDir);
				movedAside = true;
			}

			// Step 2: Create the new stack directory exclusively. An EEXIST rejection
			// leaves createdStackDir false, so rollback never removes a foreign directory.
			this.report(onProgress, "creating_directory");
			const newStackPath = await this.stackFs.createDirectoryExclusive(stackId);
			createdStackDir = true;

			// Step 3: Keep a copy of the old stack directory when opted in (D-07),
			// independent of renames or compose changes. In place, the renamed
			// original already is that backup, so no second copy is made.
			if (backup && !inPlace) {
				this.report(onProgress, "backing_up");
				await this.migrator.copyDirectory(originalDir, path.join(newStackPath, BACKUP_DIR_NAME));
			}

			const volumesDir = path.join(newStackPath, "volumes");
			await fs.mkdir(volumesDir, {recursive: true});

			// Step 4: Copy named volumes to bind mounts
			for (const [volName, shouldConvert] of namedVolumeSelections) {
				if (shouldConvert) {
					// CR-02: the name was validated in preflight (WR-01); confining
					// destPath to volumesDir stays as a backstop.
					const destPath = assertWithin(volumesDir, volName);
					this.report(onProgress, "copying_named_volume", volName);
					await this.migrator.copyVolumeToBindMount(volName, destPath);
				}
			}

			// Step 5: Copy bind mount data
			await this.copyBindMounts(bindCopies, {originalDir, sourceDir}, newStackPath, onProgress);

			// Step 6: Rewrite compose file
			this.report(onProgress, "writing_compose");
			const originalCompose = await fs.readFile(sourceComposePath, "utf-8");
			const existingEnv = await this.readOldEnv(sourceDir);
			const rewriteResult = this.rewriter.rewrite(
				originalCompose,
				volumeSelections,
				namedVolumeSelections,
				existingEnv ?? undefined,
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
			recordCreated = true;

			// Step 8: Deploy new stack
			this.report(onProgress, "deploying");
			await this.docker.up(stackId);

			return inPlace
				? {success: true, stackId, originalPath: originalDir, keptOriginalAt: inPlace.asideDir}
				: {success: true, stackId, originalPath: originalDir};

		} catch (err: unknown) {
			// Rollback on failure
			this.report(onProgress, "rolling_back");
			const errMessage = err instanceof Error ? err.message : String(err);
			console.error(`[MigrationService] Migration failed, rolling back: ${errMessage}`);

			if (createdStackDir) {
				try {
					// Only a directory Docktor created in this run is ever removed (D-09).
					await this.stackFs.removeDirectory(stackId);
				} catch {
					// Ignore cleanup errors
				}
			}

			// Only a record this run created is ever deleted (CR-02, D-09).
			if (recordCreated) {
				await this.stackRepo.delete(stackId).catch(() => {});
			}

			// In place (G-18-7) the original was renamed; put it back before anything
			// restarts it. If that is impossible, nothing is deleted or restarted.
			const restoration = movedAside && inPlace ? await this.moveOriginalBack(originalDir, inPlace.asideDir) : null;
			const originalNote = restoration?.note ?? "Your original stack directory was not modified.";
			const originalBackInPlace = restoration === null || restoration.restored;
			const restartNote =
				oldStackStopped && originalBackInPlace ? await this.restartOldStack(composePath, originalDir) : "";

			return {
				success: false,
				error: `Migration failed: ${errMessage}. ${originalNote}${restartNote}`,
				originalPath: originalDir,
			};
		}
	}

	/**
	 * Tells the listener which step starts. A listener is not part of the
	 * migration: whatever it throws is logged and never changes the outcome or
	 * the rollback (T-18-45).
	 */
	private report(onProgress: MigrationProgressListener | undefined, step: MigrationOperationStep, detail: string | null = null): void {
		if (!onProgress) {
			return;
		}
		try {
			onProgress({step, detail});
		} catch (listenerError: unknown) {
			console.error(`[MigrationService] Progress listener failed at step "${step}":`, listenerError);
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
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
			await fs.writeFile(target, merged, "utf-8");
		} else if (existingEnv !== null) {
			await fs.copyFile(path.join(sourceDir, ".env"), target);
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

	/**
	 * Rollback step for an in-place migration (G-18-7): rename the original back,
	 * but only into a free path, so nothing is ever replaced or deleted. When that
	 * is impossible the renamed original is left untouched and the note tells the
	 * user exactly where it is and how to restore it.
	 */
	private async moveOriginalBack(originalDir: string, asideDir: string): Promise<{restored: boolean; note: string}> {
		try {
			if (!(await pathIsTaken(originalDir))) {
				await this.migrator.moveDirectory(asideDir, originalDir);
				return {restored: true, note: `The original directory was moved back to ${originalDir}.`};
			}
		} catch (moveErr: unknown) {
			const message = moveErr instanceof Error ? moveErr.message : String(moveErr);
			console.error(`[MigrationService] Failed to move the original directory back: ${message}`);
		}
		return {
			restored: false,
			note: `The original stack is still at ${asideDir}; move it back to ${originalDir} by hand, then run docker compose start there.`,
		};
	}

	/**
	 * Rollback step (D-11): start the containers Docktor stopped. Uses `start`,
	 * never the recreate-capable `up` (RESEARCH Pitfall 2). Returns the note
	 * appended to the user-facing error.
	 */
	private async restartOldStack(composePath: string, originalDir: string): Promise<string> {
		try {
			await this.oldStack.start(composePath);
			return " The old stack was restarted.";
		} catch (startErr: unknown) {
			const message = startErr instanceof Error ? startErr.message : String(startErr);
			console.error(`[MigrationService] Failed to restart the old stack: ${message}`);
			return ` The old stack could not be restarted automatically; run docker compose start in ${originalDir}.`;
		}
	}
}

export const migrationService = new MigrationService();
