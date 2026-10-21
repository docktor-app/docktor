---
phase: 18-import-and-migration-flow
plan: 19
subsystem: infra
tags: [migration, bind-mounts, own-mounts, preflight, validation, fail-closed]
requires:
  - phase: 18-import-and-migration-flow
    provides: MigrationService preflight/execute split, containerVisiblePaths, DockerSelfStack
provides:
  - OwnMountsPort / OwnMountsView and locateBindSource (host path to container-visible path, or a refusal)
  - DockerSelfStack implements OwnMountsPort from the same self inspect
  - copyDestinationViolations, VOLUME_NAME_PATTERN, BACKUP_DIR_NAME in the migration-target domain module
  - preflight plans bindCopies, preview returns emptySources, execute fails closed on a vanished source
affects: [18-verification gap 1, 18-21 client emptySources note, MIG-04, STK-03]
actuals:
  tokens: 14300
  tasks: 3
  commits: 6
plan_head_before: 6b0c7f79d3d9d22f5d2a54915427ad0fa59a16d2
plan_head_after: b8879b92091ca419cbb071dc024fbfb0bab4d32e
commits: 6
tech-stack:
  added: []
  patterns:
    - "Pure domain resolver returning a discriminated result (candidates | refused) instead of throwing"
    - "Plan-time resolution: preflight decides where each source is read from, execute re-verifies"
key-files:
  created:
    - server/src/domain/bind-mount-sources.ts
    - server/src/application/ports/own-mounts-port.ts
    - server/test/unit/domain/bind-mount-sources.test.ts
  modified:
    - server/src/infrastructure/docker-self-stack.ts
    - server/src/domain/migration-target.ts
    - server/src/application/migration-service.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/domain/migration-target.test.ts
    - server/test/unit/infrastructure/docker-self-stack.test.ts
key-decisions:
  - "A compose bind source is a HOST path: inside a container it is read only through Docktor's own bind mounts, never as the bare path (which would read Docktor's image filesystem)"
  - "Sources Docktor cannot see (not-visible, mounts-unknown, ~) are refused with a 400 naming the path in preflight and preview; only a visible-but-absent source becomes an empty directory and is listed in emptySources"
  - "A source that existed at preflight but is gone at execute fails the migration and rolls back (old stack restarted) instead of creating an empty directory"
  - "Every request-controlled path is validated in preflight (declared source, destination confinement, reserved names, collisions, volume-name charset); execute keeps assertWithin only as a backstop"
requirements-completed: []
status: complete
---

# Phase 18 Plan 19: Bind-mount source resolution and preflight path validation Summary

Converted bind-mount sources are now resolved through Docktor's own bind mounts (production: host `/` at `/host`), unreadable ones are refused before anything happens, and every request-controlled path is validated in preflight, closing 18-VERIFICATION gap 1 (review CR-03) and review WR-01.

## What was done

- **Task 1 (tracer):** `OwnMountsPort.ownMounts()` returns `host | container(mounts) | unknown` and never rejects; `DockerSelfStack` implements it from one shared private self-inspect (same timeout, `composeFilePaths()` behaviour and log text unchanged, new warning logs the error message only). `locateBindSource` (pure domain) reuses `containerVisiblePaths`, drops its leading identical-path entry and orders candidates inside the compose directory first. `MigrationPlan.bindCopies` records `{originalPath, newPath, sourcePath | null}`; `copyBindMounts` copies from the planned path. RED test commit preceded the fix.
- **Task 2:** `locateBindSource` gained the refusal variant (`not-visible`, `mounts-unknown`, `home-relative`) and `needsOwnMounts` (the port is called at most once per request, only when a converted selection needs it). Preflight and preview throw a `BadRequestError` naming the path; the preview returns `emptySources`; execute re-probes a planned source and throws "no longer exists; nothing was copied from it" so the existing rollback removes the new directory and restarts the old stack. The CR-01 EACCES test was rewritten for the new timing (preflight rejection, plus an execute-time variant).
- **Task 3:** `copyDestinationViolations` (+ moved `VOLUME_NAME_PATTERN`, `BACKUP_DIR_NAME`) rejects escaping, empty, NUL, stack-root (except the stack-directory mount), compose-file / `.env` / backup names, equal or nested destinations, bind-vs-named-volume collisions and invalid volume names. `MigrationService` takes a trailing `analyzer` parameter and refuses undeclared converted sources and unparsable compose files with a 400 before any side effect. The two CR-02 tests now assert a pre-stop 400.

## Verification

- `vitest run --project unit` over bind-mount-sources, migration-target, self-stack-paths, docker-self-stack, migration-service, onboarding-service, migration-operation-service, brownfield-routes and layering tests: 446 passed.
- `tsc --noEmit -p server/tsconfig.json`: clean (scoped; no full `tsc --build`, integration or Playwright run, per project memory).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Directory that is itself a bind-mount source was never matched**
- **Found during:** Task 2 (writing bind-mount-sources tests)
- **Issue:** `containerVisiblePaths` skips a mount whose source equals the path (`relative === ""`), so `/srv/media` mounted at `/media` would be refused as not visible although Docktor can read it at `/media`.
- **Fix:** `locateBindSource` adds the destinations of bind mounts whose source equals the declared path itself, without changing `containerVisiblePaths` (STK-03 behaviour untouched).
- **Files modified:** server/src/domain/bind-mount-sources.ts, server/test/unit/domain/bind-mount-sources.test.ts
- **Commit:** dca98f4

**2. [Rule 3 - Blocking] Existing test fixtures converted undeclared sources**
- **Found during:** Task 3
- **Issue:** the declared-source rule made `data`/`missing` selections and the shared `COMPOSE` fixture invalid (the analyzer only offers `./`, `/` and `~` prefixed sources).
- **Fix:** the shared fixture declares `./data`, `./missing`, `./present`; selections use the declared spelling; the in-place absolute-source test declares its source in long syntax; the UnifiedDiff test derives its rewritten compose from the fixture.
- **Files modified:** server/test/unit/application/migration-service.test.ts
- **Commit:** 423a8df

**3. Task 1 EACCES test rewrite pulled forward** from Task 2 into Task 1 so Task 1's verify command stays green (the probe moved into preflight there); the execute-time variant was added in Task 2 as planned.

## Known Stubs

None.

## Threat Flags

None. T-18-52 to T-18-56 mitigated as planned; T-18-57 (unauthenticated setup routes, WR-02) remains a deferred human decision.

## Notes for follow-up

- Preview response gained `emptySources: string[]`; the client note for it is plan 18-21.
- Server integration tests (`server/test/integration/imports.test.ts`) and Windows/macOS unit jobs run in CI only; the integration file converts no bind selections, so it is unaffected.

## Self-Check: PASSED

- server/src/domain/bind-mount-sources.ts, server/src/application/ports/own-mounts-port.ts, server/test/unit/domain/bind-mount-sources.test.ts: present
- Commits 471c5a3, d916a85, 6d94c02, dca98f4, 423a8df, b8879b9: present in HEAD history
