---
phase: 22-migration-hardening
plan: 04
subsystem: migration
tags: [compose-project, docker-compose, stop-verification, bind-mounts, home-relative, issue-102, issue-104, issue-100]

requires:
  - phase: 22-migration-hardening
    provides: 22-01 (injectable MigrationService dependencies, compose env) and 22-03 (verifying_stop step, verified-outcome contract)
provides:
  - "domain/compose-project.ts: pure types and rules for an external compose project (runningServices, stillRunning, stopNotVerifiedMessage, composeStopTimeoutMs)"
  - "ComposeProjectResolverPort + ComposeProjectResolver: the project Docker really runs for a compose file, resolved from container labels by directory identity"
  - "ExternalStackControlPort addressed by project: stop(target, {timeoutMs}), start(target, services); every argv carries -p <resolved project>"
  - "MigrationPlan.oldProject and MigrationPlan.homeSources"
  - "resolveHomeRelativeSources / HomeSourceResolution / DeclaredBindMount in domain/bind-mount-sources.ts; refusal reason home-unresolved"
  - "RewriteOptions {homeSources} as the fifth parameter of ComposeRewriterPort.rewrite"
affects: [22-05, 22-07, 22-08]

actuals:
  tokens: 18700
  tasks: 3
  commits: 6
plan_head_before: 527a9218a5f9c51c958d178b1407f1fbcc20a43c
plan_head_after: 928a46079fec7ce23c3bfdd4281e7b511f822174

tech-stack:
  added: []
  patterns:
    - "Resolve the external stack's identity once (the project Docker runs) and address it explicitly everywhere, instead of re-deriving a name from the directory"
    - "Evidence from Docker (container labels and recorded mounts) over guesses from the files; unresolvable means refuse before any side effect"
    - "Pure domain resolution (resolveHomeRelativeSources) over data the resolver already collected, so the service does no extra Docker calls"

key-files:
  created:
    - server/src/domain/compose-project.ts
    - server/src/application/ports/compose-project-resolver-port.ts
    - server/src/infrastructure/compose-project-resolver.ts
    - server/test/unit/domain/compose-project.test.ts
    - server/test/unit/infrastructure/compose-project-resolver.test.ts
  modified:
    - server/src/application/migration-service.ts
    - server/src/application/ports/external-stack-control-port.ts
    - server/src/application/ports/compose-rewriter-port.ts
    - server/src/infrastructure/external-stack-control.ts
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/domain/bind-mount-sources.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/infrastructure/external-stack-control.test.ts
    - server/test/unit/infrastructure/compose-rewriter.test.ts
    - server/test/unit/domain/bind-mount-sources.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts

key-decisions:
  - "The compose project Docker runs (from container labels, matched by directory identity and config_files basename) is the identity of the old stack; the name predicted from files and directory is only the fallback (source 'files') when no container of the compose file exists"
  - "An unresolvable old project (Docker unreachable, mounts unknown, one file used by several projects) refuses in preview and preflight, before anything is stopped"
  - "A stop that leaves any container of the old project running refuses with ConflictError naming the project and containers, before the in-place rename, directory creation, backup or copy; no override (D-04)"
  - "The stop is skipped when nothing runs; otherwise its timeout is composeStopTimeoutMs = clamp(30 s x containers, 120 s, 900 s)"
  - "Rollback starts exactly the services that were running before (#100) and words the result as 'a restart ... was requested; check that they are running'; verification of the restart arrives in plan 22-07"
  - "A ~ bind source is resolved only from the old containers' recorded bind mounts at the declared container path, and the recorded directory must end in what follows ~/. Several services must agree; zero containers, disagreement or ~user/~+/~- refuse. It is never expanded against Docktor's own HOME"
  - "Every declared ~ source must resolve, selected or not: a kept ~ source is rewritten to the absolute host path, so an unresolvable one would silently change meaning in the new stack"
  - "preview and preflight now parse the compose file with the analyzer on every request, not only when a source is converted (the ~ check needs the declared mounts); an unparseable file is refused with the existing 'could not be read' message"

patterns-established:
  - "Adapters that address an external compose project take a ComposeProjectTarget {composePath, project}, never a bare path"
  - "A plan field (homeSources) carries a preflight decision into execute so preview, preflight and execute cannot disagree"

requirements-completed: [MIG-05, MIG-07]

coverage:
  - id: D1
    description: "A stack started under another compose project (-p, COMPOSE_PROJECT_NAME, other directory name) is stopped and verified as its real project; every compose argv for the old stack carries -p <resolved>"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/external-stack-control.test.ts; server/test/unit/application/migration-service.test.ts (the old project as Docker runs it); server/test/unit/infrastructure/compose-project-resolver.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A container of the old project still running after the stop ends the migration before anything is created, backed up or copied, naming the project and containers; an unresolvable project refuses before anything is stopped"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts; server/test/unit/domain/compose-project.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stop timeout scales with the container count; rollback restarts only the services that were running, worded as requested"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "server/test/unit/domain/compose-project.test.ts; server/test/unit/application/migration-service.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "~ bind sources are resolved from the old containers, then analysed, rewritten (converted to ./volumes/<name>, kept to the absolute host path) and copied from the resolved directory; unresolved ones are refused before anything happens"
    requirement: MIG-07
    verification:
      - kind: unit
        ref: "server/test/unit/domain/bind-mount-sources.test.ts; server/test/unit/infrastructure/compose-rewriter.test.ts; server/test/unit/application/migration-service.test.ts"
        status: pass
    human_judgment: false

