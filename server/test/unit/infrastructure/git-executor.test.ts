import {afterEach, describe, expect, it} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {GitExecutor} from "../../../src/infrastructure/git-executor.js";
import {BadRequestError} from "../../../src/lib/errors.js";

const execFileAsync = promisify(execFile);

/**
 * Creates a bare git repo in a temp dir, then commits the given files
 * (relative path -> content) to it via a throwaway work tree. Returns the
 * bare repo's filesystem path, suitable for `pathToFileURL(bare).href`.
 */
async function createBareRepoWithFiles(files: Record<string, string>): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-git-fixture-"));
    const bareDir = path.join(root, "bare.git");
    const workDir = path.join(root, "work");

    await execFileAsync("git", ["init", "--bare", bareDir]);
    await execFileAsync("git", ["clone", bareDir, workDir]);

    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(workDir, relPath);
        await fs.mkdir(path.dirname(fullPath), {recursive: true});
        await fs.writeFile(fullPath, content, "utf-8");
    }

    await execFileAsync("git", ["add", "-A"], {cwd: workDir});
    await execFileAsync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "initial"],
        {cwd: workDir},
    );
    const {stdout: branchOut} = await execFileAsync("git", ["branch", "--show-current"], {cwd: workDir});
    const branch = branchOut.trim();
    await execFileAsync("git", ["push", "origin", `HEAD:${branch}`], {cwd: workDir});
    // A fresh `git init --bare` points its symbolic HEAD at whatever branch
    // name the local git install defaults to (which may differ from the
    // branch name actually pushed above) — without this, HEAD stays
    // "unborn" in the bare repo even though the branch exists, and a client
    // clone resolves no HEAD at all. Point it at the branch we just pushed.
    await execFileAsync("git", ["-C", bareDir, "symbolic-ref", "HEAD", `refs/heads/${branch}`]);

    return bareDir;
}

async function createEmptyBareRepo(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-git-empty-fixture-"));
    const bareDir = path.join(root, "bare.git");
    await execFileAsync("git", ["init", "--bare", bareDir]);
    return bareDir;
}

/** Clones `bareDir` into a scratch work tree, writes/commits `files`, and pushes to its current branch. */
async function commitMoreFiles(bareDir: string, files: Record<string, string>): Promise<void> {
    const scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-git-scratch-"));
    const workDir = path.join(scratchRoot, "work");
    await execFileAsync("git", ["clone", bareDir, workDir]);
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(workDir, relPath);
        await fs.mkdir(path.dirname(fullPath), {recursive: true});
        await fs.writeFile(fullPath, content, "utf-8");
    }
    await execFileAsync("git", ["add", "-A"], {cwd: workDir});
    await execFileAsync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "more"],
        {cwd: workDir},
    );
    const {stdout: branchOut} = await execFileAsync("git", ["branch", "--show-current"], {cwd: workDir});
    await execFileAsync("git", ["push", "origin", `HEAD:${branchOut.trim()}`], {cwd: workDir});
    await fs.rm(scratchRoot, {recursive: true, force: true});
}

/** Rewrites `bareDir`'s history (amend + force-push) so a prior fast-forward-only clone can no longer pull it. */
async function rewriteBareRepoHistory(bareDir: string, files: Record<string, string>): Promise<void> {
    const scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-git-rewrite-"));
    const workDir = path.join(scratchRoot, "work");
    await execFileAsync("git", ["clone", bareDir, workDir]);
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(workDir, relPath);
        await fs.mkdir(path.dirname(fullPath), {recursive: true});
        await fs.writeFile(fullPath, content, "utf-8");
    }
    await execFileAsync("git", ["add", "-A"], {cwd: workDir});
    await execFileAsync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--amend", "-m", "rewritten"],
        {cwd: workDir},
    );
    const {stdout: branchOut} = await execFileAsync("git", ["branch", "--show-current"], {cwd: workDir});
    await execFileAsync("git", ["push", "--force", "origin", `HEAD:${branchOut.trim()}`], {cwd: workDir});
    await fs.rm(scratchRoot, {recursive: true, force: true});
}

/** Lists any `*.tmp-*` sibling directories left next to `checkoutDir` — must always be empty after syncCheckout settles. */
async function listTmpSiblings(checkoutDir: string): Promise<string[]> {
    const parent = path.dirname(checkoutDir);
    const base = path.basename(checkoutDir);
    const entries = await fs.readdir(parent).catch(() => [] as string[]);
    return entries.filter((name) => name.startsWith(`${base}.tmp-`));
}

