---
phase: 18-import-and-migration-flow
reviewed: 2026-10-16T00:00:00Z
depth: standard
files_reviewed: 70
files_reviewed_list:
  - client/src/components/domain/stack/brownfield-import.tsx
  - client/src/components/domain/stack/discovered-stack-actions.tsx
  - client/src/components/domain/stack/scan-skipped-directories.tsx
  - client/src/hooks/use-container-events.ts
  - client/src/hooks/use-migration-operations.ts
  - client/src/hooks/use-stack.ts
  - client/src/lib/brownfield-types.ts
  - client/src/lib/import-api.ts
  - client/src/lib/migration-progress.ts
  - client/src/lib/migration-volume-paths.ts
  - client/src/lib/setup-api.ts
  - client/src/routes/app/stacks/import.tsx
  - client/src/routes/setup/components/brownfield-step.tsx
  - client/src/routes/setup/components/migration-backup-step.tsx
  - client/src/routes/setup/components/migration-old-stack-step.tsx
  - client/src/routes/setup/components/migration-select-step.tsx
  - client/src/routes/setup/components/migration-wizard.tsx
  - client/test/integration/fixtures.ts
  - client/test/integration/setup-wizard.spec.ts
  - client/test/integration/stacks-import.spec.ts
  - client/test/unit/components/domain/stack/brownfield-import.test.tsx
  - client/test/unit/hooks/use-container-events.test.ts
  - client/test/unit/hooks/use-migration-operations.test.ts
  - client/test/unit/lib/migration-volume-paths.test.ts
  - client/test/unit/routes/setup/migration-wizard.test.tsx
  - server/src/application/managed-stack-guard.ts
  - server/src/application/migration-operation-service.ts
  - server/src/application/migration-service.ts
  - server/src/application/onboarding-service.ts
  - server/src/application/own-stack-guard.ts
  - server/src/application/ports/brownfield-scanner-port.ts
  - server/src/application/ports/stack-filesystem-port.ts
  - server/src/application/ports/volume-migrator-port.ts
  - server/src/application/subscribers/state-broadcast-subscriber.ts
  - server/src/domain/events.ts
  - server/src/domain/managed-stack-paths.ts
  - server/src/domain/migration-operation.ts
  - server/src/domain/migration-target.ts
  - server/src/domain/self-stack-paths.ts
  - server/src/infrastructure/brownfield-scanner.ts
  - server/src/infrastructure/compose-analyzer.ts
  - server/src/infrastructure/compose-rewriter.ts
  - server/src/infrastructure/disk-usage-scanner.ts
  - server/src/infrastructure/stack-filesystem.ts
  - server/src/infrastructure/volume-migrator.ts
  - server/src/lib/errors.ts
  - server/src/lib/state-broadcaster.ts
  - server/src/repositories/stack-repository.ts
  - server/src/routes/imports.ts
  - server/src/routes/setup.ts
  - server/test/integration/imports.test.ts
  - server/test/unit/application/migration-operation-service.test.ts
  - server/test/unit/application/migration-service.test.ts
  - server/test/unit/application/onboarding-service.test.ts
  - server/test/unit/application/state-broadcast-subscriber.test.ts
  - server/test/unit/domain/managed-stack-paths.test.ts
  - server/test/unit/domain/migration-operation.test.ts
  - server/test/unit/domain/migration-target.test.ts
  - server/test/unit/domain/self-stack-paths.test.ts
  - server/test/unit/infrastructure/brownfield-scanner.test.ts
  - server/test/unit/infrastructure/compose-rewriter.test.ts
  - server/test/unit/infrastructure/stack-filesystem.test.ts
  - server/test/unit/infrastructure/volume-migrator.test.ts
  - server/test/unit/lib/errors.test.ts
  - server/test/unit/routes/brownfield-routes.test.ts
  - shared/src/validation/brownfield.ts
  - shared/src/validation/index.ts
  - shared/src/validation/migration-operation.ts
  - shared/test/unit/validation/brownfield.test.ts
  - shared/test/unit/validation/migration-operation.test.ts
