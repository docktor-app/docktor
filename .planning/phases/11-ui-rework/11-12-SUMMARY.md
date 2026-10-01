---
phase: 11-ui-rework
plan: 12
subsystem: client-ui
tags: [react, react-hook-form, env-editor, zod, table-mode, secret-masking]
requires:
  - phase: 11-ui-rework
    provides: "11-09's CodeEditor (client/src/components/common/code-editor.tsx) reused unmodified for the raw-text mode; 11-01's ConfigTab/StackConfigFiles contract this plan's EnvEditor plugs into"
provides:
  - "ENV_VARIABLE_KEY_PATTERN, envVariableRowSchema, envTableFormSchema, EnvTableFormInput (shared/src/validation/stacks.ts) — the single definition of what a valid .env variable name looks like, shared by client parsing and future server validation"
  - "client/src/lib/env-file.ts — EnvLine, EnvTableRow, parseEnvFile(), serializeEnvFile(), toTableRows(), applyTableRows(), isSecretKey(), countPassthroughLines() — a lossless .env parse/serialize/table model where serializeEnvFile(parseEnvFile(s)) === s for every string (RESEARCH Pitfall 4)"
  - "EnvEditor (client/src/components/domain/stack/env-editor.tsx) — default inline-editable key/value table with a lossless 'Raw text mode' toggle, heuristic secret masking (D-22), long-value tooltips, and an empty state — no Dialog, no <form> of its own (D-06)"
  - "ConfigTab and create.tsx both use EnvEditor in place of a plain Textarea; their Save/Create actions additionally gate on the editor's own row validity"
affects: [11-13]
actuals:
  tokens: 12811
  tasks: 2
  commits: 5
plan_head_before: d631180d0151f5d00671ff6a4a1b29ae249780d8
plan_head_after: 525506a7e3d7a7e3646f22ae4cbbf93dfdf3bdbe
tech-stack:
  added: []
  patterns:
    - "Lossless line-model parsing: a line is only ever reinterpreted as a KEY=value variable when it matches the shared ENV_VARIABLE_KEY_PATTERN exactly; every other line (comment, blank, export, malformed, CRLF remnant) is carried through verbatim as an opaque passthrough line, keyed by original position (lineIndex) — the same shape any future line-preserving text-model editor in this codebase should copy"
    - "Controlled-string editor over an internal react-hook-form instance: EnvEditor owns a useFieldArray table but only ever exposes/accepts a single envContent string at its props boundary, reconciled via a lastEmittedRef (self vs. external change) — matches ComposeEditor's simpler value/onChange contract from the outside while hiding much richer internal state"
key-files:
  created:
    - client/src/lib/env-file.ts
    - client/src/components/domain/stack/env-editor.tsx
    - client/test/unit/lib/env-file.test.ts
    - client/test/unit/components/domain/stack/env-editor.test.tsx
  modified:
    - shared/src/validation/stacks.ts
    - client/src/routes/app/stacks/components/config-tab.tsx
    - client/src/routes/app/stacks/create.tsx
    - client/test/unit/routes/stacks/config-tab.test.tsx
    - client/test/integration/stacks.spec.ts
key-decisions:
  - "Split the plan's single 'lastEmittedRef' design into two refs: lastEmittedRef (self vs. external value-prop change detection, as specified) plus a new baseLinesRef that is the stable base applyTableRows reconstructs from, advanced ONLY on genuine external changes (see Deviations — this was a real, TDD-caught data-corruption bug in the plan's literal wording, not a stylistic choice)."
  - "isSecretKey's D-22 regex is deliberately broad enough to also mask a plain add-a-row test key like NEW_KEY (it contains \"KEY\") — treated as correct per the plan's own behavior spec ('the D-22 regex is intentionally broad'), not narrowed; the E2E test disambiguates the masked value input from its Show/Hide button with Playwright's {exact: true} instead."
  - "envValid state on ConfigTab/create.tsx defaults to true so an editor that has never reported (or is currently in lossless raw mode, which always reports valid) never blocks Save/Create — only a table-mode row with an empty/malformed key blocks the action."
