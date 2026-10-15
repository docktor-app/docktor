---
phase: 18-import-and-migration-flow
reviewed: 2026-10-15T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - shared/src/validation/brownfield.ts
  - shared/src/validation/index.ts
  - server/src/application/migration-service.ts
  - server/src/application/onboarding-service.ts
  - server/src/application/ports/compose-rewriter-port.ts
  - server/src/application/ports/external-stack-control-port.ts
  - server/src/application/ports/self-stack-port.ts
  - server/src/domain/self-stack-paths.ts
  - server/src/infrastructure/brownfield-scanner.ts
  - server/src/infrastructure/compose-rewriter.ts
  - server/src/infrastructure/docker-self-stack.ts
  - server/src/infrastructure/external-stack-control.ts
  - server/src/infrastructure/probe-transport.ts
  - server/src/routes/imports.ts
  - server/src/routes/setup.ts
  - server/src/infrastructure/volume-migrator.ts
  - server/src/infrastructure/stack-filesystem.ts
  - client/src/components/domain/stack/brownfield-import.tsx
  - client/src/components/domain/stack/diff-confirm-dialog.tsx
  - client/src/lib/brownfield-types.ts
  - client/src/lib/env-mask.ts
  - client/src/lib/import-api.ts
  - client/src/lib/setup-api.ts
  - client/src/routes/setup/components/migration-backup-step.tsx
  - client/src/routes/setup/components/migration-old-stack-step.tsx
  - client/src/routes/setup/components/migration-review-step.tsx
  - client/src/routes/setup/components/migration-select-step.tsx
  - client/src/routes/setup/components/migration-step-indicator.tsx
  - client/src/routes/setup/components/migration-wizard.tsx
findings:
  critical: 2
  warning: 9
  info: 4
  total: 15
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-10-15
**Depth:** standard
**Files Reviewed:** 29 source files (test files read only for context, not reviewed)
**Status:** issues_found

## Summary

The phase-18 core is mostly sound:
- Docker invocation is argv-only (`ExternalStackControl`, `VolumeMigrator`), with no shell.
- The compose path is validated at the API boundary by a shared Zod schema.
- Self-stack lookup is fail-open at two layers (adapter and service).
- The original directory is never written to.

The weak points are the rollback and copy semantics in `MigrationService`:
- A copy failure is silently converted into an empty directory and reported as success.
- Rollback is not scoped to what this request created. It can delete another request's stack.

There are also functional gaps that produce a "successful" migration with missing data, plus several path-confinement and authorization gaps around the new `stopOldStack` capability.

No structural (fallow) findings were provided.

## Critical Issues

### CR-01: Bind-mount copy failures are swallowed and migration reports success with empty data

**File:** `server/src/application/migration-service.ts:170-176`
**Issue:** The `try` wraps both `fs.access(srcPath)` and `this.migrator.copyDirectory(srcPath, destPath)`, and the bare `catch` falls through to `mkdir(destPath)`. The comment says "Source might not exist yet", but the catch also fires for:
- `EACCES` on the source
- `ENOSPC`
- an `fs.cp` "cannot copy to a subdirectory of self" error
- any I/O error mid-copy

In each case the user gets `success: true`, a deployed stack with an empty (or half-copied) data directory, and a first-run database. With `stopOldStack` (default on), the old stack is already stopped, so the user is led to believe the data moved. This defeats the rollback guarantee (BF-05).
**Fix:** Only treat `ENOENT` on the access check as "empty source". Let copy errors propagate so the rollback runs.
```typescript
const exists = await fs.access(srcPath).then(() => true, (e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return false;
    throw e;
});
if (exists) {
    await this.migrator.copyDirectory(srcPath, destPath);
} else {
    await fs.mkdir(destPath, {recursive: true});
}
```

### CR-02: Rollback is not scoped to what this request created (cross-request deletion of another stack)

**File:** `server/src/application/migration-service.ts:108-119, 134-135, 236-246`
**Issue:** The "exists" check and `checkTargetDirectory` are TOCTOU checks. `createDirectory` uses `mkdir({recursive:true})`, which succeeds on an existing directory, and then `createdStackDir = true` is set unconditionally.

Two concurrent migrations with the same slug are possible because the client does not block this. `BrownfieldImport` only marks a stack "Imported" after success (`brownfield-import.tsx:126-141`, `:209`), so the user can re-open Migrate for the same row while the first run is in flight. Both runs pass the checks. One fails on `stackRepo.create` (unique violation) or elsewhere, and its rollback then does two things:
- `removeDirectory(stackId)` deletes the directory the other run is populating or has already deployed.
- `stackRepo.delete(stackId)` (line 246) deletes the other run's DB record. This is unconditional, with no `recordCreated` flag.

This contradicts the stated invariant that only a directory created in this run is ever removed (D-09).
**Fix:**
- Make directory creation atomic and exclusive, for example `fs.mkdir(path)` without `recursive` on the leaf, so `EEXIST` aborts before `createdStackDir` is set.
- Track `recordCreated` and call `stackRepo.delete` only when it is true.
- Add a per-slug in-flight guard in the service (a `Set<string>`).
- On the client, track in-flight stack paths and disable Migrate/Adopt for them.

