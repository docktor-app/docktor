---
phase: 17-backup-repository-and-port-check-fixes
verified: 2026-10-14T11:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-01-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-01-SUMMARY.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-02-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-02-SUMMARY.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-03-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-03-SUMMARY.md"
  - "Dockerfile"
  - "server/src/application/backup-service.ts"
  - "server/src/application/ports/restic-executor-port.ts"
  - "server/src/domain/port-conflicts.ts"
  - "server/src/domain/restic-repository.ts"
  - "server/src/infrastructure/restic-executor.ts"
  - "server/test/unit/application/backup-service.test.ts"
  - "server/test/unit/application/deploy-preflight-service.test.ts"
  - "server/test/unit/application/port-conflict-service.test.ts"
  - "server/test/unit/domain/port-conflicts.test.ts"
  - "server/test/unit/domain/restic-repository.test.ts"
  - "server/test/unit/infrastructure/restic-executor.test.ts"
covered_digest: "v3:sha256:e778527689a12fa53e432d282f3d7be082eaafd78dce6c1531cae542b96fa39a"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Configure a real SFTP repository (host, user, private key, password) that already holds a restic repo for a stack, then list snapshots for that stack as the very first SFTP connection from this Docktor instance"
    expected: "Snapshot list loads. ssh's first-connection 'Warning: Permanently added ...' stderr notice must not break JSON parsing of `restic snapshots --json` (review WR-01)"
    why_human: "Needs a real sshd and restic; the unit tests mock spawn and never emit ssh stderr, and restic's stderr passthrough of ssh output is inferred, not reproduced"
  - test: "With SFTP configured, run a manual backup, a restore and a snapshot listing against a real SFTP server; with S3 configured, do the same against an S3-compatible endpoint (e.g. MinIO)"
    expected: "Snapshots appear under <repoPath>/<stackId> (SFTP) or <bucket>/<stackId> (S3) on the remote, not in <stack.hostPath>/backups; no key file remains under <stacksDir>/.docktor/ssh/key-* afterwards; known_hosts is pinned"
    why_human: "End-to-end restic/ssh/network behaviour cannot be exercised by the mocked unit tests"
  - test: "Redeploy a running stack that publishes a host port and confirm the deploy preflight shows no port warning; then try the same port from a second stack and from an external process"
    expected: "No warning for the stack's own docker-proxy socket; warning naming the other stack / process for the other two cases"
    why_human: "Depends on real docker-proxy sockets and the `ss` output; unit tests use injected listener fixtures"
---

# Phase 17: Backup Repository and Port-Check Fixes Verification Report

**Phase Goal:** Backups go where the user configured them to go, and deploy-time port warnings are accurate: no false alarm about a stack's own ports, no missed real conflicts
**Verified:** 2026-10-14
**Status:** human_needed
**Re-verification:** No, initial verification

