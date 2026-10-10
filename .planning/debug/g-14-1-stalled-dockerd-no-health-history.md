---
status: diagnosed
trigger: "UAT 14 test 1 gaps G-14-1 (no health-history entry after a >10s dockerd stall) and G-14-1b (frozen dockerd may freeze all of Docktor)"
goal: find_root_cause_only
created: 2026-10-10T08:00:00Z
updated: 2026-10-10T08:45:00Z
---

## Current Focus

hypothesis: G-14-1 has three stacked causes (DB unreachable by name during the freeze; failure counting coupled to the DB read; no persisted record of a single failed probe by design). G-14-1b log-pipe mechanism is refuted.
test: done (code reading + two Linux experiments in the docktor image)
expecting: n/a
next_action: return diagnosis to caller (plan-phase --gaps); no source files modified

known_pattern_candidate: none (no .planning/debug/knowledge-base.md exists)
bug_class: Mandelbug / environment-coupled (deterministic given a frozen dockerd; no concurrency defect)

reasoning_checkpoint:
  hypothesis: "A stalled dockerd leaves no history entry because the result is dropped at the first DB read (EAI_AGAIN) and, independently, one failed probe never produces a transition."
  confirming_evidence:
    - "handleProbeCompleted does findByComposeProject BEFORE advance(); a throw is caught and logged, nothing is retried or buffered"
    - "pg Pool built with only {connectionString}: idleTimeoutMillis defaults to 10000, min 0, no connectionTimeoutMillis; DATABASE_URL host is the compose service name 'db'"
    - "evaluateProbe needs PROBE_FAILURE_THRESHOLD=3 consecutive failures; applyProbeResult returns early when health is unchanged"
  falsification_test: "Stall dockerd 90s with the DB reachable by IP: history must show the unhealthy entry. Stall 30s with DB healthy: no entry (proves the threshold alone)."
  fix_rationale: "n/a (diagnose only)"
  blind_spots: "Could not freeze a real dockerd (user's Docker Desktop is in use); EAI_AGAIN itself is taken from the user's report; stall duration used in the UAT is unknown."
  candidate_causes:
    - "environment: DB name resolution depends on dockerd's embedded DNS (127.0.0.11)"
    - "config: pg pool defaults reap idle connections after 10s, equal to the 10s Docker-call deadline"
    - "code: failure counter is advanced only after a successful DB read; no retry/outbox"
    - "design/spec: only health transitions are persisted (D-08, D-12); UAT truth expects a 'recorded probe'"
  and_gate: "yes - an entry needs (stall >= ~3 probe cycles) AND (DB reachable at the moment of the transition); the freeze itself breaks the second condition."

## Symptoms

expected: A daemon stalled >10s yields a recorded network-unreachable probe; probing resumes on recovery.
actual: Detection and recovery work; no health-history entry. User saw EAI_AGAIN resolving docktor-db while dockerd was frozen.
errors: EAI_AGAIN (getaddrinfo for the DB host)
reproduction: Run Docktor in a container, add an x-docktor health probe, pause dockerd for more than 10s.
started: first live run of Phase 14 amended D-05

## Eliminated

- hypothesis: G-14-1b - Node blocks synchronously on a full container log pipe, defeating the 10s deadlines
  evidence: Linux experiment in the built docktor image (Node 22.23.3, pino 10.3.1), stdout+stderr piped to a live reader that never reads, ~590 KB written in 12s (9x the 64 KiB pipe). console.warn only, pino only, and both: heartbeat timer kept ticking, max gap 252-287 ms, no stall. Code agrees: pino default destination is async SonicBoom (pino lib/tools.js:366, sonic-boom index.js:123 sync=false) and POSIX pipes are non-blocking in libuv (writes queue in memory).
  timestamp: 2026-10-10
- hypothesis: hung getaddrinfo calls starve the libuv threadpool and so freeze fs work
  evidence: Experiment with a blackholed resolver and 4 concurrent lookups: fs.readFile stayed at 1 ms, timer lag 1 ms. libuv caps slow I/O (getaddrinfo) at about half the pool. Lookups did fail with EAI_AGAIN after 10s (first two) and 20s (next two, queued).
  timestamp: 2026-10-10

## Evidence

- timestamp: 2026-10-10
  checked: probe-transport.ts, with-deadline.ts, health-probe-job.ts
  found: Inspect is bounded at PROBE_DOCKER_CALL_TIMEOUT_MS=10s; a miss returns NETWORK_UNREACHABLE; the job emits service.probe_completed (synchronous, fire-and-forget on the bus). Detection side is correct and matches what the user saw.
  implication: The gap is entirely downstream of the emit.
