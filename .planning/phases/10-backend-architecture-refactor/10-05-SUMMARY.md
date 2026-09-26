---
phase: 10-backend-architecture-refactor
plan: 05
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript, fitness-function]

# Dependency graph
requires:
  - phase: 10-02
    provides: "The port-interface convention (named port under application/ports/, `implements <Name>Port` clause on the concrete class, doc-comment rationale, import-not-restate for shared shapes) that this plan extends to the remaining six infrastructure classes"
provides:
  - "server/src/application/ports/certificate-filesystem-port.ts — CertificateFilesystemPort"
  - "server/src/application/ports/registry-client-port.ts — RegistryClientPort"
  - "server/src/application/ports/brownfield-scanner-port.ts — BrownfieldScannerPort"
  - "server/src/application/ports/compose-analyzer-port.ts — ComposeAnalyzerPort"
  - "server/src/application/ports/compose-rewriter-port.ts — ComposeRewriterPort"
  - "server/src/application/ports/volume-migrator-port.ts — VolumeMigratorPort"
  - "Every class under server/src/infrastructure/ now implements a named port — D-07 fully closed across the whole directory"
  - "An architecture fitness test case (layering.test.ts) that fails automatically if a future infrastructure class ships without a matching implements <Name>Port clause or names a port file that doesn't exist"
affects: [10-06, 10-07]

# Actuals (#2632)
actuals:
  tokens: 3803
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named port interface under server/src/application/ports/, doc-commented with the 'why a port, not the concrete class' rationale, one file per interface — now eleven instances (five from 10-01/10-02/10-03, six added here), covering every class under infrastructure/"
    - "Fitness-function enforcement: layering.test.ts reads every *.ts file under infrastructure/ from disk, derives the expected port file name from the implementing class's own `implements <Name>Port` clause (kebab-cased), and asserts the port file exists — a convention that previously depended on reviewer vigilance is now a compiler-adjacent test failure"
    - "Typed-error exemption: classes whose name ends in `Error` (e.g. RegistryUnavailableError) are excluded from the port-implements rule by name-suffix convention, matching the lib/errors.ts AppError hierarchy — they are caught by identity, not swapped via DI"

key-files:
  created:
    - server/src/application/ports/certificate-filesystem-port.ts
    - server/src/application/ports/registry-client-port.ts
    - server/src/application/ports/brownfield-scanner-port.ts
    - server/src/application/ports/compose-analyzer-port.ts
    - server/src/application/ports/compose-rewriter-port.ts
    - server/src/application/ports/volume-migrator-port.ts
  modified:
    - server/src/infrastructure/certificate-filesystem.ts
    - server/src/infrastructure/registry-client.ts
    - server/src/infrastructure/brownfield-scanner.ts
    - server/src/infrastructure/compose-analyzer.ts
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/infrastructure/volume-migrator.ts
    - server/test/unit/architecture/layering.test.ts

key-decisions:
  - "The fitness rule derives the expected port file name from the port name in the class's own `implements <Name>Port` clause (PascalCase -> kebab-case), not from the source file's name — this is what lets event-bus.ts's InMemoryEventBus (class name doesn't match the file name, added in 10-03) pass the same rule without a special case, since EventBusPort's own name still kebab-cases correctly to event-bus-port.ts"
  - "Classes whose name ends in `Error` are exempt from the port-implements rule by a name-suffix check, rather than an explicit allowlist of RegistryUnavailableError — this generalizes to any future typed error added alongside an infrastructure adapter without needing the fitness test edited again, consistent with T-10-17's mitigation and the plan's explicit prohibition on turning an error class into a port member"
  - "ComposeAnalyzerPort's extractNamedVolumes/extractBindMounts/extractInlineEnvVars keep their existing `doc: any` parameter type verbatim (matching the concrete class's exact current signature) rather than introducing a new parsed-YAML type as part of this declaration-only plan — narrowing that type is out of scope and would risk a behavior-adjacent signature change"

requirements-completed: ["D-01", "D-06", "D-07"]

coverage:
  - id: D1
    description: "CertificateFilesystem, RegistryClient, BrownfieldScanner, ComposeAnalyzer, ComposeRewriter and VolumeMigrator each have a named port interface declared in server/src/application/ports/ (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "yarn typecheck — compiler verifies each of the six classes against its port"
        status: pass
      - kind: other
        ref: "ls server/src/application/ports/ — eleven files present (five from 10-01/10-02/10-03, plus the six created here)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each concrete class declares implements <Name>Port, so the compiler rejects a class that drifts from its own published contract (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "grep -cE '^export class CertificateFilesystem implements CertificateFilesystemPort' certificate-filesystem.ts -> 1; same pattern for RegistryClient, BrownfieldScanner, ComposeAnalyzer, ComposeRewriter, VolumeMigrator -> 1 each"
        status: pass
    human_judgment: false
  - id: D3
    description: "No runtime behaviour changes: no method body, argument list, spawn invocation, HTTP call or return shape edited by this plan"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "git diff on all six infrastructure files shows only an added import line and the modified class-declaration line"
        status: pass
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -- 51 test files, 838 passed + 2 todo (unchanged from pre-plan baseline)"
        status: pass
  - id: D4
    description: "An automated test fails if a new class is added under server/src/infrastructure/ without a matching implements <Name>Port clause, so the convention holds without review vigilance (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts 'every infrastructure class implements a named port (D-07, 10-05)' — 57/57 tests pass on the real tree; live-confirmed once locally by temporarily removing VolumeMigrator's implements clause (test failed with a self-diagnosing message), then reverting"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 05: Infrastructure Port Interfaces, Part 2 + Fitness Rule (D-07) Summary