describe("GitExecutor", () => {
    const tempDirs: string[] = [];

    async function mkCheckoutDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-git-checkout-"));
        tempDirs.push(dir);
        // Use a nested, not-yet-created path so syncCheckout's mkdir -p is exercised.
        return path.join(dir, "checkout");
    }

    afterEach(async () => {
        for (const dir of tempDirs.splice(0)) {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    it("clones a real local bare repo into the checkout directory (tracer)", async () => {
        const bare = await createBareRepoWithFiles({
            "templates/whoami/template.yml": "schemaVersion: 1\nname: Whoami\ndescription: Shows request headers\ncategory: Utilities\n",
            "templates/whoami/default/variant.yml": "name: Default\ndescription: The default variant\n",
            "templates/whoami/default/docker-compose.yml": "services:\n  whoami:\n    image: traefik/whoami\n",
        });
        const checkoutDir = await mkCheckoutDir();

        const executor = new GitExecutor({allowedProtocols: ["file"]});
        const result = await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);

        expect(result.mode).toBe("cloned");
        expect(result.headCommitSha).toMatch(/^[0-9a-f]{40}$/);

        const composePath = path.join(checkoutDir, "templates", "whoami", "default", "docker-compose.yml");
        await expect(fs.access(composePath)).resolves.toBeUndefined();
    });

    it("resolves headCommitSha: null for an empty remote (no commits yet)", async () => {
        const bare = await createEmptyBareRepo();
        const checkoutDir = await mkCheckoutDir();

        const executor = new GitExecutor({allowedProtocols: ["file"]});
        const result = await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);

        expect(result.mode).toBe("cloned");
        expect(result.headCommitSha).toBeNull();
    });

    describe("URL validation", () => {
        it.each([
            ["file:///tmp/x", "file transport rejected by default protocol allowlist"],
            ["ext::sh -c id", "ext:: transport-helper syntax"],
            ["-u/x", "leading dash looks like a flag"],
            ["https://user:pw@host/repo.git", "embedded credentials"],
            ["", "empty string"],
        ])("rejects %s (%s) with BadRequestError and spawns no git process", async (badUrl) => {
            const executor = new GitExecutor();
            const checkoutDir = await mkCheckoutDir();
            await expect(executor.syncCheckout(badUrl, checkoutDir)).rejects.toBeInstanceOf(BadRequestError);
            // No checkout directory should have been created — proof no git
            // process (not even `mkdir -p`) ran for a rejected URL.
            await expect(fs.access(checkoutDir)).rejects.toThrow();
        });
    });

    it("pull on second sync: a second syncCheckout after a new commit was pushed fast-forward pulls (no re-clone)", async () => {
        const bare = await createBareRepoWithFiles({
            "templates/whoami/template.yml": "schemaVersion: 1\nname: Whoami\ndescription: d\ncategory: Utilities\n",
        });
        const checkoutDir = await mkCheckoutDir();
        const executor = new GitExecutor({allowedProtocols: ["file"]});

        const first = await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);
        expect(first.mode).toBe("cloned");

        await commitMoreFiles(bare, {"templates/whoami/NEW_FILE.txt": "new content\n"});

        const second = await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);
        expect(second.mode).toBe("pulled");
        expect(second.headCommitSha).not.toBe(first.headCommitSha);
        await expect(fs.access(path.join(checkoutDir, "templates", "whoami", "NEW_FILE.txt"))).resolves.toBeUndefined();
        expect(await listTmpSiblings(checkoutDir)).toEqual([]);
    });

    it("re-clone fallback: a rewritten remote history (non-fast-forward) re-clones instead of failing", async () => {
        const bare = await createBareRepoWithFiles({
            "templates/whoami/template.yml": "schemaVersion: 1\nname: Whoami\ndescription: d\ncategory: Utilities\n",
        });
        const checkoutDir = await mkCheckoutDir();
        const executor = new GitExecutor({allowedProtocols: ["file"]});

        await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);
        await rewriteBareRepoHistory(bare, {"templates/whoami/template.yml": "schemaVersion: 1\nname: Whoami2\ndescription: d\ncategory: Utilities\n"});

        const result = await executor.syncCheckout(pathToFileURL(bare).href, checkoutDir);
        expect(result.mode).toBe("recloned");
        const content = await fs.readFile(path.join(checkoutDir, "templates", "whoami", "template.yml"), "utf-8");
        expect(content).toContain("Whoami2");
        expect(await listTmpSiblings(checkoutDir)).toEqual([]);
    });

    it("concurrent syncs: two overlapping syncCheckout calls for the same dir both resolve and leave no tmp dir", async () => {
        const bare = await createBareRepoWithFiles({
            "templates/whoami/template.yml": "schemaVersion: 1\nname: Whoami\ndescription: d\ncategory: Utilities\n",
        });
        const checkoutDir = await mkCheckoutDir();
        const executor = new GitExecutor({allowedProtocols: ["file"]});

        const [a, b] = await Promise.all([
            executor.syncCheckout(pathToFileURL(bare).href, checkoutDir),
            executor.syncCheckout(pathToFileURL(bare).href, checkoutDir),
        ]);

        expect(a.headCommitSha).toMatch(/^[0-9a-f]{40}$/);
        expect(b.headCommitSha).toBe(a.headCommitSha);
        await expect(fs.access(path.join(checkoutDir, "templates", "whoami", "template.yml"))).resolves.toBeUndefined();
        expect(await listTmpSiblings(checkoutDir)).toEqual([]);
    });
});
