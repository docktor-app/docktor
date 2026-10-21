---
phase: 17-backup-repository-and-port-check-fixes
verified: 2026-10-14T17:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-01-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-01-SUMMARY.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-02-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-02-SUMMARY.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-03-PLAN.md"
  - ".planning/phases/17-backup-repository-and-port-check-fixes/17-03-SUMMARY.md"
  - "Dockerfile"
  - "client/src/lib/backups-api.ts"
  - "client/src/routes/app/settings/components/backup-repository-card.tsx"
  - "client/src/routes/app/settings/components/backup-repository-fields.tsx"
  - "client/test/unit/routes/settings/backup-repository-card.test.tsx"
  - "server/src/application/backup-service.ts"
  - "server/src/application/ports/restic-executor-port.ts"
  - "server/src/domain/port-conflicts.ts"
  - "server/src/domain/restic-repository.ts"
  - "server/src/infrastructure/restic-executor.ts"
  - "server/src/routes/backups.ts"
  - "server/test/unit/application/backup-service.test.ts"
  - "server/test/unit/application/deploy-preflight-service.test.ts"
  - "server/test/unit/application/port-conflict-service.test.ts"
  - "server/test/unit/domain/port-conflicts.test.ts"
  - "server/test/unit/domain/restic-repository.test.ts"
  - "server/test/unit/infrastructure/restic-executor.test.ts"
  - "shared/src/validation/backups.ts"
covered_digest: "v3:sha256:4957096abc430ea0dbba7f5c642fb05bcc614d5681fe97f313b860ffe0e5410b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Human item 1: first SFTP connection snapshot listing (17-UAT.md test 1, pass)"
    - "Human item 2: end-to-end remote backup/restore/list on SFTP and S3/MinIO (17-UAT.md test 2, pass)"
    - "Human item 3: real port scenarios (17-UAT.md test 3, pass; external-process case not exercisable on this platform, see Human Verification)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-01: ssh first-connection 'Permanently added' notice on stderr is joined into the snapshots() JSON parse"
    category: other
    reason: "Reproduced by the reviewer on restic 0.18.1, but UAT test 1 passed on the real first SFTP connection with the shipped binary. Cheap to fix: collect stdout only in snapshots()"
    evidence_status: "reviewer reproduction vs. UAT pass (conflicting)"
  - finding: "WR-02: per-run key directory lives on the persistent stacks volume and is orphaned on SIGKILL/OOM"
    category: security
    reason: "No sweep of stale key-* directories; move to os.tmpdir() or sweep at startup"
    evidence_status: "code reading"
  - finding: "WR-03: rm() failure in the finally block of runWithSftpIdentity masks the restic result or original error"
    category: other
    reason: "Catch and log the cleanup error"
    evidence_status: "code reading (restic-executor.ts finally block has no catch)"
  - finding: "WR-04: POST /api/settings/backup/test has no timeout or concurrency bound; ssh has no ConnectTimeout"
    category: other
    reason: "A dead S3 endpoint can hold the request and a restic process for restic's retry window"
    evidence_status: "code reading"
  - finding: "WR-05..WR-08: blank non-secret fields cannot be cleared; incomplete remote config can be saved with a success toast; restic password lacks autoComplete=new-password; save handler not awaited (double submit)"
    category: other
    reason: "Settings UI polish and validation gaps; the run-time hard-fail (D-05) still stops a backup with an incomplete config"
    evidence_status: "17-REVIEW.md, not re-reproduced"
---

# Phase 17: Backup Repository and Port-Check Fixes Verification Report

**Phase Goal:** Backups go where the user configured them to go, and deploy-time port warnings are accurate: no false alarm about a stack's own ports, no missed real conflicts
**Verified:** 2026-10-14
**Status:** passed
**Re-verification:** Yes. The previous report was `human_needed`; its three human items are now covered by 17-UAT.md (status complete, 3 passed, 0 issues), and the code changed after that report (Settings UI, test endpoint, not-found fix, sftp.command quoting) was re-read.