**The remaining six infrastructure classes (CertificateFilesystem, RegistryClient, BrownfieldScanner, ComposeAnalyzer, ComposeRewriter, VolumeMigrator) now each implement a named, compiler-checked port, and a new architecture fitness test case fails automatically if any future infrastructure class ships without one — D-07 is closed across the whole directory, not just the four classes plan 10-02 named.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-23T14:50:00+02:00 (after fast-forwarding the worktree onto feature/phase-10-backend-refactoring and installing dependencies)
- **Completed:** 2026-09-23T15:02:00+02:00
- **Tasks:** 3
- **Files modified:** 13 (6 created, 7 modified)

## Accomplishments
- Created `certificate-filesystem-port.ts` (`CertificateFilesystemPort`, 3 members) and `registry-client-port.ts` (`RegistryClientPort`, 1 member — `listTags`; `RegistryUnavailableError` deliberately excluded and left exported from `registry-client.ts` unchanged)
- Created `brownfield-scanner-port.ts` (`BrownfieldScannerPort`, 1 member — `scan`) and `compose-analyzer-port.ts` (`ComposeAnalyzerPort`, 4 members), the latter re-exporting `AnalysisResult`/`BindMountInfo` rather than redeclaring them
- Created `compose-rewriter-port.ts` (`ComposeRewriterPort`, 2 members), importing `VolumeSelection`/`RewriteResult` from their existing declaration site (still consumed unchanged by `application/migration-service.ts`), and `volume-migrator-port.ts` (`VolumeMigratorPort`, 2 members)
- Added `implements <Name>Port` to all six infrastructure classes; verified via `git diff` on every file that only an import line and the class-declaration line changed — no method body, spawn invocation, or YAML/path-handling logic touched
- Appended a new fitness-rule case to `layering.test.ts`: for every `*.ts` file under `server/src/infrastructure/`, every exported class (except typed `*Error` subclasses) must have a line-anchored `implements <Name>Port` clause, and the referenced port file must exist under `application/ports/`. Live-confirmed the rule actually fails by temporarily stripping `VolumeMigrator`'s implements clause, observing the test fail with a self-diagnosing message, then reverting.
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (51 files, 838 passed + 2 todo) both exit zero after every task and at plan completion — same counts as the pre-plan baseline

## Task Commits

Each task was committed atomically:

1. **Task 1: Ports for CertificateFilesystem and RegistryClient** - `9731118` (feat)
2. **Task 2: Ports for BrownfieldScanner and ComposeAnalyzer** - `7294588` (feat)
3. **Task 3: Ports for ComposeRewriter and VolumeMigrator, plus the infrastructure-port fitness rule** - `1486bd3` (feat)

_No TDD tasks in this plan — single commit per task, matching 10-02's precedent for declaration-only type-level work._

## Files Created/Modified
- `server/src/application/ports/certificate-filesystem-port.ts` - `CertificateFilesystemPort`: `getCertsDir`, `writeCertificateFiles`, `removeCertificateFiles`; imports and re-exports `CertificateFileContent`
- `server/src/application/ports/registry-client-port.ts` - `RegistryClientPort`: `listTags` — the class's full 1-member public surface (every other method is private); `RegistryUnavailableError` intentionally not referenced
- `server/src/application/ports/brownfield-scanner-port.ts` - `BrownfieldScannerPort`: `scan` — the class's full public surface; imports and re-exports `ScanResult`
- `server/src/application/ports/compose-analyzer-port.ts` - `ComposeAnalyzerPort`: `analyzeCompatibility`, `extractNamedVolumes`, `extractBindMounts`, `extractInlineEnvVars` — `detectUnsupportedFeatures`/`parseVolumeEntry` stay private and out of the port; imports and re-exports `AnalysisResult`, `BindMountInfo`
- `server/src/application/ports/compose-rewriter-port.ts` - `ComposeRewriterPort`: `rewrite`, `generateDiff`; imports and re-exports `VolumeSelection`, `RewriteResult` from `infrastructure/compose-rewriter.ts`
- `server/src/application/ports/volume-migrator-port.ts` - `VolumeMigratorPort`: `copyVolumeToBindMount`, `copyDirectory` — the class's full 2-member public surface
- `server/src/infrastructure/certificate-filesystem.ts` - Added type-only import of `CertificateFilesystemPort`; `export class CertificateFilesystem implements CertificateFilesystemPort`
- `server/src/infrastructure/registry-client.ts` - Added type-only import of `RegistryClientPort`; `export class RegistryClient implements RegistryClientPort` (`RegistryUnavailableError` unchanged)
- `server/src/infrastructure/brownfield-scanner.ts` - Added type-only import of `BrownfieldScannerPort`; `export class BrownfieldScanner implements BrownfieldScannerPort`
- `server/src/infrastructure/compose-analyzer.ts` - Added type-only import of `ComposeAnalyzerPort`; `export class ComposeAnalyzer implements ComposeAnalyzerPort`
- `server/src/infrastructure/compose-rewriter.ts` - Added type-only import of `ComposeRewriterPort`; `export class ComposeRewriter implements ComposeRewriterPort`
- `server/src/infrastructure/volume-migrator.ts` - Added type-only import of `VolumeMigratorPort`; `export class VolumeMigrator implements VolumeMigratorPort`
- `server/test/unit/architecture/layering.test.ts` - New `describe` case "every infrastructure class implements a named port (D-07, 10-05)": reads every `infrastructure/*.ts` file from disk, asserts each declares at least one exported class, and for every non-`*Error` exported class asserts a line-anchored `implements <Name>Port` clause exists and the corresponding kebab-cased port file exists under `application/ports/`

