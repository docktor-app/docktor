---
phase: 14-health-uptime-and-disk-visibility
plan: 13
subsystem: api
tags: [health-probe, lifecycle, fail-closed, concurrency, domain-events, notifications]
requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-06 HealthProbeJob, ServiceHealthService, service.probe_completed and service.probe_cleared events, subscribeProbeResults
provides:
  - service.probe_cleared producer in HealthProbeJob (probe-removed, container-not-running)
  - fail-closed handling of invalid x-docktor.health-probe blocks on the 30 s cadence
  - last-good compose parse fallback and transitional-stack skip
  - PROBE_CONCURRENCY = 8 promise pool
  - ServiceHealthService.handleProbeCleared (Docker-health revert or clear to null)
  - subscribeProbeResults routing of service.probe_cleared
  - real-bus proof that probe-driven UNHEALTHY and recovery reach NotificationWatcher unchanged
affects: [14-09 probe ownership and network attach, phase 14 verification of ROADMAP criterion 1 (#23)]

actuals:
  tokens: 14695
  tasks: 1
  commits: 1
plan_head_before: 0594e6397d826bc06ec9a5ff70cc1a905115f93b
plan_head_after: 47abcbe8a36172bbb10e86a28ddf3d628bfc82dc

tech-stack:
  added: []
  patterns:
    - "Schedule entries carry stackId and serviceName so a cleared event can be emitted for a stack that no longer exists"
    - "A probe stops being authoritative through one explicit event, and the service layer decides what truthful health replaces it"
    - "Promise pool of N workers draining one shared queue for bounded fan-out"

key-files:
  created:
    - server/test/unit/application/probe-notification-preservation.test.ts
  modified:
    - server/src/jobs/health-probe-job.ts
    - server/src/application/service-health-service.ts
    - server/src/application/subscribers/probe-result-subscriber.ts
    - server/test/unit/jobs/health-probe-job.test.ts
    - server/test/unit/application/service-health-service.test.ts
    - server/test/unit/application/probe-result-subscriber.test.ts
    - server/test/unit/application/subscriber-registration.test.ts
    - server/test/integration/health-probe.test.ts

key-decisions:
  - "A read failure or an unparseable compose file keeps the stack's last good probes (empty before any parse), so a typo or a transient EACCES never silently turns probing off or clears health"
  - "A container-not-running clear is ignored when the Service row is running again by the time it is handled, because the probes have resumed and decide health then"
  - "Compose cache entries are dropped for stacks no longer listed, so the cache cannot grow with removed stacks"
  - "ProbeJobStack gained a status field (StackRepository.findAll already returns it) so the job can skip transitional stacks without a second store member; the store stays read-only with the single listStacks member"

patterns-established:
  - "HealthChange value object passed to ServiceHealthService.applyHealth, so probe results and probe clears share one write-then-emit path"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Removing a probe block, losing a service or stack, or stopping a probed container emits exactly one service.probe_cleared, and a restarted container is staggered anew"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#HealthProbeJob lifecycle"
        status: pass
    human_judgment: false
  - id: D2
    description: "An invalid probe block for a running service is evaluated on the 30 s cadence as an invalid-config failure with the shared schema message and no transport call; an unparseable or unreadable compose file keeps the last good probes"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#probes an invalid block as a failure on the same cadence, without any transport call"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#keeps the last good probes when the compose file stops parsing"
        status: pass
    human_judgment: false
  - id: D3
    description: "At most eight probes are in flight at once with ten due services; a transitional stack is neither probed nor cleared and keeps its schedule"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#runs at most PROBE_CONCURRENCY probes at once"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#neither probes nor clears a stack in a transitional status, and keeps its schedule"
        status: pass
    human_judgment: false
  - id: D4
    description: "handleProbeCleared writes null on a container stop, restores Docker health with the message HTTP probe removed on a removed block (null when inspect fails or the container has no healthcheck), writes nothing when already equal, and drops the in-memory probe state"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-service.test.ts#ServiceHealthService.handleProbeCleared"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/probe-result-subscriber.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Through the real bus, real NotificationWatcher and real ServiceHealthService, three failing probes send exactly one stack_unhealthy notification at 120 s (none at 119.999 s), and a recovery inside the window sends none"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/probe-notification-preservation.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "End to end against Postgres: removing the probe block on disk and ticking adds a docker-healthcheck health event with message HTTP probe removed to GET /api/stacks/:id/health-events"
    requirement: "#23"
    verification:
      - kind: integration
        ref: "server/test/integration/health-probe.test.ts#reverts the health to Docker's own when the probe block is removed from the compose file"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 13: Probe lifecycle and notification preservation Summary

**Probes can now be removed, broken or stopped without ever leaving a service with stale health: HealthProbeJob emits `service.probe_cleared`, treats an invalid block as a failed probe with its reason, keeps the last good YAML, caps probing at 8 concurrent requests, and a real-bus test proves NotificationWatcher still fires exactly one `stack_unhealthy` after 120 s**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-08T13:41Z
- **Completed:** 2026-10-08T14:03Z
- **Tasks:** 1
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- `HealthProbeJob.tick()` is now `listStacks` -> `collectDue` -> `runDue`. `collectDue` schedules new keys, emits `container-not-running` for a scheduled service whose container stopped, and after the stack loop emits `probe-removed` for every scheduled key it did not see (block removed, service gone, stack gone). `runDue` is a worker pool bounded by `PROBE_CONCURRENCY = 8`.
- Invalid blocks (for example host `example.com`) are due on the same 30 s cadence and emit a `service.probe_completed` with `{kind: "invalid-config", message}` and no transport call, so a broken probe surfaces as unhealthy with its reason after three checks.
- An unparseable or unreadable compose file keeps the last good probes, and an initially unparseable one probes nothing. A transitional stack is skipped and its schedule entries are kept.
- `ServiceHealthService.handleProbeCleared` runs under the same per-stack lock and try/catch. It drops the in-memory probe state, then writes null on a container stop, or Docker's inspected health (`docker-healthcheck`, `HTTP probe removed`) when the block was removed; it reuses one `applyHealth` write-then-emit path with `handleProbeCompleted`.
- `subscribeProbeResults` also routes `service.probe_cleared`, and its disposer removes both subscriptions. `register.ts` and `application/index.ts` needed no change.
- `probe-notification-preservation.test.ts` wires the real `InMemoryEventBus`, `NotificationWatcher`, `ServiceHealthService` and `subscribeProbeResults` over an in-memory repo: no notification at 119 999 ms, one `stack_unhealthy` at 120 000 ms, and none when a success recovers the stack in time. `notification-watcher.ts` and `stack-state-derivation.ts` are untouched.

## Task Commits

1. **Task 1: Probe lifecycle and preservation** - `47abcbe` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests landed in the same commit as the implementation, as in the earlier Phase 14 plans (CLAUDE.md forbids committing failing tests)._

## Files Created/Modified
- `server/src/jobs/health-probe-job.ts` - lifecycle, fail-closed invalid specs, last-good parse, transitional skip, `PROBE_CONCURRENCY` pool
- `server/src/application/service-health-service.ts` - `handleProbeCleared`, shared `applyHealth(HealthChange)`, `containerId` on the row type
- `server/src/application/subscribers/probe-result-subscriber.ts` - second subscription and combined disposer
- `server/test/unit/application/probe-notification-preservation.test.ts` - real-bus criterion 4 proof (new)
- Existing unit tests for the job, service, subscriber and registration, plus the integration suite, extended

## Decisions Made
See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A stale container-not-running clear must not wipe a running container's health**
- **Found during:** Task 1, in `handleProbeCleared`
- **Issue:** The job decides on a stack snapshot. If the container started again before the event is handled, applying "container stopped -> null" would erase the health of a live, probed service until the next probe.
- **Fix:** A `container-not-running` clear is ignored when the Service row is `running` at handling time.
- **Files modified:** `server/src/application/service-health-service.ts`
- **Verification:** `leaves the health alone when the container is running again after a stop was observed`
- **Committed in:** 47abcbe

**2. [Rule 3 - Blocking] The job needs the stack status, and the service needs the row's container id**
- **Found during:** Task 1
- **Issue:** The transitional skip needs `status` on the job's stack type, and clearing a stopped service must rewrite the row with its own `containerId` and `containerState`, which `ServiceHealthServiceRow` did not carry.
- **Fix:** Added `status` to `ProbeJobStack` and `containerId` to `ServiceHealthServiceRow`; both are already returned by `StackRepository`, so no repository or composition change was needed. The job store keeps its single `listStacks` member.
- **Files modified:** `server/src/jobs/health-probe-job.ts`, `server/src/application/service-health-service.ts`, test fixtures
- **Committed in:** 47abcbe

**3. [Rule 1 - Bug] A compose file that cannot be read must not clear probes**
- **Found during:** Task 1, while adding unseen-key clearing
- **Issue:** 14-06 skipped a stack whose compose file could not be read. Combined with the new clear-unseen pass, a transient read error would have cleared every probe of that stack.
- **Fix:** A read failure now returns the last good probes, like an unparseable file does.
- **Files modified:** `server/src/jobs/health-probe-job.ts`
- **Verification:** `keeps the last good probes when the compose file cannot be read`
- **Committed in:** 47abcbe

### Plan refinements (not bugs)

**4. Test adjustments.** 14-06's `never probes a service with an invalid probe block` case was replaced by the fail-closed test (the behavior changed by design), and the registration test now asserts the two probe subscriptions are the last two registrations.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking) plus 1 plan refinement
**Impact on plan:** No scope change. All three keep the lifecycle from producing a false clear.

## Issues Encountered
- The full `test:unit` run reports 2 failures in `git-executor.test.ts` (git clone timeouts on Windows), already tracked in `deferred-items.md` and unrelated to this plan: 102 of 103 files and 1726 of 1728 tests pass.
- `vi.waitFor` advances fake timers while polling, which would fire NotificationWatcher's 120 s timer early. The preservation test therefore flushes the un-awaited bus handlers with a bounded microtask loop instead of `vi.waitFor`, which is equivalent because the fake repository only resolves promises.
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` is clean.

## Known Stubs
None.

## Known Gaps
- In the integration suite the singleton `serviceHealthService` uses the real Docker client, so the "restore Docker health" revert resolves to `null` there (no daemon knows container `c1`). The `healthy` Docker-health branch is covered by the unit tests with a fake inspect.
- Probe ownership versus Docker health and the network attach remain in 14-09, as planned.

## Threat Flags
None beyond the plan's register. T-14-51 is mitigated by the `PROBE_CONCURRENCY` pool (unit test: ten blocked due services, eight in flight). T-14-52 by `service.probe_cleared` for every unseen key and every stopped container plus `handleProbeCleared`. T-14-53 by the invalid-config failure with no transport call, the last-good parse, and the transitional skip. T-14-SC: no packages installed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 14-09 can build on the transitional skip, invalid specs owning the service, and the last-good parse cache.
- No blockers.

## Self-Check: PASSED

- All 9 files exist and are in commit `47abcbe`; it is an ancestor of HEAD.
- `git rev-list --count 0594e63..HEAD` was 1 before this summary.
- Acceptance criteria re-run: `"service.probe_cleared"` in events.ts 1; `PROBE_CONCURRENCY` in health-probe-job.ts 3; `service.probe_cleared` in the job 2; `handleProbeCleared` in the subscriber 2; `HTTP probe removed` in the service 1; empty diff for `notification-watcher.ts`, its test and `stack-state-derivation.ts`.
- Verification: the plan's unit command (7 files, 221 tests) passes; `health-probe.test.ts` integration (3 tests) passes; `yarn typecheck` exits 0.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
