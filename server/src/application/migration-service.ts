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
import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import {BadRequestError, ConflictError, hasErrorCode} from "../lib/errors.js";
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "./ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";

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

export interface MigrationInput {
	composePath: string;
	displayName: string;
	volumeSelections: VolumeSelection[];
	namedVolumeSelections: Map<string, boolean>;
	/** D-07: keep a copy of the old stack directory at pre-migration-backup/ in the new stack. */
	backup: boolean;
	/** D-10: run `docker compose stop` on the old stack before anything is copied. */
	stopOldStack: boolean;
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
}

export interface MigrationResult {
	success: boolean;
	stackId?: string;
	error?: string;
	originalPath: string;
}

export class MigrationService {
	constructor(
		private readonly docker: DockerExecutorPort = dockerExecutor,
		private readonly migrator: VolumeMigratorPort = volumeMigrator,
		private readonly rewriter: ComposeRewriterPort = composeRewriter,
		private readonly stackFs: StackFilesystemPort = new StackFilesystem(),
		private readonly stackRepo: StackRepository = stackRepository,
		private readonly oldStack: ExternalStackControlPort = externalStackControl,
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
	 * Refusals reject with 400/409 typed errors before any side effect; step
	 * failures resolve with `success: false` after the rollback.
	 */
	async migrate(input: MigrationInput): Promise<MigrationResult> {
		return this.execute(await this.preflight(input));
	}

	/**
	 * Decides every refusal that needs no side effect: an empty slug, an
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

		if (await this.stackRepo.exists(stackId)) {
			throw new ConflictError(`Stack "${stackId}" already exists`);
		}

		const targetDir = this.stackFs.getStackDirectory(stackId);
		const targetGuardError = await this.checkTargetDirectory(targetDir, originalDir);
		if (targetGuardError) {
			throw new ConflictError(targetGuardError);
		}

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
		const {stackId, displayName, composePath, originalDir, volumeSelections, namedVolumeSelections, backup, stopOldStack} = plan;

		let oldStackStopped = false;
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

			// Step 2: Create the new stack directory exclusively. An EEXIST rejection
			// leaves createdStackDir false, so rollback never removes a foreign directory.
			const newStackPath = await this.stackFs.createDirectoryExclusive(stackId);
			createdStackDir = true;

			// Step 3: Keep a copy of the old stack directory when opted in (D-07),
			// independent of renames or compose changes.
			if (backup) {
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
			await this.copyBindMounts(volumeSelections, originalDir, newStackPath);

			// Step 6: Rewrite compose file
			const originalCompose = await fs.readFile(composePath, "utf-8");
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
					existingEnv = await fs.readFile(path.join(originalDir, ".env"), "utf-8");
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
						path.join(originalDir, ".env"),
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
				description: `Migrated from ${originalDir}`,
				hostPath: newStackPath,
				composeConfig,
			});
			recordCreated = true;

			// Step 8: Deploy new stack
			await this.docker.up(stackId);

			return {success: true, stackId, originalPath: originalDir};

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
		originalDir: string,
		newStackPath: string,
	): Promise<void> {
		for (const sel of volumeSelections) {
			if (!sel.convert) {
				continue;
			}
			const srcPath = path.isAbsolute(sel.originalPath)
				? sel.originalPath
				: path.join(originalDir, sel.originalPath);
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

	/** Returns a user-facing refusal when the target directory is unsafe to create and later remove. */
	private async checkTargetDirectory(targetDir: string, originalDir: string): Promise<string | null> {
		const target = path.resolve(targetDir);
		const original = path.resolve(originalDir);
		const isInside = (child: string, parent: string): boolean => child.startsWith(parent + path.sep);
		if (target === original || isInside(target, original) || isInside(original, target)) {
			return `Migration refused: the new stack directory ${target} and the old stack directory ${original} overlap.`;
		}
		try {
			await fs.access(target);
		} catch {
			return null;
		}
		return `Migration refused: the new stack directory ${target} already exists.`;
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
