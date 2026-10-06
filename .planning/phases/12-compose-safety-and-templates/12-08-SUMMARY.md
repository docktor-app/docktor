---
phase: 12-compose-safety-and-templates
plan: 08
subsystem: api
tags: [port-conflicts, pre-deploy-check, deploy-warnings, sse, banner, d-09, d-13, d-14, d-15]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-03's extractRequestedHostPorts/parseEnvAssignments/resolvePortConflicts domain layer + SocketInspector infrastructure; 12-05's ComposeReviewService.evaluateCurrentStack entry point; 12-07's Stack.deployWarnings column (migration already applied to the schema)"
provides:
  - "server/src/application/port-conflict-service.ts — PortConflictService.check(stackId), PortConflictStackReader"
  - "server/src/application/deploy-preflight-service.ts — DeployPreflightService.run(stackId), DeployWarnings, EMPTY_DEPLOY_WARNINGS"
  - "server/src/repositories/stack-repository.ts — setDeployWarnings(id, warnings)"
  - "StackService.{deployStack,restartStack,updateImages,upgradeServiceImage} each run the never-blocking pre-deploy check (private runPreflight) before Docker, via the new DeployPreflight constructor param"
  - "POST /api/stacks/:id/{deploy,restart,update,services/:name/upgrade} all include warnings in their response"
  - "client/src/lib/deploy-warnings.ts — parseDeployWarnings, hasDeployWarnings"
  - "client/src/components/domain/stack/deploy-warnings-alert.tsx — DeployWarningsAlert"
  - "StackAlerts renders the persistent pre-deploy warnings banner alongside configError/configChanged"
  - "use-stack.ts's stack_status handler triggers a background refetch on DEPLOYING/UPDATING"
affects: [12-09, 12-10, 12-11]

actuals:
  tokens: 18164
  tasks: 2
  commits: 2
  plan_head_before: ce664c3854fede7cb5e6bf44377a4bf05c85e649
  plan_head_after: 0edf88618af428d6c1330c8764cdd64bffbd1707

tech-stack:
  added: []
  patterns:
    - "runPreflight() is the single never-throwing choke point every deploy path calls: a preflight-computation failure returns EMPTY_DEPLOY_WARNINGS, a persistence (setDeployWarnings) failure still returns the computed (non-empty) warnings — Docker always runs either way"
    - "DeployPreflightService.run() uses Promise.allSettled across the D-09 compose-check re-evaluation and the D-15 port-conflict check so either dependency rejecting degrades only its own half of the result"
    - "PortConflictService.check() short-circuits to [] before calling listContainers/listListeners when the compose requests no host ports, and degrades the container tier to [] (console.warn) on a listContainers rejection without failing the whole check"
    - "Client PortHolder's process variant types pid as number | null (looser than the server's non-null process.pid) since the value crosses a JSON-persisted-then-reparsed trust boundary and a degraded/older record must still render gracefully"

key-files:
  created:
    - server/src/application/port-conflict-service.ts
    - server/src/application/deploy-preflight-service.ts
    - server/test/unit/application/port-conflict-service.test.ts
    - server/test/unit/application/deploy-preflight-service.test.ts
    - client/src/lib/deploy-warnings.ts
    - client/src/components/domain/stack/deploy-warnings-alert.tsx
    - client/test/unit/lib/deploy-warnings.test.ts
    - client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx
  modified:
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/src/repositories/stack-repository.ts
    - server/src/routes/stacks.ts
    - server/test/unit/application/stack-service.test.ts
    - client/src/lib/stacks-api.ts
    - client/src/hooks/use-stack.ts
    - client/src/routes/app/stacks/components/stack-alerts.tsx
    - client/test/unit/hooks/use-stack.test.ts
    - client/test/integration/stacks.spec.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Resolved a wording conflict between the plan's <behavior> line (\"setDeployWarnings rejecting → warnings = EMPTY_DEPLOY_WARNINGS\") and its more detailed <action> text (\"persistence failure still returns the computed warnings\") in favor of the <action> text: runPreflight() only returns EMPTY_DEPLOY_WARNINGS when the preflight computation itself rejects; a setDeployWarnings persistence failure still returns the already-computed (possibly non-empty) warnings. Covered by two distinct stack-service.test.ts cases so the chosen behavior is pinned, not just asserted implicitly."
  - "upgradeServiceImage's idempotent no-op path (target tag already deployed) returns warnings: EMPTY_DEPLOY_WARNINGS and never calls the preflight — matching the plan's \"only when a change will be deployed\" instruction and keeping the return shape uniform across both branches (callers never see an optional warnings field)."
  - "PortConflictStackReader/DockerodeClientPort/SocketInspectorPort are all declared as narrow ports on PortConflictService per CLAUDE.md's DI convention, matching ComposeReviewService's existing precedent — dockerodeClient (the Docker Engine API client), not the docker-compose-CLI `docker` instance, is wired in application/index.ts since only the former exposes listContainers()."
  - "Client-side PortHolder's process variant types pid as number | null (server's domain type keeps it non-null for that kind) — defensive typing for data that round-trips through Stack.deployWarnings' JSON column, matching the plan's explicit pid-null test case."

