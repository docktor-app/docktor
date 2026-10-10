---
phase: 14-health-uptime-and-disk-visibility
verified: 2026-10-10T09:30:00Z
status: human_needed
score: 16/17 must-haves verified
covered_files:
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-01-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-01-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-02-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-02-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-03-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-03-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-04-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-04-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-05-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-05-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-06-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-06-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-07-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-07-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-08-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-08-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-09-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-09-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-10-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-10-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-11-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-11-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-12-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-12-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-13-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-13-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-14-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-14-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-15-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-15-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-16-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-16-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-17-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-17-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-18-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-18-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-19-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-19-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-20-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-20-SUMMARY.md"
  - "client/src/routes/app/stacks/components/service-health-timeline.tsx"
  - "client/test/integration/service-health.spec.ts"
  - "client/test/unit/routes/stacks/service-health-timeline.test.tsx"
  - "docs/deployment.md"
  - "server/src/application/service-health-service.ts"
  - "server/src/application/subscribers/service-health-history-outbox.ts"
  - "server/src/application/subscribers/service-health-history-subscriber.ts"
  - "server/src/index.ts"
  - "server/src/infrastructure/dockerode-client.ts"
  - "server/src/jobs/health-probe-job.ts"
  - "server/src/lib/db-pool-config.ts"
  - "server/src/lib/db.ts"
  - "server/src/lib/graceful-shutdown.ts"
  - "server/src/repositories/service-health-event-repository.ts"
covered_digest: "v3:sha256:5291dcad9ed5d831154ba0dee4d9c4ba0dd86054307115eb0d299deb94752e32"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 11/13
  gaps_closed:
    - "G-14-2: health history transition never wraps; header line plus message line; divided rows with larger phone padding (closed by 14-18)"
    - "G-14-1a: SIGTERM/SIGINT graceful shutdown stops the probe job, drains probes, sweeps probe attachments, closes the app (closed by 14-19)"
    - "G-14-1: probe failures counted across a failing DB read, history-write outbox, kept-alive bounded pg pool (closed by 14-20)"
    - "G-14-1b: Dockerode request timeout on request/response calls (closed by 14-20)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items:
  - truth: "G-14-1b: a frozen dockerd does not block Docktor beyond the Docker-call deadlines (30 s Dockerode socket timeout on request/response calls, kept-alive bounded pg pool)"
    test: "On a live Docker host, SIGSTOP dockerd for about 2 minutes while Docktor runs with an HTTP probe on a service, then SIGCONT it."
    expected: "The Docktor UI and /api keep answering during the freeze, StatePoller and probe ticks keep running, and no request hangs beyond its bound."
    why_human: "Unit tests assert the pool config and the Dockerode constructor options only. The effect against a real frozen dockerd (embedded DNS, kernel-side bridge keeping established pg connections alive) was never observed; the UAT root-cause note says it was not tested against a real SIGSTOP."
human_verification:
  - test: "G-14-1 live re-test (amended expectation): freeze dockerd for roughly 100 s or more with a probed service, then resume it"
    expected: "After 3 consecutive failed probes (about 70 to 100 s) an `unhealthy` entry from `HTTP probe` with the message `Docktor couldn't reach the container's network after 3 failed checks` appears in the service's Health history (written late via the outbox if the DB was unreachable, with the time it happened); probing resumes on recovery. A stall shorter than about 70 s writes no entry."
    why_human: "Needs a real frozen daemon. The state logic is unit-proven over a real event bus; the DNS/pool survival is not."
  - test: "G-14-1a live re-test: with a probe network attached, run `docker stop docktor`, then remove that network, then `docker start docktor`"
    expected: "Docktor logs `[shutdown] SIGTERM received`, exits 0 within the 10 s grace, leaves no `docktor-health-probe` endpoint on its container, and starts without `network ... not found`. The new Troubleshooting row 11 recovery (`docker network disconnect <network-NAME> docktor`) works for a SIGKILLed container."
    why_human: "Real Docker network persistence and PID 1 signal delivery cannot be proven by the fake-process unit test."
  - test: "G-14-2 visual re-test of the health history row in light and dark theme at 412 px (Pixel 7) and desktop"
    expected: "`healthy -> unhealthy` stays on one line beside a 200-character message, the message sits on its own line, rows are visibly separated on the phone, no horizontal overflow."
    why_human: "The browser layout gate passes in headless Chromium (below), but the user reported the original defect visually and light/dark appearance was never re-judged by a person."
