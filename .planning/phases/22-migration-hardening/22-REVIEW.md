---
phase: 22-migration-hardening
reviewed: 2026-10-23T00:00:00Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - .github/workflows/ci.yml
  - client/src/components/app-layout.tsx
  - client/src/components/domain/stack/brownfield-import.tsx
  - client/src/components/domain/stack/diff-confirm-dialog.tsx
  - client/src/components/domain/stack/migration-toast-tracker.tsx
  - client/src/hooks/use-container-events.ts
  - client/src/hooks/use-migration-operations.ts
  - client/src/lib/brownfield-types.ts
  - client/src/lib/env-file.ts
  - client/src/lib/migration-operations-store.ts
  - client/src/lib/migration-progress.ts
  - client/src/lib/secret-mask.ts
  - client/src/routes/setup.tsx
  - client/src/routes/setup/components/migration-backup-step.tsx
  - client/src/routes/setup/components/migration-disk-space.tsx
  - client/src/routes/setup/components/migration-review-step.tsx
  - client/src/routes/setup/components/migration-wizard.tsx
  - server/src/application/journaled-migration-ledger.ts
  - server/src/application/migration-operation-service.ts
  - server/src/application/migration-progress.ts
  - server/src/application/migration-recovery-service.ts
  - server/src/application/migration-rollback-runner.ts
  - server/src/application/migration-service.ts
  - server/src/application/ports/compose-analyzer-port.ts
  - server/src/application/ports/compose-project-resolver-port.ts
  - server/src/application/ports/compose-rewriter-port.ts
  - server/src/application/ports/disk-space-probe-port.ts
  - server/src/application/ports/docker-executor-port.ts
  - server/src/application/ports/external-stack-control-port.ts
  - server/src/application/ports/migration-journal-port.ts
  - server/src/application/ports/volume-migrator-port.ts
  - server/src/application/subscribers/state-broadcast-subscriber.ts
  - server/src/domain/bind-mount-sources.ts
  - server/src/domain/compose-project.ts
  - server/src/domain/compose-volumes.ts
  - server/src/domain/disk-space.ts
  - server/src/domain/migration-operation.ts
  - server/src/domain/migration-rollback.ts
  - server/src/domain/migration-target.ts
  - server/src/index.ts
  - server/src/infrastructure/brownfield-scanner.ts
  - server/src/infrastructure/compose-analyzer.ts
  - server/src/infrastructure/compose-project-resolver.ts
  - server/src/infrastructure/compose-rewriter.ts
  - server/src/infrastructure/disk-space-probe.ts
  - server/src/infrastructure/disk-usage-scanner.ts
  - server/src/infrastructure/docker-executor.ts
  - server/src/infrastructure/external-stack-control.ts
  - server/src/infrastructure/git-executor.ts
  - server/src/infrastructure/migration-journal.ts
  - server/src/infrastructure/registry-client.ts
  - server/src/infrastructure/stack-filesystem.ts
  - server/src/infrastructure/volume-migrator.ts
  - server/src/lib/compose-env.ts
  - server/src/lib/errors.ts
  - server/src/lib/state-broadcaster.ts
  - shared/src/index.ts
  - shared/src/secrets/mask-secrets.ts
  - shared/src/validation/brownfield.ts
  - shared/src/validation/index.ts
  - shared/src/validation/migration-operation.ts
  - shared/src/validation/state-events.ts
findings:
  critical: 3
  warning: 9
  info: 6
  total: 18
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-10-23
**Depth:** standard
**Files Reviewed:** 66 (all listed; no structural findings block was supplied)
**Status:** issues_found

## Summary

The core safety properties mostly hold on the straight-line path. Rollback only ever calls `downKeepVolumes` (no `-v`). Copies use `cp -a` with `--` and argv arrays, and no shell is involved. `docker compose` is always addressed with `-p`/`-f` as separate argv elements. Request paths are validated twice (Zod, then `copyDestinationViolations` and `assertWithin`). The verified stop is fail-closed on a rejected stop or a container still running.

The weak point is the new journal and recovery path. Rollback is not idempotent. Journals are not guaranteed to be removed. The recovery replay can therefore delete the directory it just restored, or a live stack. Separately, the secret masker has real leak paths (it misses the very common `redis://:pw@host` form), and several "verified" claims are weaker than the code and docs say.

## Critical Issues

### CR-01: Replaying a journal after a crash during rollback deletes the restored original directory (in-place migration)

