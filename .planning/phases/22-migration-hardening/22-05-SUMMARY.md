---
phase: 22-migration-hardening
plan: 05
subsystem: migration
tags: [named-volumes, docker-volume-inspect, external-volumes, anonymous-volumes, issue-101, issue-108, D-05]

requires:
  - phase: 22-migration-hardening
    provides: 22-04 (plan.oldProject with the resolved compose project name and containers with mounts) and 22-02 (review step reveal toggle)
provides:
  - "domain/compose-volumes.ts: resolveComposeVolumeNames (real Docker volume name per top-level key) and findAnonymousVolumes (compose plus container mounts)"
  - "VolumeMigratorPort.volumeExists and an injectable VolumeDockerRunner; copyVolumeToBindMount inspects first and mounts read-only with --mount"
  - "MigrationPlan.volumes (key -> {name, external, exists}) and RewriteOptions.volumes"
  - "AnalysisResult.externalVolumes / DiscoveredStack.externalVolumes; anonymousVolumeSchema; mandatory migrationExecuteSchema.acknowledgeAnonymousVolumes; MigrationPreview.anonymousVolumes"
  - "Review step anonymous-volume alert with acknowledgement checkbox gating Next; external volumes default to staying"
affects: [22-06, 22-07, 22-08]

actuals:
  tokens: 15400
  tasks: 3
  commits: 6
plan_head_before: 44e297c72d0dd0deb167d151cadf741c86969bf4
plan_head_after: b3d99aa18dd77bcaa354ee9faeb9866e555f0cb6

tech-stack:
  added: []
  patterns:
    - "Inspect-then-act against Docker: a read-only existence check right before the side effect is the guard, because Docker auto-creates missing volumes on mount"
    - "A plan field (volumes) carries the preflight decision into execute and the rewrite, so preview, preflight and execute cannot disagree"
    - "Injectable docker runner in an infrastructure adapter, so the docker argv and order are unit-tested without Docker"

key-files:
  created:
    - server/src/domain/compose-volumes.ts
    - server/test/unit/domain/compose-volumes.test.ts
  modified:
    - server/src/application/migration-service.ts
    - server/src/application/ports/volume-migrator-port.ts
    - server/src/infrastructure/volume-migrator.ts
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/infrastructure/compose-analyzer.ts
    - server/src/infrastructure/brownfield-scanner.ts
    - shared/src/validation/brownfield.ts
    - client/src/lib/brownfield-types.ts
    - client/src/routes/setup/components/migration-review-step.tsx
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/components/domain/stack/brownfield-import.tsx

key-decisions:
  - "The Docker volume to copy is resolved from the compose file and the resolved old project (name: override, else <project>_<key>, external by literal name); it is never the bare compose key"
  - "volumeExists runs docker volume inspect and a converted volume that does not exist is refused in preview and preflight (before the old stack is stopped); copyVolumeToBindMount re-checks right before docker run and never runs it for a missing volume. --mount alone is not claimed to prevent creation"
  - "Every resolved name of a converted volume must match COMPOSE_VOLUME_NAME_PATTERN before any docker call (T-22-15); a kept volume with a name that cannot be stated keeps today's {external: true} entry"
  - "A kept volume is written as {external: true, name: \"<real>\"} when Docker has it and {name: \"<real>\"} when not, so the new stack uses the same data; a kept external volume is not inspected"
  - "Anonymous volumes (compose-declared and 64-hex container mounts) are never copied; the schema field acknowledgeAnonymousVolumes is mandatory with no default and the server refuses false while any exist (D-05)"
  - "Volumes the old compose file declares external start unticked in the dialog"

patterns-established:
  - "Preflight refusals for Docker state are made by the same planning path preview and preflight share"

requirements-completed: [MIG-06, MIG-12]

