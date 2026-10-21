---
phase: 18-import-and-migration-flow
plan: 18
subsystem: infra
tags: [migration, cp, symlinks, volume-migrator, fidelity]
requires:
  - phase: 18-import-and-migration-flow
    provides: MigrationService copy steps (backup + converted bind mounts)
provides:
  - copyDirectory on archive-mode cp (ownership when root, modes, timestamps, verbatim symlinks)
  - merge semantics for an existing destination directory
  - documented VolumeMigratorPort copy contract
affects: [18-verification gap 2, MIG-03]
actuals:
  tokens: 3500
  tasks: 2
  commits: 4
plan_head_before: 982543643026551fed22fce8ebd00429c96a28eb
plan_head_after: 4a4bfb15f8b2f97c828fd860874cab8446a977bd
commits: 4
tech-stack:
  added: []
  patterns:
    - "Shared runCommand helper: argument-array child process, AppError with purpose, exit code and stderr"
key-files:
  created: []
  modified:
    - server/src/infrastructure/volume-migrator.ts
    - server/src/application/ports/volume-migrator-port.ts
    - server/test/unit/infrastructure/volume-migrator.test.ts
key-decisions:
  - "POSIX copies use cp -a -- <src> <dest>, or cp -a -- <src>/. <dest> when the destination directory already exists (merge, same idiom as the named-volume copy)"
  - "win32 keeps a tiny fs.cp fallback (verbatimSymlinks, preserveTimestamps) only so the Windows CI unit job passes; Docktor runs in a Linux container"
  - "A destination that exists but is not a directory (or a non-directory source onto an existing path) is refused without touching it"
requirements-completed: [MIG-03]
status: complete
---

# Phase 18 Plan 18: Faithful directory copy Summary

`VolumeMigrator.copyDirectory` now runs archive-mode `cp`, so the bind-mount data and the opt-in `pre-migration-backup/` copy keep ownership (when root), modes, timestamps and verbatim symlinks, closing review CR-01 / verification gap 2.

## What was done

- **Task 1 (tracer):** extracted a shared `runCommand` helper (argument array, no shell, `AppError` carrying purpose, exit code, trimmed stderr; spawn errors as "Failed to spawn <cmd>"). `copyVolumeToBindMount` moved onto it with identical arguments and the same "Volume copy failed (exit N): ..." wording. `copyDirectory` lstat-checks the source (ENOENT rejects unchanged), creates the parent, and runs `cp -a -- src dest`. RED test commit preceded the fix.
- **Task 2:** merge form `cp -a -- <src>/. <dest>` for an existing destination directory (no nesting), refusal of a non-directory destination, win32 `fs.cp` fallback, port JSDoc stating the contract. Tests added first (merge test was the failing one; the others already held after Task 1).

## Verification

- `vitest run --project unit` for `volume-migrator.test.ts` and `migration-service.test.ts`: 81 passed, 1 skipped (the root-only ownership test, since the executor runs as uid 1000; it runs when CI/containers run as root).
- Scoped `tsc --noEmit -p server/tsconfig.json`: exit 0. Full `tsc --build`, integration and Playwright were not run locally (project memory); CI covers them.

## Deviations from Plan

None - plan executed exactly as written. Note: `AppError` has no `cause` parameter, so command failures carry their cause in the message (exit code and stderr) as the plan specifies; lstat errors propagate unchanged with their errno code.

## Known Stubs

None.

## Threat Flags

None. T-18-49/50/51 mitigations implemented as planned (archive-mode cp, argument array with `--`, failure rejects with exit code and stderr).

## Commits

- 76cb2ca test(18-18): copyDirectory keeps relative symlinks and file modes (CR-01)
- c53f4d1 fix(18-18): copy bind-mount directories with archive-mode cp (CR-01)
- 8fc19ac test(18-18): copyDirectory merge, timestamps, ownership and failure cases (CR-01)
- 4a4bfb1 fix(18-18): merge into existing destinations and document the copy contract (CR-01)

## Self-Check: PASSED

- server/src/infrastructure/volume-migrator.ts, server/src/application/ports/volume-migrator-port.ts, server/test/unit/infrastructure/volume-migrator.test.ts: FOUND
- Commits 76cb2ca, c53f4d1, 8fc19ac, 4a4bfb1: FOUND
