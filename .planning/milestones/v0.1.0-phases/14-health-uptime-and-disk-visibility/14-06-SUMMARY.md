---
phase: 14-health-uptime-and-disk-visibility
plan: 06
subsystem: api
tags: [health-probe, http, node-http, interval-job, domain-events, compose, yaml, ssrf]
requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-01 service.health_changed event, history subscriber and normalizeHealth
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-04 GET /api/stacks/:id/uptime incident list (read by the integration test)
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-08 shared healthProbeSchema / healthProbeUrlSchema (loopback-only hosts) and the compose block the Config tab writes
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-12 IncidentTracker on stack.container_state_changed and jobs/index.ts registration order
provides:
  - pure probe rules in domain/health-probe.ts (D-02 status range, D-08 three failures with 60 s grace, D-06 stagger, UI-SPEC reason texts)
  - service.probe_completed and service.probe_cleared domain events (the cleared producer and consumer ship in 14-13)
  - parseHealthProbes, a server-side x-docktor.health-probe reader that re-validates every block with the shared schema
  - ProbeTransportPort and ProbeTransport (container network address, localhost Host header, no redirects, body never read)
  - ServiceHealthService.handleProbeCompleted, the only writer of probe-derived health
  - subscribeProbeResults registered sixth in registerDomainSubscribers
  - HealthProbeJob, a 5 s IntervalJob registered immediately before DiskUsageJob
affects: [14-09 probe ownership and network attach, 14-13 probe lifecycle and fail-closed invalid blocks, phase 14 verification of ROADMAP criteria 1 and 4]

actuals:
  tokens: 25316
  tasks: 1
  commits: 1
plan_head_before: 121dbe17097b8ce750262f875a40f1279ffc6f62
plan_head_after: c23c4473b7ec3f9a6205f13877d6acaeb60c1285

tech-stack:
  added: []
  patterns:
    - "Producer job -> pure domain rule -> application service -> existing event (probe results re-enter as stack.container_state_changed in StatePoller's exact shape)"
    - "Per-service due-time map driven by one 5 s tick, with a deterministic hash stagger and an in-flight guard"
    - "Explicit connect address plus Host header, with a pinned lookup as a second layer, so a loopback-named URL reaches the container and not Docktor itself"

key-files:
  created:
    - server/src/domain/health-probe.ts
    - server/src/lib/compose-health-probe.ts
    - server/src/application/ports/probe-transport-port.ts
    - server/src/infrastructure/probe-transport.ts
    - server/src/application/service-health-service.ts
    - server/src/application/subscribers/probe-result-subscriber.ts
    - server/src/jobs/health-probe-job.ts
    - server/test/unit/domain/health-probe.test.ts
    - server/test/unit/lib/compose-health-probe.test.ts
    - server/test/unit/infrastructure/probe-transport.test.ts
    - server/test/unit/application/service-health-service.test.ts
    - server/test/unit/application/probe-result-subscriber.test.ts
    - server/test/unit/jobs/health-probe-job.test.ts
    - server/test/integration/health-probe.test.ts
  modified:
    - server/src/domain/events.ts
    - server/src/application/subscribers/register.ts
    - server/src/application/index.ts
    - server/src/jobs/index.ts
    - server/test/unit/application/subscriber-registration.test.ts
    - server/test/unit/jobs/index.test.ts

key-decisions:
  - "The probe connects with an explicit hostname (the container IP) and a Host header taken from the compose URL; the lookup override is kept only as a second layer. Node skips lookup for IP-literal hosts (127.0.0.1, [::1]), so lookup alone would have probed Docktor's own loopback for two of the three allowed hosts"
  - "A probe result is applied only while the Service row is still running, so a container that stopped mid-probe cannot get a health value resurrected"
  - "A null containerStartedAt (the container could not be inspected for that probe) never counts as a new container; only a changed container id or a changed non-null start time resets the state"
  - "Invalid x-docktor blocks are skipped by the job in this plan; fail-closed handling of them on the 30 s cadence stays in 14-13 as the plan splits it"
  - "ServiceHealthService takes the docker port in its constructor now, as the plan's signature specifies, so 14-13's handleProbeCleared needs no change to application/index.ts"