- timestamp: 2026-10-10
  checked: subscribers/probe-result-subscriber.ts, infrastructure/event-bus.ts
  found: Handler promise rejections are only console.error'd. No retry, buffer or outbox anywhere on the path (grep for retry/backoff/queue/outbox in the service, subscribers, repos, bus: no matches).
  implication: A failed DB op loses the result permanently.
- timestamp: 2026-10-10
  checked: service-health-service.ts applyProbeResult (lines 113-146)
  found: Order is (1) repo.findByComposeProject [DB read], (2) advance() [in-memory failure counter], (3) early return if health unchanged, (4) applyHealth: updateServiceState [DB write], bus.emit service.health_changed, updateStackStatus [DB write], emit. The history row is a SEPARATE write made by the service.health_changed subscriber (service-health-history-subscriber.ts -> ServiceHealthEventRepository.record).
  implication: With the DB down, step 1 throws, so the counter never moves; failures during an outage are not even counted.
- timestamp: 2026-10-10
  checked: domain/health-probe.ts evaluateProbe, PROBE_FAILURE_THRESHOLD, PROBE_INTERVAL_MS
  found: 3 consecutive failures are needed before health leaves "healthy"; probes are 30s apart per service. A single failed probe changes nothing, so applyProbeResult returns at "probe.health === stored" and writes no history. No other place persists a probe result (grep lastProbe/probeResult: none).
  implication: Even with a healthy DB, a 10-60s stall yields NO history entry. A stall must span about 3 probe cycles (roughly 60-100s depending on phase) before any entry is possible.
- timestamp: 2026-10-10
  checked: lib/db.ts, .env.example:39, docs/deployment.md:129, docker-compose.yml, pg-pool 3.11 index.js
  found: new PrismaPg({connectionString}) -> new pg.Pool({connectionString}) only. DATABASE_URL host is "db" (compose service name; docs: "Use the compose service name db"). pg-pool defaults: idleTimeoutMillis 10000, min 0 (so all idle clients are reaped), max 10, no connectionTimeoutMillis, no keepAlive.
  implication: Established TCP connections would survive a dockerd freeze (kernel bridge, not dockerd), but a probe result arrives ~10s after the job's last DB use (the 10s Docker deadline equals the 10s pool idle timeout), so the connection is typically already reaped and a new one needs getaddrinfo("db") through Docker's embedded DNS, which dockerd serves. That yields EAI_AGAIN (about 10s per failure, 20s when queued) exactly as the user reported.
- timestamp: 2026-10-10
  checked: health-probe-job.ts tick()/run(), app.ts:85
  found: Every tick starts with store.listStacks() (DB). After the pool is reaped, the next tick also needs a new connection and fails/hangs ~10-20s on DNS, so during a long freeze probing is not even attempted; every /api request runs prisma.user.count() in onRequest and likewise fails.
  implication: "Docktor looks frozen" during a stall can be explained by DB unreachability alone, with the event loop alive.
- timestamp: 2026-10-10
  checked: infrastructure/dockerode-client.ts
  found: Dockerode is created with no timeout; only the probe path is deadline-bounded. Other Docker calls (StatePoller, catch-up, routes) wait until dockerd thaws.
  implication: Those requests hang, but as pending promises, not as a blocked event loop.
- timestamp: 2026-10-10
  checked: UAT test D narrative
  found: The user saw the probe deadline fire and EAI_AGAIN errors in Docktor's own logs during the stall.
  implication: The event loop was running during the freeze, consistent with the experiments that refute G-14-1b's mechanism.

## Resolution

root_cause: |
  G-14-1 (confirmed): the failed probe is never persisted, for three stacked reasons.
  (1) Persistence needs a DB connection that the freeze takes away: DATABASE_URL uses host "db", resolved by Docker's embedded DNS served by dockerd, and the pg pool (defaults only) reaps idle connections after 10s, the same 10s as the Docker-call deadline, so the result lands on a fresh lookup that fails with EAI_AGAIN.
  (2) The failure counter is advanced only after the DB read in applyProbeResult and nothing retries or buffers, so results during an outage are dropped and can never accumulate to the 3-failure threshold.
  (3) By design (D-08/D-12) only health transitions are written; one failed probe from a healthy service changes nothing, so a ">10s" stall cannot produce an entry even with a healthy DB. The UAT truth/verification text ("a recorded network-unreachable probe") describes something the system does not persist.
  G-14-1b (UNCONFIRMED; the stated mechanism is refuted): a full log pipe does not block Node on Linux (console.* queues in memory, pino's default stream is async); the experiments and the UAT's own observation (deadline fired, errors logged during the freeze) show the event loop stays alive. The real, evidenced degradation is DB unreachability (new connections fail after ~10-20s) plus unbounded non-probe Docker calls, which make Docktor unresponsive without freezing the process. A true dockerd SIGSTOP run with a heartbeat endpoint was not performed.
fix: not applied (find_root_cause_only)
verification: not applicable
files_changed: []
