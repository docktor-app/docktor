---
phase: 07-release-hardening-data-safety-and-core-workflows
verified: 2026-09-13T13:45:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-01-PLAN.md"
  - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-01-SUMMARY.md"
  - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-02-PLAN.md"
  - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-02-SUMMARY.md"
  - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-REVIEW.md"
  - ".planning/todos/completed/2026-09-03-stacks-dir-mount-point-not-verified.md"
  - "docs/deployment.md"
  - "server/src/index.ts"
  - "server/src/lib/stacks-dir.ts"
  - "server/test/unit/lib/stacks-dir.test.ts"
covered_digest: "v1:sha256:ac5b9917ebb28d4d6ec0548a69bd01de69db9973f96c6324391984516f0b99c9"
fingerprint_refresh:
  refreshed_at: "2026-09-20T00:00:00Z"
  reason: "Digest went stale: the covered todo file moved from todos/pending/ to todos/completed/ (its own resolution, not a regression), and server/src/index.ts + server/src/lib/stacks-dir.ts gained later, additive Windows-compatibility fixes (mountinfo POSIX-separator handling, Prisma migrate-deploy log wording) from Phase 09. No functional change to this phase's verified behavior; confirmed by diff review and a full unit test pass on main."
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Truth #2: 'When the resolved stacks directory is itself a mount point, or sits under a persistent (non-ephemeral) mount, the server boots exactly as it does today — no new error, no new warning.' Fixed by commit 7b38357: assertStacksDirIsMounted() now requires positive evidence of containerization (a /.dockerenv check, injectable as isContainerized) before treating 'root mount + DOCKTOR_STACKS_HOST_DIR set' as ephemeral. Re-ran the exact working-tree boot probe that previously failed (persistent ext2/ext3 root, DOCKTOR_STACKS_HOST_DIR set, this verifier's own environment has no /.dockerenv) — it now reaches schema-sync with zero persistence-error lines, instead of throwing."
  gaps_remaining: []
  regressions: []
---

# Phase 07: Release Hardening — Data Safety and Core Workflows Verification Report

**Phase Goal:** Close the pre-v1.0.0 bug that silently loses stack data on container recreation
**Verified:** 2026-09-13T13:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit 7b38357, following 07-VERIFICATION.md's prior `gaps_found` run at score 5/6)

## What Changed Since the Prior Verification

The prior verification (score 5/6) found that `assertStacksDirIsMounted()`'s
container-root heuristic (`entry.mountPoint === "/" && !!hostDir`) fired on
any bare "/" + `DOCKTOR_STACKS_HOST_DIR`-set combination, with no way to tell
a genuinely persistent bare-metal/VM root apart from a container's own
ephemeral writable layer. This could brick a working, persistent deployment
that simply has no dedicated mount under the stacks path — exactly the
layout this verifier's own environment has.

