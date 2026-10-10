---
phase: 14-health-uptime-and-disk-visibility
plan: 19
subsystem: server
tags: [graceful-shutdown, sigterm, docker, health-probe, gap-closure]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: HealthProbeJob, ProbeTransportPort.sweepStaleAttachments and the amended D-05 attach-per-probe design (14-05, 14-06, 14-12)
provides:
  - lib/graceful-shutdown.ts, an ordered shutdown with a deadline per step, a 9 s hard deadline and a second-signal force exit
  - HealthProbeJob.stop() that drains in-flight probes, discards late results, sweeps the alias-marked attachments and is idempotent
  - SIGTERM/SIGINT wiring in server/src/index.ts
  - Troubleshooting row 11 in docs/deployment.md for the stuck start after a probe network was removed
affects: [14-UAT re-test of test 1 (G-14-1a), docs/deployment.md]

actuals:
  tokens: 8235
  tasks: 3
  commits: 3
plan_head_before: 1a6d535ed3bae450d3bb460cbee61be7ddf37b73
plan_head_after: 6552c79a384eba9c8d4850c4714c2caa3521f534
commits: 3

tech-stack:
  added: []
  patterns:
    - "Process shutdown is a list of named steps, each run under withDeadline, so one stalled step never blocks the later ones"
    - "A job's stop() is a memoised wind-down promise that start() resets"

key-files:
  created:
    - server/src/lib/graceful-shutdown.ts
    - server/test/unit/lib/graceful-shutdown.test.ts
    - server/test/unit/jobs/health-probe-job-shutdown.test.ts
  modified:
    - server/src/index.ts
    - server/src/jobs/health-probe-job.ts
    - docs/deployment.md

key-decisions:
  - "Shutdown order is probe job (5 s step), then app.close() (2.5 s step), inside a 9 s hard stop inside Docker's default 10 s grace; the probe job stops first and on its own so a job hanging in stopJobs() cannot prevent the detach"
  - "docker-compose.yml and the Dockerfile are unchanged: init: true and stop_grace_period are not added. With a signal handler Node as PID 1 exits cleanly (debug experiment E5: exit 0 in 964 ms), init: true alone gives no cleanup (E5: exit 143 without a handler), and at most 7.5 s of bounded steps fits the default 10 s grace"
  - "A probe that finishes after the drain gave up is discarded, because the sweep has already detached its network and recording it would count a failure the service never had (D-08)"
  - "The helper-container design (14-RESEARCH.md option C) stays rejected and is named in the docs as an evaluated alternative only"

patterns-established:
  - "installShutdownHandlers takes a structural SignalSource, so tests drive the real wiring with an EventEmitter in place of process"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "SIGTERM/SIGINT stop the probe job, sweep the alias-marked attachments, close the app and exit 0, in that order"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job-shutdown.test.ts#sweeps the attachments, then closes the app, then exits 0, in that order"
        status: pass
      - kind: unit
        ref: "server/test/unit/lib/graceful-shutdown.test.ts#runs the steps in order, awaiting each, then exits with code 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every shutdown step is bounded: a rejecting or hanging step is logged and the later steps still run (exit 1), the 9 s hard deadline exits once, a second signal forces exit 1"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/graceful-shutdown.test.ts#cuts a step that never settles at its own timeout, logs it, and runs the later steps"
        status: pass
      - kind: unit
        ref: "server/test/unit/lib/graceful-shutdown.test.ts#exits with code 1 at the hard deadline, and a step finishing later does not exit again"
        status: pass
      - kind: unit
        ref: "server/test/unit/lib/graceful-shutdown.test.ts#forces an immediate exit with code 1 on a second signal without running the steps again"
        status: pass
    human_judgment: false
  - id: D3
    description: "HealthProbeJob.stop() drains the tick in flight for up to SHUTDOWN_DRAIN_MS, discards a late probe result, ignores later ticks, is idempotent and can be re-armed by start()"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job-shutdown.test.ts#stop(): drain, discard and idempotence"
        status: pass
    human_judgment: false
  - id: D4
    description: "Troubleshooting row 11 gives the exact recovery for the stuck start (docker network disconnect by network NAME, then docker start docktor)"
    requirement: "#23"
    verification:
      - kind: command
        ref: "grep -c '^| 11 |' docs/deployment.md"
        status: pass
    human_judgment: false
  - id: D5
    description: "On a live Docker host, docker stop leaves no probe attachment on the container (exit code 0, no docktor-health-probe alias), and removing the probed stack's network afterwards still lets Docktor start"
    requirement: "#23"
    verification: []
    human_judgment: true
    rationale: "Needs a live Docker daemon and a real network attachment; no unit test reaches it. Recorded via /gsd-verify-work 14 (UAT test 1 re-test), steps in the plan's verification section"

