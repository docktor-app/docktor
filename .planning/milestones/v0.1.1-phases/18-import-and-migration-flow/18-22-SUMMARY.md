---
phase: 18-import-and-migration-flow
plan: 22
subsystem: api
tags: [migration, directory-identity, bind-mounts, gap-closure, server]
requires:
  - phase: 18-import-and-migration-flow
    provides: OwnMountsPort/dockerSelfStack, classifyMigrationTarget, assertNotManaged, in-place migration (G-18-7)
provides:
  - DirectoryIdentity domain value (namespace-tagged spellings) with relateDirectories
  - DirectoryIdentityPort (identifyLocal, identifyLabel) and DirectoryIdentityResolver adapter
  - Identity-based classifyMigrationTarget and findManagingStack
  - In-place migration addressed through the writable stacks-folder spelling
affects: [18-25 (consumes identifyLabel), G-18-22-inplace, WR-10, MIG-02, MIG-03, MIG-04, STK-03]
actuals:
  tokens: 19500
  tasks: 3
  commits: 6
plan_head_before: 61d5d58065c9f3d186f009272535a4ca572760ac
plan_head_after: b159545212b125dd31eb4b6b3f312349194abe4d
commits: 6
tech-stack:
  added: []
  patterns:
    - "Value object over path strings: keys tagged host:/container: because the two namespaces overlap textually"
    - "Port + adapter with a cached, fail-safe mount view (unknown is never cached and never matches an alias)"
key-files:
  created:
    - server/src/domain/directory-identity.ts
    - server/src/application/ports/directory-identity-port.ts
    - server/src/infrastructure/directory-identity-resolver.ts
    - server/test/helpers/host-directory-identity.ts
    - server/test/unit/domain/directory-identity.test.ts
    - server/test/unit/infrastructure/directory-identity-resolver.test.ts
  modified:
    - server/src/domain/migration-target.ts
    - server/src/domain/managed-stack-paths.ts
    - server/src/domain/bind-mount-sources.ts
    - server/src/application/managed-stack-guard.ts
    - server/src/application/onboarding-service.ts
    - server/src/application/migration-service.ts
    - server/test/unit/domain/migration-target.test.ts
    - server/test/unit/domain/managed-stack-paths.test.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/application/onboarding-service.test.ts
key-decisions:
  - "Directory identity is a set of namespace-tagged keys (host:/container:) built from the spelling, fs.realpath and Docktor's own bind mounts; no hard-coded /host"
  - "An in-place original is addressed through the target (stacks-folder) spelling for stop, rename, copy, rollback and restart, because /host is mounted read-only"
  - "Unknown mounts degrade to identical-spelling matching only, so a separate target that exists is still refused (fail-safe)"
  - "The resolver caches the first known mount view for the process lifetime; an unknown or failing lookup is not cached"
  - "annotateManagedStacks was removed from the domain; scan annotation now lives in OnboardingService via managingStackOf"
requirements-completed: []
status: complete
---

# Phase 18 Plan 22: Canonical directory identity for migration and managed detection Summary