duration: 2 sessions (the first executor was cut off by a usage limit after Task 2 RED; this session finished Task 2 GREEN and Task 3)
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 04: Verified stop of the real compose project and ~ bind sources Summary

**The migration now stops the compose project Docker actually runs (`docker compose -p <resolved>`), proves the stop before it creates or copies anything and refuses with no override otherwise (#102); rollback restarts only what was running (#100); and `~` bind sources are resolved from the old containers' recorded mounts, then rewritten and copied consistently or refused (#104).**

## Performance

- **Tasks:** 3 (all TDD: RED commit then GREEN commit each; Task 1 is the tracer)
- **Commits:** 6 (measured from the plan ledger: `plan_head_before..HEAD`)
- **Files:** 16 changed in the plan range (5 created, 11 modified)
- **Duration:** two executor sessions; the first was cut off by a usage limit

## Accomplishments

- **Resolver (Task 1, tracer).** `ComposeProjectResolver` lists the Docker containers, keeps those whose project label is set and whose `working_dir`/`config_files` directory is the same directory as the compose file (directory identity, not string compare) and, when `config_files` is present, lists the compose file's basename. Result: resolved from `containers`, resolved from the `files` prediction when no container exists, or unresolved (two projects for one file, unknown mounts, Docker failure) without throwing. `listContainers` returns the project's containers with `running` and mapped mounts.
- **Verified stop (Task 1).** `execute` lists the project's containers, stops, reports `verifying_stop`, lists again and throws `ConflictError(stopNotVerifiedMessage(project, remaining))` when any is still running. The throw sits before the in-place rename and the directory creation, so the existing catch rolls back and restarts what Docktor stopped. Test: `createDirectoryExclusive` and `copyDirectory` were not called when the stop could not be verified.
- **Project-addressed control (Task 2).** `ExternalStackControlPort.stop(target, {timeoutMs})` and `start(target, services)`. The adapter builds `docker compose -p <project> -f <composePath> stop|start [services]`, `start` of an empty list runs nothing, and nothing ever runs `up`. Invariant test: every recorded argv contains `-p` immediately followed by the project. `composeStopTimeoutMs`: 1 or 4 containers 120 s, 10 containers 300 s, capped at 900 s.
- **Restart only what ran (Task 2).** The stop is skipped when nothing runs (`stopping_old_stack` detail "(nothing was running)"); the rollback starts `runningBefore` with its note "A restart of the old stack's services (...) was requested; check that they are running." and never claims a restart (`grep -c "was restarted"` is 0). `sharedProjectName` compares the resolved old name with the name the new stack would get and reports the new stack's name source; the directory refusal now says "the new stack takes it from its directory name".
- **`~` bind sources (Task 3).** `resolveHomeRelativeSources(declared, containers)` returns, per `~` path, the host directory the service's containers bind at the declared container path, or `no-container` / `inconsistent` / `unsupported`. `RewriteOptions.homeSources` makes the rewriter treat `~...` as a bind source (never a named volume): converted becomes the destination, kept becomes the absolute host path, long-form `type: bind` follows the same rules, and without options the output is unchanged. `MigrationService` resolves the sources once in the planning path shared by preview and preflight, refuses unresolved ones with a `BadRequestError` naming the source and the remedy (start the old stack once, or use an absolute path), stores the map as `MigrationPlan.homeSources`, reads converted `~` sources from the resolved directory and hands `{homeSources}` to the rewrite in preview and execute.

## Task Commits

1. Task 1 RED: `f8f4684` test for the resolver and the verified stop
2. Task 1 GREEN: `708f1cb` resolve the old compose project and verify the stop before any data is touched
3. Task 2 RED: `5c4fbef` test for project-addressed stop and start and the scaled stop timeout
4. Task 2 GREEN: `0842456` address the resolved project in every stop and start, scale the stop timeout
5. Task 3 RED: `9220cf7` test for `~` bind sources resolved from the old containers
6. Task 3 GREEN: `928a460` resolve `~` bind sources from the old containers, then rewrite and copy them consistently

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong expectation in the Task 2 RED test (in-place rollback)**
- **Found during:** Task 2 GREEN review
- **Issue:** The in-place rollback test expected the restart target project `"original"`, but that fixture lives in `stacks/<stackId>`, so the project predicted from the files is the directory name, `stackId`.
- **Fix:** Expectation changed to `{composePath, project: stackId}`; the assertion is no weaker (same call, same services).
- **Files modified:** server/test/unit/application/migration-service.test.ts
- **Commit:** 0842456

**2. [Rule 1 - Bug] Brownfield route preview tests started failing against a real Docker resolver**
- **Found during:** Task 3 verification (broader targeted run)
- **Issue:** `brownfield-routes.test.ts` drives the real `migrationService`; since Task 1 the preview resolves the old project through the real `composeProjectResolver`, which queries a Docker daemon the unit environment does not have, so three preview tests answered 400.
- **Fix:** The test file now stubs `compose-project-resolver.js` (resolved from the files, no containers), next to its existing stub for `docker-self-stack.js`.
- **Files modified:** server/test/unit/routes/brownfield-routes.test.ts
- **Commit:** 928a460

**3. [Rule 3 - Blocking] Two CR-03 test fixtures declared an unresolvable `~/data`**
- **Found during:** Task 3 GREEN
- **Issue:** The shared `beforeEach` of "sources Docktor cannot read fail closed" declared `~/data`; with every declared `~` source now required to resolve, every test in the describe was refused for that reason instead of the one it tests.
- **Fix:** The shared compose no longer declares `~/data`; the dedicated `~` refusal test and the "does not refuse an unselected source" test write their own compose. Behavior asserted is unchanged.
- **Files modified:** server/test/unit/application/migration-service.test.ts
- **Commit:** 928a460

### Deliberate behavior changes worth review

- **All declared `~` sources must resolve, even unselected ones** (plan text: "refuse any unresolved ~ source ... converted or kept"). A kept `~` source is rewritten to an absolute path, so leaving one unresolved would change its meaning in the new stack.
- **The analyzer runs on every preview/preflight** (previously only when a source was converted), because the `~` check needs the declared mounts. An unparseable compose file is now refused at that point with the existing "could not be read to check the bind mounts" message instead of passing the preview.

## Verification

Run, all green:

- `vitest run --project unit` on: `test/unit/domain/bind-mount-sources.test.ts`, `compose-project.test.ts`, `test/unit/infrastructure/compose-rewriter.test.ts`, `compose-analyzer.test.ts`, `compose-project-resolver.test.ts`, `external-stack-control.test.ts`, `test/unit/application/migration-service.test.ts`, `migration-operation-service.test.ts`, `test/unit/routes/brownfield-routes.test.ts`, `test/unit/architecture` (layering) and the rest of `test/unit/domain`.
- `npx tsc --noEmit -p server` (scoped, about 12 s): zero errors. Its `include` is `src/**` only, so test files are not type-checked locally.
- Acceptance greps: `implements ComposeProjectResolverPort` 1; `"verifying_stop"` present; `projects.(resolve|listContainers)(` at least 3; `"-p"` in the adapter 1; `composeStopTimeoutMs(` in the service 1; `"was restarted"` 0; `resolveHomeRelativeSources(` in the service 1; `"home-relative"` in the domain 0; `homeSources` in the rewriter 5.

**Not run, per the project's no-heavy-local-actions rule (MEMORY.md), left to GitHub Actions CI:** full `tsc --build` / `yarn typecheck`, the full server suite, `server/test/integration/*` (including `imports.test.ts`, which hits the real preview route and now needs the resolver to reach a Docker daemon or fail soft; CI runners have Docker), and Playwright.

## Issues Encountered

- A usage limit cut the first executor off after Task 2 RED; its uncommitted Task 2 GREEN work was reviewed against the plan (all Task 2 behaviors present, correct, tests green) before being committed unchanged apart from the corrected test expectation above.

## Hand-off notes

- **22-03 hand-off still open:** `toOperationResult` in `server/src/application/migration-operation-service.ts` must pass `rollback` through once `MigrationResult` gains it. `MigrationResult` is not changed by this plan (rollback verification is 22-07), so nothing was needed here.
- **22-05 (volume names, anonymous volumes)** can use `plan.oldProject.name` and `plan.oldProject.containers` (including their `mounts`); `projects.listContainers(project, composePath)` is available for a fresh read.
- **22-07 (rollback restart verification)** can reuse `ComposeProjectTarget`, `runningServices` and `stillRunning`; `restartOldStack`'s note currently says only that a restart was requested.
- `migration-operation-service.test.ts` and `brownfield-routes.test.ts` build `MigrationPlan` literals that already lack `oldProject`, `bindCopies` and now `homeSources`; test files are outside the server tsconfig `include`, so this is not caught locally and was not widened here.

## Known Stubs

None.

## Threat Flags

None. The only new Docker surface is the container list the resolver reads (accepted as T-22-12; only matched project names reach refusal messages).

## Self-Check: PASSED

All created files exist; all six task commits (f8f4684, 708f1cb, 5c4fbef, 0842456, 9220cf7, 928a460) are ancestors of HEAD; `git rev-list --count` over the plan ledger is 6.