coverage:
  - id: D1
    description: "A converted named volume is copied from the real Docker volume (name: override, <project>_<key>, external by literal name), inspected first and mounted read-only; a missing volume is refused before the old stack stops and docker run never executes"
    requirement: MIG-06
    verification:
      - kind: unit
        ref: "server/test/unit/domain/compose-volumes.test.ts; server/test/unit/infrastructure/volume-migrator.test.ts; server/test/unit/application/migration-service.test.ts (named volumes by the real Docker volume name)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Kept volumes are rewritten under their real name (external when Docker has them, named otherwise); external volumes are reported by the scanner and default to staying in the dialog"
    requirement: MIG-06
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rewriter.test.ts; compose-analyzer.test.ts; brownfield-scanner.test.ts; client/test/unit/routes/setup/migration-wizard.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Anonymous volumes are listed in the review step, need an acknowledgement checkbox to continue, are refused server-side without it, and are never copied"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts; shared/test/unit/validation/brownfield.test.ts; client/test/unit/routes/setup/migration-review-step.test.tsx; migration-wizard.test.tsx; brownfield-import.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real docker volume copy against a Docker daemon (inspect-then-run argv, read-only mount) behaves as the unit fakes assume"
    requirement: MIG-06
    verification: []
    human_judgment: true
    rationale: "Exercised only by GitHub Actions or a manual run; the VPS rule forbids Docker-heavy local actions, so the unit tests assert argv and order through a fake runner"

duration: 1 session
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 05: Real volume names, kept volumes and anonymous volumes Summary