duration: 11min
completed: 2026-10-10
status: complete
---

# Phase 14 Plan 19: Graceful shutdown that detaches the probe network Summary

**SIGTERM/SIGINT now stop the health probe job, let in-flight probes detach, sweep the `docktor-health-probe` attachments, close the app and exit 0, every step bounded inside Docker's 10 s grace, so a normal stop no longer leaves the saved network that blocks the next start.**

## Performance

- **Duration:** 11 min (start time not recorded; estimated from the first test run)
- **Completed:** 2026-10-10T09:03Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Shutdown time budget as implemented

| Step | Bound |
|------|-------|
| Probe job step (`healthProbeJob.stop()`): drain of the tick in flight, then alias sweep | 5 s step; inside it the drain is at most `SHUTDOWN_DRAIN_MS` = 1.5 s and the sweep at most `SHUTDOWN_SWEEP_TIMEOUT_MS` = 3 s |
| Server step (`app.close()`, which runs `stopJobs()` and tolerates the second `stop()`) | 2.5 s |
| Steps in total | at most 7.5 s |
| Hard deadline (`SHUTDOWN_HARD_DEADLINE_MS`), counted from the first signal, exits with code 1 | 9 s |
| Docker's default stop grace before SIGKILL | 10 s |

A second signal during shutdown exits at once with code 1. `exit` is called exactly once per run.

## Decision on `init` and `stop_grace_period`

Not added; `docker-compose.yml` and the Dockerfile are unchanged (`git diff --stat -- docker-compose.yml Dockerfile` prints nothing). From the debug experiments in `.planning/debug/probe-attach-blocks-restart.md`: E5 shows Node as PID 1 with a `process.on('SIGTERM')` handler exits in 964 ms with exit 0, and `--init` alone without a handler exits 143 with no chance to clean up, so `init: true` buys nothing the handler does not already give. The bounded shutdown (at most 7.5 s of steps, 9 s hard stop) fits Docker's default 10 s grace, so `stop_grace_period` is not needed either.

## Accomplishments
- Closed the code half of UAT gap G-14-1a: a normal stop detaches the probe attachment from Docktor's own container, so Docker has no saved network to fail on at the next start.
- A probe mid-request at SIGTERM gets 1.5 s to finish and detach itself; one that does not is cut off by the sweep and its result is discarded rather than recorded as a failed probe.
- Documented the recovery for the cases no handler can cover (SIGKILL, crash, OOM kill, daemon crash, power loss) and named the helper-container design as evaluated and rejected.

## Task Commits

1. **Task 1: SIGTERM to exit end-to-end (tracer)** - `a98d956` (feat)
2. **Task 2: HealthProbeJob.stop() drains in-flight probes, discards late results, idempotent** - `1d21a85` (feat)
3. **Task 3: Troubleshooting row 11 and recorded init/stop_grace_period decision** - `6552c79` (docs)

**Plan metadata:** committed separately (docs: complete plan)

The tracer gate ran in auto/end-of-phase mode: the Task 1 verify (module and tracer tests, pre-existing job and layering tests, `yarn typecheck`) passed end to end before Task 2 started.

