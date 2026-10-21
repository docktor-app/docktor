---
phase: 12-compose-safety-and-templates
verified: 2026-10-03T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
covered_files: [".planning/phases/12-compose-safety-and-templates/12-01-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-01-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-02-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-02-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-03-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-03-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-04-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-04-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-05-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-05-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-06-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-06-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-07-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-07-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-08-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-08-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-09-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-09-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-10-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-10-SUMMARY.md", ".planning/phases/12-compose-safety-and-templates/12-11-PLAN.md", ".planning/phases/12-compose-safety-and-templates/12-11-SUMMARY.md", "client/src/components/domain/stack/deploy-warnings-alert.tsx", "client/src/components/domain/stack/diff-confirm-dialog.tsx", "client/src/components/domain/template/template-grid.tsx", "client/src/components/domain/template/template-variant-dialog.tsx", "client/src/router.tsx", "client/src/routes/app/settings/components/compose-checks-card.tsx", "client/src/routes/app/settings/components/template-repos-card.tsx", "client/src/routes/app/stacks/create.tsx", "client/src/routes/app/stacks/templates.tsx", "server/prisma/schema/stack.prisma", "server/prisma/schema/template.prisma", "server/src/application/compose-review-service.ts", "server/src/application/deploy-preflight-service.ts", "server/src/application/port-conflict-service.ts", "server/src/application/stack-service.ts", "server/src/application/template-service.ts", "server/src/domain/host-ports.ts", "server/src/domain/port-conflicts.ts", "server/src/domain/template-pin.ts", "server/src/infrastructure/compose-rule-engine.ts", "server/src/infrastructure/compose-rules/bind-outside-stack-rule.ts", "server/src/infrastructure/compose-rules/docker-socket-rule.ts", "server/src/infrastructure/compose-rules/inline-env-rule.ts", "server/src/infrastructure/compose-rules/missing-env-file-rule.ts", "server/src/infrastructure/compose-rules/named-volume-rule.ts", "server/src/infrastructure/compose-rules/privileged-rule.ts", "server/src/infrastructure/compose-rules/registry.ts", "server/src/infrastructure/git-executor.ts", "server/src/infrastructure/template-source-reader.ts", "server/src/jobs/template-repo-sync.ts", "server/src/lib/template-config.ts", "server/src/lib/unified-diff.ts", "server/src/routes/templates.ts"]
covered_digest: "v2:sha256:1297da7204f2bd0179db5bef1c2b41ebbccd918e874513a357bcf368868113ed"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open an existing stack, edit its compose file to introduce a compose-check finding (e.g. add privileged: true) alongside an unrelated line change, save, and inspect the resulting dialog"
    expected: "Dialog shows the GitHub-style unified diff AND the privileged finding rendered as a red badge anchored directly under the diff line that introduced it (per D-03); 'Keep Editing' returns to the editor with the edit intact, 'Confirm & Apply' writes it"
    why_human: "Dialog composition and visual anchoring (badge placement relative to a diff hunk, light/dark contrast) is not meaningfully assertable by an automated test beyond render-without-crash; flagged as Manual-Only in 12-VALIDATION.md"
  - test: "Open the template browse grid (/stacks/create/templates), search by name, and filter by category"
    expected: "Card grid updates live as the user types/filters; empty search/filter state reads clearly; 'Use Template' on a single-variant template goes straight to the prefilled create form, a multi-variant template opens the picker dialog"
    why_human: "Visual card-grid layout, search/filter feel, and perceived responsiveness are not meaningfully assertable by an automated test; flagged as Manual-Only in 12-VALIDATION.md"
  - test: "Bind a host port with a process outside Docker (e.g. a local nc -l or another non-containerized service), then deploy a Docktor stack whose compose file requests that same port"
    expected: "The pre-deploy warnings banner reports the port as already in use by that process (name + PID) when ss/lsof can resolve it, or falls back to an 'unknown process' holder when it can't — and the deploy proceeds either way (never blocked)"
    why_human: "Requires a real non-Docker process bound to a host port from inside the running container context — an architectural edge case documented as best-effort in RESEARCH.md; not worth a flaky integration test per 12-VALIDATION.md Manual-Only table"
---

# Phase 12: Compose Safety and Templates Verification Report

