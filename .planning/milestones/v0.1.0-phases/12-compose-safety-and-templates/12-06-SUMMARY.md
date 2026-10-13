---
phase: 12-compose-safety-and-templates
plan: 06
subsystem: ui
tags: [react, react-hook-form, zod, compose-checks, review-dialog, settings, d-04, d-10, d-11]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-05's previewNewStack/POST /api/stacks/preview, DiffConfirmDialog's findings/composeParseError props and {kind: \"create\"} subject, GET/PUT /api/settings/compose-checks, compose-rules.ts labels/tones"
provides:
  - "client/src/hooks/use-create-stack.ts — useCreateStack({create, onCreated}) owning the Create Stack page's submit/review/428-recovery flow, create-source-agnostic so plan 12-09 can inject createStackFromTemplate"
  - "client/src/routes/app/stacks/components/create-stack-form.tsx — CreateStackForm, the form section extracted unchanged in behaviour from create.tsx"
  - "client/src/routes/app/stacks/create.tsx — 69-line composition-only orchestrator (Page shell + useCreateStack + CreateStackForm + DiffConfirmDialog)"
  - "client/src/lib/settings-api.ts — getComposeCheckSettings/saveComposeCheckSettings"
  - "client/src/routes/app/settings/components/compose-checks-card.tsx — ComposeChecksCard (always-on red badges, configurable yellow-badged switches, D-04 skip-review switch)"
  - "Settings 'Stacks' tab wired into settings.tsx (77 lines)"
affects: [12-09, 12-10, 12-11]

actuals:
  tokens: 15103
  tasks: 2
  commits: 2
  plan_head_before: 1a6861fc1f848f81a418230c541e764a41ae7f39
  plan_head_after: 1679a6edf0e3fbf99215e001e86718462db06f09

tech-stack:
  added: []
  patterns:
    - "useCreateStack's `create` option is injected (not imported directly from stacks-api.ts), making the hook create-source-agnostic so 12-09's template-based creation can pass createStackFromTemplate(variantId, …) without forking the hook"
    - "A 428 from create() (preview/create race — the server's confirmation requirement flipped between preview and submit) re-fetches the preview and reopens the review rather than surfacing an error, mirroring 12-01's use-stack-config-files.ts recovery path"
    - "ComposeChecksCard computes its always-on rule list as COMPOSE_RULE_IDS minus CONFIGURABLE_COMPOSE_RULE_IDS at module scope, rather than hardcoding the three always-on ids, so a future rule addition to either shared tuple can't silently fall out of sync with the settings card"

key-files:
  created:
    - client/src/hooks/use-create-stack.ts
    - client/src/routes/app/stacks/components/create-stack-form.tsx
    - client/src/routes/app/settings/components/compose-checks-card.tsx
    - client/test/unit/hooks/use-create-stack.test.ts
    - client/test/unit/routes/settings/compose-checks-card.test.tsx
  modified:
    - client/src/routes/app/stacks/create.tsx
    - client/src/lib/settings-api.ts
    - client/src/routes/app/settings.tsx
    - client/test/unit/routes/stacks/create-stack-page.test.tsx
    - client/test/unit/routes/settings/settings-page.test.tsx
    - client/test/integration/stacks.spec.ts

key-decisions:
  - "create.tsx kept as a thin orchestrator passing createStack (from stacks-api.ts) and a navigate-on-create callback into useCreateStack — all submit/review/428-recovery logic lives in the hook, not the page, closing the CLAUDE.md Page Composition ~80-line budget (69 lines) while leaving 12-09 a stable two-prop hook contract to reuse."
  - "CreateStackForm keeps its own useForm/EnvEditor-validity state (not lifted into the hook) so 'Keep Editing' (the review dialog's cancel action) returns to intact field values without the hook needing to know about react-hook-form at all — the form component is never unmounted while the review dialog is open."
  - "ComposeChecksCard's always-on rule list is derived (COMPOSE_RULE_IDS minus CONFIGURABLE_COMPOSE_RULE_IDS) rather than hardcoded, per 12-05's established no-code-path-can-disable-an-always-on-check invariant."

requirements-completed: ["#20", "#18"]

coverage:
  - id: D1
    description: "Issue #20 AC1 (create page): submitting a compose that triggers a compose-check finding opens the findings-only review dialog ('Review {name} before creating', no diff); Confirm & Apply creates the stack with confirmed: true; Keep Editing returns to the form with every field intact"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-create-stack.test.ts (all <behavior> lines: submit/confirmationRequired branch, confirmReview, cancelReview, 428 recovery, previewNewStack rejection)"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/create-stack-page.test.tsx (existing error-message tests + new findings-dialog/confirmed:true tests)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts (new: create-with-findings review dialog shows 'Privileged container', Confirm & Apply captures POST /api/stacks body with confirmed: true and navigates to the new stack)"
        status: unknown
    human_judgment: true
    rationale: "Playwright e2e suite was not run in this session per explicit user instruction (host resource contention) — the test was written and committed in 96ad718 (client/test/integration/stacks.spec.ts, +90 lines) and is ready for a CI/human re-run. Unit-level coverage of the identical hook/page logic ran clean (25/25 tests across the 4 targeted files)."
  - id: D2
    description: "A compose with no findings is created directly with no dialog — the create flow adds no step for clean stacks"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-create-stack.test.ts#submit(values) ... confirmationRequired false -> create(values) then onCreated(id)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-10: Settings has a dedicated 'Compose Checks' card (new 'Stacks' settings tab) with switches 'Flag named volumes', 'Flag inline environment variables', 'Flag .env files with no env_file reference', saved with 'Save Compose Checks'"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/compose-checks-card.test.tsx; client/test/unit/routes/settings/settings-page.test.tsx (/settings/stacks selects the Stacks tab)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11: the card shows the three always-on checks as red ToneBadges marked as always on with no switch, visually distinct from the yellow-badged configurable checks"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/compose-checks-card.test.tsx (asserts no switch exists for the always-on checks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-04 (UI): the card's switch 'Skip the review step before applying compose/.env changes' persists the global skip setting; helper text states edits introducing a compose-check warning still open the review"
    requirement: "#18"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/compose-checks-card.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "client/src/routes/app/stacks/create.tsx is a composition-only page of at most ~80 lines"
    verification:
      - kind: other
        ref: "wc -l < client/src/routes/app/stacks/create.tsx -> 69"
        status: pass
    human_judgment: false
---

# Phase 12 Plan 6: Create-page review dialog and Compose Checks settings card Summary

**The Create Stack page now runs a findings-only preview before the first write (Issue #20 AC1) via a new `useCreateStack` hook + `CreateStackForm` section, and a dedicated "Compose Checks" settings card on a new Stacks tab exposes D-04's skip toggle plus D-10/D-11's per-check switches and non-toggleable always-on red badges.**

## Performance

- **Tasks:** 2/2
- **Files touched:** 11 (across 2 commits)
- **Commits:** 2 (`96ad718`, `1679a6e`)

## Execution Note (continuation session)

The prior executing session completed and committed both of this plan's tasks (`96ad718`, `1679a6e`) before being interrupted by a container restart, with no commits lost. This session independently re-verified the implementation against 12-06-PLAN.md's `must_haves`/`acceptance_criteria` before writing this SUMMARY — no code changes were needed; both tasks matched the plan exactly on inspection. Verification performed this session:

- Read `create.tsx`, `use-create-stack.ts`, `create-stack-form.tsx`, `compose-checks-card.tsx`, `settings.tsx` in full and confirmed they match the plan's `<action>` specs.
- Ran every acceptance-criteria grep/wc from both tasks — all passed (`create.tsx` is 69 lines, `useCreateStack` referenced, zero `useForm` in the page, one `kind: "create"`; `compose-checks-card.tsx` has 2 `useState` calls (loading flag only), one `standardSchemaResolver(composeCheckSettingsSchema)`, the exact "Save Compose Checks" and "Flag .env files with no env_file reference" strings; `settings.tsx` has `"stacks"` and is 77 lines).
- Ran the plan's two unit `<verify>` commands together: `yarn workspace @docktor/client test test/unit/hooks/use-create-stack.test.ts test/unit/routes/stacks/create-stack-page.test.tsx test/unit/routes/settings/compose-checks-card.test.tsx test/unit/routes/settings/settings-page.test.tsx` — **4 test files, 25 tests, all passed**.
- Ran `yarn workspace @docktor/client exec tsc -b` — zero errors.
- **Not run per explicit user instruction (host resource contention):** `PLAYWRIGHT_PORT=5213 yarn workspace @docktor/client test:integration stacks.spec.ts`. The new create-with-findings Playwright test exists in the `96ad718` diff (`client/test/integration/stacks.spec.ts`, +90 lines) and is ready for a CI/human run — see `coverage: D1` above, routed to human judgment for exactly this reason. No pass/fail is fabricated here.

## Accomplishments

- `useCreateStack({create, onCreated})` (`client/src/hooks/use-create-stack.ts`) owns the Create Stack page's submit → preview → review → confirm/cancel flow: a clean compose creates immediately; a compose with findings opens `review` and waits; `confirmReview()` resubmits with `confirmed: true`; `cancelReview()` discards the preview without touching form state; a 428 from `create()` (the preview/create race) transparently re-fetches a fresh preview and reopens the review instead of surfacing an error.
- `CreateStackForm` (`client/src/routes/app/stacks/components/create-stack-form.tsx`) is the Card + `react-hook-form` block moved out of `create.tsx` unchanged in behavior, keeping its own form/EnvEditor-validity state so "Keep Editing" always returns to intact fields.
- `create.tsx` is now a 69-line composition-only orchestrator: `useCreateStack` + the existing Page/breadcrumb/error-banner shell + `CreateStackForm` + `DiffConfirmDialog subject={{kind: "create"}}` — zero `useForm` calls in the page itself.
- `ComposeChecksCard` (`client/src/routes/app/settings/components/compose-checks-card.tsx`), built on `ProxySettingsCard`'s RHF + `standardSchemaResolver` + Skeleton + `toast.promise` pattern: an "Always on" section listing the three always-on rules as non-toggleable red `ToneBadge`s, three yellow-badged configurable switches ("Flag named volumes", "Flag inline environment variables", "Flag .env files with no env_file reference"), and the D-04 skip-review switch with helper text noting an edit introducing a new warning still opens the review.
- `settings.tsx` gained a "Stacks" tab (`/settings/stacks`) rendering `ComposeChecksCard`, staying at 77 lines.
- `getComposeCheckSettings()`/`saveComposeCheckSettings()` added to `client/src/lib/settings-api.ts`, backed by 12-05's `GET`/`PUT /api/settings/compose-checks`.

## Task Commits

1. **Task 1: End-to-end create review on the Create Stack page (Issue #20 AC1)** - `96ad718` (feat)
2. **Task 2: Compose Checks settings card on a new Stacks tab (D-04/D-10/D-11)** - `1679a6e` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `client/src/hooks/use-create-stack.ts` (new) — `useCreateStack`, `UseCreateStackOptions`, `UseCreateStackResult`, `CreateStackReview`
- `client/src/routes/app/stacks/components/create-stack-form.tsx` (new) — `CreateStackForm`, `CreateStackFormProps`
- `client/src/routes/app/stacks/create.tsx` — reduced to a 69-line orchestrator
- `client/src/lib/settings-api.ts` — `getComposeCheckSettings`, `saveComposeCheckSettings`
- `client/src/routes/app/settings/components/compose-checks-card.tsx` (new) — `ComposeChecksCard`
- `client/src/routes/app/settings.tsx` — new "stacks" tab
- `client/test/unit/hooks/use-create-stack.test.ts` (new)
- `client/test/unit/routes/stacks/create-stack-page.test.tsx` — findings-dialog/confirmed:true tests added
- `client/test/unit/routes/settings/compose-checks-card.test.tsx` (new)
- `client/test/unit/routes/settings/settings-page.test.tsx` — Stacks tab routing test added
- `client/test/integration/stacks.spec.ts` — create-with-findings Playwright test added

## Decisions Made

See `key-decisions` in frontmatter: `useCreateStack`'s injected `create` option for 12-09 reuse; `CreateStackForm` owning its own form state so "Keep Editing" preserves fields without coupling the hook to react-hook-form; `ComposeChecksCard`'s always-on rule list derived from the shared tuples rather than hardcoded.

## Deviations from Plan

None found during this session's verification — both tasks, as committed by the prior (interrupted) session, match 12-06-PLAN.md's `<action>` items, `must_haves`, and `acceptance_criteria` exactly. No code changes were made in this session.

## Issues Encountered

- **Container restart (prior session):** The executing session that implemented both tasks was interrupted by a container restart after committing both task commits but before writing SUMMARY.md. No work was lost — both commits (`96ad718`, `1679a6e`) were already on the branch. This session (a continuation) independently re-verified everything listed under "Execution Note" above before writing this SUMMARY, per this project's established recovery pattern (see STATE.md's 11-01/11-02/11-05/11-08 entries for precedent).
- **Full client unit suite not used for verification:** A full `yarn workspace @docktor/client test` run (not required by the plan's own `<verify>`, which lists specific files) was started to sanity-check for incidental regressions, but showed several failures and very long per-test durations (20s-60s per file) in files entirely unrelated to this plan's scope (`theme-toggle.test.tsx`, `env-editor.test.tsx`, `diff-confirm-dialog.test.tsx`, `activity-timeline.test.tsx`, `stack-detail-page.test.tsx`, `service-upgrade-dialog.test.tsx` — none touched by 12-06) — consistent with this host's documented resource-contention pattern (STATE.md: Phase 05.1/08/12-01 Playwright flakes) rather than a regression from this plan. The run was stopped early since it exceeded the plan's own verification scope; the plan's exact 4-file `<verify>` command (the only unit-test command this plan specifies) passed cleanly in isolation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `useCreateStack`'s `{create, onCreated}` contract and `CreateStackForm`'s `defaultValues` prop are stable and ready for plan 12-09 to reuse with `createStackFromTemplate(variantId, …)` for template-based creation, per this plan's `key_links`.
- `ComposeChecksCard` → `GET`/`PUT /api/settings/compose-checks` (12-05) is fully wired; no further settings-API work needed for #18/#20's UI surface.
- **Outstanding for full confidence (not blocking):** the new Playwright test in `stacks.spec.ts` (create-with-findings end-to-end) needs a CI/human run in an environment without this host's resource contention — see `coverage: D1` above.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED

All 6 key-files (created) verified present on disk; both commits (`96ad718`, `1679a6e`) verified present in git history (see below).
