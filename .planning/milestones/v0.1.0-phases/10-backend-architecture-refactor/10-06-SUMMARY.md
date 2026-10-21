---
phase: 10-backend-architecture-refactor
plan: 06
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript, domain-extraction]

# Dependency graph
requires:
  - phase: 10-02
    provides: "The four core infrastructure port interfaces (DockerExecutorPort, StackFilesystemPort, ResticExecutorPort, DockerodeClientPort) this plan switches StackService/ProxyService/BackupService onto"
  - phase: 10-05
    provides: "The remaining six infrastructure port interfaces (CertificateFilesystemPort, RegistryClientPort, BrownfieldScannerPort, ComposeAnalyzerPort, ComposeRewriterPort, VolumeMigratorPort) this plan switches CertificateService/MigrationService onto, plus the layering fitness rule this plan's new domain modules must satisfy"
provides:
  - "Every application service (StackService, ProxyService, BackupService, CertificateService, MigrationService) now types its infrastructure dependencies as ports — no concrete class, no Pick<ConcreteClass, ...> infrastructure type remains anywhere in server/src/application/*.ts (D-07, PD-3 fully closed)"
  - "server/src/domain/proxy-idempotency.ts — decideDomainAssignment, resolveCertificateBinding, filterUnadoptedDomains: the pure decision rules behind ProxyService.assignDomain/adoptUnmanagedDomains (D-08)"
  - "server/src/domain/backup-retention-policy.ts — parseRetentionPolicy, DEFAULT_RETENTION_POLICY: the pure retention-policy parsing rule behind BackupService's scheduled forget/prune step (D-08)"
affects: [10-07, 10-08, 10-09, 10-10]

# Actuals (#2632)
actuals:
  tokens: 9004
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain modules that need a shared type declared in infrastructure/ import it from the corresponding application/ports/ file's re-export, not from infrastructure/ directly — keeps domain -> infrastructure/ out of the dependency graph so test/unit/architecture/layering.test.ts's 'domain layer stays pure' rule holds even though the underlying data shape's declaration site is unchanged (see backup-retention-policy.ts's RetentionPolicy import)"
    - "Extraction pattern for a service's inline decision logic (D-08): keep every effect (repository read/write, keyed lock, compose sync, rollback) in the service; move only the decide-or-refuse branch into a domain function taking plain data and returning a discriminated-union decision or throwing the same typed error with the same message text"
    - "MigrationService's default-argument DI style (constructor parameter defaults to a concrete singleton) is compatible with port-typed parameters — the parameter *type* narrows to the port while the *default value* stays the concrete instance, so production wiring and the composition root are untouched"

key-files:
  created:
    - server/src/domain/proxy-idempotency.ts
    - server/src/domain/backup-retention-policy.ts
    - server/test/unit/domain/proxy-idempotency.test.ts
    - server/test/unit/domain/backup-retention-policy.test.ts
  modified:
    - server/src/application/stack-service.ts
    - server/src/application/proxy-service.ts
    - server/src/application/backup-service.ts
    - server/src/application/certificate-service.ts
    - server/src/application/migration-service.ts
    - server/test/unit/application/backup-service.test.ts
    - server/test/unit/application/migration-service.test.ts

