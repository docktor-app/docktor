---
phase: 10-backend-architecture-refactor
plan: 14
subsystem: backend-architecture
tags: [dead-code-audit, cleanup, typescript, architecture-fitness, update-checker]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "10-11's bus/broadcaster subscriber migration (which deliberately left triggerUpdate() on the old broadcaster path, naming this plan as where it's removed) and 10-13's completed D-15 close-out (StackEvent audit trail), which made this the phase's final implementation wave — the dead-code audit runs last on purpose so it measures a tree the other waves have already finished rewriting"
provides:
  - "server/src/jobs/update-checker.ts with no unreachable code: triggerUpdate(), its StateBroadcaster field/import/constructor param, and the update_error cast are gone (D-03)"
  - "server/src/services/ removed from the repository and the working tree, with a layering fitness rule that fails and names the offending file if a source file ever appears under a services/ directory again (D-11)"
  - "A dedicated three-scan dead-code audit across server/src, its findings table, and the disposition each finding received (D-03)"
affects: [10-15]

# Actuals (#2632)
actuals:
  tokens: 4057
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dead-code audit protocol (D-03): three tooling-only scans (tsc --noUnusedLocals/--noUnusedParameters as a one-off CLI flag, not a tsconfig change; a git-grep-based exports-only-used-locally scan; a git-grep-based unimported-dependency scan), each finding routed through one of five fixed disposition rules (delete a zero-reference runtime value; de-export a type/interface used only within its own file; underscore-prefix an interface-required unused parameter; delete an unused import/local; record-and-leave a false positive or an out-of-scope finding) — never an ad hoc per-finding judgment call"

key-files:
  created: []
  modified:
    - server/src/jobs/update-checker.ts
    - server/test/unit/jobs/update-checker.test.ts
    - server/src/services/.gitkeep (deleted)
    - server/test/unit/architecture/layering.test.ts
    - server/src/application/notification-service.ts
    - server/src/infrastructure/brownfield-scanner.ts
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/infrastructure/restic-executor.ts
    - server/src/infrastructure/volume-migrator.ts

key-decisions:
  - "Scan B (exports nothing outside their own file references) returned ~75 findings across ~30 files, but this plan's frontmatter files_modified list declares only 9 files. Rather than editing ~25 files the plan never scoped, only the ~10 findings that fell inside the plan's own declared files were acted on (de-exported or, for one genuinely dead function, deleted); the remaining ~65 are recorded in the findings table below with disposition 'left in place — outside this plan's declared file scope,' consistent with the plan's own closing text that Scan B and Scan C 'legitimately end non-empty' and are resolved 'by recording rather than by deleting.'"
  - "server/src/application/index.ts's disposeDomainSubscribers (a Scan B zero-external-reference finding) was left in place and NOT touched, even though it sits outside the plan's file scope anyway: its own in-file comment ('Exported so a test can tear it down') documents deliberate intent from the immediately preceding plan (10-13), and 10-13's own acceptance criteria required its existence as 'the one exported disposer.' Recorded with that reasoning rather than a bare 'out of scope' note, since the justification is stronger than scope alone."
  - "detectRegistry() in update-checker.ts was deleted outright, not de-exported: unlike every other update-checker.ts Scan B finding (which are used internally, just not externally), detectRegistry had zero references anywhere in the file, including its own body — confirmed via the pre-existing lcov coverage report (FNDA:0, 0% function coverage). This is the same defect class Task 1's triggerUpdate() deletion targets, found by a different scan."
  - "Task 1's deletion of triggerUpdate() stranded the StateBroadcaster field, its two imports (StateBroadcaster type, stateEventBroadcaster value), and the constructor's 5th parameter — none had any other caller once triggerUpdate() was gone (grep-confirmed). All four removed in the same commit and named here per the plan's own acceptance criteria."

patterns-established:
  - "Dead-code audit scope discipline: when a workspace-wide scan surfaces findings outside a plan's declared files_modified list, record every finding in the table but only edit files the plan actually owns — cross-cutting audits get their completeness from the table, not from touching every file a grep happens to name."