**File:** `server/src/application/migration-rollback-runner.ts:76-78, 92-95`, `server/src/application/migration-operation-service.ts:219-233, 317-332`, `server/src/infrastructure/stack-filesystem.ts:62-64`

**Issue:** The journal is only discarded after the whole rollback finishes (`execute` -> `discardJournalOf`, or `recoverOne` -> `discardJournalOf`). Individual compensations are never marked as done in the journal.

In-place, `targetDir === originalDir`, which is `<stacks>/<stackId>`. A rollback runs in this order:

1. The `created_directory` entry calls `removeDirectory(stackId)`, which runs `fs.rm(<stacks>/<stackId>, {recursive, force})`.
2. The `moved_aside` entry renames the original back to the same path.
3. The `stopped_old_stack` entry restarts the old stack and polls for up to `RESTART_VERIFY_TIMEOUT_MS` (90 s).

If Docktor is stopped or killed after step 2 and before the journal is removed, boot recovery replays the full ledger. This is very plausible: the shutdown hard deadline is 9 s, `installShutdownHandlers` does not wait for migrations, and step 3 alone can take 90 s.

On replay, step 1 runs again. `removeDirectory(stackId)` now recursively deletes the user's restored original directory. Step 2 then calls `pathTaken(originalDir)`, which is now false, and `moveDirectory(asideDir, originalDir)`. This fails with ENOENT because the aside directory was already renamed back. The report ends up `left-aside` with `keptOriginalAt` pointing at a path that no longer exists. The original stack's data is gone, which is exactly what the "nothing in the original directory is ever deleted" claim (migration-service.ts:875-878) rules out.

**Fix:** Make compensation idempotent and tamper-evident. For example:
- Write a marker file, such as `.docktor-migration-<operationId>`, into the directory created in `runSteps`. Have `removeDirectory` for a `created_directory` entry delete only if the marker is present and matches the operation id.
- Or persist an `undone` flag per ledger entry after each successful compensation. Skip entries already undone on replay, and rewrite the journal (via `write`) after each compensation.

```ts
// runner: only remove a directory this operation provably created
case "created_directory":
  return this.attempt(state, "remove the new stack directory",
    () => this.deps.stackFs.removeDirectoryIfOwned(entry.stackId, entry.operationId));
```

### CR-02: A journal that fails to be removed is replayed on the next boot against whatever lives at that slug, including a successful, in-use stack

**File:** `server/src/application/migration-operation-service.ts:331, 355-362, 219-233`

**Issue:** `discardJournalOf` swallows every removal error (logged only), and the `run()` comment relies on the journal always disappearing. The journal is removed after a successful migration as well. If `fs.rm` fails (EACCES, EIO, read-only remount, stale NFS), a journal with the full ledger of a completed migration stays on disk.

On the next restart, possibly weeks later, `recoverInterrupted` treats it as interrupted:
- `docker compose down` runs in `<stacks>/<stackId>`.
- `stackRepo.delete(stackId)` runs.
- `removeDirectory(stackId)` runs.

That deletes the live, now-in-use migrated stack and its record.

The same applies to a failed run whose rollback completed but whose journal removal failed. If the user later retries the migration under the same slug and succeeds, the stale journal from the earlier failed operation (a different operation id, so a separate file) rolls back and deletes the new, working stack at the next boot. Recovery has no check that the ledger still describes the current state.

**Fix:**
- Treat a failed journal removal after the outcome is known as a hard problem. Retry with backoff, then fall back to rewriting the journal with a terminal `completed` marker (for example `ledger: []` plus `finishedAt`) that `list()` ignores.
- On recovery, refuse to run destructive compensations for `created_directory` and `created_record` when a stack record with that id exists and was not created by this operation. Operation-scoped marker files (see CR-01) give the same protection.

### CR-03: The shared secret masker leaks secrets in common forms; the error text it guards is stored, listed and broadcast

**File:** `shared/src/secrets/mask-secrets.ts:18, 21, 28, 94-96`; applied in `server/src/application/migration-operation-service.ts:50-73`