## Decisions Made
- The fitness rule derives the expected port file name from the class's own `implements <Name>Port` clause (kebab-cased via a simple lowercase-boundary regex), not from the source file's name. This is deliberately robust to `event-bus.ts`'s `InMemoryEventBus` (added in 10-03), whose class name doesn't match its file name — `EventBusPort` still kebab-cases correctly to `event-bus-port.ts`, so no special case was needed for a file this plan doesn't otherwise touch.
- Classes whose name ends in `Error` (currently only `RegistryUnavailableError`) are exempted from the port-implements requirement by a generic name-suffix check rather than an explicit allowlist — generalizes automatically to any future typed error co-located with an infrastructure adapter, consistent with the plan's explicit prohibition on turning an error class into a port member (T-10-17).
- `ComposeAnalyzerPort`'s three `doc: any`-typed extraction methods keep that exact parameter type rather than introducing a stronger parsed-YAML type — this plan is declaration-only per its own acceptance criteria ("no method body... changed"), and narrowing a signature type is exactly the kind of "tidying" the plan explicitly forbids doing while interfacing a class.

## Deviations from Plan

None — plan executed exactly as written. All three tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1-4 deviation.

## Issues Encountered

**Worktree isolation gap (pre-existing infrastructure, not a plan deviation):** the spawned worktree branch (`worktree-agent-afa2bbe704d3ca3d1`) was created from a stale point on `main` predating plans 10-01 through 10-04, not from `feature/phase-10-backend-refactoring`'s current HEAD, matching the same gap 10-02 and 10-03 documented. Resolved with `git merge --ff-only feature/phase-10-backend-refactoring`, safe because the worktree branch had zero unique commits (verified via `git merge-base --is-ancestor` both directions before merging).

`node_modules` was absent in this fresh worktree (`yarn typecheck` failed with "Couldn't find the node_modules state file") and the Prisma client had never been generated (would have failed with `Cannot find module '../generated/prisma/enums.js'`, per 10-02's precedent). Ran `yarn install` (~65s) and `npx prisma generate --schema=prisma/schema` (read-only codegen, not a package install) before any port work began; both are pre-existing per-worktree setup requirements, not introduced by this plan.

## User Setup Required

None - no external service configuration required. (Same fresh-worktree prerequisites as 10-02: `yarn install` and `npx prisma generate` must be run once per fresh worktree/checkout before `yarn typecheck` succeeds.)

## Next Phase Readiness
- Every class under `server/src/infrastructure/` (12 files) now implements a named, compiler-enforced port — eleven port files total under `server/src/application/ports/` (five from 10-01/10-02/10-03, six added here). D-07 is fully closed, not just the four classes plan 10-02 named.
- The new architecture fitness rule means this convention can no longer silently regress — a future infrastructure class added without a port fails `yarn workspace @docktor/server test:unit test/unit/architecture/layering.test.ts` immediately, with a message naming the offending file and class.
- Consumers of all six classes (`application/certificate-service.ts`, `jobs/update-checker.ts`, route files importing `BrownfieldScanner`, `application/migration-service.ts`, etc.) are unchanged and still compile, since a class implementing an interface remains assignable to a parameter typed as the class. Switching those consumers onto the port types is explicitly out of this plan's scope, deferred to 10-06 (application services) and 10-07 (jobs), matching 10-02's precedent.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (51 files, 838 passed + 2 todo) both exit zero on the full tree after all three tasks.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 6 created port files and the 6 modified infrastructure files confirmed present on disk with the expected `implements` clauses; the layering.test.ts fitness-rule addition confirmed present and passing (57/57); all three task commits (`9731118`, `7294588`, `1486bd3`) confirmed present in git history via `git log`.
