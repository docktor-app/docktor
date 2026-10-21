---
phase: 18-import-and-migration-flow
plan: 08
subsystem: api
tags: [migration, compose, yaml, source-preserving, typescript, vitest]
gap_closure: true
gap_ids: [G-18-4]

requires:
  - phase: 18-import-and-migration-flow
    provides: "ComposeRewriterPort and MigrationService.previewMigration diff (18-03, 18-04)"
provides:
  - "Source-preserving ComposeRewriter.rewrite: node-range splices on the original text instead of parse and stringify"
  - "Byte-identical output when nothing is selected, whatever indentation, comments, quoting or line endings"
  - "Quote-preserving scalar edits for volume paths and inline env values"
  - "Map-form environment kept; inline literals become KEY: ${KEY} with extractedEnv KEY=value"
affects: [18-09, 18-10, 18-11]

actuals:
  tokens: 8900
  tasks: 2
  commits: 4
plan_head_before: 7bb7a48c487b5ced11e0c8e4a5a419b9cad8591b
plan_head_after: 29112c4bb9572ed5b1f40973c4c29eb3315182ff
commits: 4

tech-stack:
  added: []
  patterns:
    - "Collect non-overlapping splices from yaml node ranges (keepSourceTokens), apply once to the original text"
    - "Scalar replacement via a cloned srcToken + CST.setScalarValue + CST.stringify keeps the quote style"
    - "Whole-line removal for block map entries, value-range rebuild for flow maps"

key-files:
  created: []
  modified:
    - server/src/infrastructure/compose-rewriter.ts
    - server/src/infrastructure/compose-analyzer.ts
    - server/test/unit/infrastructure/compose-rewriter.test.ts

key-decisions:
  - "The rewrite output is never produced by the yaml document toString or stringify (both re-indent and normalise line endings); every byte outside a splice is copied verbatim"
  - "A document with parse errors, no root map or no services map is returned unchanged instead of half-rewritten"
  - "Environment keeps the map form: KEY: ${KEY} is read from the stack .env by Compose interpolation (the old list of bare ${KEY} entries was invalid)"
  - "isVariableReference is exported from compose-analyzer so the rewriter and the scan share one inline-literal rule"
  - "A legacy external: {name: ...} declaration counts as already external, so its declared name is never overwritten"

requirements-completed: [MIG-02]

duration: ~8min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 08: Source-preserving compose rewrite (G-18-4 B) Summary

**`ComposeRewriter.rewrite` now edits only the scalars and lines it must change (yaml `parseDocument` node ranges applied as non-overlapping splices), so the memos preview diff is exactly one removed and one added line and a rewrite without selections is byte-for-byte identical, including CRLF files, comments and quoting.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (both TDD, 4 commits)
- **Files modified:** 3 (0 created, 3 modified)

## Accomplishments

- Task 1 (tracer): short-form and long-form volume rewrites, named-volume conversion (service reference, long-form type/source, top-level entry removal, `{external: true}` for the rest), and the unchanged-input robustness path. The memos file with `./data -> ./volumes/data` diffs as `-     - ./data:/var/opt/memos` / `+     - ./volumes/data:/var/opt/memos` (same indentation) and nothing else.
- Task 2: map-form `environment` literals are replaced by `${KEY}` in place (quote style, trailing comments and line endings kept) and listed in `extractedEnv` / `envVars`; null values, variable references, block scalars and list-form entries are untouched.
- The `any` traversal flagged as IN-04 is gone: traversal uses yaml's `isMap`/`isSeq`/`isScalar` guards.

## Task Commits

1. **Task 1 RED** `2e0f07f` test(18-08): add failing tests for source-preserving compose rewrite
2. **Task 1 GREEN** `4cbf9ff` feat(18-08): rewrite compose volumes with source-preserving edits
3. **Task 2 RED** `03c46ce` test(18-08): add failing tests for inline env extraction that keeps the map form
4. **Task 2 GREEN** `29112c4` feat(18-08): move inline env values to .env with targeted scalar edits

## TDD Gate Compliance

Both tasks have a `test(18-08)` commit before the `feat(18-08)` commit. The plan is `type: execute`, so `gsd_run check tdd-red-evidence` records were not produced; RED was checked by inspecting the vitest output.