**Issue:** The masker is line-anchored and key-name based. Confirmed gaps:
1. `URL_CREDENTIAL_PATTERN` requires at least one user character (`[^\s:/@]+`). `redis://:secret@host:6379` is the standard Redis form and is not matched, so the password is shown unmasked. A password containing `/`, or an `@` after the first one, is masked only up to the first stop character, leaking the tail.
2. `ENV_ASSIGNMENT_PATTERN` and `MAP_ENTRY_PATTERN` are anchored with `^`. Docker and compose stderr that echoes an assignment mid-line (`... invalid interpolation: POSTGRES_PASSWORD=hunter2 ...`, or JSON/quoted fragments) is not masked at all. `maskError`/`maskRollback` rely on exactly this for `error` and `cleanupErrors`.
3. Block-scalar continuation lines (`PASSWORD: |` followed by indented secret lines) and flow-style maps (`environment: {DB_PASSWORD: x}`) are skipped (`NON_SCALAR_START`, key `environment` is not secret). The review diff shows these unmasked by default.

Because the masker is the single implementation behind the review diff, `.env` preview, `error`/`cleanupErrors` and the SSE broadcast, one pattern miss leaks everywhere. The file header calls it "not a security boundary", but the server applies it as one for text sent to every SSE subscriber.

**Fix:**
- Allow an empty user: `([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]*:)([^\s@]+)(@)`. Prefer matching the password up to the last `@` before the next whitespace or `/` host boundary.
- For error text, add a non-anchored pass (`/\b([A-Za-z_][A-Za-z0-9_.-]*)=(\S+)/g` when `isSecretKey(key)`).
- In compose YAML, mask continuation lines of a block scalar owned by a secret key, and recurse into flow maps.
- Add tests for `redis://:pw@h`, a mid-line assignment and a block scalar.

## Warnings

### WR-01: "Write-ahead" journaling is not write-ahead for three of the five destructive steps

**File:** `server/src/application/migration-service.ts:947-957, 1013-1022`, `server/src/application/journaled-migration-ledger.ts:5-11`

**Issue:** Only `stopped_old_stack` and `deploy_started` are recorded before the side effect. `moved_aside` is recorded after `moveDirectory`, `created_directory` after the mkdir, and `created_record` after `stackRepo.create`. The ledger and plan docs say entries are in the journal "before each destructive step".

A restart between `moveDirectory(originalDir, asideDir)` and `ledger.record(moved_aside)` leaves a journal with only `stopped_old_stack`. Recovery then runs `docker compose -f <original compose path> start`, and the file no longer exists. The report is `restart-failed` and the original stays under its aside name, unmentioned. A restart after `stackRepo.create` but before `created_record` leaves an orphan stack record pointing at a directory recovery removes.

**Fix:** Record an intent entry (`moving_aside {originalDir, asideDir}`) before the rename and make `moveOriginalBack` tolerant: if the original path is free and the aside exists, move back. If neither exists, report accurately. Do the same for `created_record`, with a delete that tolerates a missing record.

### WR-02: Containers in `restarting` or `paused` state count as stopped, so the stop is "verified" while data is still live

**File:** `server/src/infrastructure/compose-project-resolver.ts:53-67`, `server/src/domain/compose-project.ts:42-52`, `server/src/application/migration-service.ts:1050-1055, 1098-1105`

**Issue:** `running` is `State === "running"`. A crash-looping container (`restarting`) is considered not running. If every container of the project is in that state, `running.length === 0` returns early without stopping anything. `verifyStopped` likewise passes while a container restarts and writes to the volumes, so data is copied from a live stack, the case D-04 forbids.

**Fix:** Define "active" as `running`, `restarting`, `paused` (or anything other than `exited`/`created`/`dead`). Use it in `stillRunning` and the initial running check. `runningServices` for the rollback restart may keep its narrower definition if that is intended.

### WR-03: Journal schema and `slugify` disagree, so some journals are silently set aside and never rolled back

**File:** `shared/src/validation/migration-operation.ts:65-68`, `server/src/lib/slugify.ts` (`.slice(0, 63)` after trailing-hyphen trim), `server/src/infrastructure/migration-journal.ts:108-118`

