---
phase: 07-release-hardening-data-safety-and-core-workflows
plan: 01
subsystem: infra
tags: [proc-mountinfo, boot-safety, data-loss-prevention, docker-outside-of-docker, vitest]

# Dependency graph
requires:
  - phase: 05.1-stabilization-fix-blockers-and-majors-surfaced-during-testin
    provides: ensureStacksDir() and assertStacksDirMatchesHost() in server/src/lib/stacks-dir.ts, and the existing fail-loud boot try/catch in server/src/index.ts
provides:
  - "assertStacksDirIsMounted() — reads /proc/self/mountinfo at boot and refuses to start when the stacks directory resolves onto ephemeral storage"
  - "findMountEntryForPath() — pure, exported mountinfo parser (deepest-covering-entry match, octal-escape-aware, malformed-line-tolerant)"
  - "DOCKTOR_STACKS_MOUNT_CHECK env var — deliberate, always-logged opt-out"
  - "docs/deployment.md 'Stacks directory persistence' section for operators"
affects: [08-live-state-consistency, 09-deployment-and-release-readiness]

# Actuals (#2632)
actuals:
  tokens: 6873
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-loud boot-time assertion reading /proc/self/mountinfo, extending the existing assertStacksDirMatchesHost()/ensureStacksDir() try/catch convention in server/src/index.ts"
    - "Injectable-reader default-parameter pattern (readMountinfo) for testing async I/O without mocking node:fs/promises at the module level"

key-files:
  created: []
  modified:
    - server/src/lib/stacks-dir.ts
    - server/src/index.ts
    - server/test/unit/lib/stacks-dir.test.ts
    - docs/deployment.md

key-decisions:
  - "Deepest-covering-mountinfo-entry match (not exact-match-only) so a persistent parent-directory mount (e.g. /opt/docktor mounted, stacks dir a subdirectory) is correctly recognized as persistent — matches PD-2 from the plan's design notes"
  - "Fail only on positive evidence of ephemerality (unreadable mountinfo, or no covering entry, both warn-and-continue) — an unverifiable host must never brick a working deployment"
  - "Container-root-plus-DOCKTOR_STACKS_HOST_DIR is treated as ephemeral in addition to the overlay/tmpfs/ramfs filesystem-type set, so a never-attached volume on a non-overlay (btrfs/zfs/xfs) container storage driver is still caught"
  - "gsd_run check tdd-red-evidence was not used to validate RED phases — that tool parses Node's native --test TAP summary format (# tests/# pass/# fail, ok/not ok lines); vitest's --reporter=tap emits a nested TAP-13 format the parser's flat regexes cannot read. RED evidence was instead confirmed manually: vitest run output showing each new test failing individually with a real per-test error ('X is not a function'), pre-existing tests unaffected, non-flat-file-load failure. workflow.tdd_mode is not enabled in this project's config.json, so the strict SUMMARY 'TDD Gate Compliance' git-log-grep validation is not mandatory here either."

requirements-completed: []

coverage:
  - id: D1
    description: "A boot whose stacks directory resolves onto an ephemeral filesystem (tmpfs/overlay/overlayfs/ramfs) refuses to start, printing an error naming the resolved path, before schema-sync and before any HTTP listener starts"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/stacks-dir.test.ts#assertStacksDirIsMounted rejects with an Error naming the resolved stacks path when the covering entry's filesystem type is overlay"
        status: pass
      - kind: other
        ref: "live boot probe: DOCKTOR_STACKS_DIR=/dev/shm/docktor-mount-probe/stacks (tmpfs) — exit 1, error names the resolved path, 0 occurrences of 'schema-sync' in the log"
        status: pass
    human_judgment: false
  - id: D2
    description: "A boot whose stacks directory sits on persistent storage, or under a persistent parent mount, boots exactly as before this plan"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/stacks-dir.test.ts#assertStacksDirIsMounted resolves without throwing when the covering entry's filesystem type is ext4"
        status: pass
      - kind: other
        ref: "live boot probe: DOCKTOR_STACKS_DIR pointed at the working tree (ext2/ext3) — reaches the schema-sync log line, then the HTTP server starts and runs (probe timeout is the expected outcome for a successful boot, not a failure)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Octal-escaped mount points (space \\040, backslash \\134) match correctly, and malformed mountinfo lines (blank, truncated, no '-' separator) are tolerated rather than fatal"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/stacks-dir.test.ts#findMountEntryForPath matches an octal-escaped space / un-escapes an octal-escaped backslash / tolerates a blank line, a truncated line, and a line with no '-' separator"
        status: pass
    human_judgment: false
  - id: D4
    description: "An unverifiable host (no readable /proc/self/mountinfo, or no covering mount entry) warns once and continues rather than blocking boot"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/stacks-dir.test.ts#assertStacksDirIsMounted warns once naming /proc/self/mountinfo when the reader rejects / warns once and resolves when no mount entry covers the resolved path"
        status: pass
    human_judgment: false
  - id: D5
    description: "DOCKTOR_STACKS_MOUNT_CHECK=false deliberately skips the check, always logging a warning naming the variable"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/stacks-dir.test.ts#assertStacksDirIsMounted warns once naming DOCKTOR_STACKS_MOUNT_CHECK and resolves without throwing when the check is disabled"
        status: pass
      - kind: other
        ref: "live boot probe: DOCKTOR_STACKS_MOUNT_CHECK=false + tmpfs stacks dir — reaches schema-sync, log contains 'DOCKTOR_STACKS_MOUNT_CHECK'"
        status: pass
    human_judgment: false
  - id: D6
    description: "docs/deployment.md documents the variable, the persistence check, its boot-refusal vs warn-and-continue cases, and a troubleshooting row"
    verification:
      - kind: other
        ref: "grep -c 'DOCKTOR_STACKS_MOUNT_CHECK' docs/deployment.md == 3; grep -c 'Stacks directory persistence' == 2; grep -c 'assertStacksDirIsMounted' == 1; no .env* file modified"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-09-12