- Task 1 RED (32 tests, 22 failing): the byte-identity, convert, kept-in-place, diff, quoting, long-form-comment, CRLF top-level and sibling-external tests failed on their output assertions (the old code re-serialised, e.g. `services: null`, re-indented sequences, normalised CRLF); the three robustness tests failed with a `TypeError`/`YAMLParseError` thrown by the old parse. Fixtures that the old stringify happens to reproduce (the 2-space memos file, "already external", the emptied short-form named volume) passed against HEAD; they pin retained behaviour. Semantic assessment: the targeted tests executed and failed for the planned reason.
- Task 2 RED (41 tests, 5 failing): value scalars were not replaced and `extractedEnv` was `""` (the Task 1 interim behaviour). The list-form test passed, as intended (retained behaviour).

## Files Created/Modified

- `server/src/infrastructure/compose-rewriter.ts` - rewritten around `SourceEdits` (splice collection and application), `VolumeRules` (which references convert) and `ComposeEditPlan` (node traversal); `VolumeSelection`, `RewriteResult`, class name, signature and singleton unchanged
- `server/src/infrastructure/compose-analyzer.ts` - `isVariableReference` exported (one-word change plus doc comment)
- `server/test/unit/infrastructure/compose-rewriter.test.ts` - identity, memos diff, CRLF, quoting, comments, named volumes, flow-style volumes, env regression tests (the four CR-03 tests kept)

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Flow-style top-level `volumes:` map**
- **Found during:** Task 1
- **Issue:** the plan describes whole-line removal for converted entries; a flow map (`volumes: {pgdata: {}, cache: {}}`) has no per-entry lines, so line removal would delete the whole line or corrupt it.
- **Fix:** when `volumes` is a flow map and some entries remain, the one flow map is rebuilt (`{cache: {external: true}}`); when every entry is converted the key is removed with its line like the block case.
- **Files modified:** `server/src/infrastructure/compose-rewriter.ts`, test added in `compose-rewriter.test.ts`
- **Commit:** 4cbf9ff

**2. [Rule 1 - Bug] Legacy `external: {name: ...}` was overwritten**
- **Found during:** Task 1
- **Issue:** the plan treats only `external: true` as already external; an unconverted entry declaring `external: {name: other}` would have been replaced by `{external: true}`, losing the declared name (and pointing at the wrong volume). The old implementation had the same flaw.
- **Fix:** an `external` that is a map also counts as declared. Test added.
- **Commit:** 4cbf9ff

**3. [Rule 3 - Blocking/consistency] `isVariableReference` exported from the analyzer**
- **Found during:** Task 2
- **Issue:** the plan allows importing or restating the analyzer's variable-reference rule; the helper was module-private, and a restated copy could diverge.
- **Fix:** exported it from `compose-analyzer.ts` (no behaviour change) and imported it in the rewriter. `compose-analyzer.ts` is therefore touched although not listed in the plan's `files_modified`.
- **Commit:** 29112c4

**4. [Environment] Test runner invocation**
- The plan's `../node_modules/.bin/vitest` form was replaced by `corepack yarn vitest run --project unit --coverage.enabled=false <files>` as instructed by the dispatch (yarn is not on PATH directly). Installed `yaml` is 2.9.1 (plan notes say 2.8.2); the APIs used behave identically.

**Total deviations:** 3 auto-fixed (1 Rule 2, 1 Rule 1, 1 Rule 3) plus an environment note. **Impact:** none on scope; all additive and covered by tests.

## Verification

- Task verify commands (server unit): `compose-rewriter.test.ts` + `migration-service.test.ts` + `compose-analyzer.test.ts` - 3 files, 91 tests passed.
- `cd server && corepack yarn tsc --noEmit -p .`: no errors.
- Acceptance greps: `parseDocument` count 2, `stringify as` 0, `as any` 0, `computeUnifiedDiff` 3 in the test, `crlf` 6, `s3cr#t` 3, `environment` 6.
- Left for CI per the project's no-heavy-local-actions rule: `tsc --build`, server integration (`imports.test.ts` preview case), Playwright, Windows unit job. No integration or E2E spec files were part of this plan.

## Known Stubs

None.

## Threat Flags

None. T-18-25 is mitigated as planned (non-overlapping splices, malformed documents returned unchanged, byte-identity tests); T-18-26 and T-18-SC are accepted as stated.

## Issues Encountered

None.

## Next Phase Readiness

The preview diff and the migrated compose file keep the user's formatting, which unblocks the relative-mount offering work (18-09, 18-10): a kept-in-place relative mount (`newPath === originalPath`) is already a no-op edit. Known limit: `compose-proxy-editor.ts` / `compose-editor.ts` are separate and untouched.

## Self-Check: PASSED

- `compose-rewriter.ts`, `compose-rewriter.test.ts`, `compose-analyzer.ts` exist; commits 2e0f07f, 4cbf9ff, 03c46ce, 29112c4 are ancestors of HEAD.
- All task acceptance greps pass; verify commands exit 0.