requirements-completed: ["#21", "#20"]

coverage:
  - id: D1
    description: "PortConflictService.check() resolves the D-15 three-tier holder precedence (Docktor stacks via the database, then any running container via dockerode, then best-effort ss/lsof via SocketInspector), self-excludes the deploying stack, and returns [] without calling listContainers/listListeners when the compose requests no host ports"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/application/port-conflict-service.test.ts (7 tests: DB-tier conflict, listContainers-rejects degrades to DB-tier-only, no-ports short-circuit, container-info mapping incl. leading-slash strip, listContainers(false) call, socket-tier fallthrough, unreadable-compose degrades to [])"
        status: pass
    human_judgment: false
  - id: D2
    description: "DeployPreflightService.run() combines the D-09 compose-check re-evaluation and the D-15 port-conflict check via Promise.allSettled, degrading either half to [] independently on rejection, and D-09 picks up an externally edited compose file that never went through updateStack's review"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/application/deploy-preflight-service.test.ts (both-succeed, compose-rejects, ports-rejects, EMPTY_DEPLOY_WARNINGS sentinel, and the D-09 'externally edited compose' case using a real ComposeReviewService + real ComposeRuleEngine)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-14: deployStack, restartStack, updateImages and upgradeServiceImage each run the pre-deploy check automatically before Docker is invoked and before the transitional status broadcast, and a preflight or persistence failure never blocks or delays the deploy"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts (call-order proofs via invocationCallOrder for all four paths; never-block proofs for preflight-rejects and setDeployWarnings-rejects on deployStack; never-block proofs on restartStack/updateImages/upgradeServiceImage)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-15 copy contract: a stack-holder conflict links to /stacks/{stackId}; a process holder shows the name and, when known, its PID; an unknown holder shows 'another process'; a container holder shows its name; udp ports render as PORT/udp; a muted footnote states the check's visibility limits and that Docker's own port binding is the final authority"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx (8 tests covering every holder kind, udp formatting, compose-finding rendering, and the footnote)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The pre-deploy warnings banner is a single persistent yellow Alert on the stack detail page (styled identically to the existing configChanged banner, never a toast), parsed from Stack.deployWarnings and surviving a reload until the next deploy replaces it, and the stack page refetches in the background on a DEPLOYING/UPDATING SSE event so the banner can appear while the deploy is still running"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/deploy-warnings.test.ts, client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx, client/test/unit/hooks/use-stack.test.ts (DEPLOYING/UPDATING trigger a background refetch without touching loading; RUNNING does not)"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts#stack detail page shows the pre-deploy warnings banner with a link to the conflicting stack (Issue #21/D-14/D-15) / #stack detail page shows no pre-deploy warnings banner for a stack with no deployWarnings field"
        status: unknown
    human_judgment: true
    rationale: "Written per plan but deliberately NOT executed in this session per the orchestrator's resource_constraint (no Playwright/integration suites on this host to avoid resource contention). The equivalent rendering logic is independently proven at the unit level (deploy-warnings-alert.test.tsx, deploy-warnings.test.ts), which passed. WINDOWS.md entry #18 (open) tracks this for a CI/human re-run."
  - id: "Prohibition: never word the banner as exhaustive"
    description: "The footnote states the check's best-effort visibility and names Docker's own port binding as the final authority, never implying the absence of a warning guarantees the port is free"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx#always includes the best-effort visibility footnote; grep -c 'final authority' deploy-warnings-alert.tsx -> 1"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-03
