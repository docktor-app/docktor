---
phase: 14-health-uptime-and-disk-visibility
plan: 15
subsystem: infra
tags: [health-probe, docker, dockerode, abort-signal, fake-timers, liveness, fail-closed]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: ProbeTransport and HealthProbeJob (14-09, 14-13) whose Docker calls and ticks this plan bounds
provides:
  - withDeadline helper and DeadlineExceededError (fake-timer friendly, aborts the work's signal)
  - PROBE_DOCKER_CALL_TIMEOUT_MS (10 s) and PROBE_DEADLINE_MARGIN_MS (50 s) fail-closed bounds
  - Optional abort signal on DockerodeClientPort inspectContainer, connectNetwork, disconnectNetwork, forwarded as dockerode abortSignal
  - ProbeTransport with every Docker call deadline-bounded and cancellable
  - HealthProbeJob per-probe deadline, bounded start() steps and in-flight watchdog
  - IntervalJob.reportError (protected)
affects: [14-16, 14-17, health-probe, job-registry]

actuals:
  tokens: 11400
  tasks: 3
  commits: 3
plan_head_before: 58debc9c6b0c106f6297f650b7da6d47306c108f
plan_head_after: afda14ea22396f20ca6c95abfa393036962d6598

tech-stack:
  added: []
  patterns:
    - "withDeadline(what, ms, work(signal)): bound the caller's wait, abort the request, ignore a late result"
    - "In-flight marker object with identity check so a stale tick never releases a newer tick's guard"

key-files:
  created:
    - server/src/lib/with-deadline.ts
    - server/test/unit/lib/with-deadline.test.ts
    - server/test/unit/jobs/health-probe-job-liveness.test.ts
    - server/test/unit/infrastructure/probe-transport-deadlines.test.ts
  modified:
    - server/src/domain/health-probe.ts
    - server/src/infrastructure/probe-transport.ts
    - server/src/application/ports/dockerode-client-port.ts
    - server/src/infrastructure/dockerode-client.ts
    - server/src/jobs/health-probe-job.ts
    - server/src/jobs/job.ts
    - server/test/unit/infrastructure/dockerode-client.test.ts
    - server/test/unit/infrastructure/probe-transport.test.ts
    - server/test/unit/jobs/job.test.ts

key-decisions:
  - "Bound values: 10 s per Docker call, timeout + 50 s per probe, 30 s per start() step, 5 min per tick"
  - "A deadline miss on any probe-path Docker call is a failed probe with reason network-unreachable, never a skipped one (D-02, D-08)"
  - "A hung disconnect is logged and left for the next attach cycle or the startup sweep; it blocks later probes on that network for at most its 10 s bound"

patterns-established:
  - "Fake-timer liveness tests: drive time with vi.advanceTimersByTimeAsync, fake only setTimeout/clearTimeout when a real local HTTP server is in the test"

requirements-completed: ["#23"]

duration: 13min
completed: 2026-10-09
status: complete
---

# Phase 14 Plan 15: Probe liveness (CR-01) Summary

**Every Docker call on the probe path, every probe, every start() pre-step and every tick is now deadline-bounded, so a stalled daemon becomes a recorded network-unreachable failed probe instead of silently stopping probing.**

## Performance

- **Duration:** about 13 min
- **Started:** 2026-10-09T06:12Z (approximate)
- **Completed:** 2026-10-09T06:25Z
- **Tasks:** 3
- **Files modified:** 13 (4 created, 9 modified)

## Chosen bounds

| Bound | Value | Where |
|-------|-------|-------|
| `PROBE_DOCKER_CALL_TIMEOUT_MS` | 10 s | each Docker Engine call in ProbeTransport (target inspect, own inspect, connect, disconnect, sweep) |
| `PROBE_DEADLINE_MARGIN_MS` | 50 s (5 x 10 s) | added to a probe's own timeout for the per-probe bound in HealthProbeJob |
| `START_STEP_TIMEOUT_MS` | 30 s | stale attachment sweep and ownership seeding in `start()` |
| `MAX_TICK_DURATION_MS` | 5 min | in-flight watchdog |

## Accomplishments

- `withDeadline` helper built from `setTimeout` and `AbortController` (not `AbortSignal.timeout`), so fake timers drive it. It aborts the work's signal on expiry and ignores a late result.
- ProbeTransport routes every Docker call through it and passes the signal down. DockerodeClient forwards it as dockerode's `abortSignal`, only when a signal is given, so a hung request is cancelled at the socket level (T-14-58).
- HealthProbeJob bounds each probe at timeout + 50 s and records one failed probe (network-unreachable, containerStartedAt null) on a miss or a transport rejection; a late transport result is dropped.
- `start()` always resolves: the sweep and the ownership seeding are each bounded at 30 s and a miss is logged with the existing messages.
- The in-flight guard became a marker with a start time. A tick older than 5 min no longer suppresses the next one; the watchdog logs, calls the new `IntervalJob.reportError`, and a stale tick that settles late leaves the newer guard alone.

## CR-01 gap items closed per task

| Gap item (14-VERIFICATION.md gap 1) | Task |
|----------|------|
| Timeout wrapper around every Docker call, fired as a network-unreachable failed probe | Task 1 (target inspect, end to end), Task 2 (own inspect, connect, disconnect, sweep, abort signal) |
| Overall per-probe deadline in runDue and a bounded start() pre-step | Task 3 |
| inFlight reset after a maximum tick duration, and a test that a never-settling Docker call does not stop later ticks | Task 1 (never-settling test), Task 3 (watchdog) |

## Task Commits

1. **Task 1 (tracer): withDeadline, target inspect bounded, end-to-end liveness test** - `8ecab01` (feat)
2. **Task 2: bound and cancel every remaining Docker call** - `5dda7ee` (feat)
3. **Task 3: job-level bounds (per-probe deadline, bounded start, watchdog)** - `afda14e` (feat)

**Plan metadata:** the docs commit following this file.

## Decisions Made

- Docker-call warnings come from one helper (`warnIfUnanswered`) that reads `what` and `ms` from the DeadlineExceededError, so the log line names the call and the bound without a second constant. The disconnect paths keep their existing single warn.
- `inspectContainer` is called with `undefined` options when no signal is given, so a caller without a signal sends exactly the request it always did.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing exact-argument assertions in probe-transport.test.ts had to expect the new signal argument**
- **Found during:** Task 2
- **Issue:** The plan requires both that every Docker call in the transport passes a signal (acceptance criterion) and that pre-existing probe-transport tests pass unmodified. These conflict: `toHaveBeenCalledWith("c1")` and the other exact-argument assertions fail once a trailing `AbortSignal` is passed.
- **Fix:** Added `expect.any(AbortSignal)` as the trailing argument to the 8 affected assertions. No behavioural assertion was weakened; every case still checks the same call with the same leading arguments.
- **Files modified:** server/test/unit/infrastructure/probe-transport.test.ts
- **Verification:** all 30 pre-existing cases pass; the new signal-aware assertions check the signal is an AbortSignal
- **Committed in:** 5dda7ee

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the signal-passing acceptance criterion. No scope creep. All health-probe-job and job tests pass unmodified.

## Issues Encountered

- The full server unit run reports 2 failures in `git-executor.test.ts` (pull on second sync, re-clone fallback). They are the Windows temp-dir timing failures already recorded in this phase's `deferred-items.md` (14-01, 14-11), in files this plan does not touch. 1794 other tests pass.
- `yarn lint` is not runnable here (`eslint` is not installed in the workspace), so lint was not checked. `yarn typecheck` (`tsc --build`) reports zero errors.
- TDD: the helper and transport change were written ahead of their tests in Task 1 (tracer). The tests were then written and are asserted against the specified behaviour, but no separate RED commit exists.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; the only new surface is an optional abort signal on existing Docker calls (T-14-57 to T-14-61 mitigated as planned).

## Verification

- Unit: with-deadline, health-probe-job, health-probe-job-liveness, probe-transport, probe-transport-deadlines, dockerode-client, job, job-registry, jobs index, layering all pass.
- `yarn typecheck`: zero errors.
- Integration: `test/integration/health-probe.test.ts` 4 of 4 passed.
- Acceptance greps: withDeadline and DeadlineExceededError exported once, 0 imports in with-deadline.ts, 2 bound constants, `signal?: AbortSignal` x4 in the port, `abortSignal` x6 in the client, 0 unsignalled Docker calls in the transport, margin/START_STEP/MAX_TICK/reportError present, `stack-state-derivation.ts` and `notification-watcher.ts` untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

14-16 and 14-17 can build on `IntervalJob.reportError`; 14-17 changes `runGuarded` visibility as noted in the plan. ROADMAP Phase 14 success criterion 1 (#23) now holds under a misbehaving daemon.

## Self-Check: PASSED

All created files exist and commits `8ecab01`, `5dda7ee`, `afda14e` are ancestors of HEAD.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-09*