## Files Created/Modified
- `server/src/lib/graceful-shutdown.ts` - `createShutdownHandler`, `installShutdownHandlers`, `SHUTDOWN_HARD_DEADLINE_MS`, `ShutdownStep`, `ShutdownOptions`, structural `SignalSource`
- `server/src/jobs/health-probe-job.ts` - `stop()` with memoised wind-down, `settled` promise on the in-flight marker, `stopping` and `discardResults` flags reset by `start()`, `SHUTDOWN_DRAIN_MS` and `SHUTDOWN_SWEEP_TIMEOUT_MS`
- `server/src/index.ts` - `installShutdownHandlers` after `app.listen` with the probe job step and the `app.close()` step
- `server/test/unit/lib/graceful-shutdown.test.ts` - module rules under fake timers (order, rejecting step, throwing step, hanging step, hard deadline, no double exit, second signal, install/dispose)
- `server/test/unit/jobs/health-probe-job-shutdown.test.ts` - `stop()` sweep cases, drain, give-up and discard, queued probes, no tick after stop, double stop, restart, and the SIGTERM tracer
- `docs/deployment.md` - Troubleshooting row 11

## Decisions Made
See `key-decisions` in the frontmatter. In short: probe job stops first and on its own, a late probe result after the drain gave up is discarded, compose and Dockerfile stay untouched, and the helper-container redesign stays rejected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Queued probes are not started once stop() has begun**
- **Found during:** Task 2
- **Issue:** The plan makes `run()` return for a tick that starts after `stop()`. A tick already working through its due queue (8 workers, more than 8 due probes) would still start its remaining probes after the sweep, re-attaching the network to Docktor's own container after it had been cleaned, which is the exact state this plan prevents.
- **Fix:** The `runDue` worker loop stops taking probes once `stopping` is set.
- **Files modified:** `server/src/jobs/health-probe-job.ts`
- **Verification:** `starts no queued probe once stop() has begun` (9 stacks, concurrency 8, the 9th is never probed); the test failed before the change
- **Committed in:** `1d21a85`

**Total deviations:** 1 auto-fixed (1 Rule 2). **Impact:** closes a window inside the plan's own goal; no scope change.

### Notes
- Task 1 implemented the minimal `stop()` (cancel schedule, then bounded sweep); Task 2 replaced it with the memoised drain/discard version as planned.
- `yarn lint` is not usable in this checkout: ESLint 10 reports no `eslint.config.*` file. This is pre-existing and unrelated, so the new files were checked by `tsc --build` only.
- In Task 2 a test helper first returned a promise from an async function, which `await` flattened and left three tests waiting for the tick to finish; fixed within the task by returning `{running}`.

## Issues Encountered
None blocking. The full server unit suite shows only the known Windows git/temp-dir timeouts in `git-executor.test.ts` (2 cases) and `template-source-reader.test.ts` (1 case) listed in deferred-items.md; 1854 other tests pass.

## Known Stubs
None.

## Threat Flags
None. The shutdown sweep uses the existing privileged Docker disconnect path covered by T-14-70 to T-14-72.

## User Setup Required
None. Live verification on a Docker host remains (coverage D5); the steps are in the plan's `<verification>` section and are recorded via `/gsd-verify-work 14`.

## Next Phase Readiness
Ready for 14-20. UAT test 1 (G-14-1a) needs the live-host re-test: `docker stop docktor` exits 0 within well under 10 s with no `docktor-health-probe` endpoint left, then the probed stack's network can be removed and Docktor starts normally.

## Self-Check: PASSED

- Created files exist: `server/src/lib/graceful-shutdown.ts`, both new test files, this SUMMARY.
- Commits `a98d956`, `1d21a85`, `6552c79` are ancestors of HEAD.
- Acceptance criteria re-run: `installShutdownHandlers(` count in index.ts is 1, `healthProbeJob.stop` count 1, `SHUTDOWN_DRAIN_MS` count 3, `settled` count 5, `^| 11 |` count 1, `docker network disconnect` count 1, `docktor-health-probe` count 1, `network-NAME` count 1, compose/Dockerfile diff empty.
- `yarn typecheck` exits 0; the targeted vitest runs pass.
