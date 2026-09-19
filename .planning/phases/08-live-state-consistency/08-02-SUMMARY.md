---
phase: 08-live-state-consistency
plan: 02
subsystem: server-realtime-config-sync
tags: [sse, config-changed, file-watcher, stack-service, error-handling]
requires:
  - phase: 05.1-stabilization
    provides: "configError/configChanged independent Stack fields, lastEnvHash column, FileWatcher's clearConfigError choke point"
provides:
  - "config_changed SSE events tagged source: \"app\" (StackService) or source: \"external\" (FileWatcher), closing the server-side half of G-08-2"
  - "updateStack()'s compose branch translates any parse failure into a typed BadRequestError (400) instead of an unguarded raw Error reaching Fastify's 500 catch-all, closing G-08-6"
  - "updateStack()'s compose branch clears stale configError on every successful parse, hash-changed or not"
  - "updateStack()'s env branch keeps Stack.lastEnvHash in sync with what it just wrote, closing G-08-2's compounding misclassified-broadcast bug"
affects: [08-03-plan, client-use-stack-hook, client-toast-gating]
actuals:
  tokens: 3387
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - "Origin discriminator on a broadcast event (source: \"app\" | \"external\") set by hardcoded literals at each publisher's single choke point, never derived from request input"
    - "try/catch translation of a raw domain-layer Error into a typed AppError subclass at the application-service boundary, mirroring an existing sibling call site (file-watcher.ts's handleFileChange catch)"
key-files:
  created: []
  modified:
    - server/src/lib/state-broadcaster.ts
    - server/src/jobs/file-watcher.ts
    - server/src/application/stack-service.ts
    - server/test/unit/jobs/file-watcher.test.ts
    - server/test/unit/application/stack-service.test.ts
key-decisions:
  - "ConfigChangedEvent.source is a required field (not optional) — every publisher must declare its origin explicitly, so a future third publisher can't silently ship an untagged broadcast"
  - "clearConfigError(id) in updateStack's compose branch is unconditional on hashChanged — a successful parse is positive evidence of validity regardless of whether the content actually differs from lastKnownHash"
  - "updateEnvHash's hash argument is computed from input.envContent directly (hashComposeContent), reusing the exact same hashing function FileWatcher.handleEnvChange uses for the identical on-disk content, so the two hashes are guaranteed comparable"
patterns-established:
  - "App-initiated vs externally-detected broadcast origin: hardcode the tag at each publisher's sole choke point (StackService.publishConfigChanged, FileWatcher.handleFileChange, FileWatcher.handleEnvChange) rather than threading a parameter through call sites"
requirements-completed:
  - "Closes UAT gaps G-08-2 (major, server half) and G-08-6 (blocker) diagnosed in 08-UAT.md against phase 08's ROADMAP scope items 2 (env file changes must flag config-changed) and 3 (manual actions must broadcast SSE status) — see .planning/todos/completed/2026-08-28-env-file-changes-dont-flag-config-changed.md and .planning/todos/completed/2026-08-28-manual-actions-dont-broadcast-sse.md"
coverage:
  - id: D1
    description: "config_changed SSE events carry source: \"app\" | \"external\", set correctly by StackService (app) and FileWatcher (external)"
    requirement: "G-08-2 (server half)"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — \"tags an app-initiated compose save's config_changed broadcast source: \\\"app\\\" (G-08-2)\" / \"tags an app-initiated env save's config_changed broadcast source: \\\"app\\\" (G-08-2)\""
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/file-watcher.test.ts — \"tags the config_changed broadcast source: \\\"external\\\" (G-08-2)\" (both handleFileChange and handleEnvChange describe blocks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invalid compose YAML saved through updateStack() rejects with BadRequestError carrying the parser's own message, never an unguarded raw Error"
    requirement: "G-08-6"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — \"throws BadRequestError carrying the parser's message instead of an unguarded raw Error for invalid compose content\""
        status: pass
    human_judgment: false
  - id: D3
    description: "An invalid compose save still writes the submitted content to disk (YAML-first) but touches neither configChanged, clearConfigError, nor the broadcaster before rejecting"
    requirement: "G-08-6"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — \"still writes the invalid content to disk (YAML-first) but touches neither configChanged, clearConfigError, nor the broadcaster before rejecting\""
        status: pass
    human_judgment: false
  - id: D4
    description: "A successful compose save clears stale configError, whether or not the hash changed"
    requirement: "G-08-6"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — \"calls repo.clearConfigError on a successful compose save that changes the hash\" and the extended \"does not publish and clears configChanged when the compose hash equals lastKnownHash\" assertion"
        status: pass
    human_judgment: false
  - id: D5
    description: "An app-driven env save (including env removal) persists the hash of exactly what was written into Stack.lastEnvHash via repo.updateEnvHash"
    requirement: "G-08-2 (compounding bug)"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts — \"calls repo.updateEnvHash with the hash of the written env content...\" and \"...hash of empty content when the env file is removed\""
        status: pass
    human_judgment: false
  - id: D6
    description: "Full server unit suite and monorepo typecheck stay green after all four fixes; no file outside this plan's five touched"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 45 files, 721 passed, 2 todo, 0 failed"
        status: pass
      - kind: other
        ref: "yarn typecheck -> silent exit 0"
        status: pass
      - kind: other
        ref: "git status --porcelain / git diff --name-only against pre-plan HEAD lists exactly the five files_modified"
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-09-19
status: complete
---

