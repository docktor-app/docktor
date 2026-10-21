---
phase: 18-import-and-migration-flow
plan: 02
subsystem: api
tags: [zod, fastify, jsdiff, compose, brownfield-migration, vitest]

requires:
  - phase: 18-import-and-migration-flow
    provides: plan 18-01 (own-stack scan exclusion) shares the same brownfield route surface
provides:
  - Shared brownfield Zod schemas (composeFilePathSchema, volumeSelectionSchema, migrationPreviewSchema, brownfieldAdoptSchema, migrationExecuteSchema) in @docktor/shared
  - MigrationService.previewMigration returns a real UnifiedDiff via computeUnifiedDiff
  - Compose-path boundary rule (T-18-05) enforced on adopt, preview and migrate in both route families
affects: [18-03, 18-04, 18-05, import-flow, setup-wizard]

actuals:
  tokens: 7000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "One shared Zod schema per brownfield request body, consumed by both setup and imports routes"
    - "Migrate handlers spread the validated body into the service so new schema fields flow through"
    - "Fastify-inject route tests with the real migration service for end-to-end preview coverage"

key-files:
  created:
    - shared/src/validation/brownfield.ts
    - shared/test/unit/validation/brownfield.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts
  modified:
    - shared/src/validation/index.ts
    - server/src/routes/imports.ts
    - server/src/routes/setup.ts
    - server/src/application/migration-service.ts
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/application/ports/compose-rewriter-port.ts
    - server/test/unit/application/migration-service.test.ts

key-decisions:
  - "Replaced all inline brownfield body schemas fully with shared ones (not just adding new fields) - D-12 discretion choice"
  - "composePath must be an absolute POSIX or Windows-drive path ending in one of the four compose file names, no NUL (T-18-05)"
  - "computeUnifiedDiff is the only server-side diff generator; ComposeRewriter.generateDiff and its port declaration are deleted (D-04)"

patterns-established:
  - "Shared compose-path rule uses a regex rather than node:path so it runs in the browser too"

requirements-completed: [MIG-02]

coverage:
  - id: D1
    description: "POST /api/stacks/import/migrate/preview and /api/setup/migrate/preview return a UnifiedDiff with individually marked added/removed lines from a real compose file"
    requirement: MIG-02
    verification:
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#returns a real UnifiedDiff computed from the compose file"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#previewMigration (MIG-02, D-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All five brownfield bodies in both route families validate through @docktor/shared schemas; a non-compose composePath is rejected with 400 before any file is read"
    requirement: MIG-02
    verification:
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#rejects a non-compose path with 400"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/brownfield.test.ts#composeFilePathSchema (T-18-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Positional generateDiff removed from ComposeRewriter and its port"
    requirement: MIG-02
    verification:
      - kind: command
        ref: "grep -rh generateDiff server/src (non-comment lines) = 0"
        status: pass
    human_judgment: false

duration: 8 min
completed: 2026-10-15
status: complete
commits: 6
plan_head_before: 2f49639de39e89291acde056ec820293e58b9927
plan_head_after: 4084916e145ab60a57b22c5f68499b4e6b3d868b
---

# Phase 18 Plan 02: Real migration diff and shared brownfield schemas Summary

**Migration preview now returns a jsdiff-based UnifiedDiff, and every brownfield request body is validated by shared Zod schemas that also confine `composePath` to compose files (T-18-05).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-15T07:07Z
- **Completed:** 2026-10-15T07:15Z
- **Tasks:** 3
- **Files:** 10 (3 created, 7 modified)

## Accomplishments

- `previewMigration` computes `computeUnifiedDiff(original, rewritten)`; both preview routes return `{diff: {hunks, added, removed}, extractedEnv}`; identical content yields `{hunks: [], added: 0, removed: 0}`.
- `shared/src/validation/brownfield.ts` holds the five schemas; `routes/setup.ts` and `routes/imports.ts` have no inline body schemas, no `zod` import and no tuple cast. Migrate handlers spread the validated body so plan 18-03's new flags flow through without another route edit.
- `composeFilePathSchema` rejects relative paths, `/etc/passwd`, look-alike names (`my-docker-compose.yml`, `.bak`, trailing slash) and NUL, and accepts POSIX and Windows-drive absolute compose paths. Before this plan a preview of `/etc/passwd` returned 200 (confirmed by the RED run).
- The positional `generateDiff` is gone from `ComposeRewriter` and `ComposeRewriterPort`.

## Task Commits

1. **Task 1 (tracer): end-to-end real-diff preview** - `6046ceb` (test), `9913302` (feat)
2. **Task 2: shared schemas in both route families** - `4bf2a87` (test), `bddedef` (feat)
3. **Task 3: retire positional diff, pin path rule** - `4f8fee2` (test), `4084916` (refactor)

Task 3's shared schema tests passed on first run because the schema already existed from Tasks 1-2; they pin the T-18-05 rule independently of the routes rather than driving new code.

## Deviations from Plan

None - plan executed exactly as written. Two small notes:

- `yarn` is not on PATH, so the shared build was run as `node_modules/.bin/tsc --project shared/tsconfig.json` (the same command the `build` script runs) and vitest was invoked directly from the workspace directory, per the executor instructions.
- In the "never migrates" route tests the `migrate` spy is stubbed with a resolved value, so a future validation regression can never reach the real migration (which would otherwise copy/rewrite the directory of the submitted path).

## Verification

Targeted unit runs only (VPS rule); all green:

- server: `brownfield-routes`, `migration-service`, `compose-rewriter`, `shared-schema-parity`, `layering` - 5 files, 200 tests passed.
- shared: `validation/brownfield.test.ts` - 21 tests passed.
- Acceptance greps for all three tasks pass (no `z.object`/`zod`/tuple cast in either route file, `generateDiff` count 0, 410 case present, Windows `C:` case present).

**Deferred to CI:** full `tsc --build` (the client still reads `diff` as a string from the preview response; that type change is plan 18-04), integration tests and Playwright.

## Known Stubs

None.

## Threat Flags

None - no new endpoints; T-18-05, T-18-06 and T-18-07 mitigations implemented as planned (access gates unchanged, 410 path covered by a route test).

## Next Phase Readiness

Plan 18-03 can add `backup`/`stopOldStack` to `migrationExecuteSchema` once; plan 18-04 can render `diff` with `UnifiedDiffView` but must update the client preview type and Playwright mocks, since `diff` changed from string to object.

## Self-Check: PASSED

- Created files exist: `shared/src/validation/brownfield.ts`, `shared/test/unit/validation/brownfield.test.ts`, `server/test/unit/routes/brownfield-routes.test.ts`.
- Commits `6046ceb`, `9913302`, `4bf2a87`, `bddedef`, `4f8fee2`, `4084916` are ancestors of HEAD.
