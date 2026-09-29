---
phase: 11-ui-rework
plan: 09
subsystem: client-ui
tags: [codemirror, yaml, compose-editor, code-editor, react, vitest, playwright]
requires:
  - phase: 11-ui-rework
    provides: "11-01's StackConfigFiles hook contract (composeContent/setComposeContent/composeDirty/saveCompose) and ConfigTab's Compose File section this plan swaps the text area out of; 11-03's ThemeProvider/useTheme().resolvedTheme this plan reads for CodeMirror's light/dark theme"
provides:
  - "CodeEditor / CodeEditorProps (client/src/components/common/code-editor.tsx) — generic themed CodeMirror 6 wrapper, no domain vocabulary; plan 11-12 reuses this for the env editor's raw mode"
  - "yamlSyntaxDiagnostics() / yamlSyntaxLinter (client/src/lib/yaml-syntax-linter.ts) — pure YAML parse-error diagnostics + the CodeMirror lint extension wiring them in"
  - "ComposeEditor / ComposeEditorProps (client/src/components/domain/stack/compose-editor.tsx) — CodeEditor + yaml()/yamlSyntaxLinter/lintGutter(), wired into both compose-editing surfaces"
  - "client/test/setup.ts Range.getClientRects()/getBoundingClientRect() jsdom shims — any future CodeMirror-rendering test benefits automatically"
affects: [11-12]
actuals:
  tokens: 6796
  tasks: 3
  commits: 5
plan_head_before: ceb5230ee7d46e1c5ab0370f5531282d6943369e
plan_head_after: 11f084189e1a54b3f468d504230817f7109c5ed0
tech-stack:
  added:
    - "@uiw/react-codemirror ^4.25.12"
    - "yaml ^2.9.1"
    - "@codemirror/lang-yaml ^6.1.3"
    - "@codemirror/lint ^6.9.7"
  patterns:
    - "Generic themed-editor wrapper (CodeEditor) composed by a domain-specific editor (ComposeEditor) that supplies language/lint extensions and a placeholder — the pattern plan 11-12's env raw-mode editor reuses directly"
    - "keyboard.insertText() (not .fill() or .type()) to drive a CodeMirror contenteditable in Playwright — bypasses per-keystroke auto-indent the YAML language extension would otherwise trigger on Enter"
key-files:
  created:
    - client/src/components/common/code-editor.tsx
    - client/src/components/domain/stack/compose-editor.tsx
    - client/src/lib/yaml-syntax-linter.ts
    - client/test/unit/lib/yaml-syntax-linter.test.ts
    - client/test/unit/components/common/code-editor.test.tsx
    - .planning/phases/11-ui-rework/deferred-items.md
  modified:
    - client/package.json
    - yarn.lock
    - client/test/setup.ts
    - client/src/routes/app/stacks/components/config-tab.tsx
    - client/src/routes/app/stacks/create.tsx
    - client/test/unit/routes/stacks/config-tab.test.tsx
    - client/test/integration/stacks.spec.ts
key-decisions:
  - "Task 1's package-legitimacy checkpoint was presented to and approved by the developer in a prior session turn (2026-09-27T17:32:19Z, all four packages confirmed as-is, no replacements) — this execution resumed directly at Task 2 per that recorded approval, re-verified against .planning/STATE.md before any yarn add ran."
  - "EditorView.contentAttributes.of({'aria-label': ariaLabel}) (imported from @uiw/react-codemirror's own re-export of @codemirror/view, per the plan's key_link) wires the accessible name onto CodeMirror's built-in role=textbox content element — no wrapper div needs its own role/label."
  - "create.tsx's composeContent FormField renders ComposeEditor directly inside FormItem, not wrapped in FormControl — FormControl's Slot would forward its generated id onto ComposeEditor's outer wrapper div instead of CodeMirror's actual textbox, breaking the id-based label association the plan's key_link anticipated; the accessible name instead comes entirely from ComposeEditor's own ariaLabel prop, and FormLabel/FormDescription/FormMessage are kept for layout/validation-message rendering only."
  - "E2E's 'invalid YAML' fixture uses duplicate mapping keys, not an unclosed quote as originally drafted: the unclosed-quote parser error's position lands on a single line-break character, and CodeMirror's lint-decoration logic renders a zero-width/line-break-only range as a `.cm-lintPoint` widget rather than a `.cm-lintRange` mark. Duplicate keys point at a real character ('w' of the repeated key), producing the `.cm-lintRange-error` mark the plan's acceptance criteria greps for."
  - "Playwright's keyboard.insertText() (not .fill(), which doesn't work on a contenteditable root, and not .type(), whose per-keystroke Enter triggers the yaml() extension's auto-indent and would corrupt typed indentation) is the chosen way to replace a CodeMirror editor's content in E2E tests — a reusable replaceCodeEditorContent() helper was added to stacks.spec.ts."
