---
phase: 17-backup-repository-and-port-check-fixes
reviewed: 2026-10-14T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - Dockerfile
  - server/src/application/backup-service.ts
  - server/src/application/ports/restic-executor-port.ts
  - server/src/domain/port-conflicts.ts
  - server/src/domain/restic-repository.ts
  - server/src/infrastructure/restic-executor.ts
  - server/test/unit/application/backup-service.test.ts
  - server/test/unit/application/deploy-preflight-service.test.ts
  - server/test/unit/application/port-conflict-service.test.ts
  - server/test/unit/domain/port-conflicts.test.ts
  - server/test/unit/domain/restic-repository.test.ts
  - server/test/unit/infrastructure/restic-executor.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-14
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Diff range 5c283db..HEAD, source and tests only (.planning excluded). No critical issues. I checked the focus areas below against source and found them sound.

- **Key file permissions.** The key file is created with `mode: 0o600` and `flag: "wx"` inside an `mkdtemp` directory, which is 0700 and unique per run. Two concurrent runs cannot collide.
- **No key leakage.** The private key lives only in `target.sftp.privateKey`. The resolver's `env` carries `RESTIC_REPOSITORY` and `RESTIC_PASSWORD` only. argv carries only the key file path. The `console.log` calls print argv, never env, and `backup-service` logs `target.repository` only. The repository URL contains user, host and path, but no secrets.
- **Cleanup.** `rm` runs in `finally`, so it covers success, a non-zero exit and a spawn error.
- **Injection into `sftp.command`.**
  - Host and user are pattern-validated in the domain: no whitespace, quotes, or leading `-`.
  - The key path comes from `mkdtemp` and the ssh dir is checked for `"`.
  - `repoPath` and the stack id are only part of the restic URL, never the ssh command line.
  - The stack id is restricted to `[A-Za-z0-9_-]`, which blocks cross-stack traversal.
- **Hard-fail resolver.** It never falls back to the local path for s3 or sftp. Error messages list field labels only.
- **Restore ordering.** The target is resolved before `docker.stop` in `runRestoreProcess`.
- **Layering.** The domain imports only types and `BadRequestError`. The executor wraps the ssh-dir failure in `AppError`.

The findings below are robustness and operational gaps, plus one probable functional bug on the first SFTP connection.

## Warnings

### WR-01: First SFTP connection's ssh "Permanently added" notice can corrupt `snapshots()` JSON parsing

**File:** `server/src/infrastructure/restic-executor.ts:278-292` (with `:176-189` and `:136-139`)
**Issue:** `spawnRestic` forwards every stderr line to `onLine` with a `[stderr] ` prefix. `snapshots()` collects all lines from both streams, then runs `JSON.parse(lines.join(""))`.

The command now sets `-o StrictHostKeyChecking=accept-new` and does not set `LogLevel`. On the first connection ssh prints `Warning: Permanently added '<host>' (...) to the list of known hosts.` to stderr. Restic does not swallow ssh's stderr, so the line will probably appear in `lines` as `[stderr] Warning: ...`. `JSON.parse` then throws a `SyntaxError`, and the stack's snapshot list fails with a 500 on the first call after configuring SFTP. The tests mock `spawn` and never emit ssh stderr, so this is not covered.

Restic's behaviour is not asserted anywhere in this repo, so this is inferred from how restic wires ssh stderr, not reproduced. Even without it, the parse is fragile to any restic warning on stderr.

**Fix:** Filter stderr out when collecting snapshot JSON, and/or silence ssh notices:
```ts
// snapshots()
await this.run([...], repository, (l) => { if (!l.startsWith("[stderr] ")) lines.push(l) })
```
and in `buildSftpCommand` add `"-o LogLevel=ERROR"` (or `-q`). Add a test that emits `Warning: Permanently added ...` on stderr and expects the snapshots to still parse.

### WR-02: Key material can be orphaned on a hard kill, on a persistent bind mount

**File:** `server/src/infrastructure/restic-executor.ts:111-130`
**Issue:** The per-run key directory is created under `<stacksDir>/.docktor/ssh`. That is the persistent, host-bind-mounted stacks volume, not tmpfs. `finally { rm }` does not run on SIGKILL, OOM-kill, container stop with a short grace period, or power loss mid-backup. The plaintext private key then survives on the host disk indefinitely. Nothing sweeps stale `key-*` directories at startup or before the next run. Key directories accumulate and the leaked keys are never reclaimed. The 0700/0600 modes limit exposure to the container user and host root, but the key is deliberately stored encrypted at rest in settings.