requirements-completed: ["D-03", "D-11"]

coverage:
  - id: D1
    description: "The unreachable triggerUpdate() method, its StateBroadcaster field/imports/constructor param, the update_error unchecked cast, and the test block that was its only consumer are all gone from update-checker.ts and its test file (D-03)"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/update-checker.test.ts (37 tests, all pre-existing assertions unedited)"
        status: pass
      - kind: other
        ref: "git grep -lw triggerUpdate -- server/src server/test -> status=1 (no match); git grep -lw update_error -- server/src server/test -> status=1 (no match); grep -c 'as any' server/src/jobs/update-checker.ts -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "server/src/services/ is gone from the repository and the working tree; a layering fitness rule fails and names the offending file if a source file appears under a services/ directory again (D-11)"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts (89 tests, incl. the new 'no source file lives under a services directory' rule)"
        status: pass
      - kind: other
        ref: "git ls-files -- server/src/services -> status=0 len=0; test -e server/src/services -> non-zero (absent); locally verified the new rule fails and names server/src/services/probe.ts when the directory is recreated with a file, then reverted before committing"
        status: pass
    human_judgment: false
  - id: D3
    description: "A dedicated three-scan dead-code audit ran across server/src (unused declarations/params/imports; exports used only locally; unimported declared dependencies), every finding recorded in a table with a disposition drawn from the plan's fixed rules, and Scan A passes clean after acting (D-03)"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server exec tsc --noEmit --noUnusedLocals --noUnusedParameters --composite false --declaration false --declarationMap false -p tsconfig.json -> exits zero, no TS6133/TS6192/TS6196; yarn workspace @docktor/server test:unit -> 58 files, 997 passed + 2 todo; yarn typecheck -> 0 errors"
        status: pass
      - kind: other
        ref: "git diff --name-only -- server/src/generated -> status=0 len=0 (untouched); git diff --name-only -- server/tsconfig.json -> empty (untouched)"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min
completed: 2026-09-24
status: complete
---

# Phase 10 Plan 14: Dead-Code Audit and Dead-Directory Removal Summary

**Deletes the unreachable `triggerUpdate()` method and its `as any` cast from the update checker, removes the leftover `server/src/services/` directory with a fitness rule to keep it gone, and runs D-03's dedicated three-scan dead-code audit across the server workspace — 8 Scan A findings resolved, 10 in-scope Scan B findings resolved, ~65 out-of-scope Scan B findings and 0 Scan C findings recorded.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-24T00:00:00Z (session-relative; interrupted once by a session rate-limit between Task 2's commit and Task 3's edits, resumed from the in-progress working tree)
- **Tasks:** 3
- **Files modified:** 9 (across the 3 task commits)

## Accomplishments