patterns-established:
  - "EnvEditor's stable-base/self-vs-external ref split is the reference implementation for any future controlled-string editor built over an internal react-hook-form/useFieldArray instance in this codebase."
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — implements D-20 (structured env editor with toggleable table/raw modes), D-21 (table mode default, inline editing), D-22 (heuristic secret masking), and honours D-06 (no dialog for env vars) on both the Config tab and the Create Stack page."
coverage:
  - id: D1
    description: "parseEnvFile/serializeEnvFile round-trip: for any .env content (comments, blanks, CRLF, export lines, malformed lines), serializeEnvFile(parseEnvFile(s)) === s"
    requirement: "RESEARCH Pitfall 4"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/env-file.test.ts#parseEnvFile / serializeEnvFile round-trip"
        status: pass
    human_judgment: false
  - id: D2
    description: "toTableRows/applyTableRows edit, remove and append a row while preserving comments/passthrough lines in place"
    requirement: "D-20/D-21, RESEARCH Pitfall 4"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/env-file.test.ts#applyTableRows"
        status: pass
    human_judgment: false
  - id: D3
    description: "isSecretKey matches the D-22 heuristic (/password|secret|key|token/i) exactly, including intentionally-broad false positives"
    requirement: "D-22"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/env-file.test.ts#isSecretKey (D-22)"
        status: pass
    human_judgment: false
  - id: D4
    description: "EnvEditor mounts in table mode by default, masks secret-looking values with a per-row Show/Hide toggle, validates keys inline, and losslessly reflects table edits in raw mode with no dialog"
    requirement: "D-06/D-20/D-21/D-22"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/env-editor.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Typing a new row's key/value one keystroke at a time never leaves a stray blank/duplicate line in the emitted string"
    requirement: "RESEARCH Pitfall 4 (regression for the Rule 1 bug found via E2E)"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/env-editor.test.tsx#typing a new row's key/value one keystroke at a time never leaves a stray blank line (regression)"
        status: pass
    human_judgment: false
  - id: D6
    description: "ConfigTab renders EnvEditor bound to files.envContent/setEnvContent; env Save disables on !envDirty OR invalid, enables once dirty and valid"
    requirement: "D-20/D-21"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/config-tab.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "E2E: table shows the FOO row; Add Variable + NEW_KEY=42; raw mode reflects the edit pre-save; Save PUTs envContent 'FOO=bar\\nNEW_KEY=42'"
    requirement: "D-20/D-21, plan Task 2 acceptance criteria"
    verification:
      - kind: integration
        ref: "client/test/integration/stacks.spec.ts#stack detail config tab: EnvEditor table mode add + save, raw mode reflects the same edit (D-20/D-21)"
        status: pass
    human_judgment: false
duration: ~70min
completed: 2026-09-30
status: complete
---

# Phase 11 Plan 12: Env Editor Summary

**Replaced the raw .env textarea with a lossless table/raw-mode editor (D-20/D-21/D-22) — and, along the way, found and fixed a real line-duplication bug in the plan's own suggested re-serialization design before it ever shipped.**

## Performance
- **Duration:** ~70min
- **Started:** 2026-09-30 (session start)
- **Completed:** 2026-09-30
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments
- Added `ENV_VARIABLE_KEY_PATTERN`/`envVariableRowSchema`/`envTableFormSchema` to `@docktor/shared` as the single definition of a valid `.env` variable name.
- Built `client/src/lib/env-file.ts`: a lossless `.env` parse/serialize/table model. Any line not matching `KEY=value` (comments, blank lines, `export` lines, malformed lines, a `\r` remnant from CRLF) is carried through verbatim in its original position — `serializeEnvFile(parseEnvFile(s)) === s` for every string, closing RESEARCH Pitfall 4.
- Built `EnvEditor` (`client/src/components/domain/stack/env-editor.tsx`): table mode by default (D-21) with inline add/edit/remove rows, a "Raw text mode" switch reusing 11-09's `CodeEditor` with no confirmation dialog (D-06), heuristic secret masking with a per-row Show/Hide toggle (D-22), a hover Tooltip for long clear-text values (never for masked ones), an empty state, and a muted note naming how many comment/unrecognised lines are kept as-is.
- Wired `EnvEditor` into `ConfigTab` (env Save now also gates on row validity, not just dirty) and `create.tsx`'s Create Stack form (submit gates on row validity too). Both plain `Textarea` usages for env content are gone.
- Extended `stacks.spec.ts`'s config-tab E2E coverage: table shows the seeded row, Add Variable + fill a new row, raw mode reflects the edit before saving, and the PUT body carries the exact serialized string.

## Task Commits
1. **Task 1 (RED): env-file lib + EnvEditor tests** - `42ce021` (test), `d0af37d` (test)
2. **Task 1 (GREEN): lossless env-file model and EnvEditor** - `9f86213` (feat)
3. **Task 2 (RED): ConfigTab EnvEditor wiring test** - `3526edd` (test)
4. **Task 2 (GREEN): wire EnvEditor into Config tab and Create Stack** - `525506a` (feat)
**Plan metadata:** pending (this commit)

## Files Created/Modified
- `shared/src/validation/stacks.ts` - adds `ENV_VARIABLE_KEY_PATTERN`, `envVariableRowSchema`, `envTableFormSchema`, `EnvTableFormInput`
- `client/src/lib/env-file.ts` - lossless `.env` line model, parse/serialize/table/secret-heuristic functions
- `client/src/components/domain/stack/env-editor.tsx` - the table/raw EnvEditor component
- `client/src/routes/app/stacks/components/config-tab.tsx` - EnvEditor wiring, envValid-gated Save
- `client/src/routes/app/stacks/create.tsx` - EnvEditor wiring, envValid-gated Create Stack submit
- `client/test/unit/lib/env-file.test.ts` - round-trip identity, table row, secret-heuristic tests
- `client/test/unit/components/domain/stack/env-editor.test.tsx` - table/raw/masking/validity tests, plus the duplication regression test
- `client/test/unit/routes/stacks/config-tab.test.tsx` - EnvEditor mock + Save-gating wiring tests
- `client/test/integration/stacks.spec.ts` - env-editing E2E coverage + `getCodeEditorContent()` helper

