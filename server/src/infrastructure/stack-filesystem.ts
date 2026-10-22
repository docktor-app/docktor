import fs from "node:fs/promises";
import path from "node:path";
import {AppError, ConflictError, hasErrorCode} from "../lib/errors.js";
import {getComposePath, getEnvPath, getStackPath,} from "../lib/stacks-dir.js";
import type {StackFilesystemPort} from "../application/ports/stack-filesystem-port.js";

export class StackFilesystem implements StackFilesystemPort {
    getStackDirectory(stackId: string): string {
        return getStackPath(stackId);
    }

    async createDirectory(stackId: string): Promise<string> {
        const hostPath = getStackPath(stackId);
        await fs.mkdir(hostPath, {recursive: true});
        return hostPath;
    }

    async createDirectoryExclusive(stackId: string): Promise<string> {
        const hostPath = getStackPath(stackId);
        await fs.mkdir(path.dirname(hostPath), {recursive: true});
        try {
            // Not recursive: an existing leaf must fail with EEXIST instead of being adopted.
            await fs.mkdir(hostPath);
        } catch (err: unknown) {
            if (hasErrorCode(err, "EEXIST")) {
                throw new ConflictError(`Stack directory ${hostPath} already exists`, {cause: err});
            }
            const message = err instanceof Error ? err.message : String(err);
            throw new AppError(`Failed to create stack directory ${hostPath}: ${message}`, 500, undefined, {cause: err});
        }
        return hostPath;
    }

    async writeCompose(stackId: string, content: string): Promise<void> {
        await fs.writeFile(getComposePath(stackId), content, "utf-8");
    }

    async readCompose(stackId: string): Promise<string> {
        try {
            return await fs.readFile(getComposePath(stackId), "utf-8");
        } catch {
            return "";
        }
    }

    async writeEnv(stackId: string, content: string): Promise<void> {
        await fs.writeFile(getEnvPath(stackId), content, "utf-8");
    }

    async readEnv(stackId: string): Promise<string> {
        try {
            return await fs.readFile(getEnvPath(stackId), "utf-8");
        } catch {
            return "";
        }
    }

    async removeEnv(stackId: string): Promise<void> {
        await fs.unlink(getEnvPath(stackId)).catch(() => {});
    }

    async removeDirectory(stackId: string): Promise<void> {
        await fs.rm(getStackPath(stackId), {recursive: true, force: true});
    }
}