**Issue:** `slugify` trims trailing hyphens and then slices to 63 characters. A name whose 63rd character is a hyphen yields a stack id ending in `-`. The ledger regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` rejects it. The first write (`ledger.start`, empty ledger) passes. The later write that adds `created_directory` is not validated on write, so the migration runs normally. At boot `readDocument` fails the whole document, renames it to `.invalid`, and logs a line. The stack stays stopped and the original may sit under its aside name, with no rollback and no operation shown.

**Fix:** Re-trim hyphens after the slice in `slugify`. Validate with `migrationJournalSchema.parse` inside `MigrationJournal.write` so an unreadable journal fails the run at write time. On boot, surface `.invalid` journals as a visible failed operation, not just a console line.

### WR-04: A converted stack-root bind mount copies the old compose file into the new stack and escapes the collision checks

**File:** `server/src/domain/migration-target.ts:137-160, 197-218`, `server/src/application/migration-service.ts:1185-1201`, `client/src/lib/migration-volume-paths.ts` (relative `.` sends `convert: true`, `newPath: "."`)

**Issue:** For `./:/app` the client sends `convert: true` with `newPath: "."`. `bindDestinationViolation` returns `{destination: null}`, so the destination is excluded from `collisions()` and `RESERVED_ROOT_NAMES` is never applied to the copied content. `copyBindMounts` copies the entire old directory into `newStackPath`, including the old compose file.

The rewritten file is always written as `docker-compose.yml`. If the old file is `compose.yaml`, `compose.yml` or `docker-compose.yaml`, it now sits next to the rewritten one. Compose prefers `compose.yaml`, then `compose.yml`, then `docker-compose.yaml`, then `docker-compose.yml`, so the new stack deploys the unrewritten old file. This is the hazard `RESERVED_ROOT_NAMES` documents for other destinations. The root copy also merges unchecked into `volumes/`, `pre-migration-backup/` and the other destinations.

**Fix:** After the root copy (or by excluding it), remove or skip the old compose and `.env` file names, or write the rewritten file under the name the copy produced. Add the stack-root destination to the collision check, treating it as containing every other destination.

### WR-05: Rollback can report `not-stopped` for an old stack Docktor did stop

**File:** `server/src/application/migration-service.ts:1056-1063`, `server/src/domain/compose-project.ts:42-47`, `server/src/application/migration-rollback-runner.ts:146-149`

**Issue:** `runningServices` drops containers whose `com.docker.compose.service` label is missing (`service === null`). If the running containers have no service label, `runningBefore` is empty even though `stop` ran. `restoreOldStack` then sets `oldStack = "not-stopped"`, which feeds `migrationOperationStatusOf` and turns the operation into `rolled_back`, claiming the original is untouched.

**Fix:** Count the running containers, not just their service labels. If `running.length > 0` and `runningServices(...).length === 0`, record the entry with a flag and report `left-stopped` (or refuse the stop up front when a running container cannot be mapped to a service).

### WR-06: Rollback restart arguments come from container labels and journal data without validation

**File:** `server/src/infrastructure/external-stack-control.ts:44-57`, `server/src/application/migration-rollback-runner.ts:169-177`

**Issue:** `runningBefore` is built from Docker container labels, persisted in the journal (schema: bare `z.string()`), and appended to `docker compose start|up -d --no-build ...services` with no `--` separator and no name check. A service name beginning with `-` (a label that any container creator can set) is parsed as a compose flag. For `restoreServices` that can be `--force-recreate`, `-V/--renew-anon-volumes` or `--remove-orphans`, defeating the "no flag removes orphans, volumes or images" guarantee in the code comment.

Separately, `restoreServices` recreates containers under the env allowlist (`dockerCliEnvironment`). Variables the user had exported in the shell when starting the old stack are missing, so `${VAR}` interpolations that are not in `.env` resolve blank in the recreated containers. In the shared-project case, `downKeepVolumes` followed by `up` also orphans the old containers' anonymous volumes (their data is not carried over to the recreated containers).

**Fix:**
- Validate service names against the compose service pattern (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`) at record time and in the journal schema.
- Pass `--` before the service list.
- Document the env and anonymous-volume limits, or refuse the shared-project path when anonymous volumes exist.

### WR-07: Deploy and copy steps have timeouts that are wrong for their workload

**File:** `server/src/infrastructure/docker-executor.ts:39-53`, `server/src/infrastructure/volume-migrator.ts:14-35, 122-132`

**Issue:** `composeExec` uses a flat `timeout: 120_000` for `up -d`, which includes image pulls. A normal first deploy of a multi-image stack exceeds two minutes, so `execFile` kills the compose client, the migration fails and rolls back after the old stack was stopped, even though nothing was wrong. In the other direction, `runCommand` (`cp -a`) and the `docker run ... cp -a` volume copy have no timeout, so a hung copy holds the in-flight keys and leaves the old stack stopped indefinitely.

**Fix:** Give `up` a much longer, configurable timeout (or pre-pull images before the stop). Add a generous upper bound or progress watchdog to the copy commands so a hang ends in the rollback path.

### WR-08: `void this.run(...)` has no rejection handler

**File:** `server/src/application/migration-operation-service.ts:134, 297-309`