## Warnings

### WR-01: Relative bind mounts (and `build:` contexts) are never copied; new stack starts with empty data

**File:** `server/src/application/migration-service.ts:160-178`, `client/src/routes/setup/components/migration-wizard.tsx:81-88`
**Issue:** Only `stack.absolutePaths` become `volumeSelections`. Relative binds (`./data`, `./nginx.conf`, a `./app` build context) are left verbatim in the rewritten compose, but the new stack directory contains only `docker-compose.yml` and `.env`. `docker compose up` then creates empty `./data` directories (fresh database) or fails on missing config files.

Only the opt-in `pre-migration-backup/` copy has the files, and the compose does not point at it. The dialog copy ("Choose which volumes and bind mounts to copy") implies completeness. RESEARCH.md treats the directory copy as covering relative mounts, but that is a backup, not a live copy.
**Fix:** Copy the relative bind-mount sources from `originalDir` into the new stack directory at the same relative paths (confined by `assertWithin`). At minimum, list relative mounts in the wizard with an explicit "not migrated" warning.

### WR-02: Bind-mount copy source is not confined or tied to the compose file

**File:** `server/src/application/migration-service.ts:161-173`
**Issue:** `sel.originalPath` is attacker-controlled. The schema accepts any string, and an absolute value or one with `..` is used verbatim as `srcPath`. `copyDirectory` then copies any host-readable directory (`/etc`, `/root/.ssh`, `/host/...`) into the managed stacks directory, which is exposed through Docktor's file and backup features. The destination is confined, but the source is not.
**Fix:** Require each `originalPath` to appear as a bind source in the parsed compose file (re-run the analyzer server-side), or reject sources that resolve to system roots. Validate `originalPath`/`newPath` in `volumeSelectionSchema` (no NUL, `newPath` relative or under `./volumes/`).

### WR-03: Unauthenticated `/api/setup/migrate` can now stop arbitrary compose projects

**File:** `server/src/routes/setup.ts:12-26, 150-168`
**Issue:** The `/api/setup/*` routes are gated only by `isWizardComplete()`, with no `requireAuth`. Before step 1 (or between step 1 and completion) anyone who can reach the server can call `/api/setup/migrate` with `stopOldStack: true` and any `compose.yml` path. Phase 18 adds `docker compose stop` on that path to the existing arbitrary copy and deploy. The same window exposes `/api/setup/migrate/preview` as an arbitrary compose-file reader.
Unlike `/api/setup/step6`, the migrate routes have no `hasAnyUser()` guard.
**Fix:** Require an authenticated session for the setup brownfield routes once an admin exists. Before an admin exists, at least refuse stop/migrate (`hasAnyUser()` check as in step 6).

### WR-04: Default `newPath` collides for same-basename bind mounts; duplicate React keys

**File:** `client/src/routes/setup/components/migration-wizard.tsx:83-87`, `client/src/routes/setup/components/migration-select-step.tsx:320`
**Issue:**
- `./volumes/${directoryDisplayName(path)}` yields the same target for `/srv/a/data` and `/srv/b/data`. The server then merges both sources into one directory, and `pathRewrites` points both mounts at it. Files overwrite each other.
- A named volume also named `data` lands in `./volumes/data` too.
- `key={sel.originalPath}` duplicates if the analyzer lists the same path for several services.

**Fix:** Derive unique `newPath` values (suffix an index or use the full sanitized path). Reject duplicate `newPath` values among converted selections in `MigrationService.migrate`. Use the index or `originalPath + index` as the key.

### WR-05: Failed deploy leaves containers and networks behind after rollback

**File:** `server/src/application/migration-service.ts:226-248`
**Issue:** If `docker.up(stackId)` fails midway (for example one service fails to start), compose has already created containers, networks and possibly volumes under project `stackId`. Rollback removes the directory and DB record but runs no `down`. The orphans reference a deleted directory, and a retry with the same name collides with them.
**Fix:** Track `deployAttempted` and run `docker.down`-without-`-v` (a variant that does not delete volumes) in rollback, best-effort. Note that the existing `down` uses `-v`, so add a variant rather than reusing it.

### WR-06: Migration compose diff shows secret values in plaintext

**File:** `client/src/routes/setup/components/migration-review-step.tsx:40-42, 49-66`
**Issue:** Only the extracted `.env` preview is masked and revealed through the toggle. The compose diff is rendered raw. The rewriter moves inline `environment:` objects out of the compose, so the removed `-` lines show `POSTGRES_PASSWORD: ...` in clear. The mask therefore gives a false sense of protection (D-05 intent), unlike `diff-confirm-dialog`, which masks hunks.
**Fix:** Apply `maskEnvLine` (or a YAML-key-aware equivalent) to diff lines for keys where `isSecretKey` matches, governed by the same reveal toggle. Show the toggle when either the diff or the env contains a secret.

### WR-07: Old-stack stop relies on inferred project name and reports success even when nothing was stopped