status: complete
---

# Phase 07 Plan 01: Stacks-Directory Mount-Point Persistence Check Summary

**A mountinfo-backed boot check (`assertStacksDirIsMounted()`) that refuses to start on ephemeral stacks storage, with an operator opt-out (`DOCKTOR_STACKS_MOUNT_CHECK=false`) and full deployment documentation.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-12 (session start)
- **Completed:** 2026-09-12T12:13:17Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `findMountEntryForPath()` parses `/proc/self/mountinfo`-shaped content, matching the deepest mount entry that covers a resolved path (exact match or ancestor), locating the filesystem-type field via the `-` separator rather than a fixed index, un-escaping octal sequences (`\040`, `\134`), and tolerating malformed lines without throwing.
- `assertStacksDirIsMounted()` throws a plain `Error` naming the resolved stacks path when the covering mount's filesystem type is `overlay`/`overlayfs`/`tmpfs`/`ramfs`, or when the container's own root (`/`) covers the path while `DOCKTOR_STACKS_HOST_DIR` is set (a declared-containerized deployment whose volume never attached, even on a non-overlay storage driver).
- Wired into `server/src/index.ts`'s existing boot `try/catch`, after `ensureStacksDir()` and before `syncDatabaseSchema()` — extends the file's established fail-loud convention with no new import statement and no restructured block.
- Three non-throwing branches make the check safe by default: `DOCKTOR_STACKS_MOUNT_CHECK=false` (deliberate opt-out), an unreadable/rejecting mountinfo reader (non-Linux dev host, hardened runtime), and no covering mount entry at all — each warns once via `console.warn` and continues, matching `assertStacksDirMatchesHost()`'s established warn-and-return shape.
- `docs/deployment.md` gained an env-var table row, a new "Stacks directory persistence" section, and troubleshooting row 10, all naming the enforcing function per this file's existing convention.
- Two live boot probes prove both directions end-to-end: a `tmpfs`-backed `DOCKTOR_STACKS_DIR` refuses to boot (exit 1, error names the resolved path, never reaches schema-sync); a working-tree-backed path boots unchanged (reaches schema-sync, HTTP server starts).

## Task Commits

Each task was committed atomically (TDD tasks produced separate RED/GREEN commits):

1. **Task 1: End-to-end "boot refuses to start on ephemeral stacks storage"** (tracer, TDD)
   - `f219cf9` `test(07-01): add failing tests for findMountEntryForPath and assertStacksDirIsMounted` (RED)
   - `dcd6b30` `feat(07-01): boot refuses to start on ephemeral stacks storage` (GREEN)
2. **Task 2: Harden the check — escape sequences, unverifiable hosts, container-root detection, operator opt-out** (auto, TDD)
   - `f3bbd21` `test(07-01): add failing tests for opt-out, unverifiable-host, and container-root branches` (RED)
   - `b92025a` `feat(07-01): harden the check — opt-out, unverifiable hosts, container-root detection` (GREEN)
3. **Task 3: Document the persistence guarantee and its opt-out for operators** (auto)
   - `9a35e24` `docs(07-01): document the stacks-directory persistence check and its opt-out`
4. Additional cleanup (Rule 1-adjacent code-quality fix, not a separate task):
   - `3718e3f` `refactor(07-01): drop a redundant type cast in findMountEntryForPath`

**Plan metadata:** committed alongside STATE.md/ROADMAP.md updates (see final commit).

_TDD tasks produced test → feat commits (RED → GREEN); no REFACTOR commit was needed for either task's core cycle since the implementation was already minimal and clean — the one refactor commit above is an unrelated post-hoc type-cast cleanup._

## Files Created/Modified
- `server/src/lib/stacks-dir.ts` — added `MountEntry`, `findMountEntryForPath()`, `unescapeMountinfoField()`, and `assertStacksDirIsMounted()`
- `server/src/index.ts` — added `assertStacksDirIsMounted` to the existing named import and call, extended the leading boot-sequence comment
- `server/test/unit/lib/stacks-dir.test.ts` — added `describe("findMountEntryForPath")` (8 cases) and `describe("assertStacksDirIsMounted")` (9 cases), extended the shared `afterEach` cleanup list
- `docs/deployment.md` — new `DOCKTOR_STACKS_MOUNT_CHECK` env-var row, new "Stacks directory persistence" section, new troubleshooting row 10

