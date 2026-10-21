# Phase 17: Backup Repository and Port-Check Fixes - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Backups go where the user configured them to go, and deploy-time port warnings are accurate. Two server-side fixes: (1) `BackupService` honours the configured SFTP/S3 restic repository for backup, restore and snapshot listing, keeping `local` behaviour unchanged (BKP-01..03, issue #68); (2) the deploy-time port-conflict check stops flagging a stack's own ports while still reporting real conflicts (STK-01, STK-02, issue #76). No new features; no UI changes.

</domain>

<decisions>
## Implementation Decisions

### Remote repository layout
- **D-01:** SFTP/S3 use a **per-stack sub-repo**: SFTP `<repoPath>/<stackId>`, S3 `<bucket>/<stackId>` (prefix). This mirrors today's one-repo-per-stack local layout, so retention, restore and snapshot listing remain stack-scoped with no tag filtering. — **Reversibility:** costly — snapshots written under this layout live at these remote paths; changing it later needs a remote migration.
- **D-02:** `local` repoType is unchanged: still `<stack.hostPath>/backups`. Snapshots created before this release remain listed and restorable (BKP-02).

### SFTP authentication and host keys
- **D-03:** Decrypted `sftpKey` is written to a **0600 temp file per restic run**, passed via restic's `-o sftp.command` with `IdentityFile`, and deleted in a `finally` block (including on failure).
- **D-04:** Host-key checking is **strict with pin-on-first-use**: `StrictHostKeyChecking=accept-new` against a Docktor-managed `known_hosts` file, so the first connection pins the host and later mismatches fail.

### Incomplete or broken remote config
- **D-05:** If repoType is `sftp`/`s3` and required settings are missing or cannot be decrypted, **hard-fail** with a typed error (`BadRequestError`) naming the missing fields (e.g. "S3 bucket not configured"). The backup is marked failed. **Never fall back to the local path** when remote was requested; the silent fallback is the bug being fixed.

### Port-check false positive
- **D-06:** The stack's own listening sockets are recognised **via its own containers**: collect the stack's running containers (compose project = stack id) and their published port/protocol pairs, and drop tier-3 socket listeners matching those pairs. Real conflicts from other stacks, containers or processes still report with the named holder (STK-02).

### Claude's Discretion
- Where the sftp/s3 URL and env construction lives. The issue notes `ResticExecutor` already builds correct URLs; whether `BackupService.buildEnv()` delegates to it, shares a helper, or is reworked is the planner's call, provided the per-stack suffix (D-01) is applied.
- Location of the `known_hosts` file and temp-key directory (under Docktor's data dir).
- Whether the self-port exclusion lives in the domain function (`resolvePortConflicts`, kept pure) or in `PortConflictService` input preparation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` — BKP-01..03, STK-01, STK-02
- `.planning/ROADMAP.md` — Phase 17 goal and success criteria (tests for SFTP/S3 branches written before the fix)
- GitHub issues `docktor-app/docktor` #68 (backup repo ignored), #76 (own-port warning); #21 is out of scope (pre-deploy conflict detection feature)

### Backup
- `server/src/application/backup-service.ts` — `buildEnv()` (~L981), call sites `runBackup` (~L236), `runRestoreProcess` (~L405), `getSnapshots` (~L663), `getBackupRepoConfig` (~L544)
- `server/src/infrastructure/restic-executor.ts` — `buildRepoUrl` (~L228), existing sftp/s3 env construction (~L213)
- `server/src/application/ports/restic-executor-port.ts` — port interface
- `server/test/unit/` `backup-service.test.ts` — existing "buildEnv path construction" tests (local branch only)
- `.planning/phases/10-backend-architecture-refactor/10-REVIEW.md` — CR-01 finding write-up

### Port check
- `server/src/domain/port-conflicts.ts` — tier resolvers; tier 2 already skips `composeProject === stackId`, tier 3 has no self-exclusion
- `server/src/application/port-conflict-service.ts` — gathers stacks, containers, listeners
- `server/src/application/deploy-preflight-service.ts` — consumer of port conflicts
- `server/src/infrastructure/socket-inspector.ts` — `ss` based listener discovery

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ResticExecutor.buildRepoUrl` / env construction: already produces sftp/s3 repository URLs and AWS credentials.
- `isRepositoryNotFoundError` + auto-init on exit code 10 in `BackupService`: remote repos get initialised the same way.
- `BackupService.getBackupRepoConfig()`: already decrypts password, SFTP key and S3 secret.

### Established Patterns
- Domain code is pure; `resolvePortConflicts` takes pre-gathered inputs from `PortConflictService`.
- Typed errors from `lib/errors.ts`; infrastructure behind ports; unit tests mock repository/filesystem/Docker.

### Integration Points
- `buildEnv` is called from three BackupService paths; all three must route identically.
- `PortConflictService.check(stackId)` feeds `DeployPreflightService`.

</code_context>

<specifics>
## Specific Ideas

- Tests first: SFTP and S3 branches of repo env construction must fail if the wrong repository location or credentials are built (success criterion 3).
- Port tests cover both cases: own container's port yields no warning; another stack/external holder still warns and names the holder.

</specifics>

<deferred>
## Deferred Ideas

- Docs site (`docktor-app/docks`) labels SFTP/S3 settings "not used in v0.1.0"; correction is outside this repo and should follow this phase.
- Related Phase 10 review findings not filed as issues: path-containment separator check (WR-01), composition-root bypass in `onboarding-service.ts` (WR-02), unguarded `JSON.parse` of retention policy (WR-03). Not in scope here.

</deferred>

---

*Phase: 17-Backup Repository and Port-Check Fixes*
*Context gathered: 2026-10-14*