findings:
  critical: 3
  warning: 11
  info: 5
  total: 19
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-10-16
**Depth:** standard
**Files Reviewed:** 70 (test files were read for reliability only, with no defects found there)
**Status:** issues_found

## Summary

This re-review covers the gap-closure plans 18-06..18-17. No structural (fallow) findings were provided.

The closure work is real and mostly sound:
- The exclusive `mkdir` and the `recordCreated` flag scope the rollback to what this run created.
- Rollback never deletes anything in the original directory.
- A process-local in-flight guard and a background `MigrationOperationService` were added.
- The client disables rows whose migration is running.
- Own-stack and managed-stack guards are shared by scan, adopt and migrate.

The remaining defects sit mostly in the data-copy semantics. They are the part of a migration that decides whether the user's data actually arrives, and they run after the old stack has already been stopped:
- **Ownership and symlinks are not preserved.** The bind-mount copy uses `fs.cp`, which keeps neither ownership nor relative symlinks.
- **Container and host paths are mixed up.** In the documented `/host` deployment, absolute bind-mount sources are host paths that the container cannot see. A missing source is still treated as "empty".
- **Env extraction collapses values.** Equal env keys across services merge into one `.env` entry.

Several of the prior review's warnings are still open.

### Status of the prior review's findings

| Prior ID | Status | Notes |
|---|---|---|
| CR-01 (copy errors swallowed) | **Resolved** for I/O errors | Only ENOENT counts as an empty source (`sourceExists`). The remaining hole is CR-03 below. |
| CR-02 (rollback not scoped) | **Resolved** | `createDirectoryExclusive`, the `recordCreated` flag, a per-slug and per-compose in-flight guard, and disabled client rows. The guard is process-local; the exclusive mkdir and the unique id are the cross-process backstop. |
| WR-01 (relative mounts not copied) | **Resolved** | The scanner exposes `relativePaths`, and the wizard copies them by default. |
| WR-02 (copy source unconfined) | **Open** | See WR-01 below. |
| WR-03 (unauthenticated setup migrate) | **Partially resolved** | Only a `hasAnyUser()` gate was added. See WR-02. |
| WR-04 (colliding `newPath`, duplicate keys) | **Resolved on the client** | `volumesPathFor` dedupes and keys use the index. The server has no duplicate backstop (folded into WR-01). |
| WR-05 (failed deploy leaves containers) | **Open** | See WR-03. It is worse for in-place migrations. |
| WR-06 (secrets in compose diff) | **Open** | See WR-06. |
| WR-07 (stop on inferred project) | **Open** | See WR-05. |
| WR-08 (named volume unprefixed) | **Open** | See WR-04. |
| WR-09 (no service-level own-stack guard) | **Resolved** | `assertNotOwnStack` runs in `assessTarget` and `adoptInPlace`. |
| IN-01 (`composePath` symlinks and `..`) | **Open** | Now IN-01. |
| IN-02 (display name nits) | **Partially resolved** | Preview now refuses an empty slug at step 1. The ".env file" heading nit is unchanged and not re-reported. |
| IN-03 (restart-all, backup after stop) | **Open** | Now IN-05. |
| IN-04 (`any`, `console.error`, `.cause`) | **Partially resolved** | The rewriter no longer uses `as any`. The rest remains as IN-02. |

## Critical Issues

### CR-01: Bind-mount copy loses file ownership and rewrites relative symlinks (`fs.cp`)

**File:** `server/src/infrastructure/volume-migrator.ts:49-51` (used at `server/src/application/migration-service.ts:337, 496`)
**Issue:** `copyDirectory` is `fs.cp(src, dest, {recursive: true})`. Node's `fs.cp` has three limitations here:
- It never chowns, so every copied file is owned by the Docktor process user, typically root in the container.
- It does not preserve timestamps by default.
- With `verbatimSymlinks` unset, a relative symlink target is rewritten to an absolute path into the source tree. The copied link then points back at the old directory.

