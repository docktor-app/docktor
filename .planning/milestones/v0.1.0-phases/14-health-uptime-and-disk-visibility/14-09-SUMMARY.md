---
phase: 14-health-uptime-and-disk-visibility
plan: 09
subsystem: api
tags: [health-probe, probe-ownership, docker-networks, dockerode, state-poller, fail-closed]
requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-01 and 14-11 Docker-health writes in StatePoller and ContainerStateCatchUp, service.health_changed
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-06 HealthProbeJob, ProbeTransport and ProbeTransportPort
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-13 probe lifecycle, invalid specs probed as failures, transitional-stack skip, last-good parse cache
provides:
  - ProbeOwnershipPort and ProbedServiceRegistry (in-memory D-07 ownership), fed by HealthProbeJob each tick and once in start()
  - StatePoller.handleEvent, StatePoller.reconcile and ContainerStateCatchUp keep a probe-owned service's stored health and record no docker-healthcheck change for it
  - DockerodeClientPort.connectNetwork / disconnectNetwork
  - ProbeTransport refcounted ephemeral network attach with the docktor-health-probe alias, network preference, not-containerized fallback
  - ProbeTransportPort.sweepStaleAttachments, run by HealthProbeJob.start() before the schedule
  - isContainerized() exported from lib/stacks-dir
