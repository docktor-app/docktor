---
status: diagnosed
phase: 14-health-uptime-and-disk-visibility
source: [14-VERIFICATION.md]
started: 2026-10-09T09:10:00Z
updated: 2026-10-10T07:29:08.977Z
---

## Current Test

[testing complete]

## Tests

### 1. Amended D-05 on a live Docker host
expected: Docktor on the network only during a probe; startup sweep removes leftovers; delete flow completes; stalled daemon records network-unreachable and recovers
result: issue
reported: "A: Docktor on the network only during a probe - Pass. B: Startup sweep removes leftovers - Pass (removed 1 stale probe network attachment(s)). C: Delete Stack - Pass (caveat above). D: Stalled daemon - detection and recovery pass; no history entry recorded. Findings: (1) Docktor can't start after a leftover probe attachment's network is deleted. If Docktor stops while attached and that network is then removed, Docker refuses to start the container (network test-network not found). The startup sweep never gets to run, and restart: unless-stopped doesn't help. (2) A frozen dockerd likely freezes all of Docktor (unconfirmed). Node writes logs to the container's log pipe synchronously; once that pipe fills, Docktor blocks, which defeats the 10s limits on Docker calls. (3) Database writes fail while dockerd is frozen. Docker's internal DNS stops, so docktor-db can't be resolved (EAI_AGAIN). That's why no history entry was recorded in D."
severity: major

### 2. Health history panel (14-03), light/dark, Pixel 7 width, 200-char failure message
expected: Message wraps inside the h-48 ScrollArea, no horizontal overflow
result: issue
reported: "it wraps, but also the healthy->unhealthy is wrapped. For mobile, add some spaces between the rows. the rest looks good."
severity: minor

### 3. HTTP Health Probes section (14-08), Config tab, light/dark, desktop and Pixel 7
expected: Long URL scrolls inside input, YAML error replaces form, saved compose contains the x-docktor.health-probe block
result: pass

### 4. Storage page (14-05), light/dark, desktop and Pixel 7, 80+ char names
expected: Names truncate with title attribute, no horizontal scroll, chevron respects reduced motion, sensible Tab order
result: pass

### 5. Stack Overview (14-07), light/dark, desktop and Pixel 7, ~30 incidents incl. one ongoing
expected: Acceptable tone contrast, list scrolls vertically past 384px, StatCards collapse to one column
result: pass

### 6. Settings Health History card (14-10), light/dark, desktop and Pixel 7, lower retention
expected: Validation on blur, Shorten retention dialog shows documented copy, Keep cancels without saving
result: pass

### 7. Apply the three Phase 14 migrations to a live database and start the server
expected: ServiceHealthEvent, StackVolumeUsage, new Stack columns and StatusLog (stackId, createdAt) index exist; syncDatabaseSchema() applies them at boot
result: pass

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-14-1
  truth: "A daemon stalled long enough for 3 consecutive failed probes (~70-100s) yields an unhealthy history entry and probing resumes on recovery (amended per 14-20)"
  status: failed
  reason: "User reported: detection and recovery pass; no history entry recorded (DB writes fail while dockerd is frozen: docktor-db unresolvable, EAI_AGAIN)"
  severity: major
  test: 1
  root_cause: "The failed probe is never persisted: (1) the DB host db is resolved by dockerd's embedded DNS and the pg pool reaps idle connections after 10s, so new connections fail with EAI_AGAIN during a freeze; (2) ServiceHealthService.applyProbeResult does a DB read before advancing the in-memory failure counter, and failures are swallowed with no retry/outbox; (3) by design (D-08, threshold 3 x 30s) a single failed probe writes no history row, so a 10-60s stall cannot create an entry"
  artifacts:
    - path: "server/src/lib/db.ts"
      issue: "pool on defaults: 10s idle reaping, no connectionTimeoutMillis"
    - path: "server/src/application/service-health-service.ts"
      issue: "DB read precedes advance(); errors swallowed"
    - path: "server/src/application/subscribers/service-health-history-subscriber.ts"
      issue: "fire-and-forget write, no retry"
  missing:
    - "Keep pooled DB connections alive and bound connect time"
    - "Advance probe state before the DB read"
    - "Retry/outbox for history writes"
    - "Amend the UAT truth: history entry appears after 3 consecutive failed probes (stall of ~70-100s)"
  debug_session: ".planning/debug/g-14-1-stalled-dockerd-no-health-history.md"
