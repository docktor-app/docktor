---
phase: 14-health-uptime-and-disk-visibility
plan: 20
subsystem: server
tags: [health-probe, postgres, pg-pool, dockerode, outbox, stall-survivability, gap-closure]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: ServiceHealthService, the health history subscriber and DockerodeClient (14-03, 14-05, 14-06, 14-15, 14-19)
provides:
  - ServiceHealthService counts probe failures that arrive while its database read fails (early advance, `unwritten` flag, restore after a successful read)
  - ServiceHealthHistoryOutbox, a bounded in-memory retry queue for service.health_changed history writes with createdAt pass-through
  - buildPoolConfig, wired into lib/db.ts: no idle reaping, TCP keep-alive, 10 s connect bound
  - DockerodeClient with a 30 s timeout-bounded instance for request/response calls and an unbounded instance for the event and follow-logs streams
affects: [14-UAT re-test of test 1 (G-14-1, G-14-1b), docs/deployment.md]

actuals:
  tokens: 13048
  tasks: 3
  commits: 3
plan_head_before: 54e87f6e609e5dd745f6167d17cf53fb459c8c63
plan_head_after: 808b44eaa0a263de63f6e18c2815ceaa8dc85243
commits: 3

tech-stack:
  added: []
  patterns:
    - "Advance in-memory state before a fallible read, restore it after the read succeeds, so a failed read loses nothing and a successful one counts nothing twice"
    - "A subscriber that writes through an outbox: ordered head-first flush, bounded queue, unref'd timer cleared by the disposer"
    - "Two Dockerode instances: a socket timeout for request/response calls, none for streams (docker-modem's timeout is an idle-socket timeout)"

key-files:
  created:
    - server/src/application/subscribers/service-health-history-outbox.ts
    - server/src/lib/db-pool-config.ts
    - server/test/unit/application/probe-stall-history.test.ts
    - server/test/unit/application/service-health-history-outbox.test.ts
    - server/test/unit/repositories/service-health-event-repository.test.ts
    - server/test/unit/lib/db-pool-config.test.ts
  modified:
    - server/src/application/service-health-service.ts
    - server/src/application/subscribers/service-health-history-subscriber.ts
    - server/src/repositories/service-health-event-repository.ts
    - server/src/lib/db.ts
    - server/src/infrastructure/dockerode-client.ts
    - server/test/unit/application/service-health-service.test.ts
    - server/test/unit/infrastructure/dockerode-client.test.ts

key-decisions:
  - "SPEC AMENDMENT (developer decision, replaces the UAT G-14-1 truth 'A daemon stalled >10s yields a recorded network-unreachable probe'): during a Docker daemon stall an `unhealthy` history entry from `HTTP probe` appears after 3 consecutive failed probes (a stall of about 70 to 100 s), with the reason `Docktor couldn't reach the container's network after 3 failed checks`; a single failed probe or a stall shorter than about 70 s writes no entry. That is the D-08 rule, not a defect. UAT and verification re-runs use this wording."
  - "No logging change (G-14-1b e): the log-pipe blocking mechanism was refuted, so pino, log destinations and console usage are untouched"
  - "The history outbox is in memory only and lost on a process restart (accepted limit): the Service row transition itself is retried by ServiceHealthService"
  - "pg pool max stays at the pg default of 10; Postgres is Docktor's only client, so holding up to 10 idle connections is accepted (T-14-76)"

patterns-established:
  - "Probe-state continuity: a remembered health that is ahead of the row is flagged `unwritten` and survives the row-wins reseed until a write succeeds or a success brings it back to the stored value"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Probe failures that arrive while the database read fails are still counted, and three failed probes straddling a database outage write exactly one unhealthy transition"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-service.test.ts#ServiceHealthService.handleProbeCompleted with a failing database (UAT G-14-1)"
        status: pass
      - kind: integration
        ref: "server/test/unit/application/probe-stall-history.test.ts#records exactly one healthy -> unhealthy history row after three failed probes"
        status: pass
    human_judgment: false
  - id: D2
    description: "A health history write lost to a transient database failure is retried in order and lands with the time the transition happened"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-history-outbox.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/repositories/service-health-event-repository.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pooled database connections are never reaped, keep-alive is on and a connect is bounded to 10 s; db.ts uses that config"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/db-pool-config.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Request/response Docker calls are bounded by a 30 s socket timeout while the event and follow-logs streams stay unbounded"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/dockerode-client.test.ts#DockerodeClient timeouts (G-14-1b)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Against a real frozen Docker daemon: the UI and database-only pages keep answering, Docker-dependent actions fail within about 30 s, and a freeze of 120 s or more yields one healthy -> unhealthy entry (and none for a freeze of about 40 s)"
    requirement: "#23"
    verification: []
    human_judgment: true
    rationale: "Needs a live Docker host and a daemon freeze (kill -STOP dockerd); unit tests cover the logic but not the kernel/DNS behavior. Recorded through /gsd-verify-work 14 (UAT test 1 item D)."