- `server/src/jobs/update-checker.ts`'s unreachable `triggerUpdate()` method is gone, along with the `StateBroadcaster` field it was the sole user of, that field's two imports, the constructor's 5th parameter, and the `as any`-cast `update_error` frame that never existed in the live-state union. The corresponding test block (3 cases, reached through a cast on the instance, two asserting status transitions never implemented) is gone too — not salvaged, per the plan's own instruction not to convert dead code into a dead test with a live name.
- `server/src/services/` (a `.gitkeep`-only leftover from before the current `application/`+`repositories/` split) is removed from the repository and the working tree. `server/test/unit/architecture/layering.test.ts` gains a rule that fails and names the offending file if a source file ever appears under a `services/` directory in `server/src/` again — verified locally to fail-and-name before being reverted and committed clean.
- A dedicated three-scan dead-code audit ran across `server/src/` (Scan A: `tsc --noUnusedLocals --noUnusedParameters`, one-off CLI invocation, `tsconfig.json` untouched; Scan B: exports referenced nowhere outside their own file; Scan C: declared dependencies nothing imports). Scan A's 8 findings and the 10 Scan B findings that fell inside this plan's declared file scope were all resolved per the plan's fixed disposition rules; the full table (including the ~65 out-of-scope Scan B rows, recorded not acted on) is below.
- `yarn workspace @docktor/server exec tsc --noEmit --noUnusedLocals --noUnusedParameters ...` exits zero with no `TS6133`/`TS6192`/`TS6196` diagnostics. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (58 files, 997 passed + 2 todo) both exit zero. `server/src/generated/` and `server/tsconfig.json` are both untouched (confirmed by `git diff --name-only`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete the unreachable update-trigger method, its cast and its test** - `76675bd` (fix)
2. **Task 2: Delete the dead services directory and keep it deleted** - `22a2ae3` (chore)
3. **Task 3: Run the dedicated dead-code audit across the server workspace and act on it** - `1c73091` (chore)

None of the three tasks carried `tdd="true"`.

## Files Created/Modified

- `server/src/jobs/update-checker.ts` - Deletes `triggerUpdate()`, the `StateBroadcaster` field/imports/constructor param it alone used; also (Task 3) deletes the unused `stackRepository` destructured binding and its now-pointless dynamic import of `stack-repository.js`, deletes the genuinely dead `detectRegistry()` function, and de-exports six symbols (`normalizeImageRef`, `parseDateTag`, `CompareResult`, `CompareOptions`, `ImageUpdateCheckRecord`, `UpdateCheckerRepo`) confirmed used only within the file
- `server/test/unit/jobs/update-checker.test.ts` - Deletes `createMockBroadcaster()`, its declaration/instantiation/constructor-arg wiring, and the entire `triggerUpdate() (UPD-04)` describe block (3 cases)
- `server/src/services/.gitkeep` - Deleted (D-11); the directory no longer exists in the working tree
- `server/test/unit/architecture/layering.test.ts` - Adds a new describe block ("no source file lives under a 'services' directory") asserting no `.ts` file under `server/src/` sits inside a directory named `services`
- `server/src/application/notification-service.ts` - Deletes the unused `decrypt` import; de-exports `SmtpTestConfig` and `NotificationSettings` (used only within the file)
- `server/src/infrastructure/brownfield-scanner.ts` - Deletes the unused `AnalysisResult` type import; de-exports `DiscoveredStack` (used only within the file)
- `server/src/infrastructure/compose-rewriter.ts` - Deletes two unused destructured locals (`serviceName`, `volDef`) by omitting their tuple position in a `for...of` loop
- `server/src/infrastructure/restic-executor.ts` - Underscore-prefixes two parameters (`stackPath` -> `_stackPath`, `targetPath` -> `_targetPath`) required by `ResticExecutorPort` but unused in their implementations
- `server/src/infrastructure/volume-migrator.ts` - Deletes the unused `path` import

## Dead-Code Audit Findings

### Scan A — unused declarations, parameters, and imports

`yarn workspace @docktor/server exec tsc --noEmit --noUnusedLocals --noUnusedParameters --composite false --declaration false --declarationMap false -p tsconfig.json` (one-off CLI invocation; `server/tsconfig.json` never modified)

| # | File | Symbol | Disposition | Rule |
|---|------|--------|-------------|------|
| A1 | `application/notification-service.ts` | `decrypt` import | Deleted | Unused import |
| A2 | `infrastructure/brownfield-scanner.ts` | `AnalysisResult` type import | Deleted | Unused import |
| A3 | `infrastructure/compose-rewriter.ts:40` | `serviceName` (destructured local) | Deleted (tuple position omitted) | Unused local |
| A4 | `infrastructure/compose-rewriter.ts:115` | `volDef` (destructured local) | Deleted (tuple position omitted) | Unused local |
| A5 | `infrastructure/restic-executor.ts:146` | `stackPath` parameter | Underscore-prefixed (`_stackPath`) | Parameter required by `ResticExecutorPort` — deleting would silently change the contract |
| A6 | `infrastructure/restic-executor.ts:177` | `targetPath` parameter | Underscore-prefixed (`_targetPath`) | Parameter required by `ResticExecutorPort` — deleting would silently change the contract |
| A7 | `infrastructure/volume-migrator.ts` | `path` import | Deleted | Unused import |
| A8 | `jobs/update-checker.ts:243` | `stackRepository` (destructured binding + its dynamic import) | Deleted (both the binding and its `import("../repositories/stack-repository.js")` call) | Unused local — `findStacksByImageRef` queries `prisma` directly and never used it |

Re-run after acting: exits zero, no `TS6133`/`TS6192`/`TS6196` diagnostics.

The plan's baseline (9 findings at the phase's starting commit, one of them "an unused event type import in the stacks route") produced only 8 findings when re-run against this plan's actual starting point — the `routes/stacks.ts` finding was already resolved by an earlier wave in this phase (its current imports carry no unused event type), consistent with the plan's own text that "several of these files are rewritten by earlier waves."

