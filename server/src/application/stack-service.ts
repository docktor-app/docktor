import type {CreateStackInput, UpdateStackInput} from "@docktor/shared";
import {slugify} from "../lib/slugify.js";
import {BadRequestError, ConflictError, NotFoundError} from "../lib/errors.js";
import {createComposeConfig, type ComposeConfig} from "../domain/compose-config.js";
import {hashComposeContent} from "../lib/compose-parser.js";
import {assertTransition, TransitionError,} from "../domain/stack-status-machine.js";
import {buildImageRefFromService, detectNoUpdates, toImageRef, type ImageDigestComparison} from "../domain/image-update-detection.js";
import {ComposeEditError, getServiceImageTag, setServiceImageTag} from "../lib/compose-editor.js";
import type {StackRepository} from "../repositories/stack-repository.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {EventBusPort} from "./ports/event-bus-port.js";
import type {SettingsService} from "./settings-service.js";
import type {StackStatus, StackEventType} from "../generated/prisma/enums.js";

/**
 * Read port for the StackEvent audit trail. Declared here rather than
 * importing the concrete StackEventRepository, so this service stays
 * unit-testable with a plain object and the dependency arrow keeps
 * pointing inward (application depends on a port, not on repositories/).
 */
export interface StackEventReadRepo {
    findRecentByStack(stackId: string, limit?: number): Promise<Array<{
        id: string;
        type: StackEventType;
        message: string | null;
        payload: string | null;
        createdAt: Date;
    }>>;
}

/**
 * Read port for the ImageUpdateCheck repository. Declared here rather than
 * importing the concrete ImageUpdateCheckRepository, so this service stays
 * unit-testable with a plain object and the dependency arrow keeps pointing
 * inward (application depends on a port, not on repositories/) — same
 * precedent as StackEventReadRepo above. Moved in from routes/stacks.ts
 * (10-08 Task 2, D-01): the route-level join it used to back was a CLAUDE.md
 * layering violation the same defect class as D-10.
 */
export interface ImageUpdateCheckReadRepo {
    findByImageRefs(imageRefs: string[]): Promise<Array<{
        imageRef: string;
        hasUpdate: boolean;
        latestTag: string | null;
    }>>;
    findByImageRef(imageRef: string): Promise<{
        latestTag: string | null;
        availableTags: string | null;
    } | null>;
}

export class StackService {
    constructor(
        private readonly repo: StackRepository,
        private readonly fs: StackFilesystemPort,
        private readonly docker: DockerExecutorPort,
        private readonly events: StackEventReadRepo,
        private readonly bus: Pick<EventBusPort, "emit">,
        private readonly settings: Pick<SettingsService, "getProxySettings">,
        private readonly updateChecks: ImageUpdateCheckReadRepo,
    ) {}

    async createStack(input: CreateStackInput) {
        const id = slugify(input.displayName);
        if (!id) {
            throw new BadRequestError("Display name produces an empty slug");
        }

        if (await this.repo.exists(id)) {
            throw new ConflictError(`Stack "${id}" already exists`);
        }

        const hostPath = await this.fs.createDirectory(id);
        await this.fs.writeCompose(id, input.composeContent);
        if (input.envContent) {
            await this.fs.writeEnv(id, input.envContent);
        }

        const composeConfig = createComposeConfig(input.composeContent);

        return this.repo.create({
            id,
            displayName: input.displayName,
            description: input.description,
            hostPath,
            composeConfig,
        });
    }

    /**
     * Filters out protected stacks (e.g. the Docktor-managed proxy stack)
     * from the dashboard list unless the user opts in via
     * proxy.showInDashboard — kept in the service, not the route, per
     * CLAUDE.md's "routes only call application services" rule.
     */
    async listStacks() {
        const all = await this.repo.findAll();
        const {showInDashboard} = await this.settings.getProxySettings();
        return showInDashboard ? all : all.filter((s) => !s.isProtected);
    }

    async getStack(id: string) {
        return this.repo.findByIdWithRelations(id);
    }