patterns-established:
  - "Probe-driven status changes reach NotificationWatcher, the state broadcaster and IncidentTracker only through the unchanged stack.container_state_changed event"
  - "Per-stack keyed lock (service-health:<stackId>) around read-derive-write so concurrent results for one stack never derive from stale rows"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Pure probe rules: 200-399 is success, three consecutive failures turn a service unhealthy, failures inside the 60 s grace while still starting do not count, one success is healthy, a Docktor restart continues from the stored health, stagger stays inside the 30 s interval, reason texts match UI-SPEC"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/health-probe.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The probe configuration is read only from each stack's compose file and every block is re-validated server-side with the shared loopback-only schema (valid, invalid with the shared message, unparseable YAML, no services)"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/compose-health-probe.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "ProbeTransport requests the inspected container's own address with the localhost Host header, follows no redirect, treats 3xx as success, classifies 4xx/5xx, timeout, refused and no-address, and does no I/O at all for a URL outside the allow-list (SSRF guard T-14-36)"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/probe-transport.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "HealthProbeJob ticks every 5 s, probes each running probed service every 30 s after a deterministic stagger, picks up compose edits on the next tick, skips overlapping runs and survives read, transport and emit failures"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "ServiceHealthService writes health, appends http-probe history and re-emits stack.container_state_changed with StatePoller's payload shape, in write-before-emit order, only on a change; resets on a new container; continues after a restart; ignores transitional stacks; logs and swallows failures"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-service.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/probe-result-subscriber.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/subscriber-registration.test.ts#registers the probe-result handler for service.probe_completed last"
        status: pass
    human_judgment: false
  - id: D6
    description: "End to end with a real database, bus and local HTTP server: a 200 makes the stack HEALTHY with an http-probe history entry, then three 503s make it UNHEALTHY with the threshold message and one open incident in the uptime list"
    requirement: "#23"
    verification:
      - kind: integration
        ref: "server/test/integration/health-probe.test.ts#turns a stack healthy on a 200 and unhealthy after three failed checks, opening one incident"
        status: pass
      - kind: integration
        ref: "server/test/integration/health-probe.test.ts#records nothing while the response stays the same"
        status: pass
    human_judgment: false
  - id: D7
    description: "HealthProbeJob is registered immediately before DiskUsageJob, which stays last; notification-watcher.ts and stack-state-derivation.ts are unchanged"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/index.test.ts#prints a started line naming all twelve jobs, in registration order, on a successful boot (G-10-1)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 06: HTTP probe engine Summary

**A compose `x-docktor.health-probe` block now drives a live health signal: a 5-second tick requests the URL against the service's own container every 30 seconds, applies the 3-failures / 60-second-grace rule, and pushes any change through the existing `stack.container_state_changed` event so notifications, the live-state bridge and incident tracking behave unchanged**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-08T13:17:16Z
- **Completed:** 2026-10-08T13:31Z
- **Tasks:** 1 (tracer)
- **Files modified:** 20 (14 created, 6 modified)

## Accomplishments
- Pure domain module `health-probe.ts`: `isProbeSuccess` (200-399), `evaluateProbe` (grace ends at the first success, threshold 3), `seedProbeState` (an unhealthy service starts at the threshold, so a restart never flaps a stack), `probeStaggerOffsetMs`, and the UI-SPEC reason and transition texts.
- `parseHealthProbes` reads each service's block from the compose file, nothing is stored in the database (D-01), and every block is re-validated with 14-08's shared schema. A hand-edited `http://169.254.169.254/...` comes back `invalid` with the shared host message.
- `ProbeTransport` validates the URL again before any I/O (T-14-36), inspects the container, picks `<project>_default` or the first network with an address, and requests that address with the compose URL's `Host` header. Redirects are not followed, the body is discarded with `res.resume()`, and every failure is an outcome, never a rejection.
- `HealthProbeJob` (`*/5 * * * * *`, no run on start) keeps a due-time map per `stackId/serviceName`, staggers first probes by a hash, probes sequentially, and skips a tick that starts while the previous one is running. It is read-only: its store has the single member `listStacks`.
- `ServiceHealthService` is the sole writer of probe-derived health: write the row, emit `service.health_changed` (source `http-probe`), derive the stack status with the unchanged `deriveStackStatus`, update it, then emit `stack.container_state_changed` with statusLog when the status changed. A per-stack keyed lock serialises results and any failure is logged with `<stackId>/<serviceName>` and swallowed.
- Tracer verified end to end against real Postgres, the real bus and a real local HTTP server: a 200 gives HEALTHY plus a `Responded with HTTP 200` history entry, then three 503s give UNHEALTHY, a `Responded with HTTP 503 after 3 failed checks` entry and one open incident from 14-12's tracker, served by 14-04's endpoint.