### Scan B — exports nothing outside their own file references

`for f in $(git ls-files 'src/**/*.ts' | grep -v '^src/generated/'); do for n in $(grep -oE '^export (async function|function|class|const|interface|type|enum) [A-Za-z0-9_]+' "$f" | awk '{print $NF}'); do c=$(git grep -l -w "$n" -- 'src' 'test' | grep -v "^$f$" | wc -l); [ "$c" -eq 0 ] && echo "$n $f"; done; done`

75 findings total. 10 fell inside this plan's declared `files_modified` scope and were acted on; the remaining 65 are recorded but not edited (see key-decisions above for why: editing ~25 files this plan never declared would have exceeded its own scope boundary, and the plan's own closing text says Scan B "legitimately ends non-empty" and is resolved "by recording rather than by deleting").

**Acted on (in-scope files):**

| # | Symbol | File | Disposition | Rule |
|---|--------|------|-------------|------|
| B1 | `SmtpTestConfig` | `application/notification-service.ts` | De-exported | Type used only within its own file |
| B2 | `NotificationSettings` | `application/notification-service.ts` | De-exported | Type used only within its own file |
| B3 | `DiscoveredStack` | `infrastructure/brownfield-scanner.ts` | De-exported | Type used only within its own file |
| B4 | `normalizeImageRef` | `jobs/update-checker.ts` | De-exported | Function used only within its own file (extends the interface/type rule by analogy — deleting live internal code would be incorrect; only the published surface was dead) |
| B5 | `detectRegistry` | `jobs/update-checker.ts` | **Deleted** | Zero references anywhere, including within its own file — confirmed via `server/.test/coverage/lcov.info` (`FNDA:0,detectRegistry`, 0% function coverage). Unlike B4/B6-B10, this function had no in-file caller at all |
| B6 | `parseDateTag` | `jobs/update-checker.ts` | De-exported | Function used only within its own file |
| B7 | `CompareResult` | `jobs/update-checker.ts` | De-exported | Type used only within its own file |
| B8 | `CompareOptions` | `jobs/update-checker.ts` | De-exported | Type used only within its own file |
| B9 | `ImageUpdateCheckRecord` | `jobs/update-checker.ts` | De-exported | Type used only within its own file |
| B10 | `UpdateCheckerRepo` | `jobs/update-checker.ts` | De-exported | Type used only within its own file |