    /**
     * Same as getStack(), with each service augmented by its
     * update-availability and latest tag from the ImageUpdateCheck table —
     * moved in from GET /api/stacks/:id's route-level join (10-08 Task 2,
     * D-01/D-10). The lookup key must reconstruct the same tag-qualified
     * ref that UpdateChecker.findAllImageRefs() persists (image +
     * imageTag), not just the untagged `image` column — otherwise a
     * service on an explicit tag never matches its own ImageUpdateCheck
     * row. `getStack()`'s repo call already throws NotFoundError for an
     * unknown stack before this method's own body runs, so the `!stack`
     * branch below is unreachable in production — kept only because the
     * route it replaces had the identical dead branch and this move must
     * not change observable behaviour either way.
     */
    async getStackWithUpdateInfo(id: string) {
        const stack = await this.getStack(id);
        if (!stack) return null;

        const serviceKeys = stack.services.map((svc) => ({
            svc,
            key: buildImageRefFromService(svc.image, svc.imageTag),
        }));
        const imageRefs = serviceKeys
            .map(({key}) => key)
            .filter((key): key is string => key !== null);
        const updateChecks = await this.updateChecks.findByImageRefs(imageRefs);
        const updateMap = new Map(updateChecks.map((u) => [u.imageRef, u]));

        return {
            ...stack,
            services: serviceKeys.map(({svc, key}) => ({
                ...svc,
                updateAvailable: (key !== null ? updateMap.get(key)?.hasUpdate : undefined) ?? false,
                latestTag: (key !== null ? updateMap.get(key)?.latestTag : undefined) ?? null,
            })),
        };
    }

    /**
     * Returns the current tag, latest tag and upgrade-candidate list for
     * one named service of one named stack — moved in from GET
     * /api/stacks/:id/services/:serviceName/tags (10-08 Task 2, D-01/D-10).
     *
     * The per-stack scoping below — resolving the service from the
     * addressed stack's own service list and raising NotFoundError when
     * it is absent — is an access-control check (it prevents a guessed
     * service name from reading another stack's data) and runs, unchanged
     * and in the same order, before anything else.
     */
    async getUpgradeCandidates(
        id: string,
        serviceName: string,
    ): Promise<{currentTag: string; latestTag: string | null; candidates: string[]}> {
        const stack = await this.getStack(id);
        if (!stack) throw new NotFoundError("Stack not found");

        const svc = stack.services.find((s) => s.serviceName === serviceName);
        if (!svc) throw new NotFoundError("Service not found");

        const imageRef = buildImageRefFromService(svc.image, svc.imageTag);
        const row = imageRef ? await this.updateChecks.findByImageRef(imageRef) : null;
        const {latestTag, candidates} = this.decodeUpgradeCandidates(row);

        return {currentTag: svc.imageTag ?? "latest", latestTag, candidates};
    }

    /**
     * Decodes the JSON-encoded availableTags column into a candidate array,
     * newest first, alongside the persisted latestTag. Never throws — a
     * not-yet-checked image (no row) or an unparsable/absent column is a
     * normal state, not an error, and must yield an empty candidate list.
     * Moved in from routes/stacks.ts's decodeUpgradeCandidates() (10-08
     * Task 2) — it is a pure decode with a documented never-throw contract
     * and belongs with its only caller.
     */
    private decodeUpgradeCandidates(
        row: {latestTag: string | null; availableTags: string | null} | null,
    ): {latestTag: string | null; candidates: string[]} {
        if (!row?.availableTags) return {latestTag: row?.latestTag ?? null, candidates: []};
        try {
            const parsed = JSON.parse(row.availableTags);
            const candidates = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
            return {latestTag: row.latestTag, candidates};
        } catch {
            return {latestTag: row.latestTag, candidates: []};
        }
    }

    /**
     * Reads the StackEvent audit trail (config_changed, config_error,
     * update_available) for one stack, newest first. Guards the stack
     * exists first so an unknown id raises NotFoundError instead of
     * silently returning an empty list — a typo must be distinguishable
     * from a quiet stack. Forwards an absent limit through unchanged so
     * the repository's own default is the single definition.
     */
    async getStackEvents(id: string, limit?: number): Promise<Array<{
        id: string;
        type: StackEventType;
        message: string | null;
        payload: string | null;
        createdAt: Date;
    }>> {
        await this.repo.findByIdOrThrow(id);
        return this.events.findRecentByStack(id, limit);
    }

