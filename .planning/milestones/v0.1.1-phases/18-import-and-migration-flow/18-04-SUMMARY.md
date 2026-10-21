---
phase: 18-import-and-migration-flow
plan: 04
subsystem: ui
tags: [react, vitest, unified-diff, codemirror, secret-masking, dialog, playwright]

requires:
  - phase: 18-import-and-migration-flow
    provides: plan 18-02 preview endpoints returning a real UnifiedDiff
provides:
  - Migration dialog review step rendering the compose changes with the shared UnifiedDiffView and +N / -N ToneBadge counters
  - Widened migration dialog (sm:max-w-5xl) with pinned header/footer and a scrolling body
  - lib/env-mask.ts, one env secret-masking helper shared by the migration preview and the stack-edit review dialog
  - Masked read-only CodeEditor preview of the extracted .env with a reveal toggle
affects: [18-05, import-flow, setup-wizard]

plan_head_before: deb34f318b9bf9f9c73593689ca4787719f286ef
plan_head_after: 20cab102929af29fe6fc84f99f7918ab9553c682

actuals:
  tokens: 10000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One diff renderer in the client: UnifiedDiffView; MigrationPreview.diff reuses the UnifiedDiff type from stacks-api"
    - "Display-only secret masking lives in lib/env-mask.ts and is consumed by both review dialogs"
    - "Reveal-secrets state is local to the step component so unmount (Back, dialog close) resets the mask"

key-files:
  created:
    - client/src/routes/setup/components/migration-review-step.tsx
    - client/src/lib/env-mask.ts
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/unit/lib/env-mask.test.ts
  modified:
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/lib/brownfield-types.ts
    - client/src/components/domain/stack/diff-confirm-dialog.tsx
    - client/test/integration/setup-wizard.spec.ts
  deleted:
    - client/src/routes/setup/components/diff-viewer.tsx

key-decisions:
  - "Dialog width uses the sm:-prefixed sm:max-w-5xl so tailwind-merge overrides the primitive's sm:max-w-lg (the unprefixed width never won, #72)"
  - "Reveal state is local to MigrationReviewStep; no explicit reset effect is needed because the step unmounts on Back and the wizard unmounts on close"
  - "Env masking extracted to client/src/lib/env-mask.ts (planner-chosen name) and diff-confirm-dialog delegates to it with no behaviour change"

patterns-established:
  - "Review-step section component co-located under routes/setup/components, orchestrated by the wizard shell"

requirements-completed: [MIG-01, MIG-02]

coverage:
  - id: D1
    description: "Migration preview renders as a real line diff (added/removed rows individually marked) with +N / -N counters in the shared UnifiedDiffView"
    requirement: MIG-02
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#renders the preview as a real line diff with +N / -N counters"
        status: pass
    human_judgment: false
  - id: D2
    description: "Empty diff, loading and failed-preview states behave per UI-SPEC (copy, disabled button, toast with API message or fallback, step 1 kept)"
    requirement: MIG-02
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#shows the empty state with +0 / -0 counters when there are no hunks"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#disables the button and stays on step 1 while the preview is in flight"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#toasts the API message and keeps selections when the preview fails"
        status: pass
    human_judgment: false
  - id: D3
    description: "Extracted .env preview is a read-only editor with secret values masked until revealed, and re-masked after Back or close"
    requirement: MIG-02
    verification:
      - kind: unit
        ref: "client/test/unit/lib/env-mask.test.ts"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#extracted .env preview"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dialog opens at up to 1024px on desktop and near full width on phones with pinned header/footer and a scrolling body, with nothing clipped"
    requirement: MIG-01
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#opens as a wide dialog that caps its height so header and footer can stay pinned"
        status: pass
    human_judgment: true
    rationale: "Unit test only asserts the width/height classes; real layout at desktop and phone widths is verified by the CI Playwright chromium and mobile-chromium projects and visual review"

duration: 3min
completed: 2026-10-15
status: complete
---

# Phase 18 Plan 04: Migration Review Step Summary

**Migration dialog now shows the compose changes as a real line diff in the shared UnifiedDiffView inside a widened, pinned-footer dialog, with the extracted .env in a masked read-only CodeEditor backed by a shared env-mask helper.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-15T07:22:09Z
- **Completed:** 2026-10-15T07:25:21Z
- **Tasks:** 2 (both TDD; 4 task commits)
- **Files modified:** 9 (4 created, 4 modified, 1 deleted)

