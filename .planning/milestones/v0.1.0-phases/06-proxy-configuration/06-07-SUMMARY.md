---
phase: 06-proxy-configuration
plan: 07
subsystem: testing
tags: [monorepo, yarn-workspaces, vitest, zod, build-pipeline, ci]

requires:
  - phase: 06-proxy-configuration
    provides: "assignDomainSchema, routes/proxy.ts, and the ProxyService write path (06-01, 06-05)"
provides:
  - "server/package.json and client/package.json test scripts (and root dev) that rebuild @docktor/shared before loading it"
  - "a database-free unit test pinning the exact G-06-3 400 for POST /api/stacks/:id/services/:serviceName/proxy"
  - "a compiled-vs-source parity test that fails loudly whenever shared/dist disagrees with shared/src"
affects: [06-UAT, future proxy-configuration gap closures]

actuals:
  tokens: 2584
  tasks: 2
  commits: 2
  plan_head_before: dda822e244e1c3d28f011f706889b37a414fc765

tech-stack:
  added: []
  patterns:
    - "Every test/dev entry point that consumes a workspace's compiled output now chains an explicit `yarn workspace @docktor/shared build &&` prefix rather than relying on a pretest/predev lifecycle hook (Yarn Berry does not run those)"
    - "Compiled-vs-source parity test pattern: import the same package twice (once through its package.json `main`, once via a relative path straight into `src/`) and assert behavioral agreement, not timestamps"

key-files:
  created:
    - server/test/unit/routes/proxy-validation.test.ts
    - server/test/unit/shared-schema-parity.test.ts
  modified:
    - server/package.json
    - client/package.json
    - package.json

key-decisions:
  - "Chained `&&` builds instead of pretest/predev hooks — empirically verified in the plan's own research that Yarn 4 does not run pre/post lifecycle scripts, so a pretest entry would have looked like a fix and silently never run"
  - "No vitest alias mapping @docktor/shared to shared/src — tests must keep exercising the same compiled artifact the running server imports, with the parity test covering the residual staleness risk instead"
  - "Parity test lives in server/test/unit/, not shared/ — the server's own module resolution is what was fooled by G-06-3, so the guarantee is asserted from the server's own module context"

patterns-established:
  - "New workspace-boundary regression pattern: pin a specific security-relevant bug with a database-free route test that also asserts the downstream service was never called, proving rejection happens before the write path"

requirements-completed: [PRXY-01]

coverage:
  - id: D1
    description: "server, client, and root package.json scripts rebuild @docktor/shared before any test or dev entry point loads its compiled output"
    requirement: PRXY-01
    verification:
      - kind: other
        ref: "rm -rf shared/dist shared/tsconfig.tsbuildinfo && yarn workspace @docktor/server test:unit test/unit/lib/slugify.test.ts && test -f shared/dist/validation/proxy.js"
        status: pass
      - kind: other
        ref: "grep -c '@docktor/shared build && vitest run' server/package.json (== 3); grep -c '@docktor/shared build &&' client/package.json (== 4); grep -c '@docktor/shared build && concurrently' package.json (== 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/stacks/:id/services/:serviceName/proxy with the exact G-06-3 invalid-hostname payload returns 400 and never calls ProxyService.assignDomain, with several additional invalid-domain/port shapes and a valid-payload control also covered"
    requirement: PRXY-01
    verification:
      - kind: unit
        ref: "server/test/unit/routes/proxy-validation.test.ts (9 tests, all pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A compiled @docktor/shared that disagrees with shared/src fails a sub-second unit test with a message naming the rebuild command, proven live by mutating both shared/src and shared/dist and confirming the matching test catches each"
    requirement: PRXY-01
    verification:
      - kind: unit
        ref: "server/test/unit/shared-schema-parity.test.ts (4 tests, all pass)"
        status: pass
      - kind: other
        ref: "live mutation of shared/src/validation/proxy.ts (regex removed) caught by proxy-validation.test.ts; live mutation of shared/dist/validation/proxy.js (regex removed) caught by shared-schema-parity.test.ts; both restored and reconfirmed green"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live DB-backed integration re-run of test/integration/proxy.test.ts's 'returns 400 for an invalid hostname' case on an unrestricted host, to finally flip UAT test 3 and gap G-06-3 to resolved"
    verification: []
    human_judgment: true
    rationale: "This sandbox reproduces the same pre-existing, already-documented host-level TCP-to-Docker-published-port block (Prisma P1001) seen in 05.1-01/05.1-05/05.1-06/06-01 — the testcontainers Postgres accepts a raw TCP handshake but hangs on the real wire protocol, so prisma db push cannot reach it here. A human on an unrestricted host must run the command and confirm the result."

duration: 25min
completed: 2026-09-07
status: complete
---

# Phase 06 Plan 07: Shared-Build-Freshness Gap Closure (G-06-3) Summary

**Every test and dev entry point now rebuilds `@docktor/shared` before loading it, and two new sub-second server unit tests pin the exact G-06-3 400/201 boundary from both the route side and the compiled-artifact side.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-07T13:41:45Z
- **Completed:** 2026-09-07T13:54:52Z
- **Tasks:** 2 completed
- **Files modified:** 5 (3 modified, 2 created)

## Accomplishments

