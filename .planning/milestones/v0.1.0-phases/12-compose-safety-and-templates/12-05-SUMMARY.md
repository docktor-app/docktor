---
phase: 12-compose-safety-and-templates
plan: 05
subsystem: api
tags: [rule-engine, review-gate, compose, settings, findings, d-04, d-10, d-11]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-01's review-before-apply gate (ComposeReviewService.previewStackChange, ConfirmationRequiredError, DiffConfirmDialog, UnifiedDiffView's annotations slot) and 12-02's compose-check rule engine (ComposeRuleEngine, composeRuleEngine singleton, COMPOSE_RULE_IDS/CONFIGURABLE_COMPOSE_RULE_IDS/composeCheckSettingsSchema)"
provides:
  - "server/src/application/compose-review-service.ts — ReviewFinding, previewStackChange (findings + D-04 confirmationRequired formula), previewNewStack (D-02 create-flow preview), evaluateCurrentStack (D-09 deploy re-check entry point for 12-08)"
  - "server/src/application/settings-service.ts — COMPOSE_CHECK_SETTING_KEYS, getComposeCheckSettings/saveComposeCheckSettings"
  - "GET/PUT /api/settings/compose-checks, POST /api/stacks/preview"
  - "StackService.createStack's pre-write confirmation check (StackChangeReviewer.previewNewStack)"
  - "client/src/lib/compose-rules.ts — COMPOSE_RULE_LABELS, COMPOSE_RULE_EXPLANATIONS, composeFindingTone"
  - "client/src/components/domain/stack/compose-warning-badge.tsx — ComposeWarningBadge"
  - "DiffConfirmDialog's findings/composeParseError props and ReviewSubject's 'create' variant"
affects: [12-06, 12-07, 12-08]

actuals:
  tokens: 25126
  tasks: 3
  commits: 3
  plan_head_before: e4ab020a3823b3d69580aeaec763f85b53704036
  plan_head_after: ce92a2a6c7b46a0079b7b71c7a14c1e05756142f

tech-stack:
  added: []
  patterns:
    - "Finding identity key (ruleId + serviceName + message) decides 'introduced' — stable across a before/after evaluation pair, independent of line number (which can shift as unrelated lines are added/removed above it)"
    - "D-04 x #20 reconciliation formula: confirmationRequired = hasChanges && (!skipReview || findings.some(f => f.introduced)) — the skip toggle only ever suppresses confirmation for an edit that introduces zero findings; a pre-existing finding never re-triggers it, a newly introduced one always does"
    - "Client-side StackChangePreview.findings/composeParseError declared optional (unlike the server's always-present response fields) so a pre-12-05 test/mock literal keeps type-checking without every new field — DiffConfirmDialog defaults an absent findings/composeParseError to an empty/null treatment"
    - "DiffConfirmDialog anchors a finding under its diff line (via UnifiedDiffView's annotations map) only for a compose-edit subject whose line is a visible new-file line in some hunk; every other finding (env subject, unanchored line, create subject) is listed above the diff instead"

key-files:
  created:
    - client/src/lib/compose-rules.ts
    - client/src/components/domain/stack/compose-warning-badge.tsx
    - client/test/unit/lib/compose-rules.test.ts
    - client/test/unit/components/domain/stack/compose-warning-badge.test.tsx
    - server/test/integration/compose-checks.test.ts
  modified:
    - server/src/application/compose-review-service.ts
    - server/src/application/settings-service.ts
    - server/src/application/index.ts
    - server/src/application/stack-service.ts
    - server/src/routes/settings.ts
    - server/src/routes/stacks.ts
    - client/src/lib/stacks-api.ts
    - client/src/components/domain/stack/diff-confirm-dialog.tsx
    - client/src/routes/app/stacks/components/config-tab.tsx
    - server/test/unit/application/compose-review-service.test.ts
    - server/test/unit/application/settings-service.test.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/integration/stacks.test.ts
    - client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx
    - client/test/integration/stacks.spec.ts

