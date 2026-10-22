import {spawn} from "node:child_process";
import type {Stats} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {COMPOSE_VOLUME_NAME_PATTERN} from "@docktor/shared";
import {dockerCliEnvironment} from "../lib/compose-env.js";
import {AppError, BadRequestError, hasErrorCode} from "../lib/errors.js";
import type {VolumeMigratorPort} from "../application/ports/volume-migrator-port.js";

/**
 * Runs `command` with an argument array (never through a shell) and resolves on exit 0.
 * A non-zero exit rejects with an AppError naming `purpose`, the exit code and stderr.
 */
function runCommand(command: string, args: readonly string[], purpose: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args);

		let stderr = "";
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new AppError(`${purpose} failed (exit ${code}): ${stderr.trim()}`));
			}
		});

		proc.on("error", (err) => {
			reject(new AppError(`Failed to spawn ${command}: ${err.message}`, 500, undefined, {cause: err}));
		});
	});
}

/** Runs `docker` with `args` and resolves with its output; a non-zero exit rejects with an AppError naming `purpose`. */
export type VolumeDockerRunner = (args: readonly string[], purpose: string) => Promise<{stdout: string; stderr: string}>;

/** The production {@link VolumeDockerRunner}: an argument array, never a shell, and only the allowlisted environment (#109). */
const defaultVolumeDockerRunner: VolumeDockerRunner = (args, purpose) =>
	new Promise((resolve, reject) => {
		const proc = spawn("docker", [...args], {env: dockerCliEnvironment(process.env)});

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve({stdout, stderr});
			} else {
				reject(new AppError(`${purpose} failed (exit ${code}): ${stderr.trim()}`));
			}
		});

		proc.on("error", (err) => {
			reject(new AppError(`Failed to spawn docker: ${err.message}`, 500, undefined, {cause: err}));
		});
	});

/** T-22-15: the name ends up inside a `--mount` option string, where a comma would start another option. */
function assertVolumeName(volumeName: string): void {
	if (!COMPOSE_VOLUME_NAME_PATTERN.test(volumeName)) {
		throw new BadRequestError(`"${volumeName}" is not a valid Docker volume name`);
	}
}

/** `lstat` that reports a missing path as `null` instead of throwing. */
async function lstatIfExists(target: string): Promise<Stats | null> {
	try {
		return await fs.lstat(target);
	} catch (err: unknown) {
		if (hasErrorCode(err, "ENOENT")) {
			return null;
		}
		throw err;
	}
}

export class VolumeMigrator implements VolumeMigratorPort {
	constructor(private readonly docker: VolumeDockerRunner = defaultVolumeDockerRunner) {}

	/** `docker volume inspect`: it only reads, so asking never creates the volume. */
	async volumeExists(volumeName: string): Promise<boolean> {
		assertVolumeName(volumeName);
		try {
			await this.docker(["volume", "inspect", volumeName], "Volume inspect");
			return true;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (/no such volume/i.test(message)) {
				return false;
			}
			throw new AppError(`Could not check whether the Docker volume ${volumeName} exists: ${message}`, 500, undefined, {cause: error});
		}
	}

	/**
	 * Copy data from a Docker named volume to a bind mount directory.
	 *
	 * Docker creates a volume it does not know when a container mounts it, and
	 * `--mount type=volume` does the same, so mounting alone never protects against
	 * copying from an empty volume made on the spot (#101). The guard is the
	 * inspect right before the run: a missing volume is refused and `docker run`
	 * never executes. The volume is mounted read-only; the destination is created
	 * only after the volume is known to exist.
	 */
	async copyVolumeToBindMount(volumeName: string, destPath: string): Promise<void> {
		assertVolumeName(volumeName);
		if (!(await this.volumeExists(volumeName))) {
			throw new AppError(`The Docker volume ${volumeName} does not exist; nothing was copied`);
		}

		await fs.mkdir(destPath, {recursive: true});

		await this.docker(
			[
				"run",
				"--rm",
				"--mount", `type=volume,src=${volumeName},dst=/source,readonly`,
				"-v", `${destPath}:/dest`,
				"alpine",
				"sh", "-c", "cp -a /source/. /dest/",
			],
			"Volume copy",
		);
	}

	/**
	 * Copy a directory (or file) faithfully with archive-mode `cp`: ownership when
	 * privileged, modes, timestamps and symlinks (verbatim, never dereferenced) survive.
	 * An existing destination directory receives the source's contents (merge, no nesting).
	 */
	async copyDirectory(srcPath: string, destPath: string): Promise<void> {
		// A missing or unreadable source rejects with its errno code before anything is created.
		const source = await fs.lstat(srcPath);
		const purpose = `Copy of ${srcPath} to ${destPath}`;

		if (process.platform === "win32") {
			// Windows has no cp; this branch only serves the CI unit job (Docktor runs in a Linux container).
			await fs.cp(srcPath, destPath, {recursive: true, verbatimSymlinks: true, preserveTimestamps: true});
			return;
		}

		const destination = await lstatIfExists(destPath);
		if (destination === null) {
			await fs.mkdir(path.dirname(destPath), {recursive: true});
			await runCommand("cp", ["-a", "--", srcPath, destPath], purpose);
		} else if (destination.isDirectory() && source.isDirectory()) {
			await runCommand("cp", ["-a", "--", `${srcPath}/.`, destPath], purpose);
		} else {
			throw new AppError(`${purpose} failed: ${destPath} already exists and is not a directory to merge into`);
		}
	}

	/**
	 * Rename a directory. `fs.rename` would silently replace an empty destination
	 * directory on POSIX, so the destination is checked first and a taken name is
	 * refused instead.
	 */
	async moveDirectory(srcPath: string, destPath: string): Promise<void> {
		try {
			await fs.lstat(destPath);
		} catch (err: unknown) {
			if (hasErrorCode(err, "ENOENT")) {
				await fs.rename(srcPath, destPath);
				return;
			}
			throw err;
		}
		throw new Error(`Cannot move ${srcPath}: ${destPath} already exists`);
	}
}

export const volumeMigrator = new VolumeMigrator();