key-decisions:
  - "backup-retention-policy.ts imports RetentionPolicy from application/ports/restic-executor-port.ts's re-export rather than infrastructure/restic-executor.ts directly — a direct infrastructure/ import from domain/ would fail the existing layering.test.ts purity rule even though the plan's own acceptance-criteria grep for this file didn't check for it; routing through the port's already-established re-export (10-02's pattern) keeps RetentionPolicy's single declaration site unchanged while satisfying both the plan's intent and the fitness test"
  - "BackupService's getVolumeWarnings() dropped the readComposeFile?/readCompose? fallback chain and the getStackDirectory?. optional chain entirely rather than keeping a tolerant guard — grep confirmed readComposeFile was never implemented by any concrete class this service was ever constructed with (dead code, not a caller dependency), and StackFilesystemPort declares both remaining members as required"
  - "parseRetentionPolicy() hardens one provably-latent gap while relocating: a JSON value that parses successfully but is not an object (a number, string, or array) now also falls through to the defaults, instead of being returned as a malformed RetentionPolicy the way the pre-extraction code did — explicitly sanctioned by the plan's own action text ('harden only what is provably unreachable-today-but-latent')"
  - "A JSON object missing one of the three retention keys is returned as-is (not backfilled) — pinning the pre-extraction implementation's actual behavior (no per-key validation existed) rather than inventing a new rule, per the plan's explicit instruction"
  - "certificate-service.ts and proxy-service.test.ts needed zero test-file edits — both already used `as any`/`as unknown as` casts on their constructor doubles, so widening the parameter type from Pick<Concrete,...> to the full port interface is invisible to the test at compile time"
  - "migration-service.test.ts's constructor doubles were switched from casting to the four concrete infrastructure classes to casting to their *Port types, even though the concrete-class casts still compiled — this proves the changed seam actually accepts a plain-object port double, per the plan's 'add the smallest case that proves it' instruction for services with no direct seam coverage"

requirements-completed: ["D-01", "D-07", "D-08"]