patterns-established:
  - "CodeEditor (generic) + a domain wrapper supplying extensions/placeholder is the composition pattern for any future CodeMirror-based editor in this app (plan 11-12's env editor is the next consumer)."
requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-18 (CodeMirror 6 compose editor, not Monaco) and D-19 (basic YAML syntax validation only) on both compose editing surfaces (Config tab and Create Stack page)."
coverage:
  - id: D1
    description: "Both compose-editing surfaces (Config tab, Create Stack page) render a CodeMirror 6 editor via @uiw/react-codemirror with YAML syntax highlighting; no Monaco dependency exists anywhere in the tree (D-18)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/code-editor.test.tsx, client/test/unit/routes/stacks/config-tab.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'create stack submits and redirects to detail page', 'stack detail config tab: edit and save the compose file (D-02/D-03)'"
        status: pass
      - kind: other
        ref: "grep -c '\"@uiw/react-codemirror\"' client/package.json -> 1; grep -q monaco client/package.json -> not found"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invalid YAML shows an inline error diagnostic with the yaml package's own message verbatim; valid YAML shows none; no docker-compose-schema linting exists (D-19)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/yaml-syntax-linter.test.ts — valid/unclosed-quote/duplicate-key cases, message verbatim assertion"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'stack detail config tab: invalid YAML shows a CodeMirror lint marker, fixing it clears it (D-19)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "CodeMirror theme follows next-themes' resolvedTheme (D-15 integration) — dark resolvedTheme renders a visibly different CodeMirror theme than light"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/code-editor.test.tsx — 'renders a different CodeMirror theme class under a dark resolved theme than under light'"
        status: pass
    human_judgment: false
  - id: D4
    description: "The dirty guard (RESEARCH Pitfall 3) is untouched — ComposeEditor binds to files.composeContent/setComposeContent exactly like the text area did, so a background refresh mid-edit still cannot clobber an unsaved change"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "code review: config-tab.tsx's ComposeEditor value/onChange props are wired to the same files.composeContent/files.setComposeContent as before; use-stack-config-files.ts (11-01) is unmodified by this plan"
        status: pass
    human_judgment: true
    rationale: "use-stack-config-files.test.ts's existing late-load-response-while-dirty case (11-01) was not re-run against a live CodeMirror instance in this session — the wiring is unchanged at the prop-contract level (verified by code review and the config-tab.test.tsx wiring test), but a CodeMirror-specific timing edge case was not independently re-probed."
  - id: D5
    description: "The compose editor is reachable by assistive tech and tests as a textbox named 'Docker Compose File' on both surfaces"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/code-editor.test.tsx, client/test/unit/routes/stacks/config-tab.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — getByRole('textbox', {name: 'Docker Compose File'}) used across 4 tests"
        status: pass
    human_judgment: false
  - id: D6
    description: "Package legitimacy: @uiw/react-codemirror and yaml (SUS-flagged by the automated gate on recency only) are confirmed by a human before yarn add runs"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: ".planning/STATE.md's status field records developer approval at 2026-09-27T17:32:19Z, all four packages, no replacements"
        status: pass
    human_judgment: true
    rationale: "The approval itself is a human judgment call by design (that is the point of the checkpoint) — this session verified the record exists and proceeded per it, rather than re-presenting the checkpoint."
duration: ~55min
completed: 2026-09-29
status: complete
---

# Phase 11 Plan 09: CodeMirror YAML Compose Editor Summary

