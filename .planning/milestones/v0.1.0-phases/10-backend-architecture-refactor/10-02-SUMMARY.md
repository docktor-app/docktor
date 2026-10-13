---
phase: 10-backend-architecture-refactor
plan: 02
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript]

# Dependency graph
requires: ["10-01"]
provides:
  - "server/src/application/ports/docker-executor-port.ts — DockerExecutorPort, the compiler-checked contract for docker-executor.ts"
  - "server/src/application/ports/stack-filesystem-port.ts — StackFilesystemPort, the compiler-checked contract for stack-filesystem.ts"
  - "server/src/application/ports/restic-executor-port.ts — ResticExecutorPort, the compiler-checked contract for restic-executor.ts"
  - "server/src/application/ports/dockerode-client-port.ts — DockerodeClientPort, the compiler-checked contract for dockerode-client.ts"
  - "Four infrastructure classes each carrying an `implements <Name>Port` clause, ready for 10-06/10-07 to switch consumers onto the port types"
affects: [10-06, 10-07]

# Actuals (#2632)
actuals:
  tokens: 2074
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named port interface under server/src/application/ports/, doc-commented with the 'why a port, not the concrete class' rationale, one file per interface — now five instances (SmtpClientPort from 10-01, plus the four added here)"
    - "Port lists a class's full public surface (not the subset one caller uses today); shared data shapes (ContainerStatus, RetentionPolicy, ResticSnapshot, BackupRepoConfig) are imported from their existing declaration site and re-exported from the port file, never redeclared"

key-files:
  created:
    - server/src/application/ports/docker-executor-port.ts
    - server/src/application/ports/stack-filesystem-port.ts
    - server/src/application/ports/restic-executor-port.ts
    - server/src/application/ports/dockerode-client-port.ts
  modified:
    - server/src/infrastructure/docker-executor.ts
    - server/src/infrastructure/stack-filesystem.ts
    - server/src/infrastructure/restic-executor.ts
    - server/src/infrastructure/dockerode-client.ts

key-decisions:
  - "DockerExecutorPort and ResticExecutorPort re-export their imported shared types (ContainerStatus; RetentionPolicy, ResticSnapshot, BackupRepoConfig, ResticRunResult) alongside the interface, matching the precedent SmtpClientPort set in 10-01 for SmtpConfig — a future consumer can import both the port and its associated data shapes from one file"
  - "DockerodeClientPort's method signatures use Dockerode's own ContainerInspectInfo/ContainerInfo types (type-only import of the dockerode package) rather than redeclaring narrower local shapes, since DockerodeClient's public methods already return those exact types unmodified"

requirements-completed: [D-07]

coverage:
  - id: D1
    description: "DockerExecutor, StackFilesystem, ResticExecutor and DockerodeClient each have a named port interface declared in server/src/application/ports/ (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "yarn typecheck — compiler verifies each of the four classes against its port"
        status: pass
      - kind: other
        ref: "ls server/src/application/ports/ — five files present (smtp-client-port.ts from 10-01, plus the four created here)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each concrete class declares implements <Name>Port, so the compiler rejects a class that drifts from its own published contract (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "grep -cE '^export class DockerExecutor implements DockerExecutorPort' docker-executor.ts -> 1; same pattern for StackFilesystem, ResticExecutor, DockerodeClient -> 1 each"
        status: pass
    human_judgment: false
  - id: D3
    description: "No runtime behaviour changes: no method body, argument list, spawn invocation or return shape edited by this plan"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "git diff on all four infrastructure files shows only an added import line and the modified class-declaration line"
        status: pass
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit — 48 test files, all passing, unchanged from 10-01's baseline"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 02: Infrastructure Port Interfaces (D-07) Summary