coverage:
  - id: D1
    description: "No application service declares a dependency typed as a concrete infrastructure class, and none uses the Pick<ConcreteClass, ...> structural style where a port exists (D-07, PD-3)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "grep -rnE 'Pick<(StackFilesystem|DockerodeClient|DockerExecutor|ResticExecutor|CertificateFilesystem|ComposeRewriter|VolumeMigrator|BrownfieldScanner|ComposeAnalyzer|RegistryClient)' server/src/application/*.ts -> 0 matches"
        status: pass
      - kind: unit
        ref: "yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backup retention policy parsing lives in a pure domain module with no I/O, and BackupService calls it rather than embedding it (D-08)"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/backup-retention-policy.test.ts — 9 cases, all pass"
        status: pass
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts 'domain layer stays pure' — passes for backup-retention-policy.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The proxy domain-assignment decision rules (reuse/create + repoint, certificate binding, adoption filtering) live in a pure domain module ProxyService calls (D-08)"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/proxy-idempotency.test.ts — 11 cases, all pass"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/proxy-service.test.ts — 47 pre-existing assertions unmodified and passing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Extracted rules produce byte-identical outcomes to the inline code they replace, including the exact error type and message text a route surfaces to a client"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "port-conflict message and custom-source-without-id message asserted byte-identical in proxy-idempotency.test.ts (see Decisions Made below for the two exact strings, before and after)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every new domain module is free of imports from infrastructure, repositories, jobs and the database client"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts full run: 59/59 pass"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 06: Application-Layer Ports + Domain Extraction (D-07, D-08) Summary

**All five application services (StackService, ProxyService, BackupService, CertificateService, MigrationService) now type their infrastructure dependencies exclusively as ports, and the proxy domain-assignment rules plus the backup retention-policy parser moved out of their 452-line and 815-line services into two new pure, independently-tested `domain/` modules.**

## Performance

- **Duration:** ~2h wall-clock across two sessions (Task 1 in the first session; a rate-limit interruption occurred mid-Task-2, resumed and completed Tasks 2-3 in a follow-up session) — active working time was closer to 45 min
- **Started:** 2026-09-23T15:09:00+02:00 (after fast-forwarding the worktree onto feature/phase-10-backend-refactoring, `yarn install`, and `prisma generate`)
- **Completed:** 2026-09-23T20:32:27+02:00
- **Tasks:** 3
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments
- `StackService`/`ProxyService` constructor parameters switched from concrete classes / `Pick<StackFilesystem,...>` / `Pick<DockerodeClient,...>` to `StackFilesystemPort`/`DockerExecutorPort`/`DockerodeClientPort`
- Created `server/src/domain/proxy-idempotency.ts`: `decideDomainAssignment` (reuse-vs-create + sibling-repoint decision), `resolveCertificateBinding` (acme/custom normalization), `filterUnadoptedDomains` (adoption filtering) — all pure, all tested directly against plain object literals with no repository or mock
- `BackupService` constructor parameters switched from `ResticExecutor`/`DockerExecutor`/the locally-declared `BackupFilesystem` shape to `ResticExecutorPort`/`DockerExecutorPort`/`StackFilesystemPort`
- Created `server/src/domain/backup-retention-policy.ts`: `parseRetentionPolicy` (silent fallback to defaults preserved exactly as load-bearing behavior) + frozen `DEFAULT_RETENTION_POLICY` (7/4/12)
- `CertificateService`'s `Pick<CertificateFilesystem,...>` and `MigrationService`'s four concrete infrastructure parameter types (docker/migrator/rewriter/stackFs) all switched to their port types, while `MigrationService` keeps its default-argument DI style and concrete singleton defaults unchanged
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (53 files, 860 passed + 2 todo — up from 10-05's 838+2 baseline by the 20 new domain-module tests) both exit zero after every task and at plan completion
- `test/unit/architecture/layering.test.ts` (59/59) confirms both new domain modules satisfy the purity rule

## Task Commits

Each task was committed atomically:

1. **Task 1: StackService and ProxyService adopt ports; extract the proxy domain-assignment rules** - `023e487` (feat)
2. **Task 2: BackupService adopts ports; extract the retention policy rules** - `e790e25` (feat)
3. **Task 3: CertificateService and MigrationService adopt ports** - `4eb42ec` (feat)

_No TDD-flagged tasks required a separate RED/GREEN/REFACTOR commit split — each task's domain-module tests were authored alongside the extraction and committed together with it, matching 10-02/10-05's precedent for this phase's declaration-and-extraction-style work._

## Files Created/Modified
- `server/src/domain/proxy-idempotency.ts` - `decideDomainAssignment`, `resolveCertificateBinding`, `filterUnadoptedDomains`; imports only `BadRequestError` from `lib/errors.js`
- `server/src/domain/backup-retention-policy.ts` - `parseRetentionPolicy`, `DEFAULT_RETENTION_POLICY`; imports `RetentionPolicy` type from `application/ports/restic-executor-port.ts`'s re-export
- `server/test/unit/domain/proxy-idempotency.test.ts` - 11 cases covering every behavior bullet in Task 1's plan block
- `server/test/unit/domain/backup-retention-policy.test.ts` - 9 cases covering every behavior bullet in Task 2's plan block
- `server/src/application/stack-service.ts` - `fs`/`docker` constructor params: `StackFilesystemPort`/`DockerExecutorPort`
- `server/src/application/proxy-service.ts` - `fs`/`docker` constructor params: `StackFilesystemPort`/`DockerodeClientPort`; `assignDomain`/`adoptUnmanagedDomains` now call the domain module, keeping every effect in the service
- `server/src/application/backup-service.ts` - `resticExecutor`/`docker`/`filesystem` constructor params: `ResticExecutorPort`/`DockerExecutorPort`/`StackFilesystemPort`; `BackupFilesystem` interface deleted; `parseRetentionPolicy` private method deleted, single call site routed through the domain function; `getVolumeWarnings()` guard chain simplified
- `server/src/application/certificate-service.ts` - `fs` constructor param: `CertificateFilesystemPort`
- `server/src/application/migration-service.ts` - `docker`/`migrator`/`rewriter`/`stackFs` constructor param types: `DockerExecutorPort`/`VolumeMigratorPort`/`ComposeRewriterPort`/`StackFilesystemPort` (defaults unchanged)
- `server/test/unit/application/backup-service.test.ts` - `createMockStackFilesystem()`'s `readComposeFile` mock renamed to `readCompose`, matching the port and the simplified call site
- `server/test/unit/application/migration-service.test.ts` - constructor-double type imports and casts switched from the four concrete infrastructure classes to their `*Port` types

## Decisions Made

**Byte-identical error messages (D-08 requirement, recorded before/after per the plan's acceptance criteria):**
- Port conflict: `Service "${serviceName}" is already proxied on port ${conflictingPort.internalPort} — all domains for one service must share the same internal port` — unchanged, now thrown from `decideDomainAssignment` instead of inline in `assignDomain`.
- Custom source without id: `certificateId is required when certSource is custom` — unchanged, now thrown from `resolveCertificateBinding` instead of inline in `assignDomain`.

**Retention defaults (D-08 requirement, recorded before/after):** `{keepDaily: 7, keepWeekly: 4, keepMonthly: 12}` — identical in `domain/backup-retention-policy.ts`'s `DEFAULT_RETENTION_POLICY` to the object literal previously inline in `backup-service.ts`'s private `parseRetentionPolicy`.

**Surviving `infrastructure/` imports, recorded verbatim per Task 2's acceptance criteria:**
- `server/src/application/backup-service.ts:16` — `import {isRepositoryNotFoundError} from "../infrastructure/restic-executor.js"` — the one surviving line; a value import of a type guard, not a port member.

**Surviving `infrastructure/` import lines in `migration-service.ts`, recorded verbatim per Task 3's acceptance criteria (none import a concrete class as a parameter type — all four are value imports feeding a default argument):**
```
import {dockerExecutor} from "../infrastructure/docker-executor.js";
import {volumeMigrator} from "../infrastructure/volume-migrator.js";
import {composeRewriter, type VolumeSelection} from "../infrastructure/compose-rewriter.js";
import {StackFilesystem} from "../infrastructure/stack-filesystem.js";
```
`VOLUME_NAME_PATTERN`/`assertWithin` occurrence count: 5 before and after (untouched, per the plan's explicit prohibition).

**Repository parameters left untouched (D-07/PD-3 out-of-scope, per the plan's own text):** `ProxyService`'s `proxyRepo`/`stackRepo`/`certRepo`, `BackupService`'s `backupRepo`/`stackRepo`/`settings`, `CertificateService`'s `certRepo`, and `MigrationService`'s `stackRepo` all keep their existing repository/`Pick<XRepository,...>` types — `Pick<>` on a repository is a different question from D-07's infrastructure-port scope, and this plan didn't touch it.

**Domain -> infrastructure/ layering conflict, resolved by routing through the port's re-export:** the plan's action text for Task 2 says `RetentionPolicy` "keeps its declaration site in the restic module and is imported by the domain module," which read literally would mean `domain/backup-retention-policy.ts` importing directly from `infrastructure/restic-executor.ts`. That import would fail the pre-existing `test/unit/architecture/layering.test.ts` "domain layer stays pure — no Prisma, no infrastructure, no repositories" rule, which scans every file under `domain/` for any import path containing `/infrastructure/`, with no exemption for type-only imports. Since Task 1's proxy-idempotency.ts had no such need and Task 2's own acceptance-criteria grep for the domain file conspicuously omits `infrastructure/` from its forbidden-imports check (unlike Task 1's), this was read as tacit acknowledgment that the domain module needs a route around the direct infrastructure import — resolved by importing `RetentionPolicy` from `application/ports/restic-executor-port.ts`'s existing re-export (established by 10-02) instead. `RetentionPolicy`'s one declaration site is unchanged; the domain module never imports `infrastructure/` at all, satisfying both the plan's single-definition intent and the fitness test's purity rule. This is a Rule 3 (blocking-issue) auto-fix, not an architectural change — no new file, no new type, only a different import source for an already-established re-export.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Routed `backup-retention-policy.ts`'s `RetentionPolicy` import through the port re-export instead of `infrastructure/restic-executor.ts` directly**
- **Found during:** Task 2 (BackupService adopts ports; extract retention policy rules)
- **Issue:** A direct `domain/backup-retention-policy.ts -> infrastructure/restic-executor.ts` type-only import (as the plan's prose literally suggested) would fail `test/unit/architecture/layering.test.ts`'s pre-existing "domain layer stays pure" rule, which the plan's own `<verify>` block requires to pass.
- **Fix:** Imported `RetentionPolicy` from `application/ports/restic-executor-port.ts`'s existing re-export instead — same single declaration site, no domain -> infrastructure/ edge.
- **Files modified:** `server/src/domain/backup-retention-policy.ts`
- **Verification:** `test/unit/architecture/layering.test.ts` passes 59/59; `grep -cE '^\s*import .*(lib/db|repositories/|jobs/)' server/src/domain/backup-retention-policy.ts` -> 0 (Task 2's own acceptance criterion, unaffected by this fix).
- **Committed in:** `e790e25` (Task 2 commit)

**2. [Rule 1 - Bug/dead-code] Dropped the never-populated `readComposeFile` fallback in `BackupService.getVolumeWarnings()`**
- **Found during:** Task 2 (BackupService adopts ports)
- **Issue:** The locally-declared `BackupFilesystem` interface's `readComposeFile?` member had zero implementers among any concrete class this service was ever constructed with (`grep -rn "readComposeFile" server/src/` confirmed only the interface declaration and its one call site — dead code masquerading as a real fallback path).
- **Fix:** Simplified `getVolumeWarnings()` to call `this.filesystem.readCompose(stackId)` and `this.filesystem.getStackDirectory(stackId)` directly (both required on `StackFilesystemPort`), removing the optional-chaining guards.
- **Files modified:** `server/src/application/backup-service.ts`, `server/test/unit/application/backup-service.test.ts` (mock rename `readComposeFile` -> `readCompose`)
- **Verification:** `yarn workspace @docktor/server test:unit test/unit/application/backup-service.test.ts` — 85/85 pass; `yarn typecheck` — 0 errors.
- **Committed in:** `e790e25` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/layering-conflict, 1 bug/dead-code removal)
**Impact on plan:** Both were necessary to satisfy the plan's own `<verify>` block (layering test) and CLAUDE.md's "remove dead code; do not leave commented-out blocks" rule while touching the module. No scope creep — neither introduced a new file, type, or behavior beyond what the plan already specified.

## Issues Encountered

**Session interruption mid-Task-2 (infrastructure, not a plan deviation):** a session rate-limit interrupted execution after Task 1 was committed and Task 2's code changes (backup-retention-policy.ts, its test, and the backup-service.ts edits) were written but not yet committed. Resumed in a follow-up session: verified the branch was still on `worktree-agent-a1262306b0a98ef12` with Task 1's commit intact, re-ran the full Task-2 verification suite (typecheck, unit tests, layering test) before committing to confirm nothing had drifted, then committed Task 2 and proceeded through Task 3 without re-doing any completed work.

Fresh-worktree setup: `node_modules` was absent (`yarn install`, ~90s) and the Prisma client had never been generated (`npx prisma generate --schema=prisma/schema`) — same pre-existing per-worktree prerequisites 10-02/10-05 documented, not introduced by this plan.

## User Setup Required

None - no external service configuration required. (Same fresh-worktree prerequisites as prior plans in this phase: `yarn install` and `npx prisma generate` must be run once per fresh worktree/checkout before `yarn typecheck` succeeds.)

## Next Phase Readiness
- D-07 (infrastructure ports) is now closed across the entire application layer, not just the classes 10-02/10-05 named — every constructor in `server/src/application/*.ts` types its infrastructure dependencies as ports.
- D-08's `domain/` expansion now includes two new pure, independently-tested modules (`proxy-idempotency.ts`, `backup-retention-policy.ts`) alongside `stack-status-machine.ts`, `image-update-detection.ts`, `compose-config.ts`, `certificate-naming.ts`, `certificate-validation.ts`, and `events.ts`.
- `application/index.ts` (the composition root) was intentionally left untouched — it still instantiates concrete infrastructure classes by design (that's what a composition root does); no plan in this phase's scope changes that file's role.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (53 files, 860 passed + 2 todo) both exit zero on the full tree after all three tasks. `test/unit/architecture/layering.test.ts` (59/59) confirms both new domain modules and every existing layering rule still hold.
- Plan 10-07 (jobs) was noted by the dispatch instructions as executing concurrently in a separate worktree, touching only `server/src/jobs/*.ts` and its tests — disjoint from every file this plan touched; no coordination was needed and none occurred.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*