For the headline use case, a database bind mount such as `./pgdata`, the new stack's data directory is owned by root. Postgres and MySQL refuse to start with a "wrong ownership" or "permission denied" error. The named-volume path already uses `cp -a` (`copyVolumeToBindMount`), so the two copy paths now behave differently. By this point the old stack is stopped and the in-place original has been renamed. The user is left with a "successful" migration whose deployed stack crash-loops. The same applies to the `pre-migration-backup/` copy (line 337), which is not a faithful backup.
**Fix:** Copy through the same `cp -a` mechanism as the named-volume path, or at minimum preserve ownership and symlinks explicitly:
```typescript
async copyDirectory(srcPath: string, destPath: string): Promise<void> {
    await fs.cp(srcPath, destPath, {recursive: true, verbatimSymlinks: true, preserveTimestamps: true});
    await copyOwnership(srcPath, destPath); // walk the tree: lstat -> lchown(uid, gid)
}
```
A simpler alternative is `spawn("cp", ["-a", "--", `${srcPath}/.`, destPath])` or the existing docker/alpine route. Add a unit test that asserts uid/gid and a relative symlink survive a copy.

### CR-02: Equal env keys across services are collapsed into one `.env` entry, silently changing values

**File:** `server/src/infrastructure/compose-rewriter.ts:195-211` (the `envVars` Map at line 164)
**Issue:** `extractServiceEnvironment` stores every literal in a single `Map<key, value>` and replaces each service's value with `${KEY}`. Two services that set the same key to different values both end up reading one `.env` value, and the last one wins. Examples: `PORT: "80"` and `PORT: "9000"`, or `DB_HOST: db1` and `DB_HOST: db2`. One service silently receives the other's configuration.

Neither the diff nor the `.env` preview shows this clearly: the diff shows `${PORT}` on both lines, and the preview shows a single `PORT=`. The same problem exists against a pre-existing `.env`. `migration-service.ts:382-384` appends the extracted block after the old `.env`, so a duplicate key can override the value a service was already using.
**Fix:** Detect the collision and disambiguate it. Namespace the variable on a conflict, for example `SERVICE_KEY` using the upper-cased service name. Do the same when the key already exists in the old `.env` with a different value. Never emit one key with two values.
```typescript
const name = this.envVars.has(key) && this.envVars.get(key) !== literal ? `${serviceName.toUpperCase()}_${key}` : key;
this.envVars.set(name, literal);
this.edits.replaceScalar(pair.value, `\${${name}}`);
```

### CR-03: Absolute bind mounts are read from the container's view of the filesystem; a missing source becomes an empty directory and the migration reports success

**File:** `server/src/application/migration-service.ts:488-499` (with `sourceExists`, lines 57-67)
**Issue:** Absolute bind-mount sources in a compose file are host paths. The documented deployment runs Docktor in a container with the host root mounted at `/host` (`docker-compose.yml` line 75; `scan-skipped-directories.tsx:41-42` tells users to scan `/host/...`). A stack found at `/host/opt/app/docker-compose.yml` with `- /opt/app/data:/var/lib/data` yields `srcPath = /opt/app/data`. That path does not exist inside the container.

`sourceExists` returns false (ENOENT), and the code treats "missing" as an empty volume (`fs.mkdir(destPath)`). The data is never copied. The old stack has already been stopped, the new stack starts with fresh state, and the user gets a success toast. The CR-01 fix made I/O errors fatal but kept ENOENT as the "benign" case, which is exactly the case this topology hits. Only `relocateIntoSource` translates paths, and only for the in-place case.
**Fix:**
- Translate absolute sources through the container's own mounts, reusing `containerVisiblePaths` (host path to a candidate under the `/host` mount), and then copy.
- Fail closed for a selected (`convert: true`) source that cannot be found. Reserve "create an empty directory" for a source the compose file declares but that is genuinely absent, and surface that choice in the preview.
```typescript
const srcPath = await this.resolveSource(sel.originalPath, dirs); // tries container-visible candidates
if (srcPath === null) {
    throw new BadRequestError(`Bind mount source not found inside Docktor: ${sel.originalPath}`);
}
await this.migrator.copyDirectory(srcPath, destPath);
```