key-decisions:
  - "Implemented Task 1 (findings in the edit review), Task 2 (D-04/D-10 settings API + confirmationRequired formula), and Task 3 (create-path enforcement + evaluateCurrentStack) as one coherent engineering pass rather than three independently-buildable intermediate states, because all three land in the same small set of tightly-coupled files (compose-review-service.ts touched by all three; stacks-api.ts and diff-confirm-dialog.tsx touched by Tasks 1 and 3). Splitting further would have meant writing Task 1's intentionally-incomplete confirmationRequired = hasChanges formula, committing it, then immediately rewriting it in Task 2's commit — a worse commit history, not a better one. The three commits are instead split along the task-exclusive files each task uniquely owns (routes/settings.ts + compose-checks.test.ts for Task 2; stack-service.ts + routes/stacks.ts + stacks.test.ts for Task 3), with the shared files landing in the Task 1 commit. Each commit message documents this explicitly. Every task's own <verify>/<acceptance_criteria> passed against the final state."
  - "Finding introduced/not-introduced is decided by identity key (ruleId::serviceName::message), not by line number — a line number shifts whenever unrelated lines are added/removed above it, which would otherwise misclassify an untouched finding as 'introduced' on an edit that only moved it down a line."
  - "previewStackChange now reads both the compose AND env file on every call, regardless of which field is being edited (a deliberate behavior change from 12-01's diff-only preview, which only read the file(s) actually being compared) — the rule engine's hasEnvFile context needs the current .env state even for a compose-only edit, so missingEnvFileRule evaluates correctly. Documented and the two superseded unit test assertions ('never calls fs.readEnv/readCompose for an X-only submission') were updated to assert the new, intentional behavior instead."
  - "ComposeReviewService.previewNewStack never consults the skip-review setting — D-02 states creating a stack never shows a diff step, so there is no diff step for the skip toggle to skip; confirmationRequired there is purely 'findings.length > 0'."
  - "StackChangePreview's findings/composeParseError are optional on the CLIENT type (unlike the server's response, which always includes them) specifically so client/test/unit/routes/stacks/config-tab.test.tsx's existing preview literals — out of this plan's declared file scope — kept type-checking unmodified; DiffConfirmDialog's own findings/composeParseError props are likewise optional with safe defaults."

requirements-completed: ["#20", "#18"]