    async updateStack(id: string, input: UpdateStackInput) {
        const stack = await this.repo.findByIdOrThrow(id);

        if (input.composeContent !== undefined) {
            // YAML-first: the file on disk must reflect exactly what the user
            // submitted, valid or not, so a failed parse below never loses
            // their edit — the write always happens before the parse attempt.
            await this.fs.writeCompose(id, input.composeContent);

            let composeConfig: ComposeConfig;
            try {
                composeConfig = createComposeConfig(input.composeContent);
            } catch (err) {
                // parseComposeContent() throws a raw Error on invalid YAML,
                // not an AppError subclass — translate it into a typed 400
                // carrying the parser's own message (mirrors file-watcher.ts's
                // handleFileChange() catch for this exact same exception),
                // instead of letting it fall through to Fastify's generic
                // 500 catch-all (G-08-6).
                throw new BadRequestError(err instanceof Error ? err.message : String(err));
            }

            const hashChanged = composeConfig.hash !== stack.lastKnownHash;
            // Don't update service records yet - wait until deployment
            // This keeps service records in sync with what's actually running
            await this.repo.setConfigChanged(id, hashChanged);
            // A successful parse is positive evidence the file on disk is
            // valid — clear any stale configError (from a prior external
            // edit or a prior invalid app save) even when this particular
            // save didn't change the hash.
            await this.repo.clearConfigError(id);
            // Update the hash so we can track changes, and announce the
            // change to every open tab. A same-hash save must not announce
            // anything — setConfigChanged(false) above already says nothing
            // changed.
            if (hashChanged) {
                await this.repo.updateStackHash({
                    stackId: id,
                    hash: composeConfig.hash,
                });
                this.publishConfigChanged(id, composeConfig.hash);
            }
        }

        if (input.envContent !== undefined) {
            if (input.envContent) {
                await this.fs.writeEnv(id, input.envContent);
            } else {
                await this.fs.removeEnv(id);
            }
            // Env content isn't hashed anywhere the way compose content is
            // via lastKnownHash/createComposeConfig().hash, so there is no
            // diff to compare against — unconditionally flagging matches
            // "something changed" semantics, which is the simpler and
            // correct behaviour for an env write (todo:
            // env-file-changes-dont-flag-config-changed). Never write an
            // env hash into lastKnownHash: that column is the sole input to
            // FileWatcher's compose change detection, and corrupting it
            // would make external compose tampering undetectable.
            await this.repo.setConfigChanged(id, true);
            // Mirrors the compose branch's repo.updateStackHash: keeps
            // Stack.lastEnvHash in sync with exactly what was just written
            // (or the hash of "" on removal), so FileWatcher.handleEnvChange's
            // later chokidar reconcile of this same write compares against a
            // hash that already matches and is a no-op instead of firing a
            // second, genuinely-misclassified external config_changed
            // broadcast (G-08-2's compounding bug).
            await this.repo.updateEnvHash({stackId: id, hash: hashComposeContent(input.envContent)});
            // No compose hash to report for an env-only write; reuse the
            // stack's current lastKnownHash so the event shape stays
            // uniform with file-watcher.ts's ConfigChangedEvent. Every
            // consumer only keys off stackId, so the exact hash value here
            // carries no meaning for this branch.
            this.publishConfigChanged(id, stack.lastKnownHash ?? "");
        }

        if (input.displayName !== undefined || input.description !== undefined) {
            await this.repo.updateMetadata(id, {
                displayName: input.displayName,
                description: input.description,
            });
        }

        return this.repo.findByIdWithRelations(id);
    }

    async deleteStack(id: string) {
        const stack = await this.repo.findByIdOrThrow(id);
        this.assertNotProtected(stack, "deleted");
        this.guardTransition(stack.status as StackStatus, "DELETE");

        try {
            await this.docker.down(id);
        } catch (err: any) {
            // Continue with deletion even if docker down fails
            // (e.g., containers already removed manually)
        }

        await this.fs.removeDirectory(id);
        await this.repo.delete(id);
    }

    async deployStack(id: string) {
        const stack = await this.repo.findByIdOrThrow(id);
        this.guardTransition(stack.status as StackStatus, "DEPLOY");

        await this.transitionStatus(
            id,
            stack.status as StackStatus,
            "DEPLOYING",
            "Deployment started",
        );

        let success = true;
        let errorMessage: string | undefined;

        try {
            await this.docker.up(id);
        } catch (err: any) {
            success = false;
            errorMessage = err.stderr || err.message;
        }

        // Everything below must stay inside this try/catch: no action's allowed-from
        // list includes DEPLOYING (stack-status-machine.ts) and StatePoller
        // unconditionally skips transitional statuses, so any unhandled failure here
        // (compose re-read/parse, a DB write) would leave the stack permanently stuck
        // in DEPLOYING with no way to recover it short of a manual DB edit.
        try {
            const composeContent = await this.fs.readCompose(id);
            const composeConfig = createComposeConfig(composeContent);

            await this.repo.recordDeployment({
                stackId: id,
                composeHash: composeConfig.hash,
                success,
                errorMessage,
            });

            if (success) {
                // Update service records to match the deployed compose file
                await this.repo.replaceServices(id, composeConfig);
                await this.transitionStatus(
                    id,
                    "DEPLOYING",
                    "RUNNING",
                    "Deployment succeeded",
                );
                await this.repo.clearConfigChanged(id);
            } else {
                await this.transitionStatus(
                    id,
                    "DEPLOYING",
                    "ERROR",
                    `Deployment failed: ${errorMessage}`,
                );
            }
        } catch (err: any) {
            success = false;
            errorMessage = err.message ?? String(err);
            await this.transitionStatus(
                id,
                "DEPLOYING",
                "ERROR",
                `Deployment failed: ${errorMessage}`,
            );
        }

        return {success, errorMessage};
    }

