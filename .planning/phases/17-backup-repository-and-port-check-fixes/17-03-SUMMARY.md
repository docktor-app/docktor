---
phase: 17-backup-repository-and-port-check-fixes
plan: 03
subsystem: backup
tags: [restic, sftp, ssh, known-hosts, executor, dockerfile]
requires:
  - phase: 17-backup-repository-and-port-check-fixes
    provides: "resolveResticRepository / ResticRepositoryTarget (plan 17-01)"
provides:
  - "Target-aware ResticExecutor: SFTP runs authenticate with the configured key through a per-run 0600 identity file and a persistent pinned known_hosts"
  - "ResticExecutorPort.run/snapshots take a ResticRepositoryTarget; BackupService passes the resolved target everywhere"
  - "openssh-client in the runtime image"
affects: []
tech-stack:
  added: ["openssh-client (Debian package in runtime image)"]
  patterns: ["per-run secret file with finally-cleanup", "pin-on-first-use via StrictHostKeyChecking=accept-new against a persistent known_hosts"]
key-files:
  created: []
  modified:
    - server/src/application/ports/restic-executor-port.ts
    - server/src/infrastructure/restic-executor.ts
    - server/src/application/backup-service.ts
    - server/test/unit/infrastructure/restic-executor.test.ts
    - server/test/unit/application/backup-service.test.ts
    - Dockerfile
key-decisions:
  - "SSH state lives in <stacksDir>/.docktor/ssh (override via ResticExecutorOptions.sshDir): the stacks directory is the only persistent volume, so the host pin survives container recreation (D-04)"
  - "The decrypted key exists only as a 0600 file in a per-run 0700 mkdtemp directory, removed in finally on success, non-zero exit and spawn error (D-03)"
  - "sftp.command carries -l <user> <host> -s sftp because restic adds neither when the command is overridden; path tokens are double-quoted whole, an ssh dir containing a double quote is refused with AppError before any filesystem work"
  - "BatchMode=yes so ssh fails fast instead of prompting; ServerAlive options follow restic's recommendation for long runs"
  - "The executor's dead repository URL and env builders were removed; the domain resolver is the single source"
requirements-completed: [BKP-01, BKP-03]
status: complete
duration: 20min
completed: 2026-10-14
commits: 3
plan_head_before: ba235932a2bd571d2e450be60e510870ef396080
plan_head_after: 9182d4d10f2596305f1951f0595a410181dfde4f
actuals:
  tokens: 6000
  tasks: 2
  commits: 3
---

# Phase 17 Plan 03: SFTP key delivery and host pinning Summary

SFTP backup, restore and snapshot listing now authenticate with the configured private key: restic runs with `-o sftp.command=ssh -i "<temp key>" ... -l <user> <host> -s sftp`, the key lives in a 0600 file only for the lifetime of one restic process, and the server host key is pinned on first use in `<stacksDir>/.docktor/ssh/known_hosts`.

## What was built

- `ResticExecutorPort.run(args, repository, onLine?, cwd?)` and `snapshots(repository, tag)` take a `ResticRepositoryTarget` instead of a bare env. Local and S3 targets spawn restic exactly as before (no extra argv, no files written).
- `ResticExecutor` gained `ResticExecutorOptions {binary?, sshDir?}` (`new ResticExecutor()` still compiles in the composition root), a private `spawnRestic` core, `runWithSftpIdentity` (mkdir 0700, `mkdtemp` `key-*`, `writeFile` mode 0600 flag `wx`, CRLF normalised and trailing newline ensured, `rm` in `finally`) and `buildSftpCommand`. The default SSH directory is resolved per call from `getStacksDir()`.
- `BackupService` passes the resolved target to every restic call (backup, init, retry, forget, restore, snapshot listing); `runWithAutoInit` now takes the target.
- Removed the executor's and port's now-dead repository URL and env builders.
- `Dockerfile` runtime stage installs `openssh-client` (with explanatory comment).

## Tasks and commits

| Task | Commit | Type |
|------|--------|------|
| 1 RED: executor identity tests + BackupService target tests (17 failing) | 9fe6d53 | test |
| 1 GREEN: target-aware executor and BackupService (tracer) | 1f19d07 | feat |
| 2: lifecycle/pin tests, builder removal, Dockerfile | 9182d4d | feat |

Tracer gate: the end-to-end slice (BackupService -> port -> executor -> spawn argv/env/key file) was re-verified by the combined unit run before Task 2 expanded it. Task 2's tests exercise the Task 1 implementation, as the plan specifies, so they passed on first run; no production change was needed to satisfy them.

## Verification

`corepack yarn workspace @docktor/server vitest run --project unit --coverage.enabled=false test/unit/infrastructure/restic-executor.test.ts test/unit/application/backup-service.test.ts test/unit/domain/restic-repository.test.ts test/unit/architecture/layering.test.ts`: 4 files, 338 tests passed (layering fitness test included). `tsc --noEmit` reports no errors in the touched restic files (the Prisma client is not generated in this checkout, so unrelated errors elsewhere are expected); full `tsc --build`, integration tests and the image build are left to CI per project memory. Acceptance greps: no `buildRepoUrl`/`buildEnv` in `server/src`; `openssh-client` appears twice in the Dockerfile.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Threat Flags

None. Mitigations for T-17-08 through T-17-12 are implemented and tested (mode, removal on all three paths, no key in env/argv, accept-new pinning, quoted tokens plus double-quote guard, BatchMode). T-17-13 (key directory left by a hard kill mid-run) remains accepted as planned.

## Self-Check: PASSED

- All six modified files exist and carry the changes above
- commits 9fe6d53, 1f19d07, 9182d4d are ancestors of HEAD