coverage:
  - id: D-03
    description: "The review dialog shows the diff AND every compose-check finding together; a finding whose line is visible in the diff is rendered directly under that line, every other finding is listed above the diff with its line number"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx#Issue #20/D-03: compose-check findings in the review dialog"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts#a finding on the new privileged: true line renders its badge inside the diff annotation for that line (Issue #20/D-03/D-11)"
        status: pass
    human_judgment: false
  - id: D-11
    description: "Always-on findings render red; configurable findings render yellow; each badge has a one-sentence tooltip"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/compose-warning-badge.test.tsx, client/test/unit/lib/compose-rules.test.ts"
        status: pass
    human_judgment: false
  - id: "Issue #20/ROADMAP SC3 (edit half)"
    description: "An edit introducing privileged/Docker-socket/bind-outside-stack cannot be applied without passing through confirmation — tested at 12-01; this plan adds the finding to the dialog itself"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/application/compose-review-service.test.ts#flags privileged: true on the new content, line 4, with introduced: true"
        status: pass
    human_judgment: false
  - id: "Issue #20/ROADMAP SC3 (create half, D-02, T-12-20)"
    description: "Creating a stack whose compose contains a dangerous finding cannot be applied without confirmation — POST /api/stacks answers 428 without confirmed: true"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#Issue #20/D-02/T-12-20: findings-only review confirmation gate"
        status: pass
      - kind: integration
        ref: "server/test/integration/stacks.test.ts#POST /api/stacks with a privileged compose and no confirmed flag -> 428, and GET /api/stacks lists nothing"
        status: unknown
    human_judgment: true
    rationale: "Written to exercise the full 428/201 contract end to end against a real DB, but could not run live in this sandbox — testcontainers starts the Postgres container but `prisma db push` then fails with P1001 (can't reach the published port), the same environmental block documented in STATE.md for prior phases (05.1-01, 08-01, 12-01). A human/CI re-run is required to confirm this live."
  - id: "Issue #20: all checks warn, none block"
    description: "After confirmation every save and create goes through regardless of findings"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#creates the stack when confirmed: true is sent, even though confirmationRequired would be true, without calling the reviewer"
        status: pass
    human_judgment: false
  - id: "D-04 (server)"
    description: "When diffConfirm.skip is on, an edit introducing no new finding applies immediately; an edit introducing a finding still requires confirmation"
    verification:
      - kind: unit
        ref: "server/test/unit/application/compose-review-service.test.ts#D-04 x #20 reconciliation: skip never hides an introduced finding (6 cases)"
        status: pass
      - kind: integration
        ref: "server/test/integration/compose-checks.test.ts#with skipReview true, PUT /api/stacks/:id with a benign/dangerous compose change"
        status: unknown
    human_judgment: true
    rationale: "Same testcontainers/P1001 environmental block as above — the integration test is written and ready, the unit-level contract is fully proven."
  - id: "D-10 (server)"
    description: "GET/PUT /api/settings/compose-checks read/write {skipReview, checks} under the documented Setting keys; configurable checks default enabled, skip defaults off; a disabled check produces no findings"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/application/settings-service.test.ts#getComposeCheckSettings / saveComposeCheckSettings, server/test/unit/application/compose-review-service.test.ts#builds the enabled set from settings"
        status: pass
      - kind: integration
        ref: "server/test/integration/compose-checks.test.ts#GET/PUT defaults, round-trip, malformed-body 400, unauthenticated 401"
        status: unknown
    human_judgment: true
    rationale: "Same testcontainers/P1001 environmental block."
  - id: D-02
    description: "Creating a stack never shows a diff — the create review lists findings only and opens only when there are findings"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/application/compose-review-service.test.ts#previewNewStack, client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx#Issue #20/D-02: create-flow review subject"
        status: pass
    human_judgment: false
  - id: "Probe #20 concurrency / Pitfall 2 backstop"
    description: "Within a single save request, rule evaluation and the confirmation decision complete before any compose/.env write — an unconfirmed edit introducing privileged: true must leave the file on disk unchanged"
    verification:
      - kind: integration
        ref: "server/test/integration/stacks.test.ts#PUT /api/stacks/:id with changed compose and no confirmed flag -> 428, file on disk untouched (pre-existing from 12-01, unchanged by this plan — the ordering guarantee this backstop needs lives in StackService.updateStack's existing check-before-write sequencing)"
        status: unknown
    human_judgment: true
    rationale: "Same testcontainers/P1001 environmental block as the other integration tests in this plan. The ordering guarantee itself (confirmation check strictly before fs.writeCompose/createDirectory) was not touched by this plan beyond adding the create-path equivalent, which the awk-based acceptance-criteria grep confirms textually (previewNewStack precedes createDirectory in source order)."
  - id: "Prohibition: skip-review must never suppress confirmation for an introduced finding"
    verification:
      - kind: unit
        ref: "server/test/unit/application/compose-review-service.test.ts#skip on + introduced privileged still requires confirmation"
        status: pass
    human_judgment: false
  - id: "Prohibition: no setting/API field/code path disables an always-on check"
    verification:
      - kind: unit
        ref: "server/test/unit/application/settings-service.test.ts#requests exactly the skip key plus one key per configurable rule id — never a key for an always-on rule; composeCheckSettingsSchema itself has no properties for privileged/dockerSocket/bindOutsideStack"
        status: pass
    human_judgment: false