All five roadmap success criteria hold in the code, the six phase test files plus the layering test pass, and the real-environment checks the earlier report asked for were completed by the user. Review warnings WR-01..WR-08 remain open but none defeats a roadmap success criterion (see Anti-Patterns).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With SFTP/S3 configured, manual backup, restore and snapshot listing operate against the configured remote repository, not the stack-local path | VERIFIED | `resolveResticRepository` (`server/src/domain/restic-repository.ts`) builds `s3:<endpoint>/<bucket>/<stackId>` with `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, and `sftp:<user>@<host>:<repoPath>/<stackId>`. `backup-service.ts` calls it in `runBackup` (L246), `runRestoreProcess` (L418, before `docker.stop`) and `getSnapshots` (L707); forget, restore, snapshots and auto-init all receive the `ResticRepositoryTarget`. Incomplete or undecryptable remote config throws `BadRequestError`, never a local fallback (D-05, `assertConfigured`). SFTP key delivery: per-run 0600 key file in a `mkdtemp` directory, `sftp.command` with `IdentityFile`, `accept-new` host pinning, `finally` cleanup (`restic-executor.ts`); `openssh-client` is in the Dockerfile. Real-world confirmation: UAT tests 1 and 2 (SFTP and S3/MinIO) passed. |
| 2 | With `local`, behaviour is unchanged and pre-release snapshots stay listed and restorable | VERIFIED | `resolveLocal` returns `path.resolve(hostPath, "backups")` (falls back to `repoPath` only without a hostPath), the pre-phase location. Unit test "keeps local backup, restore and listing on <hostPath>/backups (BKP-02)" passes. The not-found fix (exit code 10 / "repository does not exist") still detects an uninitialised local repository, so local auto-init is preserved. |
| 3 | SFTP and S3 branches of repository construction are covered by unit tests written before the fix | VERIFIED | `server/test/unit/domain/restic-repository.test.ts` covers S3 (location, credentials, defaults, hard-fails) and SFTP (location, key kept out of env, hard-fails, option injection). Commit order: `5495751 test(17-01)` before `8919a19 feat(17-01)`, `382eb32 test` before `f24d949 feat`, `9fe6d53 test(17-03)` before `1f19d07 feat(17-03)`. Post-phase fixes also added tests (CSV-quoted `sftp.command`; S3 Stat failure is not "not found"; `testRepositoryConnection` bad-credentials case). |
| 4 | Redeploying a stack that publishes a host port shows no warning when the only holder is the stack's own container | VERIFIED | `isPublishedByDeployingStack` in `server/src/domain/port-conflicts.ts` is called from `resolveListenerHolder` and skips tier-3 listeners whose (port, protocol) is published by a running container with `composeProject === stackId`. `PortConflictService.mapContainer` supplies `composeProject` (compose label) and `publishedPorts`; `resolvePortConflicts` receives them (L56). Tests in `port-conflicts.test.ts`, `port-conflict-service.test.ts`, `deploy-preflight-service.test.ts` pass. UAT test 3 own-port case passed in a real environment. |
| 5 | A port held by another stack or an external process still warns and names the holder | VERIFIED | Tiers 1 and 2 are unchanged; tier 3 still returns `process`/`unknown` for listeners not published by the deploying stack, and different-protocol or unpublished-port listeners still warn (domain and preflight tests). UAT test 3: second-stack case passed live. The external-process case was not exercisable on Docker Desktop for Windows (the probe sees the Docker VM, not Windows listeners; Docker's own bind error surfaced at deploy), so for external processes the evidence is code plus unit tests, not a live run. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/domain/restic-repository.ts` | Pure resolver with D-05 validation | VERIFIED | Pure (type-only port import plus `BadRequestError`); consumed at three call sites and by the connection probe |
| `server/src/application/backup-service.ts` | Routed through the resolver; `testRepositoryConnection` | VERIFIED | L246 / L418 / L707 / L631; `runWithAutoInit` takes the target |
| `server/src/application/ports/restic-executor-port.ts` | Port takes `ResticRepositoryTarget` | VERIFIED | `run(args, repository, ...)`, `snapshots(repository, tag)` |
| `server/src/infrastructure/restic-executor.ts` | Key file lifecycle, pinning, quoting, not-found fix | VERIFIED | `runWithSftpIdentity`, `toCsvField`, `isRepositoryNotFoundError` matches exit code 10 or "repository does not exist" only |
| `Dockerfile` | `openssh-client` | VERIFIED | Present; restic pinned at 0.19.1 |
| `server/src/domain/port-conflicts.ts` | Tier-3 self-exclusion | VERIFIED | `isPublishedByDeployingStack` wired into `resolveListenerHolder` |
| `server/src/routes/backups.ts` | `POST /api/settings/backup/test` | VERIFIED | L239 delegates to the service; covered by the router-wide `requireAuth` `onRequest` hook (L17) |
| `shared/src/validation/backups.ts` | Backup settings schema with sftp/s3 fields | VERIFIED | Required host/user (sftp) and bucket/access key (s3); secrets optional on update |
| `client/src/lib/backups-api.ts` | `testBackupConnection`, `saveBackupSettings` via `apiFetch` | VERIFIED | L104-118 |
| `backup-repository-card.tsx` / `backup-repository-fields.tsx` | Settings UI for SFTP/S3 | VERIFIED | Wired in `settings.tsx` L65; repo type select offers local/sftp/s3, secrets are never prefilled; component test exists |
| 6 server test files plus client card test | Coverage | VERIFIED | See spot-checks |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runBackup` / `runRestoreProcess` / `getSnapshots` | `resolveResticRepository` | direct call | WIRED | L246 / L418 / L707 |
| `BackupService` | `ResticExecutor.run` / `snapshots` | `ResticRepositoryTarget` | WIRED | forget, restore, snapshots, auto-init |
| `ResticExecutor.run` (sftp) | key file plus `sftp.command` | `runWithSftpIdentity` | WIRED | cleanup in `finally` |
| scheduler and route | `runBackup` | `getBackupRunContext` | WIRED | scheduled and manual paths both resolved |
| `PortConflictService.check` | `resolvePortConflicts` | containers with `composeProject` | WIRED | `mapContainer` L81-82 |
| Settings UI | `POST /api/settings/backup/test` | `testBackupConnection` to `testRepositoryConnection` | WIRED | button visible for non-local repo types |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `resolveResticRepository` | `config` | `getBackupRepoConfig()` reads and decrypts settings | Yes | FLOWING |
| `isPublishedByDeployingStack` | `input.containers` | dockerode container list, compose label, `Ports[].PublicPort` | Yes | FLOWING |
| Settings card | form values | masked `GET /api/settings/backup`; secrets only as `hasX` flags | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit tests plus layering fitness test | `npx vitest run --project unit --coverage.enabled=false` over restic-repository, port-conflicts, restic-executor, backup-service, deploy-preflight-service, port-conflict-service tests and `test/unit/architecture` (in `server/`) | 7 files, 382 tests passed | PASS |

No integration tests, full `tsc --build` or client tests were run (host constraint).

### Probe Execution

Step 7c: SKIPPED (no probes declared by the phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BKP-01 | 17-01, 17-03 | Backup, restore and listing use the configured SFTP/S3 repository | SATISFIED | Truth 1; UAT 1 and 2 |
| BKP-02 | 17-01 | Local-repository backups behave as before | SATISFIED | Truth 2 |
| BKP-03 | 17-01, 17-03 | SFTP/S3 construction covered by pre-fix unit tests | SATISFIED | Truth 3 |
| STK-01 | 17-02 | No warning for the stack's own port | SATISFIED | Truth 4; UAT 3 |
| STK-02 | 17-02 | Other stack or external process still warns | SATISFIED | Truth 5; UAT 3 (second stack live, external process by unit tests) |

The IDs declared across the PLAN frontmatter (BKP-01..03, STK-01, STK-02) are exactly the five REQUIREMENTS.md maps to Phase 17, all marked Complete. No orphaned requirements. STK-03 belongs to Phase 18.

### Anti-Patterns Found

No TBD/FIXME/XXX markers in the phase's source files. No stubs. The refreshed 17-REVIEW.md reports 0 critical (CR-01 was fixed in `0bc737b`; confirmed by the narrowed `isRepositoryNotFoundError` and its tests), 8 warnings and 8 info items. They are advisory:

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `restic-executor.ts` `snapshots()` | WR-01: stderr lines (`[stderr] ...`) are joined into the JSON parse, so an ssh "Permanently added" notice would throw `SyntaxError` | Warning | Reviewer reproduced it on restic 0.18.1; UAT 1 nonetheless passed on a real first connection. Does not defeat SC1 given that evidence, but a one-line fix (stdout only) is recommended |
| `restic-executor.ts` `runWithSftpIdentity` | WR-02: key directory on the persistent volume, orphaned on hard kill | Warning | Plaintext key could linger after SIGKILL |
| `restic-executor.ts` `finally` | WR-03: unguarded `rm` can mask the real result | Warning | Cleanup error replaces the restic outcome |
| `backup-service.ts` `testRepositoryConnection`, `routes/backups.ts` | WR-04: no timeout or concurrency bound, no ssh ConnectTimeout | Warning | Test button can hang on a dead endpoint; raw stderr returned (IN-06) |
| `backup-repository-card.tsx`, `settings-service.ts` | WR-05, WR-06, WR-07, WR-08: blank non-secret fields cannot be cleared; incomplete remote config saves with a success toast; restic password lacks `autoComplete`; save not awaited | Warning | Settings UX; a backup with incomplete config still hard-fails at run time (D-05), so criterion 1 is not defeated |
| various | IN-01..IN-08 (blank local path, IPv6/port, probe id collision, tier-3 matches on port and protocol only, etc.) | Info | Robustness and documented tradeoffs |

### Human Verification Required

None outstanding. The three items from the previous report are recorded in 17-UAT.md as passed (3 passed, 0 issues). One limitation is carried as a note, not a blocker: the external-process port scenario (UAT 3) could not be run on Docker Desktop for Windows, so it rests on the tier-3 unit tests and code reading. It is worth one live check on a Linux host before release.

### Gaps Summary

No blocking gaps. All five roadmap success criteria are implemented, wired and unit-tested, tests precede fixes in git history, and the real-environment checks passed. Recommended before release: WR-01 (stdout-only JSON parse), WR-03 (guard the `rm`), WR-04 (probe deadline and ConnectTimeout). WR-02 is a good follow-up. Housekeeping: ROADMAP.md still shows the Phase 17 checkbox unchecked at L45 although the plan list reads 3/3; the orchestrator should reconcile that.

---

_Verified: 2026-10-14_
_Verifier: Claude (gsd-verifier)_