    async stopStack(id: string) {
        const stack = await this.repo.findByIdOrThrow(id);
        this.assertNotProtected(stack, "stopped");
        this.guardTransition(stack.status as StackStatus, "STOP");

        await this.transitionStatus(
            id,
            stack.status as StackStatus,
            "STOPPED",
            "Stack stopped",
        );

        try {
            await this.docker.stop(id);
        } catch (err: any) {
            await this.transitionStatus(
                id,
                "STOPPED",
                "ERROR",
                `Stop failed: ${err.stderr || err.message}`,
            );
            throw err;
        }
    }

    async restartStack(id: string) {
        const stack = await this.repo.findByIdOrThrow(id);
        this.assertNotProtected(stack, "restarted");
        this.guardTransition(stack.status as StackStatus, "RESTART");

        await this.docker.restart(id);

        await this.transitionStatus(
            id,
            stack.status as StackStatus,
            stack.status as StackStatus,
            "Stack restarted",
        );
        await this.repo.clearConfigChanged(id);
    }

    async updateImages(id: string): Promise<{noUpdates: boolean}> {
        const stack = await this.repo.findByIdOrThrow(id);
        this.guardTransition(stack.status as StackStatus, "UPDATE");

        // Collected before the UPDATING transition and always total (see
        // collectImageRefs): a malformed or unreadable compose file can
        // never strand the stack in UPDATING through this digest-comparison
        // code path — it just degrades the answer to the generic message.
        const refs = await this.collectImageRefs(id);

        await this.transitionStatus(
            id,
            stack.status as StackStatus,
            "UPDATING",
            "Image update started",
        );

        let beforeDigests = new Map<string, string | null>();
        let afterDigests = new Map<string, string | null>();
        try {
            beforeDigests = await this.snapshotDigests(refs);
            await this.docker.composePull(id);
            await this.docker.up(id);
            afterDigests = await this.snapshotDigests(refs);
        } catch (err: any) {
            await this.transitionStatus(
                id,
                "UPDATING",
                "ERROR",
                err.stderr ?? err.message,
            );
            throw err;
        }

        // Everything below must stay inside this try/catch: no action's allowed-from
        // list includes UPDATING (stack-status-machine.ts) and StatePoller
        // unconditionally skips transitional statuses, so any unhandled failure here
        // (compose re-read/parse, a DB write) would leave the stack permanently stuck
        // in UPDATING with no way to recover it short of a manual DB edit.
        try {
            // After successful update, sync service records with the compose file
            const composeContent = await this.fs.readCompose(id);
            const composeConfig = createComposeConfig(composeContent);
            await this.repo.replaceServices(id, composeConfig);

            await this.transitionStatus(
                id,
                "UPDATING",
                "RUNNING",
                "Image update succeeded",
            );
            await this.repo.clearConfigChanged(id);
        } catch (err: any) {
            await this.transitionStatus(
                id,
                "UPDATING",
                "ERROR",
                err.message ?? String(err),
            );
            throw err;
        }

        // An unknown or missing digest must never be reported as "nothing
        // changed" — detectNoUpdates() only returns true on positive
        // evidence (every ref's before digest strictly equals its after
        // digest). Reporting "up to date" on an unknown was the original
        // bug (G-02-11): do not "helpfully" flip this default back to
        // treat absence as equality. This replaces the old free-text scan
        // of the pull command's stdout/stderr, which does not correspond
        // to any status vocabulary the current Docker Compose CLI emits.
        const comparisons: ImageDigestComparison[] = refs.map((ref) => ({
            ref,
            before: beforeDigests.get(ref) ?? null,
            after: afterDigests.get(ref) ?? null,
        }));
        return {noUpdates: detectNoUpdates(comparisons)};
    }

