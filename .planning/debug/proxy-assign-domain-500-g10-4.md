---
status: investigating
trigger: "G-10-4 (blocker): 4/16 tests fail in server/test/integration/proxy.test.ts on user's unrestricted host with live DB — all 4 trace to POST /api/stacks/:id/services/:serviceName/proxy (ProxyService.assignDomain) returning 500 instead of 201. 12/16 other tests in the same file pass."
created: "2026-09-25T21:00:00Z"
updated: "2026-09-25T21:15:00Z"
---

## Current Focus

hypothesis: NONE CONFIRMED — exhaustive dynamic reproduction (real Docker + testcontainers + postgres:17, matching the user's own reported command and current HEAD) could not reproduce the failure. See Evidence.
test: n/a — investigation exhausted for this session
expecting: n/a
next_action: If resumed, ask the reporting user to re-run with NODE_ENV left unset (or capture server logs another way) so the real exception/stack trace is captured — `envToLogger.test = false` in app.ts silently swallows `app.log.error(error)` in test mode, which is why the original report only had a status code. Also ask for exact `node -v`, `docker version`, and whether `yarn.lock` was freshly installed (vs a long-lived `node_modules`) at the time of the failing run.

## Symptoms

expected: On a host with a reachable PostgreSQL/Docker, `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` passes all 16 tests (roadmap SC3 / Phase 10's own hard constraint).
actual: 4/16 tests failed, all 4 traced to assignDomain's write path returning 500 instead of 201/204. Response body/stack trace not available (test only asserts statusCode; NODE_ENV=test disables Fastify's pino logger in app.ts's envToLogger map, so even server-side the real error was never printed to test output).
errors: None captured verbatim by the user — only "expected 500 to be 201" / "expected [] to have length 1 but got 0" assertion diffs.
reproduction: `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` against a live reachable Postgres.
started: Discovered during Phase 10 UAT (10-UAT.md test 5 / gap G-10-4), traced statically (not dynamically) prior to this session.

## Eliminated

- hypothesis: "DI/wiring bug — application/index.ts passes a de-bound `stackService.deployStack` method reference into ProxyService, losing `this` and causing `this.repo`/`this.docker` etc. to be undefined inside deployStack when called as `this.stackService.deployStack(id)`."
  evidence: "Read application/index.ts line 101-109 — `proxyService` is constructed with the literal `stackService` singleton instance (not a re-wrapped object literal or unbound method reference). JS method-call `this` binding is therefore correct regardless of how the 4th constructor param is TS-typed (`Pick<StackService, 'deployStack'>`)."
  timestamp: "2026-09-25T21:10:00Z"

- hypothesis: "vi.spyOn(DockerExecutor.prototype, 'up') doesn't actually intercept calls because DockerExecutor defines its methods as instance class-fields (arrow functions) rather than prototype methods, so deployStack silently falls through to the REAL docker CLI and something downstream breaks."
  evidence: "Read docker-executor.ts in full — every method (`up`, `down`, `stop`, `restart`, `ps`, `composePull`, `imageDigest`) is a standard `async methodName() {}` class-body method, i.e. lives on `DockerExecutor.prototype`. vi.spyOn on the prototype correctly intercepts all instances, including the composition-root singleton. Also moot: even if this mock were bypassed, `deployStack`'s `this.docker.up(id)` call is wrapped in its own try/catch that sets `success=false` rather than rethrowing — cannot produce an uncaught 500 either way."
  timestamp: "2026-09-25T21:10:00Z"

- hypothesis: "shared/dist is stale relative to shared/src (a previously-confirmed root cause class for a DIFFERENT gap in this exact test file — see .planning/debug/resolved/assigning-a-domain-with-an-invalid-hostname-returns-400.md), causing a schema/shape mismatch between the compiled AssignDomainInput Zod schema and what proxy-service.ts's TS code expects, producing a TypeError."
  evidence: "Diffed shared/dist/validation/proxy.js against a fresh compile of shared/src/validation/proxy.ts — byte-for-byte structurally identical (only whitespace/comment stripping differs, as expected from tsc output). git log on shared/src/validation/proxy.ts shows no changes since Phase 09/05.1 — Phase 10 never touched this schema. Ruled out for this specific gap."
  timestamp: "2026-09-25T21:12:00Z"

- hypothesis: "The 500 is a genuine, deterministic logic bug in assignDomain/syncServiceComposeProxy/deployStack/compose-proxy-editor.ts reachable via the exact test fixtures in proxy.test.ts."
  evidence: |
    Could not reproduce despite exhaustive dynamic verification, all against current HEAD (f75d628, same commit 10-UAT.md was written against — proxy-service.ts unmodified since the 10-06 feat commit):
    1. Direct in-process call to `proxyService.assignDomain('web-stack', 'web', {domain, internalPort:8080, tlsEnabled:true})` (bypassing HTTP entirely) against a real local Postgres — succeeded, returned a full ProxyConfig row.
    2. `app.inject()` HTTP-level call with the exact same payload — succeeded, 201.
    3. Unmodified `test/integration/proxy.test.ts` run via vitest against a real local Postgres (docker daemon unavailable at first, used the host's native `postgresql` service as a substitute DB — required a one-line diagnostic patch to setup.ts's `startContainer()`, reverted after) — 16/16 passed, repeated 4 times back to back, zero flakiness.
    4. Started a real `dockerd` in this sandbox (it happened to be available: `/usr/bin/dockerd`, `containerd`, `runc` all present) and reverted the setup.ts patch entirely (confirmed `git diff` clean) — ran the fully unmodified `test/integration/proxy.test.ts` through real Testcontainers spinning up a real `postgres:17` container, exactly matching the user's own reproduction command — 16/16 passed.
    5. Ran the full `yarn workspace @docktor/server test:integration` suite (all 5 files, real Testcontainers, real file-level parallelism — matching the literal documented hard-constraint command) — 35/35 passed, zero failures, including proxy.test.ts's full 16.
    6. Repeated (5) — still 35/35 clean.
  timestamp: "2026-09-25T21:20:00Z"

## Evidence

- timestamp: "2026-09-25T21:05:00Z"
  checked: server/src/application/proxy-service.ts (full file, assignDomain/syncServiceComposeProxy/adoptUnmanagedDomains/removeDomain)
  found: Logic is sound — every user-facing error path throws typed AppError subclasses (BadRequestError/ConflictError/NotFoundError); the only calls NOT wrapped in an inner try/catch inside the assignDomain lock are the initial findByIdOrThrow/exists checks and the create/updateConfig repository calls (which are individually try/catch'd where they can plausibly throw, e.g. P2002 translation).
  implication: No obviously-missing error handling that would explain an unhandled exception surfacing as a bare 500 under normal conditions.

- timestamp: "2026-09-25T21:06:00Z"
  checked: server/src/application/stack-service.ts deployStack() (lines 316-383)
  found: The very first three statements (findByIdOrThrow, guardTransition, the initial transitionStatus to DEPLOYING) run OUTSIDE the big try/catch that starts at line 342 — an exception there would propagate uncaught up through syncServiceComposeProxy -> assignDomain -> the route, producing a genuine 500. But `guardTransition(status, "DEPLOY")` allows `RUNNING` (the seeded stack's status in proxy.test.ts's seedStack helper), and `repo.transitionStatus` is a straightforward two-statement Prisma `$transaction` with no precondition on prior state that would fail for a freshly-seeded row.
  implication: This is the one place in the whole call chain where an uncaught throw is structurally possible without being deliberately wrapped — flagged as the most-plausible code-level culprit-shape (if one exists) for anyone resuming this investigation, even though I could not get it to actually throw.

- timestamp: "2026-09-25T21:14:00Z"
  checked: server/src/app.ts buildApp() error handler + envToLogger map
  found: "`envToLogger.test = false` disables Fastify's logger entirely in NODE_ENV=test. The catch-all 500 branch (`app.log.error(error); reply.status(500).send(...)`) therefore logs NOTHING when tests run — this is exactly why the original UAT report only had a status code with no stack trace available, and why a straight re-run of the test suite (even by the reporting user) cannot self-diagnose further without additional instrumentation."
  implication: Any future attempt to actually catch this in the wild should temporarily flip NODE_ENV away from "test" (or add a one-off console.error in the catch-all branch) while reproducing, to capture the real exception.

- timestamp: "2026-09-25T21:16:00Z"
  checked: package.json dependency versions actually installed (prisma 7.4.0, @prisma/client 7.4.0, @prisma/adapter-pg 7.4.0, pg 8.18.0, testcontainers/@testcontainers/postgresql 11.12.0, zod 4.3.6, fastify 5.7.4, yaml 2.8.2)
  found: All pinned/resolved versions look internally consistent (matching major versions across the Prisma family). Not independently verified against the user's own resolved `yarn.lock` versions (no access to their machine).
  implication: A version drift on the user's host (different resolved versions for any of these, especially the Prisma 7 / adapter-pg / testcontainers trio, all fairly new major versions as of this project's timeframe) remains a plausible, unverifiable-from-here explanation for a host-specific failure.

## Resolution

root_cause: "NOT CONFIRMED. Static analysis and exhaustive dynamic reproduction (direct in-process call, HTTP-level app.inject, and multiple full test runs of the exact unmodified test/integration/proxy.test.ts against both a local Postgres and a genuine dockerd+Testcontainers postgres:17 container matching the user's own reproduction path, at the exact commit — f75d628 — 10-UAT.md was written against) all passed 100% clean, every time. No deterministic code-level bug was found in the assignDomain -> syncServiceComposeProxy -> deployStack -> compose-proxy-editor.ts chain, the DI/composition-root wiring, or the @docktor/shared schema (confirmed not stale, unlike a previously-resolved adjacent bug in the same test file)."
fix: (not applied — find_root_cause_only mode, and no root cause was confirmed to fix)
verification: "N/A — see Eliminated section for the full list of reproduction attempts, all of which failed to reproduce the reported symptom."
files_changed: []