Migration and import now compare directories by identity (spelling, `fs.realpath`, Docktor's own bind mounts) instead of by path text, so a stack already in the stacks folder that the scan reached through `/host` previews and migrates in place (G-18-22-inplace), and a managed stack is recognised as "Already managed" and refused with 409 under any spelling (review WR-10).

## What was done

- **Task 1 (tracer):** `domain/directory-identity.ts` (new, pure) defines `DirectoryIdentity`, `hostPathsOfContainerPath`, `localDirectoryIdentity` and `relateDirectories` (`same` / `nested` / `unrelated`). `classifyMigrationTarget` now takes two identities. `DirectoryIdentityPort` plus `DirectoryIdentityResolver` supply them. `MigrationService.assessTarget` classifies by identity; for an in-place target it returns the target spelling as `originalDir` and rebuilds `composePath` under it, and preview, preflight, planCopies and the plan use that assessment, so stop, rename aside, copy, rollback and restart never touch the read-only `/host` view (T-18-64). A target nested with the original through any spelling is refused as overlapping (T-18-65).
- **Task 2:** `containerPathsOfHostPath` (extracted from `bind-mount-sources`, which now delegates to it) and `labelDirectoryIdentity` for compose-label paths; the resolver gained `identifyLabel`, realpath of the container candidates, a cached mount view (concurrent first calls share one lookup) and never rejects (T-18-67).
- **Task 3:** `managed-stack-paths` compares identities (`composeDirectoryOf`, `findManagingStack` over `IdentifiedManagedStack`); `managed-stack-guard` gained `identifyManagedStacks`, `managingStackOf` and the identity-based `assertNotManaged(stacks, directories, composePath)`. `OnboardingService` takes a trailing `directories` port, annotates scan rows through it and refuses adopt through it; `MigrationService` refuses migrate/preview through it (T-18-66).

## Verification

- Targeted unit run over domain, application, routes and architecture folders plus the new resolver test: 65 files, 1462 tests passed (includes layering test, bind-mount-sources regression net and brownfield-routes 409 contract).
- RED confirmed before each feature commit (missing modules, then 8 failing Task 2 cases, then 14 failing Task 3 cases).
- All task acceptance greps pass.
- Not run, per project memory: full `tsc --build`, integration tests (`imports.test.ts`), Windows/macOS unit jobs (CI). The new fixtures that mix POSIX mount destinations with host-native tmp paths or create symlinks use `skipIf(process.platform === "win32")`.
- Human re-test still required: 18-UAT.md test 10 (in-place migration of a stack in the stacks folder scanned through `/host`) and the managed-row check from 18-VERIFICATION.md human item 6.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Default service-test builders use `hostViewDirectories()` instead of a resolver over the shared own-mounts fake**
- **Found during:** Task 1 (test authoring)
- **Issue:** The plan asked the three existing `MigrationService` builders to pass a resolver built on the same own-mounts fake they already pass. The existing test "refuses a converted source the compose file does not declare" asserts `mockOwnMounts.ownMounts` is never called; a resolver on that fake would call it during target classification, breaking an existing test the plan says must stay unchanged.
- **Fix:** Those builders pass `hostViewDirectories()` (separate host-view fake, realpath stub). The new G-18-22 block uses a resolver over its own container-view fake, which is where the mount translation is actually proven.
- **Files modified:** server/test/unit/application/migration-service.test.ts
- **Commit:** 8058984

**2. [Rule 1 - Bug] Resolver treats an own-mounts adapter that throws as unknown mounts**
- **Found during:** Task 3 (brownfield-routes unit tests returned 500)
- **Issue:** `routes/brownfield-routes.test.ts` mocks `dockerSelfStack` with only `composeFilePaths`, so the production resolver default called a missing `ownMounts`, throwing a TypeError. The port promises never to reject, and the resolver is meant to be fail-safe.
- **Fix:** `lookUpView()` catches any failure and returns `{kind: "unknown"}` (not cached). Added a resolver test for it. Route tests are unchanged and green.
- **Files modified:** server/src/infrastructure/directory-identity-resolver.ts, server/test/unit/infrastructure/directory-identity-resolver.test.ts
- **Commit:** b159545

**3. [Rule 2 - Missing critical] `managingStackOf` ignores a bare file name**
- **Found during:** Task 3
- **Issue:** `composeDirectoryOf("docker-compose.yml")` is `""`; identifying it would `path.resolve` to the server's working directory and could wrongly match a stack.
- **Fix:** `managingStackOf` returns null for an empty directory (matches the old behaviour, where `""` matched nothing).
- **Files modified:** server/src/application/managed-stack-guard.ts
- **Commit:** b159545

**Total deviations:** 3 auto-fixed (1 blocking test-fixture choice, 1 bug, 1 missing safeguard). **Impact:** none on scope or the plan's must-haves.

### Process note

Commits were made on the orchestrator-assigned branch `worktree-bridge-cse_...`, which is not in the executor's `agent-*` branch allow-list (sequential mode on a named worktree); the protected-branch check (not main/master/develop/trunk/release) passed.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries; the resolver reads `fs.realpath` of paths already handled by the migration and import flows.

## Notes

- `identifyLabel` is built and tested but not yet consumed; plan 18-25 uses it for container-to-stack matching.
- Requirements were not marked complete; the phase has not been re-verified (same convention as 18-19..18-21).

## Self-Check: PASSED

- Created files exist (directory-identity.ts, directory-identity-port.ts, directory-identity-resolver.ts, host-directory-identity.ts, both new test files).
- Commits 8058984, 0facc06, 7cf1af9, 5162e99, 04f3e70, b159545 are ancestors of HEAD.