**Phase Goal:** Creating and editing a stack comes with real safety nets — a preview of what changes before it's applied, warnings on dangerous or convention-violating configuration, upfront port-conflict detection, and a git-based template to start from instead of a blank compose file.
**Verified:** 2026-10-03
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Saving a compose or `.env` edit shows a diff and requires explicit confirmation before it's applied (#18) | ✓ VERIFIED | `server/src/application/compose-review-service.ts` computes a unified diff + runs the rule engine on before/after content; `StackService.updateStack` (`server/src/application/stack-service.ts:322-343`) throws `ConfirmationRequiredError` (428, `server/src/lib/errors.ts`) before any `fs.write*` call whenever `confirmationRequired` is true and `confirmed !== true` — unbypassable by a direct API call. Client `DiffConfirmDialog` (`client/src/components/domain/stack/diff-confirm-dialog.tsx`) renders the GitHub-style unified diff with "Keep Editing"/"Confirm & Apply" actions, wired into the edit flow via `useStackConfigFiles`. CR-01 regression test (compose-review-service.test.ts, "skip on + adding a stack's first .env file...") passed when run in isolation. |
| 2 | User can create a stack from a git-based template; a default official template repo is configured out of the box and additional repos can be added (#19) | ✓ VERIFIED | `GitExecutor` (`server/src/infrastructure/git-executor.ts`) shells out to the system `git` binary via `execFile` (argv-only, allowlisted protocols, `protocol.ext.allow=never`), idempotent clone/pull. `TemplateService.ensureDefaultRepo()`/`getDefaultTemplateRepoUrl()` (`server/src/lib/template-config.ts`) seeds `https://github.com/docktor-app/templates` as `isDefault: true` on first browse/sync; `DOCKTOR_DEFAULT_TEMPLATE_REPO_URL` override supported, empty disables it. `POST /api/template-repos` (`server/src/routes/templates.ts`) + `TemplateReposCard` (`client/src/routes/app/settings/components/template-repos-card.tsx`, rendered in `settings.tsx`) let a user add additional repos; `TemplateBrowsePage`/`TemplateGrid`/`TemplateVariantDialog` implement zero-one-many variant selection, wired at `/stacks/create/templates` in `client/src/router.tsx`, reachable via "Start from Template" on the Create Stack page. `createStackFromVariant` delegates to the same `StackService.createStack` 428-confirmation path (threat #2) — template content gets identical review enforcement. |
| 3 | A compose file with `privileged: true`, a Docker-socket mount, or a host bind mount outside the stack directory triggers a confirmation dialog before it's applied; configurable checks flag named-volume usage, inlined env vars, and a `.env` file with no `env_file` reference — all warn, none block (#20) | ✓ VERIFIED | Six rule classes registered in `server/src/infrastructure/compose-rules/registry.ts`: `PrivilegedRule`, `DockerSocketRule`, `BindOutsideStackRule` are `severity: "danger"`, `configurable: false` (always-on); `NamedVolumeRule`, `InlineEnvRule`, `MissingEnvFileRule` are `severity: "warning"`, `configurable: true`, individually toggleable via `ComposeChecksCard` (`client/src/routes/app/settings/components/compose-checks-card.tsx`). `ComposeRuleEngine.evaluate()` resolves each finding's source line for diff-anchoring. No severity ever blocks a write — `StackService.updateStack`/`createStack` only gate on `confirmed === true`, proceeding regardless of finding severity once confirmed, matching the "warn, never block" contract documented inline. |
| 4 | Deploying a stack whose compose file requests a host port already in use surfaces which stack or process holds it, without blocking deploy (#21) | ✓ VERIFIED | `PortConflictService.check()` (`server/src/application/port-conflict-service.ts`) extracts requested host ports (`server/src/domain/host-ports.ts`, all compose port syntaxes + env interpolation) and resolves conflicts via a 3-tier precedence (`server/src/domain/port-conflicts.ts`: Docktor stacks via DB → any running container via dockerode → listening sockets via `ss`/`lsof`, best-effort), naming the holder (`stack`/`container`/`process`/`unknown`). `DeployPreflightService.run()` wraps both compose-check and port-conflict evaluation in `Promise.allSettled` — never throws. `StackService.runPreflight()` is called from `deployStack`, `restartStack`, `updateImages`, and `upgradeServiceImage` before Docker is invoked and before the transitional status broadcast (confirmed by direct code read at each of the four call sites). `DeployWarningsAlert` (`client/src/components/domain/stack/deploy-warnings-alert.tsx`), wired into `stack-alerts.tsx`, renders "Port {N} is already in use by {holder}" with a link to the conflicting stack when applicable, plus an explicit "Deploys are never blocked" disclosure line. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/application/compose-review-service.ts` | Diff + rule-engine preview, confirmation decision | ✓ VERIFIED | 240 lines, substantive logic, imported by `stack-service.ts`, `routes/stacks.ts`; CR-01 fix (before/after context separation) present at lines 102-107 |
| `server/src/infrastructure/compose-rule-engine.ts` + `compose-rules/*.ts` | D-12 rule engine, 6 built-in rules | ✓ VERIFIED | Registry wires all 6 rules; each rule file substantive (not stub), correct severity/configurable flags per SC3 |
| `server/src/application/port-conflict-service.ts` + `server/src/domain/port-conflicts.ts` | D-15 3-tier port conflict resolution | ✓ VERIFIED | Pure domain resolver + I/O-gathering service, wired into `DeployPreflightService` |
| `server/src/application/deploy-preflight-service.ts` | Advisory, never-blocking pre-deploy check | ✓ VERIFIED | `Promise.allSettled`, called from all 4 deploy-path entry points in `stack-service.ts` |
| `server/src/application/template-service.ts` + `git-executor.ts` + `template-source-reader.ts` | Git-based template sourcing, default repo seeding, add-repo | ✓ VERIFIED | execFile-based git, idempotent sync, `ensureDefaultRepo`/`addRepo`/`syncRepo` all present and used by routes |
| `client/src/components/domain/stack/diff-confirm-dialog.tsx` | Merged diff + findings review dialog | ✓ VERIFIED | Renders unified diff, anchored/listed findings, secret masking, Confirm/Cancel actions; wired into `create.tsx` and the edit flow via `useStackConfigFiles` |
| `client/src/routes/app/stacks/templates.tsx` + `template-grid.tsx` + `template-variant-dialog.tsx` | Template browse grid with search/filter, zero-one-many variant handling | ✓ VERIFIED | Registered at `/stacks/create/templates` in `router.tsx`, reachable from Create Stack page |
| `client/src/components/domain/stack/deploy-warnings-alert.tsx` | Persistent port-conflict/compose-finding banner | ✓ VERIFIED | Rendered from `stack-alerts.tsx` guarded by `hasDeployWarnings()` |
| `server/prisma/schema/template.prisma` + `stack.prisma` (deployWarnings/templatePin/templateUpdateAvailable) | Persistence schema for templates + deploy warnings | ✓ VERIFIED (schema only — migration unapplied to a live DB, see Gaps/WINDOWS #16) | Models present, `tsc -b` compiles clean against generated Prisma client types |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `StackService.updateStack`/`createStack` | `ComposeReviewService.previewStackChange`/`previewNewStack` | direct method call, pre-write | ✓ WIRED | Confirmed by code read; `ConfirmationRequiredError` thrown before any `fs.write*` |
| `StackService.deployStack`/`restartStack`/`updateImages`/`upgradeServiceImage` | `DeployPreflightService.run` via `runPreflight()` | direct method call, pre-Docker-invoke | ✓ WIRED | Confirmed at all 4 call sites |
| `DeployPreflightService` | `ComposeReviewService.evaluateCurrentStack` + `PortConflictService.check` | `Promise.allSettled` | ✓ WIRED | Never throws; degrades each half to `[]` independently |
| `client/src/routes/app/stacks/create.tsx` | `DiffConfirmDialog` | `review`/`confirmReview`/`cancelReview` from `useCreateStack` | ✓ WIRED | `open={review !== null}` |
| `client/src/router.tsx` | `TemplateBrowsePage` | route registration `/stacks/create/templates` | ✓ WIRED | Confirmed in router.tsx |
| `TemplateService.createStackFromVariant` | `StackService.createStack` | injected `TemplateStackCreator` port | ✓ WIRED | Template-created stacks pass through the identical 428-confirmation gate |
| `settings.tsx` | `ComposeChecksCard` / `TemplateReposCard` | component composition | ✓ WIRED | Both imported and rendered |
| `routes/templates.ts` | `TemplateService` | `application/index.js` singleton | ✓ WIRED | `addTemplateRepoSchema`/`templateVariantParamsSchema` validate input before reaching the service |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 regression (missing-env-file introduced-on-add bug fix) | `npx vitest run test/unit/application/compose-review-service.test.ts -t "CR-01 regression"` | 1 passed | ✓ PASS |
| Host-port extraction + 3-tier port-conflict resolution | `npx vitest run test/unit/domain/host-ports.test.ts test/unit/domain/port-conflicts.test.ts` | 33 passed | ✓ PASS |
| Server workspace compiles with zero type errors | `npx tsc --build --force` (server) | clean, no output | ✓ PASS |
| Client workspace compiles with zero type errors | `npx tsc --build --force` (client) | clean, no output | ✓ PASS |
| No debt markers (TBD/FIXME/XXX) in phase-changed files | `grep -n -E "TBD|FIXME|XXX"` across 149 changed files | no matches | ✓ PASS |

### Requirements Coverage

Per CLAUDE.md's "Issue Tracking" policy, Phase 12's requirements are GitHub issues (#18, #19, #20, #21), deliberately not tracked in REQUIREMENTS.md. This is documented project policy, not a gap.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| #18 | 12-01, 12-05, 12-06 | Diff-before-apply for compose/.env edits | ✓ SATISFIED | See Truth 1 |
| #19 | 12-03, 12-04, 12-07, 12-09, 12-10, 12-11 | Git-based templates, default repo, add repos | ✓ SATISFIED | See Truth 2 |
| #20 | 12-02, 12-05, 12-06, 12-08 | Dangerous/convention-violating config warnings | ✓ SATISFIED | See Truth 3 |
| #21 | 12-03, 12-08 | Port-conflict detection, non-blocking | ✓ SATISFIED | See Truth 4 |

All 4 requirement IDs are claimed across the 11 plans' `requirements:` frontmatter; none orphaned.

### Anti-Patterns Found

None. Scanned all 149 files changed in this phase (git diff against `main`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` and stub-shaped patterns (`return null`, hardcoded empty literals outside tests) — zero hits outside legitimate shadcn/ui `placeholder=` input props.

### Prior Gate Artifacts (not re-litigated, factored in per task instructions)

- **12-SECURITY.md**: 53/53 threats verified closed.
- **12-REVIEW.md / 12-REVIEW-DISPOSITION.md**: 1 critical (CR-01) + 3 warnings + 1 info, all disposed `fixed` (commit `0a27488`); CR-01 regression test independently re-run and confirmed passing during this verification.
- **12-UI-REVIEW.md**: 19/24 pillars passed on first pass, with the 5 flagged issues fixed in commit `cc371eb` prior to this verification.
- **12-VALIDATION.md**: `nyquist_compliant: true`; 1326/1326 server unit tests, 674/675 client unit tests (1 pre-existing unrelated flaky test) passing at phase completion. Seven integration/E2E test files were written but deliberately not executed on this sandbox host per explicit user instruction (resource contention) — tracked individually as WINDOWS.md #14–#20, all `status: open`, `kind: unrun-verify`. This is a known, documented deferral, not re-flagged here as a new gap.

### Gaps Summary

No blocking gaps. One advisory note:

- **WINDOWS #16** (`server/prisma/migrations/20261003072056_add_template_repos_and_deploy_warnings/migration.sql`, open): the migration adding `TemplateRepo`/`Template`/`TemplateVariant` and the six new `Stack` columns (`deployWarnings`, `templatePin`, `templateUpdateAvailable`, etc.) was generated via `prisma migrate diff` (schema-copy technique) but has never been applied to a live database in any session — same sandbox TCP-to-Postgres limitation documented for this entire milestone (WINDOWS #1/#8/#10/#11). The schema is syntactically valid (`prisma generate` succeeds; both workspaces' `tsc -b` compile clean against the generated client types), but a developer/CI on an unrestricted host must run `yarn db:migrate` and confirm the tables/columns materialize correctly before this phase's template/deploy-warnings persistence is proven against a real database. This mirrors the already-accepted Branch-B pattern from phases 05.1/06/08/09 and is not treated as a blocker here, consistent with the task's explicit instruction not to re-flag the documented test-execution deferral.

### Human Verification Required

3 items, all pre-identified as Manual-Only in 12-VALIDATION.md (visual/UX review and a live non-Docker port-binding scenario that cannot be meaningfully automated):

1. **Merged diff + warning dialog visual layout (D-03)**
   **Test:** Open an existing stack, edit its compose file to introduce a compose-check finding alongside an unrelated line change, save, and inspect the dialog.
   **Expected:** Diff and inline warning badges render together, anchored to the correct line, legible in both light and dark mode.
   **Why human:** Visual composition/anchoring correctness isn't meaningfully assertable by an automated test beyond render-without-crash.

2. **Template grid browse/search UX (D-07)**
   **Test:** Open `/stacks/create/templates`, search by name, filter by category, select a single-variant and a multi-variant template.
   **Expected:** Grid updates live and reads clearly; zero-one-many selection behaves as designed.
   **Why human:** Visual layout and interaction feel.

3. **Real host-level, non-Docker port conflict via `ss`/`lsof` (D-13 last-resort tier)**
   **Test:** Bind a host port with a process outside Docker, deploy a stack requesting that same port.
   **Expected:** Warning banner names the process (or falls back to "unknown process"), deploy still proceeds.
   **Why human:** Requires a real non-Docker process bound to a host port from inside the running container — an architectural edge case documented as best-effort; not worth a flaky integration test.

---

_Verified: 2026-10-03_
_Verifier: Claude (gsd-verifier)_