## Decisions Made
- Split the ref design (see Deviations below) — `lastEmittedRef` for the self/external distinction (as the plan specified), plus a new `baseLinesRef` that only advances on genuine external `value` changes, never on self-emitted ones.
- Left `isSecretKey`'s regex exactly as D-22 specifies (deliberately broad); adjusted the E2E test to disambiguate a masked value input from its own Show/Hide button via Playwright's `{exact: true}` rather than narrowing the heuristic.
- `envValid` defaults to `true` on both ConfigTab and create.tsx so an untouched or raw-mode editor never blocks Save/Create — only an actual invalid table row (empty/malformed key) does.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EnvEditor's re-serialization base must stay stable across its own self-emitted changes**
- **Found during:** Task 2, writing the E2E test (the "add variable, type a key, type a value, check raw mode" flow)
- **Issue:** The plan's own suggested design ("compute `applyTableRows(parseEnvFile(lastEmittedRef.current), rows)`... store it in the ref") uses the *same* ref both to detect self-vs-external `value` changes and as the base document to re-serialize from, advancing it on every self-emitted change. A newly appended row starts with an empty key, which does not match the variable-line pattern when the freshly-emitted string is re-parsed on the *next* keystroke — so it gets baked into the base as an unclaimed passthrough line (literally `"="`), while the same row (its `lineIndex` staying `null` in form state) gets re-appended as a *second*, growing line on every subsequent keystroke. Live E2E reproduction: typing `NEW_KEY` then `42` into a freshly-added row produced `"FOO=bar\n=\nNEW_KEY=42"` (a stray extra line) instead of `"FOO=bar\nNEW_KEY=42"`.
- **Fix:** Split into two refs — `lastEmittedRef` (unchanged purpose: distinguishes a self-caused `value` prop update from a genuine external one) and a new `baseLinesRef`, which is the document `applyTableRows` reconstructs from. `baseLinesRef` only ever advances on a genuine external change (raw-mode edit flowing back, an external reload), never on the editor's own emission — so every row is always reconstructed from its single live entry in the current `rows` array, never duplicated.
- **Files modified:** `client/src/components/domain/stack/env-editor.tsx`
- **Verification:** Added a regression unit test (`env-editor.test.tsx#typing a new row's key/value one keystroke at a time never leaves a stray blank line`) that types a new row's key and value one character at a time and asserts the final raw-mode content has no stray line; re-ran the E2E test end to end (Playwright, real browser) confirming the exact `"FOO=bar\nNEW_KEY=42"` output.
- **Commit:** `525506a`

**Total deviations:** 1 auto-fixed (Rule 1 — bug). **Impact:** Without this fix, every stack's `.env` file would accumulate a corrupt extra line the first time a user added and filled in a new variable through the table UI — a direct, ship-blocking regression of the exact data-loss/corruption risk (RESEARCH Pitfall 4) this plan exists to prevent. Caught by writing the E2E test per the plan's own Task 2 acceptance criteria, before merge.

## Issues Encountered
- The pre-existing E2E flake in `stacks.spec.ts` ("stack detail page shows stack info and services" — strict-mode duplicate "Running" text) reproduced again during this plan's verification runs. It is out of scope (already logged in `.planning/phases/11-ui-rework/deferred-items.md` and `.planning/WINDOWS.md`, and neither of its two source files is in this plan's `files_modified`); not treated as this plan's bug.
- A full-suite `yarn workspace @docktor/client test` run showed 2 unrelated timeouts in `theme-toggle.test.tsx` (dark-mode toggle, not touched by this plan) — re-ran that file in isolation and it passed 4/4, confirming host resource pressure per this container's documented pattern, not a regression from this plan's changes.
- Playwright's `.cm-line`-based content reading doesn't expose a literal `"\n"` via `toHaveValue()` (CodeMirror's contenteditable root is not an input/textarea) — added a small `getCodeEditorContent()` test helper that joins `.cm-line` text contents with `"\n"`, alongside the existing `replaceCodeEditorContent()` helper.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Both env-editing surfaces (Config tab, Create Stack) now use the structured table/raw EnvEditor with lossless round-tripping, heuristic masking, and validity-gated saves. No known stubs or gaps. Ready for 11-13 (phase closeout).

---
*Phase: 11-ui-rework*
*Completed: 2026-09-30*

## Self-Check: PASSED

All 9 created/modified plan files and all 5 task commits (`42ce021`, `d0af37d`, `9f86213`, `3526edd`, `525506a`) verified present on disk / in `git log`.