**Named volumes are copied from the Docker volume the compose file really refers to (inspected first, mounted read-only, refused before any downtime when missing), kept volumes keep pointing at the same data under their real name, external volumes default to staying, and anonymous volumes are an explicit acknowledged loss enforced server-side (#101, D-05).**

## Performance

- **Tasks:** 3 (all TDD: RED commit then GREEN commit each; Task 1 is the tracer)
- **Commits:** 6 (measured from the plan ledger: `plan_head_before..HEAD`)
- **Files:** 27 changed in the plan range (2 created, 25 modified)

## Accomplishments

- **Tracer (Task 1).** `resolveComposeVolumeNames` parses the compose file and `.env` (`${VAR}` interpolation through `interpolateEnv`) and returns a key to `{name, external}` map; `VolumeMigrator` gained `volumeExists` (`docker volume inspect`, no such volume is false, any other failure rejects with the cause) and an injectable `VolumeDockerRunner`; `copyVolumeToBindMount` validates the name, inspects, then runs `docker run --rm --mount type=volume,src=<name>,dst=/source,readonly -v <dest>:/dest alpine sh -c "cp -a /source/. /dest/"` with the allowlisted env. `MigrationService.planVolumes` (shared by preview and preflight) refuses an undeclared, invalidly named or non-existent converted volume and stores `MigrationPlan.volumes`; execute copies `volumes.get(key).name`. The #108 `{cause}` cleanup is finished in `volume-migrator.ts` (spawn errors carry `cause`).
- **Kept volumes and acknowledgement (Task 2).** The rewriter's `RewriteOptions.volumes` writes `{external: true, name: "<real>"}` or `{name: "<real>"}` for a kept top-level volume (flow and block style, byte-identical output without options). The analyzer and scanner report `externalVolumes`. Shared schemas gain `externalVolumes`, `anonymousVolumeSchema` and a mandatory `acknowledgeAnonymousVolumes`. Preview returns `anonymousVolumes`; preflight refuses a start without the acknowledgement, naming each service and path.
- **Review step and wizard (Task 3).** Alert (yellow, with dark variant) listing `service: path` entries and the checkbox "I understand these volumes start empty in the new stack"; Next on the review step is disabled until ticked; a new preview resets it; Confirm sends `acknowledgeAnonymousVolumes` (true only when anonymous volumes exist and are acknowledged); volumes declared external start unticked.

## Task Commits

1. Task 1 RED: `d475b0f` tests for real names, inspect-first copy and refusals
2. Task 1 GREEN: `05ba18e` copy a named volume by its real name, inspected first and mounted read-only
3. Task 2 RED: `a5de823` tests for kept volume names, external volumes, acknowledgement
4. Task 2 GREEN: `9e987f8` kept volumes keep their real name, external volumes reported, acknowledgement required
5. Task 3 RED: `96e4b4f` client tests for the acknowledgement and external defaults
6. Task 3 GREEN: `b3d99aa` review step flags anonymous volumes, external volumes default to staying

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests needed the new contract**
- **Found during:** Task 1 and Task 2 GREEN
- **Issue:** The shared `COMPOSE` fixture of `migration-service.test.ts` did not declare `pgdata`, which is now required for a converted volume; `brownfield-routes.test.ts` drives the real `migrationService` and would reach a Docker daemon for `volumeExists`; request fixtures lacked the mandatory `acknowledgeAnonymousVolumes`; plan literals lacked `volumes`.
- **Fix:** `COMPOSE` declares `pgdata`; the routes test stubs `volume-migrator.js` (`volumeExists` true) next to its other stubs; fixtures in unit, integration (`imports.test.ts`) and Playwright specs (`setup-wizard.spec.ts`, `stacks-import.spec.ts`) gained the new fields.
- **Files modified:** server/test/unit/application/migration-service.test.ts, server/test/unit/routes/brownfield-routes.test.ts, server/test/unit/application/migration-operation-service.test.ts, server/test/integration/imports.test.ts, client test files and specs
- **Commit:** 05ba18e, 9e987f8, 96e4b4f

### Deliberate behavior changes worth review

- **An unreadable old `.env` now refuses the migration in preflight** (EACCES from `readOldEnv` in `planVolumes`), before anything is stopped, instead of failing mid-execute with a rollback. The test "fails the migration with rollback when the old .env cannot be read" became "refuses the migration before anything is stopped when the old .env cannot be read". This is strictly earlier and safer, and the preview already rejected it.
- **Every declared non-external volume is inspected in preview and preflight** (plan text: "every declared non-external volume and every converted one"), one `docker volume inspect` per volume.

**Total deviations:** 1 auto-fixed (Rule 3), 2 deliberate behavior changes. **Impact:** none on scope.

## Verification

Run, all green:

- `vitest run --project unit` (server): `test/unit/domain` (all), `volume-migrator`, `compose-rewriter`, `compose-analyzer`, `brownfield-scanner`, `migration-service`, `migration-operation-service`, `brownfield-routes`, `test/unit/architecture`.
- shared: `@docktor/shared build`, `vitest run test/unit/validation/brownfield.test.ts`.
- client: `vitest run` on `test/unit/routes/setup`, `test/unit/lib`, `brownfield-import.test.tsx` (39 files, 515 tests).
- `npx tsc --noEmit -p server` and `-p client` (scoped, about 14 s and 40 s): zero errors. Test files are outside the server tsconfig `include`.
- Acceptance greps: `volumeExists` in the port 1; `type=volume,src=` in the migrator 1; `${volumeName}:/source` 0; `resolveComposeVolumeNames(` in the service 1; `acknowledgeAnonymousVolumes` in shared 1, in wizard 2, in brownfield-import 2; `externalVolumes` in scanner 1, in wizard 2; `anonymousVolumes` in the service 5; `dark:text-yellow` in the review step 2.

**Not run, per the project's no-heavy-local-actions rule (MEMORY.md), left to GitHub Actions CI:** full `tsc --build` / `yarn typecheck`, the full server and client suites, `server/test/integration/*` (fixtures updated for the new mandatory field), Playwright, and any real docker volume copy.

## Issues Encountered

- The client dialog tests (`brownfield-import.test.tsx`, `migration-wizard.test.tsx`) exceed the default 5 s test timeout on this loaded VPS (they walk four dialog steps per test); they were run with `--testTimeout=60000` and all pass. No test code was changed for this; CI is expected to be unaffected.
- One server run showed a single unhandled-error line alongside 193 passing tests when `migration-service.test.ts` and `brownfield-routes.test.ts` ran together; it did not reproduce in two further runs of the same pair.

## Hand-off notes

- `MigrationPlan.volumes` and `MigrationPreview.anonymousVolumes` are available to 22-06..22-08. `migration-operation-service.test.ts` and `brownfield-routes.test.ts` build `MigrationPlan` literals that lack `oldProject`, `bindCopies` and `homeSources` (test files are not type-checked locally).
- The 22-03 hand-off about passing `rollback` through `toOperationResult` is still open for 22-07.

## Known Stubs

None.

## Threat Flags

None. The new Docker surface is `docker volume inspect` and `docker run --mount`, both covered by T-22-13/T-22-15 (argv array, name pattern, inspect before run).

## Self-Check: PASSED

All created files exist; all six task commits (d475b0f, 05ba18e, a5de823, 9e987f8, 96e4b4f, b3d99aa) are ancestors of HEAD; `git rev-list --count` over the plan ledger is 6.