**Issue:** `run` has `try/finally` and no `catch`. Any unexpected throw (for example from `this.save`/`events.emit`, or `finishMigrationOperation`) becomes an unhandled rejection. On Node 22 that terminates the process in the middle of a migration, with the old stack stopped. The operation also stays `running` in memory.

**Fix:**
```ts
void this.run(operation, plan, heldKeys).catch((error: unknown) => {
    this.logger.error(`[migration] Run ${operation.id} ended unexpectedly: ${errorMessage(error)}`);
});
```
Ideally also save a `failed` operation in that catch.

### WR-09: Recovery gives up and removes the journal even when the rollback was incomplete; shutdown does not wait for it

**File:** `server/src/application/migration-operation-service.ts:219-233`, `server/src/index.ts:111-132`

**Issue:** `recoverOne` discards the journal whenever `rollBackInterrupted` returns, including when the report has `cleanupErrors`, `restart-failed` or `left-aside`. A common case is a host reboot where the Docker daemon is not ready yet: `downKeepVolumes` and the restart fail, the journal is discarded, and the outcome lives only in memory (pruned after an hour, lost on the next restart). There is no retry.

`migrationRecovery.run()` is also fire-and-forget, so `installShutdownHandlers` does not wait for it. A SIGTERM during recovery is the trigger described in CR-01.

**Fix:** Keep the journal (marked with the attempt count) when the report is not verified `rolled_back`, and retry on the next boot or after a delay. Have graceful shutdown await (or at least coordinate with) in-flight migrations and recovery.

## Info

### IN-01: `assertWithin` and destination checks are lexical, not realpath-based

**File:** `server/src/application/migration-service.ts:93-100, 1185-1201`, `server/src/domain/migration-target.ts:141-166`

Destinations are checked with `path.resolve`, but earlier copies (notably the stack-root copy, see WR-04) can place symlinks (copied verbatim by `cp -a`) inside the new stack. A later destination that runs through one is written outside the stack. This needs control of the old stack's contents. Resolve with `fs.realpath` of the parent and confine again before each copy.

### IN-02: Extracted secrets are written to `.env` with default (world-readable) mode

**File:** `server/src/application/migration-service.ts:1156-1170`

`fs.writeFile(target, merged, "utf-8")` uses mode 0666 minus umask. Secrets moved out of the compose file land in a 0644 file, while the old `.env` may have been 0600 (`copyFile` preserves it, the merge branch does not). Pass `{mode: 0o600}` (or copy the source mode).

### IN-03: Unchecked cast without justification in `DiffConfirmDialog`

**File:** `client/src/components/domain/stack/diff-confirm-dialog.tsx:126`

`finding.line as number` violates the repo rule (a cast needs a comment). It is guarded by `isAnchored`, but the type system does not know. Narrow the type (`filter` with a type predicate) or add the explanatory comment.

### IN-04: A succeeded operation without `stackId` is shown as a failure

**File:** `client/src/lib/migration-progress.ts:104-118`

When `status === "succeeded"` but `result.stackId` is missing, the code falls through to `migrationOutcomeMessage` and shows "Migration of X failed". The server always sets `stackId` on success, but the client should show a neutral success or fail loudly on a contract violation.

### IN-05: CI additions

**File:** `.github/workflows/ci.yml:126-157`

The new job pins actions by SHA while all other jobs use floating `@v4`, which is inconsistent. It also runs `yarn` as root through `sudo -E`, which leaves root-owned files in the workspace and cache and runs PR code as root on the runner. The job sets no `permissions:` block. Consider `permissions: contents: read` and running only the specific test binary under `sudo`.

### IN-06: Minor robustness and quality notes

- `server/src/infrastructure/migration-journal.ts:47-48`: the temp file is fsynced but the directory is not, so the rename is not durable across a power loss. The claim in the file header goes beyond a process restart.
- `server/src/application/migration-service.ts:915`, `migration-rollback-runner.ts:114`: the unmasked error message (which can carry compose stderr) is logged to the console. Mask it, or mark the logger as sensitive.
- `server/src/infrastructure/volume-migrator.ts:126-129`, `disk-space-probe.ts:62`: `docker run alpine` uses a floating, unpinned image that is pulled implicitly after the old stack is stopped. Pre-pull during preflight or pin a digest.
- `server/src/application/migration-service.ts:171`: this function is indented with spaces in a tab-indented file, and `migration-rollback-runner.ts` mixes four-space indentation into the same area. Normalise it.

---

_Reviewed: 2026-10-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