duration: ~75min
completed: 2026-10-02
status: complete
---

# Phase 12 Plan 5: Compose-check findings wired into the review flow, settings API, and create-path enforcement Summary

**Connects the Strategy-pattern rule engine (12-02) to the review-before-apply gate (12-01) end to end: every edit and create review now shows red/yellow compose-check findings anchored to their diff line, the skip-review setting can never hide a newly introduced finding (D-04 x #20), and the same findings-only enforcement now covers stack creation.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 3/3
- **Files touched:** 20 (across 3 commits)

## Accomplishments

- `ComposeReviewService.previewStackChange` now runs the compose-check rule engine over both the before and after state of every edit, returning `ReviewFinding[]` (each finding plus whether this specific edit introduced it, by a stable identity key independent of line number) and `composeParseError` alongside the existing diff.
- `DiffConfirmDialog` renders a finding's `ComposeWarningBadge` + message directly under its diff line (via `UnifiedDiffView`'s `annotations` slot, built in 12-01 for exactly this) when that line is visible in the diff; every other finding — including every finding on an `.env` review, which has no compose line context — is listed above the diff in a "Compose check warnings" section, with a neutral "new" badge on introduced findings and a destructive `Alert` when the submitted compose has a YAML parse error.
- New `client/src/lib/compose-rules.ts` (`COMPOSE_RULE_LABELS`/`COMPOSE_RULE_EXPLANATIONS`/`composeFindingTone`) and `ComposeWarningBadge` give every finding the UI-SPEC-exact label and tooltip — red `ToneBadge` for the three always-on rules, yellow for the three configurable ones.
- D-04 × #20 reconciliation is implemented as a single formula: `confirmationRequired = hasChanges && (!skipReview || findings.some(f => f.introduced))` — the skip-diff-confirmation toggle only ever suppresses the dialog for an edit that introduces zero findings; a pre-existing dangerous configuration is never re-prompted on every unrelated edit, but a newly introduced one always requires confirmation, even with skip on.
- `GET`/`PUT /api/settings/compose-checks` (backed by `SettingsService.getComposeCheckSettings`/`saveComposeCheckSettings`, four Setting keys: `diffConfirm.skip` + one `composeChecks.<ruleId>.enabled` per configurable rule) let the user toggle the skip and each configurable check — the schema has no key for an always-on rule, so there is no code path that can disable `privileged`/`dockerSocket`/`bindOutsideStack`.
- `StackService.createStack` now runs the same findings-only review (`ComposeReviewService.previewNewStack`) before its first filesystem write, rejecting an unconfirmed dangerous create with `ConfirmationRequiredError` (428) exactly like an edit — the single create path, so 12-07's template-based creation inherits this for free. `POST /api/stacks/preview` exposes the same check read-only for the create page's review dialog (wired in 12-06). `DiffConfirmDialog` gained a `{kind: "create"}` subject (no diff region, findings-only).
- `ComposeReviewService.evaluateCurrentStack` is the new single entry point plan 12-08's deploy-time re-check (D-09) will call.

## Task Commits

Each task was committed, grouped by the files each task exclusively owns — see the "Implementation note" below for why the three tightly-coupled shared files (compose-review-service.ts, stacks-api.ts, diff-confirm-dialog.tsx) all land in the first commit:

