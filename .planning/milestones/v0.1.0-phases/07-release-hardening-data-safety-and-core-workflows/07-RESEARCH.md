# Phase 7: Release Hardening: Data Safety and Core Workflows - Research

**Researched:** 2026-09-12
**Domain:** Backend-only bug fixes — Fastify/Prisma state-machine correctness (bug 1) and container filesystem/mount-namespace introspection via `/proc` (bug 2)
**Confidence:** HIGH

## Summary

This phase's scope is exactly two todo items promoted from the backlog. Direct investigation of the current codebase (not the todo files' original diagnosis, which predates recent fixes) produced one critical finding that changes phase scope materially:

**Bug 1 (`backup-without-config-wedges-stack`) is already fully fixed in the codebase.** Commits `84e5900` (2026-09-02, plan 05.1-04) and `84d3b0a` (2026-09-02, plan 05.1-04 WR-05 follow-up) implemented both halves of the todo's suggested solution: `initiateBackup()`/`initiateRestore()` now throw `BadRequestError` before creating any `Backup` row or transitioning the stack (fail-fast), and `routes/backups.ts`'s fire-and-forget `else` branch now calls `abortBackup()` to resolve the stack out of `BACKING_UP`/`RESTORING` (defense-in-depth), exactly mirroring the adjacent `catch` block. Full unit test coverage of both paths already exists in `server/test/unit/application/backup-service.test.ts` (lines 231, 240, 749, 974-1100). The todo file sitting in `.planning/todos/pending/` is stale — it was not swept up in the 2026-09-11 todo review (`STATE.md` Roadmap Evolution) that closed three other stale blockers. See `## Bug 1 Findings` for the exact diff evidence and the residual work (if any) the planner should scope.

