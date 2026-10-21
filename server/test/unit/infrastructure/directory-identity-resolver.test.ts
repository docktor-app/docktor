import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {OwnMountsView} from "../../../src/domain/bind-mount-sources.js";
import {relateDirectories} from "../../../src/domain/directory-identity.js";
import {toComparablePath} from "../../../src/domain/self-stack-paths.js";
import {DirectoryIdentityResolver} from "../../../src/infrastructure/directory-identity-resolver.js";

function ownMountsReturning(view: OwnMountsView) {
    return {ownMounts: vi.fn().mockResolvedValue(view)};
}

const keepPath = async (p: string): Promise<string> => p;

describe.skipIf(process.platform === "win32")("DirectoryIdentityResolver (G-18-22-inplace)", () => {
    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-identity-"));
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    describe("symlinks and missing directories", () => {
        it("relates a symlinked spelling to its target as the same directory", async () => {
            await fs.mkdir(path.join(tmpRoot, "real", "memos"), {recursive: true});
            await fs.symlink(path.join(tmpRoot, "real"), path.join(tmpRoot, "link"));
            const resolver = new DirectoryIdentityResolver(ownMountsReturning({kind: "host"}));

            const viaLink = await resolver.identifyLocal(path.join(tmpRoot, "link", "memos"));
            const direct = await resolver.identifyLocal(path.join(tmpRoot, "real", "memos"));

            expect(relateDirectories(viaLink, direct)).toBe("same");
        });

        it("identifies a directory that does not exist by its own spelling instead of rejecting", async () => {
            const resolver = new DirectoryIdentityResolver(ownMountsReturning({kind: "host"}));
            const missing = path.join(tmpRoot, "not-created-yet");

            const identity = await resolver.identifyLocal(missing);

            expect(identity.keys).toContain(`host:${toComparablePath(missing)}`);
        });
    });

    describe("through Docktor's own mounts", () => {
        const containerView = (hostRoot: string): OwnMountsView => ({
            kind: "container",
            mounts: [{type: "bind", source: "/", destination: toComparablePath(hostRoot)}],
        });

        it("relates a path under the host-root mount to the label naming the same host path", async () => {
            const hostRoot = path.join(tmpRoot, "host");
            const resolver = new DirectoryIdentityResolver(ownMountsReturning(containerView(hostRoot)), keepPath);

            const local = await resolver.identifyLocal(`${hostRoot}/srv/app`);
            const label = await resolver.identifyLabel("/srv/app");

            expect(relateDirectories(local, label)).toBe("same");
        });

        it("follows a symlink beneath the mount when identifying a label", async () => {
            const hostRoot = path.join(tmpRoot, "host");
            const realpath = async (p: string): Promise<string> =>
                p === `${hostRoot}/srv/link` ? `${hostRoot}/srv/app` : p;
            const resolver = new DirectoryIdentityResolver(ownMountsReturning(containerView(hostRoot)), realpath);

            const label = await resolver.identifyLabel("/srv/link");
            const local = await resolver.identifyLocal(`${hostRoot}/srv/app`);

            expect(relateDirectories(label, local)).toBe("same");
        });

        it("resolves a label in the host view like a local path", async () => {
            const realpath = async (p: string): Promise<string> => (p === "/a/link" ? "/a/real" : p);
            const resolver = new DirectoryIdentityResolver(ownMountsReturning({kind: "host"}), realpath);

            const label = await resolver.identifyLabel("/a/link");
            const local = await resolver.identifyLocal("/a/real");

            expect(relateDirectories(label, local)).toBe("same");
        });
    });

    describe("never rejects", () => {
        const denied = async (): Promise<string> => {
            throw Object.assign(new Error("EACCES: permission denied"), {code: "EACCES"});
        };

        it.each<[string, OwnMountsView]>([
            ["host", {kind: "host"}],
            ["container", {kind: "container", mounts: [{type: "bind", source: "/", destination: "/host"}]}],
            ["unknown", {kind: "unknown"}],
        ])("when realpath fails with EACCES in the %s view", async (_name, view) => {
            const resolver = new DirectoryIdentityResolver(ownMountsReturning(view), denied);

            await expect(resolver.identifyLocal("/host/srv/app")).resolves.toBeDefined();
            await expect(resolver.identifyLabel("/srv/app")).resolves.toBeDefined();
        });
    });

    describe("an own-mounts adapter that fails", () => {
        it("is read as unknown mounts: identical spellings still match, aliases do not", async () => {
            const resolver = new DirectoryIdentityResolver(
                {ownMounts: vi.fn().mockRejectedValue(new Error("docker unreachable"))},
                keepPath,
            );

            const direct = await resolver.identifyLocal("/opt/x");
            const alias = await resolver.identifyLocal("/host/opt/x");

            expect(direct.mountsKnown).toBe(false);
            expect(relateDirectories(direct, await resolver.identifyLocal("/opt/x"))).toBe("same");
            expect(relateDirectories(direct, alias)).toBe("unrelated");
        });
    });

    describe("mount view caching", () => {
        it("asks for the mounts once when they are known", async () => {
            const ownMounts = ownMountsReturning({kind: "container", mounts: []});
            const resolver = new DirectoryIdentityResolver(ownMounts, keepPath);

            for (let call = 0; call < 5; call++) {
                await resolver.identifyLocal("/opt/x");
                await resolver.identifyLabel("/opt/x");
            }

            expect(ownMounts.ownMounts).toHaveBeenCalledTimes(1);
        });

        it("asks once for concurrent first calls", async () => {
            const ownMounts = ownMountsReturning({kind: "host"});
            const resolver = new DirectoryIdentityResolver(ownMounts, keepPath);

            await Promise.all([resolver.identifyLocal("/a"), resolver.identifyLocal("/b"), resolver.identifyLabel("/c")]);

            expect(ownMounts.ownMounts).toHaveBeenCalledTimes(1);
        });

        it("keeps asking while the mounts are unknown, then caches the first known answer", async () => {
            const ownMounts = ownMountsReturning({kind: "unknown"});
            const resolver = new DirectoryIdentityResolver(ownMounts, keepPath);

            await resolver.identifyLocal("/opt/x");
            await resolver.identifyLabel("/opt/x");
            await resolver.identifyLocal("/opt/x");
            expect(ownMounts.ownMounts).toHaveBeenCalledTimes(3);

            ownMounts.ownMounts.mockResolvedValue({kind: "host"});
            await resolver.identifyLocal("/opt/x");
            await resolver.identifyLocal("/opt/x");
            await resolver.identifyLabel("/opt/x");

            expect(ownMounts.ownMounts).toHaveBeenCalledTimes(4);
        });
    });
});