status: complete
---

# Phase 12 Plan 8: Pre-deploy port-conflict + compose-check warnings wired into every deploy path Summary

**Every deploy/restart/update/upgrade now runs a never-blocking pre-flight check (D-15 three-tier port-conflict resolution + D-09 compose-check re-evaluation) before Docker runs, persists the result on the stack, and the stack page shows it in a persistent yellow banner that can appear while the deploy is still in flight.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2/2
- **Files modified:** 20 (across 2 commits)

## Accomplishments

- `PortConflictService.check(stackId)` (new): reads the stack's compose + env, extracts requested host ports, and resolves D-15's three-tier holder precedence (Docktor stacks via the database → any running container via dockerode → best-effort `ss`/`lsof` via `SocketInspector`, both built in 12-03) — short-circuits to `[]` without any I/O when the compose requests no host ports, and degrades the container tier to `[]` on a `listContainers` failure rather than failing the whole check.
- `DeployPreflightService.run(stackId)` (new): runs the D-09 compose-check re-evaluation (`ComposeReviewService.evaluateCurrentStack`, 12-05) and the D-15 port-conflict check in parallel via `Promise.allSettled`, so either dependency rejecting degrades only its own half of the result — proven against a real `ComposeReviewService` + `ComposeRuleEngine` picking up an externally edited `privileged: true` compose file that never went through the review dialog.
- `StackService` gained a 9th constructor param (`DeployPreflight`) and a private `runPreflight(id)` choke point every deploy path calls: a preflight-computation failure returns `EMPTY_DEPLOY_WARNINGS`, a `setDeployWarnings` persistence failure still returns the already-computed warnings — Docker always runs either way. `deployStack`, `restartStack`, `updateImages`, and `upgradeServiceImage` (on its deploying path only — the idempotent no-op skips the check) all call it before their respective transition/Docker-invocation point and return `warnings` in their result.
- `StackRepository.setDeployWarnings(id, warnings)` (new): persists the JSON-encoded result to `Stack.deployWarnings` (column added by 12-07's migration).
- `POST /api/stacks/:id/{deploy,restart,update,services/:name/upgrade}` all forward `warnings` in their response bodies.
- Client: `parseDeployWarnings`/`hasDeployWarnings` (new, pure), `DeployWarningsAlert` (new) — a single yellow `Alert` matching `stack-alerts.tsx`'s existing `configChanged` styling exactly, rendering one line per port conflict per D-15's copy contract (stack-holder link, container name, process+PID, or "another process"), then any compose findings via the existing `ComposeWarningBadge`, then a muted footnote stating the check's visibility limits and that Docker's own port binding is the final authority. `StackAlerts` renders it after the existing two banners.
- `use-stack.ts`'s `stack_status` SSE handler now triggers a background refetch on `DEPLOYING`/`UPDATING` — since the warnings are persisted before that broadcast fires, the banner can show up while the deploy/update is still running.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end deploy warning — tracer (port-conflict service, deploy-preflight service, StackService.deployStack wiring, persisted warnings, banner)** - `1b60720` (feat)
2. **Task 2: Same never-blocking pre-flight on restart/update/upgrade, D-09 re-check, early banner refresh on DEPLOYING** - `0edf886` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/application/port-conflict-service.ts` (new) — `PortConflictService.check(stackId)`, `PortConflictStackReader`
- `server/src/application/deploy-preflight-service.ts` (new) — `DeployPreflightService.run(stackId)`, `DeployWarnings`, `EMPTY_DEPLOY_WARNINGS`
- `server/src/application/stack-service.ts` — `DeployPreflight` interface, constructor param 9, private `runPreflight()`, warnings wired into `deployStack`/`restartStack`/`updateImages`/`upgradeServiceImage`
- `server/src/application/index.ts` — `portConflictService`/`deployPreflightService` singletons, wired into `stackService`
- `server/src/repositories/stack-repository.ts` — `setDeployWarnings()`
- `server/src/routes/stacks.ts` — restart/update responses now include `warnings`
- `client/src/lib/deploy-warnings.ts` (new) — `parseDeployWarnings`, `hasDeployWarnings`
- `client/src/components/domain/stack/deploy-warnings-alert.tsx` (new) — `DeployWarningsAlert`
- `client/src/lib/stacks-api.ts` — `PortHolder`, `PortConflict`, `DeployWarnings` types, `Stack.deployWarnings`, `warnings?` on deploy/restart/update/upgrade response types
- `client/src/hooks/use-stack.ts` — background refetch on `DEPLOYING`/`UPDATING`
- `client/src/routes/app/stacks/components/stack-alerts.tsx` — renders `DeployWarningsAlert`
- Test files: `server/test/unit/application/port-conflict-service.test.ts` (new), `server/test/unit/application/deploy-preflight-service.test.ts` (new), `server/test/unit/application/stack-service.test.ts` (extended), `client/test/unit/lib/deploy-warnings.test.ts` (new), `client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx` (new), `client/test/unit/hooks/use-stack.test.ts` (extended), `client/test/integration/stacks.spec.ts` (extended, not run locally)
- `.planning/WINDOWS.md` — entry #18 (open: the two new Playwright tests)

## Decisions Made

See `key-decisions` in frontmatter. In short: resolved a plan wording conflict in favor of the more detailed `<action>` text (a persistence failure still returns the computed warnings, only a preflight-computation failure returns the empty sentinel); the idempotent upgrade no-op skips the preflight entirely and returns the empty sentinel for a uniform return shape; `dockerodeClient` (not the `docker-compose`-CLI wrapper) is PortConflictService's Docker dependency; the client's `PortHolder.process.pid` is typed looser (`number | null`) than the server's domain type since it crosses a JSON round-trip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated two pre-existing `upgradeServiceImage` test assertions for the now-added `warnings` field**
- **Found during:** Task 2, first unit test run
- **Issue:** `stack-service.test.ts`'s "rewrites the compose file..." and "is a no-op..." tests used `toEqual` against the full result object, which would fail once `warnings` was added to the return shape.
- **Fix:** Updated both assertions to include the expected `warnings` value (`EMPTY_DEPLOY_WARNINGS` for both, since the first ran with the default mock and the no-op path never calls the preflight).
- **Files modified:** `server/test/unit/application/stack-service.test.ts`
- **Committed in:** `0edf886` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, caught by the plan's own test suite before the commit)
**Impact on plan:** No scope creep — a necessary test update reflecting the plan's own instructed behavior change.

## Issues Encountered

- **Client full-suite flakes (environmental, not attributable to this plan):** a full `yarn workspace @docktor/client test` run showed 4 failures across 3 unrelated files (`theme-toggle.test.tsx` x2, `settings-page.test.tsx`, `env-editor.test.tsx`) — none touched by this plan. Re-running each file individually passed every case (27/27), consistent with the host-contention flakiness pattern documented elsewhere in STATE.md/prior phase SUMMARYs.
- **Playwright not run locally (per orchestrator resource_constraint):** the two new `stacks.spec.ts` cases (banner-with-link, no-banner-without-field) were written but not executed in this session, deliberately, to avoid resource contention on this host. Recorded as WINDOWS.md entry #18.

## User Setup Required

A developer/CI with Playwright available must run `PLAYWRIGHT_PORT=5214 yarn workspace @docktor/client test:integration stacks.spec.ts` to confirm the two new pre-deploy-warnings-banner cases pass live (WINDOWS.md entry #18).

## Next Phase Readiness

- `Stack.deployWarnings` is now populated by every deploy path; 12-11's `templateUpdateAvailable` column (also from 12-07's migration) is untouched by this plan and ready for its own writer.
- No blockers for proceeding with plan 12-09/12-10/12-11.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED

All 8 created files verified present on disk; both task commits (`1b60720`, `0edf886`) verified present in git history.