- gap_id: G-14-1a
  truth: "Docktor restarts cleanly after stopping while attached to a probe network that is subsequently removed (startup sweep gets to run)"
  status: failed
  reason: "User reported: Docker refuses to start the container (network test-network not found); sweep never runs; restart: unless-stopped doesn't help"
  severity: major
  test: 1
  root_cause: "Docker persists the runtime network connect of Docktor's own container, re-attaches saved networks on every start and aborts the start if one is gone; Docktor has no SIGTERM handler (Node is PID 1, docker stop ends in SIGKILL) so it never detaches, and the sweep runs only inside the already-started process"
  artifacts:
    - path: "server/src/index.ts"
      issue: "no signal handling / graceful shutdown"
    - path: "server/src/infrastructure/probe-transport.ts"
      issue: "attach persists in container config; sweep only in-process"
    - path: "server/src/jobs/health-probe-job.ts"
      issue: "no stop() that drains or detaches"
    - path: "docs/deployment.md"
      issue: "no recovery entry"
  missing:
    - "SIGTERM/SIGINT handler: stop job, detach, sweep, app.close(), with bounded deadlines"
    - "Troubleshooting entry: docker network disconnect <network-name> docktor, then docker start docktor"
    - "Optional: init: true and stop_grace_period in shipped compose"
  debug_session: ".planning/debug/probe-attach-blocks-restart.md"
- gap_id: G-14-1b
  truth: "A frozen dockerd does not block Docktor beyond the 10s Docker-call deadlines"
  status: failed
  reason: "User reported (unconfirmed): Node writes logs to the container's log pipe synchronously; once the pipe fills, Docktor blocks, defeating the 10s limits"
  severity: major
  test: 1
  root_cause: "Stated mechanism refuted: pino stdout is async SonicBoom and pipes are non-blocking, so logging does not freeze the event loop (verified with a never-read pipe; max timer gap under 300ms). Real degradation during a freeze: new DB connections fail after 10-20s (listStacks at each tick, prisma.user.count on every /api request) and Dockerode has no timeout outside the probe path. Not tested against a real dockerd SIGSTOP"
  artifacts:
    - path: "server/src/infrastructure/dockerode-client.ts"
      issue: "Dockerode created without timeout"
    - path: "server/src/jobs/health-probe-job.ts"
      issue: "tick() needs DB via listStacks()"
  missing:
    - "Dockerode request timeout"
    - "Bound DB calls (shared with G-14-1 pool fix)"
    - "No logging change"
  debug_session: ".planning/debug/g-14-1-stalled-dockerd-no-health-history.md"
- gap_id: G-14-2
  truth: "Health history message wraps inside the h-48 ScrollArea without horizontal overflow, with the status transition intact and readable rows"
  status: failed
  reason: "User reported: it wraps, but also the healthy->unhealthy is wrapped. For mobile, add some spaces between the rows. the rest looks good."
  severity: minor
  test: 2
  root_cause: "HealthEventRow is a single flex row without flex-wrap; the long message takes the shrink and squeezes the transition span (no whitespace-nowrap) until it wraps; below sm rows are separated only by space-y-2 (8px) vs 4px intra-row gap"
  artifacts:
    - path: "client/src/routes/app/stacks/components/service-health-timeline.tsx"
      issue: "HealthEventRow layout"
  missing:
    - "whitespace-nowrap on the transition"
    - "Header line (flex-wrap) + message on its own line"
    - "divide-y with larger vertical padding on phones"
    - "Regression unit test"
  debug_session: ".planning/debug/health-history-row-transition-wraps-g14-2.md"

## Deferred Follow-Ups

- test: 6
  idea: "add some space between the save button and the form field. This applies generally for all forms (mostly in the stack and proxy settings)"
  deferred_at: 2026-10-10