    /**
     * Reads and parses the compose file to build the set of image refs to
     * digest-compare across the pull. Must be total — called before the
     * UPDATING transition, so a compose file that cannot be read or parsed
     * can never strand the stack there. Any failure here degrades to an
     * empty ref list, which in turn makes detectNoUpdates() report the
     * generic "images updated" answer rather than throwing.
     */
    private async collectImageRefs(id: string): Promise<string[]> {
        try {
            const composeContent = await this.fs.readCompose(id);
            const composeConfig = createComposeConfig(composeContent);
            const refs = composeConfig.services
                .map((service) => toImageRef(service))
                .filter((ref): ref is string => ref !== null);
            return Array.from(new Set(refs));
        } catch (err: any) {
            console.warn(
                `[StackService] collectImageRefs: failed to read/parse compose file for stack "${id}", proceeding without digest comparison:`,
                err.message ?? err,
            );
            return [];
        }
    }

    /**
     * Resolves the local image store digest for each ref in parallel.
     * DockerExecutor.imageDigest() already swallows its own failures and
     * resolves null rather than throwing, but each lookup is still wrapped
     * individually so a single unexpectedly-rejecting ref cannot fail the
     * whole Promise.all and take the in-flight update down with it — the
     * unknown digest still resolves to null, which detectNoUpdates()
     * already treats as "not evidence of no change".
     */
    private async snapshotDigests(refs: readonly string[]): Promise<Map<string, string | null>> {
        const entries = await Promise.all(
            refs.map(async (ref): Promise<readonly [string, string | null]> => {
                try {
                    return [ref, await this.docker.imageDigest(ref)] as const;
                } catch {
                    return [ref, null] as const;
                }
            }),
        );
        return new Map(entries);
    }

    /**
     * Rewrites a single service's image tag in the compose file, deploys
     * it, and persists the resulting Service rows — a real version upgrade
     * rather than a pull-and-deploy whose effect disappears on restart
     * (UPD-04). Never invoked from a background path; the only caller is
     * the authenticated POST /api/stacks/:id/services/:serviceName/upgrade
     * route.
     */
    async upgradeServiceImage(
        id: string,
        serviceName: string,
        targetTag: string,
    ): Promise<{changed: boolean; previousTag: string | null; newTag: string}> {
        const stack = await this.repo.findByIdOrThrow(id);
        const originalContent = await this.fs.readCompose(id);

        let previousTag: string | null;
        try {
            previousTag = getServiceImageTag(originalContent, serviceName);
        } catch (err) {
            throw this.translateComposeEditError(err);
        }

        // guardTransition is a pure check (no side effects), so it always
        // runs before the idempotency short-circuit below — this is what
        // makes a second concurrent upgrade request fail with the same
        // status-guard rejection as updateImages(), even when its target
        // tag happens to match what a still-in-flight request already
        // wrote to disk.
        this.guardTransition(stack.status as StackStatus, "UPDATE");

        if ((previousTag ?? "latest") === targetTag) {
            // Idempotency guarantee: no write, no status transition.
            return {changed: false, previousTag, newTag: targetTag};
        }

        await this.transitionStatus(
            id,
            stack.status as StackStatus,
            "UPDATING",
            `Upgrading ${serviceName} to ${targetTag}`,
        );

        let newContent: string;
        try {
            newContent = setServiceImageTag(originalContent, serviceName, targetTag);
        } catch (err) {
            await this.transitionStatus(id, "UPDATING", "ERROR", (err as Error).message);
            throw this.translateComposeEditError(err);
        }

        await this.fs.writeCompose(id, newContent);

        try {
            await this.docker.composePull(id);
            await this.docker.up(id);
        } catch (err: any) {
            // The compose file was already rewritten above — restore the
            // original content so a failed upgrade never strands the stack
            // on a version it never successfully ran (UPD-04). The restore
            // is best-effort: if it fails too, log it and still surface the
            // deploy error (the actionable cause), not the restore error.
            try {
                await this.fs.writeCompose(id, originalContent);
            } catch (restoreErr: any) {
                console.error(
                    `[StackService] failed to restore compose file for stack "${id}" after a failed upgrade of "${serviceName}":`,
                    restoreErr,
                );
            }
            await this.transitionStatus(
                id,
                "UPDATING",
                "ERROR",
                err.stderr ?? err.message,
            );
            throw err;
        }

        // Everything below must stay inside this try/catch: no action's
        // allowed-from list includes UPDATING and StatePoller unconditionally
        // skips transitional statuses, so any unhandled failure here would
        // leave the stack permanently stuck in UPDATING (see updateImages()).
        try {
            const composeConfig = createComposeConfig(newContent);
            await this.repo.replaceServices(id, composeConfig);
            await this.transitionStatus(
                id,
                "UPDATING",
                "RUNNING",
                `Upgraded ${serviceName} to ${targetTag}`,
            );
            await this.repo.clearConfigChanged(id);
        } catch (err: any) {
            await this.transitionStatus(
                id,
                "UPDATING",
                "ERROR",
                err.message ?? String(err),
            );
            throw err;
        }

        return {changed: true, previousTag, newTag: targetTag};
    }