**Fix:** Either put only `known_hosts` on the persistent volume and create the key directory under `os.tmpdir()`, or sweep stale directories before creating a new one:
```ts
for (const e of await readdir(sshDir)) {
    if (e.startsWith("key-")) await rm(path.join(sshDir, e), {recursive: true, force: true}).catch(() => undefined)
}
```
A sweep has a race with a concurrent run, so prefer a startup-only sweep, or filter by age or an owner-pid marker.

### WR-03: Cleanup failure masks the restic result or original error

**File:** `server/src/infrastructure/restic-executor.ts:129-131`
**Issue:** `await rm(keyDir, {recursive: true, force: true})` sits in `finally`. `force` only suppresses ENOENT. An EACCES, EBUSY or EIO from `rm` throws out of the `finally`. That turns a successful backup into a failed one, or replaces the real restic error (for example `unable to open config file`) with an `fs` error. `runWithAutoInit` relies on `isRepositoryNotFoundError(err)` against the original error, so a cleanup failure after the init path would also defeat auto-init. In the other direction, a cleanup failure after success hides that the key may still be on disk.

**Fix:** Catch and log without the key content, and let the restic outcome win:
```ts
} finally {
    await rm(keyDir, {recursive: true, force: true}).catch((err: unknown) => {
        console.error(`[ResticExecutor] Failed to remove key directory ${keyDir}:`, err)
    })
}
```

## Info

### IN-01: Local target with no `hostPath` and no `repoPath` yields an empty repository instead of failing

**File:** `server/src/domain/restic-repository.ts:73-80`
**Issue:** `resolveLocal` falls back to `config.repoPath ?? ""` and returns `RESTIC_REPOSITORY=""` when `hostPath` is also unset. Restic then fails with an opaque "Please specify repository location" error. This is the same silent-misconfiguration class D-05 forbids for remote types, only for local. When `hostPath` is absent and `repoPath` is set, all stacks also share one repository, which relies on tag filtering and diverges from the per-stack layout.

**Fix:** Throw `BadRequestError("Local backup repository path is not configured")` when the resolved repository is blank.

### IN-02: SFTP validation edge cases (user containing `@`, no IPv6 or port support)

**File:** `server/src/domain/restic-repository.ts:44-49, 104-109`
**Issue:**
- `SFTP_USER_PATTERN` allows `@`. A user such as `a@b` produces `sftp:a@b@host:/path`, which restic's URL parser may split ambiguously. The ssh side is safe because `-l` is a single token.
- `SFTP_HOST_PATTERN` rejects IPv6 literals and `host:port`, and there is no port setting. Servers on a non-default ssh port, or IPv6-only hosts, cannot be configured at all. The comment says the pattern exists to stop option injection, but it also silently narrows functionality, and the error "is not a valid host name" gives no hint.

**Fix:** Drop `@` from the user class, or document the restriction. Track ssh port and IPv6 support as follow-up work, and improve the error message.

### IN-03: ssh command has no connect timeout; dead-peer detection is very long

**File:** `server/src/infrastructure/restic-executor.ts:140-152`
**Issue:** `ServerAliveInterval=60` with `ServerAliveCountMax=240` allows a hung session for about 4 hours. There is no `ConnectTimeout`, so an unreachable host waits for the kernel TCP timeout. The backup sits in `BACKING_UP` meanwhile, and the stack is locked from other operations.

**Fix:** Add `-o ConnectTimeout=30` and consider reducing `ServerAliveCountMax`.

### IN-04: Tier-3 self-exclusion matches on (port, protocol) only

**File:** `server/src/domain/port-conflicts.ts:149-155, 168`
**Issue:** `SocketListener` carries no bind address, and `RunningContainerPorts.publishedPorts` carries no host IP. A listener on port P is therefore ignored whenever any running container of the deploying stack publishes P/protocol. Example: the stack publishes `127.0.0.1:8080` and a foreign process listens on `10.0.0.5:8080`. A redeploy that requests `0.0.0.0:8080` would genuinely conflict, but the conflict is masked. The behaviour is documented as intentional, so this is a known tradeoff rather than a defect. Adding address fields to the listener and port types would remove the false negative. The new tests only cover the equal-pair and different-protocol cases.

**Fix:** Optional follow-up. Extend `SocketListener` and `publishedPorts` with the bind IP and compare it, or document the limitation in the `isPublishedByDeployingStack` JSDoc.

---

_Reviewed: 2026-10-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