## Warnings

### WR-01: Request-controlled paths are validated only inside `execute` (after the old stack is stopped), and the copy source is still unconfined

**File:** `server/src/application/migration-service.ts:344-356, 488-493`; `shared/src/validation/brownfield.ts:19-23`
**Issue:** There are three problems with the same root cause.
- **Late validation.** `VOLUME_NAME_PATTERN` and the `assertWithin(newStackPath, sel.newPath)` / `assertWithin(volumesDir, volName)` checks run in `execute`, after `oldStack.stop()` and, for in-place migrations, after the original directory was renamed. A bad `newPath` or volume name therefore causes a full stop, rename, rollback and restart cycle instead of a plain 400 from `preflight`. `volumeSelectionSchema` accepts any string, and `namedVolumeSelections` accepts any key.
- **Unconfined source (prior WR-02, unchanged).** `sel.originalPath` may be any absolute path or contain `..`. It is copied verbatim into the stack directory.
- **No server-side collision backstop.** The server accepts duplicate `newPath` values, and a `newPath` of `.` or `docker-compose.yml` resolves to the stack root and merges into or overwrites it.

**Fix:**
- Move all of these checks into `preflight`.
- Require each `originalPath` to be a bind source that appears in the re-parsed compose file.
- Reject duplicate `newPath` values among converted selections.
- Validate `newPath` as strictly below `volumes/` or the stack directory, excluding the stack root itself.
- Add the character and NUL rules to `volumeSelectionSchema`.

### WR-02: Setup migrate/preview routes are reachable without authentication for as long as the wizard is incomplete (prior WR-03, only partly mitigated)

**File:** `server/src/routes/setup.ts:26-30, 121-204`
**Issue:** `requireAdminAccount` only checks `hasAnyUser()`. That becomes true at step 1 and stays true. Between step 1 and `POST /api/setup/complete`, and permanently if the operator never finishes the wizard, any unauthenticated caller can reach the following:
- **Migrate:** `POST /api/setup/migrate` with `stopOldStack: true`, which runs `docker compose stop` on any scanned compose file. It also copies arbitrary readable directories through the unconfined `originalPath` (WR-01).
- **Read endpoints:** preview and the operations list.
- **Scan and adopt:** `/scan` and `/adopt` have no admin check at all, even before the admin exists. They enumerate host files under `/host`.

The comment calls the remaining risk "accepted" (T-18-23), but the exposure is the full migrate capability.
**Fix:** After the admin exists, require the step-1 session (`requireAuth`) on every brownfield setup route and the SSE stream. Before the admin exists, refuse migrate, scan and adopt. Alternatively, drop the setup-scoped migrate routes and let the wizard call the authenticated `/api/stacks/import/*` family once signed in.

### WR-03: A failed deploy leaves containers behind; for an in-place migration the rollback then restarts the wrong containers (prior WR-05)

**File:** `server/src/application/migration-service.ts:414, 420-453`
**Issue:** If `docker.up(stackId)` fails midway, compose has already created containers and networks under project `stackId`. The rollback removes the directory and record but never runs `down`. In an in-place migration this is more serious:
- The project name is the directory name, so it equals the old stack's project name.
- The failed `up` recreates the old stack's stopped containers with the new configuration, pointing at the new directory's bind mounts.
- The rollback then renames the original directory back and runs `docker compose start` (line 446). That starts the recreated containers, whose bind-mount sources are now missing or different.