**Bug 2 (`stacks-dir-mount-point-not-verified`) is genuinely unimplemented** and is this phase's real remaining work. `ensureStacksDir()` (`server/src/lib/stacks-dir.ts:29-40`) creates the directory with `fs.mkdir(..., {recursive:true})` but has no way to tell whether the resolved path is a real mount point (host-backed, survives container recreation) versus a plain directory materialized inside the container's own writable overlay layer (silently lost on next `docker compose up`, image update, or host reboot). The prior debug investigation (`.planning/debug/resolved/stacks-dir-not-created-on-boot.md`) already recommends the fix direction: read `/proc/self/mountinfo` (or `/proc/mounts`) after `ensureStacksDir()` succeeds and confirm the resolved stacks path appears as its own mount-point entry; fail loudly (matching `ensureStacksDir()`'s own fail-fast convention) if it does not.

**Scope update (2026-09-12):** Bug 1 has been dropped from Phase 7 entirely (not just deprioritized) — its todo is closed and moved to `.planning/todos/completed/2026-08-28-backup-without-config-wedges-stack.md` with a resolution note citing the commits below. Phase 7's scope is now bug 2 only. **Primary recommendation:** Plan bug 2 as the phase's sole work item (a mount-point check co-located in `server/src/lib/stacks-dir.ts`, wired into `index.ts` right after `ensureStacksDir()`, with unit tests using a fixture `/proc/self/mountinfo`-style string, no new npm dependency). The Bug 1 sections below are retained only as evidence for why it was dropped — no plan should schedule work against them.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Backup-repo-configured validation | API / Backend (`application/backup-service.ts`) | — | Business rule (a backup cannot start without a destination) belongs in the application service, not the route or domain layer; already implemented here |
| Stuck-state cleanup on missing dependency | API / Backend (`routes/backups.ts` fire-and-forget + `application/backup-service.ts:abortBackup`) | — | Route owns the fire-and-forget orchestration boundary; the service owns the actual state resolution logic — already implemented, split matches existing convention |
| Mount-point verification | API / Backend (`lib/stacks-dir.ts`, called from `index.ts`) | — | Pure filesystem/OS introspection at boot, no HTTP or business-rule involvement; belongs in `lib/` alongside `ensureStacksDir()` per existing module boundary |

## User Constraints

No `.planning/phases/07-release-hardening-data-safety-and-core-workflows/07-CONTEXT.md` exists yet (phase has not been through `/gsd-discuss-phase`). No locked decisions or discretion areas to copy verbatim. This section is intentionally empty pending discuss-phase; the planner should treat all of `## Standard Stack` / `## Architecture Patterns` below as recommendations, not locked constraints.

<phase_requirements>
## Phase Requirements

This phase has no `REQUIREMENTS.md` IDs (confirmed: `ROADMAP.md` states "Requirements: n/a — this phase is scoped by the todo list below, not by REQUIREMENTS.md IDs"). Scope is defined by exactly two todo files:

| ID | Description | Research Support |
|----|-------------|------------------|
| Bug 1 | Backup triggerable without configured repo, wedging stack in `BACKING_UP` forever | **Already fixed, dropped from phase scope 2026-09-12** — see `## Bug 1 Findings`. Todo closed at `.planning/todos/completed/2026-08-28-backup-without-config-wedges-stack.md`. Kept in this document for evidence/traceability only — no plan should reference it as work. |
| Bug 2 | `ensureStacksDir()` cannot distinguish a real bind mount from a plain container-layer directory | **Unimplemented — this is the phase's entire remaining scope.** See `## Bug 2 Findings` for the concrete design (mountinfo-based check, no new dependency). |
</phase_requirements>

## Bug 1 Findings: Backup wedge — already fixed

### Evidence

`server/src/application/backup-service.ts:171-204` (`initiateBackup`), read this session:

```
async initiateBackup(
    stackId: string,
    trigger: BackupTrigger = "MANUAL",
): Promise<{id: string}> {
    const stack = await this.stackRepo.findByIdOrThrow(stackId)
    assertTransition(stack.status, "BACKUP")

    const repoConfig = await this.getBackupRepoConfig()
    if (!repoConfig) {
        throw new BadRequestError(
            "No backup repository is configured. Configure one in Settings > Backup.",
        )
    }

    const backup = await this.backupRepo.create({...})
    ...
}
```
`[VERIFIED: server/src/application/backup-service.ts:171-204]` — the `BadRequestError` throw happens strictly before `this.backupRepo.create(...)` and before `this.writeStackStatus(...)`, i.e. fail-fast with zero side effects, exactly what the todo's Solution section requested. `initiateRestore()` (lines 311-341) has the identical guard.

`server/src/routes/backups.ts:38-71` (fire-and-forget block), read this session:

```
void (async () => {
    try {
        const [backupRecord, stack, repoConfig] = await Promise.all([...])
        if (!repoConfig) {
            console.error(`[backups] No repoConfig - backup repository not configured`)
            await backupService.abortBackup(
                backup.id,
                id,
                "No backup repository is configured. Configure one in Settings > Backup.",
            )
            return
        }
        await backupService.runBackup(backupRecord, stack, repoConfig)
    } catch (err) {
        app.log.error({err}, "[backups] fire-and-forget runBackup failed")
        try {
            await backupService.abortBackup(
                backup.id, id, err instanceof Error ? err.message : String(err),
            )
        } catch (abortErr) {
            app.log.error({err: abortErr}, "[backups] abortBackup failed")
        }
    }
})()
```
`[VERIFIED: server/src/routes/backups.ts:38-71]` — the `else` branch (missing `repoConfig`) now calls `abortBackup()`, the exact same cleanup function the `catch` block below it calls. This is precisely the "defense-in-depth ... mirroring the catch block's cleanup behavior" the todo's Solution section asked for. `abortBackup()` (`backup-service.ts:608-643`, read this session) marks the `Backup` row `FAILED`, transitions the stack to `ERROR` via `writeStackStatus()`, sends a `backup_failure` notification, and is idempotent on an unknown id or an already-terminal backup.

`git log` (run this session) shows the fix landed in two commits, both already merged to the branch history this session started from:
- `84e5900` "fix(05.1-04): reject backup/restore requests when no repository is configured" (2026-09-02)
- `84d3b0a` "fix(05.1): WR-05 fail fast in runRestoreProcess() when backup repo becomes unconfigured mid-flight" (2026-09-02)

Both are referenced in `STATE.md`'s decision log: `[Phase 05.1]: [Phase 05.1-04]: ...` and `05.1-04-PLAN.md — Reject backups without a configured repo; broadcast backup/restore status (M4, M3)`.

Test coverage confirmed present in `server/test/unit/application/backup-service.test.ts` (read this session): line 231 "rejects with BadRequestError and creates no row / transitions no status when no backup repository is configured" (for `initiateBackup`), line 240 (stack-not-found still produces `NotFoundError`, not the new `BadRequestError` — ordering test), line 749 (identical test for `initiateRestore`), lines 974-1100 (`abortBackup()` behavior: idempotency on unknown id, idempotency on already-terminal backup, notify-failure-must-not-strand-the-stream via `finally`).

### What this means for planning

- **Do not** re-plan a task that adds the `BadRequestError` guard or the `abortBackup()` wiring — both exist and are tested.
- **The `StatePoller` unconditional-skip claim is independently confirmed** (`server/src/jobs/state-poller.ts:41-46, 210-211, 319`, read this session: `TRANSITIONAL_STATES` includes `BACKING_UP`; both the event-driven path (line 211) and the 60s reconciliation loop (line 319) `return`/`continue` unconditionally with no staleness timeout). This is still true as a general fact about the codebase — but it is no longer a live risk for *this specific* bug, since the two callers that used to leave a stack wedged in `BACKING_UP` forever (missing-repo-config on trigger, and missing-repo-config discovered only in the fire-and-forget block) are now both closed. `StatePoller`'s lack of a general self-heal timeout remains a documented, separately-tracked architectural note in `STATE.md`'s Blockers/Concerns section, not part of this phase's scope.
- **Resolved 2026-09-12:** the todo has been closed and moved to `.planning/todos/completed/2026-08-28-backup-without-config-wedges-stack.md` with a resolution note citing commits `84e5900`/`84d3b0a`. Bug 1 is fully out of Phase 7's scope — no plan task should reference it.
- **Residual gap, explicitly out of scope for Phase 7:** the fire-and-forget block's `catch`-and-`abortBackup` pattern in `backups.ts` has no dedicated route-level (Fastify inject) test — only the service-level `abortBackup()`/`initiateBackup()` methods are unit-tested. If this gap is worth closing, it belongs in a future phase or a standalone todo, not bundled into Phase 7 (which is now scoped to bug 2 only).

## Bug 2 Findings: Mount-point verification — design

### Current state (verified this session)

`server/src/lib/stacks-dir.ts:29-40` (`ensureStacksDir`), read this session:
```
export async function ensureStacksDir(): Promise<string> {
    const target = getStacksDir();
    try {
        await mkdir(target, {recursive: true});
    } catch (err) {
        throw new Error(`Failed to create the managed stacks directory at "${target}" ...`, {cause: err});
    }
    return target;
}
```
`[VERIFIED: server/src/lib/stacks-dir.ts:29-40]` — no filesystem introspection beyond `mkdir`; cannot distinguish an attached bind mount from a plain directory in the overlay layer. Called from `server/src/index.ts:11-17`, read this session:
```
try {
    assertStacksDirMatchesHost();
    await ensureStacksDir();
} catch (err) {
    console.error(err);
    process.exit(1);
}
```
`[VERIFIED: server/src/index.ts:11-17]` — this is the single call site and the established "fail loudly at boot, before `buildApp()`" pattern the new check should extend.

### Diagnosis already on record

`.planning/debug/resolved/stacks-dir-not-created-on-boot.md` (read this session, status: resolved, `find_root_cause_only` mode — no code was written) already contains the root-cause analysis and recommends exactly this follow-up:

> "the mkdir alone cannot detect the more severe silent-data-loss variant where the container-side mount point itself never attached ... A mount-point sanity check (e.g. via /proc/mounts) would be needed to catch that distinct failure mode." `[CITED: .planning/debug/resolved/stacks-dir-not-created-on-boot.md]`

That file also documents (via a WebSearch performed in that session, not re-verified here — treat as `[CITED]`, carried over) that Docker's short-syntax bind-mount host-directory auto-creation is legacy/best-effort (`docker/compose#13602`), and that Docker Desktop's WSL2 integration handles a non-host-mappable absolute path via a materially different "shadow directory" mechanism than native Linux dockerd's plain `mkdir -p` (`docker/for-win#10422`). This is the reason the failure is silent and platform-dependent rather than a guaranteed crash.

### Docker Compose / DooD context (verified this session)

`docker-compose.yml:43-63` (read this session) — both the container's `DOCKTOR_STACKS_DIR` env var and the volume mapping are driven by the identical `DOCKTOR_STACKS_HOST_DIR` variable:
```
environment:
  DOCKTOR_STACKS_DIR: ${DOCKTOR_STACKS_HOST_DIR:-/opt/docktor/stacks}
volumes:
  - ${DOCKTOR_STACKS_HOST_DIR:-/opt/docktor/stacks}:${DOCKTOR_STACKS_HOST_DIR:-/opt/docktor/stacks}
```
`[VERIFIED: docker-compose.yml:43,63]` — this is a short-syntax bind mount, host and container paths byte-identical (required because Docktor runs Docker-outside-of-Docker: it sends absolute paths to the *host's* daemon over the mounted socket, so the container's own view of that path must match what the host daemon expects). `Dockerfile:112` (read this session) sets the compiled-in default `ENV DOCKTOR_STACKS_DIR=/opt/docktor/stacks`. No `RUN mkdir` for this path exists anywhere in the `Dockerfile` (confirmed this session — the file contains no `mkdir` invocation of any kind).

### Recommended detection mechanism: `/proc/self/mountinfo`, not a marker file, not `st.dev` comparison

Two mechanisms were suggested in the todo; both were evaluated:

1. **Marker-file-on-first-boot approach** (todo's second suggestion): write a sentinel file into the stacks dir on first successful boot, and on every later boot check whether the directory exists but the marker is absent (implying the directory was recreated from scratch on the container's ephemeral layer). **Rejected as primary mechanism** — it only detects the failure *after* it has already happened at least once (i.e., after a first container recreation), and requires persisting boot-generation state that itself needs to survive in the very location whose persistence is in question (circular: if the mount silently didn't attach, the marker file is *also* lost, indistinguishable from "first boot ever"). It could still be added as a supplementary belt-and-suspenders check but should not be the sole mechanism.

2. **`/proc/mounts` / `/proc/self/mountinfo` parsing** (todo's first suggestion): **Recommended.** After `ensureStacksDir()` resolves the target path, read `/proc/self/mountinfo` (preferred kernel interface — documented, includes the `root` field showing which of the mounted filesystem's subtrees is exposed, and correctly reflects the calling process's own mount namespace) and check whether the resolved path appears verbatim as a mount point (5th whitespace-delimited field). If it is present as its own mount-point line, the path is definitively a distinct, host-backed mount (bind mount, tmpfs, or otherwise) — a real Docker volume/bind mount always creates its own mount-namespace entry for the target path, regardless of storage driver. If it is absent, the path is part of whatever filesystem its nearest mounted ancestor is (in the DooD default case, the container's own overlay2 root — ephemeral), meaning `ensureStacksDir()`'s `mkdir` materialized a directory that will not survive container recreation.

   `/proc/mounts` format was confirmed on this session's Linux host by direct read (`cat /proc/mounts` / `cat /proc/self/mountinfo`) — `[VERIFIED: /proc/mounts and /proc/self/mountinfo read directly this session]`. Sample line format observed: `sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0` (`/proc/mounts`, space-delimited, mount point is field 2) and `24 29 0:22 / /sys rw,... shared:7 - sysfs sysfs rw` (`/proc/self/mountinfo`, mount point is field 5, format documented in `man 5 proc`). Both files exist and are readable on Linux; this was confirmed on the research session's own sandboxed Linux host, not inside the actual `node:22-slim` Docktor container — the file format itself is a stable Linux kernel ABI (`man 5 proc`), so this is a reasonable `[CITED: man 5 proc]` extrapolation for the container runtime, but the planner should have the executor do a one-line confirmation (`docker exec <container> cat /proc/self/mountinfo`) as part of this phase's manual verification step, since `node:22-slim`'s minimal userland could in principle differ (it should not — `/proc` is provided by the kernel, not the base image — but this phase is explicitly about data-safety guarantees, so confirm rather than assume).

3. **`st.dev` comparison (`fstat` device-number of path vs. parent)** — the classic Unix "mountpoint idiom" (what Python's `os.path.ismount()` uses internally) — **rejected as the sole mechanism** but noted as a cheap secondary signal. A WebSearch performed this session surfaced the documented caveat: "the usual idiom is to compare `st_dev` of the current directory and parent — if they're different that's a mount point, but with bind mounts on the same filesystem, the `st_dev`s will be the same, so such a mount point will not be detected" `[CITED: lkml.iu.edu/hypermail/linux/kernel/1011.0/01601.html, via WebSearch this session]`. In Docktor's specific case this caveat is unlikely to bite (the container root is `overlay2`, a different filesystem type from whatever the host bind-mount source lives on), but relying on it as the *sole* check would be a silent false-negative risk exactly in the failure mode this phase exists to close — prefer mountinfo as primary, `st.dev` as an optional fast-path/cross-check only.

**No new npm dependency is needed or recommended.** A WebSearch for existing packages (`nodeos-mount`) found only a low-level `mount(2)` syscall wrapper, not a mount-point-query utility, and it is not a fit for this narrow read-only check. `npm view` for a plausible package name (`fs-mounts`) returned a 404 (confirmed this session) — do not use unverified package names; a small (~30-line) manual parser of `/proc/self/mountinfo` is well within CLAUDE.md's "no heavy dependency for a simple problem" spirit and keeps the fix in `lib/`, consistent with `ensureStacksDir()`'s own module.

### Suggested shape (for the planner, not prescriptive line-by-line)

- New function `isMountPoint(targetPath: string): Promise<boolean>` in `server/src/lib/stacks-dir.ts` (co-located with `ensureStacksDir()`, not a new file — mirrors how `assertStacksDirMatchesHost()` lives alongside `getStacksDir()` in the same module) that reads `/proc/self/mountinfo` via `fs.readFile`, splits into lines, extracts field 5 (mount point) per `man 5 proc`'s documented `mountinfo` format, un-escapes octal sequences (mount point paths with spaces/special chars are octal-escaped, e.g. `\040` for a space — confirmed as a real concern via the WebSearch's overlayfs/octal-escaping finding), and checks for an exact match against `path.resolve(targetPath)`.
- Call this from `index.ts` immediately after `ensureStacksDir()` succeeds, in the same existing `try { ... } catch { console.error(err); process.exit(1) }` block (same fail-loud convention already established for `assertStacksDirMatchesHost()`/`ensureStacksDir()`).
- Error message should name the resolved path and explain the consequence in the same style as the existing `assertStacksDirMatchesHost()` message (long, operator-facing, actionable) — e.g. pointing at `DOCKTOR_STACKS_HOST_DIR`/the compose volume line as the thing to check.
- Consider an escape hatch env var (matching the codebase's existing pattern of `DOCKTOR_DB_AUTO_PUSH=false`, `DOCKTOR_FS_POLLING`) for operators who deliberately run Docktor without Docker (bare-metal / non-DooD), where "is this a mount point" may not apply — mirror `assertStacksDirMatchesHost()`'s existing behavior of warning-and-continuing when `DOCKTOR_STACKS_HOST_DIR` is unset, rather than hard-failing for that case specifically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting whether a path is a real mount point | A new npm dependency, or a naive `st.dev`-only check | Manual `/proc/self/mountinfo` parse (kernel-documented, stable ABI) as primary signal | No maintained, legitimate npm package does this narrow job (confirmed via WebSearch + registry check this session); `st.dev` alone has a documented false-negative class |
| Re-validating backup-repo-configured state | A second guard/validation layer duplicating `initiateBackup()`'s existing check | The existing `BadRequestError` guard already in `backup-service.ts` | Already implemented and tested — see Bug 1 Findings |

**Key insight:** Both bugs are boot-time/state-machine correctness problems, not new features — the fixes belong in existing modules (`lib/stacks-dir.ts`, `application/backup-service.ts`) rather than new abstractions.

## Package Legitimacy Audit

No external packages are being introduced by either fix in this phase — bug 1 requires no code change (already shipped); bug 2 is implemented via Node built-ins (`node:fs/promises`, `node:path`) reading a kernel-provided `/proc` file. **Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Server boot (index.ts)
   │
   ├─▶ assertStacksDirMatchesHost()      [existing — path-string comparison only]
   │        │ fail ──▶ console.error + process.exit(1)
   │        ▼ pass
   ├─▶ ensureStacksDir()                 [existing — fs.mkdir(recursive)]
   │        │ fail ──▶ console.error + process.exit(1)
   │        ▼ pass, resolved path in hand
   ├─▶ [NEW] isMountPoint(resolvedPath)  [reads /proc/self/mountinfo]
   │        │ false ──▶ console.error("not a real mount — data will not persist") + process.exit(1)
   │        ▼ true
   ├─▶ syncDatabaseSchema()              [existing]
   └─▶ buildApp() → app.listen()         [existing]

Manual backup trigger (already fixed, shown for context)
   │
   POST /api/stacks/:id/backup (routes/backups.ts)
      │
      ├─▶ backupService.initiateBackup(id, "MANUAL")
      │        ├─▶ assertTransition(status, "BACKUP")     [domain/stack-status-machine.ts]
      │        ├─▶ getBackupRepoConfig()
      │        │        └─ null ──▶ throw BadRequestError  [fails fast, 400 to caller, nothing created]
      │        └─▶ create Backup row (IN_PROGRESS) + writeStackStatus(BACKING_UP)
      │
      └─▶ fire-and-forget: fetch (backupRecord, stack, repoConfig)
               ├─ repoConfig null (race window) ──▶ abortBackup()  [defense-in-depth]
               ├─ any other throw ──▶ catch ──▶ abortBackup()      [same cleanup fn]
               └─ else ──▶ runBackup() ──▶ COMPLETED/FAILED, stack restored to previousStatus/ERROR
```

### Recommended Project Structure

No new directories needed. Changes are confined to:
```
server/src/lib/stacks-dir.ts        # add isMountPoint() + wire into ensureStacksDir() flow
server/src/index.ts                 # call isMountPoint() after ensureStacksDir()
server/test/unit/lib/stacks-dir.test.ts   # new test cases (fixture mountinfo content)
```

### Pattern 1: Fail-loud boot-time assertions (existing convention to extend)
**What:** `index.ts` wraps startup-critical filesystem/path checks in a single `try { ...; console.error(err); process.exit(1) }`, running before `buildApp()` so no HTTP server ever comes up in a state known to be unsafe.
**When to use:** Any new boot-time safety check for this phase (the mount-point check) — do not introduce a different error-handling style.
**Example:**
```typescript
// Source: server/src/index.ts:11-17 (read this session)
try {
    assertStacksDirMatchesHost();
    await ensureStacksDir();
    // NEW: await assertStacksDirIsMounted();  (or similar name)
} catch (err) {
    console.error(err);
    process.exit(1);
}
```

### Anti-Patterns to Avoid
- **Re-implementing the backup-repo-configured guard:** it already exists in `initiateBackup()`/`initiateRestore()`. A plan that adds a second, redundant check is design debt, not a fix.
- **Marker-file as the sole mount-detection mechanism:** circular (the marker itself would be lost in exactly the failure case it's meant to detect) — use it only as a supplementary signal if at all.
- **`st.dev` comparison as the sole mechanism:** documented false-negative class for same-filesystem bind mounts; use `/proc/self/mountinfo` as the authoritative signal.

## Common Pitfalls

### Pitfall 1: Treating "directory exists" as "directory is persisted"
**What goes wrong:** `ensureStacksDir()`'s `mkdir` success is silently indistinguishable from a real bind mount having attached.
**Why it happens:** Docker's legacy short-syntax bind-mount auto-creation is best-effort and platform-divergent (WSL2 vs. native Linux dockerd), and `fs.mkdir` cannot see mount-namespace state.
**How to avoid:** Add the `/proc/self/mountinfo` check as a distinct, separately-failing step after `mkdir` succeeds — never conflate the two.
**Warning signs:** Stacks disappear after an image update/host reboot but the server logs showed no error at any prior boot.

### Pitfall 2: Mount-point paths with special characters break naive string matching
**What goes wrong:** `/proc/self/mountinfo` octal-escapes spaces and other special characters in path fields (confirmed via WebSearch this session — overlayfs colons are escaped as `\072`, and the general `mountinfo` format escapes spaces as `\040`).
**Why it happens:** The kernel's `/proc` text format cannot use raw whitespace/colons as field delimiters if a real path contains them.
**How to avoid:** Un-escape known octal sequences before comparing, or compare against a similarly-escaped version of the target path. `DOCKTOR_STACKS_DIR`'s typical value (`/opt/docktor/stacks`) has no special characters, so this is a low-probability edge case for the default config — but a robust implementation and its unit tests should account for it rather than assume it away, since `DOCKTOR_STACKS_HOST_DIR` is user-overridable.
**Warning signs:** A false "not a mount point" failure on a correctly-mounted but unusually-named path.

### Pitfall 3: Assuming `runBackup()`'s fire-and-forget block is covered by service-level tests alone
**What goes wrong:** `backup-service.test.ts` tests `abortBackup()`/`initiateBackup()` directly, but no test exercises the actual `routes/backups.ts` fire-and-forget wiring end-to-end (confirmed via search this session — no `backups`-route test file exists).
**Why it happens:** Service-level unit tests mock the route's dependencies away, so a wiring regression in `backups.ts` itself (e.g., someone removes the `abortBackup()` call from the `else` branch in a future edit) would not be caught by the existing suite.
**How to avoid:** If the phase's Nyquist validation pass wants full coverage of REQ-level behavior (not just the two todos' literal text), add a Fastify `inject()`-based route test for this specific branch as part of Wave 0 gap-closure.

## Code Examples

### Reading and parsing `/proc/self/mountinfo` (Node built-ins only)
```typescript
// Illustrative — not copied from an existing Docktor file (this mechanism is new).
// Field reference: man 5 proc, "mountinfo" section.
import {readFile} from "node:fs/promises"
import path from "node:path"

function unescapeMountinfoField(field: string): string {
    // mountinfo octal-escapes space (\040), tab (\011), newline (\012), backslash (\134)
    return field.replace(/\\([0-7]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
}

export async function isMountPoint(targetPath: string): Promise<boolean> {
    const resolved = path.resolve(targetPath)
    const content = await readFile("/proc/self/mountinfo", "utf-8")
    for (const line of content.split("\n")) {
        if (!line.trim()) continue
        const fields = line.split(" ")
        // Field index 4 (0-based) is the mount point per mountinfo's fixed-position format
        const mountPoint = unescapeMountinfoField(fields[4] ?? "")
        if (mountPoint === resolved) return true
    }
    return false
}
```
`[ASSUMED]` — illustrative code, not verified against a real `node:22-slim` container's `/proc/self/mountinfo` output (only against this research session's own sandboxed host, which is a different Linux environment). The planner should have the executor write a unit test using a *fixture string* shaped like real `mountinfo` output (captured via `docker exec` on a real Docktor container as part of this phase's manual verification, or synthesized from the documented format) rather than relying on this snippet's exact field-splitting logic being final.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Rely on Docker's implicit bind-mount auto-creation | Explicit `ensureStacksDir()` + (this phase) explicit mount-point verification | `ensureStacksDir()` added in plan 05.1-11 (2026-09-xx); mount verification is this phase's new work | Directory presence is now an application-owned guarantee; mount-point *persistence* becomes one too, closing the last silent-data-loss gap in the DooD stacks-directory chain |
| No repo-configured guard on backup trigger | Fail-fast `BadRequestError` + defense-in-depth `abortBackup()` | Plan 05.1-04 (commits `84e5900`, `84d3b0a`, 2026-09-02) | A stack can no longer wedge in `BACKING_UP` forever from this cause |

**Deprecated/outdated:** The todo file `2026-08-28-backup-without-config-wedges-stack.md`'s "Solution: TBD" section is now outdated — both suggested fixes are implemented. Treat the todo file itself as stale documentation to be archived, not a spec to implement against.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/proc/self/mountinfo` is present and in the standard kernel format inside the actual `node:22-slim`-based Docktor container at runtime (not just this research session's sandboxed host) | Bug 2 Findings, Code Examples | If the container's `/proc` is restricted or mounted with a nonstandard security profile (e.g. certain hardened container runtimes mask parts of `/proc`), the check could throw or always report `false`, hard-failing boot in a working deployment. Mitigate with a documented escape-hatch env var (mirroring `DOCKTOR_DB_AUTO_PUSH`) and a manual `docker exec ... cat /proc/self/mountinfo` verification step in the plan. |
| A2 | The illustrative `isMountPoint()` code's field-splitting (naive space-split, index 4) is correct for every real-world `mountinfo` line, including ones with an optional variable-length "optional fields" section before the `-` separator | Code Examples | `mountinfo`'s format has a variable number of optional fields before the literal `-` separator, but the mount-point field (index 4) is always before that variable section, so this specific field's index is stable per `man 5 proc` — risk is limited to the *unescaping* regex, not the field index itself. |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Should the mount-point check be a hard boot failure, or a warning, when `DOCKTOR_STACKS_HOST_DIR` is unset (non-DooD / bare-metal deployment)?**
   - What we know: `assertStacksDirMatchesHost()` already treats an unset `DOCKTOR_STACKS_HOST_DIR` as "warn and continue" rather than "fail" (`stacks-dir.ts:85-94`, verified this session), since that variable's absence is a legitimate non-Docker deployment signal.
   - What's unclear: whether the *mount-point* check should follow the same discretion, or whether "not a real mount point" is dangerous enough to always hard-fail even outside DooD (a bare-metal deployment writing to a plain directory has the identical silent-data-loss risk on reinstall/redeploy, just without the container-recreation trigger).
   - Recommendation: raise this in `/gsd-discuss-phase` as a locked decision to capture in `07-CONTEXT.md` before planning — it changes whether the check needs an environment-conditional branch.

2. ~~Does the phase want a route-level (Fastify inject) regression test added for bug 1's already-fixed behavior?~~ **Resolved 2026-09-12:** bug 1 is dropped from Phase 7 entirely; this question no longer applies to this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `/proc` filesystem (Linux kernel) | Bug 2 mount-point check | ✓ (confirmed on Linux dev/research host) | N/A (kernel ABI, not versioned) | None — this check is Linux-only by nature; Docktor's Dockerfile is already Linux-only (`node:22-slim`), so this is not a new platform constraint |
| Vitest | Both bugs' test suites | ✓ (existing `server/vitest.config.ts`, confirmed) | per `server/package.json` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — no new external dependency introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing, confirmed via `server/package.json` scripts and `server/vitest.config.ts`) |
| Config file | `server/vitest.config.ts` |
| Quick run command | `yarn workspace @docktor/server test:unit` |
| Full suite command | `yarn workspace @docktor/server test` (unit + integration) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Bug 2 | `isMountPoint()` returns `true` for a path present as its own `mountinfo` entry, `false` otherwise | unit | `vitest run --project unit server/test/unit/lib/stacks-dir.test.ts` | ❌ Wave 0 — new test cases needed against a fixture `mountinfo` string |
| Bug 2 | Boot sequence in `index.ts` calls the new check after `ensureStacksDir()` and exits non-zero on failure | unit (of the extracted check function) or manual | same file, or manual `docker exec` verification | ❌ Wave 0 for the unit-testable part; the actual boot-sequence wiring in `index.ts` is difficult to unit-test in isolation (existing precedent: `index.ts` itself has no dedicated test file — confirmed via search this session) — recommend a manual verification step instead, consistent with how `assertStacksDirMatchesHost()`/`ensureStacksDir()`'s *wiring* into `index.ts` was also left to manual verification in prior phases (per `STATE.md`'s Phase 05.1 human-check notes) |

### Sampling Rate
- **Per task commit:** `yarn workspace @docktor/server test:unit`
- **Per wave merge:** `yarn workspace @docktor/server test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual `docker exec <container> cat /proc/self/mountinfo` sanity check against a real running Docktor container (this phase's core risk — silent data loss — is not fully provable by unit tests alone, since unit tests will fixture the `mountinfo` content rather than read a real container's mount namespace)

### Wave 0 Gaps
- [ ] `server/test/unit/lib/stacks-dir.test.ts` — add cases for the new `isMountPoint()` (or equivalently named) function: matches a fixture line, does not match when absent, handles octal-escaped paths
- [ ] No new fixture/conftest infrastructure needed — the existing test file already establishes the `mkdtemp`/env-var-cleanup pattern to extend

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Neither bug touches auth surface |
| V3 Session Management | No | — |
| V4 Access Control | No | Both fixes run pre-auth (boot sequence) or reuse existing `requireAuth`-gated routes (`backups.ts` already has `app.addHook("onRequest", requireAuth)`, unaffected by this phase) |
| V5 Input Validation | No new input surface | Bug 2 reads an OS-provided file, not user input; bug 1's validation is already implemented via existing Zod schemas + `BadRequestError` |
| V6 Cryptography | No | Not touched by either fix |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Silent data loss presented as a working deployment (bug 2's core risk) | Repudiation-adjacent (operator cannot trust the system's own "it works" signal) | Fail loudly at boot rather than silently degrading — the pattern this phase implements is itself the mitigation; no additional crypto/auth control applies |
| Path traversal via a malicious `DOCKTOR_STACKS_DIR`/`DOCKTOR_STACKS_HOST_DIR` value | Tampering | Out of scope for this phase — both env vars are operator-controlled deployment configuration (set in `.env`/`docker-compose.yml`), not user/request input; existing `getStackPath()` traversal guard (`stacks-dir.ts:49-58`, verified this session) already covers the actual attacker-controlled surface (per-stack `id` values) |

## Sources

### Primary (HIGH confidence — read directly this session)
- `server/src/application/backup-service.ts` (full read) — `initiateBackup`, `initiateRestore`, `runBackup`, `runRestoreProcess`, `abortBackup`, `getBackupRepoConfig`
- `server/src/routes/backups.ts` (full read) — fire-and-forget wiring for both backup and restore
- `server/src/domain/stack-status-machine.ts` (full read) — `TRANSITIONS`, `ACTION_TARGET`, `assertTransition`
- `server/src/lib/stacks-dir.ts` (full read) — `getStacksDir`, `ensureStacksDir`, `getStackPath`, `assertStacksDirMatchesHost`
- `server/src/lib/errors.ts` (full read) — `AppError`/`NotFoundError`/`ConflictError`/`BadRequestError` hierarchy
- `server/src/index.ts` (full read) — boot sequence
- `server/src/jobs/state-poller.ts` (targeted read) — `TRANSITIONAL_STATES` and both skip sites
- `server/prisma/schema/stack.prisma:59-71` (targeted read) — `StackStatus` enum, verbatim
- `server/test/unit/application/backup-service.test.ts` (targeted read) — existing coverage of bug 1's fix
- `server/test/unit/lib/stacks-dir.test.ts` (full read) — existing coverage/patterns for `stacks-dir.ts`
- `docker-compose.yml`, `Dockerfile` (full reads) — DooD volume/env wiring
- `.planning/debug/resolved/stacks-dir-not-created-on-boot.md` (full read) — prior root-cause diagnosis and recommended fix direction
- `git log -p` on `backup-service.ts` (run this session) — confirmed commits `84e5900`/`84d3b0a` implement the todo's fix
- Direct `cat /proc/mounts` / `cat /proc/self/mountinfo` (run this session) — confirmed file format on this session's Linux host
- `npm view fs-mounts version` (run this session) — confirmed 404, do not use an unverified package name

### Secondary (MEDIUM confidence)
- WebSearch: "nodejs detect if directory is a bind mount point /proc/self/mountinfo vs container overlay filesystem" — surfaced the `st_dev`-comparison caveat (lkml.iu.edu) and the overlayfs octal-escaping fact; no fit-for-purpose npm package found (`nodeos-mount` is a low-level syscall wrapper, not a query utility)
- `.planning/debug/resolved/stacks-dir-not-created-on-boot.md`'s own embedded WebSearch findings (docker/compose#13602, docker/for-win#10422) — carried over as `[CITED]`, not independently re-verified this session

### Tertiary (LOW confidence)
- The illustrative `isMountPoint()` code snippet in `## Code Examples` — untested against a real container's `/proc/self/mountinfo`; flagged `[ASSUMED]` in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Bug 1 status (already fixed): HIGH — confirmed via direct source read, git log, and existing passing test coverage, not inference
- Bug 2 design (mountinfo-based check): HIGH for the diagnosis and mechanism choice (grounded in kernel docs + the project's own prior debug investigation); MEDIUM for the exact implementation snippet (untested in the real container)
- Pitfalls: HIGH — each is grounded in either a direct source read or a corroborated WebSearch finding, not speculation

**Research date:** 2026-09-12
**Valid until:** 30 days (stable domain — no fast-moving external dependency; re-verify if `ensureStacksDir()`/`backup-service.ts` change again before this phase is planned)