**Replaced the plain `<Textarea>` compose editors on the Config tab and Create Stack page with a CodeMirror 6 YAML editor (via `@uiw/react-codemirror`) that shows inline syntax-error diagnostics from the `yaml` package and follows the app's light/dark theme.**

## Performance
- **Duration:** ~55min
- **Tasks:** 3 (Task 1 pre-approved, Tasks 2-3 executed this session)
- **Files modified:** 12 (6 created, 6 modified)

## Package Legitimacy Verification (Task 1)

Developer approved all four packages on **2026-09-27T17:32:19Z**, no replacements:
- `@uiw/react-codemirror` ^4.25.12
- `yaml` ^2.9.1
- `@codemirror/lang-yaml` ^6.1.3
- `@codemirror/lint` ^6.9.7

`@uiw/react-codemirror` and `yaml` were flagged `SUS` by the automated legitimacy gate on a recency-only heuristic (both are long-established, high-download packages — `yaml` is already a direct dependency of `server/package.json`). This execution resumed directly at Task 2 per the recorded approval in `.planning/STATE.md`; the checkpoint was not re-presented, and no install command ran before that approval existed.

## Accomplishments
- Installed `@uiw/react-codemirror@^4.25.12`, `@codemirror/lang-yaml@^6.1.3`, `@codemirror/lint@^6.9.7`, `yaml@^2.9.1` into `@docktor/client` (D-18: no Monaco anywhere in the tree).
- New `lib/yaml-syntax-linter.ts`: `yamlSyntaxDiagnostics(source)` — a pure function parsing YAML via `parseDocument()` and mapping each `doc.errors` entry to a `Diagnostic` with the `yaml` package's own error message verbatim, positions clamped to `[0, max(source.length, 1)]` with `from < to` always. `yamlSyntaxLinter` wires it into CodeMirror via `@codemirror/lint`'s `linter()`. No docker-compose schema/service/key linting exists anywhere (D-19).
- New `components/common/code-editor.tsx`: `CodeEditor` — a generic, domain-free wrapper around `@uiw/react-codemirror`, themed off `next-themes`' `useTheme().resolvedTheme` (`"dark"` → CodeMirror's `"dark"` theme string, everything else → `"light"`), with `basicSetup={{lineNumbers, foldGutter, highlightActiveLine}}`, a memoised extensions array, and the accessible name wired via `EditorView.contentAttributes.of({"aria-label": ariaLabel})` onto CodeMirror's built-in `role="textbox"` content element.
- New `components/domain/stack/compose-editor.tsx`: `ComposeEditor` — composes `CodeEditor` with `[yaml(), yamlSyntaxLinter, lintGutter()]` and a muted `"services:"` placeholder for the empty-document UI-SPEC row.
- `test/setup.ts`: guarded `Range.prototype.getClientRects()`/`getBoundingClientRect()` jsdom shims, since jsdom implements neither and CodeMirror needs both to measure text during layout.
- Wired `ComposeEditor` into `config-tab.tsx`'s Compose File section (Environment section untouched — plan 11-12 owns it) and into `create.tsx`'s `composeContent` `FormField`, rendered directly inside `FormItem` rather than `FormControl` (whose `Slot` would otherwise misdirect the generated id onto CodeMirror's wrapper div instead of its textbox).
- Updated `stacks.spec.ts`: a new `replaceCodeEditorContent()` helper drives CodeMirror via `click()` + `ControlOrMeta+a` + `Backspace` + `keyboard.insertText()` (not `.fill()`, which doesn't work on a contenteditable root, and not `.type()`, whose real keystrokes trip the `yaml()` extension's auto-indent on Enter). Both the create-stack and config-tab save tests now edit through the editor; a new test confirms a duplicate-mapping-keys document shows a `.cm-lintRange-error` marker and that fixing the document clears it.

## CodeEditor Props (for plan 11-12)

```typescript
export interface CodeEditorProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly ariaLabel: string;
    readonly height?: string;        // default "400px"
    readonly extensions?: Extension[]; // default []
    readonly placeholder?: string;
    readonly readOnly?: boolean;      // default false
    readonly className?: string;
}

export function CodeEditor(props: Readonly<CodeEditorProps>): React.JSX.Element;
```

`CodeEditor` has zero stack/compose vocabulary (`grep -cE 'Stack|Compose' code-editor.tsx` → 0) — plan 11-12's env editor raw mode can import it directly with no language extension (`extensions={[]}`) for a plain themed text editor, exactly like `ComposeEditor` does with `[yaml(), yamlSyntaxLinter, lintGutter()]`.

## Task Commits
1. **Task 1: Package legitimacy verification** — pre-approved by developer 2026-09-27T17:32:19Z (no commit — verification-only gate; recorded in `.planning/STATE.md`)
2. **Task 2 RED: yaml-syntax-linter + CodeEditor tests** — `c2c9ebc` (test)
3. **Task 2 GREEN: install deps, implement CodeEditor/yamlSyntaxLinter/ComposeEditor** — `690bab7` (feat)
4. **Task 3 RED: ConfigTab wiring to ComposeEditor test** — `e24bdc8` (test)
5. **Task 3 GREEN: wire ComposeEditor into ConfigTab/create.tsx** — `6df6363` (feat)
6. **Task 3: update stacks.spec.ts for CodeMirror + log deferred item** — `11f0841` (test)

**Plan metadata:** committed separately after this SUMMARY (docs commit).

## Files Created/Modified
- `client/package.json`, `yarn.lock` — the four new dependencies
- `client/src/components/common/code-editor.tsx` — `CodeEditor` (generic themed CodeMirror wrapper)
- `client/src/components/domain/stack/compose-editor.tsx` — `ComposeEditor`
- `client/src/lib/yaml-syntax-linter.ts` — `yamlSyntaxDiagnostics()`, `yamlSyntaxLinter`
- `client/test/setup.ts` — guarded `Range` jsdom shims
- `client/src/routes/app/stacks/components/config-tab.tsx` — Compose File section now renders `ComposeEditor`
- `client/src/routes/app/stacks/create.tsx` — `composeContent` field now renders `ComposeEditor`
- `client/test/unit/lib/yaml-syntax-linter.test.ts`, `client/test/unit/components/common/code-editor.test.tsx` — new unit coverage
- `client/test/unit/routes/stacks/config-tab.test.tsx` — mocks `ComposeEditor`, asserts wiring
- `client/test/integration/stacks.spec.ts` — `replaceCodeEditorContent()` helper, updated create/save tests, new lint-marker E2E test
- `.planning/phases/11-ui-rework/deferred-items.md` — new, logs one out-of-scope pre-existing E2E failure

## Decisions Made
See `key-decisions` in the frontmatter: the pre-approved checkpoint resumption, the `EditorView.contentAttributes` accessible-name wiring, the `FormControl`-avoidance in `create.tsx`, the duplicate-key-not-unclosed-quote E2E fixture choice (CodeMirror's point-vs-range lint decoration logic), and the `keyboard.insertText()` E2E editing technique.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E "invalid YAML" fixture switched from an unclosed quote to duplicate mapping keys**
- **Found during:** Task 3, first full `stacks.spec.ts` run
- **Issue:** The plan's draft fixture (an unclosed double quote) produces a `yaml` parser error whose `pos` range spans exactly one line-break character. CodeMirror's lint-decoration logic (`@codemirror/lint`'s `markersForDiagnostics`) renders a zero-width-or-line-break-only range as a `.cm-lintPoint` widget instead of a `.cm-lintRange` mark, so the plan's own acceptance-criteria grep target (`cm-lintRange-error`) never appeared in the DOM for that input.
- **Fix:** Switched the E2E fixture to duplicate mapping keys (`web:` repeated), whose parser error position lands on a real character (the second key's `w`), which CodeMirror renders as a proper `.cm-lintRange-error` mark. Confirmed via a scratch debug spec (deleted after use) that dumped `.cm-content`/`.cm-gutters` innerHTML for both fixtures before picking this one.
- **Files modified:** `client/test/integration/stacks.spec.ts`
- **Verification:** `PLAYWRIGHT_PORT=5178 yarn workspace @docktor/client test:integration stacks.spec.ts` — the new test passes; `yamlSyntaxDiagnostics` itself is unaffected (both fixtures still produce a correct diagnostic per `yaml-syntax-linter.test.ts`, which deliberately keeps the unclosed-quote case to cover that error shape at the unit level).
- **Commit:** `11f0841`

**2. [Rule 3 - Blocker] `yarn` not directly on `PATH`; a shim was used for local E2E verification only**
- **Found during:** Task 3, running the Playwright suite
- **Issue:** Consistent with prior plans in this phase (per STATE.md/11-03-SUMMARY.md), bare `yarn` is not resolvable in this sandbox (corepack's global-symlink step hit `EACCES`); Playwright's own `webServer.command` in `playwright.config.ts` literally shells out to `yarn workspace @docktor/client exec vite ...`, which fails with `yarn: not found` when spawned as a subprocess (unlike a direct `corepack yarn ...` invocation from this session's own shell).
- **Fix:** Used a scratch, session-local `yarn` shim script (`exec corepack yarn "$@"`) placed on `PATH` only for the Playwright subprocess invocation. No repository file was touched — `client/playwright.config.ts` is unmodified from what plan 11-01 wrote.
- **Files modified:** none (scratch environment workaround only, outside the repository)
- **Commit:** n/a (no repository change)

### Out-of-Scope Discovery (logged, not fixed)

**Pre-existing duplicate "Running" text breaks a strict-mode E2E locator, unrelated to this plan's changes.** `stacks.spec.ts`'s `stack detail page shows stack info and services` test fails with a Playwright strict-mode violation: `getByText("Running", {exact: true})` resolves to both the header's `StackStatusBadge` (11-02/11-06) and a second "Running" label inside the Overview tab's activity/status pill (11-06's unified timeline). Neither `overview-tab.tsx` nor `stack-detail-header.tsx` is in this plan's `files_modified` list, and this plan makes no change to header/status/overview rendering — its scope is the Compose File editor only. Logged to `.planning/phases/11-ui-rework/deferred-items.md` and the `.planning/WINDOWS.md` ledger (kind: `deviation`, phase 11, status `open`) per the scope-boundary rule, rather than fixed inline.

**Total deviations:** 2 auto-fixed (1 bug, 1 blocker) + 1 out-of-scope discovery logged. **Impact:** none on this plan's own deliverables — all of 11-09's new/updated tests pass; the one failing E2E test is pre-existing and outside this plan's scope.

## Issues Encountered

- The full client unit suite (`yarn workspace @docktor/client test`) ran clean this session: 55 test files, 462 tests, all passing — no flakes observed this run.
- `yarn workspace @docktor/client test:integration stacks.spec.ts` (`PLAYWRIGHT_PORT=5178`): 13/14 passing. The one failure is the pre-existing, out-of-scope issue documented above — confirmed unrelated to this plan by inspecting `overview-tab.tsx`/`stack-detail-header.tsx` (neither file touched by this plan) and by the fact that both duplicate-source components (`StackStatusBadge`, the Overview activity pill) already existed before this plan started.
- `yarn workspace @docktor/client exec tsc -b` — clean, zero errors, run twice (after Task 2 and again after Task 3).

## User Setup Required

None beyond the already-recorded Task 1 package-legitimacy approval — no further external service configuration required.

## Next Phase Readiness

Ready for 11-10 (unsaved-changes guard). `CodeEditor`'s prop contract (documented above) is stable for plan 11-12 to reuse directly for the env editor's raw mode with no language extension. The one open item is the pre-existing duplicate-"Running"-text E2E locator conflict (`deferred-items.md`), which does not block 11-10 or 11-12 — it affects only one assertion in one existing E2E test, unrelated to either plan's scope.

## Self-Check: PASSED

All created/modified files verified present on disk (`client/src/components/common/code-editor.tsx`, `client/src/components/domain/stack/compose-editor.tsx`, `client/src/lib/yaml-syntax-linter.ts`, `.planning/phases/11-ui-rework/deferred-items.md`, and all modified files listed above); all 5 task commits (`c2c9ebc`, `690bab7`, `e24bdc8`, `6df6363`, `11f0841`) verified present in `git log`.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-29*
