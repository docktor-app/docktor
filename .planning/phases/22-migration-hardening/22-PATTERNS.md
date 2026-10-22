# Phase 22: Migration Hardening - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 24 (new + modified)
**Analogs found:** 22 / 24 (all analog paths verified as tracked source under server/, shared/, client/, .github/)

No RESEARCH.md; file list derived from CONTEXT.md, ROADMAP Phase 22 and REQUIREMENTS MIG-05..13.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/src/lib/errors.ts` (MOD: `cause` ctor option) | utility | transform | itself (`AppError`, lines 1-10) | exact |
| `server/src/domain/compose-project-resolver.ts` (NEW) | domain | transform | `server/src/domain/compose-project-name.ts` | exact |
| `server/src/infrastructure/external-stack-control.ts` (MOD: project resolve, verify stopped, env allowlist, keep-volumes down) | adapter | request-response (shell-out) | itself | exact |
| `server/src/application/ports/external-stack-control-port.ts` (MOD: add `verifyStopped`, `down` w/o `-v`) | port | request-response | itself | exact |
| `server/src/infrastructure/compose-env.ts` (NEW: env allowlist) | utility | transform | `external-stack-control.ts` `defaultRunner` (lines 17-18) | role-match |
| `server/src/infrastructure/docker-executor.ts` (MOD: env allowlist on `composeExec`; do NOT reuse `down -v`) | adapter | request-response | itself (line 33-35 `down` uses `-v`) | exact |
| `server/src/infrastructure/volume-migrator.ts` (MOD: correct named volume, anonymous detect, `~`, disk size) | adapter | file-I/O | itself | exact |
| `server/src/domain/bind-mount-sources.ts` (MOD: `~` classification) | domain | transform | itself (line 30-43 `~` refusal) | exact |
| `server/src/domain/migration-target.ts` (MOD) | domain | transform | itself | exact |
| `server/src/domain/disk-space.ts` (NEW: per-filesystem required-vs-available, x1.1) | domain | transform | `server/src/domain/disk-usage.ts` + `jobs/disk-checker.ts` (statfs, lines 63-66) | role-match |
| `server/src/application/migration-service.ts` (MOD: reorder steps, verified stop, backup after stop, rollback ledger, verified restart) | service | request-response/batch | itself (execute 490-632) | exact |
| `server/src/domain/migration-ledger.ts` + `server/src/infrastructure/migration-journal.ts` (NEW: journal storage) | domain + adapter | file-I/O / CRUD | `infrastructure/stack-filesystem.ts`, `certificate-filesystem.ts` | role-match |
| `server/src/application/migration-recovery-service.ts` (NEW: boot recovery) | service | event-driven (startup) | `application/container-state-catch-up.ts` | role-match |
| `server/src/index.ts` (MOD: call recovery before `app.listen`) | config/bootstrap | startup | itself (schema-sync block, lines 60-84) | exact |
| `server/src/domain/migration-operation.ts` (MOD: new statuses e.g. rolled_back) | domain | transform | itself | exact |
| `server/src/application/migration-operation-service.ts` (MOD: persistence, rolled-back) | service | pub-sub | itself | exact |
| `shared/src/validation/migration-operation.ts` (MOD: steps enum, statuses, result wording, event schemas) | schema | transform | itself | exact |
| `shared/src/validation/brownfield.ts` (MOD: path hardening, anonymous-volume ack, disk shortfall in preview) | schema | request-response | itself (`migrationExecuteSchema`, line 52) | exact |
| `shared/src/validation/mask-secrets.ts` (NEW: `maskSecrets`, re-export in `shared/src/index.ts`) | utility | transform | `client/src/lib/env-mask.ts` (+ `isSecretKey` in `client/src/lib/env-file.ts`) | role-match (move to shared) |
| `server/src/routes/imports.ts` (MOD) | route | request-response | itself (lines 53-102) | exact |
| `server/src/application/compose-review-service.ts` (MOD: masked diff) | service | transform | itself | exact |
| `client/src/lib/migration-progress.ts` (MOD: terminal states, new step labels) | utility | event-driven | itself (exhaustive `STEP_LABELS`) | exact |
| `client/src/hooks/use-migration-operations.ts` (MOD: reconcile after reload/reconnect) | hook | event-driven (SSE) | itself | exact |
| `client/src/routes/setup/components/migration-review-step.tsx`, `migration-select-step.tsx`, `migration-backup-step.tsx` (MOD: Show-secrets toggle, anonymous ack, disk shortfall) | component | request-response | themselves; `client/src/lib/env-mask.ts` consumers | exact |
| `.github/workflows/ci.yml` (MOD: Linux root ownership job) | config | batch | `build-and-test` job (lines 21-85) | role-match |
| Tests: `server/test/unit/{infrastructure,application,domain}/*.test.ts` | test | - | `external-stack-control.test.ts`, `volume-migrator.test.ts`, `migration-service.test.ts`, `migration-operation.test.ts` | exact |

## Pattern Assignments

### `server/src/lib/errors.ts` (utility) - MIG-12 error `cause` hygiene
Currently callers do `wrapped.cause = err` after construction (`external-stack-control.ts` lines 51-55). Change `AppError` to accept `options?: {cause?: unknown}` and pass to `super(message, {cause})`; keep `(message, statusCode, code)` positional signature (subclasses at lines 12-60 call it). Must land before Phase 24 adds subclasses.
```typescript
export class AppError extends Error {
    constructor(message: string, public statusCode: number = 500, public code?: string) {
        super(message);
        this.name = this.constructor.name;
    }
}
```
Then replace the assign-after pattern in `external-stack-control.ts:51-55` and the `new AppError(...)` in `volume-migrator.ts` lines 22-30 with the constructor option. Existing test asserting `appError.cause` toBe failure: `external-stack-control.test.ts` line ~45-50.

### `server/src/infrastructure/external-stack-control.ts` (adapter, shell-out) - MIG-05, MIG-08, MIG-13
**Analog:** itself. Keep the injectable runner seam (lines 12-18) so tests use a fake runner; extend the runner options with `env`.
```typescript
export type ComposeCommandRunner = (
    file: string, args: readonly string[],
    options: {readonly cwd: string; readonly timeout: number},
) => Promise<{stdout: string; stderr: string}>;
const defaultRunner: ComposeCommandRunner = (file, args, options) =>
    execFileAsync(file, [...args], {cwd: options.cwd, timeout: options.timeout});
```
- Add `env: allowlistedComposeEnv(process.env)` (PATH, HOME, DOCKER_HOST, DOCKER_CONFIG, DOCKER_CONTEXT, locale; no `COMPOSE_*`, no `BETTER_AUTH_SECRET`/`DATABASE_URL`). Apply identically in `docker-executor.ts` `composeExec` (lines 17-23) via the shared helper.
- Resolve the real project (`docker compose -f <path> ps -a --format json`, or `docker ps -a --filter label=com.docker.compose.project.config_files=<path>`; use `-p <resolved>` for stop/start/down) rather than relying on directory name; domain-side name derivation analog is `domain/compose-project-name.ts` (`normalizeComposeProjectName`, `composeFileName`, lines 20-50).
- New `verifyStopped(composePath)`: returns the resolved project + still-running container names; migration-service hard-refuses (D-04) with `BadRequestError`/`ConflictError` naming both.
- New keep-volumes variant: `["compose","-p",project,"down"]` WITHOUT `-v`; never call `DockerExecutor.down` (line 33-35, `["down","-v"]`) in rollback.
- Compose argv rule (T-18-08): path as its own argv element, no shell.
- Error handling: `describeFailure` (lines 59-69) prefers stderr; keep.

### `server/src/application/ports/external-stack-control-port.ts` (port)
Doc-commented interface with `stop`/`start` (see file). Add `verifyStopped(composePath): Promise<StopVerification>`, `down(composePath)` (keeps volumes), `isRunning`/`runningContainers` for D-07 verified restart with a timeout; keep the "never up/recreate" doc rule.

### `server/src/application/migration-service.ts` (service) - core reorder (D-01)
**Analog:** itself, `execute` lines 490-632. New order: preflight (+ disk check) -> stop (line ~505-510 pattern) -> verifyStopped -> backup -> copy -> rewrite -> record -> deploy.
Existing flow to restructure:
```typescript
if (stopOldStack) { this.report(onProgress, "stopping_old_stack"); oldStackStopped = true; await this.oldStack.stop(composePath); }
...
if (backup && !inPlace) { this.report(onProgress, "backing_up"); await this.migrator.copyDirectory(originalDir, path.join(newStackPath, BACKUP_DIR_NAME)); }
```
- Backup moves after verified stop; scope = old stack dir + selected bind sources (D-03); named volumes not copied (rollback source).
- Rollback block (catch, lines ~585-632): keep guard flags (`createdStackDir`, `recordCreated`, `movedAside`; "only what this run created is removed"), `moveOriginalBack` (763-780) and replace `restartOldStack` (784-794) result string with verified outcome: "restart requested" -> poll running -> "original stack restored and running" or terminal "rolled back, but original stack is not running - check manually" (D-07). Never delete volumes.
- Write ledger entries (journal) before each destructive step so boot recovery can replay the inverse.
- Preflight additions at lines 310-343: disk check per destination filesystem (stacks dir vs volume storage, x1.1, D-08) and `~` handling via `planBindCopies` (412-436); anonymous volumes surfaced in preview (250-288) and require ack in `MigrationInput` (163-180).
- Progress reporting: `report()` (634-648) swallows listener errors; keep.
- Error imports pattern (lines 27): `import {AppError, BadRequestError, ConflictError, hasErrorCode} from "../lib/errors.js";`; DI via constructor ports with defaults (lines 223-241).

### `server/src/infrastructure/volume-migrator.ts` (adapter, file-I/O) - MIG-06/07/13
Current named-volume copy (lines 49-62) uses `-v volumeName:/source:ro` and `cp -a /source/. /dest/` via `runCommand` (spawn, no shell). Fix: copy the volume the compose file actually refers to (resolve `<project>_<name>` / `external`/`name:` key via `docker volume inspect` or compose config) and refuse if absent instead of letting `docker run -v` auto-create an empty one (check `docker volume inspect` first). `copyDirectory` (lines 77-100) is the `cp -a --` pattern with `lstatIfExists`; extend with `~` expansion done in domain (never in the adapter). Add `sizeOf(path)` (e.g. `du -sk`) for D-08. Error style: `AppError` naming purpose, exit code, stderr (lines 22-24).

### `server/src/domain/bind-mount-sources.ts` (domain) - MIG-07
Already has `~` refusal type (line 30) and `startsWith("~")` predicate (line 43); `locateBindSource` (line 111). Change `~` from refusal to resolved against the host home consistently in analysis, rewrite (`infrastructure/compose-rewriter.ts`) and copy. Keep pure functions; add cases to `server/test/unit/domain/` tests.

### `server/src/domain/disk-space.ts` (NEW, domain) - D-08
**Analog:** `server/src/jobs/disk-checker.ts` lines 63-66 for the statfs call (`const {statfs} = await import("node:fs/promises")`) and `domain/disk-usage.ts` for pure math. Keep the statfs in an infrastructure adapter behind a port; domain function: `assessDiskSpace({requiredByFs, availableByFs, margin: 1.1}) -> {ok, shortfalls[{filesystem, needed, available}]}`. Group paths by filesystem via `fs.stat().dev`.

### `server/src/infrastructure/migration-journal.ts` (NEW) + `application/migration-recovery-service.ts` (NEW) - MIG-08
No exact analog (no persisted journal). Use:
- Journal file I/O: `infrastructure/stack-filesystem.ts` (exclusive mkdir, atomic writes) / `certificate-filesystem.ts` style, JSON with Zod parse from `@docktor/shared`; write atomically (tmp + rename). Alternative: Prisma table via a new repository (`server/repositories/`); then follow the `server/CLAUDE.md` Prisma migration rule. Discretion per CONTEXT.
- Recovery service shape: **Analog** `application/container-state-catch-up.ts` (boot-time reconcile), constructed with ports; call from `server/src/index.ts` after schema-sync and before `app.listen` (insert after line ~84, before `const {buildApp}`... or after `buildApp`), logging with `console.info/error("[migration-recovery] ...")` like `[schema-sync]`.
- Recovery performs: move aside dir back if needed, remove only Docktor-created target dir/record, `start` old stack (never `down -v`, never `up`), verify running, record operation as rolled back.

### `server/src/domain/migration-operation.ts` + `shared/src/validation/migration-operation.ts` - MIG-11
Pure reducer functions (`startMigrationOperation`, `recordMigrationStep`, `finishMigrationOperation`, `pruneFinishedOperations`). Statuses currently `["running","succeeded","failed"]` (shared line 11); add `rolled_back` (and optionally `rollback_unverified`). Steps enum (shared lines 13-26) must be reordered for D-01 (`stopping_old_stack`, `verifying_stop`, `backing_up`, ...). `client/src/lib/migration-progress.ts` `STEP_LABELS: Record<MigrationOperationStep,string>` is exhaustive and fails typecheck until updated; `use-migration-operations.ts` `stepIndex` relies on enum ORDER (`MIGRATION_OPERATION_STEPS.indexOf`), so keep enum order = execution order. Rewriting `finishMigrationOperation` status derivation (`result.success ? ...`) needs a rolled-back branch. Add shared event schemas (reused by Phases 24-25) in the same shared file, re-export from `shared/src/validation/index.ts` and `shared/src/index.ts`. The in-memory registry comment (`migration-operation-service.ts` doc) says "persisting would keep stale running rows"; this phase supersedes via journal recovery, update that comment.

### `shared/src/validation/mask-secrets.ts` (NEW) - MIG-10
**Analog:** `client/src/lib/env-mask.ts` (SECRET_MASK, ENV_KEY_VALUE_PATTERN, `maskEnvLine`, `maskEnvText`) and `isSecretKey` in `client/src/lib/env-file.ts`.
```typescript
export const SECRET_MASK = "••••••••";
const ENV_KEY_VALUE_PATTERN = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
export function maskEnvLine(text: string, reveal: boolean): string { ... }
```
Move into `@docktor/shared` as `maskSecrets(content, kind)`; extend to compose YAML env map form (`KEY: value`), list form (`- KEY=value`), and URL credentials (`scheme://user:pass@host`). Client `env-mask.ts` then delegates/re-exports (single source, per CLAUDE.md no duplication). Mask server-side in `compose-review-service.ts` diff output as well (so the response never carries secrets unless reveal is requested); client toggle: one "Show secrets" boolean, default masked on each open, in `migration-review-step.tsx`.

### `shared/src/validation/brownfield.ts` (schema) - MIG-12 path hardening
Extend `migrationExecuteSchema` (line 52, `migrationPreviewSchema.extend({backup, stopOldStack, inPlaceAsideName})`) with `acknowledgeAnonymousVolumes: z.boolean()`; add path refinements (reject `..`, NUL, relative, escape outside permitted dirs) -> Zod validation error (400) via Fastify `schema: {body: ...}` as in `routes/imports.ts` lines 53-102. Preview response gets anonymous volumes and per-filesystem disk assessment.

### `server/src/routes/imports.ts` (route)
Pattern (lines 53-102): `app.post(path, {schema: {body: migrationExecuteSchema}}, handler)` delegating to service; 202 for migrate; `GET /migrations`, `GET /migrations/:operationId`. Keep thin (no business logic, no status codes outside errors/app). Add a route-level test in `server/test/unit/routes/brownfield-routes.test.ts`.

### `.github/workflows/ci.yml` (config) - MIG-13
**Analog:** `build-and-test` (lines 21-85): ubuntu-latest, Node 22, `corepack enable`, `yarn install --immutable`, env block. New job `migration-ownership` (ubuntu, root via `sudo`) runs a dedicated vitest file (e.g. `server/test/integration/volume-ownership.test.ts` or a `describe.skipIf(process.getuid?.() !== 0)`) that chowns a fixture to uid 1234, runs `VolumeMigrator.copyDirectory`, asserts uid/gid/mode preserved. Real-Docker tests use random collision-proof project names (`docktor-test-${randomUUID().slice(0,8)}`). Not run locally (MEMORY: no heavy local actions).

### Client toast and hook - MIG-11
**Analog:** `client/src/lib/migration-progress.ts` `showMigrationToast`: one toast per `operation.id`; `status==="running"` -> `toast.loading(..., {id})`; terminal branches replace it. Add `rolled_back`/failed-unverified branches; on mount/reconnect `use-migration-operations.ts` must list operations (`ListOperations`) and reconcile any still-`running` toast whose op is now terminal (`isStale` rules, lines ~28-37). Hooks must close `EventSource` on cleanup (root CLAUDE.md); consumed via `useContainerEvents`.

## Shared Patterns

### Ports and adapters with injectable runner
**Source:** `server/src/infrastructure/external-stack-control.ts` (lines 12-18, 29) and `application/ports/*`. **Apply to:** every new adapter (journal, disk probe, env helper). Constructor default = singleton; tests inject fakes (`vi.fn<ComposeCommandRunner>()`).

### Errors
**Source:** `server/src/lib/errors.ts`. Wrap external failures in `AppError` with `cause` (new ctor option); refusals are `BadRequestError`/`ConflictError`; `hasErrorCode(err,"ENOENT")` (line ~56) for errno. No HTTP codes outside errors.ts/app.ts.

### Progress reporting that cannot break the migration
**Source:** `migration-service.ts` `report()` lines 634-648. **Apply to:** all new steps.

### Rollback never destructive
**Source:** `migration-service.ts` catch block (flags `createdStackDir`, `recordCreated`, `movedAside`). **Apply to:** rollback and boot recovery; no `down -v`.

### Imports (server ESM)
Relative with `.js`, order external -> workspace (`@docktor/shared`) -> local, blank lines between (see `migration-operation-service.ts` lines 1-21).

### Test structure
**Source:** `server/test/unit/infrastructure/external-stack-control.test.ts` (fake runner, assert argv/cwd/timeout, `cause`), `volume-migrator.test.ts` (`fs.mkdtemp(path.join(os.tmpdir(), "docktor-..."))` fixtures), `server/test/unit/application/migration-service.test.ts`, `server/test/unit/domain/migration-operation.test.ts`. Real-Docker tests only in CI.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Migration journal / ledger persistence | adapter | file-I/O | No persisted operation journal exists; operations are in-memory (`migration-operation-service.ts`). Use stack-filesystem atomic-write style or a Prisma repository (follow `server/CLAUDE.md` migration rule). |
| Compose env allowlist helper | utility | transform | Runners pass no `env` today; design per ROADMAP SC#5 (no `COMPOSE_*`, no Docktor secrets). |

## Metadata

**Analog search scope:** server/src (application, domain, infrastructure, jobs, lib, routes), shared/src/validation, client/src (lib, hooks, routes/setup), server/test/unit, .github/workflows
**Pattern extraction date:** 2026-10-22
**Planner reminders:** amend REQUIREMENTS.md MIG-09 and ROADMAP Phase 22 SC#4 wording (D-02); work on branch `feature/phase-22-migration-hardening`.
