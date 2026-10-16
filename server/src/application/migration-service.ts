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
import {asideNameCandidates, classifyMigrationTarget} from "../domain/migration-target.js";
import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import {BadRequestError, ConflictError, hasErrorCode} from "../lib/errors.js";
import {dockerSelfStack} from "../infrastructure/docker-self-stack.js";
import {assertNotOwnStack} from "./own-stack-guard.js";
import {assertNotManaged} from "./managed-stack-guard.js";
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "./ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";
import type {SelfStackPort} from "./ports/self-stack-port.js";

// D-07/D-08: an opted-in backup is a plain copy of the old stack directory at
// this fixed name inside the new stack directory; it is kept after success.
const BACKUP_DIR_NAME = "pre-migration-backup";

// CR-02: Docker volume names are also passed verbatim as the `-v` source to
// `docker run`; a name containing `/` is interpreted by Docker as a host bind
// path rather than a named volume, so names must be constrained to Docker's
// own allowed volume-name character set before ever reaching the CLI.
const VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

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
	/** G-18-7: set when the target directory is the original directory; the original moves to `asideDir`. */
	readonly inPlace: {readonly asideDir: string} | null;
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
	) {}

	/**
	 * Preview migration changes without executing. The diff is a real line diff
	 * (D-04, MIG-02) in the same UnifiedDiff shape the stack-edit review renders.
	 */
	async previewMigration(
		composePath: string,
		volumeSelections: VolumeSelection[],
		namedVolumeSelections: Map<string, boolean>,
	): Promise<{diff: UnifiedDiff; extractedEnv: string}> {
		const originalCompose = await fs.readFile(composePath, "utf-8");
		const result = this.rewriter.rewrite(originalCompose, volumeSelections, namedVolumeSelections);
		const diff = computeUnifiedDiff(originalCompose, result.rewrittenCompose);
		return {diff, extractedEnv: result.extractedEnv};
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
	async migrate(input: MigrationInput): Promise<MigrationResult> {
		return this.execute(await this.preflight(input));
	}

	/**
	 * Decides every refusal that needs no side effect: an empty slug, Docktor's
	 * own compose file (WR-09, STK-03: never stop or re-home Docktor itself;
	 * fail-open when the own stack is unknown, D-02), a compose file in the
	 * directory of a stack Docktor already manages (G-18-2, ConflictError), an
	 * existing stack record, and a target directory that exists or overlaps
	 * the old directory (D-09, RESEARCH Pitfall 4: rollback removes the target
	 * directory, so it must be one Docktor creates in this run and must not
	 * overlap the old stack). Nothing is stopped, created, copied or written.
	 * Advisory by design: the exclusive mkdir and the unique record id stay
	 * the authoritative backstops inside {@link execute}.
	 */
	async preflight(input: MigrationInput): Promise<MigrationPlan> {
		const {composePath, displayName, volumeSelections, namedVolumeSelections, backup, stopOldStack} = input;
		const originalDir = path.dirname(composePath);
		const stackId = slugify(displayName);

		if (!stackId) {
			throw new BadRequestError("Display name produces an empty slug");
		}

		await assertNotOwnStack(this.selfStack, composePath, "MigrationService");
		await assertNotManaged(this.stackRepo, composePath);

		if (await this.stackRepo.exists(stackId)) {
			throw new ConflictError(`Stack "${stackId}" already exists`);
		}

		const targetDir = this.stackFs.getStackDirectory(stackId);
		const targetKind = classifyMigrationTarget(targetDir, originalDir);
		if (targetKind === "nested") {
			throw new ConflictError(
				`Migration refused: the new stack directory ${path.resolve(targetDir)} and the old stack directory ${path.resolve(originalDir)} overlap.`,
			);
		}
		if (targetKind === "separate" && (await pathIsTaken(targetDir))) {
			throw new ConflictError(`Migration refused: the new stack directory ${path.resolve(targetDir)} already exists.`);
		}
		const inPlace =
			targetKind === "in-place"
				? {asideDir: await this.resolveAsideDir(originalDir, stackId, input.inPlaceAsideName)}
				: null;

		return {
			stackId,
			displayName,
			composePath,
			originalDir,
			targetDir,
			volumeSelections,
			namedVolumeSelections,
			backup,
			stopOldStack,
			inPlace,
		};
	}

	/**
	 * Runs the side-effecting steps of a preflighted plan and, on any step
	 * failure, the rollback: it removes only the directory and the stack record
	 * this run created (CR-02, D-09) and restarts the old stack iff Docktor
	 * stopped it (D-11). The original directory is only ever read. Never
	 * rejects for a step failure (returns `success: false`). Only call it with
	 * a plan from {@link preflight}; concurrent same-slug starts are refused by
	 * the background operation start (plan 18-14).
	 */
	async execute(plan: MigrationPlan): Promise<MigrationResult> {
		const {stackId, displayName, composePath, originalDir, volumeSelections, namedVolumeSelections, backup, stopOldStack, inPlace} = plan;
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
				oldStackStopped = true;
				await this.oldStack.stop(composePath);
			}

			// Step 1b (G-18-7): in place, the original is renamed aside so the new
			// stack can take its directory; the renamed original is the backup.
			if (inPlace) {
				await this.migrator.moveDirectory(originalDir, inPlace.asideDir);
				movedAside = true;
			}

			// Step 2: Create the new stack directory exclusively. An EEXIST rejection
			// leaves createdStackDir false, so rollback never removes a foreign directory.
			const newStackPath = await this.stackFs.createDirectoryExclusive(stackId);
			createdStackDir = true;

			// Step 3: Keep a copy of the old stack directory when opted in (D-07),
			// independent of renames or compose changes. In place, the renamed
			// original already is that backup, so no second copy is made.
			if (backup && !inPlace) {
				await this.migrator.copyDirectory(originalDir, path.join(newStackPath, BACKUP_DIR_NAME));
			}

			const volumesDir = path.join(newStackPath, "volumes");
			await fs.mkdir(volumesDir, {recursive: true});

			// Step 4: Copy named volumes to bind mounts
			for (const [volName, shouldConvert] of namedVolumeSelections) {
				if (shouldConvert) {
					// CR-02: volName is attacker-controlled (request body key) and is
					// also used as the Docker `-v` source below — validate it against
					// Docker's volume-name charset and confine destPath to volumesDir.
					if (!VOLUME_NAME_PATTERN.test(volName)) {
						throw new BadRequestError(`Invalid volume name: ${volName}`);
					}
					const destPath = assertWithin(volumesDir, volName);
					await this.migrator.copyVolumeToBindMount(volName, destPath);
				}
			}

			// Step 5: Copy bind mount data
			await this.copyBindMounts(volumeSelections, {originalDir, sourceDir}, newStackPath);

			// Step 6: Rewrite compose file
			const originalCompose = await fs.readFile(sourceComposePath, "utf-8");
			const rewriteResult = this.rewriter.rewrite(originalCompose, volumeSelections, namedVolumeSelections);

			// Write new compose file
			await fs.writeFile(
				path.join(newStackPath, "docker-compose.yml"),
				rewriteResult.rewrittenCompose,
				"utf-8",
			);

			// Write extracted env vars if any
			if (rewriteResult.extractedEnv) {
				// Merge with existing .env if present
				let existingEnv = "";
				try {
					existingEnv = await fs.readFile(path.join(sourceDir, ".env"), "utf-8");
				} catch {
					// No existing .env
				}
				const newEnv = existingEnv
					? `${existingEnv}\n\n# Extracted from docker-compose.yml\n${rewriteResult.extractedEnv}`
					: rewriteResult.extractedEnv;
				await fs.writeFile(path.join(newStackPath, ".env"), newEnv, "utf-8");
			} else {
				// Copy existing .env if present
				try {
					await fs.copyFile(
						path.join(sourceDir, ".env"),
						path.join(newStackPath, ".env"),
					);
				} catch {
					// No .env to copy
				}
			}

			// Step 7: Create stack record
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
			await this.docker.up(stackId);

			return inPlace
				? {success: true, stackId, originalPath: originalDir, keptOriginalAt: inPlace.asideDir}
				: {success: true, stackId, originalPath: originalDir};

		} catch (err: unknown) {
			// Rollback on failure
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

			const restartNote = oldStackStopped ? await this.restartOldStack(composePath, originalDir) : "";

			return {
				success: false,
				error: `Migration failed: ${errMessage}. Your original stack directory was not modified.${restartNote}`,
				originalPath: originalDir,
			};
		}
	}

	/**
	 * Step 5: copy bind-mount data into the new stack directory. CR-01: only a
	 * missing source (ENOENT) is an empty volume; any other failure must roll
	 * back, because the old stack may already be stopped.
	 */
	private async copyBindMounts(
		volumeSelections: VolumeSelection[],
		dirs: {originalDir: string; sourceDir: string},
		newStackPath: string,
	): Promise<void> {
		for (const sel of volumeSelections) {
			if (!sel.convert) {
				continue;
			}
			const srcPath = path.isAbsolute(sel.originalPath)
				? relocateIntoSource(sel.originalPath, dirs)
				: path.join(dirs.sourceDir, sel.originalPath);
			// CR-02: sel.newPath is fully attacker-controlled — confine the
			// resolved destination to be a strict descendant of newStackPath.
			const destPath = assertWithin(newStackPath, sel.newPath);

			if (await sourceExists(srcPath)) {
				await this.migrator.copyDirectory(srcPath, destPath);
			} else {
				await fs.mkdir(destPath, {recursive: true});
			}
		}
	}

	/**
	 * G-18-7: the sibling directory an in-place migration renames the original
	 * to: the name the user chose, or the first free `<id>-pre-migration[-N]`.
	 */
	private async resolveAsideDir(originalDir: string, stackId: string, requestedName?: string): Promise<string> {
		const parent = path.dirname(path.resolve(originalDir));
		if (requestedName !== undefined) {
			return path.join(parent, requestedName);
		}
		for (const name of asideNameCandidates(stackId, ASIDE_NAME_ATTEMPTS)) {
			const candidate = path.join(parent, name);
			if (!(await pathIsTaken(candidate))) {
				return candidate;
			}
		}
		throw new ConflictError(`No free name for the original directory next to ${originalDir}. Choose one explicitly.`);
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
