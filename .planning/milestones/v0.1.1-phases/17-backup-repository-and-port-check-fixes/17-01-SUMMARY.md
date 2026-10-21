---
phase: 17-backup-repository-and-port-check-fixes
plan: 01
subsystem: backup
tags: [restic, s3, sftp, ddd, domain, backup-service]
requires: []
provides:
  - "resolveResticRepository: pure resolver from BackupRepoConfig + stack to the restic repository target (location + env)"
  - "BackupService backup, restore and snapshot listing all routed through the resolver"
affects: [17-03]
tech-stack:
  added: []
  patterns: ["pure domain resolver with discriminated-union result", "hard-fail validation (BadRequestError) instead of silent fallback"]
key-files:
  created:
    - server/src/domain/restic-repository.ts
    - server/test/unit/domain/restic-repository.test.ts
  modified:
    - server/src/application/backup-service.ts
    - server/test/unit/application/backup-service.test.ts
key-decisions:
  - "Remote repositories are one restic repo per stack: s3:<endpoint>/<bucket>/<stackId>, sftp:<user>@<host>:<repoPath>/<stackId> (D-01)"
  - "local stays <hostPath>/backups (repoPath fallback only without hostPath) so pre-release snapshots stay restorable (D-02)"
  - "Incomplete or undecryptable remote config throws BadRequestError naming field labels only; never falls back to the local path (D-05)"
  - "SFTP host/user and remote stack ids are validated by strict patterns because they later become ssh arguments / remote path segments"
requirements-completed: [BKP-01, BKP-02, BKP-03]
status: complete
duration: 25min
completed: 2026-10-14
commits: 4
plan_head_before: 5c283dbb98f14942a9761497b5e271c8784da757
plan_head_after: f24d9492dd781ddfdcdb9f57d24be5cef00ecebd
actuals:
  tokens: 14000
  tasks: 2
  commits: 4
---

# Phase 17 Plan 01: Backup repository resolution Summary

Pure `resolveResticRepository` domain resolver makes backup, restore and snapshot listing honour the configured S3/SFTP restic repository (per-stack sub-repo) while keeping `local` byte-for-byte unchanged and hard-failing incomplete remote configuration.

## What was built

- `server/src/domain/restic-repository.ts` (new, pure): `resolveResticRepository(config, stack)` returns a `local | s3 | sftp` `ResticRepositoryTarget` with `repository` and `env` (SFTP also carries `sftp: {host, user, privateKey}`; the key is never in env). Exports `SftpConnection`, `BackupStackLocation`, `DEFAULT_S3_ENDPOINT`, `DEFAULT_SFTP_REPO_PATH` as specified for plan 17-03.
- `BackupService.runBackup`, `runRestoreProcess` and `getSnapshots` all call the resolver; the old private env builder (the source of issue #68) is deleted. `runBackup` logs the repository only, never env.
- Restore resolves the repository before `docker.stop`, so a bad remote config fails before any container is touched. Snapshot listing rejects with `BadRequestError` (400) rather than returning local or empty results.

## Tasks and commits

| Task | Commit | Type |
|------|--------|------|
| 1 RED: domain + S3 runBackup tests | 5495751 | test |
| 1 GREEN: resolver + runBackup routing (tracer) | 8919a19 | feat |
| 2 RED: restore/listing/D-05/BKP-02 tests | 382eb32 | test |
| 2 GREEN: restore + listing routing, remove old builder | f24d949 | feat |

Tests were committed failing before each implementation (ROADMAP success criterion 3): Task 1 failed on the missing module and wrong S3 env; Task 2 showed 7 failures (restore and listing still on the local path) before the fix.

## Verification

`yarn workspace @docktor/server vitest run --project unit test/unit/domain/restic-repository.test.ts test/unit/application/backup-service.test.ts test/unit/architecture/layering.test.ts` : 3 files, 299 tests passed (layering fitness test included). No full `tsc --build` or integration tests run locally per project memory; CI covers them.

## Deviations from Plan

None - plan executed as written. Operational note: `node_modules` was missing in the worktree and `yarn` was not on PATH, so I ran `corepack yarn install --immutable` once and used `corepack yarn` for vitest (no lockfile or source changes). The Prisma client is not generated in this checkout, which does not affect the unit tests run.

## Known Stubs

None.

## Threat Flags

None. All new surface is covered by the plan's threat register (T-17-01..05): secrets live only in the target env, stack ids and SFTP host/user are pattern-validated, and error messages carry field labels only.

## Self-Check: PASSED

- server/src/domain/restic-repository.ts and server/test/unit/domain/restic-repository.test.ts exist
- commits 5495751, 8919a19, 382eb32, f24d949 are ancestors of HEAD
- `grep -c buildEnv` is 0 in both backup-service files; `resolveResticRepository(` appears 3 times in backup-service.ts