## Task Commits

1. **Task 1: End-to-end HTTP probe (tracer)** - `c23c447` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written alongside the implementation and landed in the same commit, as in the earlier Phase 14 plans (CLAUDE.md forbids committing failing tests)._

## Files Created/Modified
- `server/src/domain/health-probe.ts` - constants, outcome types, evaluateProbe, seedProbeState, stagger, reason texts
- `server/src/domain/events.ts` - `service.probe_completed` and `service.probe_cleared` registered
- `server/src/lib/compose-health-probe.ts` - `parseHealthProbes`, `HealthProbeSpec`
- `server/src/application/ports/probe-transport-port.ts` - `ProbeTransportPort`, `ProbeRequest`, `ProbeObservation`
- `server/src/infrastructure/probe-transport.ts` - `ProbeTransport`, `selectTargetAddress`, `probeTransport`
- `server/src/application/service-health-service.ts` - `ServiceHealthService`
- `server/src/application/subscribers/probe-result-subscriber.ts`, `register.ts`, `server/src/application/index.ts` - subscription and composition
- `server/src/jobs/health-probe-job.ts`, `server/src/jobs/index.ts` - the job, its lazy facade and registration
- Unit tests per module, plus `server/test/integration/health-probe.test.ts`

## Decisions Made
See `key-decisions` above. The notable one is the connect address (deviation 1 below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The lookup override alone would not redirect an IP-literal host**
- **Found during:** Task 1, while writing the transport
- **Issue:** The plan has the request reach the container through a `lookup` override. Node skips `lookup` when the host is an IP literal, so for `http://127.0.0.1:...` and `http://[::1]:...` (two of the three allowed hosts) the request would have gone to Docktor's own loopback and a probe could pass or fail against the wrong process.
- **Fix:** `buildRequestOptions` sets `hostname` to the container address and `Host` to the compose URL's host. The pinned `lookup` stays as a second layer so the name can never be resolved through DNS.
- **Files modified:** `server/src/infrastructure/probe-transport.ts`
- **Verification:** `connects to the container address even when the URL host is an IP literal` (server bound to 127.0.0.2, URL host 127.0.0.1)
- **Committed in:** c23c447

**2. [Rule 2 - Missing critical] A result for a service that is no longer running is ignored**
- **Found during:** Task 1, in ServiceHealthService
- **Issue:** A probe can take up to its timeout, so the container may stop before the result arrives. Applying it would resurrect a health value on an exited service (RESEARCH Pitfall 4) and could flip the stack to UNHEALTHY.
- **Fix:** `applyProbeResult` returns when the row's `containerState` is not `running`.
- **Files modified:** `server/src/application/service-health-service.ts`
- **Verification:** `ignores a result for a service that is no longer running`
- **Committed in:** c23c447

**3. [Rule 2 - Missing critical] "Never rejects" and bounded duration are enforced inside the transport**
- **Found during:** Task 1, in ProbeTransport
- **Issue:** `http.request` can throw synchronously for options Node rejects, which would reject the promise and break the port's contract. The socket `timeout` option also only fires on an idle socket, so a server that keeps sending could hold a probe open.
- **Fix:** The request is created inside a try/catch whose error is classified, and an overall deadline timer destroys the request, cleared on `close`.
- **Files modified:** `server/src/infrastructure/probe-transport.ts`
- **Committed in:** c23c447

### Plan refinements (not bugs)

**4. Invalid blocks are skipped, not probed as failures.** The truths mention fail-closed for an invalid block, but the plan assigns that to 14-13 ("14-13 extends fail-closed to an invalid compose block"). The job parses the block (so `invalid` is known) and does not probe it in this plan. Until 14-13 an invalid block therefore has no effect. The transport itself does fail closed for a URL that fails the schema.

**5. The schedule forgets services that are no longer probed.** Keys not seen in a tick are dropped so the map cannot grow with removed stacks and a restarted container is staggered again. 14-13 adds the explicit `service.probe_cleared` lifecycle on top.

**6. `docker` constructor parameter is held but unused in this plan.** The plan fixes the signature `(repo, bus, docker, now)` so 14-13's `handleProbeCleared` (which re-reads Docker health) needs no change in `application/index.ts`.

**7. Existing registration test adjusted.** The incident-tracker test asserted the incident subscriptions were the last two registrations. The probe handler is now last, so it asserts `slice(-3, -1)` and a new test pins the probe subscription as the final registration.

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical) plus 4 plan refinements
**Impact on plan:** No scope change. Deviation 1 closes a real hole in the SSRF guard's intent for the loopback-literal hosts.