## Decisions Made
- Deepest-covering-mountinfo-entry match (PD-2) instead of exact-match-only, so a parent-directory mount is correctly recognized as persistent.
- Fail only on positive evidence of ephemerality (PD-3) — unverifiable hosts always warn and continue, never block boot.
- Container-root + `DOCKTOR_STACKS_HOST_DIR` is treated as ephemeral in addition to the filesystem-type set, closing the non-overlay-storage-driver gap identified in the plan's action item 4.
- `gsd_run check tdd-red-evidence` was not used to validate RED phases: that tool's `parseNodeTestSummary`/`tapFailedTestNames` parse Node's native `--test` flat TAP summary format (`# tests N`, `ok N - <name>`), while vitest's `--reporter=tap` emits a nested TAP-13 format the same regexes cannot read (confirmed by running both). RED was instead confirmed manually each time: `vitest run` output showing every new test failing individually with a real per-test error (`"X is not a function"`), distinct from a file-load/parse crash, with pre-existing tests unaffected. `workflow.tdd_mode` is not set in this project's `.planning/config.json`, so the executor's stricter git-log-grep gate validation and `## TDD Gate Compliance` SUMMARY section are not mandated for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Code quality] Dropped a redundant type cast**
- **Found during:** post-Task-2 review of `stacks-dir.ts`
- **Issue:** `fields[separatorIndex + 1] as string` — `noUncheckedIndexedAccess` is not enabled in this project's `tsconfig.json`, so the indexed-access expression was already typed `string`; the cast added no narrowing and violated CLAUDE.md's "no unchecked casts without justification" spirit by existing without a documented reason.
- **Fix:** Removed the cast.
- **Files modified:** `server/src/lib/stacks-dir.ts`
- **Verification:** `tsc --noEmit` clean, all 32 tests in `stacks-dir.test.ts` still pass.
- **Commit:** `3718e3f`

---

**Total deviations:** 1 auto-fixed (1 code-quality cleanup, no behavior change).
**Impact on plan:** No scope creep — purely a type-cleanliness fix on the file this plan already touches, per CLAUDE.md's "refactor proactively when touching a module" guidance.

## Issues Encountered
- The `gsd_run check tdd-red-evidence` tool is built for Node's native test runner TAP output and does not parse vitest's `--reporter=tap` nested format — documented above under Decisions Made rather than treated as a blocker, since `workflow.tdd_mode` is not enabled for this project and the plan's own `<verify>` blocks specify `vitest run` (default reporter), not a TAP-based gate.
- The live positive-path and opt-out boot probes both intentionally run to their 90s `timeout` limit (exit code 124) once they reach the HTTP listener and background jobs — this is the expected outcome for "boot succeeded and kept running," not a failure. Each probe's log was checked for the specific evidence the plan's `<verify>` blocks require (a `schema-sync` line, or the persistence-check warning/error text) before considering the probe complete; the process was allowed to run to its timeout rather than killed early, and no stray process or scratch directory (`/dev/shm/docktor-mount-probe`, `server/.tmp-mountprobe`) was left behind afterward (confirmed via `ps aux` and directory listing).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 07's sole remaining plan (07-02, per `07-RESEARCH.md`'s reference to "plan 07-02's human checkpoint") can proceed — this plan closes the last silent-data-loss gap identified in the Docker-outside-of-Docker stacks-directory chain.
- Server unit suite (40 files, 632 passed, 2 todo) and `tsc --noEmit` are both green.
- Known environment limitation carried from STATE.md unaffected by this plan: `yarn workspace @docktor/server test:integration` still cannot be proven green on this host (documented TCP-to-Docker-published-port block since 05.1-01) — this plan added no integration test and touches no database code.
- A human on a real running container should still perform the plan's suggested `docker exec <container> cat /proc/self/mountinfo` sanity check to confirm the base64/format assumption holds inside the actual `node:22-slim` image (research Assumption A1) — not performed live in this session since it requires a running deployed container, consistent with prior phases' pattern of deferring live-container checks to a human/dedicated-host session.

## Self-Check: PASSED

- `[ -f server/src/lib/stacks-dir.ts ]` — FOUND
- `[ -f server/src/index.ts ]` — FOUND
- `[ -f server/test/unit/lib/stacks-dir.test.ts ]` — FOUND
- `[ -f docs/deployment.md ]` — FOUND
- `git log --oneline --all | grep -q f219cf9` — FOUND
- `git log --oneline --all | grep -q dcd6b30` — FOUND
- `git log --oneline --all | grep -q f3bbd21` — FOUND
- `git log --oneline --all | grep -q b92025a` — FOUND
- `git log --oneline --all | grep -q 9a35e24` — FOUND
- `git log --oneline --all | grep -q 3718e3f` — FOUND
- All plan-level `<verification>` re-run: unit suite green (40/40 files, 632 passed), `tsc --noEmit` clean, `git diff --name-only` from plan start lists exactly the 4 expected files.

---
*Phase: 07-release-hardening-data-safety-and-core-workflows*
*Completed: 2026-09-12*