The user is told "The old stack was restarted", which is not true of the original containers.
**Fix:**
- Track `deployAttempted` and, in the rollback, run a best-effort `down` that does not remove volumes, before removing the directory.
- Make the in-place restart a `docker compose up -d` against the restored original files rather than `start`.
- Do not claim "restarted" unless it was verified.

### WR-04: Named-volume migration uses the unprefixed compose key as the Docker volume name (prior WR-08)

**File:** `server/src/application/migration-service.ts:344-356`; `server/src/infrastructure/volume-migrator.ts:15-22`; `server/src/infrastructure/compose-rewriter.ts:251-276`; `client/src/routes/setup/components/migration-wizard.tsx:85-91`
**Issue:** Compose names a top-level volume `<project>_<key>` unless `name:` is set. `docker run -v <key>:/source:ro` silently creates a new empty volume named `<key>` when none exists. The copy then "succeeds" with no data and leaves a stray volume behind.

The rewriter has the same mismatch for unconverted volumes: it marks them `{external: true}` without a `name:`, so the new stack points at a literal volume that does not exist and `docker compose up` fails.

Top-level volumes that were already `external:` (listed by the analyzer's `extractNamedVolumes`) default to "convert" in the wizard. The user is therefore invited to copy a volume by the wrong name.
**Fix:**
- Resolve the real volume name (`name:` override, otherwise `<project>_<key>`) from the old project.
- Verify it with `docker volume inspect` before copying and fail if it is absent.
- Mount with `--mount type=volume,source=...,readonly`, which never auto-creates.
- In the rewriter, emit `{external: true, name: <resolved>}` for kept volumes.

### WR-05: Old-stack stop relies on an inferred project name and the UI claims it was stopped (prior WR-07)

**File:** `server/src/infrastructure/external-stack-control.ts:36-46`; `client/src/lib/migration-progress.ts:34`
**Issue:**
- `docker compose -f <file> stop` derives the project from the directory name or the top-level `name:`. A stack started with `-p` or `COMPOSE_PROJECT_NAME` resolves to a different project. `stop` exits 0 having stopped nothing, and the success toast still says "The old stack was stopped.".
- `COMPOSE_TIMEOUT_MS` is a flat 120 s, which can be shorter than a graceful stop of many containers. A timeout kills the CLI mid-stop, and the rollback then runs `start` on a half-stopped project.

**Fix:**
- Verify with `docker compose ps -q` that nothing is running after `stop`, or resolve the project from the container label `com.docker.compose.project.config_files`.
- Word the toast as "requested" if not verified.
- Scale the timeout with the number of services.

### WR-06: Migration compose diff shows secret values in plaintext (prior WR-06)

**File:** `client/src/routes/setup/components/migration-review-step.tsx:37-41, 49-66` (not touched by the gap-closure plans, so the finding stands)
**Issue:** Only the extracted `.env` preview is masked. `UnifiedDiffView hunks={diff.hunks}` renders raw lines, so every removed `- POSTGRES_PASSWORD: ...` line is visible without the reveal toggle. The mask is false assurance.
**Fix:** Run diff lines through the same key-aware masking, gated by the same reveal toggle. Show the toggle when either the diff or the env contains a secret.

### WR-07: Rollback failures are swallowed silently, leaving state the user is told does not exist

**File:** `server/src/application/migration-service.ts:426-438`
**Issue:** Two cleanup steps discard their errors:
- `removeDirectory` runs inside `catch {}` with no log.
- `stackRepo.delete(stackId).catch(() => {})` also drops the error.

If either fails, the reported error still says the migration was rolled back. A leftover target directory then blocks the retry with a 409 "already exists", and an orphan DB record would point at a removed or half-removed directory. Nothing is logged for the operator.
**Fix:** Log both failures with the project logger. Append a rollback-incomplete note to `errMessage`, for example "The new stack directory X could not be removed; delete it before retrying".

### WR-08: Migration operation lifecycle is bound to a mounted component; the loading toast can stick forever

**File:** `client/src/hooks/use-migration-operations.ts:47-104`; `client/src/components/domain/stack/brownfield-import.tsx:57-64`; `client/src/lib/migration-progress.ts:46-48`
**Issue:** The migration is now a background operation that the UI invites the user to leave. The only consumer of `useMigrationOperations` is `BrownfieldImport`, and it only follows operations while mounted:
- If the user navigates away (or clicks Next or Skip in the wizard, which unmounts the step), the SSE subscription closes.
- The `toast.loading(..., {id})` is never replaced, because no one is listening for the finish event. It stays on screen as a never-ending "Migrating X: Deploying…", and the real outcome is lost.
- In the wizard, `completeSetup()` closes `/api/setup/*`, so even a remount cannot resync.
- `resync` runs twice on mount: once from the effect and once from `onOpen`.

**Fix:** Either lift the operation follower to an app-level provider that outlives the page, or dismiss the loading toast on unmount (`toast.dismiss(operation.id)`) and show the outcome from the operations list on return. Also block "Next/Skip" in the setup wizard while an operation is running.

### WR-09: `.env` extraction emits invalid variable names and unescaped values

**File:** `server/src/infrastructure/compose-rewriter.ts:204-221, 226`; `server/src/application/migration-service.ts:382-385`
**Issue:** The extractor replaces each value with `${KEY}` and writes `KEY=value` raw.
- **Invalid names.** Keys that are valid container env names but invalid compose interpolation names (`spring.datasource.url`, `my-key`) yield `${spring.datasource.url}`, which compose rejects or misparses. The migration then fails at deploy time.
- **Mangled values.** Values are written unquoted and unescaped. A double-quoted YAML scalar containing `\n` becomes extra `.env` lines, which injects bogus variables. A value with a leading `#`, surrounding quotes, `$` or trailing whitespace changes meaning once dotenv parses it.

**Fix:** Only extract keys that match `^[A-Za-z_][A-Za-z0-9_]*$`; leave other entries inline. Serialize values with dotenv quoting and escaping, rejecting or escaping newlines.

### WR-10: Managed-stack and in-place detection ignore the `/host` alias of a managed directory

**File:** `server/src/domain/managed-stack-paths.ts:46-55`; `server/src/domain/migration-target.ts:20-30`; `server/src/application/onboarding-service.ts:280-292`
**Issue:** Managed detection is exact string equality between the compose file's directory and `hostPath`. A user who scans `/host/opt/docktor/stacks` (the documented way to see host paths) gets paths like `/host/opt/docktor/stacks/x/...`, while Docktor's own stacks are recorded as `/opt/docktor/stacks/x`. Consequences:
- **Managed stacks are not flagged.** Rows for already-managed stacks are offered as importable.
- **Adopt creates duplicates.** Adopt under a different display name creates a second record whose `hostPath` is `/host/...`. That path is a read-only mount and wrong for compose relative-path resolution on the host daemon.
- **In-place is never detected.** The in-place check (`classifyMigrationTarget`) only compares resolved paths, so an in-place migration reached through `/host` degrades to a 409 "already exists".

**Fix:** Canonicalize both sides before comparing, reusing the mount translation in `containerVisiblePaths`, and resolve symlinks via `fs.realpath`. Reject adopting a compose file whose hostPath would be under the read-only `/host` mount, or translate it to the container-visible stacks path.

### WR-11: `~` paths are offered for conversion but never rewritten, and the copy source is wrong

**File:** `server/src/infrastructure/compose-analyzer.ts:106-111`; `server/src/infrastructure/compose-rewriter.ts:134-141`; `server/src/application/migration-service.ts:488-490`
**Issue:**
- The analyzer classifies `~/data` as an absolute bind mount, so the wizard lists it as convertible.
- `VolumeRules.shortForm` treats any host part that does not start with `.` or `/` as a named-volume reference. `~/data` is looked up as a named volume, found unconverted, and left unchanged.
- The server copy path (`path.isAbsolute("~/data")` is false) joins it to `sourceDir`, finds nothing and creates an empty directory.

The result is a migrated stack whose compose still points at `~/data` and a stray empty `volumes/data`.
**Fix:** Either do not offer `~` sources for conversion (list them as "stays outside Docktor"), or handle `~` consistently in the rewriter (`bindTarget`) and the copy resolution.

## Info

### IN-01: `composePath` validation is by file name only (prior IN-01)

**File:** `shared/src/validation/brownfield.ts:11-16`; `server/src/application/migration-service.ts:186`
**Issue:** `compose.yml` symlinks to any readable file pass, and `..` segments are allowed. Preview reads the file and echoes its content as a diff or an error.
**Fix:** `fs.realpath` the path in the service and re-check the basename. Optionally reject `..` segments in the schema.

### IN-02: Residual convention violations in touched files (prior IN-04)

**File:** `server/src/infrastructure/compose-analyzer.ts:71-205`; `server/src/application/migration-service.ts:424, 559, 578`; `server/src/infrastructure/external-stack-control.ts:44-45`; `server/src/infrastructure/stack-filesystem.ts:26, 29`; `server/src/lib/errors.ts:1-11`
**Issue:**
- **`any` in the analyzer.** `doc: any` and `service as any` violate CLAUDE.md's "no `any`" rule. A null or empty YAML document makes `doc.services` fall back correctly, but a scalar document throws an untyped error inside the scanner's catch.
- **`console.error` in rollback.** Rollback paths use `console.error` instead of the project logger.
- **Hand-assigned `cause`.** The `cause` is attached by hand (`wrapped.cause = err`, `Object.assign(..., {cause})`) because `AppError` has no `ErrorOptions` parameter.

**Fix:** Narrow the parsed YAML with a type guard or Zod. Add `options?: ErrorOptions` to `AppError` and its subclasses, and pass `{cause}` through the constructor. Use the Fastify or app logger.

### IN-03: The renamed original (`<id>-pre-migration`) is offered by the scanner as an importable stack

**File:** `server/src/infrastructure/brownfield-scanner.ts:37-48`
**Issue:** The scanner excludes `**/pre-migration-backup/**` for the opted-in backup, but an in-place migration keeps the original as `<stacksDir>/<id>-pre-migration`. That sits next to the stacks and contains a compose file, so scanning the stacks directory lists it as a new, unmanaged, importable stack. The same pitfall that motivated the backup exclusion applies.
**Fix:** Skip directories matching `*-pre-migration` and `*-pre-migration-<n>`, or record the kept-original path in a settings table and annotate the row as "kept original of X".

### IN-04: Minor client contract and robustness drift

**File:** `client/src/hooks/use-container-events.ts:58-65, 93`; `client/src/hooks/use-migration-operations.ts:95-96`
**Issue:**
- **Mirror drift.** The hand-maintained `ProxyCertStatusEvent.status` lacks `"expiring"`, which the server type includes.
- **Unguarded parse.** `JSON.parse(e.data)` is unguarded in `onmessage`, so a malformed frame throws inside the event handler.
- **Duplicate resync.** The double `resync` on mount (see WR-08).

**Fix:** Derive the event types from `@docktor/shared`, wrap the parse in try/catch, and drop the mount-time `useEffect(resync)` if `onOpen` is guaranteed to fire.

### IN-05: Rollback restart and backup behaviour (prior IN-03)

**File:** `server/src/application/migration-service.ts:332-338, 445-446, 572-581`
**Issue:**
- **Restart-all.** `docker compose start` on rollback starts every service, including ones the user had stopped on purpose.
- **Backup after stop.** The optional backup copies the whole old directory after the old stack is stopped. Downtime grows with data size, and no free-space check precedes it.

**Fix:** Record running services before the stop and start only those. Take the backup before the stop, with an estimated-size check against free space.

---

_Reviewed: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