All five roadmap success criteria hold in the code. The status is `human_needed` rather than `passed` because the SFTP/S3/port behaviour that matters in production (real ssh, real restic, real docker-proxy sockets) is only exercised against mocks, and the code review raised one probable functional defect on the first SFTP connection (WR-01) that no test covers.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With SFTP/S3 configured, manual backup, restore and snapshot listing operate against the configured remote repository, not the stack-local path | VERIFIED | `resolveResticRepository` (`server/src/domain/restic-repository.ts`) builds `s3:<endpoint>/<bucket>/<stackId>` and `sftp:<user>@<host>:<repoPath>/<stackId>`. `backup-service.ts` calls it at `runBackup` (L237), `runRestoreProcess` (L409) and `getSnapshots` (L669); forget, restore and snapshots all pass the `target`. The old `buildEnv` is gone (no remaining references in `src/`). The scheduler and route both go through `runBackup`. The `ResticExecutorPort` signature now takes a `ResticRepositoryTarget`, so a caller cannot pass the wrong thing. Incomplete or undecryptable remote config throws `BadRequestError` and never falls back to local (D-05); the restore resolves before `docker.stop`. |
| 2 | With `local`, behaviour is unchanged and pre-release snapshots stay listed and restorable | VERIFIED | `resolveLocal` returns `path.resolve(hostPath, "backups")` (repoPath only when there is no hostPath), the same location as before. Unit tests "keeps local backup, restore and listing on <hostPath>/backups (BKP-02)" and the `resolveLocal` cases pass. |
| 3 | SFTP and S3 branches of repository environment construction are covered by unit tests written before the fix | VERIFIED | `server/test/unit/domain/restic-repository.test.ts` (S3: location + AWS credentials, defaults, no doubled slashes, never local path, hard-fails; SFTP: location, key kept out of env, hard-fails, option-injection rejection). Git order confirms tests first: `5495751 test(17-01)` precedes `8919a19 feat(17-01)`; `382eb32 test` precedes `f24d949 feat`; `9fe6d53 test(17-03)` precedes `1f19d07 feat(17-03)`. |
| 4 | Redeploying a stack that publishes a host port shows no warning when the only holder is the stack's own container | VERIFIED | `isPublishedByDeployingStack` in `server/src/domain/port-conflicts.ts` skips tier-3 listeners whose (port, protocol) pair is published by a running container with `composeProject === stackId`. `PortConflictService.mapContainer` feeds `composeProject` and `publishedPorts` from dockerode (running containers only). Tests: `port-conflicts.test.ts` "tier 3: the deploying stack's own sockets (D-06)", `port-conflict-service.test.ts`, `deploy-preflight-service.test.ts`. |
| 5 | A port held by another stack or an external process still warns and names the holder | VERIFIED | Tiers 1 and 2 are unchanged; tier 3 still returns `process` / `unknown` holders for listeners not published by the deploying stack. Tests: "tier 2 still attributes the port to another Docktor stack even when docker-proxy listens on it", "still reports a non-Docktor container...", "still reports a listener on the same port number but a different protocol", and the preflight-service case. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified; real-environment confirmation is listed under Human Verification).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/domain/restic-repository.ts` | Pure resolver | VERIFIED | 158 lines, pure (type-only application-port import plus `BadRequestError`), consumed by `backup-service.ts` |
| `server/src/application/backup-service.ts` | Three call sites routed through the resolver | VERIFIED | L237, L409, L669; `runWithAutoInit` takes the target |
| `server/src/application/ports/restic-executor-port.ts` | Port takes a repository target | VERIFIED | `run(args, repository: ResticRepositoryTarget, ...)`, `snapshots(repository, tag)` |
| `server/src/infrastructure/restic-executor.ts` | Per-run 0600 key file, `sftp.command`, accept-new pinning | VERIFIED | `runWithSftpIdentity`: `mkdtemp`, `writeFile` mode 0600 flag `wx`, `finally { rm }`, `StrictHostKeyChecking=accept-new`, persistent `known_hosts` |
| `Dockerfile` | `openssh-client` in the image | VERIFIED | L80 |
| `server/src/domain/port-conflicts.ts` | Tier-3 self-exclusion | VERIFIED | `isPublishedByDeployingStack` wired into `resolveListenerHolder` |
| Test files (6) | Cover the above | VERIFIED | See Behavioral Spot-Checks |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runBackup` / `runRestoreProcess` / `getSnapshots` | `resolveResticRepository` | direct call | WIRED | L237 / L409 / L669 |
| `BackupService` | `ResticExecutor.run` / `snapshots` | `ResticRepositoryTarget` | WIRED | forget L261, restore L428, snapshots L670, auto-init L933-941 |
| `ResticExecutor.run` (sftp kind) | key file + `sftp.command` | `runWithSftpIdentity` | WIRED | cleaned in `finally` |
| `BackupScheduler` / `routes/backups.ts` | `runBackup` | `getBackupRunContext` | WIRED | still calls `runBackup`, so the scheduled path is routed too |
| `PortConflictService.check` | `resolvePortConflicts` | containers with `composeProject` | WIRED | `mapContainer` supplies the compose label and published ports |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `resolveResticRepository` | `config` | `getBackupRepoConfig()` reads and decrypts the settings | Yes | FLOWING |
| `isPublishedByDeployingStack` | `input.containers` | dockerode `listContainers(false)`, `Labels["com.docker.compose.project"]`, `Ports[].PublicPort` | Yes | FLOWING |