Commit `7b38357` ("fix(07): require positive containerization evidence
before treating container-root+HOST_DIR as ephemeral") adds an injectable
`isContainerized` parameter (default: check for `/.dockerenv`, the file
Docker creates inside every container) and ANDs it into the container-root
clause: `entry.mountPoint === "/" && !!hostDir && (await isContainerized())`.
The heuristic now only fires when the process can positively confirm it is
actually running inside a container.

This re-verification independently re-ran both the exact scenario that
previously failed (Truth #2) and the scenario that must not regress
(Truth #1 — real ephemeral storage must still be refused), rather than
trusting the commit message or SUMMARY narrative.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When the nearest mount covering the resolved stacks directory is ephemeral (overlay/overlayfs/tmpfs/ramfs), the server prints an error naming that path and exits non-zero before schema-sync and before any HTTP listener starts. | ✓ VERIFIED | Independently re-run against the post-fix code: `DOCKTOR_STACKS_DIR=/dev/shm/docktor-reverify-probe/stacks DOCKTOR_STACKS_HOST_DIR=/dev/shm/docktor-reverify-probe/stacks tsx src/index.ts` → exit 1, log contains `Error: Stacks directory at "/dev/shm/docktor-reverify-probe/stacks" is not on a persistent filesystem: the nearest covering mount ("/dev/shm") is of type "tmpfs"...`, zero `schema-sync` lines. **This confirms the fix did not re-open the original silent-data-loss bug** — a naive containerization gate could have accidentally weakened the tmpfs-type check itself, but the `EPHEMERAL_FILESYSTEM_TYPES.has(entry.filesystemType)` branch is untouched by the fix and fires independently of `isContainerized()`. Unit tests: `assertStacksDirIsMounted rejects ... when the covering entry's filesystem type is overlay` (passing, part of 33/33 suite). |
| 2 | When the resolved stacks directory is itself a mount point, or sits under a persistent (non-ephemeral) mount, the server boots exactly as it does today — no new error, no new warning. | ✓ VERIFIED (gap closed) | Independently re-ran the exact scenario that previously failed: `mkdir -p server/.tmp-mountprobe/stacks; DOCKTOR_STACKS_DIR=$PWD/server/.tmp-mountprobe/stacks DOCKTOR_STACKS_HOST_DIR=$PWD/server/.tmp-mountprobe/stacks tsx src/index.ts` (real ext2/ext3 working-tree root, confirmed via `stat -f -c %T .`; this verifier's shell has no `/.dockerenv`, confirmed via `ls /.dockerenv` → "No such file or directory"). Result: reaches `[schema-sync] skipped (DOCKTOR_DB_AUTO_PUSH=false)`, zero `is not on a persistent filesystem` lines. (Process later exits 1 on an unrelated `onReady` hook timeout caused by the deliberately-fake `DATABASE_URL` in this offline probe — this is downstream of and unrelated to the stacks-dir persistence check, which is the only thing this truth concerns.) |
| 3 | A mount point whose mountinfo path contains octal escapes (e.g. `\040` for a space) is matched against the resolved stacks path correctly. | ✓ VERIFIED | Unchanged by the fix. `findMountEntryForPath` unit tests: octal-escaped space (`\040`) and backslash (`\134`) both un-escape and match correctly; pure function, deterministic, fully exercised, still passing. |
| 4 | When `/proc/self/mountinfo` cannot be read, or no covering entry is found, the server warns once and continues — inability to verify never blocks a boot. | ✓ VERIFIED | Unchanged by the fix. Unit tests: reader-rejects branch and no-covering-entry branch both resolve without throwing and call `console.warn` exactly once. Code inspection confirms these branches are untouched by commit 7b38357. |
| 5 | An operator can set `DOCKTOR_STACKS_MOUNT_CHECK=false` to run on ephemeral storage deliberately, warning and continuing instead of throwing. | ✓ VERIFIED | Independently re-run against the post-fix code: `DOCKTOR_STACKS_MOUNT_CHECK=false DOCKTOR_STACKS_DIR=/dev/shm/docktor-reverify-optout/stacks DOCKTOR_STACKS_HOST_DIR=/dev/shm/docktor-reverify-optout/stacks tsx src/index.ts` → reaches `[schema-sync] skipped`, log contains `[stacks-dir] DOCKTOR_STACKS_MOUNT_CHECK=false — skipping the persistence check for "/dev/shm/docktor-reverify-optout/stacks"`. |
| 6 | The new check, its boot-refusal mode, and `DOCKTOR_STACKS_MOUNT_CHECK` are documented in `docs/deployment.md` next to the existing stacks-directory guidance. | ✓ VERIFIED | `docs/deployment.md`'s `## Stacks directory persistence` section (line 166) now accurately documents the fixed behavior: it explicitly names the `/.dockerenv` guard (line 191: "the process can positively confirm it is actually running inside a container (it checks for `/.dockerenv`..."), explains why the guard exists (line 197-202, restating the exact false-positive this re-verification closed), and the env-var table row and troubleshooting row 10 are unchanged and still accurate. Documentation and shipped code are consistent — re-read both side by side, no discrepancy found. |

**Score:** 6/6 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/lib/stacks-dir.ts` | exports `assertStacksDirIsMounted()` and `findMountEntryForPath()` | ✓ VERIFIED | Both exported, substantive (updated JSDoc explains the `isContainerized` rationale and cites this exact verification's prior gap by name), wired (imported and called from index.ts with default args, imported and exercised by 33 unit tests). New private `defaultIsContainerized()` helper reads real `/.dockerenv` via `access()`. |
| `server/src/index.ts` | calls `assertStacksDirIsMounted()` in boot try/catch after `ensureStacksDir()` | ✓ VERIFIED | Line 18: `await assertStacksDirIsMounted();` — unchanged call site, called with no arguments so it uses the real default readers (mountinfo + `/.dockerenv`). |
| `server/test/unit/lib/stacks-dir.test.ts` | describe blocks for both new functions, including a regression test for the fixed gap | ✓ VERIFIED | `assertStacksDirIsMounted` describe block now has a test explicitly named "resolves without throwing when the container's own root covers the path and DOCKTOR_STACKS_HOST_DIR is set, but the process is not actually containerized (07-VERIFICATION.md gap)" — the new regression test cited in the task brief. Full file re-run: 33/33 passing (was 32 before the fix). |
| `docs/deployment.md` | env-var row, persistence section, troubleshooting row | ✓ VERIFIED | All three present, updated to describe the `/.dockerenv` guard, internally consistent with the shipped code. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `server/src/index.ts` boot try/catch | `assertStacksDirIsMounted()` | ordered after `ensureStacksDir()`, before `syncDatabaseSchema()` | ✓ WIRED | Confirmed by direct code read of index.ts lines 15-22; unchanged by the fix. |
| `assertStacksDirIsMounted()` | `getStacksDir()` | single source of resolved path | ✓ WIRED | `const target = getStacksDir();` unchanged. |
| `assertStacksDirIsMounted()` | `defaultIsContainerized()` | second injectable parameter, defaults to a real `/.dockerenv` check | ✓ WIRED | `isContainerized: () => Promise<boolean> = defaultIsContainerized` — confirmed by code read (stacks-dir.ts lines 254-256) and by the unit test injecting `async () => true` / `async () => false` to exercise both branches independently of the real filesystem. |
| `findMountEntryForPath()` | mountinfo field index 4 / field after `-` separator | per man 5 proc | ✓ WIRED | Unchanged by the fix. |

### Behavioral Spot-Checks

All commands below were run independently by this verifier (not merely re-quoted from SUMMARY.md or the commit message), against the final committed code (commit 7b38357), from the repository root, in an environment confirmed to have no `/.dockerenv` (`ls /.dockerenv` → No such file or directory) and a real ext2/ext3 working-tree root (`stat -f -c %T .` → `ext2/ext3`; `/dev/shm` → `tmpfs`).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Ephemeral (tmpfs) stacks dir still refuses to boot (regression check) | `DOCKTOR_STACKS_DIR=/dev/shm/docktor-reverify-probe/stacks DOCKTOR_STACKS_HOST_DIR=/dev/shm/docktor-reverify-probe/stacks tsx src/index.ts` | exit 1, error names the resolved path and `tmpfs`, 0 `schema-sync` lines | ✓ PASS |
| Persistent working-tree stacks dir, `DOCKTOR_STACKS_HOST_DIR` also set (the exact scenario that previously failed) | `mkdir -p server/.tmp-mountprobe/stacks; DOCKTOR_STACKS_DIR=$PWD/server/.tmp-mountprobe/stacks DOCKTOR_STACKS_HOST_DIR=$PWD/server/.tmp-mountprobe/stacks tsx src/index.ts` | reaches `[schema-sync] skipped (DOCKTOR_DB_AUTO_PUSH=false)`, 0 `is not on a persistent filesystem` lines | ✓ PASS (gap closed) |
| `DOCKTOR_STACKS_MOUNT_CHECK=false` opt-out on tmpfs, `DOCKTOR_STACKS_HOST_DIR` also set | `DOCKTOR_STACKS_MOUNT_CHECK=false DOCKTOR_STACKS_DIR=/dev/shm/docktor-reverify-optout/stacks DOCKTOR_STACKS_HOST_DIR=/dev/shm/docktor-reverify-optout/stacks tsx src/index.ts` | reaches `[schema-sync] skipped`, warns naming `DOCKTOR_STACKS_MOUNT_CHECK` | ✓ PASS |
| Full `stacks-dir.test.ts` unit suite | `yarn workspace @docktor/server test test/unit/lib/stacks-dir.test.ts --run` | 33/33 passed (Test Files: 1 passed (1), Tests: 33 passed (33)) — was 32 before the fix, one new regression test added | ✓ PASS |
| `tsc --noEmit` | `yarn workspace @docktor/server tsc --noEmit` | zero output, exit 0 | ✓ PASS |

### Requirements Coverage

Unchanged from the prior verification: phase frontmatter (`requirements:`) reads `"n/a — this phase is scoped by the todo list below, not by REQUIREMENTS.md IDs"` for both 07-01-PLAN.md and 07-02-PLAN.md. `grep -n -i "phase 07\|07-release" .planning/REQUIREMENTS.md` returns no matches. The phase's actual scope contract is `.planning/todos/pending/2026-09-03-stacks-dir-mount-point-not-verified.md`, which the shipped (and now fixed) implementation satisfies.

### Anti-Patterns Found

None. Re-scanned all files modified by the fix commit (`server/src/lib/stacks-dir.ts`, `server/test/unit/lib/stacks-dir.test.ts`, `docs/deployment.md`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and informal stub phrasing — zero matches. `git status --porcelain` shows no `.env*` file was touched.

### Advisory (from 07-REVIEW.md, not blocking per this verification's scope)

Unresolved and unchanged since the prior verification — recorded as advisory context only, not gaps, per the original task instructions and re-confirmed to still be accurate against the current code:

- **WR-01**: `findMountEntryForPath`'s tie-break (`>` instead of `>=`) keeps the *first* of two identically-named mount entries rather than the last (mount-stacking edge case). Not independently reproduced in this re-verification; still advisory.
- **WR-02**: Raw `Error` thrown instead of the project's `lib/errors.ts` typed hierarchy, most consequential for `getStackPath()`.
- **IN-01 / IN-02**: Minor message-clarity and doc-accuracy nits.

Note: none of these advisory items concern the containerization-detection fix verified in this re-verification round; they are pre-existing and orthogonal.

## Gaps Summary

No gaps remain. The single regression identified in the prior verification round — a genuinely persistent bare-metal/VM root filesystem being wrongly rejected whenever `DOCKTOR_STACKS_HOST_DIR` is set — is closed by commit 7b38357's `/.dockerenv`-based containerization check. This re-verification independently reproduced both:

1. **The failure scenario itself** (persistent root + `DOCKTOR_STACKS_HOST_DIR` set, run outside any container) — now correctly boots past the persistence check, reaching schema-sync with no new error.
2. **The scenario that must never regress** (real ephemeral storage, tmpfs) — still correctly refused with the original error message and exit code, confirming the fix did not weaken or bypass the core ephemeral-filesystem-type detection that closes the phase's original silent-data-loss bug.

The full unit suite (33/33, up from 32/32 — one new regression test added naming this exact gap) and `tsc --noEmit` both pass. Documentation in `docs/deployment.md` was updated in the same commit and accurately describes the new `/.dockerenv` guard and its rationale. All 6 of the phase's must-have truths are now verified; the phase goal — closing the pre-v1.0.0 bug that silently loses stack data on container recreation, without introducing a new false-positive that bricks working deployments — is achieved.

---

_Verified: 2026-09-13T13:45:00Z_
_Verifier: Claude (gsd-verifier)_