## Issues Encountered
- The full `test:unit` run reports the same 4 failures as 14-11 (3 in `git-executor.test.ts`, 1 in `template-source-reader.test.ts`: git and temp-dir timeouts on Windows), already in `deferred-items.md`. 100 of 102 files and 1700 of 1704 tests pass; none of the failing files touch this plan.
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` is clean.
- The first draft of the job test assumed a newly added probe block is probed on the next tick. By design the first tick that sees a key only schedules it inside the stagger window; the test now ticks twice.
- The first integration run logged an `IncidentTracker` warning because its cached open incident outlived the `cleanDatabase()` between tests (same stack id). Each test now uses a fresh stack id.

## Known Stubs
None.

## Known Gaps
- https probes are implemented (`rejectUnauthorized: false`, T-14-39) but have no TLS-level test; the unit suite covers http.
- The loopback-literal test binds `127.0.0.2`, which works on Windows and Linux but not on macOS without an alias.
- Probes run one after another in a tick. The 8-probe concurrency cap (T-14-51) and the lifecycle, fail-closed invalid blocks and the 120-second notification proof ship in 14-13; probe ownership versus Docker health and the network attach ship in 14-09. Until 14-09, a probed container on a network Docktor cannot reach is reported `Docktor couldn't reach the container's network` or `The container has no reachable network address`.
- Issue #23 text mentions an "expected status code"; D-02 replaces it with "any 2xx/3xx is healthy", so the issue text should be updated when the phase closes.

## Threat Flags
None beyond the plan's register. T-14-36 (SSRF) is mitigated by the shared schema applied in `parseHealthProbes` and again in `ProbeTransport`, no DNS resolution and an explicit container address, with a unit test proving no inspect and no request for `example.com`. T-14-37 by `res.resume()` and fixed reason strings. T-14-38 partly (stagger, timeout bound, in-flight guard, `agent: false`; the concurrency cap is 14-13). T-14-40 by the per-stack keyed lock and write-before-emit. T-14-SC: no packages installed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 14-09 and 14-13 build on `service.probe_completed`/`service.probe_cleared`, `ProbeTransport.selectTargetAddress`, `ServiceHealthService` and `HealthProbeJob` without architectural change.
- No blockers.

## Self-Check: PASSED

- All 14 created files and 6 modified files exist and are in commit `c23c447`.
- `git rev-list --count 121dbe1..HEAD` was 1 before this summary; `c23c447` is an ancestor of HEAD.
- Acceptance criteria re-run: `"service.probe_completed"` in events.ts 1, in health-probe-job.ts 2; `healthProbeUrlSchema` 2 and `lookup` 3 in probe-transport.ts; `res.resume()` 1; `subscribeProbeResults` 2 in register.ts; `HealthProbeJobStore` declares only `listStacks`; the last register line is still `diskUsageJob` with `healthProbeJob` before it; empty diff for `stack-state-derivation.ts` and `notification-watcher.ts`.
- Verification: the plan's unit command (9 files, 250 tests) passes; `health-probe.test.ts`, `health.test.ts` and `uptime.test.ts` integration suites (30 tests) pass; `yarn typecheck` reports zero errors.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