- Prefixed `yarn workspace @docktor/shared build &&` onto every test script in `server/package.json` (3 scripts) and `client/package.json` (4 scripts), and onto the root `dev` script — closing the exact gap the G-06-3 debug session identified: nothing previously forced a rebuild of the gitignored `shared/dist` before server or client tests, or `yarn dev`, ran.
- Verified from a never-built checkout: deleting `shared/dist` and `shared/tsconfig.tsbuildinfo` and running a server unit test through the yarn script regenerated `shared/dist/validation/proxy.js` before tests ran.
- Added `server/test/unit/routes/proxy-validation.test.ts` — registers the real `routes/proxy.ts` default export on a bare Fastify instance (only `auth-middleware` and `application/index` mocked, no database), and asserts 400 for the exact G-06-3 payload plus a dotless label, leading-hyphen label, trailing-hyphen label, over-long label, empty domain, and out-of-range port — with `assignDomain` never called for any of them. A valid payload still returns 201 and calls `assignDomain` exactly once, including proof that a mixed-case domain reaches the handler lowercased.
- Added `server/test/unit/shared-schema-parity.test.ts` — imports `@docktor/shared` (through the compiled `dist/`, exactly as the server does) and `shared/src/index.js` (source) in the same process, and compares export-name sets, `safeParse` behavior on probe inputs, and explicit `assignDomainSchema` accept/reject cases against the compiled namespace, with every assertion message naming `yarn workspace @docktor/shared build` as the remedy.
- Proved both new tests catch the real G-06-3 mechanism by live mutation: removing `.regex(hostnamePattern, ...)` from `shared/src/validation/proxy.ts` flips `proxy-validation.test.ts` to failing; removing it from the compiled `shared/dist/validation/proxy.js` flips `shared-schema-parity.test.ts` to failing. Both files were restored immediately after each check and reconfirmed green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build @docktor/shared before anything that consumes it** — `97d2619` (chore)
2. **Task 2: Pin the 400 with a database-free route test, and make a stale compiled shared fail loudly** — `a5af526` (test)

_No TDD RED/GREEN/REFACTOR split was needed here — both new test files were written directly against the already-correct application code (per the plan's `<objective>`, nothing in `assignDomainSchema` or `routes/proxy.ts` needed changing), so each task is a single commit._

## Files Created/Modified

- `server/package.json` — `test`, `test:unit`, `test:integration` each now chain `yarn workspace @docktor/shared build &&` before their `vitest run` invocation
- `client/package.json` — `test`, `test:unit`, `test:integration`, `test:integration:headed` each now chain `yarn workspace @docktor/shared build &&` first
- `package.json` (root) — `dev` now builds `@docktor/shared` before starting `concurrently`
- `server/test/unit/routes/proxy-validation.test.ts` — database-free route-level regression test pinning the G-06-3 400
- `server/test/unit/shared-schema-parity.test.ts` — compiled-vs-source staleness detector for `@docktor/shared`

## Decisions Made

- Chained `&&` builds instead of `pretest`/`predev` lifecycle scripts, per the plan's empirically-verified finding that Yarn Berry does not run those hooks.
- No vitest alias resolving `@docktor/shared` to `shared/src` — tests must keep exercising the real compiled artifact the server imports; the parity test covers the residual staleness risk instead.
- `shared/package.json` left untouched, as directed — its own tests read `shared/src` directly and its `build` script (`tsc --project tsconfig.json`, not `--build`) was independently verified correct for the realistic staleness case in the plan's own research.

## Deviations from Plan

None — plan executed exactly as written. `shared/src/validation/proxy.ts`, `server/src/routes/proxy.ts`, and `server/src/app.ts` were not touched, per the plan's explicit instruction that all three were independently verified correct during the G-06-3 investigation.

## Issues Encountered

- The plan's `<verify>` human-check step (a live DB-backed re-run of `test/integration/proxy.test.ts`) was attempted in this session and failed with the same pre-existing, already-documented host-level TCP-to-Docker-published-port block (Prisma P1001) seen in prior sessions (05.1-01, 05.1-05, 05.1-06, 06-01) — the testcontainers Postgres container accepts a raw TCP handshake but the real Prisma wire-protocol connection hangs/fails to reach it. This is environmental, not a regression from this plan's changes: all of this plan's own database-free unit tests (`test:unit`, 40 files / 616 tests / 2 todo, 0 failures) and `tsc --noEmit` (0 errors) pass cleanly. A human on an unrestricted host must run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` to finally flip UAT test 3 and gap G-06-3 to fully resolved — this is coverage item D4 above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The build-freshness mechanism that produced G-06-3 is now closed off through every developer-facing entry point (server tests, client tests, Playwright, `yarn dev`), and is now impossible to reintroduce silently: any future disagreement between `@docktor/shared`'s compiled output and its source will fail `shared-schema-parity.test.ts` by name.
- G-06-3 remains formally open pending the D4 human-check (live integration re-run on an unrestricted host) — this is the same class of environmental blocker already tracked in STATE.md for several prior phases, not new risk introduced by this plan.

---
*Phase: 06-proxy-configuration*
*Completed: 2026-09-07*

## Self-Check: PASSED

All created/modified files confirmed present on disk; both task commit hashes (97d2619, a5af526) confirmed present in git log.