The compose project of a stack's containers is assumed to equal the stack id, because `docker compose` runs with `cwd = getStackPath(stackId)`. Tier 2 already relied on this before the phase.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit tests plus layering fitness test | `yarn workspace @docktor/server vitest run --project unit --coverage.enabled=false` over the 6 phase test files plus `test/unit/architecture` | 7 files, 372 tests passed | PASS |

No full `tsc --build` or integration tests were run (per instruction).

### Probe Execution

Step 7c: SKIPPED (no probes declared by the phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BKP-01 | 17-01, 17-03 | Backup, restore and snapshot listing use the configured SFTP/S3 repository | SATISFIED | Truth 1 |
| BKP-02 | 17-01 | Local-repository backups behave as before | SATISFIED | Truth 2 |
| BKP-03 | 17-01 | SFTP/S3 env construction covered by unit tests | SATISFIED | Truth 3 |
| STK-01 | 17-02 | No port warning when the only holder is the stack's own container | SATISFIED | Truth 4 |
| STK-02 | 17-02 | Another stack or external process still warns | SATISFIED | Truth 5 |

REQUIREMENTS.md maps exactly these five IDs to Phase 17 and marks all Complete. No orphaned requirements. STK-03 belongs to Phase 18.

### Anti-Patterns Found

No TBD/FIXME/XXX/TODO/HACK markers in the phase's added lines. No stubs found. `console.log` calls in `restic-executor.ts` print argv and never env or the key.

Code review `17-REVIEW.md` (advisory, 0 critical / 3 warning / 4 info) is acknowledged and does not by itself fail verification:

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `restic-executor.ts` (snapshots, `buildSftpCommand`) | WR-01: ssh first-connection "Permanently added" stderr goes into `snapshots()` JSON parse | Warning | Probable first-call failure of snapshot listing on a new host (a retry works once the host is pinned); not reproduced, hence routed to human verification |
| `restic-executor.ts` L111-130 | WR-02: key directory on the persistent stacks volume can be orphaned on SIGKILL, with no sweep | Warning | Plaintext key could linger after a hard kill |
| `restic-executor.ts` L129-131 | WR-03: `rm` failure in `finally` masks the restic result or original error | Warning | Defeats auto-init detection and can turn a success into a failure |
| `restic-repository.ts` | IN-01..IN-04 (blank local repo, `@` in the SFTP user, IPv6/port support, no ConnectTimeout, tier-3 matches on port and protocol only) | Info | Robustness and documented tradeoffs |

### Human Verification Required

1. **First SFTP connection snapshot listing (WR-01).** Configure SFTP against a host that already has the restic repo, then list snapshots as the first connection. Expected: the list loads. Why human: needs a real sshd and restic.
2. **End-to-end remote backup, restore and listing.** Run these against real SFTP and S3 (MinIO) targets. Expected: snapshots land under `<repoPath>/<stackId>` or `<bucket>/<stackId>`, and no `key-*` directory remains. Why human: network and binary behaviour.
3. **Real port-check scenarios.** Redeploy a running stack with a published port, then check the other-stack and external-process cases. Expected: no warning for the stack's own docker-proxy socket, a named-holder warning for the others. Why human: depends on real `ss` output and docker-proxy.

### Gaps Summary

No blocking gaps. Every roadmap success criterion is implemented, wired and unit-tested, with tests demonstrably committed before the fix. Remaining items are real-environment confirmations, plus the three advisory review warnings. WR-01 and WR-03 are cheap to fix before release (filter `[stderr]` lines in `snapshots()` and add `-o LogLevel=ERROR`; catch the `rm` error). WR-02 (orphaned key files) is worth a follow-up.

---

_Verified: 2026-10-14_
_Verifier: Claude (gsd-verifier)_