**File:** `server/src/infrastructure/external-stack-control.ts:40-48`, `client/src/components/domain/stack/brownfield-import.tsx:25-31`
**Issue:**
- `docker compose -f <file> stop` derives the project name from the directory name (or the top-level `name:`). Stacks started with `-p` or `COMPOSE_PROJECT_NAME`, or from a differently named directory, resolve to a different project. `stop` then exits 0 having stopped nothing.
- The success toast still says "The old stack was stopped.", and the new deploy hits port conflicts.
- `COMPOSE_TIMEOUT_MS` (120 s) can also be shorter than a graceful stop of many containers. A timeout kills the CLI mid-stop, and rollback then restarts a partially stopped stack.

**Fix:**
- Resolve the project from the running containers' `com.docker.compose.project.config_files` label (the same technique as `DockerSelfStack`), or verify via `docker compose ps -q` that nothing is running after `stop`.
- Make the toast say "requested", or fail closed if containers remain.
- Scale the timeout.

### WR-08: Named-volume copy uses the unprefixed compose key as the Docker volume name

**File:** `server/src/application/migration-service.ts:147-157`, `server/src/infrastructure/volume-migrator.ts:15-22`
**Issue:** Compose names a top-level volume `<project>_<key>` unless `name:` is set. `copyVolumeToBindMount(volName, ...)` runs `docker run -v <key>:/source:ro`, which silently creates a new empty volume named `<key>` when none exists. It copies nothing, succeeds, and leaves a stray volume. The same mismatch means `external: true` for unconverted volumes in `compose-rewriter.ts` (lines 108-123) points at a non-existent literal name. This existed before phase 18, but this phase made migration the headline feature and stacked more guarantees on it.
**Fix:** Resolve the real volume name (`<project>_<key>`, or the `name:` override) from the old stack's project and compose. Verify with `docker volume inspect` before copying and fail if it is missing. Use `--mount type=volume,source=...,readonly` and avoid auto-creation.

### WR-09: No service-level guard against migrating or adopting Docktor's own stack

**File:** `server/src/application/onboarding-service.ts:216-245`, `server/src/application/migration-service.ts:98-131`
**Issue:** STK-03 hides Docktor's own compose file only in `scan()`. `adoptInPlace` and `migrate` accept any `composePath`. A direct API call or stale list can run `migrate` with `stopOldStack: true` against Docktor's own stack, which runs `docker compose stop` on Docktor itself. The server is then dead mid-request, rollback never runs, and it cannot restart the stack.
**Fix:** In `migrate` and `adoptInPlace`, call `selfStack.composeFilePaths()` and reject with `BadRequestError` when `composePath` matches (reuse `excludeOwnComposeFiles`). Keep fail-open semantics for unknown self.

## Info

### IN-01: `composePath` validation is by file name only; symlinks and arbitrary locations are allowed

**File:** `shared/src/validation/brownfield.ts:9-16`, `server/src/application/migration-service.ts:81`
**Issue:** The regex guarantees a compose-looking name, but a `compose.yml` symlink to any readable file passes. `previewMigration` reads it and echoes the content (as a diff or an error). `.*` also allows `..` segments.
**Fix:** `fs.realpath` the path in the service and re-validate the basename. Optionally reject `..` segments in the schema.

### IN-02: Display-name and preview labelling nits

**File:** `client/src/routes/setup/components/migration-wizard.tsx:225`, `client/src/routes/setup/components/migration-review-step.tsx:48`
**Issue:**
- `!displayName` accepts whitespace-only names. The server then fails with "empty slug" only after the user has gone through all four steps. The slug rule (63 chars, dropped characters) is never previewed.
- The "New .env file" heading shows only the extracted vars, while `migrate` writes the old `.env` plus extracted vars.

**Fix:** Validate `displayName.trim()` and a non-empty slug in step 1. Label the preview "Variables added to .env".

### IN-03: Rollback restart and backup behaviour nits

**File:** `server/src/application/migration-service.ts:139-141, 248, 279-287`
**Issue:**
- `docker compose start` on rollback starts every service, including ones the user had deliberately stopped before migrating.
- The backup copies the entire old directory (including large bind-mount data) with no free-space check, and it runs after the old stack is stopped, so it extends downtime.

**Fix:** Record running services before stopping (`ps --format json`) and start only those. Consider an estimated-size check, or take the backup before the stop.

### IN-04: Type-safety and logging convention deviations

**File:** `server/src/infrastructure/compose-rewriter.ts:35`, `server/src/application/migration-service.ts:234, 285`
**Issue:**
- `service as any` and the untyped `parseYaml` result violate the CLAUDE.md "no any" rule. A null or empty YAML document makes `doc.services` throw an untyped `TypeError`.
- Rollback paths use `console.error` instead of the project logger.
- `ExternalStackControl` assigns `wrapped.cause` after construction instead of passing `{cause}`.

**Fix:** Narrow the parsed doc with a Zod or type guard. Use `new AppError(msg, {cause})` if supported. Use the Fastify or app logger.

---

_Reviewed: 2026-10-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