## Accomplishments
- `MigrationPreview.diff` is now the shared `UnifiedDiff`; new `MigrationReviewStep` renders it with `UnifiedDiffView` in a `ScrollArea` capped at 50vh, with green `+N` and red `−N` `ToneBadge` counters and the empty-diff copy ("No changes to your compose file.").
- Migration dialog widened with `sm:max-w-5xl` (plus `max-h-[90dvh]`, `p-4 sm:p-6`), body wrapped in `min-h-0 flex-1 overflow-y-auto` so header and footer stay pinned; footer buttons are `w-full sm:w-auto`.
- Step 1 copy and error handling: "Cancel Migration" / "Preview Changes" / "Generating preview…"; a failed preview toasts the API message (readable fallback otherwise) and stays on step 1 with selections intact.
- `client/src/lib/env-mask.ts` extracted from `diff-confirm-dialog.tsx`; both dialogs share it. The extracted `.env` renders in a read-only `CodeEditor` with secret values masked until "Show secret values" is clicked; the mask resets on Back and on close because the step state unmounts.
- Side-by-side `diff-viewer.tsx` and the local text-diff parser deleted; exactly one diff renderer remains. Playwright "Migration wizard flow" mocks moved to the `UnifiedDiff` response shape.

## Task Commits

1. **Task 1 (tracer, TDD): preview response renders as a real line diff in the widened dialog**
   - RED `d44ee85` (test)
   - GREEN `82aab7a` (feat)
2. **Task 2 (TDD): masked read-only .env preview with shared masking helper**
   - RED `63cd7b1` (test)
   - GREEN `20cab10` (feat)

**Plan metadata:** the `docs(18-04)` commit that adds this summary and the STATE/ROADMAP updates.

## Files Created/Modified
- `client/src/routes/setup/components/migration-review-step.tsx` - step 2 section: counters, scrollable diff, empty state, masked `.env` editor with reveal toggle
- `client/src/lib/env-mask.ts` - `SECRET_MASK`, `maskEnvLine`, `envLineHasSecret`, `maskEnvText`, `envTextHasSecret`
- `client/src/routes/setup/components/migration-wizard.tsx` - widened shell, `preview` state, new step-1 copy, error fallback
- `client/src/lib/brownfield-types.ts` - `diff: UnifiedDiff`
- `client/src/components/domain/stack/diff-confirm-dialog.tsx` - delegates to env-mask
- `client/src/routes/setup/components/diff-viewer.tsx` - deleted
- `client/test/unit/routes/setup/migration-wizard.test.tsx`, `client/test/unit/lib/env-mask.test.ts` - new tests
- `client/test/integration/setup-wizard.spec.ts` - migration flow mocks/assertions updated

## Decisions Made
- Reveal state is local to `MigrationReviewStep`; no reset effect needed since unmount resets it (documented in a code comment).
- Everything else followed the plan (class strings, copy, helper name `env-mask.ts`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Verification was limited to the targeted vitest files per the project memory rule: `migration-wizard.test.tsx`, `env-mask.test.ts` and `diff-confirm-dialog.test.tsx` pass (46 tests, the 23 existing dialog tests unchanged). **Deferred to CI:** client `tsc --build` (the `MigrationPreview.diff` type change must compile at the `setup-api.ts`, `import-api.ts` and `brownfield-import.tsx` call sites, which only pass the type through) and the Playwright `chromium` / `mobile-chromium` runs of the updated "Migration wizard flow" specs.

## Known Stubs

None.

## Threat Flags

None. T-18-14 (secret exposure) and T-18-15 (injection) are mitigated as planned: masking by default with explicit reveal, content rendered as React text nodes and CodeMirror document text, no raw-HTML rendering.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
Plan 18-05 can build the four-step flow on this shell: step 2 keeps its current footer (Back, Confirm & Migrate), and `MigrationReviewStep` is ready to sit under the step indicator. CI must confirm the typecheck and Playwright results listed above.

## Self-Check: PASSED

- Created files exist: `migration-review-step.tsx`, `env-mask.ts`, `migration-wizard.test.tsx`, `env-mask.test.ts` (verified); `diff-viewer.tsx` absent.
- Commits `d44ee85`, `82aab7a`, `63cd7b1`, `20cab10` are ancestors of HEAD.
- All Task 1 and Task 2 acceptance greps pass; verify commands exit 0.

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-15*