    async getContainerStatuses(id: string) {
        await this.repo.findByIdOrThrow(id);
        return this.docker.ps(id);
    }

    async getComposeContent(id: string): Promise<string> {
        await this.repo.findByIdOrThrow(id);
        return this.fs.readCompose(id);
    }

    async getEnvContent(id: string): Promise<string> {
        await this.repo.findByIdOrThrow(id);
        return this.fs.readEnv(id);
    }

    /**
     * Wraps the repository's DB write with a `stack.status_changed` emit.
     * This is the single call site for `repo.transitionStatus` — every
     * action method above routes through here so a manual action becomes
     * visible over SSE (via the state-broadcast subscriber) while it is
     * still in flight, not only after StatePoller's next 60s reconcile()
     * tick (todo: manual-actions-dont-broadcast-sse). The emit happens
     * strictly after the DB write resolves — an emit before a failed write
     * would advertise a status that never existed — and any emit failure is
     * caught and logged rather than propagated: the bus contract says emit
     * does not throw, but this catch is defence-in-depth so a contract
     * violation can never strand a stack in a transitional status that no
     * action's allowed-from list accepts and StatePoller unconditionally
     * skips.
     */
    private async transitionStatus(
        id: string,
        from: StackStatus,
        to: StackStatus,
        message?: string,
    ): Promise<void> {
        await this.repo.transitionStatus(id, from, to, message);
        try {
            this.bus.emit("stack.status_changed", {stackId: id, status: to});
        } catch (err) {
            console.error(`[StackService] failed to emit stack.status_changed for "${id}":`, err);
        }
    }

    /**
     * Same non-throwing guard as transitionStatus(), for
     * stack.config_changed. This is the sole app-initiated call site (both
     * updateStack() branches route through it), so the app-origin tag below
     * is a hardcoded literal, not a parameter — FileWatcher's two emit call
     * sites are the only other caller of this event and always tag
     * "external".
     */
    private publishConfigChanged(id: string, newHash: string): void {
        try {
            this.bus.emit("stack.config_changed", {stackId: id, newHash, source: "app"});
        } catch (err) {
            console.error(`[StackService] failed to emit stack.config_changed for "${id}":`, err);
        }
    }

    /**
     * D-12: refuses stop/restart/delete on a Docktor-managed protected
     * stack (e.g. the proxy stack) server-side, before guardTransition runs
     * and before any docker call — a direct API call must be refused
     * exactly like a disabled UI button (T-06-13). deployStack and
     * updateImages are deliberately NOT guarded: ProxyService.deployProxyStack
     * calls deployStack on this very stack, and D-12 names only
     * stop/restart/delete.
     */
    private assertNotProtected(stack: {id: string; isProtected: boolean}, action: string): void {
        if (stack.isProtected) {
            throw new BadRequestError(
                `Stack "${stack.id}" is managed by Docktor and cannot be ${action} directly`,
            );
        }
    }

    private guardTransition(current: StackStatus, action: "DEPLOY" | "STOP" | "RESTART" | "DELETE" | "UPDATE") {
        try {
            assertTransition(current, action);
        } catch (err) {
            if (err instanceof TransitionError) {
                throw new BadRequestError(err.message);
            }
            throw err;
        }
    }

    // A service that doesn't belong to the addressed stack's compose file
    // is a 404 (not found); every other compose-edit failure (no image key,
    // a digest pin) is a 400 (the request can't be satisfied as written).
    private translateComposeEditError(err: unknown): Error {
        if (err instanceof ComposeEditError) {
            if (err.reason === "service-not-found") {
                return new NotFoundError(err.message);
            }
            return new BadRequestError(err.message);
        }
        return err instanceof Error ? err : new Error(String(err));
    }
}
