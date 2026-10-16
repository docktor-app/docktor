import {spawn} from "node:child_process";
import type {Stats} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {AppError, hasErrorCode} from "../lib/errors.js";
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
			reject(new AppError(`Failed to spawn ${command}: ${err.message}`));
		});
	});
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
	/**
	 * Copy data from Docker named volume to bind mount directory
	 * Uses: docker run --rm -v volumeName:/source -v destPath:/dest alpine cp -a /source/. /dest/
	 */
	async copyVolumeToBindMount(volumeName: string, destPath: string): Promise<void> {
		// Create destination directory
		await fs.mkdir(destPath, {recursive: true});

		const args = [
			"run",
			"--rm",
			"-v", `${volumeName}:/source:ro`,
			"-v", `${destPath}:/dest`,
			"alpine",
			"sh", "-c", "cp -a /source/. /dest/",
		];

		return runCommand("docker", args, "Volume copy");
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