duration: 6min
completed: 2026-10-10
status: complete
---

# Phase 14 Plan 20: Stall Survivability and History Durability Summary

**A stalled Docker daemon now yields the promised unhealthy history entry after 3 failed probes: probe failures survive a failing database read, failed history writes are retried from an outbox with their original time, pooled Postgres connections are kept alive, and request/response Docker calls are bounded to 30 s.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-10T09:03:12Z
- **Completed:** 2026-10-10T09:08:44Z
- **Tasks:** 3
- **Files modified:** 13 (6 created, 7 modified)

## Accomplishments

- `ServiceHealthService` advances the remembered probe state before the row read for a result that continues the same container, restores it after a successful read (so nothing counts twice), and flags a health the row never received as `unwritten` so the next result applies it with that result's message. A never-seen service and a new container are not advanced early.
- `ServiceHealthHistoryOutbox` (capacity 200, 15 s retry, ordered head-first flush, unref'd timer cleared by the subscriber's disposer) queues failed `service.health_changed` writes and retries them with `createdAt` set to the time the event was handled. `ServiceHealthEventRepository.record` accepts an optional `createdAt`.
- `buildPoolConfig` (`idleTimeoutMillis: 0`, keep-alive from 10 s, `connectionTimeoutMillis` 10 s, pg default `max`) is wired into `lib/db.ts`.
- `DockerodeClient` uses a 30 s timeout instance (`DOCKER_REQUEST_TIMEOUT_MS`) for inspect, list, network connect/disconnect and log tail, and an instance without a timeout for the event stream and follow-logs.

## Task Commits

1. **Task 1: probe failures survive a failing database read** - `11fa873` (fix)
2. **Task 2: history writes retried through an outbox** - `b557859` (feat)
3. **Task 3: bounded database connections and Docker request calls** - `808b44e` (feat)

## Verification

- Task 1 target set (service-health-service, probe-stall-history, probe-container-identity, probe-notification-preservation, probe-result-subscriber, service-health-history-subscriber, health-probe, layering): 8 files, 239 tests passed. The three new service cases and the stall scenario were observed failing before the change (RED: 3 failures), then passing.
- Task 2 target set: 7 files, 206 tests passed.
- Task 3 target set: 7 files, 269 tests passed.
- Full server unit suite: 113 of 115 files passed, 1882 of 1885 tests passed. The 3 failures are the known Windows git/temp-dir timeouts listed in deferred-items.md: `git-executor.test.ts` (2 cases, pull on second sync and re-clone fallback) and `template-source-reader.test.ts` (1 case, variant cap). Nothing else failed.
- `yarn typecheck`: exit 0 after each task.
- Acceptance greps: `unwritten` in service-health-service.ts 7 (needs 3), `ServiceHealthHistoryOutbox` in the subscriber 3 (needs 1), `createdAt` in the repository 8 (needs 2), `buildPoolConfig` in db.ts 2 (needs 2), `idleTimeoutMillis: 0` in db-pool-config.ts 1 (needs 1), `DOCKER_REQUEST_TIMEOUT_MS` in dockerode-client.ts 2 (needs 2), `git diff --stat -- server/src/app.ts` empty.
- Live host re-test (plan `<verification>` items 1 to 5) is not run here; it is routed to `/gsd-verify-work 14` (coverage D5).

## Deviations from Plan

None - plan executed exactly as written. One wording fix inside Task 3: a comment in `db-pool-config.ts` quoted `idleTimeoutMillis: 0`, which made the acceptance grep print 2 instead of 1; the comment was reworded so the count is 1.

Task 2 was written test-first, but its RED run was not separately observed before the implementation was added (the test files and implementation went in the same step); all tests pass and the behaviors are asserted. Task 3's RED run was observed.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or schema changes. The plan's threats T-14-73 to T-14-76 are handled as registered (outbox capacity and ordering, stream instance without a timeout, accepted idle connection cost).

## Issues Encountered

None beyond the pre-existing Windows timeouts above.

## Next Phase Readiness

This is the last plan of phase 14. The remaining step is the live frozen-daemon re-test of UAT test 1 item D with the amended wording, via `/gsd-verify-work 14`.

## Self-Check: PASSED

- Files present: all 6 created and 7 modified files exist on disk.
- Commits present on the branch: 11fa873, b557859, 808b44e.