---

# Phase 14: Health, Uptime and Disk Visibility Verification Report

**Phase Goal:** Users can see whether a stack is actually healthy over time and how much disk it's consuming, without reading raw logs or guessing.
**Verified:** 2026-10-10T09:30:00Z
**Status:** human_needed
**Re-verification:** Yes, after UAT gap closure (plans 14-18, 14-19, 14-20)

## Goal Achievement

The four ROADMAP success criteria were verified in the earlier reports and nothing under the client, shared or Prisma trees that backs them changed in a way that touches them; the UAT then confirmed with a person that the Config form (test 3), Storage page (4), Stack Overview (5), Settings retention card (6) and the live migrations (7) work. The UAT found one real defect each in two areas: the health-history row layout (G-14-2) and the amended D-05 live behavior (G-14-1, G-14-1a, G-14-1b). All four are closed in the code, not only in the SUMMARY files. No truth is FAILED. The status is `human_needed` because the closures can only be fully confirmed against a live Docker host (frozen daemon, stop with attached probe network) and by a person looking at the corrected row in both themes.

### UAT Gap Closure Check

| Gap | Verdict | Evidence in the code |
| --- | ------- | -------------------- |
| G-14-2 (row wraps the transition, rows run together) | CLOSED | `service-health-timeline.tsx`: list wrapper `divide-y pr-3`; `HealthEventRow` has `data-slot="health-event-row"` with `py-3 sm:py-2`, a `flex flex-wrap items-center` header (`data-slot="health-event-header"`) holding dot, timestamp, transition span with `whitespace-nowrap`, and source badge; the message is a separate `<p class="mt-1 min-w-0 break-words wrap-anywhere ...">` under it, rendered as React text. 14-UI-SPEC.md line 227 carries the amended layout. I ran the Playwright desktop project against `service-health.spec.ts` myself: 5 of 5 pass, including "the status transition stays on one line beside a 200-character message" and "at phone width the panel does not overflow and rows are visibly separated" (412 px, 16 px gap assertion). Unit: `service-health-timeline` and `services-section` suites, 41 of 41. |
| G-14-1a (Docktor cannot start after the probe network was removed) | CLOSED | `lib/graceful-shutdown.ts` runs steps in order, each under `withDeadline`, with a 9 s hard deadline, a second signal forcing exit 1, and `exit` guarded to run once. `index.ts` calls `installShutdownHandlers` after `listen` with steps "health probe job" (5 s, `healthProbeJob.stop()`) then "server" (2.5 s, `app.close()`). `HealthProbeJob.stop()` is idempotent (`windDown ??=`), sets `stopping`, cancels the schedule, drains the tick in flight for `SHUTDOWN_DRAIN_MS` (1.5 s), sets `discardResults`, then runs `transport.sweepStaleAttachments()` bounded at 3 s; `probeService` drops results when `discardResults`; `start()` resets the flags so a restart works. The later `app.close()` -> `stopJobs()` -> `stop()` call returns the same wind-down. `docs/deployment.md` Troubleshooting row 11 is present with the by-name disconnect recovery and the rejected helper-container alternative. Dockerfile and docker-compose.yml are untouched by the gap-closure commits (diff since the plans were added touches neither). |
| G-14-1 (failed probe never persisted during a stall) | CLOSED in code | (a) `lib/db-pool-config.ts` `buildPoolConfig`: `idleTimeoutMillis: 0`, `keepAlive: true`, 10 s keep-alive delay, 10 s `connectionTimeoutMillis`; `db.ts` passes it to `PrismaPg`. (b) `service-health-service.ts` `applyProbeResult` advances the remembered state before `findByComposeProject` for a continuing container, restores it after a successful read (so nothing counts twice), keeps it on a failed read, and carries an `unwritten` flag that `previousState` honours so a health change the row never received is applied on the next result. (c) `service-health-history-outbox.ts`: capacity 200 with a warned drop of the oldest, in-order head-first drain, 15 s unref'd retry timer, retried rows carry the handled-at `createdAt`; `subscribeServiceHealthHistory` writes through it and its disposer clears the timer; `ServiceHealthEventRepository.record` forwards `createdAt`. The UAT truth is amended to "unhealthy entry after 3 consecutive failed probes" in the plan, per the developer decision. |
| G-14-1b (frozen dockerd freezes Docktor) | CLOSED in code, effect unobserved | `dockerode-client.ts` builds a `docker` instance with `timeout: DOCKER_REQUEST_TIMEOUT_MS` (30 s) for inspect, list, connect, disconnect and log tail, and a separate `streamDocker` without a timeout for `getEvents` and follow-logs. No logging code was touched (decision stands: mechanism refuted). Whether this keeps a real Docktor responsive under a real SIGSTOP of dockerd is not observed, hence PRESENT_BEHAVIOR_UNVERIFIED below. |

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1 (#23): a service can optionally carry an HTTP health probe feeding the same status model as Docker-healthcheck status | VERIFIED | Unchanged since the earlier reports; HealthProbeJob registered, `ServiceHealthService.applyHealth` writes through the unchanged `deriveStackStatus`. Server type-check clean; the jobs/application suites pass (below). |
| 2  | SC2 (#23): health transitions are retained and visible per stack and per service | VERIFIED | `ServiceHealthEvent`, single-writer subscriber (now outbox-backed), `GET /api/stacks/:id/health-events`, hook, timeline panel. Row layout defect (G-14-2) fixed. Open deferred warnings WR-06/WR-07 are cosmetic. |
| 3  | SC3 (#24): each stack shows an uptime percentage and an incident list over a retention window | VERIFIED | Unchanged. UAT test 5 (Overview) and test 6 (retention card) passed with a person. |
| 4  | SC4 (#27): disk usage per stack and per volume, sortable, with a total | VERIFIED | Unchanged. UAT test 4 (Storage page) passed with a person. |
| 5  | D-01: probe config lives in compose and is edited through the Config tab with diff-confirm | VERIFIED | UAT test 3 passed with a person (long URL, YAML error, saved block). |
| 6  | D-07: a probe-owned service's health is owned by the probe | VERIFIED | Unchanged; guards in `state-poller.ts` and the catch-up. |
| 7  | NotificationWatcher and deriveStackStatus unchanged; probe-driven transitions reach the watcher through the existing event | VERIFIED | `probe-notification-preservation.test.ts` passes; neither file is in the gap-closure diff. |
| 8  | D-02/D-06/D-08 fail-closed cadence: no answer is a failed probe and probing continues every 30 s | VERIFIED | Closed by 14-15; liveness and deadline suites pass in the run below. |
| 9  | D-08 container identity: probe results belong to the current container; a new container starts as `starting` | VERIFIED | Closed by 14-16; identity suites pass. The 14-20 early advance does not apply to a new container (see `isNewContainer` guard), so this is not weakened. |
| 10 | Amended D-05: ephemeral refcounted network attach with crash-safe sweep | VERIFIED | Live UAT test 1 parts A (attached only during a probe), B (startup sweep removed a leftover) and C (Delete Stack completes) passed with a person; the stalled-daemon part D detected and recovered. The remaining findings are the three gaps above. |
| 11 | D-11/D-10: one StackIncident per UNHEALTHY/ERROR episode; daily pruner | VERIFIED | Unchanged; tests pass. |
| 12 | D-13/D-14: daily scan of `<stack>/volumes/*` and `<stack>/backups`, symlink-safe, `du` exit-1 tolerant | VERIFIED | Unchanged; UAT test 7 confirmed the migrated schema live. |
| 13 | Backstop truths (14-03 long-text, 14-05, 14-07 overflow, 14-08 long-text) at Pixel 7 width, light and dark | VERIFIED | UAT tests 3 to 6 passed with a person in both themes at desktop and Pixel 7. UAT test 2 (14-03) passed on wrapping and drew the G-14-2 finding, now fixed (truth 17). |
| 14 | G-14-1 (amended): a stall of 3 or more consecutive failed probes (about 70 to 100 s) yields an `unhealthy` `HTTP probe` history entry once the database answers; probing resumes on recovery; a shorter stall writes none | VERIFIED | Behavioral tests pass: `probe-stall-history.test.ts` (stall scenario over a real event bus), `service-health-service.test.ts` (early advance, restore after a successful read, `unwritten` carry-over), `service-health-history-outbox.test.ts` (retry order, capacity, createdAt), `service-health-history-subscriber.test.ts`, `db-pool-config.test.ts`. The live DNS/pool survival is a human item. |
| 15 | G-14-1a: SIGTERM/SIGINT stop the probe job, drain in-flight probes, sweep probe attachments, close the app within bounded deadlines, exit once | VERIFIED | `graceful-shutdown.test.ts` and `health-probe-job-shutdown.test.ts` pass, including the SIGTERM-to-exit ordering over a real HealthProbeJob and a fake process (sweep once, `app.close()` once, `exit(0)`). Live `docker stop` is a human item. |
| 16 | G-14-1b: a frozen dockerd does not block Docktor beyond the Docker-call deadlines | PRESENT_BEHAVIOR_UNVERIFIED | Code present and wired (`DOCKER_REQUEST_TIMEOUT_MS` instance, kept-alive pool, `connectionTimeoutMillis`); `dockerode-client.test.ts` asserts construction options only. Not observed against a real SIGSTOPped dockerd. Routed to human verification. |
| 17 | G-14-2: the transition never wraps, the message sits on its own wrapping line, rows are divided with larger phone padding | VERIFIED | Component read above; Playwright desktop project run by me, 5 of 5 pass (transition height under 28 px beside a 200-character message; 412 px no overflow and at least 16 px between rows); unit suites 41 of 41. |

**Score:** 16/17 truths verified (1 present, behavior-unverified, 0 failed)

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `server/src/lib/graceful-shutdown.ts` (118 lines) | VERIFIED | Substantive, imported by `server/src/index.ts`. |
| `server/src/lib/db-pool-config.ts` | VERIFIED | Imported by `db.ts`. |
| `server/src/application/subscribers/service-health-history-outbox.ts` (160 lines) | VERIFIED | Used by the subscriber, which `register.ts` wires. |
| `HealthProbeJob.stop()` / `SHUTDOWN_DRAIN_MS` / `SHUTDOWN_SWEEP_TIMEOUT_MS` | VERIFIED | Present in `health-probe-job.ts`; reached from `index.ts` and from `stopJobs()`. |
| `ServiceHealthService` early advance and `unwritten` flag | VERIFIED | Present, exercised by the stall scenario test. |
| `DockerodeClient` two-instance design | VERIFIED | Present; `streamDocker` used for event and follow-log streams. |
| `HealthEventRow` restructure and `data-slot` hooks | VERIFIED | Present; hooks used by the Playwright assertions. |
| `docs/deployment.md` Troubleshooting row 11 | VERIFIED | Present. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `index.ts` | `graceful-shutdown.ts` | `installShutdownHandlers({steps, hardDeadlineMs, exit})` after `listen` | WIRED |
| `index.ts` | `health-probe-job.ts` | first shutdown step `healthProbeJob.stop()` | WIRED |
| `health-probe-job.ts` | probe transport port | `stop()` -> `transport.sweepStaleAttachments()` inside `withDeadline` | WIRED |
| `db.ts` | `db-pool-config.ts` | `new PrismaPg(buildPoolConfig(connectionString))` | WIRED |
| history subscriber | outbox | `recordTransition` -> `ServiceHealthHistoryOutbox.record`; disposer disposes the outbox | WIRED |
| outbox | repository | retried writes pass `createdAt` to `record`, which spreads it into `prisma.serviceHealthEvent.create` | WIRED |
| `service-health-timeline.tsx` | `service-health.spec.ts` | `health-event-row` / `health-event-header` data-slot hooks | WIRED |

### Data-Flow Trace (Level 4)

Unchanged for the rendered values (uptime, health events, storage, list uptimes). The health history panel still reads `events` from `useServiceHealthEvents`; 14-18 changed layout only. The 14-20 changes alter when a row is written (late, with the original timestamp), not what the panel reads. FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server type-check | `npx tsc --noEmit` in `server/` | exit 0 | PASS |
| Gap-closure server units (graceful-shutdown, all of `test/unit/jobs`, probe-stall-history, history outbox, service-health-service, history subscriber, db-pool-config, dockerode-client, service-health-event-repository) | `npx vitest run --project unit --coverage.enabled=false <paths>` | 26 files, 387 tests passed | PASS |
| Client unit: row structure and services section | `npx vitest run test/unit/routes/stacks/service-health-timeline.test.tsx test/unit/routes/stacks/services-section.test.tsx` | 2 files, 41 tests passed | PASS |
| Browser layout gate | `PLAYWRIGHT_PORT=5183 npx playwright test test/integration/service-health.spec.ts --project=chromium` | 5 passed | PASS |
| Debt markers in gap-closure files | grep `TBD\|FIXME\|XXX` over the changed source files | no hits | PASS |

The full server suite was not re-run by me; the 14-20 SUMMARY records 1882 of 1885 passing with only the known Windows timeouts (`git-executor.test.ts`, `template-source-reader.test.ts`) from `deferred-items.md`, which are not phase gaps. The Pixel 7 Playwright project and the full client suite were not re-run.

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` files exist and no plan declares a shell probe ("probe" is the HTTP health probe feature).

### Requirements Coverage

REQUIREMENTS.md holds no rows for these items (its IDs are the v1 categories such as OBS-01 and NOTF-03); the requirement IDs for this phase are the GitHub issues named in ROADMAP.md. Plans 14-18, 14-19 and 14-20 all declare `#23`. No orphans, and no REQUIREMENTS.md row maps to Phase 14.

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| #23 | 14-01, 03, 06, 08, 09, 11, 13, 15, 16, 18, 19, 20 | HTTP health probes feeding the status model, with retained transition history | SATISFIED | Truths 1, 2, 6 to 10, 14, 15, 17; live stall behavior (16) is a human item. |
| #24 | 14-04, 07, 10, 12, 16 | Per-stack uptime over a configurable window plus incident list | SATISFIED | Truths 3, 11; UAT tests 5, 6, 7 passed. |
| #27 | 14-02, 05, 07, 14, 17 | Sortable disk usage per stack and per volume with a total | SATISFIED | Truths 4, 12; UAT test 4 passed. |

### Anti-Patterns Found

No debt markers, stubs or placeholders in the files changed by 14-18 to 14-20. One pre-existing `(this.streamDocker as any).getEvents` cast in `dockerode-client.ts` is carried over from before (it existed on `this.docker`); it violates the project's no-`as any` rule and is worth a tidy-up when that file is next touched, but it does not affect any must-have.

Residual, accepted limits stated in the plans: the history outbox is in memory and lost on process restart; a crash, SIGKILL, OOM kill, daemon crash or power loss can still leave the probe attachment (documented recovery in Troubleshooting row 11).

Working-tree note (not part of this verification): the git status snapshot shows uncommitted edits to `uptime-card.tsx`, `overview-tab.tsx`, `health-retention-card.tsx`, `uptime-card.test.tsx`, settings and setup components, and untracked stacks fixtures. These correspond to the deferred UAT follow-up (form spacing) and unrelated work, are outside the 20 plans, and were not staged. Verification ran against files and tests as they exist in the working tree for the gap-closure paths, none of which are among the modified files.

### Human Verification Required

See the `human_verification` and `behavior_unverified_items` frontmatter: the live frozen-daemon re-test (both the amended history-entry expectation and responsiveness), the live `docker stop` with an attached probe network followed by network removal and start, and a visual re-test of the corrected health history row in light and dark at 412 px. These could not be automated here.

### Gaps Summary

No gaps remain. The UAT's four findings (G-14-1, G-14-1a, G-14-1b, G-14-2) are closed in the code and covered by behavioral tests that pass, including a browser-measured layout gate I ran. The phase goal and all four roadmap success criteria are achieved in the codebase. What stays open is human-only confirmation on a live Docker host and a visual re-check of the row layout.

---

_Verified: 2026-10-10T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