# Phase 08 Plan 02: Config-Changed Origin Tagging and updateStack Guard Fixes Summary

**config_changed SSE broadcasts now carry `source: "app" | "external"`, and `updateStack()`'s compose branch converts an unguarded parser crash into a typed 400 while syncing `lastEnvHash` on every app-driven env save.**

## Performance
- **Duration:** ~25min
- **Started:** 2026-09-19T21:50:00Z (approx.)
- **Completed:** 2026-09-19T22:17:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added a required `source: "app" | "external"` discriminator to `ConfigChangedEvent` (`server/src/lib/state-broadcaster.ts`), the single shared type both publishers implement against.
- Tagged `FileWatcher`'s two `config_changed` publish call sites (`handleFileChange`, `handleEnvChange`) with `source: "external"` — both represent a change detected on disk, never through the app.
- Tagged `StackService.publishConfigChanged`'s single call site with `source: "app"` — the sole choke point every app-initiated compose or env save routes through.
- Wrapped `updateStack()`'s `createComposeConfig(input.composeContent)` call in try/catch, translating any parse failure into `BadRequestError` carrying the parser's own message, mirroring `file-watcher.ts`'s existing catch for this exact exception type.
- Added `repo.clearConfigError(id)` to `updateStack()`'s compose branch, unconditional on whether the hash changed — a successful parse is positive evidence of validity.
- Added `repo.updateEnvHash({stackId, hash: hashComposeContent(input.envContent)})` to `updateStack()`'s env branch, keeping `Stack.lastEnvHash` in sync with exactly what was written (including the empty-string removal case).

## Task Commits
1. **Task 1 RED: config_changed source discriminator tests** - `281efb0` (test)
2. **Task 1 GREEN: tag config_changed broadcasts with source app|external** - `5e5c6d7` (feat)
3. **Task 2 RED: compose parse guard and env-hash sync tests** - `e26941c` (test)
4. **Task 2 GREEN: guard updateStack's compose parse and sync env hash** - `418aa97` (feat)

## Files Created/Modified
- `server/src/lib/state-broadcaster.ts` - `ConfigChangedEvent` gains the required `source` field
- `server/src/jobs/file-watcher.ts` - both `config_changed` publish call sites tagged `source: "external"`
- `server/src/application/stack-service.ts` - `publishConfigChanged` tags `source: "app"`; `updateStack()` guards the compose parse into `BadRequestError`, clears `configError` on success, and syncs `lastEnvHash` on env writes
- `server/test/unit/jobs/file-watcher.test.ts` - two new assertions covering the `source: "external"` tag on both publish call sites
- `server/test/unit/application/stack-service.test.ts` - `createMockRepo()` extended with `updateEnvHash`/`clearConfigError`; eight new/extended assertions covering all four fixes

## Decisions Made
- `ConfigChangedEvent.source` made required (not optional) so a future third publisher can't ship an untagged broadcast silently — matches the plan's must-haves.
- `clearConfigError(id)` placed unconditionally after `setConfigChanged`, not gated on `hashChanged` — per the plan's explicit behavior spec, a successful parse clears staleness regardless of whether this particular save changed the hash.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0. **Impact:** none.

## Issues Encountered

One self-correction during Task 1 GREEN: the doc comment added above `publishConfigChanged` originally repeated the literal string `source: "app"`, which made the acceptance criterion `grep -c 'source: "app"' server/src/application/stack-service.ts` print 2 instead of the required 1. Reworded the comment to describe the tag without repeating the exact literal, re-verified the grep count is 1, and re-ran the test suite (still green) before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Server-side half of G-08-2 and all of G-08-6 are closed and unit-tested. The companion plan `08-03-PLAN.md` (client-side: gating `use-stack.ts`'s "changed externally" toast on `event.source === "external"`) can now proceed — it consumes the `source` field this plan added to the wire format. No blockers.

---
*Phase: 08-live-state-consistency*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: `.planning/phases/08-live-state-consistency/08-02-SUMMARY.md`
- FOUND: `281efb0` (test: config_changed source discriminator RED)
- FOUND: `5e5c6d7` (feat: config_changed source discriminator GREEN)
- FOUND: `e26941c` (test: compose parse guard + env-hash sync RED)
- FOUND: `418aa97` (feat: compose parse guard + env-hash sync GREEN)