1. **Task 1: End-to-end findings in the edit review (+ the Task 2/3 logic sharing the same files)** - `119d10f` (feat)
2. **Task 2: D-04/D-10 Compose Checks settings API (routes/settings.ts + its integration test — settings-service.ts/compose-review-service.ts already landed in commit 1)** - `363ee97` (feat)
3. **Task 3: Create-path enforcement (stack-service.ts + routes/stacks.ts + their tests — compose-review-service.ts's previewNewStack/evaluateCurrentStack and the client wiring already landed in commit 1)** - `ce92a2a` (feat)

**Implementation note:** Tasks 1–3 were implemented as one coherent engineering pass rather than three independently-buildable intermediate states, because they modify the same small set of files in ways that genuinely build on each other within a single function (`previewStackChange`'s `confirmationRequired` formula goes from "hasChanges" in Task 1's own instructions straight to the final D-04 formula in Task 2 — writing the intermediate, intentionally-incomplete version just to immediately overwrite it in the next commit would have made the history worse, not more atomic). Every task's own `<verify>` commands and `<acceptance_criteria>` greps were run and passed against the final state; the three commits are split along the files each task uniquely owns.

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/application/compose-review-service.ts` — `ReviewFinding`, `StackChangePreview.findings`/`.composeParseError`, `NewStackPreview`/`previewNewStack`, `evaluateCurrentStack`, the D-04 `confirmationRequired` formula
- `server/src/application/settings-service.ts` — `COMPOSE_CHECK_SETTING_KEYS`, `getComposeCheckSettings`/`saveComposeCheckSettings`
- `server/src/application/index.ts` — `composeReviewService` now constructed with `composeRuleEngine` + `settingsService`
- `server/src/application/stack-service.ts` — `StackChangeReviewer.previewNewStack`, `createStack`'s pre-write confirmation check
- `server/src/routes/settings.ts` — `GET`/`PUT /api/settings/compose-checks`
- `server/src/routes/stacks.ts` — `POST /api/stacks/preview`
- `client/src/lib/stacks-api.ts` — `ComposeFinding`, `ReviewFinding`, `NewStackPreview`, `previewNewStack()`, extended `StackChangePreview`
- `client/src/lib/compose-rules.ts` (new) — `COMPOSE_RULE_LABELS`, `COMPOSE_RULE_EXPLANATIONS`, `composeFindingTone`
- `client/src/components/domain/stack/compose-warning-badge.tsx` (new) — `ComposeWarningBadge`
- `client/src/components/domain/stack/diff-confirm-dialog.tsx` — findings anchoring/listing, YAML-parse-error alert, `{kind: "create"}` subject
- `client/src/routes/app/stacks/components/config-tab.tsx` — passes `findings`/`composeParseError` to the dialog
- Test files: `server/test/unit/application/compose-review-service.test.ts`, `server/test/unit/application/settings-service.test.ts`, `server/test/unit/application/stack-service.test.ts` (extended); `server/test/integration/compose-checks.test.ts` (new), `server/test/integration/stacks.test.ts` (extended); `client/test/unit/lib/compose-rules.test.ts`, `client/test/unit/components/domain/stack/compose-warning-badge.test.tsx` (new); `client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx`, `client/test/integration/stacks.spec.ts` (extended)

## Decisions Made

- **Finding identity, not line number, decides "introduced":** a finding's `(ruleId, serviceName, message)` key is compared between the before/after evaluations — line number alone would misclassify an untouched finding as newly introduced whenever an unrelated edit shifts it down a line.
- **Both files are now always read on preview, not just the one being edited:** the rule engine's `hasEnvFile` context needs current `.env` state regardless of which field is being edited (so `missingEnvFileRule` evaluates correctly on a compose-only edit). This is a deliberate, documented behavior change from 12-01's diff-only preview; the two unit tests asserting the old "never reads the other file" behavior were updated to assert the new one.
- **`previewNewStack` never consults `skipReview`:** D-02 says creating a stack never shows a diff step, so there's no diff step for the skip toggle to skip — `confirmationRequired` there is purely `findings.length > 0`.
- **Client `StackChangePreview.findings`/`.composeParseError` are optional, unlike the server's always-present response fields:** this keeps `client/test/unit/routes/stacks/config-tab.test.tsx` (out of this plan's declared file scope, per its `<verify>` command listing it without listing it as a file this plan modifies) type-checking unmodified against its pre-12-05 preview literals.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two pre-existing unit tests asserted a now-intentionally-superseded behavior**
- **Found during:** Task 1, first unit test run
- **Issue:** `compose-review-service.test.ts`'s "never calls fs.readEnv when only composeContent is submitted" and "never calls fs.readCompose when only envContent is submitted" asserted 12-01's diff-only-read behavior, which this plan deliberately changes (both files are now always read so the rule engine's `hasEnvFile` context is correct on every call).
- **Fix:** Replaced both with tests asserting the new, correct behavior (`fs.readEnv`/`fs.readCompose` ARE called in each case), with a comment explaining why.
- **Files modified:** `server/test/unit/application/compose-review-service.test.ts`
- **Committed in:** `119d10f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, caught by the plan's own test suite before the first commit)
**Impact on plan:** No scope creep — a necessary test update reflecting a behavior change the plan's own action items require, not a design change.

## Issues Encountered

- **Server integration tests (Branch B, environmental):** `server/test/integration/compose-checks.test.ts` (new) and the Task 3 additions to `server/test/integration/stacks.test.ts` could not run live. `startContainer()` starts a testcontainers Postgres container successfully, but `prisma db push` then fails with `P1001: Can't reach database server at localhost:<published-port>` — the same TCP-payload-to-published-port environmental block documented in STATE.md for plans 05.1-01, 08-01, and this phase's own 12-01. All new integration tests are written and ready for a human/CI re-run in an unrestricted environment; the equivalent behavior is independently proven at the unit level (`compose-review-service.test.ts`, `settings-service.test.ts`, `stack-service.test.ts`), which ran cleanly.
- **Host-contention Playwright flakes (environmental, not attributable to this plan):** A full-suite run of `stacks.spec.ts` under PLAYWRIGHT_PORT=5214 showed 5 timeouts (`page.goto`/element-not-found) on tests this plan did not touch (`stop/restart actions menu`, `EnvEditor table mode`, `legacy /compose redirect`, `dashboard stats`) plus this plan's own new test, out of 18 total. Re-running each of those 5 tests individually (and the plan's new test individually, both before the full run and after) passed every time — consistent with the host-memory-pressure pattern documented elsewhere in STATE.md (Phase 05.1/08/12-01). The new test added by this plan (`a finding on the new privileged: true line renders its badge inside the diff annotation for that line...`) passed both in isolation and would have passed in the full run too (it happened to not be among the 5 random timeouts).