**Recorded, not acted on (outside this plan's declared file scope):**

| # | Symbol | File | Disposition | Rule |
|---|--------|------|-------------|------|
| B11 | `BackupSettingsService` | `application/backup-service.ts` | Left in place | Outside this plan's declared file scope |
| B12 | `CreateCertificateInput` | `application/certificate-service.ts` | Left in place | Outside this plan's declared file scope |
| B13 | `disposeDomainSubscribers` | `application/index.ts` | Left in place | Outside this plan's declared file scope; additionally, its own in-file comment ("Exported so a test can tear it down") documents deliberate intent from the immediately preceding plan (10-13), whose own acceptance criteria required its existence as "the one exported disposer" — not treated as dead despite zero current callers |
| B14 | `LogStreamTarget` | `application/log-service.ts` | Left in place | Outside this plan's declared file scope |
| B15 | `MigrationInput` | `application/migration-service.ts` | Left in place | Outside this plan's declared file scope |
| B16 | `MigrationResult` | `application/migration-service.ts` | Left in place | Outside this plan's declared file scope |
| B17 | `Step1Result` | `application/onboarding-service.ts` | Left in place | Outside this plan's declared file scope |
| B18 | `SETUP_WIZARD_COMPLETE_KEY` | `application/onboarding-service.ts` | Left in place | Outside this plan's declared file scope |
| B19 | `GeneralSettings` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B20 | `SmtpConfigWrite` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B21 | `MaskedSmtpConfig` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B22 | `NotificationTriggers` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B23 | `MaskedBackupRepositorySettings` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B24 | `BackupDefaultsView` | `application/settings-service.ts` | Left in place | Outside this plan's declared file scope |
| B25 | `RegisterDomainSubscribersDeps` | `application/subscribers/register.ts` | Left in place | Outside this plan's declared file scope |
| B26 | `ParseCertificateResult` | `domain/certificate-validation.ts` | Left in place | Outside this plan's declared file scope |
| B27 | `CertificateValidationResult` | `domain/certificate-validation.ts` | Left in place | Outside this plan's declared file scope |
| B28 | `StackStatusChangedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B29 | `StackContainerStateChangedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B30 | `StackConfigChangedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B31 | `StackConfigErrorEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B32 | `StackUpdateAvailableEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B33 | `ProxyCertStatusChangedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B34 | `BackupFailedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B35 | `RestoreStartedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B36 | `RestoreCompletedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B37 | `RestoreFailedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B38 | `DiskSpaceThresholdCrossedEvent` | `domain/events.ts` | Left in place | Outside this plan's declared file scope |
| B39 | `DomainAssignmentDecision` | `domain/proxy-idempotency.ts` | Left in place | Outside this plan's declared file scope |
| B40 | `CertificateBinding` | `domain/proxy-idempotency.ts` | Left in place | Outside this plan's declared file scope |
| B41 | `getDockerodeClient` | `infrastructure/dockerode-client.ts` | Left in place | Outside this plan's declared file scope |
| B42 | `BackupSchedulerService` | `jobs/backup-scheduler.ts` | Left in place | Outside this plan's declared file scope |
| B43 | `BackupSchedulerStackRepo` | `jobs/backup-scheduler.ts` | Left in place | Outside this plan's declared file scope |
| B44 | `BackupSchedulerBackupRepo` | `jobs/backup-scheduler.ts` | Left in place | Outside this plan's declared file scope |
| B45 | `BackupSchedulerSettings` | `jobs/backup-scheduler.ts` | Left in place | Outside this plan's declared file scope |
| B46 | `DiskCheckerSettings` | `jobs/disk-checker.ts` | Left in place | Outside this plan's declared file scope |
| B47 | `FileWatcherRepo` | `jobs/file-watcher.ts` | Left in place | Outside this plan's declared file scope |
| B48 | `JobStatus` | `jobs/job-registry.ts` | Left in place | Outside this plan's declared file scope |
| B49 | `JobHealth` | `jobs/job-registry.ts` | Left in place | Outside this plan's declared file scope |
| B50 | `NotificationWatcherNotificationService` | `jobs/notification-watcher.ts` | Left in place | Outside this plan's declared file scope |
| B51 | `ProxyCertStatus` | `jobs/proxy-cert-poller.ts` | Left in place | Outside this plan's declared file scope |
| B52 | `ProxyConfigCertRow` | `jobs/proxy-cert-poller.ts` | Left in place | Outside this plan's declared file scope |
| B53 | `ProxyCertPollerRepo` | `jobs/proxy-cert-poller.ts` | Left in place | Outside this plan's declared file scope |
| B54 | `ProxyCertPollerFs` | `jobs/proxy-cert-poller.ts` | Left in place | Outside this plan's declared file scope |
| B55 | `ServiceState` | `jobs/state-poller.ts` | Left in place | Outside this plan's declared file scope |
| B56 | `StackWithServices` | `jobs/state-poller.ts` | Left in place | Outside this plan's declared file scope |
| B57 | `UpdateServiceStateArgs` | `jobs/state-poller.ts` | Left in place | Outside this plan's declared file scope |
| B58 | `StatePollerRepo` | `jobs/state-poller.ts` | Left in place | Outside this plan's declared file scope |
| B59 | `resolveTrustedOrigins` | `lib/auth.ts` | Left in place | Outside this plan's declared file scope |
| B60 | `ComposeEditErrorReason` | `lib/compose-editor.ts` | Left in place | Outside this plan's declared file scope |
| B61 | `ComposeProxyEditErrorReason` | `lib/compose-proxy-editor.ts` | Left in place | Outside this plan's declared file scope |
| B62 | `RenderProxyStackComposeOptions` | `lib/proxy-stack-compose.ts` | Left in place | Outside this plan's declared file scope |
| B63 | `SchemaSyncOutcome` | `lib/schema-sync.ts` | Left in place | Outside this plan's declared file scope |
| B64 | `SchemaSyncResult` | `lib/schema-sync.ts` | Left in place | Outside this plan's declared file scope |
| B65 | `CliRunResult` | `lib/schema-sync.ts` | Left in place | Outside this plan's declared file scope |
| B66 | `SchemaSyncDeps` | `lib/schema-sync.ts` | Left in place | Outside this plan's declared file scope |
| B67 | `BASELINE_MIGRATION_NAME` | `lib/schema-sync.ts` | Left in place | Outside this plan's declared file scope |
| B68 | `MountEntry` | `lib/stacks-dir.ts` | Left in place | Outside this plan's declared file scope |
| B69 | `ContainerStateEvent` | `lib/state-broadcaster.ts` | Left in place | Outside this plan's declared file scope |
| B70 | `StackStatusEvent` | `lib/state-broadcaster.ts` | Left in place | Outside this plan's declared file scope |
| B71 | `ConfigErrorEvent` | `lib/state-broadcaster.ts` | Left in place | Outside this plan's declared file scope |
| B72 | `UpdateAvailableEvent` | `lib/state-broadcaster.ts` | Left in place | Outside this plan's declared file scope |
| B73 | `CreateCertificateData` | `repositories/certificate-repository.ts` | Left in place | Outside this plan's declared file scope |
| B74 | `UpsertImageUpdateCheckInput` | `repositories/image-update-check-repository.ts` | Left in place | Outside this plan's declared file scope |
| B75 | `CreateStackEventInput` | `repositories/stack-event-repository.ts` | Left in place | Outside this plan's declared file scope |

All 65 recorded rows were individually confirmed to have at least one reference within their own declaring file (i.e., they are live code with an unnecessarily public surface, not fully dead) — verified by an occurrence count per symbol against its own file before this table was finalized. None of them are false positives caused by a same-name collision across two files, except where noted; `NotificationCreatedEvent` (defined in both `domain/events.ts` and `lib/state-broadcaster.ts`) did not appear in Scan B's output at all because each definition's name resolves as "used elsewhere" against the other file's declaration — a known limitation of this scan's plain-text matching, not a finding this table needed to record.

### Scan C — declared dependencies nothing imports

`node -e "..." | while read d; do c=$(git grep -l -E "from \"$d(/|\")" -- 'src' | wc -l); [ "$c" -eq 0 ] && echo "UNIMPORTED $d"; done` (run against all 14 entries in `server/package.json`'s `dependencies`)

Zero findings — every declared dependency (`@docktor/shared`, `@fastify/cookie`, `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `chokidar`, `dockerode`, `fast-glob`, `fastify`, `fastify-type-provider-zod`, `node-cron`, `nodemailer`, `yaml`, `zod`) is imported somewhere in `src/`.

**Not a Scan C finding, but noted for completeness:** `server/src/jobs/update-checker.ts` imports `semver` directly, but `semver` is not itself listed in `server/package.json`'s `dependencies` (only `@types/semver` is, as a devDependency) — it currently resolves only as a phantom transitive dependency. This is the pre-existing hygiene item recorded in `STATE.md`'s Phase 02 review ("`semver` is used directly but only resolves as a phantom transitive dependency") and in `02-REVIEW.md`/`02-VERIFICATION.md`. Scan C as defined by this plan only enumerates `package.json`'s own `dependencies` keys, so it cannot detect an undeclared-but-imported package — this is the inverse failure mode and genuinely out of Scan C's design. Left unresolved here as a pre-existing, separately-tracked issue outside this plan's three-scan definition.

## Decisions Made

See `key-decisions` in the frontmatter above (Scan B scope discipline, `disposeDomainSubscribers` reasoning, `detectRegistry()` deletion justification, Task 1's stranded-dependency cleanup).

## Deviations from Plan

### Auto-fixed Issues

None (Rule 1/2/3/4 triggered) — every change in this plan was a direct instruction from the plan's own tasks or a mechanical application of Task 3's own disposition rules. No bugs, missing functionality, or blocking issues were found outside what the plan itself anticipated.

**Scope interpretation, not a deviation:** Task 3's action text says to "record the residual rows with their dispositions" for Scans B and C without explicitly bounding which files get edited. This plan's own frontmatter `files_modified` list names exactly 9 files (matching Scan A's baseline), and Scan B's ~75 findings span ~30 files. Interpreting the frontmatter's declared scope as a hard boundary (act only within it, record everything outside it) rather than editing ~25 additional, un-scoped files is documented above as a key-decision, not logged here as a Rule 1-4 auto-fix, since no bug or missing functionality was involved — it is a scope-boundary judgment call consistent with the executor's own SCOPE BOUNDARY guidance ("only auto-fix issues directly caused by the current task's changes").

## Issues Encountered

**Session rate-limit interruption between Task 2 and Task 3:** the session was interrupted by a rate-limit after Task 2's commit (`22a2ae3`) and mid-way through Task 3's edits (working tree had 6 uncommitted file modifications). Resumed by inspecting the in-progress diff against Task 3's action text, confirming it matched the intended disposition for each file, then completing verification (Scan A re-run, `yarn typecheck`, full unit suite, Scan C, generated-output/tsconfig diff checks) before committing. No work was lost or redone; Tasks 1-2's commits were independently re-verified intact (`triggerUpdate`/`update_error` absent, `server/src/services/` absent) before proceeding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-03 (dedicated dead-code audit) and D-11 (remove `server/src/services/`) are both closed. D-03 was previously only partially addressed by plans that removed call sites while passing through (per this plan's own objective text) — this plan is the dedicated pass the decision asked for.
- This is the phase's last implementation wave (wave 11, per this plan's frontmatter) — plan 10-15 is the phase gate. `yarn workspace @docktor/server test:unit` (58 files, 997 passed + 2 todo) and `yarn typecheck` both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 6 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with every prior plan's precedent in this phase.
- 65 Scan B findings and the `semver` phantom-transitive-dependency item remain recorded but unresolved, both explicitly out of this plan's scope (see above) — available for a future cleanup pass if the team decides the residual public-surface reduction is worth a wider-scoped edit.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-24*

## Self-Check: PASSED

All modified files confirmed present on disk with the expected changes (`server/src/jobs/update-checker.ts`,
`server/test/unit/jobs/update-checker.test.ts`, `server/test/unit/architecture/layering.test.ts`,
`server/src/application/notification-service.ts`, `server/src/infrastructure/brownfield-scanner.ts`,
`server/src/infrastructure/compose-rewriter.ts`, `server/src/infrastructure/restic-executor.ts`,
`server/src/infrastructure/volume-migrator.ts`); `server/src/services/` confirmed absent from the working tree.
All 3 task commits (`76675bd`, `22a2ae3`, `1c73091`) confirmed present in `git log`.
`git rev-list --count a4e4222..HEAD` = 3 (before this SUMMARY commit), matching the 3 task commits with no
docs-only or uncommitted changes at self-check time.
