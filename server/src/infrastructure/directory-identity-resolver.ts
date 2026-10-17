import fs from "node:fs/promises";
import path from "node:path";
import type {OwnMountsView} from "../domain/bind-mount-sources.js";
import {
    containerPathsOfHostPath,
    labelDirectoryIdentity,
    localDirectoryIdentity,
    type DirectoryIdentity,
} from "../domain/directory-identity.js";
import type {DirectoryIdentityPort} from "../application/ports/directory-identity-port.js";
import type {OwnMountsPort} from "../application/ports/own-mounts-port.js";
import {dockerSelfStack} from "./docker-self-stack.js";

/**
 * Resolves directory identities from the real filesystem (`fs.realpath`, which
 * follows symlinks) and Docktor's own bind mounts (container path to host
 * path). Nothing here rejects: a path that does not exist yet, or one
 * `realpath` cannot read, is identified by its plain spelling.
 */
export class DirectoryIdentityResolver implements DirectoryIdentityPort {
    private pendingView: Promise<OwnMountsView> | null = null;

    constructor(
        private readonly ownMounts: OwnMountsPort = dockerSelfStack,
        private readonly realpath: (p: string) => Promise<string> = (p) => fs.realpath(p),
    ) {}

    async identifyLocal(directory: string): Promise<DirectoryIdentity> {
        const [view, spellings] = await Promise.all([this.view(), this.withRealpath(path.resolve(directory))]);
        return localDirectoryIdentity(spellings, view);
    }

    async identifyLabel(directory: string): Promise<DirectoryIdentity> {
        const view = await this.view();
        if (view.kind === "host") {
            return labelDirectoryIdentity(path.resolve(directory), await this.realpathsOf(path.resolve(directory)), view);
        }
        if (view.kind === "unknown") {
            return labelDirectoryIdentity(directory, [], view);
        }
        const candidates = containerPathsOfHostPath(directory, view.mounts);
        const spellings = (await Promise.all(candidates.map((candidate) => this.withRealpath(candidate)))).flat();
        return labelDirectoryIdentity(directory, spellings, view);
    }

    /**
     * Docktor's mounts cannot change while it runs, and `ownMounts()` inspects
     * the container on every call, so the first known answer is kept. An
     * unknown answer (the lookup failed) is not kept: the next call asks again.
     */
    private view(): Promise<OwnMountsView> {
        this.pendingView ??= this.ownMounts
            .ownMounts()
            .catch((): OwnMountsView => ({kind: "unknown"}))
            .then((view) => {
                if (view.kind === "unknown") {
                    this.pendingView = null;
                }
                return view;
            });
        return this.pendingView;
    }

    /** `spelling` plus its symlink-free form when the filesystem can resolve it. */
    private async withRealpath(spelling: string): Promise<string[]> {
        return [spelling, ...(await this.realpathsOf(spelling))];
    }

    private async realpathsOf(spelling: string): Promise<string[]> {
        const resolved = await this.realpath(spelling).catch(() => null);
        return resolved === null ? [] : [resolved];
    }
}

export const directoryIdentityResolver = new DirectoryIdentityResolver();