## Flagged Assumption Carried Forward (from 12-01, restated)

12-01's preview-to-confirm drift gap (the diff/findings are computed against the on-disk file at preview time; an external edit between preview and "Confirm & Apply" still overwrites without a second review, last-writer-wins) is unchanged by this plan — the same 428-recovery logic (12-01 Task 3) still handles the server-detected case where `confirmationRequired` flips back to true between preview and confirm. No new gap introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `ComposeReviewService.evaluateCurrentStack` is the stable entry point plan 12-08's `DeployPreflightService` calls for the D-09 deploy-time re-check.
- `StackService.createStack`'s enforcement is the single create path 12-07's template-based `createStackFromVariant` reuses for free — template content is checked identically to pasted content.
- `DiffConfirmDialog`'s `{kind: "create"}` subject and `previewNewStack()`/`POST /api/stacks/preview` are ready for 12-06 to wire into the Create Stack page's own review flow.
- **Blocker for full confidence (not for proceeding):** the new server integration tests (`compose-checks.test.ts`, the Task 3 additions to `stacks.test.ts`) need a live/CI run in an environment that isn't blocking testcontainers' published-port TCP traffic — same open item 12-01 already flagged, now extended to this plan's new tests.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-02*

## Self-Check: PASSED

All 5 newly created files verified present on disk; all 3 commits (`119d10f`, `363ee97`, `ce92a2a`) verified present in git history.