**DockerExecutor, StackFilesystem, ResticExecutor and DockerodeClient each now carry a named, compiler-enforced port interface under `server/src/application/ports/`, extending the `SmtpClientPort` convention 10-01 established — declaration only, zero behavioural change.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-23T11:09:10+02:00 (plan-head commit, after fast-forwarding the worktree onto feature/phase-10-backend-refactoring)
- **Completed:** 2026-09-23T11:21:26+02:00
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- Created `docker-executor-port.ts` (`DockerExecutorPort`, 9 members) and `stack-filesystem-port.ts` (`StackFilesystemPort`, 8 members), each importing rather than redeclaring shared shapes (`ContainerStatus`)
- Created `restic-executor-port.ts` (`ResticExecutorPort`, 9 members) and `dockerode-client-port.ts` (`DockerodeClientPort`, 5 members), reproducing exact signatures including optional parameters (`run`'s line-callback, `listContainers`'/`getLogStream`'s defaulted args) so no port quietly tightens a call site
- Added `implements <Name>Port` to all four infrastructure classes; verified via `git diff` that no method body, argv-building code, or spawn invocation changed in any of the four files
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (48 files) both exit zero after each task and at plan completion

## Task Commits

Each task was committed atomically:

1. **Task 1: Port interfaces for DockerExecutor and StackFilesystem** - `70bf92b` (feat)
2. **Task 2: Port interfaces for ResticExecutor and DockerodeClient** - `72395af` (feat)

_No TDD tasks in this plan — single commit per task, matching 10-01's precedent for declaration-only type-level work._

## Files Created/Modified
- `server/src/application/ports/docker-executor-port.ts` - `DockerExecutorPort`: `up`, `stop`, `restart`, `down`, `ps`, `composePull`, `pull`, `manifestInspect`, `imageDigest`; imports and re-exports `ContainerStatus` from `infrastructure/docker-executor.ts`
- `server/src/application/ports/stack-filesystem-port.ts` - `StackFilesystemPort`: `getStackDirectory`, `createDirectory`, `writeCompose`, `readCompose`, `writeEnv`, `readEnv`, `removeEnv`, `removeDirectory` — the class's full 8-member surface, not the 3-member subset `ProxyService` currently narrows to via `Pick<>`
- `server/src/application/ports/restic-executor-port.ts` - `ResticExecutorPort`: `run`, `buildBackupArgs`, `buildForgetArgs`, `buildRestoreArgs`, `buildInitArgs`, `snapshots`, `buildEnv`, `buildRepoUrl`, `checkVersion`; imports and re-exports `RetentionPolicy`, `ResticSnapshot`, `BackupRepoConfig`, `ResticRunResult` from `infrastructure/restic-executor.ts`
- `server/src/application/ports/dockerode-client-port.ts` - `DockerodeClientPort`: `getEventStream`, `inspectContainer`, `listContainers`, `getLogStream`, `getLogTail` — confirmed as the class's full public surface by grepping every consumer (`state-poller.ts`, `proxy-cert-poller.ts`, `routes/stacks.ts`, `application/proxy-service.ts`)
- `server/src/infrastructure/docker-executor.ts` - Added type-only import of `DockerExecutorPort`; `export class DockerExecutor implements DockerExecutorPort`
- `server/src/infrastructure/stack-filesystem.ts` - Added type-only import of `StackFilesystemPort`; `export class StackFilesystem implements StackFilesystemPort`
- `server/src/infrastructure/restic-executor.ts` - Added type-only import of `ResticExecutorPort`; `export class ResticExecutor implements ResticExecutorPort`
- `server/src/infrastructure/dockerode-client.ts` - Added type-only import of `DockerodeClientPort`; `export class DockerodeClient implements DockerodeClientPort` (the bottom-of-file lazily-initialising `Proxy` singleton's type argument is unchanged)

## Decisions Made
- Each port file re-exports the shared data shapes it imports (`ContainerStatus`; `RetentionPolicy`, `ResticSnapshot`, `BackupRepoConfig`, `ResticRunResult`), matching the precedent `SmtpClientPort` set for `SmtpConfig` in 10-01 — a future consumer switching to the port type can import both the interface and its associated shapes from one file.
- `DockerodeClientPort` uses `dockerode`'s own `ContainerInspectInfo`/`ContainerInfo` types directly (type-only import of the `dockerode` package) rather than declaring narrower local shapes, since the class's methods return those exact types unmodified — matching the plan's "import rather than restate" rule for any data shape.
- Two type-only circular imports exist by construction (`docker-executor.ts` imports `DockerExecutorPort` from its own port file, which imports `ContainerStatus` back from `docker-executor.ts`; same pattern for `restic-executor.ts`/`RetentionPolicy` et al.). Both are `import type`-only, erased at compile time with no runtime cycle, and `yarn typecheck` confirms TypeScript resolves them cleanly — this is the same shape the plan's own read-first instructions pointed at (`stack-service.ts`'s `StackEventReadRepo`, imported by the very file it types), so no deviation was needed.

## Deviations from Plan

None - plan executed exactly as written. Both tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1-4 deviation.

## Issues Encountered

**Worktree isolation gap (pre-existing infrastructure, not a plan deviation):** the spawned worktree branch (`worktree-agent-ac7533526be2eeb89`) was created from `main`'s tip (`242e645`), not from `feature/phase-10-backend-refactoring`'s HEAD (`555e043`) as the dispatch instructions stated — plan 10-01's commits and all `10-*-PLAN.md`/`10-CONTEXT.md` files were therefore initially absent from the worktree. Resolved with a fast-forward merge (`git merge --ff-only feature/phase-10-backend-refactoring`), safe because the worktree branch had zero unique commits and `242e645` is a direct ancestor of `555e043` (verified via `git merge-base --is-ancestor` before merging). No plan code was affected; this is an environment-setup note for the orchestrator, not a Rule 1-4 deviation against 10-02's own task list.

`yarn typecheck`/`yarn workspace @docktor/server test:unit` initially failed with `Cannot find module '../generated/prisma/enums.js'` across many unrelated files — the worktree's Prisma client had never been generated. Ran `npx prisma generate --schema=prisma/schema` (a read-only codegen step, not a package install) inside `server/`, which resolved all pre-existing errors unrelated to this plan's changes before any port work began.

## User Setup Required

None - no external service configuration required. (Note: `npx prisma generate` must be run in any fresh worktree/checkout before `yarn typecheck` succeeds — pre-existing project requirement, not introduced by this plan.)

## Next Phase Readiness
- All four D-07-named infrastructure dependencies now have a named, compiler-enforced port, alongside `SmtpClientPort` from 10-01 — five port files total under `server/src/application/ports/`.
- Consumers (`application/proxy-service.ts`'s `Pick<StackFilesystem, ...>`, `application/backup-service.ts`'s `BackupFilesystem`, `jobs/state-poller.ts`'s `Pick<DockerodeClient, ...>`, `jobs/proxy-cert-poller.ts`'s `Pick<DockerodeClient, ...>`, and every file importing the four concrete classes by type) are unchanged and still compile, since a class implementing an interface remains assignable to a parameter typed as the class. Switching those consumers onto the new port types is explicitly out of this plan's scope, deferred to 10-06 (application services) and 10-07 (jobs).
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (48 files) both exit zero on the full tree after both tasks.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 4 created port files and the 4 modified infrastructure files confirmed present on disk with the expected `implements` clauses; both task commits (`70bf92b`, `72395af`) confirmed present in git history via `git log`.