affects: [phase 14 verification of ROADMAP criterion 1 (#23)]

actuals:
  tokens: 21994
  tasks: 2
  commits: 2
plan_head_before: d535df75571aa18ef913321e6ef42bb482a70aa1
plan_head_after: 6694b6b4d175dac7eeef49ad2eae5594bbcefec4

tech-stack:
  added: []
  patterns:
    - "A single-writer ownership port (isProbeOwned) lets two Docker-side writers defer to the probe without parsing compose"
    - "Refcounted resource attachment (per network id) with detach in finally and an in-flight-detach barrier so a new attach cannot be torn down by an old detach"
    - "Alias-marked attachments make a crash-safe startup sweep possible without touching Docktor's own compose networks"

key-files:
  created:
    - server/src/application/ports/probe-ownership-port.ts
    - server/src/application/probed-service-registry.ts
    - server/test/unit/application/probed-service-registry.test.ts
  modified:
    - server/src/jobs/state-poller.ts
    - server/src/application/container-state-catch-up.ts
    - server/src/application/index.ts
    - server/src/jobs/health-probe-job.ts
    - server/src/application/ports/dockerode-client-port.ts
    - server/src/infrastructure/dockerode-client.ts
    - server/src/application/ports/probe-transport-port.ts
    - server/src/infrastructure/probe-transport.ts
    - server/src/lib/stacks-dir.ts
    - server/test/unit/jobs/state-poller.test.ts
    - server/test/unit/application/container-state-catch-up.test.ts
    - server/test/unit/jobs/health-probe-job.test.ts
    - server/test/unit/infrastructure/dockerode-client.test.ts
    - server/test/unit/infrastructure/probe-transport.test.ts
    - server/test/integration/health-probe.test.ts

key-decisions:
  - "ContainerStateCatchUp takes probeOwnership as an optional 4th constructor parameter defaulting to the shared registry (like StatePoller), so every pre-existing 3-argument catch-up test keeps passing unmodified; application/index.ts still passes the registry explicitly"
  - "Ownership is refreshed for every stack at start(), including transitional ones, because ownership depends only on the compose file; during ticks a transitional stack keeps its previous ownership"
  - "A network Docktor already holds without the probe alias is used without any attach, ahead of <project>_default"
  - "A connect failure is not cached: the failed attachment is dropped immediately so the next probe retries it"
  - "The 404 (container gone) path of StatePoller is unchanged for probe-owned services: no container means no health from any source"
  - "The exported isContainerized() replaced defaultIsContainerized, and assertStacksDirIsMounted's injectable parameter was renamed to containerized to avoid shadowing it"

patterns-established:
  - "Docker-side writers consult ProbeOwnershipPort before writing or recording health"
  - "Test hosts inject an explicit SelfContainer so /.dockerenv on a CI container cannot change transport behavior"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "A probe-owned service keeps its stored (probe) health through Docker events, the 60-second reconcile and the post-deploy catch-up: Docker's container state is still tracked, no docker-healthcheck health_changed is emitted, and the stack status derives from the probe health; unprobed services behave exactly as before"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#StatePoller probe-owned services (D-07)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/container-state-catch-up.test.ts#ContainerStateCatchUp probe-owned services (D-07)"
        status: pass
      - kind: integration
        ref: "server/test/integration/health-probe.test.ts#keeps the probe's health when a Docker event reports a container without any healthcheck (D-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "HealthProbeJob owns every service whose compose block exists (valid or invalid), refreshes ownership every tick and once in start() before the schedule without probing, drops vanished stacks and keeps transitional stacks"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#HealthProbeJob ownership (D-07)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/probed-service-registry.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "ProbeTransport attaches Docktor to the target's network for one request only (alias docktor-health-probe), shares one attachment between concurrent probes, picks a held network, then <project>_default, then the first addressed network, fails closed on connect failure, accepts HTTP 403 as already attached, logs a failed detach, and requests the container IP directly when not containerized"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/probe-transport.test.ts#ProbeTransport (amended D-05, T-14-36) reachability across Docker networks (amended D-05)"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/dockerode-client.test.ts#DockerodeClient connectNetwork / disconnectNetwork (amended D-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "HealthProbeJob.start() sweeps alias-marked stale attachments once before the ownership refresh and the schedule; sweepStaleAttachments disconnects only endpoints carrying the alias, never rejects, and does nothing outside a container"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/probe-transport.test.ts#sweepStaleAttachments (amended D-05, T-14-43)"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/health-probe-job.test.ts#start() sweeps stale network attachments once, before the ownership refresh and the schedule (amended D-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The attach, the startup sweep and Delete Stack with active probes work on a real Docker host: no lingering docktor-health-probe endpoint between probes, a manual stale attach is gone after restart, and docker compose down completes while a probe may be attached"
    requirement: "#23"
    verification: []
    human_judgment: true
    rationale: "Needs a dedicated Docker host running the standard Docktor deployment with a collision-proof project name; the shared execution host must not run docker compose against arbitrary names (STATE.md, Phase 05.1-03 incident). Recorded as an unrun-verify entry in .planning/WINDOWS.md."

duration: 18min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 09: Probe ownership and network reachability Summary

**A probe is now the sole health signal for its service (StatePoller events, the 60-second reconcile and the post-deploy catch-up all keep the stored probe health), and Docktor reaches containers on any stack network by joining that network for a single request under the `docktor-health-probe` alias, with a crash-safe startup sweep**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-08T14:05Z
- **Completed:** 2026-10-08T14:23Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 18 (3 created, 15 modified)

## Accomplishments
- **D-07 ownership.** `ProbedServiceRegistry` (pure in-memory) implements `ProbeOwnershipPort`. `HealthProbeJob` calls `replaceStack(stack.id, probes.keys())` for every non-transitional stack on every tick, `retainStacks(<listed ids>)` after the loop, and runs the same refresh once in `start()` (no probing) so ownership exists before StatePoller's first reconcile. Valid and invalid specs both own the service, so a broken probe never hands health back to Docker.
- **Docker-side writers defer.** `StatePoller.handleEvent` and its reconcile observe step, and `ContainerStateCatchUp.observe` plus its health_changed loop, write and derive with `normalizeHealth(stored)` for a probe-owned service and skip the docker-healthcheck event. Container state and id still come from Docker; the 404 path still clears health. `notification-watcher.ts` and `stack-state-derivation.ts` are untouched.
- **Amended D-05 reachability.** `ProbeTransport` inspects its own container (hostname convention shared with socket-inspector), picks a held network (no attach), else `<project>_default`, else the first addressed network, and wraps the request in a private refcounted `NetworkAttachments` helper: connect on 0 to 1, disconnect in `finally` on 1 to 0, a failed disconnect is `console.warn`ed and left to the sweep. HTTP 403 / "already exists" counts as connected. A new attach waits for an in-flight detach of the same network so it cannot be torn down underneath.
- **Crash-safe sweep.** `sweepStaleAttachments()` disconnects every endpoint of Docktor's own container whose aliases include the marker (per-endpoint try/catch, never rejects, 0 outside a container). `HealthProbeJob.start()` runs it first, then the ownership refresh, then the schedule.
- **Port plumbing.** `DockerodeClientPort` gained `connectNetwork`/`disconnectNetwork` (dockerode `getNetwork(id).connect/disconnect`); `isContainerized()` is now exported from `lib/stacks-dir`.

## Task Commits

1. **Task 1: Probe ownership end-to-end (D-07), tracer** - `d67a368` (feat)
2. **Task 2: Network reachability (amended D-05)** - `6694b6b` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests landed in the same commit as their implementation, as in the earlier Phase 14 plans (CLAUDE.md forbids committing failing tests)._

Tracer gate: auto mode and `blocking-human` were not set, and the tracer's `<verify>` is automated-only, so the three verify commands were re-run after the commit (all green) and expansion continued.

## Files Created/Modified
- `server/src/application/ports/probe-ownership-port.ts`, `server/src/application/probed-service-registry.ts` - ownership port and registry (new)
- `server/src/jobs/state-poller.ts`, `server/src/application/container-state-catch-up.ts`, `server/src/application/index.ts` - ownership consulted; catch-up wired with the registry
- `server/src/jobs/health-probe-job.ts` - `ownership` dep, per-tick `replaceStack`/`retainStacks`, `start()` override (sweep, ownership seed, schedule)
- `server/src/application/ports/dockerode-client-port.ts`, `server/src/infrastructure/dockerode-client.ts` - network connect/disconnect
- `server/src/application/ports/probe-transport-port.ts`, `server/src/infrastructure/probe-transport.ts` - sweep, ephemeral attach, `PROBE_ENDPOINT_ALIAS`, injectable `SelfContainer`
- `server/src/lib/stacks-dir.ts` - exported `isContainerized`
- Unit tests for the registry, state poller, catch-up, job, dockerode client and transport, plus the extended `health-probe.test.ts` integration suite

## Decisions Made
See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renaming `defaultIsContainerized` to the exported `isContainerized` would have created a temporal-dead-zone error**
- **Found during:** Task 2, in `lib/stacks-dir.ts`
- **Issue:** `assertStacksDirIsMounted` already has a parameter named `isContainerized`. Using the exported function as that parameter's default (`isContainerized = isContainerized`) would reference the parameter itself and throw at call time.
- **Fix:** Renamed the injectable parameter to `containerized` (positional, so every caller and test is unaffected) and updated its doc comment.
- **Files modified:** `server/src/lib/stacks-dir.ts`
- **Verification:** `test/unit/lib/stacks-dir.test.ts` (33 tests) passes unchanged.
- **Committed in:** 6694b6b

**2. [Rule 3 - Blocking] ContainerStateCatchUp's 4th constructor parameter had to be optional**
- **Found during:** Task 1
- **Issue:** The plan says a required `probeOwnership` parameter and also that every pre-existing catch-up test (which construct it with three arguments) passes without modification. Both cannot hold.
- **Fix:** The parameter defaults to the shared `probedServiceRegistry` (the same default StatePoller uses); `application/index.ts` still passes it explicitly.
- **Files modified:** `server/src/application/container-state-catch-up.ts`
- **Verification:** all pre-existing catch-up tests pass unmodified.
- **Committed in:** d67a368

**3. [Rule 2 - Missing critical] Existing transport tests had to stop depending on `/.dockerenv`**
- **Found during:** Task 2
- **Issue:** With the default `SelfContainer`, the pre-existing probe-transport tests would take the attach path whenever the test process itself runs inside a container (CI), making them environment-dependent.
- **Fix:** The test file builds every transport through a `newTransport(docker, self = NOT_CONTAINERIZED)` helper; the integration test injects `{containerId: async () => null}` explicitly as the plan specifies.
- **Files modified:** `server/test/unit/infrastructure/probe-transport.test.ts`
- **Committed in:** 6694b6b

### Plan refinements (not bugs)

**4. Literal acceptance count.** `grep -c 'connectNetwork'` on the port file cannot print 1: `disconnectNetwork` contains the substring, so the minimum is 2 (one line each). Both methods are declared exactly once.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking) plus 1 plan refinement
**Impact on plan:** No scope change.

## Human Check (Task 2)

**Deferred, not performed.** The three live steps (no lingering `docktor-health-probe` endpoint between probes; manual `docker network connect --alias docktor-health-probe` followed by a Docktor restart removes the endpoint; Delete Stack with active probes completes and leaves no `<project>_default`) need a dedicated Docker host running the standard compose deployment with a collision-proof project name. The plan forbids running docker compose against arbitrary names on the shared execution host (STATE.md, Phase 05.1-03 incident), so none of it was run here.

- Observed `docker compose down` behavior while Docktor is attached: **not observed.** The mitigation is structural: an attach lasts one request, transitional stacks are never probed (14-13), and `deleteStack` already tolerates `docker compose down` errors (RESEARCH A2). If a `<project>_default` network does remain after a live delete, record the exact `docker compose down` message.
- Recorded as an open `unrun-verify` entry in `.planning/WINDOWS.md`.

## Issues Encountered
- The full unit run reports 3 failures (2 in `git-executor.test.ts`, 1 in `template-source-reader.test.ts`: git clone and temp-dir timeouts on Windows), already tracked in `deferred-items.md` and in files this plan does not touch. 102 of 104 files and 1768 of 1771 tests pass.
- `tsc --build` only includes `src/`, so the new test code was additionally type-checked with a temporary tsconfig that includes the touched test files: no errors in the new code (the only reports were five pre-existing `../../../../src` import-path messages that vitest resolves).
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` is clean.
- Shell heredocs containing certain quote patterns failed in the Bash tool twice; the affected edits were redone with the Write/Edit tools. No partial state was committed.

## Known Stubs
None.

## Known Gaps
- Hostname-as-self-id assumes Docktor's container keeps Docker's default hostname (the short container id), the same convention `socket-inspector` already uses. A custom `hostname:` on the Docktor service would make every probe report `Docktor couldn't reach the container's network` (fail-closed). The standard `docker-compose.yml` sets none.
- The refcount and the in-flight-detach barrier live in memory in one process; two Docktor instances sharing a daemon would not coordinate (not a supported deployment).
- The live behavior of the attach on a real daemon (D5) is unverified until the human check is run.

## Threat Flags
None beyond the plan's register. T-14-43 (lingering attachment): refcounted attach with detach in `finally`, alias-marked endpoints swept at every job start, failed detach logged and reclaimed. T-14-45 (two writers of one field): `ProbeOwnershipPort` consulted on every Docker-side write and the registry seeded at start. T-14-46: attach lasts one request and transitional stacks are never probed. T-14-44 accepted as planned. T-14-SC: no packages installed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 14's probe path is complete in code: ownership (D-07) and reachability (amended D-05). Only the live human check (D5) remains before ROADMAP criterion 1 (#23) is verified on a real host.
- No blockers.

## Self-Check: PASSED

- Created files exist (`probe-ownership-port.ts`, `probed-service-registry.ts`, `probed-service-registry.test.ts`) and the modified files are in commits `d67a368` and `6694b6b`; both are ancestors of HEAD.
- `git rev-list --count d535df7..HEAD` was 2 before this summary.
- Acceptance criteria re-run: `isProbeOwned` 2 in state-poller.ts and 2 in container-state-catch-up.ts; `probedServiceRegistry` 2 in application/index.ts; `replaceStack` 2 (plus the start-time refresh) in health-probe-job.ts; 0 db/repositories imports in probed-service-registry.ts; empty diff for `stack-state-derivation.ts` and `notification-watcher.ts`; `PROBE_ENDPOINT_ALIAS` 3 in probe-transport.ts; `sweepStaleAttachments` 3 in health-probe-job.ts; `^export async function isContainerized` 1.
- Verification: Task 1 unit command (6 files, 258 tests) passes; `health-probe.test.ts` and `health.test.ts` integration (13 tests) pass; Task 2 unit command (6 files, 290 tests) passes; `health-probe.test.ts` integration (4 tests) passes; `yarn typecheck` reports zero errors.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
